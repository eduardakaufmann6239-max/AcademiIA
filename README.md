# AcademiIA — Atlas Vivo do Conhecimento

Protótipo funcional de uma infraestrutura em que **agentes produzem, verificam e preservam o conhecimento humano** como uma rede rastreável de **afirmações, evidências, autores, obras, conceitos, métodos e controvérsias**, organizada em domínio › área › subárea › tema › subtema › tópico › subtópico, com conexões transversais entre áreas.

Qualquer afirmação responde a: **quem disse o quê, com base em quê, quando, onde e sob quais limitações** — e qualquer mudança fica num livro-razão encadeado por hash.

📄 Especificação completa: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)

## O que já funciona

- **Modelo de dados** com 10 tipos de entidade e 26 relações tipadas e validadas.
- **Livro-razão imutável** (SHA-256 encadeado); o estado é reconstruível a partir do livro.
- **8 agentes com permissões separadas** (Coletor, Extrator, Classificador, Historiador, Tradutor, Verificador, Curador, Guardião). Quem cria não verifica — imposto em código.
- **Verificação em 8 camadas** (fonte, integridade, autoria, método, correspondência, convergência, controvérsia, obsolescência) e **índice de robustez** público e contestável.
- **Curadoria de controvérsias** sem falsa neutralidade (compara suporte evidencial).
- **Investigação rastreável**: trilha completa de uma afirmação, caminho entre áreas, linhagem histórica, investigação a partir de pergunta com lacunas explícitas.
- **Exportação FAIR**: JSON-LD e RDF/Turtle (schema.org, Dublin Core, PROV).
- **Conectores** OpenAlex (por DOI) e Wikidata.
- **Semente real** em três eixos: *desde os primeiros seres vivos* (Oparin, Miller, Woese, Schopf × Brasier, Darwin, Mendel, Watson–Crick–Franklin…), *entropia em quatro áreas* (Clausius, Boltzmann, Shannon, Jaynes, Schrödinger) e *conhecimento e mente* (Platão, Gettier, Turing × Searle, Transformers, FAIR, OpenAlex).

Python 3.10+, **zero dependências externas**.

## Uso

```bash
python -m atlas semear                      # carrega a semente, verifica e cura
python -m atlas arvore                      # árvore de áreas
python -m atlas investigar origem da vida   # investigação com consensos, debates e lacunas
python -m atlas trilha afirm:watson-crick-dupla-helice
python -m atlas caminho afirm:darwin-descendencia-modificacao afirm:shannon-entropia-informacao
python -m atlas linhagem afirm:shannon-entropia-informacao
python -m atlas historico afirm:miller-aminoacidos
python -m atlas auditar                     # Guardião: integridade do livro-razão
python -m atlas exportar turtle > atlas.ttl
python -m atlas importar-doi 10.1038/171737a0   # requer rede
```

Exemplo de caminho entre áreas (saída real):

```
Darwin: descendência com modificação --sobre--> Evolução biológica
  <--sobre-- Lamarck: herança de caracteres adquiridos
  <--critica-- Weismann, Das Keimplasma (1892) --apresenta--> barreira de Weismann
  --sobre--> Hereditariedade <--sobre-- Schrödinger: "cristal aperiódico" (1944)
  --sobre--> Informação <--sobre-- Shannon: H = −Σ p log p (1948)
```

## Testes

```bash
python -m unittest discover -s testes -t .
```

Cobrem integridade do livro, detecção de adulteração, permissões por papel, separação de funções, independência de apoios, retratação, controvérsias, trilha, caminho, linhagem, árvore de profundidade arbitrária e exportação.

## Estrutura

```
atlas/
  modelo.py          tipos, relações, pesos de evidência, validação
  acervo.py          livro-razão encadeado + visão materializada (SQLite)
  agentes/           base (permissões), papéis, verificador, guardião, conectores
  investigacao.py    trilha, caminho, linhagem, investigação, árvore
  exportar.py        JSON-LD e Turtle
  semente.py, cli.py
dados/semente/       pacotes JSON (formato em esquemas/semente.schema.json)
docs/ARQUITETURA.md  especificação, governança, riscos, roteiro
testes/
```

## Contribuir com conhecimento

Adicione um arquivo em `dados/semente/` seguindo `esquemas/semente.schema.json`. Regras: toda afirmação precisa de uma obra que a apresente, um `tipo_evidencia`, de preferência um `localizador` (página/seção) e um lugar na árvore. Use DOI/ISBN/arXiv só quando tiver certeza — a ausência fica visível como camada "pendente", o erro não.
