"""Conectores federados: o Coletor busca metadados em fontes abertas existentes.

O Atlas não duplica OpenAlex, Crossref ou Wikidata: referencia e importa
metadados (com a origem registrada na regra do evento).
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

from .. import modelo
from .papeis import Coletor

UA = "AtlasVivo/0.1 (prototipo academico)"


def _get_json(url: str, timeout: int = 20) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def obra_openalex_para_dados(w: dict) -> tuple[dict, list[str], str | None]:
    """Converte um registro de work do OpenAlex em (dados, autores, periódico)."""
    doi = (w.get("doi") or "").replace("https://doi.org/", "") or None
    loc = (w.get("primary_location") or {}).get("source") or {}
    dados = {
        "titulo": w.get("title") or w.get("display_name") or "(sem título)",
        "ano": w.get("publication_year"),
        "tipo_obra": w.get("type") or "artigo",
        "idioma": w.get("language"),
        "openalex": w.get("id"),
        "citado_por": w.get("cited_by_count"),
        "acesso_aberto": (w.get("open_access") or {}).get("is_oa"),
        "status": "retratado" if w.get("is_retracted") else "publicado",
        "revisado_por_pares": w.get("type") in {"article", "review"} or None,
    }
    if doi:
        dados["doi"] = doi
    autores = [a["author"]["display_name"] for a in w.get("authorships", []) if a.get("author")]
    return {k: v for k, v in dados.items() if v is not None}, autores, loc.get("display_name")


def importar_doi_openalex(coletor: Coletor, doi: str) -> str:
    w = _get_json("https://api.openalex.org/works/doi:" + urllib.parse.quote(doi))
    dados, autores, periodico = obra_openalex_para_dados(w)
    titulo, ano, tipo = dados.pop("titulo"), dados.pop("ano"), dados.pop("tipo_obra")
    return coletor.registrar_obra(titulo, ano, tipo, autores, periodico, **dados)


def buscar_wikidata(termo: str, idioma: str = "pt") -> list[dict]:
    q = urllib.parse.urlencode({"action": "wbsearchentities", "search": termo, "language": idioma,
                                "format": "json", "limit": 5})
    return _get_json("https://www.wikidata.org/w/api.php?" + q).get("search", [])


__all__ = ["importar_doi_openalex", "buscar_wikidata", "obra_openalex_para_dados", "modelo"]
