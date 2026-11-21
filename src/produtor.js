// Agente Produtor de Vídeo: recebe o roteiro aprovado e conduz a produção usando ferramentas reais
// (narração, renderização, inspeção do MP4 final). Ele assiste ao resultado e só entrega quando está bom.
import Anthropic from '@anthropic-ai/sdk';
import path from 'node:path';
import fs from 'node:fs';
import { MODELO } from './agentes.js';
import { prepararAudio, renderizarVideo, escreverPost, inspecionarArquivo, extrairQuadros } from './producao.js';
import { planejarTempos, duracaoTotal, validar, FORMATOS } from './roteiro.js';
import { provedorDisponivel, montarTrilha } from './narracao.js';

const FERRAMENTAS = [
  {
    name: 'gerar_narracao',
    description: 'Gera a narração em voz de todas as cenas (se houver provedor de voz configurado) e ajusta a duração das cenas ao áudio real. Chame antes de renderizar a versão final. Retorna o provedor usado e a duração de cada cena.',
    input_schema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    strict: true,
  },
  {
    name: 'ajustar_cena',
    description: 'Ajuste fino de produção numa cena, sem mudar o conteúdo: duração mínima (s), câmera (distancia, elevacao, alvo [x,y,z], azimute [ini,fim]) ou atraso de um elemento. Use para corrigir enquadramento, ritmo apertado ou objetos cortados vistos na inspeção.',
    input_schema: {
      type: 'object', additionalProperties: false, required: ['cena'],
      properties: {
        cena: { type: 'string', description: 'id da cena (ex.: c3)' },
        duracao_minima: { type: 'number' },
        camera: {
          type: 'object', additionalProperties: false,
          properties: { distancia: { type: 'number' }, elevacao: { type: 'number' }, alvo: { type: 'array', items: { type: 'number' } }, azimute: { type: 'array', items: { type: 'number' } } },
        },
        elemento: { type: 'string', description: 'id do elemento cujo atraso será alterado' },
        atraso: { type: 'number' },
      },
    },
  },
  {
    name: 'renderizar',
    description: 'Renderiza o vídeo. qualidade "rapido" (meia resolução, para conferir) | "padrao" (720p, publicação) | "hd" (1080p, mais lento). Retorna caminho e dados do arquivo.',
    input_schema: { type: 'object', additionalProperties: false, required: ['qualidade'], properties: { qualidade: { type: 'string', enum: ['rapido', 'padrao', 'hd'] } } },
    strict: true,
  },
  {
    name: 'assistir_video',
    description: 'Assiste ao último vídeo renderizado: devolve dados técnicos (duração, resolução, áudio) e quadros extraídos do MP4 (um no meio de cada cena, mais início e fim) para você conferir enquadramento, legibilidade e sincronia.',
    input_schema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    strict: true,
  },
  {
    name: 'entregar',
    description: 'Finaliza: grava a legenda do post e registra o relatório de produção. Chame só quando o vídeo estiver aprovado por você.',
    input_schema: { type: 'object', additionalProperties: false, required: ['relatorio'], properties: { relatorio: { type: 'string', description: 'O que foi feito e conferido, em poucas linhas' } } },
    strict: true,
  },
];

// Cria o agente Produtor. `produzir(instrucao)` roda até ele chamar "entregar"; pode ser chamado de novo
// com correções do Revisor — a conversa continua, então ele lembra de tudo o que já fez.
export function criarProdutor(roteiroInicial, saida, { log = console.log, maxPassos = 14 } = {}) {
  const cliente = new Anthropic();
  const base = saida.replace(/\.mp4$/, '');
  let roteiro = planejarTempos(roteiroInicial);
  let audio = null, falas = null, ultimo = null, entregue = null;

  const executores = {
    async gerar_narracao() {
      const p = await prepararAudio(roteiro, base);
      roteiro = p.roteiro; audio = p.audio; falas = p.arquivos;
      return p.provedor
        ? `Narração gerada com ${p.provedor}. Durações: ${roteiro.cenas.map((c) => `${c.id}=${c.duracao}s`).join(', ')}. Total ${duracaoTotal(roteiro).toFixed(1)} s.`
        : 'Nenhum provedor de voz configurado — o vídeo sairá só com legendas animadas (tempo por cena calculado pela leitura).';
    },
    async ajustar_cena({ cena, duracao_minima, camera, elemento, atraso }) {
      const c = roteiro.cenas.find((x) => x.id === cena); if (!c) return `Cena ${cena} não existe.`;
      const antes = JSON.stringify(roteiro);
      const durAntes = c.duracao;
      if (duracao_minima) c.duracao = Math.max(c.duracao, duracao_minima);
      if (camera) c.camera = { ...(c.camera || {}), ...Object.fromEntries(Object.entries(camera).filter(([, v]) => v != null)) };
      if (elemento) { const e = (c.elementos || []).find((x) => x.id === elemento); if (!e) return `Elemento ${elemento} não está na cena ${cena}.`; e.atraso = atraso ?? e.atraso; }
      const erros = validar(roteiro);
      if (erros.length) { roteiro = planejarTempos(JSON.parse(antes)); return `Ajuste desfeito, deixaria o roteiro inválido: ${erros.join('; ')}`; }
      if (c.duracao !== durAntes && falas) audio = montarTrilha(falas, roteiro.cenas.map((x) => x.duracao), base + '-narracao.m4a'); // mantém a voz sincronizada
      return `Cena ${cena} ajustada. Lembre de renderizar de novo.`;
    },
    async renderizar({ qualidade }) {
      const arq = qualidade === 'rapido' ? base + '-rascunho.mp4' : saida;
      log(`  · renderizando (${qualidade})...`);
      const res = await renderizarVideo(roteiro, arq, { qualidade, audio, progresso: (i, n) => process.stdout.write(`\r    quadro ${i}/${n}   `) });
      process.stdout.write('\n');
      ultimo = { arq, qualidade };
      return `Renderizado ${arq} em ${res.segundos.toFixed(0)} s. ${JSON.stringify(inspecionarArquivo(arq))}`;
    },
    async assistir_video() {
      if (!ultimo) return 'Nenhum vídeo renderizado ainda.';
      const info = inspecionarArquivo(ultimo.arq);
      let t = 0; const tempos = [0.4];
      for (const c of roteiro.cenas) { tempos.push(t + c.duracao * 0.6); t += c.duracao; }
      tempos.push(Math.max(0, info.duracao - 0.3));
      const quadros = extrairQuadros(ultimo.arq, tempos, base + '-quadros');
      const conteudo = [{ type: 'text', text: `Arquivo ${ultimo.arq} (${ultimo.qualidade}): ${JSON.stringify(info)}. Esperado: ${duracaoTotal(roteiro).toFixed(1)} s, formato ${roteiro.formato} (${FORMATOS[roteiro.formato].largura}x${FORMATOS[roteiro.formato].altura} em HD).` }];
      quadros.forEach((q, i) => {
        const rot = i === 0 ? 'início' : i === quadros.length - 1 ? 'fim' : `cena ${roteiro.cenas[i - 1].id} ("${roteiro.cenas[i - 1].texto_tela || ''}")`;
        conteudo.push({ type: 'text', text: `t=${q.t.toFixed(1)} s — ${rot}` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: q.jpeg.toString('base64') } });
      });
      return conteudo;
    },
    async entregar({ relatorio }) {
      if (!ultimo || ultimo.qualidade === 'rapido') return 'Ainda não há render final (padrao ou hd). Renderize antes de entregar.';
      const post = escreverPost(roteiro, base);
      fs.writeFileSync(base + '-producao.txt', relatorio + '\n');
      fs.writeFileSync(base + '.roteiro-final.json', JSON.stringify(roteiro, null, 2));
      entregue = { saida: ultimo.arq, post, relatorio, roteiro };
      return 'Entregue.';
    },
  };

  const sistema = `Você é o Produtor de Vídeo do estúdio. O roteiro já foi aprovado pelo Roteirista, Designer e Qualidade; sua missão é transformá-lo no melhor vídeo final possível usando as ferramentas.
Fluxo recomendado: gerar_narracao → renderizar("rapido") → assistir_video → (se precisar) ajustar_cena e repetir → renderizar("padrao" ou "hd" se pedido) → assistir_video → entregar.
Ao assistir, confira: nada importante cortado ou fora de quadro; rótulos e legendas legíveis e sem sobrepor o título; objetos sem atravessar uns aos outros; ritmo (cena curta demais para ler); duração e áudio conforme esperado.
Você NÃO altera conteúdo, fatos ou narração — só ajustes de produção (câmera, tempo, atraso). Seja eficiente: renderizações custam tempo; não repita sem motivo.
Provedor de voz disponível: ${provedorDisponivel() || 'nenhum (só legendas)'}.`;

  const mensagens = [];
  async function produzir(instrucao) {
  entregue = null;
  mensagens.push({ role: 'user', content: instrucao ?? `Produza este vídeo. Saída final: ${saida}.\nRoteiro:\n${JSON.stringify(roteiro, null, 1)}` });
  for (let passo = 0; passo < maxPassos && !entregue; passo++) {
    const msg = await cliente.beta.messages.stream({
      model: MODELO, max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
      system: sistema, tools: FERRAMENTAS, messages: mensagens,
    }).finalMessage();
    mensagens.push({ role: 'assistant', content: msg.content });
    for (const b of msg.content) if (b.type === 'text' && b.text.trim()) log(`  Produtor: ${b.text.trim()}`);
    if (msg.stop_reason === 'refusal') throw new Error('Produtor: o modelo recusou a tarefa.');
    if (msg.stop_reason !== 'tool_use') {
      mensagens.push({ role: 'user', content: 'Continue usando as ferramentas até chamar "entregar".' });
      continue;
    }
    const resultados = [];
    for (const b of msg.content.filter((x) => x.type === 'tool_use')) {
      log(`  · ferramenta: ${b.name}`);
      try {
        const r = await executores[b.name](b.input || {});
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: r });
      } catch (e) {
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: `Erro: ${e.message}`, is_error: true });
      }
    }
    mensagens.push({ role: 'user', content: resultados });
  }
  if (!entregue) throw new Error('O Produtor não concluiu a entrega no limite de passos.');
  log(`  Produtor entregou: ${entregue.saida} — ${entregue.relatorio}`);
  return entregue;
  }
  return { produzir, roteiroAtual: () => roteiro };
}
