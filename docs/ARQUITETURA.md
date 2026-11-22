# Atlas Vivo do Conhecimento — Especificação

> Infraestrutura aberta, rastreável e federada em que agentes de IA coletam, organizam, verificam, preservam e conectam o conhecimento humano — e em que qualquer pessoa pode seguir a trilha de **quem disse o quê, com base em quê, quando, onde e sob quais limitações**.

Este documento leva a proposta original ao nível de especificação implementável. Cada seção indica **[implementado]** quando já existe código neste repositório, ou **[especificado]** quando é desenho para as próximas fases.

---

## 1. Tese e escopo

O átomo do sistema é a **afirmação rastreável**, não o documento. Obras, autores, conceitos, métodos, eventos e controvérsias existem para situar, sustentar, contestar ou contextualizar afirmações.

Três compromissos não negociáveis:

1. **Nada sem proveniência.** Todo dado tem origem, agente responsável, regra aplicada e data.
2. **Nada apagado em silêncio.** Toda mudança é um evento num livro-razão encadeado por hash.
3. **Robustez não é verdade.** O sistema registra *o que sustenta* uma afirmação e *quão robusto* é esse suporte — nunca decreta verdade absoluta.

"Todo o conhecimento do mundo" é o horizonte, não a primeira entrega. O caminho é federar o que já existe (OpenAlex, Crossref, Wikidata, bibliotecas, arquivos, museus) e acrescentar a camada que falta: **afirmações + evidência + controvérsia + linhagem, com auditoria**.

---

## 2. Modelo de dados [implementado — `atlas/modelo.py`]

### 2.1 Entidades

| Prefixo | Tipo | Campos mínimos |
|---|---|---|
| `afirm:` | Afirmação rastreável | `enunciado`, `tipo_evidencia`, (`localizador`/`trecho`, `limitacoes`) |
| `obra:` | Artigo, livro, tese, revista, lei, dataset, código, filme, entrevista, diálogo | `titulo`, `ano`, `tipo_obra`, (`doi`/`isbn`/`arxiv`/`url`, `status`, `licenca`, `revisado_por_pares`) |
| `autor:` | Pessoa, coletivo, instituição, movimento | `nome` |
| `conceito:` | Ideia transversal | `nome`, (`sinonimos`) |
| `metodo:` | Método de produção de evidência | `nome` |
| `evento:` | Descoberta, publicação, tratado, catástrofe | `nome`, `ano` |
| `controv:` | Controvérsia | `nome`, `pergunta` |
| `proposta:` | Solução, política, intervenção | `nome` |
| `periodico:` | Periódico, editora, repositório, arquivo | `nome` |
| `tax:` | Nó da árvore de áreas | `nome`, `nivel` |

Identificadores são legíveis e estáveis (`obra:miller-1953`, `autor:rosalind-franklin`). Em produção, cada entidade recebe também um identificador persistente resolvível (ver §9) e guarda os identificadores externos (DOI, ISBN, ORCID, ROR, Wikidata QID, OpenAlex ID).

### 2.2 Relações (vocabulário controlado, com tipos de origem/destino validados)

- **Autoria e publicação:** `autor_de`, `publicado_em`, `afiliado_a`
- **Evidência:** `apresenta` (obra→afirmação), `sustentada_por`, `usa_metodo`, `tem_limitacao`, `parte_de` (afirmação→controvérsia)
- **Argumentação:** `cita`, `corrobora`, `contradiz`, `critica`, `responde_a`, `replica`, `sintetiza`, `desenvolve`, `supera`, `retrata`
- **Dependência e uso:** `depende_de`, `aplica_em`, `influenciou`
- **Conceitos e classificação:** `sobre`, `traduz_para` (ponte entre vocabulários de áreas), `classificado_em`, `subnivel_de`, `ocorreu_em`

Uma relação com tipos incompatíveis é recusada (ex.: um conceito não pode "replicar" um estudo).

### 2.3 Árvore primária + rede transversal [implementado — `Classificador`]

Árvore: **domínio › área › subárea › tema › subtema › tópico › subtópico**, com profundidade arbitrária (`subtopico-2`, `subtopico-3`…). Um mesmo item pode ocupar **várias posições** (ex.: o *Teeteto* em Epistemologia e em Filosofia antiga; a afirmação de Lamarck em Biologia e em História das ciências).

A árvore é um índice de navegação; o conhecimento propriamente dito vive na **rede transversal** de relações, que atravessa as áreas livremente.

---

## 3. Livro-razão e preservação [implementado — `atlas/acervo.py`, `Guardiao`]

- Toda mutação (`criar`, `alterar`, `relacionar`, `desrelacionar`, `verificar`, `contestar`) é um **evento** com `ts`, `agente`, `acao`, `alvo`, `carga`, `regra`, `hash_ant`, `hash`.
- `hash = SHA-256(hash_ant ‖ ts ‖ agente ‖ acao ‖ alvo ‖ carga ‖ regra)` — adulterar qualquer evento quebra a cadeia.
- As tabelas de entidades e relações são **visão materializada**; podem ser reconstruídas reexecutando o livro.
- O **Guardião** audita: (1) integridade da cadeia, (2) separação de funções, (3) igualdade entre visão materializada e replay. Qualquer alteração fora do livro é detectada.
- Remover uma relação não a apaga da história: o evento `desrelacionar` (com motivo) fica no histórico.
- O hash da cabeça (`hash_cabeca`) funciona como **selo de versão** do acervo inteiro; publicá-lo periodicamente em locais independentes permite a qualquer espelho provar que tem a mesma história.

---

## 4. Sociedade de agentes [implementado — `atlas/agentes/`]

| Agente | Pode criar | Pode relacionar | Juízos |
|---|---|---|---|
| **Coletor** | obra, autor, periódico | `autor_de`, `publicado_em`, `cita`, `afiliado_a` | — |
| **Extrator** | afirmação, conceito, método, proposta | `apresenta`, `sustentada_por`, `usa_metodo`, `sobre`, `tem_limitacao`, `depende_de`, `aplica_em` | — |
| **Classificador** | nós da árvore | `classificado_em`, `subnivel_de` | — |
| **Historiador** | evento | `desenvolve`, `critica`, `responde_a`, `influenciou`, `supera`, `retrata`, `corrobora`, `contradiz`, `replica`, `sintetiza`, `ocorreu_em` | — |
| **Tradutor** | — | `traduz_para` | — |
| **Verificador** | — | — | `verificar` |
| **Curador** | controvérsia | `parte_de` | `contestar` (estado do debate) |
| **Guardião** | — | — | auditoria (somente leitura) |
| **Interface** | — | — | consultas: trilha, caminho, linhagem, investigação |

**Separação de funções é imposta em código:** um agente fora do seu papel recebe `PermissaoNegada`; quem criou uma afirmação não pode verificá-la; o Guardião acusa qualquer violação encontrada no livro.

Os agentes deste protótipo são determinísticos. Na Fase 2, Extrator, Classificador e Historiador passam a usar LLMs **como propositores**: produzem *candidatos* que só entram no acervo depois de passar pelo Verificador (outro modelo/regra, nunca o mesmo) e, nas áreas sensíveis, por revisão humana. A assinatura do agente inclui versão (`extrator@2/modelo-x`), para que erros sistemáticos de uma versão possam ser localizados e revertidos em lote.

---

## 5. Verificação em 8 camadas [implementado — `Verificador.niveis`]

| Camada | Pergunta | Estados |
|---|---|---|
| 1. Existência da fonte | Há obra que apresenta a afirmação, com identificador persistente? | ok / pendente / falha |
| 2. Integridade | O conteúdo arquivado confere com o hash registrado? | ok / pendente / falha |
| 3. Autoria e contexto | Autores e data estão registrados? | ok / pendente |
| 4. Qualidade metodológica | O tipo de evidência é conhecido e adequado ao regime (revisão por pares onde se aplica)? | ok / pendente / alerta |
| 5. Correspondência factual | Há página/seção/trecho que ancore a afirmação na fonte? | ok / pendente |
| 6. Convergência | Há apoios **independentes** (sem coautoria compartilhada)? | ok / parcial / pendente |
| 7. Controvérsia | Há oposições ou controvérsias registradas? | ok / alerta |
| 8. Obsolescência | A afirmação ou sua fonte foi retratada ou superada? | ok / falha |

O resultado é gravado no livro como evento `verificar`, assinado e datado — verificações têm história própria.

---

## 6. Índice de robustez [implementado — `Verificador.avaliar`]

Fórmula deliberadamente simples e pública, para ser contestável:

```
base   = peso(tipo_evidencia)                        # 0 se todas as fontes foram retratadas
para cada apoio a:      s = 1 − (1 − s)·(1 − 0,5·w_a)   # w_a = peso(a) se independente, peso(a)/2 se não
para cada oposição o:   s = s·(1 − 0,5·peso(o))
sem apoio independente: s = min(s, 0,7)               # exceto prova_formal e fonte_primaria
retratada/superada:     s = min(s, 0,05)
```

Rótulos: **forte** ≥ 0,8 · **moderada** ≥ 0,6 · **fraca** ≥ 0,35 · **insuficiente** < 0,35 · **contestada** quando o peso das oposições ≥ metade do peso de apoio · **superada/retratada** quando há retratação ou superação.

Pesos por regime (`modelo.EVIDENCIA`) só comparam evidências do mesmo regime: empírico (revisão sistemática 1,0 … preprint 0,35), documental (fonte primária 0,9, historiografia 0,6, depoimento 0,4), formal/teórico (prova formal 1,0, teoria 0,55, argumento filosófico 0,5), opinião 0,15.

**Leitura correta:** o índice mede *o suporte registrado no Atlas*, não o estado do mundo. "Fraca" frequentemente significa "o Atlas ainda não registrou a corroboração" — e isso aparece como **lacuna** na investigação, convidando a completar o registro. Fonte única nunca é tratada como consenso.

---

## 7. Controvérsias sem falsa neutralidade [implementado — `Curador`]

O Curador compara o suporte evidencial de cada posição:
- diferença ≥ 0,3 → "assimetria evidencial: uma posição tem suporte claramente maior";
- caso contrário → "debate ativo: posições com suporte comparável".

Assim, rotular algo como controverso não iguala lados com suporte desigual. Exemplos na semente: *replicador vs. metabolismo* na origem da vida (debate ativo), *microfósseis do Apex chert* (Schopf vs. Brasier), *máquinas podem pensar?* (Turing vs. Searle).

---

## 8. Investigação rastreável [implementado — `atlas/investigacao.py`]

| Operação | O que entrega |
|---|---|
| `trilha(afirmação)` | enunciado, tipo de evidência, localizador, limitações, fontes (autores, veículo, DOI), árvore de sustentação recursiva, contestações, obsolescência, avaliação, verificação registrada, histórico de eventos |
| `caminho(a, b)` | menor cadeia de relações entre dois itens de quaisquer áreas (ex.: Darwin → Weismann → hereditariedade → Schrödinger → informação → Shannon) |
| `linhagem(x)` | cadeia cronológica de desenvolvimentos, críticas, respostas e superações |
| `investigar(pergunta)` | subperguntas, afirmações agrupadas por robustez, controvérsias com estado do debate, pontes entre áreas, **lacunas** (conceitos sem afirmações; camadas de verificação pendentes) |

Na Fase 2, a decomposição da pergunta e a redação da resposta passam a usar LLM, mas **toda frase da resposta precisa apontar para afirmações do acervo** — o que não estiver no grafo aparece explicitamente como "não registrado".

---

## 9. Federação e interoperabilidade

- **[implementado]** Exportação JSON-LD e RDF/Turtle com `schema.org`, `dcterms` e `prov`; conector OpenAlex (importação por DOI, incluindo flag de retratação) e busca Wikidata (`atlas/agentes/conectores.py`).
- **[especificado]** **Nós federados**: cada instituição (biblioteca, universidade, arquivo, comunidade) opera um nó com seu próprio livro-razão. Nós trocam eventos assinados; o hash da cabeça permite verificar a sincronização. Divergências entre nós não são "resolvidas" apagando um lado: viram afirmações concorrentes com proveniência distinta.
- **[especificado]** **Identificadores persistentes** (ARK, DOI ou w3id) para cada entidade; correspondências `sameAs` com Wikidata, ORCID, ROR, OpenAlex.
- **[especificado]** **Endpoint SPARQL** e API REST somente-leitura; *dumps* periódicos completos sob CC0 para metadados.
- **[especificado]** **Cópias distribuídas** (instituições em jurisdições diferentes + armazenamento endereçado por conteúdo) para independência de qualquer empresa ou governo.

---

## 10. Governança [especificado]

1. **Revisão especializada por área**: cada nó da árvore tem um conselho editorial que pode homologar, contestar ou rebaixar verificações automáticas.
2. **Contestação pública**: qualquer pessoa abre uma contestação contra uma afirmação, relação ou verificação. A contestação é ela mesma uma entidade com proveniência e entra no índice como oposição até ser julgada.
3. **Direito de resposta e apelação** para autores e comunidades afetados, com prazos e registro público da decisão.
4. **Critérios públicos e versionados**: pesos, limiares e fórmula (§6) vivem no repositório; toda mudança é discutida em aberto e cada verificação registra a versão da regra usada (`regra: verificacao:8-camadas-v1`).
5. **Independência**: financiamento misto (público, filantrópico, comunitário), nenhum financiador com poder sobre conteúdo, auditorias externas anuais de viés e cobertura.

---

## 11. Riscos e salvaguardas

| Risco | Salvaguarda |
|---|---|
| Viés de seleção (línguas, países, instituições dominantes) | Métricas de cobertura por idioma/região/tipo de fonte publicadas a cada versão; metas explícitas de cobertura; nós regionais com autonomia editorial |
| Falsa neutralidade | Curador compara suporte (§7); "controverso" nunca implica equivalência |
| Concentração de poder | Federação (§9), livro-razão auditável, governança plural (§10) |
| Direitos autorais | O Atlas guarda **metadados, afirmações, localizadores, trechos curtos e hashes** — não o texto integral de obras protegidas; o acesso ao texto aponta para a fonte licenciada |
| Privacidade | Dados pessoais sensíveis fora do grafo público; afirmações sobre pessoas vivas seguem política específica |
| Saberes indígenas e tradicionais | Princípios **CARE** (Collective benefit, Authority to control, Responsibility, Ethics) ao lado dos FAIR; campo de licença comunitária; consentimento e governança da própria comunidade; possibilidade de registros de acesso restrito |
| Automação excessiva / alucinação | Separação propositor/verificador, assinatura por versão de agente, reversão em lote, revisão humana obrigatória em áreas sensíveis |
| Dependência tecnológica | Formatos abertos (SQLite, JSON-LD, Turtle), zero dependências externas no núcleo, cópias distribuídas |

---

## 12. Roteiro

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **1 — Protótipo** *(este repositório)* | Modelo de dados, livro-razão, 8 agentes com permissões, verificação em 8 camadas, índice de robustez, curadoria, trilha/caminho/linhagem/investigação, exportação RDF, semente de 3 eixos (vida, entropia, conhecimento) | Testes passando; auditoria íntegra |
| **2 — Validação** | Extrator/Classificador com LLM como propositores; importação em massa via OpenAlex/Crossref/Wikidata para um recorte (ex.: história da ciência no Brasil); interface web; revisão por especialistas | Precisão de extração auditada por amostragem; concordância verificador × especialistas medida e publicada |
| **3 — Federação** | Protocolo de nós, troca de eventos assinados, SPARQL, identificadores persistentes, espelhos | ≥ 3 nós institucionais independentes sincronizados |
| **4 — Institucionalização** | Governança formal, financiamento independente, auditorias externas, educação para leitura de evidência | Conselho constituído; primeira auditoria externa publicada |

---

## 13. Pergunta de pesquisa

*Como construir uma infraestrutura de conhecimento que torne visíveis as fontes, os métodos, as controvérsias e as transformações históricas do saber, sem reduzir a complexidade do conhecimento a uma única narrativa?*

Hipótese operacional deste protótipo: representar o conhecimento como **rede de afirmações com evidência ponderada, oposições explícitas e história imutável** permite responder a perguntas com o percurso completo — e expor, com a mesma honestidade, o que ainda não se sabe ou não foi registrado.
