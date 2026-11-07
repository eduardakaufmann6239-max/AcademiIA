// Etapas de produção reutilizáveis (CLI direta e agente Produtor de Vídeo).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderizar } from './render.js';
import { validar, planejarTempos, duracaoTotal } from './roteiro.js';
import { narrar, montarTrilha, gerarMusica, mixar } from './narracao.js';

export const MARCA = process.env.MARCA || '@conhecimentoexplicado';

// Gera a narração (se houver provedor) e ajusta a duração das cenas ao áudio real.
export async function prepararAudio(roteiro, base) {
  const voz = await narrar(planejarTempos(roteiro), base + '-audio');
  if (!voz) return { roteiro: planejarTempos(roteiro), audio: null, provedor: null, arquivos: null };
  const r = planejarTempos(roteiro, voz.duracoes);
  const audio = montarTrilha(voz.arquivos, r.cenas.map((c) => c.duracao), base + '-narracao.m4a');
  return { roteiro: r, audio, provedor: voz.provedor, arquivos: voz.arquivos };
}

export async function renderizarVideo(roteiro, saida, { qualidade = 'padrao', audio, fps = 30, progresso, musica = process.env.SEM_MUSICA ? false : true } = {}) {
  const erros = validar(roteiro);
  if (erros.length) throw new Error('Roteiro inválido:\n- ' + erros.join('\n- '));
  const r = planejarTempos(roteiro);
  let trilha = audio;
  if (musica) { // trilha discreta por baixo da narração (ou sozinha, se não houver voz)
    const base = saida.replace(/\.mp4$/, '');
    const m = gerarMusica(duracaoTotal(r), base + '-musica.m4a');
    trilha = mixar({ narracao: audio, musica: m, saida: base + '-trilha.m4a' });
  }
  return renderizar(r, saida, { rapido: qualidade === 'rapido', hd: qualidade === 'hd', fps, audio: trilha, marca: MARCA, progresso });
}

export function escreverPost(roteiro, base) {
  const post = `${roteiro.titulo}\n\n${roteiro.legenda_post || ''}\n\n${(roteiro.hashtags || []).join(' ')}\n\nFontes:\n${(roteiro.fontes || []).map((f) => '- ' + f).join('\n')}\n`;
  fs.writeFileSync(base + '-post.txt', post);
  return base + '-post.txt';
}

// Informações técnicas de um MP4 (duração, resolução, áudio).
export function inspecionarArquivo(mp4) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4]).toString());
  const v = j.streams.find((s) => s.codec_type === 'video'), a = j.streams.find((s) => s.codec_type === 'audio');
  return {
    duracao: +(+j.format.duration).toFixed(2), tamanho_mb: +(j.format.size / 1048576).toFixed(1),
    resolucao: v ? `${v.width}x${v.height}` : null, fps: v ? v.r_frame_rate : null, audio: a ? `${a.codec_name} ${a.channels}ch` : 'sem áudio',
  };
}

// Extrai quadros do vídeo pronto nos instantes pedidos (JPEG reduzido).
export function extrairQuadros(mp4, tempos, pasta) {
  fs.mkdirSync(pasta, { recursive: true });
  return tempos.map((t, i) => {
    const arq = path.join(pasta, `q${String(i).padStart(2, '0')}.jpg`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', arq]);
    return { t, arq, jpeg: fs.readFileSync(arq) };
  });
}

// Pipeline direto (sem IA): áudio → render → legenda do post.
export async function produzirDireto(roteiro, saida, { semVoz = false, qualidade = 'padrao', fps = 30, log = console.log } = {}) {
  const base = saida.replace(/\.mp4$/, '');
  let r = planejarTempos(roteiro), audio = null;
  if (!semVoz) {
    const p = await prepararAudio(roteiro, base);
    r = p.roteiro; audio = p.audio;
    log(p.provedor ? `Narração gerada com ${p.provedor}.` : 'Sem provedor de voz: vídeo com legendas animadas (defina ELEVENLABS_API_KEY para narração).');
  }
  log(`Renderizando "${r.titulo}" — ${r.formato}, ${duracaoTotal(r).toFixed(1)} s...`);
  const res = await renderizarVideo(r, saida, {
    qualidade, audio, fps,
    progresso: (i, n, s) => process.stdout.write(`\r  quadro ${i}/${n} (${(i / s).toFixed(1)} qps)   `),
  });
  process.stdout.write('\n');
  const post = escreverPost(r, base);
  log(`Pronto: ${res.saida} (${res.duracao.toFixed(1)} s, renderizado em ${res.segundos.toFixed(0)} s) + legenda em ${post}`);
  return { ...res, post, roteiro: r };
}
