// Agente Revisor do Vídeo Final: controle de qualidade independente sobre o MP4 pronto.
// Combina verificações automáticas (ffmpeg) com a avaliação visual de quadros do vídeo inteiro.
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync, spawnSync } from 'node:child_process';
import { MODELO, PERFIL_PADRAO } from './agentes.js';
import { inspecionarArquivo, extrairQuadros } from './producao.js';
import { FORMATOS, duracaoTotal } from './roteiro.js';

// Medições objetivas — não dependem de IA.
export function verificacoesAutomaticas(mp4, roteiro, { qualidade = 'padrao' } = {}) {
  const info = inspecionarArquivo(mp4);
  const problemas = [];
  const esperado = duracaoTotal(roteiro);
  if (Math.abs(info.duracao - esperado) > 1) problemas.push(`Duração ${info.duracao}s difere da esperada (${esperado.toFixed(1)}s).`);
  const f = FORMATOS[roteiro.formato];
  const [w, h] = (info.resolucao || '0x0').split('x').map(Number);
  if (f && (w > h) !== (f.largura > f.altura)) problemas.push(`Orientação errada: ${info.resolucao} para formato ${roteiro.formato}.`);
  if (qualidade !== 'rapido' && f && h < Math.min(f.largura, f.altura) * 0.66 - 2 && w < Math.min(f.largura, f.altura) * 0.66 - 2) problemas.push(`Resolução baixa para publicação: ${info.resolucao}.`);
  if (roteiro.formato === 'curto' && info.duracao > 90) problemas.push(`Vídeo curto com ${info.duracao}s — acima de 90s perde alcance em Reels.`);

  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', mp4, '-vf', 'blackdetect=d=0.4:pix_th=0.08', '-an', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
  const pretos = [...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `${(+m[1]).toFixed(1)}–${(+m[2]).toFixed(1)}s`);
  if (pretos.length) problemas.push(`Trechos pretos: ${pretos.join(', ')}.`);

  let silencios = [];
  if (info.audio !== 'sem áudio') {
    const s = spawnSync('ffmpeg', ['-hide_banner', '-i', mp4, '-af', 'silencedetect=n=-45dB:d=2.5', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
    silencios = [...s.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((m) => `${(+m[1]).toFixed(1)}–${(+m[2]).toFixed(1)}s`);
    if (silencios.length) problemas.push(`Silêncios longos na narração: ${silencios.join(', ')}.`);
  }
  return { info, esperado: +esperado.toFixed(2), problemas };
}

const ESQUEMA = {
  type: 'json_schema',
  schema: {
    type: 'object', additionalProperties: false,
    required: ['aprovado', 'nota', 'resumo', 'problemas'],
    properties: {
      aprovado: { type: 'boolean' },
      nota: { type: 'number', description: '0 a 10' },
      resumo: { type: 'string' },
      problemas: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['tempo', 'gravidade', 'descricao', 'correcao'],
          properties: {
            tempo: { type: 'string', description: 'instante ou intervalo, ex.: 12.5s' },
            gravidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
            descricao: { type: 'string' },
            correcao: { type: 'string', description: 'ajuste concreto de produção (câmera, tempo, atraso, render)' },
          },
        },
      },
    },
  },
};

export function criarRevisor({ perfil = PERFIL_PADRAO, log = console.log } = {}) {
  const cliente = new Anthropic();
  const mensagens = [];
  const sistema = `Você é o Revisor do Vídeo Final do perfil "${perfil.nome}" (${perfil.arroba}) — a última barreira antes da publicação.
Você recebe o MP4 pronto como uma sequência de quadros com o tempo de cada um, o roteiro e um relatório de verificações automáticas (duração, resolução, quadros pretos, silêncios).
Avalie como um espectador exigente assistindo no celular:
- Leitura: título, legendas e rótulos legíveis, sem cortar nas bordas, sem se sobrepor nem cobrir o objeto explicado.
- Imagem: objetos principais dentro do quadro, sem ficar minúsculos, sem atravessar outros objetos, sem cenas vazias ou poluídas.
- Coerência: o que aparece em cada momento corresponde ao que a legenda diz naquele momento.
- Ritmo e técnica: duração adequada ao formato, sem trechos pretos, sem silêncios estranhos, transições sem saltos bruscos.
- Marca: assinatura do perfil visível; primeiro quadro atraente (é a capa no feed).
Aprove (aprovado=true) quando não houver defeito que um espectador notaria. Problemas de conteúdo/fato já foram revisados antes — só aponte se forem graves.
Cada problema deve trazer o tempo e uma correção que o Produtor consiga executar (câmera, duração da cena, atraso de elemento, re-render).`;

  async function revisar(mp4, roteiro, { qualidade = 'padrao' } = {}) {
    const auto = verificacoesAutomaticas(mp4, roteiro, { qualidade });
    const dur = auto.info.duracao;
    const passo = Math.max(1.5, dur / 36);
    const tempos = []; for (let t = 0.3; t < dur - 0.1; t += passo) tempos.push(+t.toFixed(2));
    const quadros = extrairQuadros(mp4, tempos, mp4.replace(/\.mp4$/, '') + '-revisao');
    let t = 0; const mapa = roteiro.cenas.map((c) => { const o = { id: c.id, ini: t, fim: t + c.duracao, txt: c.texto_tela }; t += c.duracao; return o; });
    const cenaEm = (x) => mapa.find((m) => x >= m.ini && x < m.fim) || mapa[mapa.length - 1];

    const conteudo = [{
      type: 'text',
      text: `${mensagens.length ? 'Nova versão após as correções do Produtor. Reavalie do zero.\n\n' : ''}Vídeo: ${mp4}
Dados: ${JSON.stringify(auto.info)} — esperado ${auto.esperado}s.
Verificações automáticas: ${auto.problemas.length ? auto.problemas.join(' ') : 'nenhum problema.'}
Mapa das cenas: ${mapa.map((m) => `${m.id} ${m.ini.toFixed(1)}–${m.fim.toFixed(1)}s "${m.txt || ''}"`).join(' | ')}
Narração por cena: ${roteiro.cenas.map((c) => `${c.id}: ${c.narracao}`).join(' || ')}`,
    }];
    for (const q of quadros) {
      conteudo.push({ type: 'text', text: `t=${q.t.toFixed(1)}s (cena ${cenaEm(q.t).id})` });
      conteudo.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: q.jpeg.toString('base64') } });
    }
    mensagens.push({ role: 'user', content: conteudo });
    log(`  · Revisor assistindo ${quadros.length} quadros...`);
    const msg = await cliente.beta.messages.stream({
      model: MODELO, max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      thinking: { type: 'adaptive' }, output_config: { effort: 'high', format: ESQUEMA },
      system: sistema, messages: mensagens,
    }).finalMessage();
    mensagens.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'refusal') throw new Error('Revisor: o modelo recusou a tarefa.');
    const parecer = JSON.parse(msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    // Falhas técnicas objetivas reprovam mesmo que a avaliação visual aprove.
    const graves = auto.problemas.filter((p) => /pretos|Orientação|difere/.test(p));
    if (graves.length) { parecer.aprovado = false; parecer.problemas.push(...graves.map((g) => ({ tempo: '-', gravidade: 'alta', descricao: g, correcao: 'Corrigir e renderizar novamente.' }))); }
    return { ...parecer, automatico: auto };
  }
  return { revisar };
}
