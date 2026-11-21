# Conhecimento Explicado — estúdio de vídeos 3D com agentes de IA

**Ciência. Tecnologia. Educação. Sociedade.**
Uma plataforma de educação visual que explica ciências, tecnologia, sistemas, sociedade e conteúdos acadêmicos com **animações 3D curtas (Reels/Shorts/TikTok, 9:16) e longas (YouTube, 16:9)**, produzidas por uma equipe de agentes de IA.

Dois objetivos: **ensinar a compreender o mundo** e **ajudar a conquistar domínio acadêmico (ENEM)**.

## A equipe de agentes

```
PAUTA            PRÉ-PRODUÇÃO                          PRODUÇÃO             PÓS-PRODUÇÃO                 MATERIAL
Editor de pauta → Roteirista → Designer → Qualidade ─► Produtor de Vídeo ─► Revisor do Vídeo Final ─► Resumidor (PDF)
(rodízio +           ▲            ▲          │              ▲                     │
 favoritos)          └────────────┴ correções┘              └────── correções ────┘
                                                                         Autor (livros, às vezes) · Analista (métricas)
```

| Agente | O que faz |
|---|---|
| **Editor de pauta** | Calendário com **conteúdo alternado** (nunca 2 dias seguidos do mesmo pilar/série) e **subtemas favoritos** primeiro. |
| **Roteirista** | Escreve o roteiro com o método de retenção (gancho → curiosidade → explicação → demonstração → revelação → fechamento), rigor e fontes reais. |
| **Designer** | Escolhe os elementos 3D, câmera, cores e ritmo — quebra de padrão a cada 3–5 s. |
| **Qualidade** | Checa fatos, didática, **nota de retenção** (≥ 8 para aprovar) e olha quadros de prévia renderizados. Reprova e devolve correções. |
| **Produtor de Vídeo** | Usa ferramentas reais: gera narração, renderiza, **assiste ao MP4**, ajusta câmera/tempo e entrega. |
| **Revisor do Vídeo Final** | Controle de qualidade independente do MP4 pronto: ~30 quadros + verificações automáticas (quadros pretos, silêncios, duração, resolução). |
| **Resumidor** | PDF de estudo de qualquer material ou vídeo: resumo hierárquico, **mapa mental**, **ilustrações 3D**, conceitos-chave, ENEM, fichas e questões — marcando a **origem** de cada informação. |
| **Autor** | De vez em quando (livro do mês), escreve um **livro digital** ilustrado, revisado pela Qualidade. |
| **Analista** | Lê as métricas reais (retenção, conclusão, ponto de abandono) e gera lições usadas nos próximos roteiros. |

## Pilares e séries

**Pilares (9):** IA e Tecnologia · Economia e Negócios · Neurociência e Psicologia · Segurança e Gestão de Riscos · Educação Escolar · Sistemas e Pensamento Sistêmico · **ENEM e Preparação Acadêmica** · Medicina Tradicional Chinesa (com evidências e limites) · Conhecimento Interdisciplinar.

**Séries:** Como funciona? · Aprenda em 60 segundos · Você sabia? · Entenda o mundo · Conectando conhecimentos · Entenda o sistema (Estrutura → Organização → Funcionamento → Interdependência → Resultados) · ENEM em 1 minuto · Questão comentada · Por que essa alternativa está errada? · Redação nota 1000 · Conexões ENEM · Simulado relâmpago.

Perfil, regras editoriais e identidade visual ficam em [`perfil.json`](perfil.json); subtemas e favoritos em [`subtemas.json`](subtemas.json). Modelo editorial completo: [`docs/modelo-editorial.md`](docs/modelo-editorial.md).

## Instalação

Requisitos: Node 20+, `ffmpeg` e Chromium via Playwright.

```bash
npm install
npx playwright install chromium     # se ainda não tiver o Chromium do Playwright
export ANTHROPIC_API_KEY=...         # para os agentes (não precisa para renderizar roteiros prontos)
export ELEVENLABS_API_KEY=...        # opcional: narração com voz natural (sem ela: legendas + música)
```

## Uso rápido

```bash
# o que postar hoje (rodízio + favorito)
node src/cli.js proximo

# vídeo completo do zero com os agentes (roteiro → vídeo → revisão → PDF)
node src/cli.js criar "Como o ChatGPT escolhe a próxima palavra?" --pilar ia --serie como_funciona --formato curto

# pauta semanal alternada
node src/cli.js pauta --dias 7

# resumir qualquer material
node src/cli.js resumir apostila.pdf --modo provas --nivel medio

# livro digital
node src/cli.js livro --sugerir
node src/cli.js livro "Como funciona a economia" --capitulos 6 --pilar economia
```

Sem chave de API (offline): `render`, `previa`, `validar`, `verificar`, `exemplos`, `resumo` (direto do roteiro), `pauta --offline`, `proximo`, `subtemas`, `favoritar`, `livro --coletanea`.
Lista completa: `node src/cli.js --ajuda`.

### Comandos

| Comando | Descrição |
|---|---|
| `criar "<tema>"` | Os agentes criam, produzem, revisam e geram o PDF. Opções: `--formato curto\|longo`, `--pilar`, `--serie`, `--nivel`, `--qualidade padrao\|hd`. |
| `produzir <roteiro.json>` | Produtor + Revisor + Resumidor a partir de um roteiro pronto. |
| `render <roteiro.json>` | Renderização direta (sem IA). `--rapido`, `--hd`, `--sem-voz`. |
| `revisar <mp4> <roteiro>` / `verificar <mp4> <roteiro>` | Revisor com IA / só verificações automáticas. |
| `resumo <roteiro.json> [--video v.mp4]` | PDF de estudo do vídeo. |
| `resumir <arquivos...>` | Resumidor para PDF/TXT/MD/DOCX. `--modo fiel\|simplificado\|aprofundado\|comparativo\|estruturado\|provas`, `--nivel fundamental\|medio\|avancado`. |
| `livro "<tema>"` / `--sugerir` / `--coletanea` | Agente Autor. |
| `pauta`, `proximo`, `publicado <roteiro>` | Rodízio editorial e histórico. |
| `subtemas`, `favoritar`, `desfavoritar` | Curadoria de subtemas ★. |
| `aprender <metricas.csv>` | Analista de métricas (modelo em `docs/metricas-exemplo.csv`). |

## Como funciona por dentro

- **Roteiro (JSON)** — cenas com narração, texto na tela, câmera e elementos 3D. Formato e validação em [`src/roteiro.js`](src/roteiro.js).
- **Motor 3D** — [`src/render/cena.js`](src/render/cena.js) (Three.js) desenha qualquer instante de forma determinística; modo realista com iluminação PBR, bloom, vinheta e sombras suaves. Biblioteca com ~40 elementos: rede neural, cérebro com regiões, neurônio, sistema vivo com propagação de efeitos, questão de prova com contagem regressiva, gráficos, moedas, molécula, célula, onda, linha do tempo, yin-yang, escudo, cadeado, servidor, globo, cidade, estrutura de prédio etc.
- **Renderização** — [`src/render.js`](src/render.js) captura quadro a quadro no Chromium headless e codifica em MP4 (H.264) com ffmpeg; música de fundo sintetizada (sem direitos autorais) com *ducking* sob a narração.
- **Agentes** — Claude API (`@anthropic-ai/sdk`), modelo padrão `claude-opus-5-5` (troque com `MODELO_CLAUDE`), saídas estruturadas e *fallback* automático em caso de recusa.

## Exemplos prontos

`roteiros/exemplos/` — renderize todos com `node src/cli.js exemplos`:

| Roteiro | Pilar · série |
|---|---|
| `neuro-cerebro-engana` | Neurociência · Você sabia? |
| `sistemas-dinheiro-circula` | Sistemas · Entenda o sistema |
| `enem-simulado-porcentagem` | ENEM · Simulado relâmpago |
| `seguranca-phishing` | Segurança · Como funciona? |
| `mtc-artemisia-nobel` | Medicina chinesa · Você sabia? |
| `ia-como-aprende` | IA · Como funciona? |
| `longo-ia-do-neuronio-ao-chatgpt` | IA · Conectando conhecimentos (16:9) |
