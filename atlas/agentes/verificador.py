"""Verificador: validação em 8 camadas e índice de robustez.

"Verificar" não é declarar verdade absoluta. É registrar, de forma auditável,
o que sustenta uma afirmação e quão robusto é esse suporte.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from .. import modelo
from .base import Agente, PermissaoNegada, criador_de

NIVEIS_VERIFICACAO = [
    "1-existencia_da_fonte",
    "2-integridade",
    "3-autoria_e_contexto",
    "4-qualidade_metodologica",
    "5-correspondencia_factual",
    "6-convergencia",
    "7-controversia",
    "8-obsolescencia",
]

# Regimes em que revisão por pares não é o critério metodológico relevante.
SEM_REVISAO_PARES = {"fonte_primaria", "historiografia", "prova_formal", "depoimento", "argumento_filosofico", "teoria"}
IDENTIFICADORES = ("doi", "isbn", "arxiv", "url", "arquivo", "pmid", "handle")
AUTOSSUFICIENTES = {"prova_formal", "fonte_primaria"}
TETO_FONTE_UNICA = 0.7


class Verificador(Agente):
    papel = "verificador"

    # ---------------------------------------------------------- utilidades
    def fontes(self, afirm: str) -> list[str]:
        return [o for _, o, _ in self.acervo.entrando(afirm, "apresenta")]

    def autores(self, item: str) -> set[str]:
        if modelo.tipo_de(item) == "afirm":
            return set().union(*[self.autores(f) for f in self.fontes(item)] or [set()])
        return {o for _, o, _ in self.acervo.entrando(item, "autor_de")}

    def peso(self, item: str) -> float:
        d = self.acervo.obter(item) or {}
        if d.get("status") == "retratado":
            return 0.0
        return modelo.EVIDENCIA.get(d.get("tipo_evidencia", "desconhecido"), 0.1)

    def apoios(self, afirm: str) -> list[str]:
        itens = [d for r, d, _ in self.acervo.saindo(afirm) if r == "sustentada_por"]
        itens += [o for r, o, _ in self.acervo.entrando(afirm) if r in modelo.APOIO - {"sustentada_por"}]
        return list(dict.fromkeys(itens))

    def oposicoes(self, afirm: str) -> list[str]:
        alvos = [afirm] + self.fontes(afirm)
        itens = []
        for alvo in alvos:
            itens += [o for r, o, _ in self.acervo.entrando(alvo) if r in modelo.OPOSICAO]
        return list(dict.fromkeys(itens))

    def obsolescencia(self, afirm: str) -> list[tuple[str, str]]:
        achados = []
        for alvo in [afirm] + self.fontes(afirm):
            if (self.acervo.obter(alvo) or {}).get("status") == "retratado":
                achados.append(("retratado", alvo))
            achados += [(r, o) for r, o, _ in self.acervo.entrando(alvo) if r in modelo.OBSOLESCENCIA]
        return achados

    def independentes(self, afirm: str, itens: list[str]) -> list[str]:
        """Apoios cujo conjunto de autores não se sobrepõe ao da afirmação nem entre si."""
        vistos = set(self.autores(afirm))
        indep = []
        for i in itens:
            a = self.autores(i)
            if a and not (a & vistos):
                indep.append(i)
                vistos |= a
            elif not a:
                indep.append(i)  # autoria desconhecida: conta, mas o nível 3 acusa
        return indep

    # ---------------------------------------------------------- 8 camadas
    def niveis(self, afirm: str) -> list[dict]:
        dados = self.acervo.obter(afirm)
        fontes = self.fontes(afirm)
        obras = [self.acervo.obter(f) or {} for f in fontes]
        r = []

        def nivel(i, estado, nota):
            r.append({"nivel": NIVEIS_VERIFICACAO[i], "estado": estado, "nota": nota})

        # 1. existência da fonte
        com_id = [f for f, o in zip(fontes, obras) if any(o.get(k) for k in IDENTIFICADORES)]
        if not fontes:
            nivel(0, "falha", "nenhuma obra apresenta esta afirmação")
        elif com_id:
            nivel(0, "ok", f"{len(com_id)} fonte(s) com identificador persistente")
        else:
            nivel(0, "pendente", "fonte registrada, mas sem DOI/ISBN/URL/arquivo")

        # 2. integridade
        com_hash = [o for o in obras if o.get("hash_conteudo")]
        corrompidas = [o for o in com_hash if o.get("conteudo") and
                       hashlib.sha256(o["conteudo"].encode()).hexdigest() != o["hash_conteudo"]]
        if corrompidas:
            nivel(1, "falha", "conteúdo arquivado não corresponde ao hash registrado")
        elif com_hash:
            nivel(1, "ok", "hash de conteúdo registrado e consistente")
        else:
            nivel(1, "pendente", "sem hash de conteúdo arquivado")

        # 3. autoria e contexto
        autores = self.autores(afirm)
        com_ano = all(o.get("ano") for o in obras) and obras
        if autores and com_ano:
            nivel(2, "ok", f"{len(autores)} autor(es); data registrada")
        else:
            nivel(2, "pendente", "autoria ou data ausente")

        # 4. qualidade metodológica
        ev = dados.get("tipo_evidencia", "desconhecido")
        revisado = any(o.get("revisado_por_pares") for o in obras)
        if ev == "desconhecido":
            nivel(3, "pendente", "tipo de evidência não classificado")
        elif ev in SEM_REVISAO_PARES or revisado:
            nivel(3, "ok", f"evidência '{ev}'" + (" revisada por pares" if revisado else ""))
        elif ev == "opiniao":
            nivel(3, "alerta", "afirmação de opinião: não é evidência empírica")
        else:
            nivel(3, "pendente", f"evidência '{ev}' sem registro de revisão por pares")

        # 5. correspondência factual (a afirmação aparece na fonte?)
        if dados.get("trecho") or dados.get("localizador"):
            nivel(4, "ok", "localizador/trecho na fonte registrado: " + str(dados.get("localizador") or "trecho"))
        else:
            nivel(4, "pendente", "falta página/seção/trecho que ancore a afirmação na fonte")

        # 6. convergência
        indep = self.independentes(afirm, self.apoios(afirm))
        if len(indep) >= 2:
            nivel(5, "ok", f"{len(indep)} apoios independentes")
        elif len(indep) == 1:
            nivel(5, "parcial", "1 apoio independente")
        else:
            nivel(5, "pendente", "sem corroboração independente registrada")

        # 7. controvérsia
        opos = self.oposicoes(afirm)
        contr = [d for r, d, _ in self.acervo.saindo(afirm, "parte_de")]
        if opos or contr:
            nivel(6, "alerta", f"{len(opos)} oposição(ões); controvérsia(s): {', '.join(contr) or '—'}")
        else:
            nivel(6, "ok", "nenhuma contestação registrada")

        # 8. obsolescência
        obs = self.obsolescencia(afirm)
        if obs:
            nivel(7, "falha", "; ".join(f"{t} por {o}" for t, o in obs))
        else:
            nivel(7, "ok", "não superada nem retratada")
        return r

    def avaliar(self, afirm: str) -> dict:
        """Índice de robustez transparente (0–1) + rótulo. Fórmula em docs/ARQUITETURA.md §6."""
        dados = self.acervo.obter(afirm)
        base = modelo.EVIDENCIA.get(dados.get("tipo_evidencia", "desconhecido"), 0.1)
        fontes_ok = [f for f in self.fontes(afirm) if (self.acervo.obter(f) or {}).get("status") != "retratado"]
        if not fontes_ok:
            base = 0.0
        apoios = self.apoios(afirm)
        indep = set(self.independentes(afirm, apoios))
        s = base
        for a in apoios:
            w = self.peso(a) * (1.0 if a in indep else 0.5)
            s = 1 - (1 - s) * (1 - 0.5 * w)
        soma_apoio = base + sum(self.peso(a) for a in apoios)
        opos = self.oposicoes(afirm)
        soma_opos = sum(self.peso(o) for o in opos)
        for o in opos:
            s *= 1 - 0.5 * self.peso(o)
        # Fonte única não é consenso: sem apoio independente, teto de 0.7 ("moderada").
        # Exceções: prova formal (vale por si) e fonte primária (a afirmação é sobre o próprio documento).
        if not indep and dados.get("tipo_evidencia") not in AUTOSSUFICIENTES:
            s = min(s, TETO_FONTE_UNICA)
        obs = self.obsolescencia(afirm)
        if obs:
            s = min(s, 0.05)
        s = round(s, 3)
        if obs:
            rotulo = "superada/retratada"
        elif opos and soma_opos >= 0.5 * soma_apoio:
            rotulo = "contestada"
        elif s >= 0.8:
            rotulo = "forte"
        elif s >= 0.6:
            rotulo = "moderada"
        elif s >= 0.35:
            rotulo = "fraca"
        else:
            rotulo = "insuficiente"
        return {"confianca": s, "rotulo": rotulo, "apoios": len(apoios), "independentes": len(indep),
                "oposicoes": len(opos)}

    def verificar(self, afirm: str) -> dict:
        if modelo.tipo_de(afirm) != "afirm":
            raise ValueError("o Verificador avalia afirmações")
        criador = criador_de(self.acervo, afirm)
        if criador and criador.split("@")[0] == self.papel or criador == self.nome:
            raise PermissaoNegada("separação de funções: quem cria não verifica")
        resultado = {
            **self.avaliar(afirm),
            "niveis": self.niveis(afirm),
            "verificado_em": datetime.now(timezone.utc).date().isoformat(),
            "verificado_por": self.nome,
        }
        self._registrar_juizo("verificar", afirm, {"verificacao": resultado}, regra="verificacao:8-camadas-v1")
        return resultado

    def verificar_tudo(self) -> dict[str, dict]:
        return {a: self.verificar(a) for a, _ in self.acervo.listar("afirm")}
