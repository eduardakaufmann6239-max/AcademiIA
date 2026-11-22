// Corpo Humano Digital Multiagente — núcleo de simulação.
// Cada agente é uma função pura que lê o estado compartilhado e publica mensagens.
// O supervisor (Full-Body Agent) orquestra a ordem, resolve conflitos e integra.
// MODELO EDUCACIONAL: coeficientes simplificados, não validados para uso clínico.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

// Gerador pseudoaleatório determinístico (mulberry32) para o ensemble de incerteza.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_PROFILE = {
  idade: 45, sexo: 'F', peso: 82, altura: 165,
  historicoFamiliar: true, tabagismo: false, egfr: 90,
  sono: 5.8, exercicio: 40, ultraprocessados: 55, sodio: 4.2, estresse: 7,
  carboRefeicao: 75, metformina: false, antihipertensivo: false,
};

export const RANGES = {
  idade: [18, 90], peso: [35, 200], altura: [130, 210], egfr: [5, 130],
  sono: [3, 12], exercicio: [0, 600], ultraprocessados: [0, 100], sodio: [0.5, 10],
  estresse: [0, 10], carboRefeicao: [10, 150],
};

// ---------------------------------------------------------------- agentes

// Agente ético e de segurança: valida entradas e impõe limites do sistema.
export function ethicsAgent(p) {
  const warnings = [];
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (typeof p[k] !== 'number' || Number.isNaN(p[k])) warnings.push(`Campo "${k}" ausente ou inválido.`);
    else if (p[k] < lo || p[k] > hi) warnings.push(`"${k}" = ${p[k]} está fora da faixa validada do modelo (${lo}–${hi}); resultado extrapolado.`);
  }
  if (p.idade < 18) warnings.push('O modelo não cobre menores de 18 anos.');
  return {
    warnings,
    text: warnings.length
      ? `Entradas verificadas com ${warnings.length} alerta(s). Resultados exigem cautela.`
      : 'Entradas dentro das faixas do modelo. Lembrete: simulação educacional, não diagnóstico.',
  };
}

// Agente de estilo de vida: traduz hábitos em moduladores fisiológicos.
export function lifestyleAgent(p) {
  const bmi = p.peso / (p.altura / 100) ** 2;
  const fSono = clamp(1 - 0.07 * Math.max(0, 7 - p.sono) - 0.03 * Math.max(0, p.sono - 9), 0.6, 1);
  const fExercicio = clamp(1 + 0.25 * Math.min(1, p.exercicio / 300) - 0.1 * Math.max(0, (60 - p.exercicio) / 60), 0.85, 1.25);
  const fDieta = 1 - 0.2 * (p.ultraprocessados / 100);
  const fImc = bmi > 22 ? Math.exp(-0.06 * (bmi - 22)) : 1;
  // Os hábitos definem um peso de equilíbrio; o peso converge para ele (~30% da distância por ano).
  const pressao = 0.08 * (p.ultraprocessados - 35) - 0.012 * (p.exercicio - 150)
    + 0.4 * Math.max(0, 7 - p.sono) + 0.1 * (p.estresse - 5);
  const imcAlvo = clamp(23 + 3 * pressao, 22.5, 45);
  const pesoAno = clamp(0.3 * (imcAlvo * (p.altura / 100) ** 2 - p.peso), -4, 4);
  // Absorção de carboidrato: ultraprocessados aceleram (tau menor = pico maior).
  const tauAbsorcao = 50 - 20 * (p.ultraprocessados / 100);
  return { bmi, fSono, fExercicio, fDieta, fImc, pesoAno, tauAbsorcao };
}

// Agente imunológico/inflamatório: estima PCR e o impacto na sensibilidade à insulina.
export function inflammationAgent(p, life) {
  const pcr = clamp(
    0.5 + 0.12 * Math.max(0, life.bmi - 22) + 0.3 * Math.max(0, 7 - p.sono) + 0.12 * p.estresse
      + 0.01 * p.ultraprocessados + (p.tabagismo ? 1 : 0) - 0.003 * p.exercicio,
    0.2, 15,
  );
  return { pcr, fInflamacao: 1 / (1 + 0.06 * pcr) };
}

// Agente endócrino: cortisol/ritmo circadiano e capacidade das células beta.
export function endocrineAgent(p, state) {
  const disrupcaoCircadiana = p.sono < 6 ? 0.04 : 0;
  const fCortisol = clamp(1 - 0.025 * p.estresse - disrupcaoCircadiana, 0.6, 1);
  return { fCortisol, beta: state.beta };
}

// Agente de medicamentos: verifica indicação, contraindicação e efeito.
export function drugAgent(p, state) {
  const out = { hepatico: 1, si: 1, pas: 0, notes: [], blocked: [] };
  if (p.metformina) {
    if (state.egfr < 30) {
      out.blocked.push('metformina');
      out.notes.push(`Metformina contraindicada com TFGe ${round(state.egfr, 0)} (<30). Efeito não aplicado.`);
    } else {
      out.hepatico = 0.78; out.si = 1.1;
      if (state.egfr < 45) out.notes.push(`TFGe ${round(state.egfr, 0)}: metformina exige redução de dose e reavaliação.`);
      else out.notes.push('Metformina: reduz produção hepática de glicose (~22%) e melhora discreta da sensibilidade.');
    }
  }
  if (p.antihipertensivo) { out.pas = -10; out.notes.push('Anti-hipertensivo: redução média de ~10 mmHg na PAS.'); }
  return out;
}

// Agente metabólico: simula 24 h de glicose e insulina (modelo mínimo tipo Bergman).
// G em mg/dL, I em µU/mL, passo de 1 min. Calibrado para G≈90 com SI=1 e beta=1.
const SG = 0.01, K = 0.0015, N_CLEAR = 0.14, IB = 3, SIGMA = 0.07, P2 = 0.03, EGP0 = 1.98;
const MEALS = [7 * 60, 12.5 * 60, 19.5 * 60];

export function metabolicAgent(p, si, beta, hepatico, tau) {
  const egp = EGP0 * (1 + 0.25 * Math.max(0, 1 - si)) * hepatico;
  const secretion = (g) => beta * SIGMA * Math.max(0, g - 80);
  // Estado estacionário de jejum por bisseção.
  const fFast = (g) => {
    const i = IB + secretion(g) / N_CLEAR;
    return g * (SG + si * K * i) - egp;
  };
  let lo = 40, hi = 400;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (fFast(m) > 0) hi = m; else lo = m; }
  let G = (lo + hi) / 2;
  let I = IB + secretion(G) / N_CLEAR;
  let X = si * K * I;
  const V = 1.6 * p.peso; // dL
  const dose = (p.carboRefeicao * 1000 * 0.9) / V; // mg/dL absorvidos por refeição
  const fastingG = G, fastingI = I;
  const curve = [];
  let sum = 0, peak = G, inRange = 0;
  for (let t = 0; t < 1440; t++) {
    let ra = 0;
    for (const m of MEALS) {
      const dt = t - m;
      if (dt > 0) ra += dose * (dt / tau ** 2) * Math.exp(-dt / tau);
    }
    const dG = egp - (SG + X) * G + ra;
    const dI = -N_CLEAR * (I - IB) + secretion(G);
    const dX = P2 * (si * K * I - X);
    G = Math.max(30, G + dG); I = Math.max(0, I + dI); X = Math.max(0, X + dX);
    sum += G; peak = Math.max(peak, G); if (G >= 70 && G <= 140) inRange++;
    if (t % 10 === 0) curve.push(round(G, 1));
  }
  const mean = sum / 1440;
  return {
    curve, fastingG, fastingI, mean, peak,
    tir: inRange / 1440,
    hba1c: (mean + 46.7) / 28.7, // fórmula ADAG
    homaIR: (fastingG * fastingI) / 405,
  };
}

// Agente cardiovascular: pressão arterial e risco ilustrativo em 10 anos.
export function cardioAgent(p, life, met, drug, idade) {
  const diabetesFaixa = met.hba1c >= 6.5 || met.fastingG >= 126;
  const pas = clamp(
    110 + 0.45 * (idade - 30) + 1.0 * (life.bmi - 22) + 2.0 * (p.sodio - 2.3) - 0.02 * Math.min(p.exercicio, 300)
      + 2.0 * Math.max(0, 7 - p.sono) + 0.8 * p.estresse + (diabetesFaixa ? 6 : 0) + drug.pas,
    95, 200,
  );
  const logit = -7.5 + 0.065 * idade + 0.018 * (pas - 120) + (p.tabagismo ? 0.7 : 0) + (diabetesFaixa ? 0.6 : 0)
    + 0.25 * (met.hba1c - 5.4) + 0.03 * (life.bmi - 25) + (p.sexo === 'M' ? 0.4 : 0);
  return { pas, risco10a: 1 / (1 + Math.exp(-logit)), diabetesFaixa };
}

// Agente renal: TFGe e sua evolução.
export function renalAgent(state, met, cardio) {
  const declinioAno = (state.idade > 40 ? 1 : 0) + (cardio.diabetesFaixa ? 1.5 : 0) + (cardio.pas > 140 ? 0.5 : 0);
  return { egfr: state.egfr, declinioAno };
}

// ------------------------------------------------------------ supervisor

const SI_FACTORS = [
  ['fSono', 'sono insuficiente'], ['fExercicio', 'pouca atividade física'], ['fDieta', 'dieta rica em ultraprocessados'],
  ['fImc', 'excesso de peso'], ['fInflamacao', 'inflamação crônica'], ['fCortisol', 'estresse e ritmo circadiano'],
];

function classify(met) {
  if (met.hba1c >= 6.5 || met.fastingG >= 126) return 'faixa de diabetes';
  if (met.hba1c >= 5.7 || met.fastingG >= 100) return 'faixa de pré-diabetes';
  return 'faixa normal';
}

// Um ciclo completo de agentes para um ano. `noise` perturba parâmetros no ensemble.
function step(p, state, log, noise = { si: 1, beta: 1 }) {
  const say = (from, to, text, data) => log && log.push({ ano: state.ano, from, to, text, data });
  const life = lifestyleAgent({ ...p, peso: state.peso });
  say('Estilo de vida', 'Supervisor', `IMC ${round(life.bmi)}; moduladores: sono ×${round(life.fSono, 2)}, exercício ×${round(life.fExercicio, 2)}, dieta ×${round(life.fDieta, 2)}. Tendência de peso ${life.pesoAno >= 0 ? '+' : ''}${round(life.pesoAno)} kg/ano.`);
  const inf = inflammationAgent({ ...p, peso: state.peso }, life);
  say('Imunológico', 'Endócrino', `PCR estimada ${round(inf.pcr)} mg/L → sensibilidade à insulina ×${round(inf.fInflamacao, 2)}.`);
  const endo = endocrineAgent(p, state);
  say('Endócrino', 'Metabólico', `Cortisol/circadiano ×${round(endo.fCortisol, 2)}; reserva de células beta ${round(state.beta * 100, 0)}%.`);
  const drug = drugAgent(p, state);
  drug.notes.forEach((n) => say('Medicamentos', 'Supervisor', n));

  const factors = { ...life, ...inf, ...endo };
  const si = SI_FACTORS.reduce((acc, [k]) => acc * factors[k], 1) * drug.si * noise.si;
  const beta = state.beta * noise.beta;
  const met = metabolicAgent({ ...p, peso: state.peso }, si, beta, drug.hepatico, life.tauAbsorcao);
  say('Metabólico', 'Supervisor', `SI relativa ${round(si, 2)}; glicemia de jejum ${round(met.fastingG, 0)} mg/dL, pico ${round(met.peak, 0)}, HbA1c ~${round(met.hba1c)}%, HOMA-IR ${round(met.homaIR)} (${classify(met)}).`);
  const cardio = cardioAgent(p, life, met, drug, state.idade);
  say('Cardiovascular', 'Supervisor', `PAS estimada ${round(cardio.pas, 0)} mmHg; risco cardiovascular ilustrativo em 10 anos ${round(cardio.risco10a * 100)}%.`);
  const renal = renalAgent(state, met, cardio);
  say('Renal', 'Medicamentos', `TFGe ${round(renal.egfr, 0)} mL/min/1,73m²; declínio previsto ${round(renal.declinioAno)} por ano.`);

  // Resolução de conflitos e integração.
  if (p.exercicio >= 150 && inf.pcr > 3) say('Supervisor', 'Imunológico', 'Conflito: atividade física adequada, mas PCR alta. Peso, sono e estresse dominam a inflamação neste perfil.');
  if (met.homaIR > 2.5 && met.fastingG < 100) say('Supervisor', 'Metabólico', 'Resistência à insulina compensada por hiperinsulinemia: a glicemia de jejum ainda parece normal, o que mascara o risco.');
  if (drug.blocked.length) say('Supervisor', 'Ético', `Bloqueio aceito: ${drug.blocked.join(', ')} não entra na simulação.`);

  return { life, inf, endo, drug, met, cardio, renal, si, factors };
}

function advance(state, r) {
  const fastingG = r.met.fastingG;
  return {
    ano: state.ano + 1,
    idade: state.idade + 1,
    peso: clamp(state.peso + r.life.pesoAno, 35, 220),
    beta: clamp(state.beta - 0.008 - 0.02 * Math.max(0, fastingG - 100) / 26, 0.15, 1.2),
    egfr: clamp(state.egfr - r.renal.declinioAno, 5, 130),
  };
}

function initialState(p) {
  return {
    ano: 0, idade: p.idade, peso: p.peso, egfr: p.egfr,
    beta: clamp(1 - 0.004 * Math.max(0, p.idade - 30) - (p.historicoFamiliar ? 0.12 : 0), 0.15, 1.2),
  };
}

// Projeção anual de um cenário. Retorna trajetória e log de mensagens do ano 0.
export function project(p, years = 5, { log = null, noise } = {}) {
  let state = initialState(p);
  const traj = [];
  let first = null;
  for (let y = 0; y <= years; y++) {
    const r = step(p, state, y === 0 ? log : null, noise);
    if (y === 0) first = r;
    traj.push({
      ano: y, idade: state.idade, peso: state.peso, beta: state.beta, egfr: state.egfr,
      hba1c: r.met.hba1c, jejum: r.met.fastingG, pas: r.cardio.pas, risco: r.cardio.risco10a, homa: r.met.homaIR,
      pcr: r.inf.pcr, curve: r.met.curve,
    });
    state = advance(state, r);
  }
  return { traj, first };
}

// Ensemble: perturba SI e reserva beta (±15%) para estimar faixa de incerteza.
export function ensemble(p, years = 5, runs = 40, seed = 7) {
  const rand = rng(seed);
  const gauss = () => { const u = rand() || 1e-9, v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const all = [];
  for (let i = 0; i < runs; i++) {
    const noise = { si: Math.exp(0.15 * gauss()), beta: Math.exp(0.15 * gauss()) };
    all.push(project(p, years, { noise }).traj);
  }
  const q = (arr, f) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(f * (s.length - 1))]; };
  return Array.from({ length: years + 1 }, (_, y) => {
    const h = all.map((t) => t[y].hba1c), s = all.map((t) => t[y].pas);
    return { ano: y, hba1c: [q(h, 0.05), q(h, 0.95)], pas: [q(s, 0.05), q(s, 0.95)] };
  });
}

// Ranking dos determinantes: quanto cada fator reduz a sensibilidade à insulina.
export function drivers(first) {
  return SI_FACTORS
    .map(([k, label]) => ({ key: k, label, impacto: -Math.log(first.factors[k]) }))
    .filter((d) => d.impacto > 0.01)
    .sort((a, b) => b.impacto - a.impacto);
}

// Estado de cada órgão para o mapa corporal: 0 ok, 1 atenção, 2 alerta.
export function organStatus(first) {
  const { met, cardio, renal, inf, life, endo } = first;
  const lvl = (v, a, b) => (v >= b ? 2 : v >= a ? 1 : 0);
  return {
    cerebro: lvl(1 - endo.fCortisol, 0.1, 0.2),
    coracao: Math.max(lvl(cardio.pas, 130, 140), lvl(cardio.risco10a, 0.075, 0.2)),
    figado: lvl(met.homaIR, 2.5, 4),
    pancreas: Math.max(lvl(met.hba1c, 5.7, 6.5), lvl(1 - first.endo.beta, 0.25, 0.5)),
    rins: renal.egfr < 60 ? 2 : renal.egfr < 90 ? 1 : 0,
    vasos: lvl(inf.pcr, 1, 3),
    adiposo: lvl(life.bmi, 25, 30),
    musculo: first.factors.fExercicio < 1 ? 1 : 0,
  };
}

// Supervisor (Full-Body Agent): roda os dois cenários e produz o relatório integrado.
export function runSupervisor(base, scenario, years = 5) {
  const log = [];
  const ethics = ethicsAgent(base);
  log.push({ ano: 0, from: 'Ético', to: 'Supervisor', text: ethics.text });
  ethics.warnings.forEach((w) => log.push({ ano: 0, from: 'Ético', to: 'Supervisor', text: w }));
  log.push({ ano: 0, from: 'Supervisor', to: 'Todos', text: `Tarefa dividida: avaliar estado atual e projetar ${years} anos em dois cenários (atual e intervenção).` });

  const A = project(base, years, { log });
  const B = project(scenario, years);
  const bandA = ensemble(base, years);
  const bandB = ensemble(scenario, years);

  const a5 = A.traj[years], b5 = B.traj[years];
  const dH = b5.hba1c - a5.hba1c, dP = b5.pas - a5.pas;
  log.push({
    ano: years, from: 'Supervisor', to: 'Usuário',
    text: `Em ${years} anos, a intervenção altera a HbA1c em ${dH >= 0 ? '+' : ''}${round(dH)} p.p. e a PAS em ${dP >= 0 ? '+' : ''}${round(dP, 0)} mmHg em relação ao cenário atual.`,
  });

  return {
    log, ethics, A, B, bandA, bandB,
    status: classify(A.first.met),
    statusB5: classify({ hba1c: b5.hba1c, fastingG: b5.jejum }),
    statusA5: classify({ hba1c: a5.hba1c, fastingG: a5.jejum }),
    drivers: drivers(A.first),
    organs: organStatus(A.first),
  };
}
