// Motor de cena 3D — roda dentro do Chromium headless.
// Recebe um roteiro (JSON) e desenha qualquer instante t de forma determinística,
// para que o renderizador capture quadro a quadro.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Modo realista (padrão): luz de ambiente PBR, oclusão de ambiente, bloom, vinheta e materiais físicos.
let REALISTA = true;

// ---------------------------------------------------------------- utilidades
const CORES = {
  concreto: '#b8bec6', aco: '#6c7a89', tijolo: '#c8643b', bloco: '#c8643b', argamassa: '#d9d4cc',
  drywall: '#f1efe9', madeira: '#b5835a', solo: '#8d6e4f', grama: '#8fbf6a', agua: '#4fa3d9',
  vidro: '#9fd3e6', isolamento: '#f4c542', telha: '#b5452f', asfalto: '#5a5f66', calcada: '#cfcac2',
  destaque: '#e63946', calor: '#ff7b3a', frio: '#4cc9f0', carga: '#e63946', azul: '#1d3557',
  branco: '#ffffff', ceramica: '#e8dcc8', impermeabilizante: '#2b2d42', gesso: '#f7f5f0', reboco: '#e3ddd2',
};
const cor = (c, padrao) => new THREE.Color(CORES[c] || c || CORES[padrao] || padrao || '#cccccc');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = {
  linear: (k) => k,
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  back: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  bounce: (k) => {
    const n1 = 7.5625, d1 = 2.75;
    if (k < 1 / d1) return n1 * k * k;
    if (k < 2 / d1) return n1 * (k -= 1.5 / d1) * k + 0.75;
    if (k < 2.5 / d1) return n1 * (k -= 2.25 / d1) * k + 0.9375;
    return n1 * (k -= 2.625 / d1) * k + 0.984375;
  },
};
function rng(semente = 1) { // mulberry32 — determinístico
  let a = semente >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const v3 = (a, d = [0, 0, 0]) => new THREE.Vector3(...(Array.isArray(a) && a.length === 3 ? a : d));

function material(c, extra = {}) {
  if (REALISTA) return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.55, metalness: 0.02, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.9, ...extra });
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0.05, ...extra });
}
// textura procedural sutil (granulação de concreto/superfícies) para quebrar o aspecto "plástico"
let _rugosidade;
function texturaRugosidade() {
  if (_rugosidade) return _rugosidade;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  const rand = rng(99); const img = c.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const v = 150 + rand() * 90; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  c.putImageData(img, 0, 0);
  _rugosidade = new THREE.CanvasTexture(cv); _rugosidade.wrapS = _rugosidade.wrapT = THREE.RepeatWrapping; _rugosidade.repeat.set(3, 3);
  return _rugosidade;
}
// caixa com a base em y=0 (ou começando em x=0 quando inicioX) + contorno técnico
function caixa(w, h, d, c, { inicioX = false, topoZero = false, contorno = true, mat } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(inicioX ? w / 2 : 0, topoZero ? -h / 2 : h / 2, 0);
  const m = mat || material(c);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const grupo = new THREE.Group();
  grupo.add(mesh);
  const mats = [m];
  if (!mat && REALISTA) { m.roughnessMap = texturaRugosidade(); }
  if (contorno) {
    const lm = new THREE.LineBasicMaterial({ color: 0x1d3557, transparent: true, opacity: REALISTA ? 0.1 : 0.35 });
    grupo.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), lm));
    mats.push(lm);
  }
  return { grupo, mats, mesh };
}
function juntar(...partes) {
  const grupo = new THREE.Group(); const mats = [];
  for (const p of partes) { grupo.add(p.grupo); mats.push(...p.mats); }
  return { grupo, mats };
}

// ---------------------------------------------------------------- expansão de elementos compostos
function expandir(el) {
  const base = { animacao: el.animacao, cor: el.cor };
  const at = el.atraso || 0;
  if (el.tipo === 'estrutura') {
    const nx = el.vaos_x ?? 2, nz = el.vaos_z ?? 2, vao = el.vao ?? 4, pd = el.pe_direito ?? 3;
    const andares = el.andares ?? 3, int = el.intervalo ?? 1.2, s = el.secao_pilar ?? 0.3;
    const ox = (el.x ?? 0) - (nx * vao) / 2, oz = (el.z ?? 0) - (nz * vao) / 2;
    const filhos = [];
    let t = at;
    if (el.fundacao) {
      for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++)
        filhos.push({ id: `${el.id}/sapata-${i}-${k}`, tipo: 'sapata', x: ox + i * vao, z: oz + k * vao, atraso: t + (i + k) * 0.08, animacao: 'crescer' });
      t += int;
    }
    for (let f = 0; f < andares; f++) {
      const y0 = f * pd;
      for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++)
        filhos.push({ id: `${el.id}/pilar-${f}-${i}-${k}`, tipo: 'pilar', x: ox + i * vao, z: oz + k * vao, base_y: y0, altura: pd, secao: s, atraso: t + (i + k) * 0.05, animacao: 'crescer', cor: el.cor });
      const ty = t + int * 0.35;
      for (let k = 0; k <= nz; k++) for (let i = 0; i < nx; i++)
        filhos.push({ id: `${el.id}/viga-${f}-x${i}-${k}`, tipo: 'viga', de: [ox + i * vao, oz + k * vao], para: [ox + (i + 1) * vao, oz + k * vao], y: y0 + pd, atraso: ty, animacao: 'crescer', cor: el.cor });
      for (let i = 0; i <= nx; i++) for (let k = 0; k < nz; k++)
        filhos.push({ id: `${el.id}/viga-${f}-z${i}-${k}`, tipo: 'viga', de: [ox + i * vao, oz + k * vao], para: [ox + i * vao, oz + (k + 1) * vao], y: y0 + pd, atraso: ty, animacao: 'crescer', cor: el.cor });
      if (el.com_lajes !== false)
        filhos.push({ id: `${el.id}/laje-${f}`, tipo: 'laje', x: el.x ?? 0, z: el.z ?? 0, largura: nx * vao + 0.4, profundidade: nz * vao + 0.4, y: y0 + pd, atraso: t + int * 0.7, animacao: 'cair', cor: el.cor });
      t += int;
    }
    return filhos;
  }
  if (el.tipo === 'cidade') {
    const L = el.linhas ?? 4, C = el.colunas ?? 4, q = el.quadra ?? 10, r = el.rua ?? 4;
    const passo = q + r, w = C * passo + r, d = L * passo + r;
    const ox = (el.x ?? 0) - w / 2, oz = (el.z ?? 0) - d / 2;
    const rand = rng(el.semente ?? 7), maxA = el.andares_max ?? 14;
    const filhos = [{ id: `${el.id}/asfalto`, tipo: 'terreno', tamanho: Math.max(w, d) + 6, cor: 'asfalto', animacao: 'aparecer', atraso: at }];
    let n = 0;
    for (let l = 0; l < L; l++) for (let c = 0; c < C; c++) {
      const cx = ox + r + c * passo + q / 2, cz = oz + r + l * passo + q / 2;
      filhos.push({ id: `${el.id}/quadra-${l}-${c}`, tipo: 'laje', x: cx, z: cz, largura: q, profundidade: q, y: 0, espessura: 0.15, cor: 'calcada', animacao: 'aparecer', atraso: at + 0.2 });
      const verde = rand() < (el.parques ?? 0.12);
      if (verde) {
        for (let a = 0; a < 5; a++) filhos.push({ id: `${el.id}/arv-${l}-${c}-${a}`, tipo: 'arvore', x: cx + (rand() - 0.5) * q * 0.7, z: cz + (rand() - 0.5) * q * 0.7, altura: 3 + rand() * 2, atraso: at + 0.6 + n * 0.04, animacao: 'surgir' });
        continue;
      }
      const sub = rand() < 0.5 ? 1 : 2;
      for (let s = 0; s < sub * sub; s++) {
        const lado = q / sub - 1.2;
        const bx = cx - q / 2 + (s % sub + 0.5) * (q / sub), bz = cz - q / 2 + (Math.floor(s / sub) + 0.5) * (q / sub);
        const andares = Math.max(2, Math.round(Math.pow(rand(), 1.8) * maxA));
        filhos.push({ id: `${el.id}/predio-${n}`, tipo: 'predio', x: bx, z: bz, largura: lado, profundidade: lado, andares, atraso: at + 0.5 + n * 0.06, animacao: 'crescer', cor: el.cor });
        n++;
      }
    }
    return filhos;
  }
  return [{ ...el }];
}

// ---------------------------------------------------------------- construtores
const construtores = {
  terreno(e) {
    const g = new THREE.PlaneGeometry(e.tamanho ?? 40, e.tamanho ?? 40);
    g.rotateX(-Math.PI / 2);
    const m = material(cor(e.cor, 'grama'), { roughness: 1 });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.position.y = 0.002;
    const grupo = new THREE.Group(); grupo.add(mesh);
    grupo.position.set(e.x ?? 0, 0, e.z ?? 0);
    return { grupo, mats: [m], animPadrao: 'aparecer' };
  },
  solo(e) {
    const esp = e.espessura ?? 3;
    const p = caixa(e.largura ?? 12, esp, e.profundidade ?? 12, cor(e.cor, 'solo'), { topoZero: true });
    p.grupo.position.set(e.x ?? 0, 0, e.z ?? 0);
    return { ...p, opacidade: e.opacidade ?? 0.45, animPadrao: 'aparecer' };
  },
  pilar(e) {
    const s = e.secao ?? 0.3;
    const p = caixa(s, e.altura ?? 3, s, cor(e.cor, 'concreto'));
    p.grupo.position.set(e.x ?? 0, e.base_y ?? 0, e.z ?? 0);
    return { ...p, animPadrao: 'crescer', eixo: 'y' };
  },
  viga(e) {
    const a = e.de ?? [0, 0], b = e.para ?? [4, 0];
    const comp = Math.hypot(b[0] - a[0], b[1] - a[1]), h = e.altura ?? 0.45;
    const p = caixa(comp, h, e.largura ?? 0.2, cor(e.cor, 'concreto'), { inicioX: true });
    p.grupo.position.set(a[0], (e.y ?? 3) - h, a[1]);
    p.grupo.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    return { ...p, animPadrao: 'crescer', eixo: 'x' };
  },
  laje(e) {
    const p = caixa(e.largura ?? 8, e.espessura ?? 0.12, e.profundidade ?? 8, cor(e.cor, 'concreto'));
    p.grupo.position.set(e.x ?? 0, e.y ?? 3, e.z ?? 0);
    return { ...p, animPadrao: 'cair' };
  },
  sapata(e) {
    const prof = e.profundidade ?? 1.5, h = e.altura ?? 0.5, l = e.largura ?? 1.2;
    const sap = caixa(l, h, l, cor(e.cor, 'concreto'));
    const col = caixa(0.3, prof - h, 0.3, cor(e.cor, 'concreto'));
    col.grupo.position.y = h;
    const p = juntar(sap, col);
    p.grupo.position.set(e.x ?? 0, -prof, e.z ?? 0);
    return { ...p, animPadrao: 'crescer', eixo: 'y' };
  },
  estaca(e) {
    const prof = e.profundidade ?? 8, dia = e.diametro ?? 0.4;
    const g = new THREE.CylinderGeometry(dia / 2, dia / 2, prof, 20); g.translate(0, -prof / 2, 0);
    const m = material(cor(e.cor, 'concreto'));
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true;
    const bloco = caixa(dia * 2.4, 0.5, dia * 2.4, cor(e.cor, 'concreto'), { topoZero: true });
    const grupo = new THREE.Group(); grupo.add(mesh, bloco.grupo);
    grupo.position.set(e.x ?? 0, 0, e.z ?? 0);
    return { grupo, mats: [m, ...bloco.mats], animPadrao: 'crescer', eixo: 'y' };
  },
  parede(e) {
    const a = e.de ?? [0, 0], b = e.para ?? [4, 0], H = e.altura ?? 2.8;
    const comp = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const matTipo = e.material ?? 'bloco';
    const grupo = new THREE.Group();
    grupo.position.set(a[0], e.base_y ?? 0, a[1]);
    grupo.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (matTipo === 'bloco') {
      const esp = e.espessura ?? 0.14, bw = 0.39, bh = 0.19, j = 0.01;
      const linhas = Math.max(1, Math.round(H / (bh + j)));
      const blocos = [];
      for (let r = 0; r < linhas; r++) {
        const off = r % 2 ? (bw + j) / 2 : 0;
        for (let x = -off; x < comp - 0.01; x += bw + j) {
          const x0 = Math.max(0, x), x1 = Math.min(comp, x + bw);
          if (x1 - x0 > 0.03) blocos.push({ r, cx: (x0 + x1) / 2, w: x1 - x0, y: r * (bh + j) });
        }
      }
      const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
      const m = material(cor(e.cor, 'bloco'));
      const inst = new THREE.InstancedMesh(g, m, blocos.length);
      inst.castShadow = true; inst.receiveShadow = true;
      const arg = caixa(comp, linhas * (bh + j), esp * 0.96, cor('argamassa'), { inicioX: true, contorno: false });
      grupo.add(inst, arg.grupo);
      const tmp = new THREE.Object3D();
      let ultimo = -1;
      const montar = (p) => {
        const q = Math.round(p * 400) / 400; if (q === ultimo) return; ultimo = q;
        blocos.forEach((bl, i) => {
          const k = clamp(q * (linhas + 2) - bl.r - (bl.cx / comp) * 0.8);
          const s = ease.out(k);
          tmp.position.set(bl.cx, bl.y + (1 - s) * 1.2, 0);
          tmp.scale.set(bl.w * Math.max(s, 0.001), bh * Math.max(s, 0.001), esp);
          tmp.updateMatrix(); inst.setMatrixAt(i, tmp.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        arg.grupo.scale.y = Math.max(0.001, clamp(q * (linhas + 2) / linhas - 0.15));
      };
      montar(0);
      return { grupo, mats: [m, ...arg.mats], animPadrao: 'propria', durPadrao: 0.5 + linhas * 0.12, propria: montar };
    }
    if (matTipo === 'drywall') {
      const esp = e.espessura ?? 0.1, mats = [];
      const montantes = [];
      for (let x = 0; x <= comp + 0.01; x += 0.6) {
        const m = caixa(0.05, H, esp * 0.7, cor('aco'), { contorno: false });
        m.grupo.position.x = Math.min(x, comp - 0.025); grupo.add(m.grupo); mats.push(...m.mats); montantes.push(m.grupo);
      }
      const guia = caixa(comp, 0.04, esp * 0.7, cor('aco'), { inicioX: true, contorno: false });
      const guia2 = caixa(comp, 0.04, esp * 0.7, cor('aco'), { inicioX: true, contorno: false }); guia2.grupo.position.y = H - 0.04;
      const placaA = caixa(comp, H, 0.0125 * 2, cor(e.cor, 'drywall'), { inicioX: true });
      const placaB = caixa(comp, H, 0.0125 * 2, cor(e.cor, 'drywall'), { inicioX: true });
      placaA.grupo.position.z = esp / 2; placaB.grupo.position.z = -esp / 2;
      grupo.add(guia.grupo, guia2.grupo, placaA.grupo, placaB.grupo);
      mats.push(...guia.mats, ...guia2.mats, ...placaA.mats, ...placaB.mats);
      const montar = (p) => {
        montantes.forEach((g, i) => { g.scale.y = Math.max(0.001, ease.out(clamp(p * 2.2 - i * 0.04))); });
        const pa = ease.out(clamp(p * 2.5 - 1.2)), pb = ease.out(clamp(p * 2.5 - 1.5));
        placaA.grupo.scale.set(Math.max(pa, 0.001), 1, 1); placaB.grupo.scale.set(Math.max(pb, 0.001), 1, 1);
        placaA.grupo.visible = pa > 0.002; placaB.grupo.visible = pb > 0.002 && !(e.sem_placa_traseira);
      };
      montar(0);
      return { grupo, mats, animPadrao: 'propria', durPadrao: 3, propria: montar };
    }
    const c = matTipo === 'vidro' ? cor(e.cor, 'vidro') : cor(e.cor, 'concreto');
    const p = caixa(comp, H, e.espessura ?? 0.15, c, { inicioX: true, mat: matTipo === 'vidro' ? material(c, { transparent: true, opacity: 0.45 }) : undefined });
    grupo.add(p.grupo);
    return { grupo, mats: p.mats, animPadrao: 'crescer', eixo: 'y' };
  },
  camadas(e) {
    const lista = (e.camadas && e.camadas.length) ? e.camadas : [{ nome: 'camada', espessura: 0.1 }];
    const total = lista.reduce((s, c) => s + (c.espessura ?? 0.02), 0);
    const k = Math.max(1, (e.espessura_visual ?? 0.9) / total);
    const L = e.largura ?? 3, A = e.altura ?? 2.5, horiz = e.orientacao === 'horizontal';
    const grupo = new THREE.Group(); const mats = []; const partes = [];
    let acc = 0;
    lista.forEach((c, i) => {
      const t = Math.max(0.03, (c.espessura ?? 0.02) * k);
      const p = horiz ? caixa(L, t, A, cor(c.cor, '#cccccc')) : caixa(L, A, t, cor(c.cor, '#cccccc'));
      const pos = acc + t / 2;
      grupo.add(p.grupo); mats.push(...p.mats);
      partes.push({ g: p.grupo, pos, t, nome: c.nome, cm: c.espessura });
      acc += t;
    });
    partes.forEach((p) => { p.pos -= acc / 2; });
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 0, e.z ?? 0]));
    grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? 0);
    const explodir = (f, ctx) => {
      partes.forEach((p, i) => {
        const d = p.pos + (i - (partes.length - 1) / 2) * f * (e.separacao ?? 0.55);
        if (horiz) p.g.position.y = d + acc / 2; else p.g.position.z = d;
        if (ctx && f > 0.25 && e.rotulos !== false && p.nome) {
          const w = new THREE.Vector3(horiz ? L / 2 : L / 2, horiz ? p.g.position.y + p.t / 2 : A, horiz ? 0 : p.g.position.z);
          grupo.localToWorld(w);
          ctx.rotulo(`${e.id}#${i}`, p.nome, p.cm != null ? `${+(p.cm * 100).toFixed(1)} cm` : '', w, clamp((f - 0.25) / 0.4) * ctx.opacidade);
        }
      });
    };
    explodir(0);
    return { grupo, mats, animPadrao: 'surgir', explodir };
  },
  telhado(e) {
    const larg = e.largura ?? 8, prof = e.profundidade ?? 8, h = e.altura ?? 1.6, bei = e.beiral ?? 0.4;
    const s = new THREE.Shape();
    s.moveTo(-prof / 2 - bei, 0); s.lineTo(prof / 2 + bei, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: larg + bei * 2, bevelEnabled: false });
    g.translate(0, 0, -(larg + bei * 2) / 2); g.rotateY(Math.PI / 2);
    const m = material(cor(e.cor, 'telha'));
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true;
    const lm = new THREE.LineBasicMaterial({ color: 0x1d3557, transparent: true, opacity: 0.35 });
    const grupo = new THREE.Group(); grupo.add(mesh, new THREE.LineSegments(new THREE.EdgesGeometry(g), lm));
    grupo.position.set(e.x ?? 0, e.y ?? 3, e.z ?? 0);
    return { grupo, mats: [m, lm], animPadrao: 'cair' };
  },
  predio(e) {
    const andares = e.andares ?? 5, pd = e.pe_direito ?? 3, H = andares * pd, w = e.largura ?? 4, d = e.profundidade ?? 4;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#' + cor(e.cor, '#d8dde3').getHexString(); c2.fillRect(0, 0, 64, 64);
    c2.fillStyle = '#5d7d99'; c2.fillRect(8, 14, 48, 30);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(Math.max(1, Math.round(w / 2)), andares);
    const p = caixa(w, H, d, null, { mat: material(0xffffff, { map: tex }) });
    p.grupo.position.set(e.x ?? 0, 0, e.z ?? 0);
    return { ...p, animPadrao: 'crescer', eixo: 'y' };
  },
  arvore(e) {
    const h = e.altura ?? 4;
    const tg = new THREE.CylinderGeometry(0.12, 0.18, h * 0.45, 8); tg.translate(0, h * 0.225, 0);
    const cg = new THREE.IcosahedronGeometry(h * 0.3, 1); cg.translate(0, h * 0.68, 0);
    const mt = material(cor('madeira')), mc = material(cor(e.cor, '#5f9e4f'), { flatShading: true });
    const grupo = new THREE.Group();
    const a = new THREE.Mesh(tg, mt), b = new THREE.Mesh(cg, mc); a.castShadow = b.castShadow = true;
    grupo.add(a, b); grupo.position.set(e.x ?? 0, 0, e.z ?? 0);
    return { grupo, mats: [mt, mc], animPadrao: 'surgir' };
  },
  pessoa(e) {
    const h = e.altura ?? 1.75;
    const corpo = new THREE.CapsuleGeometry(h * 0.13, h * 0.5, 4, 12); corpo.translate(0, h * 0.4, 0);
    const cab = new THREE.SphereGeometry(h * 0.09, 16, 12); cab.translate(0, h * 0.9, 0);
    const m = material(cor(e.cor, 'azul'));
    const grupo = new THREE.Group(); const a = new THREE.Mesh(corpo, m), b = new THREE.Mesh(cab, m);
    a.castShadow = b.castShadow = true; grupo.add(a, b);
    grupo.position.set(e.x ?? 0, e.base_y ?? 0, e.z ?? 0);
    return { grupo, mats: [m], animPadrao: 'surgir' };
  },
  seta(e) {
    const a = v3(e.de, [0, 3, 0]), b = v3(e.para, [0, 0, 0]);
    const dir = b.clone().sub(a), L = dir.length(), r = e.espessura ?? 0.08;
    const m = material(cor(e.cor, 'destaque'), { emissive: cor(e.cor, 'destaque'), emissiveIntensity: 0.35 });
    const haste = new THREE.CylinderGeometry(r, r, Math.max(0.01, L - r * 4), 12); haste.rotateZ(-Math.PI / 2); haste.translate((L - r * 4) / 2, 0, 0);
    const ponta = new THREE.ConeGeometry(r * 2.6, r * 4, 16); ponta.rotateZ(-Math.PI / 2); ponta.translate(L - r * 2, 0, 0);
    const grupo = new THREE.Group(); grupo.add(new THREE.Mesh(haste, m), new THREE.Mesh(ponta, m));
    grupo.position.copy(a);
    grupo.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
    return { grupo, mats: [m], animPadrao: 'crescer', eixo: 'x' };
  },
  fluxo(e) {
    const a = v3(e.de, [0, 3, 0]), b = v3(e.para, [0, 0, 0]);
    const n = e.quantidade ?? 14, r = e.raio ?? 0.09, vel = e.velocidade ?? 1.2, esp = e.espalhamento ?? 0.6;
    const m = material(cor(e.cor, 'calor'), { emissive: cor(e.cor, 'calor'), emissiveIntensity: 0.6 });
    const g = new THREE.SphereGeometry(r, 12, 8);
    const grupo = new THREE.Group(); const rand = rng(e.semente ?? 3);
    const dir = b.clone().sub(a), L = dir.length();
    const perp1 = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)); if (perp1.lengthSq() < 1e-6) perp1.set(1, 0, 0); perp1.normalize();
    const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
    const parts = [];
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(g, m); grupo.add(mesh);
      parts.push({ mesh, fase: rand(), o1: (rand() - 0.5) * esp, o2: (rand() - 0.5) * esp });
    }
    const mover = (tl) => {
      parts.forEach((p) => {
        const k = ((tl * vel) / Math.max(L, 0.01) + p.fase) % 1;
        p.mesh.position.copy(a).addScaledVector(dir, k).addScaledVector(perp1, p.o1).addScaledVector(perp2, p.o2);
        const s = Math.sin(Math.PI * k); p.mesh.scale.setScalar(Math.max(0.001, s));
      });
    };
    mover(0);
    return { grupo, mats: [m], animPadrao: 'aparecer', tick: mover };
  },
  rotulo(e) {
    return { grupo: new THREE.Group(), mats: [], animPadrao: 'aparecer', rotulo: { texto: e.texto ?? '', sub: e.subtexto ?? '', pos: v3(e.posicao, [0, 2, 0]) } };
  },

  // ------------------------------------------------ IA / dados
  rede_neural(e) {
    const camadas = e.camadas_neuronios ?? e.camadas ?? [3, 5, 5, 2];
    const esp = e.espacamento ?? 2.2, vert = e.espacamento_vertical ?? 1.1, r = e.raio ?? 0.22;
    const grupo = new THREE.Group(); const mats = [];
    const mNo = material(cor(e.cor, '#457b9d'), { emissive: cor(e.cor, '#457b9d'), emissiveIntensity: 0.15 });
    const mLig = new THREE.LineBasicMaterial({ color: 0x1d3557, transparent: true, opacity: 0.25 });
    const mPulso = material(cor(e.cor_pulso, '#ffb703'), { emissive: cor(e.cor_pulso, '#ffb703'), emissiveIntensity: 0.9 });
    mats.push(mNo, mLig, mPulso);
    const gNo = new THREE.SphereGeometry(r, 20, 14), gP = new THREE.SphereGeometry(r * 0.38, 10, 8);
    const pos = camadas.map((n, i) => Array.from({ length: n }, (_, j) => new THREE.Vector3((i - (camadas.length - 1) / 2) * esp, (j - (n - 1) / 2) * vert, 0)));
    const nos = [];
    pos.forEach((cam, i) => cam.forEach((p) => { const m = new THREE.Mesh(gNo, mNo); m.position.copy(p); m.castShadow = true; grupo.add(m); nos.push({ m, i }); }));
    const pts = [], ligs = [];
    for (let i = 0; i < pos.length - 1; i++) for (const a of pos[i]) for (const b of pos[i + 1]) { pts.push(a, b); ligs.push({ a, b, i }); }
    grupo.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mLig));
    const rand = rng(e.semente ?? 5);
    const pulsos = ligs.filter(() => rand() < (e.densidade_pulsos ?? 0.35)).map((l) => { const m = new THREE.Mesh(gP, mPulso); grupo.add(m); return { ...l, m, f: rand() * 0.3 }; });
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 3, e.z ?? 0]));
    grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? 0);
    const nCam = pos.length - 1;
    const tick = (tl) => {
      const ciclo = e.ciclo ?? 2.4;
      const fase = ((tl % ciclo) / ciclo) * (nCam + 0.6);
      pulsos.forEach((p) => {
        const k = clamp(fase - p.i - p.f);
        p.m.visible = e.pulsos !== false && k > 0 && k < 1;
        p.m.position.lerpVectors(p.a, p.b, k);
      });
      nos.forEach((n) => { const ativ = clamp(1 - Math.abs(fase - n.i) * 1.5); n.m.scale.setScalar(1 + 0.35 * ativ); });
    };
    tick(0);
    return { grupo, mats, animPadrao: 'surgir', tick };
  },
  servidor(e) {
    const h = e.altura ?? 2, grupo = new THREE.Group(); const mats = [];
    const corpo = caixa(0.9, h, 0.9, cor(e.cor, '#2b2d42')); grupo.add(corpo.grupo); mats.push(...corpo.mats);
    const mLed = material(cor('#06d6a0'), { emissive: cor('#06d6a0'), emissiveIntensity: 1 });
    const leds = [];
    for (let y = 0.25; y < h - 0.1; y += 0.28) {
      const fat = caixa(0.8, 0.2, 0.02, cor('#3d405b'), { contorno: false }); fat.grupo.position.set(0, y - 0.1, 0.46); grupo.add(fat.grupo); mats.push(...fat.mats);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mLed); l.position.set(0.3, y, 0.48); grupo.add(l); leds.push(l);
    }
    mats.push(mLed);
    grupo.position.set(e.x ?? 0, e.base_y ?? 0, e.z ?? 0);
    const tick = (tl) => leds.forEach((l, i) => { l.visible = Math.sin(tl * 7 + i * 2.3) > -0.3; });
    return { grupo, mats, animPadrao: 'crescer', eixo: 'y', tick };
  },
  cubo(e) {
    const s = e.tamanho ?? 1;
    const p = caixa(s, s, s, cor(e.cor, '#457b9d'));
    p.grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 0, e.z ?? 0]));
    return { ...p, animPadrao: 'surgir' };
  },
  esfera(e) {
    const m = material(cor(e.cor, '#457b9d'), { emissive: cor(e.cor, '#457b9d'), emissiveIntensity: e.brilho ?? 0.1 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(e.raio ?? 0.6, 32, 20), m); mesh.castShadow = true;
    const grupo = new THREE.Group(); grupo.add(mesh); grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 1, e.z ?? 0]));
    return { grupo, mats: [m], animPadrao: 'surgir' };
  },
  linha(e) {
    const a = v3(e.de, [0, 0, 0]), b = v3(e.para, [2, 0, 0]);
    const m = new THREE.LineBasicMaterial({ color: cor(e.cor, 'azul'), transparent: true, opacity: 0.8 });
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), b.clone().sub(a)]);
    const grupo = new THREE.Group(); grupo.add(new THREE.Line(g, m)); grupo.position.copy(a);
    return { grupo, mats: [m], animPadrao: 'aparecer' };
  },
  globo(e) {
    const R = e.raio ?? 2.5;
    const m = material(cor(e.cor, '#a8dadc'), { roughness: 0.6 });
    const lm = new THREE.LineBasicMaterial({ color: 0x1d3557, transparent: true, opacity: 0.3 });
    const grupo = new THREE.Group();
    const esf = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), m); esf.castShadow = true;
    grupo.add(esf, new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R * 1.002, 18, 12)), lm));
    const rand = rng(e.semente ?? 11); const mc = material(cor('#8fbf6a'), { flatShading: true });
    for (let i = 0; i < 9; i++) { // "continentes" estilizados
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(R * (0.25 + rand() * 0.2), 1), mc);
      const th = rand() * Math.PI * 2, ph = 0.35 + rand() * 2.4;
      c.position.setFromSphericalCoords(R * 0.86, ph, th); c.scale.set(1, 0.55, 1); c.lookAt(0, 0, 0); grupo.add(c);
    }
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? R, e.z ?? 0]));
    const tick = (tl) => { grupo.rotation.y = tl * (e.rotacao_velocidade ?? 0.25); };
    return { grupo, mats: [m, lm, mc], animPadrao: 'surgir', tick };
  },
  multidao(e) {
    const n = e.quantidade ?? 20, R = e.raio ?? 4, rand = rng(e.semente ?? 2);
    const grupo = new THREE.Group(); const paleta = ['#1d3557', '#457b9d', '#e63946', '#2a9d8f', '#f4a261', '#6d597a'];
    const mats = paleta.map((c) => material(cor(c)));
    const corpo = new THREE.CapsuleGeometry(0.22, 0.85, 4, 10); corpo.translate(0, 0.7, 0);
    const cab = new THREE.SphereGeometry(0.16, 12, 8); cab.translate(0, 1.55, 0);
    const pessoas = [];
    for (let i = 0; i < n; i++) {
      const m = mats[Math.floor(rand() * mats.length)];
      const p = new THREE.Group(); const a = new THREE.Mesh(corpo, m), b = new THREE.Mesh(cab, m); a.castShadow = true; p.add(a, b);
      const ang = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * R; p.position.set(Math.cos(ang) * rr, 0, Math.sin(ang) * rr);
      grupo.add(p); pessoas.push({ p, f: rand() * 6 });
    }
    grupo.position.set(e.x ?? 0, 0, e.z ?? 0);
    const tick = (tl) => pessoas.forEach((q) => { q.p.position.y = Math.max(0, Math.sin(tl * 4 + q.f)) * 0.05; });
    return { grupo, mats, animPadrao: 'surgir', tick };
  },

  // ------------------------------------------------ economia
  grafico_barras(e) {
    const vals = e.valores ?? [3, 5, 2, 6], rot = e.rotulos ?? [];
    const lb = e.largura_barra ?? 0.8, gap = e.espaco ?? 0.5, esc = e.escala ?? 1;
    const grupo = new THREE.Group(); const mats = []; const barras = [];
    const cores = [].concat(e.cores || e.cor || '#457b9d');
    vals.forEach((v, i) => {
      const h = Math.max(0.02, Math.abs(v) * esc);
      const b = caixa(lb, h, lb, cor(cores[i % cores.length]));
      b.grupo.position.x = (i - (vals.length - 1) / 2) * (lb + gap);
      grupo.add(b.grupo); mats.push(...b.mats); barras.push({ g: b.grupo, h, v, nome: rot[i] });
    });
    const base = caixa(vals.length * (lb + gap) + 0.4, 0.06, lb + 0.6, cor('#ffffff')); base.grupo.position.y = -0.06; grupo.add(base.grupo); mats.push(...base.mats);
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 0, e.z ?? 0]));
    grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? 0);
    const montar = (p, ctx) => barras.forEach((b, i) => {
      const k = ease.out(clamp(p * (barras.length * 0.35 + 1) - i * 0.35));
      b.g.scale.y = Math.max(0.001, k);
      if (ctx && k > 0.1) {
        const w = new THREE.Vector3(0, b.h * k + 0.15, 0); b.g.localToWorld(w);
        ctx.rotulo(`${e.id}#${i}`, b.nome ?? '', e.mostrar_valores === false ? '' : `${e.prefixo ?? ''}${+(b.v * k).toFixed(e.casas ?? 0)}${e.sufixo ?? ''}`, w, ctx.opacidade * clamp(k * 2));
      }
    });
    montar(0);
    return { grupo, mats, animPadrao: 'propria', durPadrao: 1 + vals.length * 0.35, propria: montar };
  },
  grafico_linha(e) {
    const vals = e.valores ?? [1, 2, 1.5, 3, 4], L = e.largura ?? 8, A = e.altura ?? 4;
    const max = Math.max(...vals), min = Math.min(0, ...vals);
    const pts = vals.map((v, i) => new THREE.Vector3((i / (vals.length - 1) - 0.5) * L, ((v - min) / (max - min || 1)) * A, 0));
    const curva = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
    const grupo = new THREE.Group();
    const m = material(cor(e.cor, 'destaque'), { emissive: cor(e.cor, 'destaque'), emissiveIntensity: 0.3 });
    const segs = 200; const tubo = new THREE.TubeGeometry(curva, segs, e.espessura ?? 0.07, 8, false);
    const mesh = new THREE.Mesh(tubo, m); mesh.castShadow = true; grupo.add(mesh);
    const lm = new THREE.LineBasicMaterial({ color: 0x1d3557, transparent: true, opacity: 0.5 });
    grupo.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-L / 2, 0, 0), new THREE.Vector3(L / 2 + 0.3, 0, 0), new THREE.Vector3(-L / 2, 0, 0), new THREE.Vector3(-L / 2, A + 0.3, 0)]), lm));
    const ponta = new THREE.Mesh(new THREE.SphereGeometry((e.espessura ?? 0.07) * 2.6, 16, 10), m); grupo.add(ponta);
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 0.5, e.z ?? 0]));
    grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? 0);
    const total = tubo.index.count;
    const montar = (p, ctx) => {
      const k = ease.inOut(p);
      tubo.setDrawRange(0, Math.max(3, Math.floor((total * k) / 6) * 6));
      ponta.position.copy(curva.getPoint(Math.max(0.0001, k)));
      if (ctx && e.rotulo_final && k > 0.98) { const w = ponta.position.clone().add(new THREE.Vector3(0, 0.4, 0)); grupo.localToWorld(w); ctx.rotulo(e.id + '#fim', e.rotulo_final, e.subtexto ?? '', w, ctx.opacidade); }
    };
    montar(0);
    return { grupo, mats: [m, lm], animPadrao: 'propria', durPadrao: 2.5, propria: montar };
  },
  moedas(e) {
    const n = e.quantidade ?? 10, r = e.raio ?? 0.35, h = 0.08;
    const g = new THREE.CylinderGeometry(r, r, h, 28); g.translate(0, h / 2, 0);
    const m = material(cor(e.cor, '#f2c14e'), { metalness: 0.6, roughness: 0.35 });
    const grupo = new THREE.Group(); const lista = [];
    const pilhas = e.pilhas ?? 1;
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(g, m); c.castShadow = true;
      const pilha = i % pilhas, nivel = Math.floor(i / pilhas);
      c.position.set((pilha - (pilhas - 1) / 2) * r * 2.3, nivel * (h + 0.005), 0); grupo.add(c); lista.push({ c, y: c.position.y });
    }
    grupo.position.set(e.x ?? 0, e.base_y ?? 0, e.z ?? 0);
    const montar = (p) => lista.forEach((q, i) => {
      const k = clamp(p * (n * 0.15 + 1) - i * 0.15);
      q.c.visible = k > 0; q.c.position.y = q.y + (1 - ease.bounce(k)) * 3;
    });
    montar(0);
    return { grupo, mats: [m], animPadrao: 'propria', durPadrao: 0.8 + n * 0.12, propria: montar };
  },

  // ------------------------------------------------ neurociência
  cerebro(e) {
    const esc = e.escala ?? 1, grupo = new THREE.Group();
    const m = REALISTA
      ? new THREE.MeshPhysicalMaterial({ color: cor(e.cor, '#e9a3a9'), roughness: 0.45, sheen: 1, sheenColor: new THREE.Color('#ffd0d6'), sheenRoughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35 })
      : material(cor(e.cor, '#f4a6b7'), { roughness: 0.55 });
    const ruido = (v) => Math.sin(v.x * 7.1) * Math.sin(v.y * 6.3 + 1.7) * Math.sin(v.z * 5.7 + 0.4) + 0.6 * Math.sin(v.x * 13.3 + v.z * 9.1) * Math.sin(v.y * 11.7 - v.z * 4.3);
    const mats = [m];
    for (const lado of [-1, 1]) {
      const g0 = new THREE.IcosahedronGeometry(1, REALISTA ? 48 : 24); g0.deleteAttribute('normal'); g0.deleteAttribute('uv');
      const g = mergeVertices(g0); const p = g.attributes.position; const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const giros = Math.abs(Math.sin(v.x * 17 + Math.sin(v.y * 9) * 2.2 + v.z * 6)) * Math.abs(Math.sin(v.y * 15 + Math.sin(v.z * 8) * 2 + v.x * 3));
        const sulcos = 1 + 0.045 * ruido(v) + 0.05 * giros;
        v.multiplyScalar(sulcos); v.set(v.x * 0.62, v.y * 0.78, v.z * 1.05);
        if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.5;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      const h = new THREE.Mesh(g, m); h.position.x = lado * 0.5; h.castShadow = true; grupo.add(h);
    }
    const cg = new THREE.SphereGeometry(0.42, 24, 16); const ce = new THREE.Mesh(cg, material(cor('#e88fa3')));
    ce.scale.set(1.3, 0.6, 0.8); ce.position.set(0, -0.35, -0.75); grupo.add(ce); mats.push(ce.material);
    const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.8, 12), ce.material); tronco.position.set(0, -0.7, -0.35); grupo.add(tronco);
    const regioes = (e.regioes || []).map((rg, i) => {
      const mr = material(cor(rg.cor, 'destaque'), { emissive: cor(rg.cor, 'destaque'), emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
      const s = new THREE.Mesh(new THREE.SphereGeometry(rg.raio ?? 0.28, 20, 14), mr);
      s.position.set(...(rg.posicao ?? [0, 0.6, 0.6])); grupo.add(s); mats.push(mr);
      return { s, rg, i };
    });
    grupo.scale.setScalar(esc * 1.6);
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 2.5, e.z ?? 0]));
    grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? -30);
    const tick = (tl, ctx) => regioes.forEach((r) => {
      const k = 1 + 0.15 * Math.sin(tl * 5 + r.i);
      r.s.scale.setScalar(k);
      if (ctx && r.rg.nome) { const w = r.s.position.clone().add(new THREE.Vector3(0, 0.35, 0)); grupo.localToWorld(w); ctx.rotulo(`${e.id}#${r.i}`, r.rg.nome, r.rg.descricao ?? '', w, ctx.opacidade); }
    });
    return { grupo, mats, animPadrao: 'surgir', tick };
  },
  neuronio(e) {
    const a = v3(e.de, [-3, 2, 0]), b = v3(e.para, [3, 2, 0]);
    const m = material(cor(e.cor, '#9b5de5'), { emissive: cor(e.cor, '#9b5de5'), emissiveIntensity: 0.15 });
    const mp = material(cor('#ffb703'), { emissive: cor('#ffb703'), emissiveIntensity: 1 });
    const grupo = new THREE.Group(); const rand = rng(e.semente ?? 9);
    const soma = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 2), m); soma.position.copy(a); grupo.add(soma);
    for (let i = 0; i < 6; i++) { // dendritos
      const d = new THREE.Vector3(rand() - 0.9, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(1 + rand());
      const c = new THREE.CatmullRomCurve3([a.clone(), a.clone().add(d.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, (rand() - 0.5) * 0.4, 0)), a.clone().add(d)]);
      grupo.add(new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.05, 6), m));
    }
    const meio = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.4, 0));
    const axon = new THREE.CatmullRomCurve3([a, meio, b]);
    grupo.add(new THREE.Mesh(new THREE.TubeGeometry(axon, 40, 0.08, 8), m));
    const term = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), m); term.position.copy(b); grupo.add(term);
    const pulso = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), mp); grupo.add(pulso);
    const tick = (tl) => { const k = (tl / (e.ciclo ?? 1.6)) % 1; pulso.position.copy(axon.getPoint(k)); pulso.visible = e.pulsos !== false; };
    tick(0);
    return { grupo, mats: [m, mp], animPadrao: 'surgir', tick };
  },

  // ------------------------------------------------ sistemas
  sistema(e) {
    const comps = e.componentes ?? [], cons = e.conexoes ?? [], int = e.intervalo ?? 0.5;
    const grupo = new THREE.Group(); const mats = []; const nos = new Map();
    const paleta = ['#457b9d', '#2a9d8f', '#f4a261', '#9b5de5', '#1d3557', '#e76f51'];
    comps.forEach((c, i) => {
      const cc = cor(c.cor || paleta[i % paleta.length]);
      const m = material(cc, { emissive: cc, emissiveIntensity: 0.12 }); mats.push(m);
      const geo = c.forma === 'cubo' ? new THREE.BoxGeometry(0.9, 0.9, 0.9) : new THREE.SphereGeometry(0.5, 28, 18);
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.position.set(...c.posicao); grupo.add(mesh);
      nos.set(c.id, { mesh, m, c, i, cc, t: 0.2 + i * int });
    });
    const arestas = cons.map((k, j) => {
      const A = nos.get(k.de), B = nos.get(k.para); if (!A || !B) return null;
      const a = A.mesh.position, b = B.mesh.position, fb = k.tipo === 'feedback';
      const meio = a.clone().lerp(b, 0.5); const d = b.clone().sub(a);
      const reverso = cons.some((o) => o.de === k.para && o.para === k.de);
      const lado = new THREE.Vector3(-d.y, d.x, 0.001).normalize().multiplyScalar(fb ? 1.3 : reverso ? 0.6 : 0.3);
      if (lado.lengthSq() < 0.01) lado.set(0, fb ? 1.3 : 0.3, 0);
      const curva = new THREE.QuadraticBezierCurve3(a.clone(), meio.add(lado).add(new THREE.Vector3(0, 0, fb ? 0.6 : 0)), b.clone());
      const cc = cor(k.cor || (fb ? '#e63946' : '#1d3557'));
      const m = material(cc, { emissive: cc, emissiveIntensity: 0.2, transparent: true, opacity: 0.75 }); mats.push(m);
      const tubo = new THREE.TubeGeometry(curva, 48, fb ? 0.05 : 0.04, 6, false);
      const mesh = new THREE.Mesh(tubo, m); grupo.add(mesh);
      const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 12), m);
      const pt = curva.getPoint(0.82), tg = curva.getTangent(0.82); ponta.position.copy(pt); ponta.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg); grupo.add(ponta);
      const mp = material(cor('#ffb703'), { emissive: cor('#ffb703'), emissiveIntensity: 0.9 }); mats.push(mp);
      const parts = [0, 0.33, 0.66].map(() => { const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mp); grupo.add(p); return p; });
      return { k, A, B, curva, mesh, ponta, parts, total: tubo.index.count, t: Math.max(A.t, B.t) + 0.3 + j * 0.08 };
    }).filter(Boolean);
    grupo.position.set(...(e.posicao ?? [0, 2.5, 0])); grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? 0);
    // propagação de uma perturbação (BFS pelas conexões)
    const atraso = new Map();
    if (e.perturbar && nos.has(e.perturbar.componente)) {
      const fila = [[e.perturbar.componente, 0]]; atraso.set(e.perturbar.componente, 0);
      while (fila.length) { const [id, d] = fila.shift(); for (const a of arestas) if (a.k.de === id && !atraso.has(a.k.para)) { atraso.set(a.k.para, d + 1); fila.push([a.k.para, d + 1]); } }
    }
    const corPert = cor(e.perturbar?.cor || '#e63946');
    const tick = (tl, ctx) => {
      for (const n of nos.values()) {
        const k = ease.back(clamp((tl - n.t) / 0.5)); n.mesh.scale.setScalar(Math.max(0.001, k));
        let flash = 0;
        if (atraso.has(n.c.id)) { const t0 = (e.perturbar.em ?? 2) + atraso.get(n.c.id) * 0.7; flash = clamp(1 - Math.abs(tl - t0 - 0.35) / 0.6) + (tl > t0 + 0.35 ? 0.35 : 0); }
        n.m.emissive.copy(n.cc).lerp(corPert, clamp(flash)); n.m.emissiveIntensity = 0.12 + 0.6 * clamp(flash);
        if (flash > 0.9) n.mesh.scale.multiplyScalar(1 + 0.12 * Math.sin(tl * 12));
        if (ctx && k > 0.3 && n.c.nome) { const w = n.mesh.position.clone().add(new THREE.Vector3(0, 0.75, 0)); grupo.localToWorld(w); ctx.rotulo(`${e.id}#${n.c.id}`, n.c.nome, n.c.descricao ?? '', w, ctx.opacidade * clamp(k)); }
      }
      for (const a of arestas) {
        const k = ease.inOut(clamp((tl - a.t) / 0.6));
        a.mesh.geometry.setDrawRange(0, Math.floor((a.total * k) / 3) * 3); a.ponta.visible = k > 0.85;
        a.parts.forEach((p, i) => { const f = ((tl * 0.5 + i / 3) % 1); p.visible = k >= 1; p.position.copy(a.curva.getPoint(f)); });
        if (ctx && k >= 1 && a.k.rotulo) { const w = a.curva.getPoint(0.5).add(new THREE.Vector3(0, 0.25, 0)); grupo.localToWorld(w); ctx.rotulo(`${e.id}~${a.k.de}-${a.k.para}`, a.k.rotulo, '', w, ctx.opacidade * 0.9); }
      }
    };
    return { grupo, mats, animPadrao: 'aparecer', tick };
  },

  yin_yang(e) {
    const R = e.raio ?? 1.5, esp = R * 0.18, grupo = new THREE.Group();
    const mb = material(cor('#ffffff'), { roughness: 0.4 }), mp = material(cor('#1d1d1d'), { roughness: 0.4 });
    const metade = (m, rot) => {
      const s = new THREE.Shape();
      s.absarc(0, 0, R, Math.PI / 2, -Math.PI / 2, false);
      s.absarc(0, -R / 2, R / 2, -Math.PI / 2, Math.PI / 2, true);
      s.absarc(0, R / 2, R / 2, -Math.PI / 2, Math.PI / 2, false);
      const g = new THREE.ExtrudeGeometry(s, { depth: esp, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, curveSegments: 48 });
      g.translate(0, 0, -esp / 2); const mesh = new THREE.Mesh(g, m); mesh.rotation.z = rot; mesh.castShadow = true; return mesh;
    };
    grupo.add(metade(mb, 0), metade(mp, Math.PI));
    const ponto = (m, y) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.14, R * 0.14, esp * 1.3, 32), m); p.rotation.x = Math.PI / 2; p.position.y = y; return p; };
    grupo.add(ponto(mp, R / 2), ponto(mb, -R / 2));
    grupo.position.set(...(e.posicao ?? [0, R + 0.4, 0]));
    const tick = (tl) => { grupo.rotation.z = -tl * (e.velocidade ?? 0.6); grupo.rotation.y = Math.sin(tl * 0.5) * 0.35; };
    return { grupo, mats: [mb, mp], animPadrao: 'surgir', tick };
  },

  // ------------------------------------------------ escola / ciências
  molecula(e) {
    const CPK = { H: ['#ffffff', 0.25], C: ['#3d3d3d', 0.38], O: ['#e63946', 0.36], N: ['#3a6ff7', 0.36], Na: ['#9b5de5', 0.45], Cl: ['#2a9d8f', 0.45], S: ['#ffd166', 0.42], P: ['#f4a261', 0.42], Fe: ['#b5651d', 0.45], Ca: ['#8d99ae', 0.45] };
    const grupo = new THREE.Group(); const mats = [];
    const mLig = material(cor('#adb5bd')); mats.push(mLig);
    const at = e.atomos ?? [{ elemento: 'O', posicao: [0, 0, 0] }, { elemento: 'H', posicao: [0.75, 0.55, 0] }, { elemento: 'H', posicao: [-0.75, 0.55, 0] }];
    const cache = {};
    at.forEach((a) => {
      const [c, r] = CPK[a.elemento] || [a.cor || '#8d99ae', 0.38];
      const m = cache[a.elemento] ??= (mats.push(material(cor(a.cor || c), { roughness: 0.4 })), mats[mats.length - 1]);
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), m); s.position.set(...a.posicao); s.castShadow = true; grupo.add(s);
    });
    for (const [i, j] of e.ligacoes ?? at.slice(1).map((_, k) => [0, k + 1])) {
      if (!at[i] || !at[j]) continue;
      const A = new THREE.Vector3(...at[i].posicao), B = new THREE.Vector3(...at[j].posicao), d = B.clone().sub(A);
      const cil = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, d.length(), 10), mLig);
      cil.position.copy(A).addScaledVector(d, 0.5); cil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); grupo.add(cil);
    }
    grupo.scale.setScalar(e.escala ?? 1.5);
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 2.5, e.z ?? 0]));
    const tick = (tl) => { if (e.girar !== false) grupo.rotation.y = tl * 0.6; };
    return { grupo, mats, animPadrao: 'surgir', tick };
  },
  onda(e) {
    const L = e.comprimento_total ?? 8, A = e.amplitude ?? 0.8, lambda = e.comprimento_onda ?? 2, n = 160;
    const m = material(cor(e.cor, '#4cc9f0'), { emissive: cor(e.cor, '#4cc9f0'), emissiveIntensity: 0.4 });
    const pts = Array.from({ length: n }, (_, i) => new THREE.Vector3((i / (n - 1)) * L, 0, 0));
    const curva = new THREE.CatmullRomCurve3(pts);
    let tubo = new THREE.Mesh(new THREE.TubeGeometry(curva, n, e.espessura ?? 0.06, 8), m);
    const grupo = new THREE.Group(); grupo.add(tubo);
    grupo.position.set(...(e.posicao ?? [-(L / 2), 2, 0])); grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? 0);
    const tick = (tl) => {
      pts.forEach((p, i) => { p.y = A * Math.sin((2 * Math.PI * (p.x - tl * (e.velocidade ?? 1.5))) / lambda); });
      const g = new THREE.TubeGeometry(curva, n, e.espessura ?? 0.06, 8); tubo.geometry.dispose(); tubo.geometry = g;
    };
    tick(0);
    return { grupo, mats: [m], animPadrao: 'aparecer', tick };
  },
  celula(e) {
    const R = e.raio ?? 2, grupo = new THREE.Group();
    const mm = material(cor(e.cor, '#a8dadc'), { transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    const mem = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28, 0, Math.PI * 1.5), mm); grupo.add(mem);
    const mn = material(cor('#9b5de5')); const nuc = new THREE.Mesh(new THREE.SphereGeometry(R * 0.32, 28, 18), mn); nuc.castShadow = true; grupo.add(nuc);
    const mats = [mm, mn];
    if (e.organelas !== false) {
      const rand = rng(e.semente ?? 4); const mo = material(cor('#f4a261')), mr = material(cor('#2a9d8f')); mats.push(mo, mr);
      for (let i = 0; i < 9; i++) {
        const o = new THREE.Mesh(i % 3 ? new THREE.SphereGeometry(R * 0.07, 10, 8) : new THREE.CapsuleGeometry(R * 0.07, R * 0.18, 4, 8), i % 3 ? mr : mo);
        o.position.setFromSphericalCoords(R * (0.45 + rand() * 0.4), rand() * Math.PI, rand() * Math.PI * 1.5); o.rotation.set(rand() * 3, rand() * 3, 0); grupo.add(o);
      }
    }
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? R + 0.2, e.z ?? 0]));
    const tick = (tl) => { grupo.rotation.y = -0.6 + Math.sin(tl * 0.4) * 0.3; nuc.scale.setScalar(1 + 0.03 * Math.sin(tl * 3)); };
    return { grupo, mats, animPadrao: 'surgir', tick };
  },
  linha_tempo(e) {
    const ev = e.eventos ?? [{ ano: '1900', texto: 'marco' }], L = e.comprimento ?? 9, int = e.intervalo ?? 0.8;
    const grupo = new THREE.Group(); const mats = [];
    const eixo = caixa(L, 0.08, 0.08, cor(e.cor, 'azul'), { inicioX: true, contorno: false }); eixo.grupo.position.x = -L / 2; grupo.add(eixo.grupo); mats.push(...eixo.mats);
    const mm = material(cor('destaque'), { emissive: cor('destaque'), emissiveIntensity: 0.3 }); mats.push(mm);
    const marcos = ev.map((x, i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), mm); s.position.x = ev.length === 1 ? 0 : -L / 2 + (i / (ev.length - 1)) * L; grupo.add(s); return { s, x };
    });
    grupo.position.set(...(e.posicao ?? [0, 1, 0])); grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? 0);
    const tick = (tl, ctx) => {
      eixo.grupo.scale.x = Math.max(0.001, ease.out(clamp(tl / Math.max(1, ev.length * int))));
      marcos.forEach((m, i) => {
        const k = ease.back(clamp((tl - 0.3 - i * int) / 0.5)); m.s.scale.setScalar(Math.max(0.001, k));
        if (ctx && k > 0.2) { const w = m.s.position.clone().add(new THREE.Vector3(0, i % 2 ? -0.35 : 0.5, 0)); grupo.localToWorld(w); ctx.rotulo(`${e.id}#${i}`, String(m.x.ano), m.x.texto || '', w, ctx.opacidade * clamp(k)); }
      });
    };
    return { grupo, mats, animPadrao: 'aparecer', tick };
  },
  questao(e) {
    return { grupo: new THREE.Group(), mats: [], animPadrao: 'aparecer', cartao: e };
  },
  equacao(e) {
    return { grupo: new THREE.Group(), mats: [], animPadrao: 'aparecer', rotulo: { texto: e.texto ?? '', sub: e.subtexto ?? '', pos: v3(e.posicao, [0, 3, 0]), classe: 'rotulo equacao' } };
  },

  // ------------------------------------------------ segurança
  escudo(e) {
    const s = new THREE.Shape();
    s.moveTo(0, 1.3); s.quadraticCurveTo(0.6, 1.15, 1, 1.2); s.lineTo(1, 0.3); s.quadraticCurveTo(0.9, -0.6, 0, -1.1);
    s.quadraticCurveTo(-0.9, -0.6, -1, 0.3); s.lineTo(-1, 1.2); s.quadraticCurveTo(-0.6, 1.15, 0, 1.3);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 }); g.center();
    const m = material(cor(e.cor, '#2a9d8f'), { metalness: 0.3, roughness: 0.4 });
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true;
    const marca = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 10, 30), material(cor('#ffffff'))); marca.position.z = 0.2;
    const grupo = new THREE.Group(); grupo.add(mesh, marca);
    grupo.scale.setScalar(e.escala ?? 1.2);
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 2, e.z ?? 0]));
    grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? 0);
    const tick = (tl) => { mesh.rotation.y = Math.sin(tl * 1.2) * 0.25; marca.rotation.y = mesh.rotation.y; };
    return { grupo, mats: [m, marca.material], animPadrao: 'surgir', tick };
  },
  cadeado(e) {
    const m = material(cor(e.cor, '#f2c14e'), { metalness: 0.6, roughness: 0.35 });
    const ma = material(cor('#adb5bd'), { metalness: 0.8, roughness: 0.25 });
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.5), m); corpo.castShadow = true;
    const arco = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.1, 12, 24, Math.PI), ma); arco.castShadow = true;
    const furo = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.52, 12), material(cor('#2b2d42'))); furo.rotation.x = Math.PI / 2; furo.position.y = 0.05;
    const grupo = new THREE.Group(); grupo.add(corpo, arco, furo);
    grupo.scale.setScalar(e.escala ?? 1);
    grupo.position.set(...(e.posicao ?? [e.x ?? 0, e.y ?? 1.5, e.z ?? 0]));
    const abrirEm = e.abrir_em; // segundos após aparecer (opcional)
    const tick = (tl) => { const k = e.aberto ? 1 : (abrirEm != null ? ease.out(clamp((tl - abrirEm) / 0.6)) : 0); arco.position.y = 0.55 + k * 0.45; arco.rotation.y = k * 1.2; };
    tick(0);
    return { grupo, mats: [m, ma, furo.material], animPadrao: 'surgir', tick };
  },
  computador(e) {
    const grupo = new THREE.Group(); const mats = [];
    const tela = caixa(1.6, 1, 0.08, cor('#2b2d42')); tela.grupo.position.y = 0.55; mats.push(...tela.mats);
    const mt = material(cor(e.cor_tela, '#a8dadc'), { emissive: cor(e.cor_tela, '#a8dadc'), emissiveIntensity: 0.6 });
    const vidro = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.85), mt); vidro.position.set(0, 1.05, 0.045); mats.push(mt);
    const pe = caixa(0.15, 0.55, 0.1, cor('#3d405b')); const base = caixa(0.7, 0.05, 0.4, cor('#3d405b')); mats.push(...pe.mats, ...base.mats);
    grupo.add(tela.grupo, vidro, pe.grupo, base.grupo);
    grupo.position.set(e.x ?? 0, e.base_y ?? 0, e.z ?? 0); grupo.rotation.y = THREE.MathUtils.degToRad(e.rotacao ?? 0);
    return { grupo, mats, animPadrao: 'surgir' };
  },
};

// ---------------------------------------------------------------- motor
const estado = {};

function legendas(narracao, inicio, dur, porBloco) {
  const palavras = (narracao || '').split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  const blocos = [];
  for (let i = 0; i < palavras.length; i += porBloco) blocos.push(palavras.slice(i, i + porBloco));
  const util = Math.max(0.5, dur - 0.35);
  let t = inicio + 0.15; const out = [];
  for (const b of blocos) {
    const d = (b.length / palavras.length) * util;
    out.push({ t0: t, t1: t + d, html: b.join(' ').replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/\*/g, '') });
    t += d;
  }
  return out;
}

window.__iniciar = async function (roteiro, opts) {
  const { largura: W, altura: H } = opts;
  const vertical = H > W;
  const palco = document.getElementById('palco');
  palco.style.width = W + 'px'; palco.style.height = H + 'px';
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H);
  renderer.shadowMap.enabled = opts.sombras !== false; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  palco.insertBefore(renderer.domElement, palco.firstChild);

  REALISTA = opts.realista !== false;
  const scene = new THREE.Scene();
  const corFundo = new THREE.Color(roteiro.estilo?.fundo || '#e9eef2');
  if (REALISTA) {
    // fundo de estúdio em degradê (claro no centro, mais escuro nas bordas)
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 512; const c2 = cv.getContext('2d');
    const gr = c2.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#' + corFundo.clone().multiplyScalar(0.82).getHexString()); gr.addColorStop(0.55, '#' + corFundo.getHexString()); gr.addColorStop(1, '#' + corFundo.clone().multiplyScalar(0.9).getHexString());
    c2.fillStyle = gr; c2.fillRect(0, 0, 16, 512);
    const tf = new THREE.CanvasTexture(cv); tf.colorSpace = THREE.SRGBColorSpace; scene.background = tf;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.75;
  } else scene.background = corFundo;
  scene.fog = new THREE.Fog(corFundo, 60, 160);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa5b1, REALISTA ? 0.55 : 1.4));
  const sol = new THREE.DirectionalLight(0xfff4e6, REALISTA ? 2.6 : 2.2);
  sol.position.set(14, 24, 10); sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
  sol.shadow.bias = -0.0005; sol.shadow.normalBias = 0.02; sol.shadow.radius = 4;
  scene.add(sol);
  if (REALISTA) { const preench = new THREE.DirectionalLight(0xdfe9ff, 0.6); preench.position.set(-12, 8, -10); scene.add(preench); }
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: REALISTA ? 0.28 : 0.18 }));
  chao.receiveShadow = true; scene.add(chao);
  const camera = new THREE.PerspectiveCamera(vertical ? 55 : 40, W / H, 0.1, 500);
  let composer = null;
  if (REALISTA) {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    if (opts.oclusao === true) { // desligado por padrão: gera artefatos no renderizador por software
      const ao = new GTAOPass(scene, camera, W, H);
      ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 12 });
      ao.blendIntensity = 0.85;
      composer.addPass(ao);
    }
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.5, 0.88));
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass({ // vinheta + granulação sutil (aspecto de câmera)
      uniforms: { tDiffuse: { value: null }, quadro: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float quadro; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + quadro) * 43758.5453); }
        void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.25, length(d * vec2(1.0, 0.9)));
          c.rgb *= mix(0.78, 1.0, v); c.rgb += (h(vUv * 911.0) - 0.5) * 0.018; gl_FragColor = c; }`,
    }));
  }

  // tempos das cenas (durações já resolvidas pelo Node)
  let t = 0;
  const cenas = roteiro.cenas.map((c, i) => { const o = { ...c, i, inicio: t, fim: t + c.duracao }; t += c.duracao; return o; });
  const duracao = t;

  // elementos
  const elementos = new Map();
  const explosoes = new Map();
  let camAnterior = null;
  for (const c of cenas) {
    for (const bruto of c.elementos || []) {
      for (const e of expandir({ ...bruto, atraso: (bruto.atraso || 0) })) {
        const fab = construtores[e.tipo]; if (!fab) { console.warn('tipo desconhecido', e.tipo); continue; }
        const r = fab(e);
        const anim = e.animacao || r.animPadrao || 'surgir';
        const obj = {
          id: e.id, pai: bruto.id, def: e, ...r, anim,
          t0: c.inicio + (e.atraso || 0), dur: e.duracao_animacao ?? r.durPadrao ?? (anim === 'nenhuma' ? 0.001 : 0.9),
          tRem: Infinity, base: { pos: r.grupo.position.clone(), esc: r.grupo.scale.clone() },
          opBase: e.opacidade ?? r.opacidade ?? 1,
        };
        if (obj.opBase < 1) obj.mats.forEach((m) => { m.transparent = true; });
        if (elementos.has(e.id)) { const velho = elementos.get(e.id); scene.remove(velho.grupo); }
        elementos.set(e.id, obj);
        scene.add(r.grupo);
      }
    }
    for (const id of c.remover || []) for (const o of elementos.values()) if ((o.id === id || o.pai === id || o.id.startsWith(id + '/')) && o.tRem === Infinity) o.tRem = c.inicio;
    for (const x of [].concat(c.explodir || [])) {
      if (!x || !x.id) continue;
      if (!explosoes.has(x.id)) explosoes.set(x.id, []);
      explosoes.get(x.id).push({ t: c.inicio + (x.atraso ?? 0.3), f: x.fator ?? 1 });
    }
  }
  // câmera de cada cena
  for (const c of cenas) {
    const k = c.camera || {};
    const az = Array.isArray(k.azimute) ? k.azimute : [k.azimute ?? (camAnterior ? camAnterior.az1 : 35), (k.azimute ?? (camAnterior ? camAnterior.az1 : 35)) + (k.azimute == null ? 25 : 0)];
    const alvo = k.alvo ?? (camAnterior ? camAnterior.alvo1 : [0, 2, 0]);
    const dist = Array.isArray(k.distancia) ? k.distancia : [k.distancia ?? (camAnterior ? camAnterior.d1 : 16), k.distancia_fim ?? k.distancia ?? (camAnterior ? camAnterior.d1 : 16)];
    const el = Array.isArray(k.elevacao) ? k.elevacao : [k.elevacao ?? (camAnterior ? camAnterior.el1 : 28), k.elevacao_fim ?? k.elevacao ?? (camAnterior ? camAnterior.el1 : 28)];
    c.cam = { az0: az[0], az1: az[1], d0: dist[0], d1: dist[1], el0: el[0], el1: el[1], alvo0: alvo, alvo1: k.alvo_fim ?? alvo };
    camAnterior = c.cam;
  }

  const fs = vertical ? W / 100 : H / 100; // 1 "vw" de referência
  const ui = {
    titulo: document.getElementById('titulo'), legenda: document.getElementById('legenda'),
    marca: document.getElementById('marca'), progresso: document.getElementById('progresso'), rotulos: document.getElementById('rotulos'),
  };
  ui.selo = document.getElementById('selo');
  const NOMES_SERIE = { como_funciona: 'Como funciona?', aprenda_60s: 'Aprenda em 60 segundos', voce_sabia: 'Você sabia?', entenda_o_mundo: 'Entenda o mundo', conectando: 'Conectando conhecimentos', entenda_o_sistema: 'Entenda o sistema', enem_1min: 'ENEM em 1 minuto', questao_comentada: 'Questão comentada', por_que_errada: 'Por que está errada?', redacao_1000: 'Redação nota 1000', conexoes_enem: 'Conexões ENEM', simulado_relampago: 'Simulado relâmpago' };
  const NOMES_NIVEL = { basico: 'Básico', intermediario: 'Intermediário', avancado: 'Avançado' };
  const partesSelo = [];
  if (roteiro.serie) partesSelo.push(`<span class="serie">${NOMES_SERIE[roteiro.serie] || roteiro.serie}</span>`);
  if (roteiro.nivel) partesSelo.push(`<span class="nivel">${NOMES_NIVEL[roteiro.nivel] || roteiro.nivel}</span>`);
  if (roteiro.disciplinas?.length) partesSelo.push(`<span class="disc">${roteiro.disciplinas.join(' + ')}</span>`);
  ui.selo.innerHTML = partesSelo.join('');
  Object.assign(ui.selo.style, vertical ? { top: '4%', fontSize: fs * 2.9 + 'px' } : { top: '3%', left: '3%', transform: 'none', width: 'auto', maxWidth: '70%', justifyContent: 'flex-start', fontSize: fs * 2.2 + 'px' });
  const tamTitulo = parseFloat(ui.titulo.style.fontSize);
  Object.assign(ui.titulo.style, vertical ? { top: '12.5%', fontSize: fs * 6.2 + 'px' } : { top: '9.5%', fontSize: fs * 5 + 'px' });
  Object.assign(ui.legenda.style, vertical ? { top: '70%', fontSize: fs * 5 + 'px' } : { bottom: '9%', fontSize: fs * 4.4 + 'px' });
  Object.assign(ui.marca.style, vertical ? { bottom: '4.5%', left: '50%', transform: 'translateX(-50%)', fontSize: fs * 3.6 + 'px' } : { top: '4%', right: '3%', fontSize: fs * 2.8 + 'px' });
  ui.marca.innerHTML = (opts.marca || '@conhecimentoexplicado').replace(/^(@?)(.*)$/, '$1<span>$2</span>');
  ui.progresso.style.display = vertical ? 'block' : 'none';
  if (opts.semTextos) for (const id of ['titulo', 'legenda', 'marca', 'progresso', 'selo']) document.getElementById(id).style.visibility = 'hidden'; // ilustração estática
  ui.rotulos.style.fontSize = (vertical ? fs * 3.6 : fs * 2.6) + 'px';

  const subs = cenas.flatMap((c) => legendas(c.narracao, c.inicio, c.duracao, vertical ? 4 : 9));
  const divRotulos = new Map();
  const rotulosAtivos = new Set();
  const projetar = (w) => { const p = w.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z }; };
  const desenharRotulo = (chave, texto, sub, mundo, op, classe = 'rotulo') => {
    if (op <= 0.01) return;
    let d = divRotulos.get(chave);
    if (!d) { d = document.createElement('div'); d.className = classe; ui.rotulos.appendChild(d); divRotulos.set(chave, d); }
    const s = projetar(mundo);
    if (s.z > 1) return;
    d.innerHTML = texto + (sub ? `<small>${sub}</small>` : '');
    const mx = W * 0.03, topo = H * (vertical ? 0.25 : 0.17);
    d.style.left = '0px'; d.style.top = '0px'; d.style.display = 'block';
    const bw = d.offsetWidth, bh = d.offsetHeight;
    d.style.left = clamp(s.x, mx + bw / 2, W - mx - bw / 2) + 'px'; d.style.top = clamp(s.y, topo + bh, H * 0.95) + 'px'; d.style.opacity = op; d.style.display = 'block';
    rotulosAtivos.add(chave);
  };

  ui.questao = document.getElementById('questao');
  Object.assign(ui.questao.style, vertical ? { top: '25%', left: '5%', right: '5%', fontSize: fs * 3.4 + 'px' } : { top: '16%', left: '8%', right: '8%', fontSize: fs * 2.6 + 'px' });
  let questaoAtiva = false;
  function desenharQuestao(o, tl, op) {
    if (op <= 0.01) return;
    questaoAtiva = true;
    const e = o.cartao, cont = e.contagem ?? 0, rev = e.revelar_em ?? (cont ? cont + 1.5 : 1e9);
    const resto = Math.ceil((1 + cont) - tl);
    const revelado = tl >= rev;
    const alts = (e.alternativas || []).map((a, i) => {
      const letra = (a.match(/^\s*([A-E])\)/) || [])[1] || 'ABCDE'[i];
      const texto = a.replace(/^\s*[A-E]\)\s*/, '');
      const cls = revelado ? (letra === e.correta ? 'certa' : 'errada') : '';
      const exp = revelado && e.explicacoes?.[letra] ? `<em>${e.explicacoes[letra]}</em>` : '';
      return `<li class="${cls}"><b>${letra}</b><span>${texto}${exp}</span></li>`;
    }).join('');
    const relogio = cont && tl > 1 && !revelado ? `<div class="relogio">${resto > 0 ? resto : '…'}</div>` : '';
    const html = `<div class="origem">${e.origem || ''}</div><p>${e.enunciado || ''}</p><ol>${alts}</ol>${relogio}`;
    if (ui.questao._html !== html) { ui.questao.innerHTML = html; ui.questao._html = html; }
    ui.questao.style.display = 'block'; ui.questao.style.opacity = op;
  }

  function valorExplosao(id, tt) {
    const lista = explosoes.get(id); if (!lista) return 0;
    let atual = 0;
    for (const k of lista) { if (tt < k.t) break; const p = ease.inOut(clamp((tt - k.t) / 1.4)); atual = lerp(atual, k.f, p); }
    return atual;
  }

  function camEm(c, tt) {
    const p = ease.inOut(clamp((tt - c.inicio) / c.duracao));
    const m = c.cam; const vf = vertical ? 1.6 : 1; // 9:16 tem campo horizontal estreito
    let st = { az: lerp(m.az0, m.az1, p), el: lerp(m.el0, m.el1, p), d: lerp(m.d0, m.d1, p) * vf, alvo: [0, 1, 2].map((i) => lerp(m.alvo0[i], m.alvo1[i], p)) };
    if (c.i > 0) { // transição suave a partir do fim da cena anterior
      const a = cenas[c.i - 1].cam; const k = ease.inOut(clamp((tt - c.inicio) / 1.0));
      if (k < 1) {
        const prev = { az: a.az1, el: a.el1, d: a.d1 * vf, alvo: a.alvo1 };
        st = { az: lerp(prev.az, st.az, k), el: lerp(prev.el, st.el, k), d: lerp(prev.d, st.d, k), alvo: [0, 1, 2].map((i) => lerp(prev.alvo[i], st.alvo[i], k)) };
      }
    }
    return st;
  }

  estado.quadro = (tt) => {
    const c = cenas.find((x) => tt >= x.inicio && tt < x.fim) || cenas[cenas.length - 1];
    // câmera
    const st = camEm(c, tt);
    const az = THREE.MathUtils.degToRad(st.az), el = THREE.MathUtils.degToRad(st.el);
    const alvo = new THREE.Vector3(...st.alvo);
    camera.position.set(alvo.x + st.d * Math.cos(el) * Math.sin(az), alvo.y + st.d * Math.sin(el), alvo.z + st.d * Math.cos(el) * Math.cos(az));
    camera.lookAt(alvo); camera.updateMatrixWorld();

    // destaque da cena
    const dest = new Set(c.destacar || []);
    const kd = dest.size ? Math.min(ease.inOut(clamp((tt - c.inicio - 0.2) / 0.6)), ease.inOut(clamp((c.fim - tt) / 0.4))) : 0;
    rotulosAtivos.clear(); questaoAtiva = false;

    for (const o of elementos.values()) {
      const vivo = tt >= o.t0 && tt < o.tRem + 0.6;
      o.grupo.visible = vivo;
      if (!vivo) continue;
      const p = clamp((tt - o.t0) / o.dur);
      const g = o.grupo; g.position.copy(o.base.pos); g.scale.copy(o.base.esc);
      let op = o.opBase;
      switch (o.anim) {
        case 'crescer': { const s = Math.max(0.001, ease.out(p)); if (o.eixo === 'x') g.scale.x *= s; else if (o.eixo) g.scale.y *= s; else g.scale.y *= s; break; }
        case 'surgir': { const s = Math.max(0.001, ease.back(p)); g.scale.multiplyScalar(s); op *= clamp(p * 3); break; }
        case 'cair': g.position.y += (1 - ease.bounce(p)) * 7; op *= clamp(p * 4); break;
        case 'deslizar': g.position.x -= (1 - ease.out(p)) * 10; op *= clamp(p * 2); break;
        case 'aparecer': op *= ease.inOut(p); break;
        case 'propria': if (o.propria) o.propria(p); break;
        default: break;
      }
      if (o.anim !== 'propria' && o.propria) o.propria(1);
      if (tt >= o.tRem) op *= 1 - clamp((tt - o.tRem) / 0.6);
      const emDestaque = dest.has(o.id) || dest.has(o.pai);
      if (kd > 0 && !emDestaque && o.def.tipo !== 'terreno') op *= 1 - 0.78 * kd;
      for (const m of o.mats) {
        const opBase = m.userData.op0 ?? (m.userData.op0 = m.opacity);
        m.opacity = opBase * op;
        const transp = op < 0.999 || opBase < 1;
        if (m.transparent !== transp) { m.transparent = transp; m.needsUpdate = true; }
        m.depthWrite = op > 0.6;
        if (m.emissive && m.userData.emi0 == null) { m.userData.emi0 = m.emissive.clone(); m.userData.emiI0 = m.emissiveIntensity; }
        if (m.emissive) {
          if (emDestaque && kd > 0) { m.emissive.set('#e63946'); m.emissiveIntensity = 0.25 + 0.2 * Math.sin(tt * 6) * kd; }
          else { m.emissive.copy(m.userData.emi0); m.emissiveIntensity = m.userData.emiI0; }
        }
      }
      const ctx = { rotulo: desenharRotulo, opacidade: op };
      if (o.anim === 'propria' && o.propria && o.propria.length > 1) { o.grupo.updateMatrixWorld(true); o.propria(p, ctx); }
      if (o.tick) { o.grupo.updateMatrixWorld(true); o.tick(tt - o.t0, ctx); }
      if (o.explodir) { o.grupo.updateMatrixWorld(true); o.explodir(valorExplosao(o.pai, tt), ctx); }
      if (o.cartao) desenharQuestao(o, tt - o.t0, op);
      if (o.rotulo) desenharRotulo(o.id, o.rotulo.texto, o.rotulo.sub, o.rotulo.pos, op, o.rotulo.classe);
    }
    for (const [k, d] of divRotulos) if (!rotulosAtivos.has(k)) d.style.display = 'none';
    if (!questaoAtiva) ui.questao.style.display = 'none';

    // textos
    const kt = clamp((tt - c.inicio) / 0.35);
    ui.titulo.style.display = c.texto_tela ? 'block' : 'none';
    ui.titulo.textContent = c.texto_tela || '';
    const gancho = c.etapa === 'gancho' || (c.i === 0 && !c.etapa);
    ui.titulo.style.fontSize = (gancho ? tamTitulo * 1.25 : tamTitulo) + 'px';
    ui.titulo.style.background = gancho ? '#e63946' : '#1d3557';
    ui.selo.style.opacity = gancho ? 1 : 0.9;
    ui.titulo.style.transform = `translateX(-50%) scale(${0.6 + 0.4 * ease.back(kt)})`;
    ui.titulo.style.opacity = clamp(kt * 2);
    const s = subs.find((x) => tt >= x.t0 && tt < x.t1);
    ui.legenda.innerHTML = s ? s.html : '';
    ui.progresso.style.width = (100 * tt / duracao) + '%';

    if (composer) { composer.passes[composer.passes.length - 1].uniforms.quadro.value = (tt * 30) % 97; composer.render(); }
    else renderer.render(scene, camera);
  };
  await document.fonts.ready;
  estado.quadro(0);
  return { duracao, cenas: cenas.map((c) => ({ inicio: c.inicio, fim: c.fim })) };
};
window.__quadro = (t) => { estado.quadro(t); return true; };
window.__pronto = true;
