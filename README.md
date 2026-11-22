# Rota: seu mapa de oportunidades estudantis

Catálogo curado de oportunidades nacionais e internacionais para estudantes brasileiros (olimpíadas, feiras, hackathons, intercâmbios, bolsas, cursos de verão, pesquisa, liderança e voluntariado), com **ranking personalizado e transparente** de compatibilidade e custo-benefício.

**Abrir:** `index.html` no navegador. Arquivo único, sem build, sem servidor e sem dependências.

## O que o MVP já faz

| Recurso | Descrição |
|---|---|
| Catálogo | 46 oportunidades com ficha padronizada: requisitos, custo real, janela de inscrição, benefícios, link oficial e status de verificação |
| Perfil | Nível, idade, inglês, orçamento, objetivo, áreas, escola pública e baixa renda. Fica salvo no navegador |
| Elegibilidade | Filtro rígido que mostra o motivo quando você não pode participar |
| Ranking | Duas notas: **compatibilidade (0–100)** e **custo-benefício (0–10)**, com o detalhamento em cada card |
| Filtros | Tipo, financiamento, nacional ou internacional, online ou presencial, busca e “abre nos próximos 60 dias” |
| Comparador | Até 3 oportunidades lado a lado |
| Calculadora de custo | Passagem, visto, seguro, passaporte, teste de idioma e reserva, com meta de poupança mensal |
| Checklist | Documentos que exigem antecedência, roteiro de candidatura e sinais de golpe |
| Exportação | CSV (abre no Excel) e JSON |

## Metodologia do ranking

A fórmula original dividia ganhos por `custo + tempo`, o que mistura unidades (reais e horas) e zera a nota de qualquer programa gratuito. O MVP corrige isso de três formas:

1. **Elegibilidade é filtro, não nota.** Nível, idade, inglês, exigência de escola pública e orçamento eliminam a oportunidade em vez de reduzir a pontuação.
2. **O tempo vira dinheiro.** O custo efetivo é o custo médio somado às horas de preparação multiplicadas pelo valor da hora do estudante (ajustável).
3. **Duas perguntas, duas notas.**

```
Compatibilidade = 100 × (0,35·Relevância + 0,25·Valor + 0,15·Chance + 0,25·Acessibilidade)
  Relevância     = 0,6·sobreposição de áreas + 0,4·aderência do tipo ao objetivo
  Valor          = (0,45·benefícios + 0,35·prestígio + 0,20·credibilidade) / 5
  Chance         = seletividade / 5            (1 = muito seletivo … 5 = aberto)
  Acessibilidade = 1 / (1 + custo efetivo / 3000)   (+0,15 se prioriza escola pública/baixa renda e você se encaixa)

Custo-benefício = 10 × Valor × (0,5 + 0,5·Chance) / (1 + log10(1 + custo efetivo / 500))
```

O logaritmo reflete o bolso real: a diferença entre R$ 0 e R$ 1.000 pesa mais que a diferença entre R$ 30.000 e R$ 31.000. As notas de 1 a 5 (prestígio, benefício, credibilidade, chance) são atribuídas pela curadoria e ficam visíveis nos dados.

## Curadoria

- Todo link aponta para a **fonte oficial**. Agregadores (Estudar Fora, Partiu Intercâmbio) servem para descobrir, nunca como fonte.
- Cada item tem um selo: `confirmado` (conferido no ciclo atual), `parcial` (programa e link oficiais, mas datas ou valores do ciclo anterior) ou `a verificar`.
- Custos = desembolso típico do estudante **selecionado**, em reais (US$ 1 ≈ R$ 5,50 em nov/2026).
- Confirmados em nov/2026: OBMEP 2026 (inscrições de 04/02 a 16/03, 1ª fase em 09/06, 2ª fase em 17/10), Yale Young Global Scholars (US$ 7.500, ajuda de até 100%, Early Action em 15/10/2026, Regular Decision em 06/01/2027) e CS50x.
- Ponto de atenção: Jovens Embaixadores e UWC ainda não publicaram edital com datas confirmadas para o próximo ciclo.

Para adicionar ou corrigir, edite o array `OPORTUNIDADES` no bloco `<script id="dados">` de `index.html`. Cada campo está documentado no comentário do topo.

## Próximos passos (roadmap)

| Fase | Entrega |
|---|---|
| 1 — feito | MVP estático, 46 oportunidades, ranking, comparador, calculadora |
| 2 — 1 mês | Chegar a 150+ itens (programas estaduais, universidades federais, empresas); verificar todos os itens marcados `a verificar`; formulário de correção (issues) |
| 3 — 2–3 meses | Dados em JSON ou planilha separada; robô que monitora mudanças nos sites oficiais e abre alerta para revisão humana; newsletter semanal “abertas agora” |
| 4 — 4–6 meses | Contas, alertas por e-mail/WhatsApp, exportação de prazos para calendário (.ics), relatos de participantes com custo real |
| 5 — 6–12 meses | Painel para escolas e orientadores (listas por turma), parcerias com secretarias de educação |

**Monetização sem perder a confiança:** o catálogo e o ranking continuam gratuitos. A receita vem de planos para escolas e orientadores, revisão opcional de candidaturas e divulgação **identificada** de editais legítimos, que nunca altera o ranking. Nunca cobrar por acesso a bolsa pública nem vender “aprovação garantida”.

**Privacidade (menores):** o MVP não coleta nada, e o perfil fica só no navegador do usuário. Quando houver contas, o plano é coletar o mínimo e pedir consentimento dos responsáveis, conforme a LGPD (art. 14).
