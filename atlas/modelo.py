"""Modelo de dados do Atlas Vivo do Conhecimento.

O átomo do sistema é a AFIRMAÇÃO RASTREÁVEL. Tudo o mais (obras, autores,
conceitos, métodos, eventos, controvérsias, nós da taxonomia) existe para
situar, sustentar, contestar ou contextualizar afirmações.
"""
from __future__ import annotations

import re
import unicodedata

# --- Tipos de entidade -------------------------------------------------------
# prefixo do identificador -> descrição
TIPOS = {
    "afirm": "Afirmação rastreável (enunciado preciso + fonte + evidência)",
    "obra": "Obra: artigo, livro, tese, revista, lei, dataset, código, filme, entrevista",
    "autor": "Autor: pessoa, coletivo, instituição ou movimento",
    "conceito": "Conceito: ideia abstrata que atravessa áreas",
    "metodo": "Método: ensaio randomizado, análise de discurso, modelagem...",
    "evento": "Evento: descoberta, publicação fundadora, tratado, catástrofe",
    "controv": "Controvérsia: ponto de discordância com evidências de cada lado",
    "proposta": "Proposta: solução, política, intervenção, programa",
    "periodico": "Veículo: periódico, revista, editora, repositório, arquivo",
    "tax": "Nó da taxonomia (domínio > área > subárea > tema > ... )",
}

# Níveis da árvore primária. A árvore aceita profundidade arbitrária;
# além do 7º nível, usa-se "subtopico-N".
NIVEIS = ["dominio", "area", "subarea", "tema", "subtema", "topico", "subtopico"]

# --- Vocabulário de relações -------------------------------------------------
# nome -> (tipos de origem aceitos, tipos de destino aceitos, descrição)
_QUALQUER = set(TIPOS)
RELACOES = {
    # autoria e publicação
    "autor_de": ({"autor"}, {"obra", "proposta", "afirm"}, "é autor de"),
    "publicado_em": ({"obra"}, {"periodico"}, "foi publicado em"),
    "afiliado_a": ({"autor"}, {"autor"}, "é afiliado a (instituição)"),
    # afirmações e evidência
    "apresenta": ({"obra"}, {"afirm", "proposta", "conceito", "metodo"}, "apresenta"),
    "sustentada_por": ({"afirm", "proposta"}, {"obra", "afirm"}, "é sustentada por"),
    "usa_metodo": ({"obra", "afirm"}, {"metodo"}, "usa o método"),
    "tem_limitacao": ({"metodo", "afirm", "obra"}, {"conceito", "afirm"}, "tem a limitação"),
    "parte_de": ({"afirm", "proposta"}, {"controv"}, "faz parte da controvérsia"),
    # relações argumentativas entre obras/afirmações
    "cita": ({"obra"}, {"obra"}, "cita"),
    "corrobora": ({"obra", "afirm"}, {"afirm", "obra"}, "corrobora"),
    "contradiz": ({"obra", "afirm"}, {"afirm", "obra"}, "contradiz"),
    "critica": ({"obra", "autor", "afirm"}, {"obra", "afirm", "proposta", "conceito"}, "critica"),
    "responde_a": ({"obra", "afirm"}, {"obra", "afirm"}, "responde a"),
    "replica": ({"obra"}, {"obra", "afirm"}, "replica o estudo/resultado"),
    "sintetiza": ({"obra"}, {"obra", "afirm"}, "sintetiza (revisão/meta-análise)"),
    "desenvolve": ({"obra", "afirm", "conceito", "proposta"}, {"obra", "afirm", "conceito", "proposta"}, "desenvolve"),
    "supera": ({"obra", "afirm"}, {"obra", "afirm"}, "supera/torna obsoleto"),
    "retrata": ({"obra"}, {"obra", "afirm"}, "retrata (retratação formal)"),
    # dependências e aplicações
    "depende_de": (_QUALQUER, _QUALQUER, "depende de / pressupõe"),
    "aplica_em": ({"afirm", "conceito", "metodo", "obra"}, _QUALQUER, "é aplicado em"),
    "influenciou": ({"autor", "obra", "conceito"}, {"autor", "obra", "conceito"}, "influenciou"),
    # conceitos e classificação
    "sobre": ({"afirm", "obra", "controv", "proposta", "evento"}, {"conceito"}, "trata do conceito"),
    "traduz_para": ({"conceito"}, {"conceito"}, "conceito correlato em outra área"),
    "classificado_em": (_QUALQUER - {"tax"}, {"tax"}, "está classificado em"),
    "subnivel_de": ({"tax"}, {"tax"}, "é subnível de"),
    "ocorreu_em": ({"evento"}, {"obra", "conceito", "autor"}, "envolveu"),
}

# Relações que contam como apoio ou oposição a uma afirmação.
APOIO = {"sustentada_por", "corrobora", "replica", "sintetiza"}
OPOSICAO = {"contradiz", "critica"}
OBSOLESCENCIA = {"supera", "retrata"}

# --- Tipos de evidência e pesos ---------------------------------------------
# Pesos relativos, não verdades absolutas. Ciências empíricas e humanidades
# têm escalas próprias; o peso só compara evidências do mesmo regime.
EVIDENCIA = {
    # regime empírico
    "revisao_sistematica": 1.0,
    "meta_analise": 1.0,
    "ensaio_randomizado": 0.85,
    "experimento": 0.8,
    "estudo_observacional": 0.6,
    "dado_estatistico": 0.6,
    "modelagem": 0.5,
    "estudo_de_caso": 0.4,
    "preprint": 0.35,
    # regime histórico/documental
    "fonte_primaria": 0.9,
    "historiografia": 0.6,
    "depoimento": 0.4,
    # regime formal/teórico
    "prova_formal": 1.0,
    "teoria": 0.55,
    "argumento_filosofico": 0.5,
    # baixa força
    "opiniao": 0.15,
    "desconhecido": 0.1,
}

STATUS_OBRA = {"rascunho", "publicado", "revisado", "corrigido", "retratado", "contestado", "arquivado"}

LICENCAS_ABERTAS = {"cc0", "cc-by", "cc-by-sa", "dominio_publico"}


def slug(texto: str, maximo: int = 60) -> str:
    """'Teoria da Evolução' -> 'teoria-da-evolucao'."""
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t.lower()).strip("-")
    return t[:maximo] or "sem-nome"


def novo_id(tipo: str, nome: str) -> str:
    if tipo not in TIPOS:
        raise ValueError(f"tipo desconhecido: {tipo}")
    return f"{tipo}:{slug(nome)}"


def tipo_de(ident: str) -> str:
    tipo = ident.split(":", 1)[0]
    if tipo not in TIPOS:
        raise ValueError(f"identificador sem tipo válido: {ident}")
    return tipo


def validar_relacao(origem: str, rel: str, destino: str) -> None:
    if rel not in RELACOES:
        raise ValueError(f"relação desconhecida: {rel}")
    orig_ok, dest_ok, _ = RELACOES[rel]
    if tipo_de(origem) not in orig_ok:
        raise ValueError(f"'{rel}' não aceita origem do tipo {tipo_de(origem)} ({origem})")
    if tipo_de(destino) not in dest_ok:
        raise ValueError(f"'{rel}' não aceita destino do tipo {tipo_de(destino)} ({destino})")


# Campos mínimos obrigatórios por tipo (ficha de proveniência).
OBRIGATORIOS = {
    "afirm": ["enunciado"],
    "obra": ["titulo", "ano", "tipo_obra"],
    "autor": ["nome"],
    "conceito": ["nome"],
    "metodo": ["nome"],
    "evento": ["nome", "ano"],
    "controv": ["nome", "pergunta"],
    "proposta": ["nome"],
    "periodico": ["nome"],
    "tax": ["nome", "nivel"],
}


def validar_entidade(ident: str, dados: dict) -> list[str]:
    """Retorna lista de problemas (vazia = válida)."""
    problemas = []
    tipo = tipo_de(ident)
    for campo in OBRIGATORIOS[tipo]:
        if dados.get(campo) in (None, ""):
            problemas.append(f"{ident}: campo obrigatório ausente '{campo}'")
    if tipo == "afirm":
        ev = dados.get("tipo_evidencia", "desconhecido")
        if ev not in EVIDENCIA:
            problemas.append(f"{ident}: tipo_evidencia inválido '{ev}'")
    if tipo == "obra" and dados.get("status", "publicado") not in STATUS_OBRA:
        problemas.append(f"{ident}: status inválido '{dados.get('status')}'")
    if tipo == "tax" and not (dados["nivel"] in NIVEIS or str(dados["nivel"]).startswith("subtopico-")):
        problemas.append(f"{ident}: nível de taxonomia inválido '{dados['nivel']}'")
    return problemas
