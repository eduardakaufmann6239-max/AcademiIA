# Proposta de pesquisa

## Título

**Arquitetura multiagente de inteligência artificial para modelagem multiescalar da fisiologia humana e medicina de precisão**

Versão para apresentação: *Corpo Humano Digital Multiagente: IA e agentes autônomos para simular, monitorar e prever o funcionamento integrado do organismo.*

## Problema

Uma alteração molecular pode afetar células, tecidos, órgãos e o organismo inteiro, mas modelos tradicionais estudam cada nível separadamente. Isso dificulta entender como uma inflamação, um medicamento ou um hábito se propaga pelo corpo.

## Pergunta de pesquisa

> Até que ponto uma arquitetura multiagente de IA, integrando dados moleculares, fisiológicos, comportamentais e clínicos, pode prever de forma confiável e ética alterações no funcionamento do corpo humano e apoiar a prevenção personalizada de doenças?

Pergunta operacional do protótipo: *um sistema de agentes especializados, coordenados por um supervisor, consegue reproduzir a progressão de pré-diabetes para diabetes tipo 2 e estimar o efeito de mudanças de estilo de vida e de medicamentos, com incerteza explícita?*

## Hipóteses

1. Decompor o corpo em agentes por nível biológico produz explicações mais rastreáveis do que um modelo único: cada conclusão pode ser atribuída a um agente e a uma mensagem.
2. Integrar sono, estresse e inflamação melhora a estimativa de risco metabólico em comparação com usar só peso e glicemia.
3. A faixa de incerteza (ensemble) captura a variabilidade individual melhor do que uma previsão pontual.

## Objetivos

**Geral:** desenvolver e avaliar um sistema multiagente que represente o corpo como rede de subsistemas interconectados.

**Específicos:**
- Simular glicemia, pressão arterial, inflamação e função renal.
- Mostrar como a alteração em um subsistema afeta os outros.
- Comparar cenários (rotina atual vs. intervenção) em horizonte de 5 anos.
- Explicar cada resultado com evidências, incertezas e limites.
- Gerar hipóteses testáveis.

## Arquitetura completa (visão de longo prazo)

| Agente | Função | Dados |
|---|---|---|
| Molecular | Genes, proteínas, metabólitos | Ômicas, marcadores sanguíneos |
| Celular | Sinalização, morte celular, resposta imune | Microscopia, citometria |
| Tecidos | Interação entre células | Histologia, imagem |
| Órgãos | Coração, pulmões, rins, fígado, cérebro, intestino | ECG, espirometria, exames |
| Sistemas | Cardiovascular, nervoso, endócrino, imune, digestório | Sinais vitais, wearables |
| Corporal (supervisor) | Integra tudo, resolve conflitos | Prontuário, dados longitudinais |
| Medicamentos | Efeitos, interações, doses | Farmacologia, farmacogenômica |
| Estilo de vida | Sono, alimentação, exercício, estresse | Wearables, questionários |
| Ético e de segurança | Privacidade, vieses, limites | Regulamentação, auditoria |

O protótipo implementa uma versão reduzida dessa arquitetura (ver README): os agentes molecular, celular e de tecidos aparecem agregados nos agentes imunológico, endócrino e metabólico.

## Metodologia

**Fase 1 — Fundamentação.** Fisiologia (homeostase, metabolismo da glicose, inflamação), IA e agentes autônomos, gêmeos digitais, biologia de sistemas.

**Fase 2 — Escopo.** Glicemia e risco de diabetes tipo 2 (concluído no protótipo).

**Fase 3 — Protótipo.** Agentes com funções delimitadas, supervisor, interface explicativa (concluído).

**Fase 4 — Validação.**
- Calibrar coeficientes com dados públicos e anonimizados (NHANES: glicemia, HbA1c, insulina, PCR, pressão, sono, atividade física).
- Comparar previsões com valores reais: erro absoluto médio para HbA1c e PAS; sensibilidade e especificidade para classificar pré-diabetes e diabetes.
- Testar generalização por subgrupos (idade, sexo, raça/cor, renda) para detectar vieses.
- Revisão dos casos por professores ou profissionais de saúde.

**Fase 5 — Ética e limites.** Dados anonimizados e com consentimento; auditoria de vieses; incerteza sempre visível; deixar claro que a IA não substitui diagnóstico.

## Roteiro técnico

1. Ajustar os coeficientes por regressão usando NHANES (substituir os valores de literatura simplificada).
2. Adicionar um agente de linguagem (LLM) que receba o log dos agentes e responda perguntas abertas ("o que acontece se eu dormir 7 horas?") sem inventar números: ele só pode citar valores produzidos pelos agentes.
3. Novos módulos: sono e função cardiovascular; interação medicamento × função renal; asma.
4. Entrada de dados de wearables (sono, frequência cardíaca, passos).

## Limitações

- O corpo é mais complexo do que qualquer modelo atual; o protótipo usa relações simplificadas.
- Dados genéticos e clínicos são sensíveis.
- Viés algorítmico se os dados de treino sub-representarem grupos.
- Previsão errada pode induzir decisões inadequadas, por isso o sistema é apoio, não decisão.
- Custo e desigualdade de acesso.
- Simulação não substitui estudos clínicos.
- O *Full-Body AI Agent* é hoje um conceito e plano de pesquisa, não uma plataforma clínica.

## Produtos

- Protótipo de software (este repositório)
- Artigo de iniciação científica
- Apresentação para feira de ciências ou olimpíada científica
- Proposta para laboratório ou universidade

## Referências a conferir

As referências abaixo vieram do texto original da ideia e **precisam ser verificadas** (título, autores, ano e link) antes de entrar em qualquer trabalho:

1. A Multi-Layered Framework for Modeling Human Biology — PMC12407623 / PubMed 40909157
2. Full-Body AI Agent: A Perspective on Multi-Scale Collaborative AI for Systemic Biology and Precision Medicine — PubMed 42189114 / PMC13317560
3. Organ-Agents: Virtual Human Physiology Simulator (sepse)
4. Morpheus.AI — arXiv 2611.05413
5. Empowering Biomedical Discovery with AI Agents — Cell, 2024 (arXiv 2404.02831)
6. Artificial Intelligence agents for biological research: a survey — PMC12936789

Base dos modelos do protótipo: Bergman et al. (1979), modelo mínimo da glicose; Nathan et al. (2008), estudo ADAG (HbA1c × glicose média); Matthews et al. (1985), HOMA-IR.
