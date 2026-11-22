"""Agentes de produção: Coletor, Extrator, Classificador, Historiador, Tradutor, Curador."""
from __future__ import annotations

from .. import modelo
from .base import Agente


class Coletor(Agente):
    """Localiza e registra obras, autores e veículos, com identificadores persistentes."""
    papel = "coletor"

    def registrar_obra(self, titulo: str, ano: int, tipo_obra: str, autores: list[str] = (),
                       periodico: str | None = None, ident: str | None = None, **meta) -> str:
        oid = ident or modelo.novo_id("obra", f"{titulo}-{ano}")
        self.criar(oid, {"titulo": titulo, "ano": ano, "tipo_obra": tipo_obra, **meta},
                   regra="coleta:registro-de-obra")
        for nome in autores:
            aid = modelo.novo_id("autor", nome)
            if self.acervo.obter(aid) is None:
                self.criar(aid, {"nome": nome}, regra="coleta:autor-mencionado")
            self.relacionar(aid, "autor_de", oid)
        if periodico:
            pid = modelo.novo_id("periodico", periodico)
            if self.acervo.obter(pid) is None:
                self.criar(pid, {"nome": periodico}, regra="coleta:veiculo-mencionado")
            self.relacionar(oid, "publicado_em", pid)
        return oid


class Extrator(Agente):
    """Transforma conteúdo de obras em afirmações estruturadas e conceitos."""
    papel = "extrator"

    def extrair_afirmacao(self, obra: str, enunciado: str, tipo_evidencia: str,
                          localizador: str | None = None, ident: str | None = None,
                          conceitos: list[str] = (), **meta) -> str:
        if self.acervo.obter(obra) is None:
            raise KeyError(f"obra inexistente: {obra}")
        aid = ident or modelo.novo_id("afirm", enunciado)
        dados = {"enunciado": enunciado, "tipo_evidencia": tipo_evidencia, **meta}
        if localizador:
            dados["localizador"] = localizador
        self.criar(aid, dados, regra="extracao:afirmacao-de-obra")
        self.relacionar(obra, "apresenta", aid)
        for c in conceitos:
            cid = c if c.startswith("conceito:") else modelo.novo_id("conceito", c)
            if self.acervo.obter(cid) is None:
                self.criar(cid, {"nome": c}, regra="extracao:conceito-mencionado")
            self.relacionar(aid, "sobre", cid)
        return aid


class Classificador(Agente):
    """Situa itens na árvore primária (domínio > área > ... > subtópico). Um item pode ter várias posições."""
    papel = "classificador"

    def garantir_caminho(self, caminho: list[str]) -> str:
        """['Ciências Naturais','Biologia','Evolução'] -> id do nó-folha, criando o que faltar."""
        pai = None
        for prof, nome in enumerate(caminho):
            nivel = modelo.NIVEIS[prof] if prof < len(modelo.NIVEIS) else f"subtopico-{prof - len(modelo.NIVEIS) + 2}"
            tid = "tax:" + "/".join(modelo.slug(n, 40) for n in caminho[: prof + 1])
            if self.acervo.obter(tid) is None:
                self.criar(tid, {"nome": nome, "nivel": nivel}, regra="classificacao:no-da-arvore")
                if pai:
                    self.relacionar(tid, "subnivel_de", pai)
            pai = tid
        return pai

    def classificar(self, item: str, caminho: list[str]) -> str:
        folha = self.garantir_caminho(caminho)
        self.relacionar(item, "classificado_em", folha)
        return folha


class Historiador(Agente):
    """Reconstrói linhagens de ideias: quem desenvolveu, criticou, respondeu, superou."""
    papel = "historiador"

    def linhagem(self, ident: str) -> list[dict]:
        rels = {"desenvolve", "critica", "responde_a", "supera", "influenciou", "replica", "contradiz",
                "corrobora", "sintetiza", "retrata"}
        vistos, fila, arestas = {ident}, [ident], []
        while fila:
            atual = fila.pop()
            for direcao, lista in (("saida", self.acervo.saindo(atual)), ("entrada", self.acervo.entrando(atual))):
                for rel, outro, _ in lista:
                    if rel not in rels:
                        continue
                    o, d = (atual, outro) if direcao == "saida" else (outro, atual)
                    if (o, rel, d) not in [(a["origem"], a["rel"], a["destino"]) for a in arestas]:
                        arestas.append({"origem": o, "rel": rel, "destino": d, "ano": self.ano(o)})
                    if outro not in vistos:
                        vistos.add(outro)
                        fila.append(outro)
        return sorted(arestas, key=lambda a: (a["ano"] if a["ano"] is not None else 9999, a["origem"]))

    def ano(self, ident: str):
        d = self.acervo.obter(ident) or {}
        if "ano" in d:
            return d["ano"]
        for rel, origem, _ in self.acervo.entrando(ident, "apresenta"):
            return (self.acervo.obter(origem) or {}).get("ano")
        return None


class Tradutor(Agente):
    """Relaciona vocabulários de áreas distintas (ex.: entropia termodinâmica <-> entropia de Shannon)."""
    papel = "tradutor"

    def correlatos(self, conceito: str) -> list[tuple[str, dict]]:
        saida = [(d, dd) for _, d, dd in self.acervo.saindo(conceito, "traduz_para")]
        entrada = [(o, dd) for _, o, dd in self.acervo.entrando(conceito, "traduz_para")]
        return saida + entrada


class Curador(Agente):
    """Organiza controvérsias e registra o estado do debate, sem falsa neutralidade."""
    papel = "curador"

    def avaliar_controversia(self, controv: str, avaliar_afirmacao) -> dict:
        """Compara o suporte evidencial de cada posição; não trata lados desiguais como iguais."""
        posicoes = []
        for _, afirm, dados in self.acervo.entrando(controv, "parte_de"):
            v = avaliar_afirmacao(afirm)
            posicoes.append({"afirmacao": afirm, "posicao": dados.get("posicao", "?"),
                             "confianca": v["confianca"], "rotulo": v["rotulo"]})
        posicoes.sort(key=lambda p: -p["confianca"])
        if not posicoes:
            estado = "sem posições registradas"
        elif len(posicoes) == 1 or posicoes[0]["confianca"] - posicoes[1]["confianca"] >= 0.3:
            estado = "assimetria evidencial: uma posição tem suporte claramente maior"
        else:
            estado = "debate ativo: posições com suporte comparável"
        resultado = {"estado_debate": estado, "posicoes": posicoes}
        self._registrar_juizo("contestar", controv, {"curadoria": resultado}, regra="curadoria:assimetria-0.3")
        return resultado
