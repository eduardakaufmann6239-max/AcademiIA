# Sociedade de agentes: a ideia desenvolvida ao máximo

> Inteligência não é uma substância que um sistema possui, e sim uma propriedade
> da forma como suas partes se organizam. A pergunta deixa de ser "quão
> inteligente é cada agente?" e passa a ser "sob quais regras agentes limitados
> produzem juntos algo melhor que qualquer um deles e quando produzem algo pior?".

---

## 1. Tese, em forma precisa

**Uma sociedade de agentes é um sistema de unidades autônomas, especializadas e
interdependentes que, por meio de canais de comunicação, memória compartilhada,
normas e incentivos, produz capacidades que nenhuma unidade isolada tem. Essa
capacidade coletiva não é garantida: ela depende de quatro condições estruturais
(diversidade, independência, agregação e responsabilização). Quando alguma
falta, a mesma arquitetura que gera inteligência passa a gerar erro amplificado.**

O texto original resumia isso como "inteligência coletiva ≠ soma das capacidades
individuais". A desigualdade é verdadeira, mas vaga. Existe uma forma exata para
o caso das estimativas, o **teorema da predição pela diversidade** (Page, 2007):

$$
\underbrace{(c-\theta)^2}_{\text{erro coletivo}}
\;=\;
\underbrace{\frac{1}{n}\sum_i (s_i-\theta)^2}_{\text{erro individual médio}}
\;-\;
\underbrace{\frac{1}{n}\sum_i (s_i-c)^2}_{\text{diversidade}}
$$

onde $\theta$ é a verdade, $s_i$ a estimativa do agente $i$ e $c$ a média do
grupo. É uma identidade algébrica, não uma hipótese. Duas consequências:

1. **O coletivo nunca erra mais que o indivíduo médio.** A diversidade é sempre
   ≥ 0.
2. **Diversidade vale tanto quanto competência.** Reduzir a dispersão das
   opiniões (por imitação, pressão ou homogeneidade de origem) piora o grupo,
   mesmo que nenhum indivíduo piore.

O experimento 2 deste repositório verifica a identidade com resíduo de ordem
$10^{-14}$ (ver §8).

---

## 2. Genealogia: de onde vem a ideia

| Ano | Marco | Contribuição |
|---|---|---|
| 1785 | Condorcet, *teorema do júri* | Votantes independentes, cada um com mais de 50% de acerto: a maioria acerta com probabilidade que tende a 1 quando o grupo cresce. Exige independência. |
| 1907 | Galton, *Vox populi* | A mediana dos palpites de uma multidão sobre o peso de um boi ficou a menos de 1% do valor real. |
| 1945 | Hayek, *The Use of Knowledge in Society* | O conhecimento econômico está disperso. Preços funcionam como protocolo de agregação sem planejador central. |
| 1959 | Selfridge, *Pandemonium* | Reconhecimento de padrões feito por "demônios" que gritam mais alto quanto mais evidência veem. É a primeira arquitetura de agentes em competição. |
| 1973 | Hewitt et al., *modelo de atores* | Computação como troca de mensagens entre entidades autônomas, sem estado compartilhado implícito. |
| 1980 | Erman et al., *Hearsay-II* | Arquitetura de **quadro-negro**: especialistas independentes leem e escrevem numa memória comum. |
| 1980 | Smith, *Contract Net* | Tarefas anunciadas e alocadas por **leilão** entre agentes. |
| 1986 | **Minsky, *The Society of Mind*** | A mente como sociedade de processos sem mente própria. O "eu" é efeito, não comandante. |
| 1986 | Brooks, *arquitetura de subsunção* | Robôs inteligentes construídos com camadas simples que se inibem mutuamente, sem modelo central do mundo. |
| 1988 | Baars, *espaço de trabalho global* | A consciência como transmissão: muitos processos especializados competem pelo acesso a um canal comum. |
| 1990 | Ostrom, *Governing the Commons* | Comunidades se autogovernam sem Estado nem mercado quando há regras de monitoramento e sanção graduada. |
| 1992 | Bikhchandani, Hirshleifer & Welch | **Cascatas informacionais**: agentes racionais ignoram o próprio sinal e imitam os anteriores. |
| 2004 | Hong & Page | Grupos diversos de solucionadores podem superar grupos dos melhores. |
| 2010 | Woolley et al. | Existe um fator de inteligência coletiva em grupos humanos, pouco correlacionado à inteligência média dos membros. |
| 2011 | Lorenz et al. | A influência social reduz a diversidade e **mina** a sabedoria das multidões. |
| 2023 | Park et al.; Du et al. | Agentes de linguagem com memória e papéis simulam comportamento social; o debate entre modelos melhora a factualidade. |

Minsky não inventou a ideia do zero. Ele a levou para a escala da mente inteira.
A IA multiagente e a teoria institucional a levaram para a escala da engenharia
e da política.

---

## 3. Modelo formal mínimo

Uma sociedade de agentes é uma tupla

$$
\mathcal{S} = (A,\; C,\; M,\; N,\; I,\; G)
$$

| Símbolo | Componente | Pergunta que responde | Módulo no código |
|---|---|---|---|
| $A$ | **Agentes**: percepção, competência, política de ação | Quem age? | `sociedade/agente.py` |
| $C$ | **Canais**: mensagens tipadas, difusão ou ponto a ponto | Quem fala com quem? | `sociedade/mensagens.py` |
| $M$ | **Memória compartilhada** versionada | O que o grupo sabe e desde quando? | `sociedade/quadro.py` |
| $N$ | **Normas** verificáveis e sanções graduadas | O que é proibido e o que acontece com quem viola? | `sociedade/normas.py` |
| $I$ | **Incentivos e confiança**: reputação, leilão | Quem recebe a próxima tarefa e por quê? | `sociedade/reputacao.py`, `Sociedade.leiloar` |
| $G$ | **Agregação e registro**: voto, mediana, livro-razão | Como o grupo decide e quem responde pela decisão? | `Sociedade.votar`, `sociedade/registro.py` |

Um agente é $a = (P_a, K_a, \pi_a)$: o que ele percebe ($P_a$, os tipos de
mensagem em que se inscreve), o que sabe fazer ($K_a$) e como reage ($\pi_a$:
mensagem → mensagens). Nenhum agente altera outro diretamente. **Toda
influência passa por $C$ ou $M$**, e por isso toda influência é auditável.

### As quatro condições da inteligência coletiva

1. **Diversidade**: os erros dos agentes não podem ser os mesmos. Pelo teorema
   da §1, sem diversidade não há ganho.
2. **Independência**: cada agente forma o próprio juízo antes de ver o dos
   outros. Sem isso, a diversidade observada é falsa e as cascatas aparecem.
3. **Agregação adequada**: um mecanismo transforma juízos dispersos em decisão
   (média, mediana, voto, preço, leilão). Agregadores robustos, como a mediana,
   resistem a manipuladores.
4. **Responsabilização**: cada decisão tem uma cadeia causal rastreável até
   agentes concretos. Sem isso, o sistema não aprende com os erros e ninguém
   responde por eles.

As três primeiras são as condições clássicas da "sabedoria das multidões"
(Surowiecki, 2004). A quarta é o que transforma uma multidão em **instituição**.

---

## 4. Os três níveis, e por que são o mesmo problema

| Nível | Agentes | Canais | Memória | Normas | Agregação |
|---|---|---|---|---|---|
| **Cognitivo** | processos neurais especializados | sinapses, oscilações | memória de trabalho | inibição mútua | competição pelo espaço de trabalho global |
| **Tecnológico** | modelos, programas, robôs | APIs, mensagens | quadro-negro, banco vetorial | políticas, *guardrails* | votação, juiz, leilão |
| **Social** | pessoas, empresas, órgãos públicos | linguagem, imprensa, mercado | arquivos, ciência, direito | constituição, leis, contratos | eleições, preços, tribunais |

A tabela mostra um **isomorfismo de problemas de projeto**. Todos os três níveis
enfrentam as mesmas perguntas:

- como especializar sem fragmentar;
- como coordenar sem centralizar;
- como aproveitar o desacordo sem paralisar;
- como impedir que um subsistema capture o todo;
- como atribuir responsabilidade num sistema sem comandante.

Por isso as soluções migram entre os níveis. O leilão de tarefas vem da
economia, a separação de poderes vem da ciência política, a inibição lateral
vem da neurociência, e as três funcionam em software.

---

## 5. Princípios de engenharia

Cada princípio abaixo está implementado e testado neste repositório.

| # | Princípio | Mecanismo | Falha que previne |
|---|---|---|---|
| 1 | **Especialização com interface estreita** | agentes só veem os tipos de mensagem em que se inscrevem | acoplamento total, em que um erro contamina tudo |
| 2 | **Influência só por canais explícitos** | agentes devolvem mensagens e não alteram uns aos outros | efeitos ocultos impossíveis de auditar |
| 3 | **Memória comum versionada** | o quadro nunca apaga, só acrescenta | revisionismo e perda de contexto |
| 4 | **Normas verificáveis antes da entrega** | a `Constituicao` julga cada mensagem | afirmações sem fonte circulando como fatos |
| 5 | **Separação de poderes** | quem produz não aprova | autovalidação |
| 6 | **Sanções graduadas** | violação reduz a reputação, e a reincidência suspende o agente | punição tudo-ou-nada, ou nenhuma punição |
| 7 | **Confiança baseada em histórico verificado** | reputação Beta, em que falhas pesam mais que acertos | o mais autoconfiante sempre vence |
| 8 | **Alocação por mérito demonstrado** | leilão ponderado: autoavaliação × confiança | captura das tarefas por agentes ruins e barulhentos |
| 9 | **Transparência das sanções** | toda violação é anunciada publicamente (`norma_violada`) | o restante do grupo não reage ao problema |
| 10 | **Responsabilização causal** | livro-razão encadeado por hash, com `cadeia_causal(id)` | o problema das muitas mãos |

---

## 6. Como sociedades de agentes falham

| Patologia | Mecanismo | Exemplo | Contramedida |
|---|---|---|---|
| **Cascata informacional** | cada agente imita o consenso visível e descarta o próprio sinal | bolhas financeiras, viralização de boatos | juízo independente registrado antes da exposição; agregação cega |
| **Erro correlacionado** | agentes treinados nos mesmos dados erram juntos | vários modelos de IA com o mesmo viés "concordam" | diversidade real de fontes, métodos e modelos |
| **Pensamento de grupo** | pressão por consenso suprime a divergência | comitês que aprovam decisões que ninguém defendia | advogado do diabo com papel formal; voto secreto |
| **Ataque Sybil** | um ator cria muitas identidades para dominar o voto | contas falsas em redes sociais | peso por reputação verificada, não por número de identidades |
| **Captura do canal** | um agente monopoliza a atenção | *spam*, inundação de mensagens | limite de voz (`limite_de_voz`) |
| **Carona** (*free-riding*) | agentes se beneficiam sem contribuir | membros que não revisam, mas assinam | contribuição registrada e atrelada à reputação |
| **Lei de Goodhart** | a métrica vira alvo e deixa de medir | agente otimiza "aprovado pelo verificador" e não a verdade | verificação por terceiro independente; métricas múltiplas |
| **Muitas mãos** | o dano emerge e ninguém é individualmente culpado | acidentes em sistemas sociotécnicos | livro-razão causal e papéis com dono |
| **Assimetria de poder** | alguns agentes concentram dados e influência | plataformas que moldam o debate | limites, auditoria externa, interoperabilidade |

A lição central: **descentralização é condição necessária, não suficiente.** Uma
multidão sem instituições não é sábia, é só numerosa.

---

## 7. Governança: Ostrom traduzida para agentes

Os oito princípios de Ostrom (1990) para a gestão duradoura de bens comuns se
aplicam quase literalmente a sociedades de agentes artificiais:

| Princípio de Ostrom | Tradução para sociedades de agentes |
|---|---|
| 1. Fronteiras bem definidas | registro explícito de quem é agente e de quais recursos usa |
| 2. Regras adequadas às condições locais | normas específicas por tipo de tarefa, sem regra única global |
| 3. Arranjos de escolha coletiva | os agentes afetados participam da revisão das normas, por voto ponderado |
| 4. Monitoramento | auditoria contínua por verificadores independentes |
| 5. Sanções graduadas | reputação decrescente → suspensão → exclusão |
| 6. Resolução de conflitos acessível | mecanismo barato de contestação e recurso |
| 7. Direito reconhecido de se organizar | autoridade externa (o humano responsável) reconhece as regras internas |
| 8. Organização em camadas | sociedades dentro de sociedades, cada nível com as próprias normas |

A pergunta política do texto original, *como obter coordenação sem destruir a
autonomia?*, tem aqui uma resposta operacional: **autonomia na ação, restrição
na interface.** Cada agente decide livremente o que fazer, mas tudo o que ele
comunica passa por normas públicas, fica registrado e afeta a reputação dele.

---

## 8. Evidência: o que os experimentos deste repositório mostram

### Experimento 1: uma sociedade escreve uma redação (`python -m experimentos.redacao`)

Seis agentes (planejador, pesquisadora rigorosa, pesquisador apressado e
autoconfiante, verificador, redator, crítico) produzem uma redação com fontes.
Ninguém comanda.

- O **pesquisador apressado** dá lances altos (0,95) e ganha os primeiros
  leilões. Ele esquece fontes e inventa uma referência. A norma bloqueia as
  afirmações sem fonte, o verificador rejeita a referência inventada, a
  reputação dele cai e **as tarefas migram sozinhas** para a pesquisadora
  rigorosa (reputação final: 0,36 contra 0,75).
- O **redator tenta aprovar o próprio rascunho**. A separação de poderes bloqueia
  a tentativa e a aprovação válida vem do crítico.
- A aprovação final tem uma **trilha causal completa** até o pedido original da
  usuária, incluindo as tentativas rejeitadas, e o livro-razão é verificável por
  hash.

Resultado: um texto em que toda afirmação tem fonte verificada, produzido apesar
de um membro pouco confiável. A correção não veio de um chefe: veio de
**instituições** (norma, verificação, reputação, leilão).

### Experimento 2: quando muitos são sábios e quando não (`python -m experimentos.emergencia`)

50 agentes estimam um valor θ = 100. Erro absoluto médio em 400 rodadas:

| Cenário | Erro |
|---|---|
| Teorema da diversidade (uma população) | 0,74 = 426,06 − 425,32 (resíduo 6×10⁻¹⁴) |
| Indivíduo típico, população diversa | 17,94 |
| **Coletivo (mediana), população diversa** | **3,08** |
| Coletivo, população homogênea (viés comum +15) | 15,10 |
| Independentes, média | 2,32 |
| Imitação do consenso (peso 0,8), média | 8,47 |
| Imitação + 3 manipuladores falando primeiro | **34,93** |
| **Norma de independência + mediana**, com os mesmos 3 manipuladores | **3,30** |

Leitura:

1. Com diversidade, o coletivo é **cerca de 6× mais preciso** que o indivíduo
   típico.
2. Um viés compartilhado **não se cancela**. Mil agentes enviesados igualmente
   valem um.
3. A imitação **multiplica o erro por 3,6**, mesmo sem nenhum agente malicioso
   (como em Lorenz et al., 2011).
4. Três manipuladores numa população que imita produzem um erro **15× maior**.
   A mesma população, sob a regra "juízo independente antes de ver os outros" e
   agregada pela mediana, volta ao patamar de 3,3.

A quarta linha é a tese inteira em um número: **a mesma sociedade, com os
mesmos agentes, é sábia ou tola conforme as regras.**

---

## 9. Para redação (ENEM, vestibular, ensaio)

**Tese:**
A ideia de sociedade de agentes mostra que inteligência, ordem social e inovação
não nascem de indivíduos isolados nem de um poder central, mas da interação
organizada entre agentes diversos. Essa interação, porém, só produz sabedoria
sob regras que garantam independência de juízo, diversidade e responsabilização.
Sem elas, produz cascatas de desinformação e poder concentrado.

**Estrutura:**

1. **Introdução**: a pergunta "como partes limitadas produzem um todo
   inteligente?", com Minsky e a mente como sociedade.
2. **D1, a emergência**: o teorema da diversidade (o erro coletivo é o erro
   individual menos a diversidade) e Galton.
3. **D2, a aplicação**: IA multiagente (leilões, verificação mútua, debate entre
   modelos) e o paralelo com instituições humanas (Hayek, Ostrom).
4. **D3, o contra-argumento**: cascatas informacionais e influência social
   (Lorenz et al., 2011). A descentralização sem regras amplifica o erro.
5. **Conclusão com proposta de intervenção**: o agente é o Estado, junto com as
   plataformas e as universidades. A ação é exigir auditoria independente,
   rastreabilidade das decisões automatizadas e mecanismos que preservem a
   diversidade de fontes. O meio é a regulação e a educação midiática. A
   finalidade é que a inteligência coletiva, humana e artificial, sirva à
   liberdade e ao bem comum.

**Conclusão-modelo:**
Nenhuma inteligência é verdadeiramente isolada. O pensamento, os sistemas
artificiais e as sociedades políticas são tecidos por unidades que, sozinhas,
são limitadas. Mas a interação não basta: a mesma rede que agrega saber também
propaga boatos, e a diferença entre as duas está nas regras. O desafio do
século XXI, portanto, não é apenas criar agentes mais inteligentes. É desenhar
instituições que mantenham sábias as sociedades de agentes, humanos e máquinas.

---

## 10. Correções ao texto de partida

- "Um único **formigamento**" deve ser "uma única **formiga**".
- A referência [6] (*The society of intelligent veillance*, IEEE) trata de
  vigilância e não sustenta a afirmação sobre Minsky à qual estava ligada.
- As referências [7]/[23] (Springer, s44227-026-…) não puderam ser verificadas
  aqui. Antes de citá-las, confirme autor, título e ano.
- "Inteligência coletiva ≠ soma" foi substituída pela identidade exata da §1,
  que pode ser verificada e testada.

---

## Referências

- Baars, B. J. (1988). *A Cognitive Theory of Consciousness*. Cambridge University Press.
- Bikhchandani, S., Hirshleifer, D., & Welch, I. (1992). A theory of fads, fashion, custom, and cultural change as informational cascades. *Journal of Political Economy*, 100(5).
- Brooks, R. (1986). A robust layered control system for a mobile robot. *IEEE Journal on Robotics and Automation*, 2(1).
- Condorcet, Marquis de (1785). *Essai sur l'application de l'analyse à la probabilité des décisions rendues à la pluralité des voix*.
- Du, Y., Li, S., Torralba, A., Tenenbaum, J. B., & Mordatch, I. (2023). Improving factuality and reasoning in language models through multiagent debate. arXiv:2305.14325.
- Erman, L. D., Hayes-Roth, F., Lesser, V. R., & Reddy, D. R. (1980). The Hearsay-II speech-understanding system. *ACM Computing Surveys*, 12(2).
- Galton, F. (1907). Vox populi. *Nature*, 75.
- Hayek, F. A. (1945). The use of knowledge in society. *American Economic Review*, 35(4).
- Hewitt, C., Bishop, P., & Steiger, R. (1973). A universal modular ACTOR formalism for artificial intelligence. *IJCAI*.
- Hong, L., & Page, S. E. (2004). Groups of diverse problem solvers can outperform groups of high-ability problem solvers. *PNAS*, 101(46).
- Lorenz, J., Rauhut, H., Schweitzer, F., & Helbing, D. (2011). How social influence can undermine the wisdom of crowd effect. *PNAS*, 108(22).
- Minsky, M. (1986). *The Society of Mind*. Simon & Schuster.
- Ostrom, E. (1990). *Governing the Commons*. Cambridge University Press.
- Page, S. E. (2007). *The Difference*. Princeton University Press.
- Park, J. S., et al. (2023). Generative agents: Interactive simulacra of human behavior. arXiv:2304.03442.
- Selfridge, O. G. (1959). Pandemonium: A paradigm for learning. *Symposium on the Mechanization of Thought Processes*.
- Smith, R. G. (1980). The contract net protocol. *IEEE Transactions on Computers*, C-29(12).
- Surowiecki, J. (2004). *The Wisdom of Crowds*. Doubleday.
- Thompson, D. F. (1980). Moral responsibility of public officials: The problem of many hands. *American Political Science Review*, 74(4).
- Wooldridge, M. (2009). *An Introduction to MultiAgent Systems* (2ª ed.). Wiley.
- Woolley, A. W., Chabris, C. F., Pentland, A., Hashmi, N., & Malone, T. W. (2010). Evidence for a collective intelligence factor in the performance of human groups. *Science*, 330(6004).
