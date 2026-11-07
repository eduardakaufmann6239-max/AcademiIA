// Narração em voz (opcional). Ordem de preferência:
//   1. ElevenLabs (voz natural em português) — defina ELEVENLABS_API_KEY (e opcionalmente ELEVENLABS_VOZ)
//   2. espeak-ng instalado localmente (voz robótica, útil para testes)
//   3. sem voz — o vídeo sai só com legendas animadas
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { textoFalado } from './roteiro.js';

const existe = (bin) => spawnSync('which', [bin]).status === 0;

export function provedorDisponivel() {
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (existe('espeak-ng')) return 'espeak-ng';
  return null;
}

function duracaoArquivo(arq) {
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arq]).toString();
  return parseFloat(s) || 0;
}

async function elevenlabs(texto, arq) {
  const voz = process.env.ELEVENLABS_VOZ || 'pNInz6obpgDQGcFmaJgB';
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: texto, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs respondeu ${r.status}: ${await r.text()}`);
  fs.writeFileSync(arq, Buffer.from(await r.arrayBuffer()));
}

// Gera um arquivo por cena e devolve suas durações (s).
export async function narrar(roteiro, pasta) {
  const prov = provedorDisponivel();
  if (!prov) return null;
  fs.mkdirSync(pasta, { recursive: true });
  const arquivos = [];
  for (const [i, c] of roteiro.cenas.entries()) {
    const texto = textoFalado(c.narracao);
    const arq = path.join(pasta, `cena-${String(i + 1).padStart(2, '0')}.${prov === 'elevenlabs' ? 'mp3' : 'wav'}`);
    if (prov === 'elevenlabs') await elevenlabs(texto, arq);
    else execFileSync('espeak-ng', ['-v', 'pt-br', '-s', '160', '-w', arq, texto]);
    arquivos.push(arq);
  }
  return { provedor: prov, arquivos, duracoes: arquivos.map(duracaoArquivo) };
}

// Junta as falas, cada uma ocupando exatamente a duração da sua cena.
export function montarTrilha(arquivos, duracoesCenas, saida) {
  const args = ['-y', '-loglevel', 'error'];
  arquivos.forEach((a) => args.push('-i', a));
  const filtros = arquivos.map((_, i) => `[${i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=150|150,apad,atrim=0:${duracoesCenas[i].toFixed(3)}[a${i}]`);
  filtros.push(`${arquivos.map((_, i) => `[a${i}]`).join('')}concat=n=${arquivos.length}:v=0:a=1[saida]`);
  args.push('-filter_complex', filtros.join(';'), '-map', '[saida]', saida);
  execFileSync('ffmpeg', args);
  return saida;
}

// Música de fundo discreta, sintetizada (sem direitos autorais): acordes suaves Am–F–C–G com reverberação.
export function gerarMusica(duracao, saida, { bpmAcorde = 4 } = {}) {
  const acordes = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 261.63, 329.63], [196, 246.94, 293.66]];
  const ciclo = acordes.length * bpmAcorde;
  const T = `mod(t,${ciclo})`;
  const partes = acordes.map((ac, i) => {
    const a = i * bpmAcorde, b = a + bpmAcorde;
    const env = `clip(min((${T}-${a})/0.8,(${b}-${T})/0.8),0,1)`;
    const notas = ac.map((f) => `sin(2*PI*${f}*t)+0.3*sin(2*PI*${f * 2}*t)`).join('+');
    const baixo = `0.8*sin(2*PI*${ac[0] / 2}*t)`;
    return `${env}*(${notas}+${baixo})`;
  });
  const expr = `0.12*(${partes.join('+')})*(0.85+0.15*sin(2*PI*0.25*t))`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc=exprs='${expr}':s=44100:d=${duracao.toFixed(2)}`,
    '-af', `lowpass=f=1400,aecho=0.8:0.6:120|240:0.35|0.2,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, duracao - 2).toFixed(2)}:d=2,aformat=channel_layouts=stereo`,
    '-c:a', 'aac', '-b:a', '128k', saida]);
  return saida;
}

// Mistura narração (opcional) com a música; a música abaixa automaticamente quando há voz (ducking).
export function mixar({ narracao, musica, saida }) {
  if (!narracao) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', musica, '-af', 'volume=0.9', '-c:a', 'aac', '-b:a', '160k', saida]);
    return saida;
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', narracao, '-i', musica, '-filter_complex',
    '[1:a]volume=0.55[m];[m][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md];[0:a][md]amix=inputs=2:duration=first:normalize=0[s]',
    '-map', '[s]', '-c:a', 'aac', '-b:a', '160k', saida]);
  return saida;
}
