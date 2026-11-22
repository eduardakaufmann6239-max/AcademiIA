"""Experimento 2 — quando muitos agentes são mais sábios que um, e quando não.

A. Teorema da predição pela diversidade (Page, 2007), verificado numericamente:
       (c − θ)² = média_i (s_i − θ)² − média_i (s_i − c)²
   erro coletivo = erro individual médio − diversidade.
B. Diversidade vs. homogeneidade: erros independentes se cancelam; viés compartilhado não.
C. Cascatas e manipulação: agentes que imitam o consenso público (herding) ficam
   reféns dos primeiros a falar; uma norma de independência + agregação robusta
   (mediana) restaura a inteligência coletiva.

Uso:  python -m experimentos.emergencia [--rodadas N] [--semente S]
"""
from __future__ import annotations

import argparse
import random
import statistics as st

THETA = 100.0     # valor verdadeiro a estimar
N = 50            # agentes


def teorema(estimativas: list[float], theta: float = THETA) -> tuple[float, float, float]:
    c = st.fmean(estimativas)
    coletivo = (c - theta) ** 2
    individual = st.fmean((s - theta) ** 2 for s in estimativas)
    diversidade = st.fmean((s - c) ** 2 for s in estimativas)
    return coletivo, individual, diversidade


def populacao(rng: random.Random, vies_comum: float, dispersao_vies: float, ruido: float) -> list[float]:
    """Cada agente: θ + viés comum + viés próprio + ruído."""
    return [THETA + vies_comum + rng.gauss(0, dispersao_vies) + rng.gauss(0, ruido) for _ in range(N)]


def sequencial(rng: random.Random, herding: float, manipuladores: int, agregador) -> float:
    """Agentes falam em ordem; cada um mistura seu sinal privado com o consenso
    público já visível (peso `herding`). Os primeiros `manipuladores` anunciam 160."""
    publicas: list[float] = []
    for i in range(N):
        if i < manipuladores:
            publicas.append(160.0)
            continue
        privado = THETA + rng.gauss(0, 20)
        consenso = st.fmean(publicas) if publicas else privado
        publicas.append((1 - herding) * privado + herding * consenso)
    return abs(agregador(publicas) - THETA)


def experimento(rodadas: int = 400, semente: int = 42) -> dict:
    rng = random.Random(semente)
    r: dict = {}

    # A — teorema (uma população qualquer basta; vale identicamente)
    pop = populacao(rng, 0, 10, 20)
    col, ind, div = teorema(pop)
    r["teorema"] = {"coletivo": col, "individual": ind, "diversidade": div,
                    "residuo": abs(col - (ind - div))}

    # B — diversidade vs. viés compartilhado
    def media_erros(vies_comum, disp):
        ind, col = [], []
        for _ in range(rodadas):
            p = populacao(rng, vies_comum, disp, 20)
            ind.append(st.fmean(abs(s - THETA) for s in p))
            col.append(abs(st.median(p) - THETA))
        return st.fmean(ind), st.fmean(col)
    r["diversa"] = media_erros(0, 10)
    r["homogenea"] = media_erros(15, 0)

    # C — cascatas, manipulação e governança
    cenarios = {
        "independente, média":            (0.0, 0, st.fmean),
        "independente, mediana":          (0.0, 0, st.median),
        "herding 0.8, média":             (0.8, 0, st.fmean),
        "independente + 3 manip., média": (0.0, 3, st.fmean),
        "herding 0.8 + 3 manip., média":  (0.8, 3, st.fmean),
        "norma: independência + mediana, 3 manip.": (0.0, 3, st.median),
    }
    r["cascata"] = {nome: st.fmean(sequencial(rng, h, m, ag) for _ in range(rodadas))
                    for nome, (h, m, ag) in cenarios.items()}
    return r


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--rodadas", type=int, default=400)
    p.add_argument("--semente", type=int, default=42)
    a = p.parse_args()
    r = experimento(a.rodadas, a.semente)

    t = r["teorema"]
    print("A. Teorema da predição pela diversidade (uma população de 50 agentes)")
    print(f"   erro coletivo {t['coletivo']:8.2f} = erro individual {t['individual']:8.2f}"
          f" − diversidade {t['diversidade']:8.2f}   (resíduo {t['residuo']:.1e})\n")

    print(f"B. Erro absoluto médio ({a.rodadas} rodadas, θ = {THETA:.0f})")
    print(f"   {'população':28s}{'indivíduo típico':>18s}{'coletivo (mediana)':>20s}")
    for nome, chave in (("diversa (vieses variados)", "diversa"), ("homogênea (viés comum +15)", "homogenea")):
        i, c = r[chave]
        print(f"   {nome:28s}{i:18.2f}{c:20.2f}")
    print()
    print("C. Cascatas e manipulação — erro do agregado final")
    for nome, erro in r["cascata"].items():
        print(f"   {nome:44s}{erro:8.2f}")


if __name__ == "__main__":
    main()
