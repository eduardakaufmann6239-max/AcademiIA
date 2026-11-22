"""Exportação interoperável (FAIR): JSON-LD e RDF Turtle, com vocabulários abertos."""
from __future__ import annotations

import json

BASE = "https://atlas-vivo.example/id/"
CONTEXTO = {
    "@vocab": BASE + "voc/",
    "schema": "https://schema.org/",
    "dcterms": "http://purl.org/dc/terms/",
    "prov": "http://www.w3.org/ns/prov#",
    "titulo": "dcterms:title",
    "ano": "dcterms:date",
    "nome": "schema:name",
    "doi": "schema:identifier",
    "autor_de": {"@id": "dcterms:creator", "@type": "@id", "@reverse": True},
    "cita": {"@id": "schema:citation", "@type": "@id"},
}
TIPO_RDF = {"obra": "schema:CreativeWork", "autor": "schema:Person", "conceito": "schema:DefinedTerm",
            "periodico": "schema:Periodical", "evento": "schema:Event", "afirm": "schema:Claim",
            "metodo": "schema:HowTo", "controv": "schema:Question", "proposta": "schema:Thing",
            "tax": "schema:DefinedTermSet"}


def _iri(ident: str) -> str:
    return BASE + ident.replace(":", "/")


def jsonld(acervo) -> dict:
    grafo = []
    rels_por_origem: dict[str, list] = {}
    for o, r, d, _ in acervo.todas_relacoes():
        rels_por_origem.setdefault(o, []).append((r, d))
    for ident, dados in acervo.listar():
        no = {"@id": _iri(ident), "@type": TIPO_RDF[ident.split(":")[0]], **dados}
        for r, d in rels_por_origem.get(ident, []):
            no.setdefault(BASE + "voc/" + r, []).append({"@id": _iri(d)})
        meta = acervo.meta(ident)
        no["prov:generatedAtTime"] = meta["criado"]
        no[BASE + "voc/versao"] = meta["versao"]
        grafo.append(no)
    return {"@context": {k: v for k, v in CONTEXTO.items() if k != "autor_de"}, "@graph": grafo}


def _lit(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        v = json.dumps(v, ensure_ascii=False)
    return json.dumps(str(v), ensure_ascii=False)


def turtle(acervo) -> str:
    linhas = [
        "@prefix schema: <https://schema.org/> .",
        "@prefix dcterms: <http://purl.org/dc/terms/> .",
        f"@prefix av: <{BASE}voc/> .",
        "",
    ]
    for ident, dados in acervo.listar():
        props = [f"a {TIPO_RDF[ident.split(':')[0]]}"]
        for k, v in dados.items():
            if k in ("verificacao", "curadoria"):
                continue
            props.append(f"av:{k} {_lit(v)}")
        linhas.append(f"<{_iri(ident)}> " + " ;\n    ".join(props) + " .")
    for o, r, d, _ in acervo.todas_relacoes():
        linhas.append(f"<{_iri(o)}> av:{r} <{_iri(d)}> .")
    return "\n".join(linhas) + "\n"
