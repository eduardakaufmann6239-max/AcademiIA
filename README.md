# AcademiIA · Corpo Digital Multiagente

Protótipo de um **corpo humano digital baseado em agentes de IA**: cada agente representa um nível biológico, e um agente supervisor (inspirado no conceito *Full-Body AI Agent*) divide a tarefa, coleta as respostas, resolve conflitos e entrega uma explicação integrada.

Recorte do protótipo: **regulação da glicemia e risco de diabetes tipo 2**, com efeitos no coração, nos rins e na inflamação.

> Modelo educacional. Coeficientes simplificados, não validados clinicamente. Não é diagnóstico nem recomendação de tratamento.

## Como rodar

Não há build nem dependências.

```bash
python3 -m http.server 8000   # abra http://localhost:8000
node --test tests/*.test.mjs  # 7 testes do núcleo de simulação
```

## Arquitetura

| Agente | Função no protótipo | Modelo usado |
|---|---|---|
| Ético e de segurança | Valida entradas, sinaliza extrapolações, impõe avisos | Faixas de validade por variável |
| Estilo de vida | Traduz sono, exercício, dieta, estresse em moduladores | Fatores multiplicativos + peso de equilíbrio |
| Imunológico | Estima PCR e seu efeito na sensibilidade à insulina | Regressão simplificada |
| Endócrino | Cortisol/ritmo circadiano e reserva de células beta | Declínio por idade, histórico e glicotoxicidade |
| Medicamentos | Aplica metformina/anti-hipertensivo, bloqueia contraindicação (TFGe < 30) | Regras farmacológicas |
| Metabólico | Simula 24 h de glicose e insulina, minuto a minuto | Modelo mínimo tipo Bergman; HbA1c pela fórmula ADAG; HOMA-IR |
| Cardiovascular | Pressão sistólica e risco ilustrativo em 10 anos | Regressão + logística ilustrativa |
| Renal | TFGe e declínio anual | Regras por idade, glicemia e pressão |
| **Supervisor** | Orquestra, integra, compara cenários, projeta 5 anos, estima incerteza | Ensemble de 40 simulações (±15% em SI e reserva beta) |

Fluxo por ano simulado: `Ético → Estilo de vida → Imunológico → Endócrino → Medicamentos → Metabólico → Cardiovascular → Renal → Supervisor`. Cada agente publica mensagens no log, que aparece na interface como "conversa entre os agentes".

```
src/agents.js   núcleo: agentes, supervisor, ensemble (funções puras, testáveis)
src/app.js      interface: controles, mapa corporal, gráficos SVG, log
index.html      página e estilos
tests/          testes de calibração e comportamento (node:test)
docs/proposta.md proposta de pesquisa completa
```

## O que a interface mostra

- Estado integrado hoje e em 5 anos, nos dois cenários (atual e intervenção)
- Mapa corporal com o estado de cada órgão
- Ranking dos fatores que mais reduzem a sensibilidade à insulina
- Curva de glicose em 24 h comparando os cenários
- Projeção de HbA1c e pressão em 5 anos com faixa de incerteza
- Log das mensagens trocadas entre os agentes

## Próximos passos

Ver `docs/proposta.md`, seção "Roteiro": validação com dados públicos (NHANES), calibração dos coeficientes, agente de linguagem (LLM) para explicações e perguntas abertas, e revisão por profissionais de saúde.
