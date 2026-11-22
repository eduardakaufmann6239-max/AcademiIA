import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROFILE, project, runSupervisor, drugAgent, ethicsAgent, metabolicAgent,
} from '../src/agents.js';

const healthy = {
  ...DEFAULT_PROFILE, idade: 30, peso: 62, historicoFamiliar: false, sono: 7.5, exercicio: 200,
  ultraprocessados: 15, sodio: 2.3, estresse: 3, carboRefeicao: 60,
};
const intervention = { ...DEFAULT_PROFILE, sono: 7.5, exercicio: 180, ultraprocessados: 20, sodio: 2.3, estresse: 4 };

test('perfil saudável fica na faixa normal e estável', () => {
  const { traj } = project(healthy, 5);
  for (const y of traj) {
    assert.ok(y.jejum > 80 && y.jejum < 100, `jejum ${y.jejum}`);
    assert.ok(y.hba1c < 5.7, `hba1c ${y.hba1c}`);
  }
  assert.ok(Math.abs(traj[5].peso - traj[0].peso) < 3, 'peso estável');
});

test('calibração: SI=1 e beta=1 produz jejum ~90 mg/dL e pico pós-prandial < 180', () => {
  const m = metabolicAgent({ peso: 70, carboRefeicao: 60 }, 1, 1, 1, 45);
  assert.ok(Math.abs(m.fastingG - 90) < 3, `jejum ${m.fastingG}`);
  assert.ok(m.peak < 180, `pico ${m.peak}`);
  assert.ok(m.homaIR < 2.5);
});

test('perfil de risco piora ao longo do tempo sem intervenção', () => {
  const { traj } = project(DEFAULT_PROFILE, 5);
  assert.ok(traj[0].hba1c >= 5.7, 'começa em pré-diabetes');
  assert.ok(traj[5].hba1c > traj[0].hba1c);
  assert.ok(traj[5].beta < traj[0].beta, 'reserva beta cai');
});

test('intervenção de estilo de vida melhora HbA1c e pressão', () => {
  const a = project(DEFAULT_PROFILE, 5).traj[5];
  const b = project(intervention, 5).traj[5];
  assert.ok(b.hba1c < a.hba1c - 0.5);
  assert.ok(b.pas < a.pas - 10);
});

test('agente de medicamentos bloqueia metformina com TFGe < 30', () => {
  const blocked = drugAgent({ metformina: true }, { egfr: 25 });
  assert.deepEqual(blocked.blocked, ['metformina']);
  assert.equal(blocked.hepatico, 1);
  const ok = drugAgent({ metformina: true }, { egfr: 80 });
  assert.ok(ok.hepatico < 1);
  const withDrug = project({ ...DEFAULT_PROFILE, metformina: true }, 0).traj[0];
  const without = project(DEFAULT_PROFILE, 0).traj[0];
  assert.ok(withDrug.jejum < without.jejum);
});

test('agente ético sinaliza entradas fora da faixa', () => {
  assert.equal(ethicsAgent(DEFAULT_PROFILE).warnings.length, 0);
  assert.ok(ethicsAgent({ ...DEFAULT_PROFILE, sono: 15 }).warnings.length > 0);
});

test('supervisor integra cenários, faixa de incerteza e log dos agentes', () => {
  const r = runSupervisor(DEFAULT_PROFILE, intervention, 5);
  const agents = new Set(r.log.map((l) => l.from));
  for (const a of ['Ético', 'Supervisor', 'Estilo de vida', 'Imunológico', 'Endócrino', 'Metabólico', 'Cardiovascular', 'Renal']) {
    assert.ok(agents.has(a), `faltou ${a}`);
  }
  for (const b of r.bandA) assert.ok(b.hba1c[0] <= b.hba1c[1]);
  assert.ok(r.drivers.length > 0);
  assert.equal(r.A.traj.length, 6);
  assert.equal(r.A.first.met.curve.length, 144);
});
