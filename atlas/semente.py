"""Carga de sementes: cada item é registrado pelo agente do papel responsável."""
from __future__ import annotations

import json
from pathlib import Path

from . import modelo
from .agentes import sociedade, PAPEL_POR_REL, PAPEL_POR_TIPO


def carregar(acervo, caminho: str | Path) -> dict:
    caminho = Path(caminho)
    arquivos = sorted(caminho.glob("*.json")) if caminho.is_dir() else [caminho]
    pacotes = [json.loads(a.read_text(encoding="utf-8")) for a in arquivos]
    ag = sociedade(acervo)
    n = {"entidades": 0, "relacoes": 0, "classificacoes": 0}
    # 1º todas as entidades (relações podem cruzar arquivos)
    for p in pacotes:
        for e in p.get("entidades", []):
            if acervo.obter(e["id"]) is None:
                ag[PAPEL_POR_TIPO[modelo.tipo_de(e["id"])]].criar(e["id"], e["dados"], regra="semente:carga-inicial")
                n["entidades"] += 1
    for p in pacotes:
        for r in p.get("relacoes", []):
            origem, rel, destino = r[:3]
            dados = r[3] if len(r) > 3 else None
            ag[PAPEL_POR_REL[rel]].relacionar(origem, rel, destino, dados, regra="semente:carga-inicial")
            n["relacoes"] += 1
        for item, caminho_tax in p.get("classificacoes", []):
            ag["classificador"].classificar(item, caminho_tax)
            n["classificacoes"] += 1
    return n
