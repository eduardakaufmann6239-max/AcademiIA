import { DEFAULT_PROFILE, runSupervisor } from './agents.js';

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 1) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

const INTERVENTION = { sono: 7.5, exercicio: 180, ultraprocessados: 20, sodio: 2.3, estresse: 4 };
let base = { ...DEFAULT_PROFILE };
let scen = { ...DEFAULT_PROFILE, ...INTERVENTION };
let tab = 'a';

const PERFIL = [
  { k: 'idade', l: 'Idade', u: 'anos', min: 18, max: 90, step: 1 },
  { k: 'sexo', l: 'Sexo', opts: [['F', 'Feminino'], ['M', 'Masculino']] },
  { k: 'peso', l: 'Peso', u: 'kg', min: 35, max: 200, step: 1 },
  { k: 'altura', l: 'Altura', u: 'cm', min: 130, max: 210, step: 1 },
  { k: 'egfr', l: 'TFGe (rins)', u: 'mL/min', min: 5, max: 130, step: 1 },
];
const FLAGS = [['historicoFamiliar', 'Diabetes na família'], ['tabagismo', 'Fuma']];
const HABITOS = [
  { k: 'sono', l: 'Sono', u: 'h/noite', min: 3, max: 12, step: 0.1, d: 1 },
  { k: 'exercicio', l: 'Exercício', u: 'min/semana', min: 0, max: 600, step: 10, d: 0 },
  { k: 'ultraprocessados', l: 'Ultraprocessados', u: '% da dieta', min: 0, max: 100, step: 1, d: 0 },
  { k: 'carboRefeicao', l: 'Carboidrato por refeição', u: 'g', min: 10, max: 150, step: 5, d: 0 },
  { k: 'sodio', l: 'Sódio', u: 'g/dia', min: 0.5, max: 10, step: 0.1, d: 1 },
  { k: 'estresse', l: 'Estresse', u: '0–10', min: 0, max: 10, step: 1, d: 0 },
];
const TRAT = [['metformina', 'Metformina'], ['antihipertensivo', 'Anti-hipertensivo']];

function buildPerfil() {
  const f = $('perfil');
  const cells = PERFIL.map((c) => {
    const ctl = c.opts
      ? `<select id="p-${c.k}">${c.opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`
      : `<input id="p-${c.k}" type="number" min="${c.min}" max="${c.max}" step="${c.step}">`;
    return `<label class="num">${c.l}${c.u ? ` <span class="hint">(${c.u})</span>` : ''}${ctl}</label>`;
  });
  f.innerHTML = `<div class="row2">${cells.join('')}</div>`
    + FLAGS.map(([k, l]) => `<label class="check"><input type="checkbox" id="p-${k}">${l}</label>`).join('');
  for (const c of PERFIL) $(`p-${c.k}`).addEventListener('input', (e) => {
    const v = c.opts ? e.target.value : Number(e.target.value);
    if (!c.opts && (e.target.value === '' || Number.isNaN(v))) return;
    base[c.k] = v; scen[c.k] = v; schedule();
  });
  for (const [k] of FLAGS) $(`p-${k}`).addEventListener('change', (e) => { base[k] = scen[k] = e.target.checked; schedule(); });
}

function buildHabitos() {
  $('habitos').innerHTML = HABITOS.map((c) => `<div class="ctl"><label for="h-${c.k}">${c.l} <output id="o-${c.k}"></output></label>
    <input type="range" id="h-${c.k}" min="${c.min}" max="${c.max}" step="${c.step}"></div>`).join('')
    + TRAT.map(([k, l]) => `<label class="check"><input type="checkbox" id="h-${k}">${l}</label>`).join('');
  for (const c of HABITOS) $(`h-${c.k}`).addEventListener('input', (e) => { cur()[c.k] = Number(e.target.value); syncOut(); schedule(); });
  for (const [k] of TRAT) $(`h-${k}`).addEventListener('change', (e) => { cur()[k] = e.target.checked; schedule(); });
}

const cur = () => (tab === 'a' ? base : scen);
function syncOut() { for (const c of HABITOS) $(`o-${c.k}`).textContent = `${fmt(cur()[c.k], c.d)} ${c.u}`; }
function fillInputs() {
  for (const c of PERFIL) $(`p-${c.k}`).value = base[c.k];
  for (const [k] of FLAGS) $(`p-${k}`).checked = base[k];
  for (const c of HABITOS) $(`h-${c.k}`).value = cur()[c.k];
  for (const [k] of TRAT) $(`h-${k}`).checked = cur()[k];
  syncOut();
}
function setTab(t) {
  tab = t;
  $('tab-a').setAttribute('aria-selected', t === 'a');
  $('tab-b').setAttribute('aria-selected', t === 'b');
  $('tab-hint').textContent = t === 'a' ? 'Como a pessoa vive hoje.' : 'O que muda se ela adotar outra rotina ou tratamento.';
  fillInputs();
}

let pending = 0;
function schedule() { cancelAnimationFrame(pending); pending = requestAnimationFrame(render); }

// ------------------------------------------------------------------ gráficos
const NS = 'http://www.w3.org/2000/svg';
function chart(svg, { w, h, xs, ys, series, bands = [], target, xTicks, yTicks, xLabel, yLabel, pad = { l: 44, r: 12, t: 12, b: 32 } }) {
  const X = (v) => pad.l + ((v - xs[0]) / (xs[1] - xs[0])) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - ((v - ys[0]) / (ys[1] - ys[0])) * (h - pad.t - pad.b);
  let s = '';
  if (target) s += `<rect class="target" x="${X(xs[0])}" y="${Y(target[1])}" width="${X(xs[1]) - X(xs[0])}" height="${Y(target[0]) - Y(target[1])}"/>`;
  for (const t of yTicks) s += `<line class="grid-l" x1="${pad.l}" x2="${w - pad.r}" y1="${Y(t.v)}" y2="${Y(t.v)}"/><text x="${pad.l - 6}" y="${Y(t.v) + 4}" text-anchor="end">${t.l}</text>`;
  for (const t of xTicks) s += `<text x="${X(t.v)}" y="${h - pad.b + 16}" text-anchor="middle">${t.l}</text>`;
  if (xLabel) s += `<text x="${w - pad.r}" y="${h - 2}" text-anchor="end">${xLabel}</text>`;
  if (yLabel) s += `<text x="${pad.l}" y="${pad.t - 2}" text-anchor="start">${yLabel}</text>`;
  for (const b of bands) {
    const up = b.pts.map(([x, lo, hi]) => `${X(x)},${Y(hi)}`), dn = b.pts.map(([x, lo]) => `${X(x)},${Y(lo)}`).reverse();
    s += `<polygon class="${b.cls}" points="${up.concat(dn).join(' ')}"/>`;
  }
  for (const se of series) {
    s += `<polyline class="ln ${se.cls}" points="${se.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}"/>`;
    if (se.dots) for (const [x, y] of se.pts) s += `<circle class="dot-${se.cls}" cx="${X(x)}" cy="${Y(y)}" r="3"/>`;
    if (se.end) { const [x, y] = se.pts[se.pts.length - 1]; s += `<text x="${X(x) - 4}" y="${Y(y) - 8}" text-anchor="end" style="fill:var(--ink)">${se.end}</text>`; }
  }
  svg.innerHTML = s;
}
const nice = (lo, hi, step) => [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
const ticks = (lo, hi, step, f = (v) => v) => { const r = []; for (let v = lo; v <= hi + 1e-9; v += step) r.push({ v, l: f(v) }); return r; };

// ---------------------------------------------------------------- corpo
const ORGANS = [
  ['cerebro', 'Cérebro', 100, 34, 13], ['coracao', 'Coração', 112, 120, 11], ['vasos', 'Vasos', 70, 110, 8],
  ['figado', 'Fígado', 84, 158, 12], ['pancreas', 'Pâncreas', 118, 176, 9], ['rins', 'Rins', 100, 202, 9],
  ['adiposo', 'Gordura', 100, 232, 10], ['musculo', 'Músculo', 72, 300, 9],
];
const ORGAN_TIP = { 0: 'adequado', 1: 'atenção', 2: 'alerta' };
function drawBody(org) {
  let s = `<circle class="sil" cx="100" cy="36" r="26"/><rect class="sil" x="88" y="60" width="24" height="16"/>
    <rect class="sil" x="56" y="74" width="88" height="180" rx="30"/><rect class="sil" x="30" y="84" width="22" height="130" rx="11"/>
    <rect class="sil" x="148" y="84" width="22" height="130" rx="11"/><rect class="sil" x="62" y="240" width="32" height="132" rx="14"/>
    <rect class="sil" x="106" y="240" width="32" height="132" rx="14"/>`;
  for (const [k, l, x, y, r] of ORGANS) {
    const st = org[k];
    s += `<g><title>${l}: ${ORGAN_TIP[st]}</title><circle class="org s${st}" cx="${x}" cy="${y}" r="${r}"/>`;
    const right = x >= 100;
    s += `<text x="${right ? x + r + 4 : x - r - 4}" y="${y + 3.5}" text-anchor="${right ? 'start' : 'end'}">${l}</text></g>`;
  }
  $('body').innerHTML = s;
}

// ------------------------------------------------------------------ render
const lvl = (v, a, b) => (v >= b ? 2 : v >= a ? 1 : 0);
const statusLvl = (s) => (s.includes('diabetes') && !s.includes('pré') ? 2 : s.includes('pré') ? 1 : 0);

function render() {
  const r = runSupervisor(base, scen, 5);
  const a0 = r.A.traj[0], a5 = r.A.traj[5], b5 = r.B.traj[5];

  const st = $('status');
  st.textContent = `Hoje: ${r.status}`; st.dataset.s = statusLvl(r.status);

  const kpis = [
    { l: 'Glicemia de jejum', v: a0.jejum, d: 0, u: 'mg/dL', s: lvl(a0.jejum, 100, 126), a: a5.jejum, b: b5.jejum },
    { l: 'HbA1c estimada', v: a0.hba1c, d: 1, u: '%', s: lvl(a0.hba1c, 5.7, 6.5), a: a5.hba1c, b: b5.hba1c },
    { l: 'HOMA-IR', v: a0.homa, d: 1, u: '', s: lvl(a0.homa, 2.5, 4), a: a5.homa, b: b5.homa },
    { l: 'Pressão sistólica', v: a0.pas, d: 0, u: 'mmHg', s: lvl(a0.pas, 130, 140), a: a5.pas, b: b5.pas },
    { l: 'PCR (inflamação)', v: a0.pcr, d: 1, u: 'mg/L', s: lvl(a0.pcr, 1, 3), a: a5.pcr, b: b5.pcr },
    { l: 'Risco CV 10 anos*', v: a0.risco * 100, d: 1, u: '%', s: lvl(a0.risco, 0.075, 0.2), a: a5.risco * 100, b: b5.risco * 100 },
  ];
  $('kpis').innerHTML = kpis.map((k) => `<div class="kpi" data-s="${k.s}"><div class="lbl">${k.l}</div>
    <div class="val">${fmt(k.v, k.d)}<span>${k.u}</span></div>
    <div class="cmp">em 5 anos: ${fmt(k.a, k.d)} · <b>${fmt(k.b, k.d)}</b></div></div>`).join('');

  drawBody(r.organs);

  const maxI = Math.max(...r.drivers.map((d) => d.impacto), 0.01);
  $('drivers').innerHTML = r.drivers.length
    ? r.drivers.map((d) => `<li><span>${d.label}</span><span class="bar" title="redução de ${fmt((1 - Math.exp(-d.impacto)) * 100, 0)}%"><i style="width:${(d.impacto / maxI) * 100}%"></i></span></li>`).join('')
    : '<li><span>Nenhum fator relevante reduz a sensibilidade à insulina.</span></li>';

  const top = r.drivers.slice(0, 2).map((d) => d.label).join(' e ');
  const dH = b5.hba1c - a5.hba1c;
  $('summary').textContent = `Hoje o perfil está na ${r.status}${top ? `, puxado principalmente por ${top}` : ''}. `
    + `Mantida a rotina atual, a projeção para 5 anos é ${r.statusA5} (HbA1c ~${fmt(a5.hba1c)}%). `
    + `Com a intervenção, ${r.statusB5} (HbA1c ~${fmt(b5.hba1c)}%, ${dH <= 0 ? '' : '+'}${fmt(dH)} p.p.). `
    + 'A faixa de incerteza mostra que o resultado individual pode variar bastante; um profissional de saúde deve validar qualquer conduta.';

  // 24 h
  const ca = r.A.first.met.curve, cb = r.B.first.met.curve;
  const gMax = Math.max(200, ...ca, ...cb);
  const [, yHi] = nice(0, gMax, 40);
  chart($('c24'), {
    w: 760, h: 260, xs: [0, 24], ys: [40, yHi], target: [70, 140], yLabel: 'mg/dL',
    xTicks: ticks(0, 24, 3, (v) => `${v}h`), yTicks: ticks(40, yHi, 40),
    series: [
      { cls: 'a', pts: ca.map((g, i) => [i / 6, g]) },
      { cls: 'b', pts: cb.map((g, i) => [i / 6, g]) },
    ],
  });

  // 5 anos
  const yrs = ticks(0, 5, 1, (v) => (v === 0 ? 'hoje' : `+${v}a`));
  const hAll = [...r.bandA, ...r.bandB].flatMap((b) => b.hba1c);
  const [h0, h1] = nice(Math.min(...hAll, 5), Math.max(...hAll, 6.6), 0.5);
  chart($('cA1c'), {
    w: 380, h: 240, xs: [0, 5], ys: [h0, h1], target: [h0, 5.7], yLabel: 'HbA1c %',
    xTicks: yrs, yTicks: ticks(h0, h1, 0.5, (v) => fmt(v)),
    bands: [{ cls: 'band-a', pts: r.bandA.map((b) => [b.ano, ...b.hba1c]) }, { cls: 'band-b', pts: r.bandB.map((b) => [b.ano, ...b.hba1c]) }],
    series: [
      { cls: 'a', dots: true, pts: r.A.traj.map((t) => [t.ano, t.hba1c]), end: fmt(a5.hba1c) },
      { cls: 'b', dots: true, pts: r.B.traj.map((t) => [t.ano, t.hba1c]), end: fmt(b5.hba1c) },
    ],
  });
  const pAll = [...r.bandA, ...r.bandB].flatMap((b) => b.pas);
  const [p0, p1] = nice(Math.min(...pAll, 110), Math.max(...pAll, 140), 10);
  chart($('cPas'), {
    w: 380, h: 240, xs: [0, 5], ys: [p0, p1], target: [p0, 130], yLabel: 'PAS mmHg',
    xTicks: yrs, yTicks: ticks(p0, p1, 10),
    bands: [{ cls: 'band-a', pts: r.bandA.map((b) => [b.ano, ...b.pas]) }, { cls: 'band-b', pts: r.bandB.map((b) => [b.ano, ...b.pas]) }],
    series: [
      { cls: 'a', dots: true, pts: r.A.traj.map((t) => [t.ano, t.pas]), end: fmt(a5.pas, 0) },
      { cls: 'b', dots: true, pts: r.B.traj.map((t) => [t.ano, t.pas]), end: fmt(b5.pas, 0) },
    ],
  });

  $('log').innerHTML = r.log.map((m) => `<li class="${m.from === 'Supervisor' ? 'sup' : ''}"><span class="who">${m.from} <em>→ ${m.to}</em></span><span>${m.text}</span></li>`).join('');
}

buildPerfil();
buildHabitos();
$('tab-a').addEventListener('click', () => setTab('a'));
$('tab-b').addEventListener('click', () => setTab('b'));
$('reset').addEventListener('click', () => {
  base = { ...DEFAULT_PROFILE }; scen = { ...DEFAULT_PROFILE, ...INTERVENTION }; fillInputs(); schedule();
});
fillInputs();
render();
