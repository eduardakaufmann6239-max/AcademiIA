// Renderizador: abre o motor 3D no Chromium headless, desenha quadro a quadro e codifica em MP4 com ffmpeg.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FORMATOS, duracaoTotal } from './roteiro.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

function servidorEstatico() {
  return new Promise((ok) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(RAIZ) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

export function carregarPlaywright() {
  try { return require('playwright'); } catch { /* instalado globalmente? */ }
  try { return createRequire(path.join(process.cwd(), 'x.js'))('playwright'); } catch {
    throw new Error('Playwright não encontrado. Instale com: npm i -D playwright && npx playwright install chromium');
  }
}

export function dimensoes(roteiro, { rapido = false, hd = false } = {}) {
  const f = FORMATOS[roteiro.formato] || FORMATOS.curto;
  if (rapido) return { largura: f.rapido[0], altura: f.rapido[1] };
  if (hd) return { largura: f.largura, altura: f.altura };
  return { largura: Math.round(f.largura * (2 / 3) / 2) * 2, altura: Math.round(f.altura * (2 / 3) / 2) * 2 }; // 720x1280 / 1280x720
}

async function abrir(roteiro, opts) {
  const { chromium } = carregarPlaywright();
  const srv = await servidorEstatico();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: opts.largura, height: opts.altura }, deviceScaleFactor: 1 });
  const errosPagina = [];
  page.on('pageerror', (e) => errosPagina.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errosPagina.push(m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/src/render/player.html`);
  await page.waitForFunction(() => window.__pronto === true, null, { timeout: 30000 }).catch(() => {
    throw new Error('O motor 3D não carregou: ' + errosPagina.join(' | '));
  });
  const info = await page.evaluate(([r, o]) => window.__iniciar(r, o), [roteiro, opts]);
  const fechar = async () => { await browser.close(); srv.close(); };
  return { page, info, fechar, errosPagina };
}

// Captura alguns quadros (JPEG) — usado pelo agente de qualidade para "ver" o vídeo.
export async function capturarQuadros(roteiro, tempos, opts = {}) {
  const dim = { ...dimensoes(roteiro, { rapido: !opts.tamanho }), ...(opts.tamanho || {}), marca: opts.marca, sombras: true, realista: opts.realista, oclusao: opts.oclusao, semTextos: opts.semTextos };
  const { page, fechar, errosPagina } = await abrir(roteiro, dim);
  const quadros = [];
  try {
    for (const t of tempos) {
      await page.evaluate((x) => window.__quadro(x), t);
      quadros.push({ t, jpeg: await page.screenshot({ type: 'jpeg', quality: 80 }) });
    }
  } finally { await fechar(); }
  return { quadros, errosPagina };
}

export async function renderizar(roteiro, saida, opts = {}) {
  const fps = opts.fps ?? 30;
  const dim = { ...dimensoes(roteiro, opts), marca: opts.marca, sombras: opts.sombras !== false, realista: opts.realista };
  const total = duracaoTotal(roteiro);
  const nQuadros = Math.ceil(total * fps);
  fs.mkdirSync(path.dirname(path.resolve(saida)), { recursive: true });
  const { page, fechar, errosPagina } = await abrir(roteiro, dim);

  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
  if (opts.audio) args.push('-i', opts.audio);
  args.push('-c:v', 'libx264', '-preset', opts.preset ?? 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps));
  if (opts.audio) args.push('-c:a', 'aac', '-b:a', '160k', '-shortest');
  args.push('-movflags', '+faststart', saida);
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const fim = new Promise((ok, falha) => ff.on('close', (c) => (c === 0 ? ok() : falha(new Error('ffmpeg terminou com código ' + c)))));

  const t0 = Date.now();
  try {
    for (let i = 0; i < nQuadros; i++) {
      await page.evaluate((t) => window.__quadro(t), i / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (opts.progresso && (i % fps === 0 || i === nQuadros - 1)) opts.progresso(i + 1, nQuadros, (Date.now() - t0) / 1000);
    }
  } finally {
    ff.stdin.end();
    await fechar();
  }
  await fim;
  if (errosPagina.length) console.warn('Avisos do motor 3D:', errosPagina.slice(0, 5).join(' | '));
  return { saida, duracao: total, quadros: nQuadros, segundos: (Date.now() - t0) / 1000 };
}
