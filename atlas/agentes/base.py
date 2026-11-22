"""Sociedade de agentes com papéis separados e permissões explícitas.

Regra central: coleta, extração, verificação e curadoria são feitas por
agentes DIFERENTES. Um agente só executa as ações do seu papel, e todo ato
fica assinado no livro-razão com o nome do agente e a regra aplicada.
"""
from __future__ import annotations

from ..acervo import Acervo
from .. import modelo

# papel -> tipos que pode criar, relações que pode registrar, pode verificar/contestar
PERMISSOES = {
    "coletor": ({"obra", "autor", "periodico"}, {"autor_de", "publicado_em", "cita", "afiliado_a"}, set()),
    "extrator": ({"afirm", "conceito", "metodo", "proposta"},
                 {"apresenta", "sustentada_por", "usa_metodo", "sobre", "tem_limitacao", "depende_de", "aplica_em"},
                 set()),
    "classificador": ({"tax"}, {"classificado_em", "subnivel_de"}, set()),
    "verificador": (set(), set(), {"verificar"}),
    "historiador": ({"evento"},
                    {"desenvolve", "critica", "responde_a", "influenciou", "supera", "retrata", "ocorreu_em",
                     "corrobora", "contradiz", "replica", "sintetiza"},
                    set()),
    "tradutor": (set(), {"traduz_para"}, set()),
    "curador": ({"controv"}, {"parte_de"}, {"contestar"}),
    "guardiao": (set(), set(), set()),
}

# Para a carga de sementes: qual papel é responsável por cada coisa.
PAPEL_POR_TIPO = {t: p for p, (tipos, _, _) in PERMISSOES.items() for t in tipos}
PAPEL_POR_REL = {r: p for p, (_, rels, _) in PERMISSOES.items() for r in rels}


class PermissaoNegada(PermissionError):
    pass


class Agente:
    papel = "base"
    versao = "1"

    def __init__(self, acervo: Acervo, instancia: str = "a"):
        self.acervo = acervo
        self.nome = f"{self.papel}@{self.versao}/{instancia}"
        self.tipos, self.rels, self.acoes = PERMISSOES[self.papel]

    def criar(self, ident: str, dados: dict, regra: str | None = None) -> str:
        if modelo.tipo_de(ident) not in self.tipos:
            raise PermissaoNegada(f"{self.nome} não pode criar {modelo.tipo_de(ident)}")
        return self.acervo.criar(ident, dados, self.nome, regra)

    def relacionar(self, origem: str, rel: str, destino: str, dados: dict | None = None,
                   regra: str | None = None) -> str:
        if rel not in self.rels:
            raise PermissaoNegada(f"{self.nome} não pode registrar a relação '{rel}'")
        return self.acervo.relacionar(origem, rel, destino, self.nome, dados, regra)

    def _registrar_juizo(self, acao: str, ident: str, mudancas: dict, regra: str) -> str:
        if acao not in self.acoes:
            raise PermissaoNegada(f"{self.nome} não pode '{acao}'")
        return self.acervo.alterar(ident, mudancas, self.nome, regra, acao=acao)


def criador_de(acervo: Acervo, ident: str) -> str | None:
    for ev in acervo.historico(ident):
        if ev["acao"] == "criar" and ev["alvo"] == ident:
            return ev["agente"]
    return None
