"""Linha de comando: python -m atlas <comando>."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .acervo import Acervo
from .agentes import Guardiao, Verificador, Curador, Historiador, Coletor
from .investigacao import Investigacao
from . import exportar, semente

RAIZ = Path(__file__).resolve().parent.parent
SEMENTE = RAIZ / "dados" / "semente"


def _j(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2, default=str))


def main(argv=None):
    p = argparse.ArgumentParser(prog="atlas", description="Atlas Vivo do Conhecimento")
    p.add_argument("--db", default="atlas.db", help="arquivo SQLite do acervo")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("semear", help="carrega sementes, verifica afirmações e cura controvérsias")
    s.add_argument("caminho", nargs="?", default=str(SEMENTE))
    sub.add_parser("arvore", help="mostra a árvore de áreas do conhecimento")
    t = sub.add_parser("trilha", help="trilha completa de uma afirmação")
    t.add_argument("afirmacao")
    c = sub.add_parser("caminho", help="como duas entidades se conectam")
    c.add_argument("origem")
    c.add_argument("destino")
    i = sub.add_parser("investigar", help="investigação rastreável a partir de uma pergunta")
    i.add_argument("pergunta", nargs="+")
    l = sub.add_parser("linhagem", help="linhagem histórica de uma ideia/obra")
    l.add_argument("ident")
    h = sub.add_parser("historico", help="eventos do livro-razão sobre uma entidade")
    h.add_argument("ident")
    sub.add_parser("verificar", help="(re)verifica todas as afirmações")
    sub.add_parser("auditar", help="Guardião: integridade do livro-razão e separação de funções")
    sub.add_parser("estatisticas", help="contagens por tipo")
    e = sub.add_parser("exportar", help="exporta o grafo")
    e.add_argument("formato", choices=["jsonld", "turtle"])
    d = sub.add_parser("importar-doi", help="Coletor: importa uma obra do OpenAlex pelo DOI (requer rede)")
    d.add_argument("doi")

    a = p.parse_args(argv)
    acervo = Acervo(a.db)
    inv = Investigacao(acervo)

    if a.cmd == "semear":
        n = semente.carregar(acervo, a.caminho)
        v = Verificador(acervo).verificar_tudo()
        cur = Curador(acervo)
        for cid, _ in acervo.listar("controv"):
            cur.avaliar_controversia(cid, Verificador(acervo, "curadoria").avaliar)
        n["afirmacoes_verificadas"] = len(v)
        _j(n)
    elif a.cmd == "arvore":
        for prof, ident, nome, itens in inv.arvore():
            print("  " * prof + f"{'└─ ' if prof else ''}{nome}" + (f"  [{itens}]" if itens else ""))
    elif a.cmd == "trilha":
        _j(inv.trilha(a.afirmacao))
    elif a.cmd == "caminho":
        passos = inv.caminho(a.origem, a.destino)
        if passos is None:
            print("sem conexão registrada")
            return 1
        for o, r, d in passos:
            print(f"{acervo.nome(o)}  --{r}-->  {acervo.nome(d)}")
    elif a.cmd == "investigar":
        _j(inv.investigar(" ".join(a.pergunta)))
    elif a.cmd == "linhagem":
        h = Historiador(acervo, "consulta")
        for ar in h.linhagem(a.ident):
            print(f"[{ar['ano'] or '?'}] {acervo.nome(ar['origem'])}  --{ar['rel']}-->  {acervo.nome(ar['destino'])}")
    elif a.cmd == "historico":
        _j(acervo.historico(a.ident))
    elif a.cmd == "verificar":
        r = Verificador(acervo).verificar_tudo()
        _j({k: {"rotulo": v["rotulo"], "confianca": v["confianca"]} for k, v in r.items()})
    elif a.cmd == "auditar":
        r = Guardiao(acervo).auditar()
        _j(r)
        return 0 if r["integro"] else 2
    elif a.cmd == "estatisticas":
        cont = {}
        for ident, _ in acervo.listar():
            cont[ident.split(":")[0]] = cont.get(ident.split(":")[0], 0) + 1
        cont["relacoes"] = len(acervo.todas_relacoes())
        cont["eventos_no_livro"] = len(acervo.eventos())
        _j(cont)
    elif a.cmd == "exportar":
        if a.formato == "jsonld":
            _j(exportar.jsonld(acervo))
        else:
            sys.stdout.write(exportar.turtle(acervo))
    elif a.cmd == "importar-doi":
        from .agentes.conectores import importar_doi_openalex
        print(importar_doi_openalex(Coletor(acervo, "openalex"), a.doi))
    return 0


if __name__ == "__main__":
    sys.exit(main())
