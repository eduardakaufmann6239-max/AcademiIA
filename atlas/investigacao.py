"""Investigações rastreáveis: a camada de Interface.

Em vez de uma resposta isolada, expõe o percurso: pergunta -> afirmações ->
evidências -> autores/obras -> consensos, divergências e lacunas.
"""
from __future__ import annotations

import re
import unicodedata
from collections import deque

from . import modelo
from .agentes import Verificador, Historiador, Tradutor

PARADAS = set("a o e de da do das dos em no na nos nas um uma para por com que qual quais como sobre "
              "the of and in on to is are what how sao é ser foi entre ao aos se".split())


def _norm(t: str) -> str:
    return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()


def _termos(texto: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", _norm(texto)) if w not in PARADAS and len(w) > 2}


def _texto(d: dict) -> str:
    campos = ("nome", "titulo", "enunciado", "descricao", "pergunta", "resumo")
    return " ".join([str(d.get(c, "")) for c in campos] + list(d.get("sinonimos", [])))


class Investigacao:
    def __init__(self, acervo):
        self.a = acervo
        self.v = Verificador(acervo, "consulta")
        self.h = Historiador(acervo, "consulta")
        self.t = Tradutor(acervo, "consulta")

    # ------------------------------------------------------------- trilha
    def trilha(self, afirm: str, profundidade: int = 3, _vistos=None) -> dict:
        """Quem disse o quê, com base em quê, quando, onde e sob quais limitações."""
        _vistos = _vistos or set()
        _vistos.add(afirm)
        d = self.a.obter(afirm)
        fontes = []
        for f in self.v.fontes(afirm):
            o = self.a.obter(f)
            fontes.append({
                "obra": f, "titulo": o.get("titulo"), "ano": o.get("ano"), "status": o.get("status", "publicado"),
                "identificadores": {k: o[k] for k in ("doi", "isbn", "arxiv", "url") if o.get(k)},
                "autores": sorted(self.a.nome(x) for x in self.v.autores(f)),
                "veiculo": [self.a.nome(p) for _, p, _ in self.a.saindo(f, "publicado_em")],
            })
        sustentacao = []
        if profundidade > 0:
            for ap in self.v.apoios(afirm):
                if modelo.tipo_de(ap) == "afirm" and ap not in _vistos:
                    sustentacao.append(self.trilha(ap, profundidade - 1, _vistos))
                else:
                    sustentacao.append({"item": ap, "nome": self.a.nome(ap)})
        return {
            "afirmacao": afirm,
            "enunciado": d["enunciado"],
            "tipo_evidencia": d.get("tipo_evidencia"),
            "localizador": d.get("localizador"),
            "limitacoes": d.get("limitacoes", []) + [self.a.nome(x) for _, x, _ in self.a.saindo(afirm, "tem_limitacao")],
            "fontes": fontes,
            "sustentada_por": sustentacao,
            "contestada_por": [{"item": o, "nome": self.a.nome(o)} for o in self.v.oposicoes(afirm)],
            "obsolescencia": self.v.obsolescencia(afirm),
            "avaliacao": self.v.avaliar(afirm),
            "verificacao_registrada": d.get("verificacao"),
            "conceitos": [self.a.nome(c) for _, c, _ in self.a.saindo(afirm, "sobre")],
            "historico": [{"seq": e["seq"], "ts": e["ts"], "agente": e["agente"], "acao": e["acao"],
                           "regra": e["regra"]} for e in self.a.historico(afirm)],
        }

    # ------------------------------------------------------------- caminho
    def caminho(self, origem: str, destino: str, max_passos: int = 8) -> list[tuple[str, str, str]] | None:
        """Menor caminho no grafo (não direcionado) — como dois saberes se entrelaçam."""
        if origem == destino:
            return []
        adj: dict[str, list[tuple[str, str, str]]] = {}
        for o, r, d, _ in self.a.todas_relacoes():
            if r in ("subnivel_de",):
                continue
            adj.setdefault(o, []).append((d, r, "→"))
            adj.setdefault(d, []).append((o, r, "←"))
        pai = {origem: None}
        fila = deque([(origem, 0)])
        while fila:
            atual, dist = fila.popleft()
            if dist >= max_passos:
                continue
            for viz, r, sentido in adj.get(atual, []):
                if viz not in pai:
                    pai[viz] = (atual, r, sentido)
                    if viz == destino:
                        passos, n = [], viz
                        while pai[n]:
                            ant, rel, sen = pai[n]
                            passos.append((ant, f"{sen}{rel}", n))
                            n = ant
                        return list(reversed(passos))
                    fila.append((viz, dist + 1))
        return None

    # ------------------------------------------------------------- busca
    def buscar(self, pergunta: str, tipos: set[str] | None = None) -> list[tuple[float, str]]:
        termos = _termos(pergunta)
        res = []
        for ident, d in self.a.listar():
            tipo = modelo.tipo_de(ident)
            if tipos and tipo not in tipos:
                continue
            ts = _termos(_texto(d))
            comum = termos & ts
            if comum:
                res.append((len(comum) / len(termos), ident))
        return sorted(res, reverse=True)

    def investigar(self, pergunta: str) -> dict:
        achados = self.buscar(pergunta)
        afirms = {i for _, i in achados if modelo.tipo_de(i) == "afirm"}
        notas_c = [(s, i) for s, i in achados if modelo.tipo_de(i) == "conceito"]
        melhor = notas_c[0][0] if notas_c else 0
        conceitos = [i for s, i in notas_c if s >= 0.6 * melhor]
        # afirmações ligadas aos conceitos e obras encontradas
        for c in conceitos:
            afirms |= {o for r, o, _ in self.a.entrando(c, "sobre") if modelo.tipo_de(o) == "afirm"}
        for _, i in achados:
            if modelo.tipo_de(i) == "obra":
                afirms |= {d for _, d, _ in self.a.saindo(i, "apresenta") if modelo.tipo_de(d) == "afirm"}
        grupos: dict[str, list] = {}
        for af in sorted(afirms):
            av = self.v.avaliar(af)
            grupos.setdefault(av["rotulo"], []).append({"afirmacao": af, "enunciado": self.a.nome(af), **av})
        controversias = sorted({c for af in afirms for _, c, _ in self.a.saindo(af, "parte_de")})
        lacunas = [f"conceito '{self.a.nome(c)}' sem afirmações registradas"
                   for c in conceitos if not self.a.entrando(c, "sobre")]
        for af in afirms:
            niv = self.v.niveis(af)
            pend = [n["nivel"] for n in niv if n["estado"] in ("pendente", "falha")]
            if pend:
                lacunas.append(f"{af}: verificação incompleta em {', '.join(pend)}")
        correlatos = {self.a.nome(c): [self.a.nome(x) for x, _ in self.t.correlatos(c)] for c in conceitos}
        return {
            "pergunta": pergunta,
            "subperguntas": self._subperguntas(pergunta, conceitos),
            "afirmacoes_por_robustez": {k: grupos[k] for k in
                                        ("forte", "moderada", "fraca", "insuficiente", "contestada", "superada/retratada")
                                        if k in grupos},
            "controversias": [{"id": c, "nome": self.a.nome(c),
                               "curadoria": (self.a.obter(c) or {}).get("curadoria")} for c in controversias],
            "conexoes_entre_areas": {k: v for k, v in correlatos.items() if v},
            "lacunas": sorted(lacunas),
            "itens_encontrados": [i for _, i in achados[:15]],
        }

    def _subperguntas(self, pergunta, conceitos):
        base = [self.a.nome(c) for c in conceitos[:4]] or [pergunta]
        sub = []
        for c in base:
            sub += [f"O que se afirma sobre {c}, e com que evidência?",
                    f"Quem formulou, criticou ou revisou as ideias sobre {c}, e quando?",
                    f"Onde há consenso, debate ou lacuna sobre {c}?"]
        return sub

    # ------------------------------------------------------------- árvore
    def arvore(self) -> list[tuple[int, str, str, int]]:
        filhos: dict[str, list[str]] = {}
        raizes = []
        for ident, _ in self.a.listar("tax"):
            pais = [d for _, d, _ in self.a.saindo(ident, "subnivel_de")]
            if pais:
                filhos.setdefault(pais[0], []).append(ident)
            else:
                raizes.append(ident)
        linhas = []

        def andar(n, prof):
            itens = len(self.a.entrando(n, "classificado_em"))
            linhas.append((prof, n, self.a.nome(n), itens))
            for f in sorted(filhos.get(n, [])):
                andar(f, prof + 1)

        for r in sorted(raizes):
            andar(r, 0)
        return linhas
