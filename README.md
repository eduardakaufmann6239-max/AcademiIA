# AcademiIA: Sociedade de Agentes

Implementação de referência e estudo teórico da ideia de **sociedade de agentes**
(Minsky, 1986): inteligência como propriedade emergente da interação organizada
entre agentes limitados. Ela só aparece sob as regras certas.

- **Teoria completa:** [`docs/sociedade-de-agentes.md`](docs/sociedade-de-agentes.md).
  Cobre a tese formal (teorema da diversidade), a genealogia, o modelo
  $(A, C, M, N, I, G)$, os três níveis, os princípios de engenharia, as
  patologias, a governança (Ostrom), a evidência experimental e um roteiro de
  redação.
- **Código:** Python 3.10+, só biblioteca padrão.

## Estrutura

```
sociedade/          núcleo
  agente.py         agente autônomo: percepção, competência, reação
  mensagens.py      mensagens tipadas com causa (cadeia causal)
  quadro.py         memória compartilhada versionada (blackboard)
  normas.py         normas verificáveis, sanções graduadas, constituição
  reputacao.py      confiança bayesiana Beta (falha pesa mais que acerto)
  registro.py       livro-razão encadeado por hash, rastreamento causal
  sociedade.py      entrega, leilão Contract Net ponderado por reputação, votação
experimentos/
  redacao.py        6 agentes escrevem uma redação com fontes verificadas
  emergencia.py     sabedoria das multidões, cascatas, manipulação e a norma que corrige
tests/              testes unitários e de comportamento emergente
```

## Rodar

```bash
python -m experimentos.redacao      # texto + reputação + violações + trilha causal
python -m experimentos.emergencia   # teorema da diversidade, herding, manipulação
python -m unittest -v               # testes
```

## Resultado em uma linha

Os mesmos 50 agentes, com 3 manipuladores falando primeiro, erram **34,9** quando
imitam o consenso e **3,3** sob a norma "juízo independente + mediana". A
sociedade é sábia ou tola conforme as regras, não conforme os agentes.
