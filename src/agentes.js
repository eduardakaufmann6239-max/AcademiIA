// Equipe de pré-produção (Claude API): Roteirista, Designer e Qualidade, coordenados por um orquestrador.
//
//   tema ──► Roteirista ──► Designer ──► prévia 3D ──► Qualidade ──► aprovado? ──► Produtor
//                ▲              ▲                          │
//                └──────────────┴──── correções ◄──────────┘ (até N rodadas)
//
// Cada agente mantém a própria conversa (somente acréscimo), então lembra do que já fez
// e recebe as correções como continuação natural do trabalho.
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOGO, FORMATOS, FORMATO_ROTEIRO, METODO_RETENCAO,
  catalogoTexto, validar, analisarRetencao, planejarTempos, duracaoTotal,
} from './roteiro.js';

export const MODELO = process.env.MODELO_CLAUDE || 'claude-opus-5-5';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PERFIL_PADRAO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'perfil.json'), 'utf8'));

// Lições tiradas das métricas reais (gerado pelo agente Analista: `node src/cli.js aprender`).
export function aprendizados() {
  const arq = path.join(RAIZ, 'roteiros', 'aprendizados.md');
  return fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').trim() : '';
}

export const METODO_SISTEMAS = `PENSAMENTO SISTÊMICO (metodologia transversal do perfil): sempre que fizer sentido, mostre como as partes se conectam e formam o todo — interdependência, feedback, causalidade e efeitos indiretos — em vez de conceitos isolados.
Na série "entenda_o_sistema", siga os 5 passos (um ou mais por cena, na ordem): ESTRUTURA (quais são os componentes) → ORGANIZAÇÃO (como estão distribuídos) → FUNCIONAMENTO (como as partes interagem) → INTERDEPENDÊNCIA (como uma parte afeta as outras — use "perturbar" no elemento "sistema") → RESULTADOS (o que acontece quando o sistema muda). Encaixe esses passos dentro do método de retenção (o gancho continua sendo uma pergunta/surpresa; a interdependência costuma ser a revelação).`;

let _cliente;
const cliente = () => (_cliente ??= new Anthropic());
const textoDe = (msg) => msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');

function extrairJSON(texto) {
  const limpo = texto.replace(/```(?:json)?/g, '');
  const a = limpo.indexOf('{'), b = limpo.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Nenhum objeto JSON encontrado na resposta.');
  return JSON.parse(limpo.slice(a, b + 1));
}

// Um agente = prompt de sistema + histórico próprio.
export class Agente {
  constructor(nome, sistema, { esforco = 'high', log = () => {} } = {}) {
    this.nome = nome; this.sistema = sistema; this.esforco = esforco; this.log = log; this.mensagens = [];
  }

  async perguntar(conteudo, { formato } = {}) {
    this.mensagens.push({ role: 'user', content: conteudo });
    this.log(`  · ${this.nome} trabalhando...`);
    const msg = await cliente().beta.messages.stream({
      model: MODELO,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // se o modelo recusar, a API tenta automaticamente um modelo alternativo
      thinking: { type: 'adaptive' },
      output_config: { effort: this.esforco, ...(formato ? { format: formato } : {}) },
      system: this.sistema,
      messages: this.mensagens,
    }).finalMessage();
    this.mensagens.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'refusal') throw new Error(`${this.nome}: o modelo recusou a tarefa (${msg.stop_details?.category ?? 'sem categoria'}).`);
    if (msg.stop_reason === 'max_tokens') throw new Error(`${this.nome}: resposta cortada por limite de tokens.`);
    return textoDe(msg);
  }

  // Pede um roteiro JSON e insiste (mostrando os erros) até ele passar no validador técnico.
  async pedirRoteiro(conteudo, tentativas = 3) {
    let texto = await this.perguntar(conteudo);
    for (let i = 1; ; i++) {
      let roteiro, erros;
      try { roteiro = extrairJSON(texto); erros = validar(roteiro); } catch (e) { erros = [`JSON inválido: ${e.message}`]; }
      if (!erros.length) return roteiro;
      if (i >= tentativas) throw new Error(`${this.nome} não produziu um roteiro válido:\n- ${erros.join('\n- ')}`);
      this.log(`  · ${this.nome}: ${erros.length} problema(s) técnico(s), corrigindo...`);
      texto = await this.perguntar(`O roteiro tem problemas técnicos que impedem a renderização:\n- ${erros.join('\n- ')}\n\nDevolva o roteiro COMPLETO corrigido, apenas o JSON.`);
    }
  }
}

export function contextoPerfil(p = PERFIL_PADRAO) {
  const licoes = aprendizados();
  return `PERFIL: ${p.nome} (${p.arroba}) — "${p.slogan}"
Definição: ${p.definicao || ''}
Missão: ${p.missao}
Método de ensino (o que unifica todos os assuntos):
${p.metodo.map((m) => `- ${m}`).join('\n')}
Pilares (campo "pilar"):
${Object.entries(p.pilares).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Séries recorrentes (campo "serie"):
${Object.entries(p.series).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Níveis (campo "nivel"): ${Object.entries(p.niveis).map(([k, v]) => `${k} (${v})`).join('; ')}
Conectar disciplinas (campo "disciplinas"), por exemplo: ${Object.entries(p.conexoes_exemplo).map(([k, v]) => `${k} = ${v}`).join('; ')}
Objetivos: ${(p.objetivos || []).join(' e ')}.
ENEM: áreas ${Object.values(p.enem?.areas || {}).join('; ')}. Conecte o ENEM aos outros pilares (${Object.entries(p.enem?.conexoes_com_pilares || {}).map(([k, v]) => `${k}: ${v}`).join('; ')}). Alinhe à Matriz de Referência do INEP (preencha "enem.area", e competência/habilidade só quando tiver segurança). ${p.enem?.regra_questoes || ''}
Regras editoriais (obrigatórias):
${(p.regras_editoriais || []).map((r) => `- ${r}`).join('\n')}
Tom de voz: ${p.tom}
Não pareça uma página de curiosidades soltas: cada vídeo responde a uma pergunta, explica um mecanismo e entrega conhecimento verificável.${licoes ? `\n\nAPRENDIZADOS DAS MÉTRICAS REAIS DO PERFIL (aplique!):\n${licoes}` : ''}`;
}

const REGRAS_MOTOR = `Como o motor 3D funciona:
- Unidades em metros, eixo Y para cima, chão em y=0. Mantenha o conteúdo perto da origem (|x|,|z| ≤ 8, y ≤ 9).
- Elementos permanecem na tela nas cenas seguintes até serem listados em "remover". Remova o que não serve mais para não poluir.
- "atraso" (s) é relativo ao início da cena em que o elemento é criado. Distribua as entradas para acompanharem a narração.
- Câmera orbita o "alvo": "distancia" (m), "elevacao" (graus acima do horizonte), "azimute": [início, fim] em graus (gira durante a cena). A transição entre cenas é suave e automática.
- Formato curto (9:16): a tela é estreita — conteúdo com no máximo ~7 m de largura, camera.distancia entre 8 e 14. Formato longo (16:9): até ~16 m de largura, distancia 10–25.
- Narração: ~2,6 palavras por segundo; a duração de cada cena é calculada a partir dela (o campo "duracao" é um mínimo opcional).
- "texto_tela": no máximo 5 palavras (na cena de gancho ele aparece maior, em vermelho). "rotulo" para nomear coisas na cena (curto!). Série, nível e disciplinas aparecem automaticamente como selo no topo.
- Cores: hex (#e63946) ou nomes: destaque, azul, calor, frio, agua, isolamento, concreto, aco, madeira, vidro, grama, solo, asfalto.
- Uma trilha musical discreta é adicionada automaticamente.

Biblioteca de elementos (use SOMENTE estes tipos):
${catalogoTexto()}

Formato do roteiro (JSON):
${FORMATO_ROTEIRO}`;

export function criarEquipe({ perfil = PERFIL_PADRAO, log = console.log } = {}) {
  const ctx = contextoPerfil(perfil);
  const roteirista = new Agente('Roteirista', `Você é o roteirista-chefe do perfil educativo em vídeo descrito abaixo (Instagram/TikTok/YouTube).
${ctx}

Sua função: transformar um tema em um roteiro de vídeo 3D que ensine UMA ideia central com clareza E prenda a atenção do primeiro ao último segundo.

${METODO_RETENCAO}

${METODO_SISTEMAS}

Rigor:
- Só afirme o que é consenso científico ou bem documentado; números com ordem de grandeza correta e datados quando mudam com o tempo; cite fontes reais e verificáveis em "fontes" (nunca invente referências).
- Simplificar não é distorcer: se precisar simplificar, que a versão simples continue verdadeira.
- Temas políticos e econômicos: explique mecanismos e diferentes visões de forma equilibrada, sem tomar partido. Finanças e saúde: sem recomendação individual. Segurança: ensine a se proteger, nunca a atacar.
- Linguagem para leigos no nível pedido: troque jargão por analogia e, se o termo técnico for essencial, explique-o.
- Pense em como cada cena será MOSTRADA com a biblioteca de elementos — a imagem deve explicar, não só enfeitar.

${REGRAS_MOTOR}

Responda sempre com o roteiro completo em JSON (sem comentários fora do JSON).`, { esforco: 'high', log });

  const designer = new Agente('Designer', `Você é o diretor de arte e motion designer 3D do perfil "${perfil.nome}". Identidade visual: ${perfil.identidade_visual?.elementos}.
Recebe roteiros do Roteirista e devolve a versão final pronta para renderizar, cuidando de TODO o visual com foco em RETENÇÃO:
- Quebra de padrão: algo muda na tela a cada 3–5 s (novo elemento, novo enquadramento, aproximação, destaque, explosão de camadas, perturbação de um sistema). Nunca deixe a tela parada.
- Gancho (primeiros 3 s): a imagem mais intrigante do vídeo já no primeiro quadro (ele vira a capa no feed); movimento de câmera desde o início.
- Revelação: guarde a transformação visual mais forte para ela (ex.: "perturbar" um sistema, gráfico que dispara, camadas que se abrem).
- Metáforas visuais claras com os elementos do catálogo, sem poluição: no máximo ~5 elementos principais visíveis ao mesmo tempo; use "remover".
- Posições coerentes, sem objetos sobrepostos ou atravessando outros; tamanhos legíveis; rótulos curtos e bem posicionados.
- Enquadramento: alvo no centro do conteúdo; distância que mostre tudo o que importa; movimento de câmera com propósito (revelar, aproximar, comparar). Respeite as larguras máximas de cada formato.
- Ritmo: "atraso" das entradas sincronizado com o momento em que a narração fala daquilo; "destacar" quando a narração apontar uma parte específica.
- Paleta da marca no vídeo inteiro: ${JSON.stringify(perfil.identidade_visual?.paleta || {})} (azul = base, vermelho = destaque/alerta, verde = positivo/seguro, amarelo = energia/sinais).
- Se uma cena passar de ~7 s (curto) sem mudança visual, divida-a em duas (pode dividir a narração entre elas sem alterar o texto).
- Não altere fatos, números nem o sentido da narração. Pode encurtar "texto_tela".

${METODO_RETENCAO}

${REGRAS_MOTOR}

Responda sempre com o roteiro COMPLETO em JSON (sem comentários fora do JSON).`, { esforco: 'high', log });

  const qualidade = new Agente('Qualidade', `Você é o editor de qualidade e checador de fatos do perfil. Nada é publicado sem a sua aprovação.
${ctx}

Você recebe o roteiro final (JSON), o relatório do validador técnico, o diagnóstico automático de retenção e quadros de prévia renderizados de cada cena. Avalie:
1. Precisão: fatos, números, datas, causalidade, termos técnicos, simplificações que viram erro. Fontes reais e pertinentes.
2. Retenção (nota_retencao): o gancho prende em 3 s? Há curiosity gap/loop aberto que só se fecha na revelação? Cada cena acrescenta algo (nada de enchimento)? Há quebra de padrão visual frequente? A revelação surpreende? O fechamento provoca reflexão? Alguém continuaria assistindo até o fim?
3. Didática e método: responde a pergunta do título? Um leigo do nível indicado entende? Série, nível, pilar e disciplinas coerentes? Mostra conexões/sistema quando cabível?
4. Visual (pelos quadros): o que aparece explica o que a narração diz? Algo cortado, sobreposto, pequeno, ilegível, vazio ou confuso?
5. Responsabilidade: sem sensacionalismo, sem promessas financeiras, sem viés político-partidário, sem ensinar a atacar/golpear, sem estigmatizar.

${METODO_RETENCAO}

Aprove (aprovado=true) só quando não houver problema de precisão, a nota_retencao for ≥ 8 e não houver defeito visual relevante — perfeccionismo cosmético não é motivo para reprovar.
Para cada problema diga o responsável ("roteirista" para conteúdo/fatos/texto/estrutura de retenção, "designer" para visual/câmera/tempo/quebra de padrão), a cena e a correção concreta.`, { esforco: 'high', log });

  return { roteirista, designer, qualidade };
}

const ESQUEMA_PARECER = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['aprovado', 'nota', 'nota_retencao', 'resumo', 'problemas'],
    properties: {
      aprovado: { type: 'boolean' },
      nota: { type: 'number', description: 'Nota geral de 0 a 10' },
      nota_retencao: { type: 'number', description: 'De 0 a 10: quanto o vídeo prende do início ao fim' },
      resumo: { type: 'string' },
      problemas: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['responsavel', 'cena', 'gravidade', 'descricao', 'correcao'],
          properties: {
            responsavel: { type: 'string', enum: ['roteirista', 'designer'] },
            cena: { type: 'string' },
            gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
            descricao: { type: 'string' },
            correcao: { type: 'string' },
          },
        },
      },
    },
  },
};

const listaProblemas = (ps) => ps.map((p) => `- [${p.gravidade}] cena ${p.cena}: ${p.descricao}\n  Correção: ${p.correcao}`).join('\n');

// Orquestra a pré-produção. `previa(roteiro)` deve devolver [{cena, t, jpeg}] (quadros renderizados).
export async function produzirRoteiro(tema, { formato = 'curto', pilar, serie, nivel, publico, perfil = PERFIL_PADRAO, rodadas = 3, previa, log = console.log } = {}) {
  const f = FORMATOS[formato];
  if (!f) throw new Error('Formato deve ser "curto" ou "longo".');
  const { roteirista, designer, qualidade } = criarEquipe({ perfil, log });

  log('1/3 Roteirista escrevendo...');
  let roteiro = await roteirista.pedirRoteiro(`Crie um vídeo ${formato} (${f.descricao}) sobre: "${tema}".
${pilar ? `Pilar: ${pilar}. ` : 'Escolha o pilar mais adequado. '}${serie ? `Série: ${serie}. ` : 'Escolha a série mais adequada. '}${nivel ? `Nível: ${nivel}.` : 'Escolha o nível (padrão: basico).'}${publico ? ` Público: ${publico}.` : ''}
Duração total alvo: ${formato === 'curto' ? '45 a 60' : `${f.duracao[0]} a ${f.duracao[1]}`} segundos de narração${formato === 'longo' ? ' (desenvolva em capítulos; cada capítulo repete o ciclo gancho→revelação e abre o loop do próximo; recapitule no fim)' : ''}.
Use "formato": "${formato}". Preencha pergunta_central, loop_aberto, disciplinas, e etapa/tecnica de cada cena.`);

  log('2/3 Designer criando o visual...');
  roteiro = await designer.pedirRoteiro(`Roteiro do Roteirista para você finalizar o visual:\n${JSON.stringify(roteiro, null, 1)}\n\nDiagnóstico automático de retenção: ${analisarRetencao(planejarTempos(roteiro)).join(' ') || 'sem alertas.'}`);

  const historico = [];
  for (let r = 1; r <= rodadas; r++) {
    roteiro = planejarTempos(roteiro);
    log(`3/3 Qualidade revisando (rodada ${r}/${rodadas})...`);
    const tecnico = validar(roteiro);
    const retencao = analisarRetencao(roteiro);
    const conteudo = [{ type: 'text', text: `${r > 1 ? 'Nova versão após as correções. Reavalie do zero, conferindo se os problemas anteriores foram resolvidos.\n\n' : ''}Roteiro para revisão (duração total ${duracaoTotal(roteiro).toFixed(1)} s, formato ${roteiro.formato}):\n${JSON.stringify(roteiro, null, 1)}\n\nValidador técnico: ${tecnico.length ? tecnico.join('; ') : 'sem erros.'}\nDiagnóstico automático de retenção: ${retencao.length ? retencao.join(' ') : 'sem alertas.'}` }];
    if (previa) {
      try {
        for (const q of await previa(roteiro)) {
          conteudo.push({ type: 'text', text: `Quadro de prévia — cena ${q.cena}, t=${q.t.toFixed(1)} s:` });
          conteudo.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: q.jpeg.toString('base64') } });
        }
      } catch (e) { conteudo.push({ type: 'text', text: `(Não foi possível renderizar a prévia: ${e.message})` }); }
    }
    const parecer = JSON.parse(await qualidade.perguntar(conteudo, { formato: ESQUEMA_PARECER }));
    historico.push(parecer);
    log(`   Nota ${parecer.nota}/10, retenção ${parecer.nota_retencao}/10 — ${parecer.aprovado ? 'APROVADO' : 'reprovado'}: ${parecer.resumo}`);
    if (parecer.aprovado && !tecnico.length) return { roteiro, pareceres: historico, aprovado: true };
    if (r === rodadas) break;

    const doRoteirista = parecer.problemas.filter((p) => p.responsavel === 'roteirista');
    const doDesigner = parecer.problemas.filter((p) => p.responsavel === 'designer');
    if (doRoteirista.length) {
      log(`   Roteirista corrigindo ${doRoteirista.length} ponto(s)...`);
      roteiro = await roteirista.pedirRoteiro(`A Qualidade reprovou o vídeo. Corrija os pontos de conteúdo abaixo e devolva o roteiro COMPLETO (parta desta versão atual, que já inclui o visual do Designer):\n${listaProblemas(doRoteirista)}\n\nVersão atual:\n${JSON.stringify(roteiro, null, 1)}`);
    }
    log('   Designer ajustando o visual...');
    roteiro = await designer.pedirRoteiro(`${doDesigner.length ? `A Qualidade apontou problemas visuais:\n${listaProblemas(doDesigner)}\n\n` : ''}${doRoteirista.length ? 'O Roteirista revisou o conteúdo; garanta que o visual acompanha a nova narração.\n\n' : ''}Diagnóstico automático de retenção: ${analisarRetencao(planejarTempos(roteiro)).join(' ') || 'sem alertas.'}\n\nVersão atual:\n${JSON.stringify(roteiro, null, 1)}\n\nDevolva o roteiro COMPLETO finalizado.`);
  }
  return { roteiro: planejarTempos(roteiro), pareceres: historico, aprovado: false };
}

// Pauta (calendário editorial). A ALTERNÂNCIA é garantida por código (src/agenda.js): pilar, série, nível e
// formato vêm do rodízio; subtemas vêm da curadoria (favoritos primeiro). O agente só lapida título, gancho e ideia visual.
export async function gerarPauta({ dias = 7, perfil = PERFIL_PADRAO, semIA = false, log = console.log } = {}) {
  const { esqueleto, checarAlternancia } = await import('./agenda.js');
  const { escolherSubtema } = await import('./subtemas.js');
  const reservados = new Set();
  const grade = esqueleto(dias).map((g) => {
    const st = escolherSubtema(g.pilar, reservados);
    return { ...g, subtema: st?.titulo || '', favorito: !!st?.favorito };
  });
  const alternancia = checarAlternancia(grade);
  if (alternancia.length) throw new Error('Rodízio inválido: ' + alternancia.join(' '));
  if (semIA) return grade.map((g) => ({ ...g, titulo: g.subtema || `(escolher tema de ${g.pilar})`, gancho: '', disciplinas: [], ideia_visual: '', horario: '' }));

  const editor = new Agente('Editor de pauta', `Você é o editor de pauta do perfil.\n${contextoPerfil(perfil)}\nElementos visuais disponíveis para os vídeos 3D: ${Object.keys(CATALOGO).join(', ')}.\n\n${METODO_RETENCAO}`, { esforco: 'medium', log });
  const resp = await editor.perguntar(`Esta é a grade da semana. Pilar, série, nível e formato de cada dia já foram definidos pelo rodízio (conteúdo alternado) e NÃO podem mudar. Para cada dia, transforme o subtema sugerido (prioridade: favoritos) num título irresistível e verdadeiro, escreva o gancho de 0–3 s, as disciplinas conectadas, a ideia visual com a biblioteca 3D e o melhor horário de postagem. Se o subtema estiver vazio, proponha um tema forte do pilar.\n${JSON.stringify(grade, null, 1)}`, {
    formato: {
      type: 'json_schema',
      schema: {
        type: 'object', additionalProperties: false, required: ['itens'],
        properties: {
          itens: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['dia', 'titulo', 'gancho', 'disciplinas', 'ideia_visual', 'horario'],
              properties: {
                dia: { type: 'integer' }, titulo: { type: 'string' }, gancho: { type: 'string' },
                disciplinas: { type: 'array', items: { type: 'string' } }, ideia_visual: { type: 'string' }, horario: { type: 'string' },
              },
            },
          },
        },
      },
    },
  });
  const porDia = new Map(JSON.parse(resp).itens.map((i) => [i.dia, i]));
  return grade.map((g) => ({ ...g, ...(porDia.get(g.dia) || { titulo: g.subtema, gancho: '', disciplinas: [], ideia_visual: '', horario: '' }), ...g }));
}

// Agente Analista: lê as métricas reais dos vídeos publicados e extrai lições para os próximos roteiros.
export async function aprenderComMetricas(csv, { perfil = PERFIL_PADRAO, log = console.log } = {}) {
  const roteiros = fs.readdirSync(path.join(RAIZ, 'roteiros')).filter((f) => f.endsWith('.json') && !f.includes('.qualidade') && !f.startsWith('pauta'))
    .map((f) => { try { const r = JSON.parse(fs.readFileSync(path.join(RAIZ, 'roteiros', f), 'utf8')); return { arquivo: f, titulo: r.titulo, serie: r.serie, pilar: r.pilar, cenas: (r.cenas || []).map((c) => ({ id: c.id, etapa: c.etapa, tecnica: c.tecnica, narracao: c.narracao, duracao: c.duracao })) }; } catch { return null; } })
    .filter(Boolean);
  const analista = new Agente('Analista', `Você é o analista de audiência do perfil.\n${contextoPerfil(perfil)}\n\n${METODO_RETENCAO}\n\nVocê recebe métricas reais dos vídeos publicados (retenção média, taxa de conclusão, segundo em que as pessoas abandonam, compartilhamentos, salvamentos etc.) e os roteiros correspondentes. Cruze o ponto de abandono com a cena que estava na tela naquele momento. Encontre padrões com base nos dados (não em intuição) e diga quão confiável é cada conclusão dado o tamanho da amostra.`, { esforco: 'high', log });
  const texto = await analista.perguntar(`Métricas (CSV):\n${csv}\n\nRoteiros publicados:\n${JSON.stringify(roteiros, null, 1)}\n\nEscreva em Markdown, curto e acionável:\n## O que funciona\n## O que faz as pessoas saírem\n## Regras para os próximos roteiros (máx. 8, imperativas e específicas)\n## Próximos temas sugeridos`);
  const arq = path.join(RAIZ, 'roteiros', 'aprendizados.md');
  fs.writeFileSync(arq, texto.trim() + '\n');
  return { arquivo: arq, texto };
}
