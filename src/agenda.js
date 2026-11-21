// Rodízio editorial: garante conteúdo ALTERNADO — nunca dois dias seguidos do mesmo pilar ou da mesma série,
// alternando também formato e nível. O ENEM, como linha editorial principal, aparece com mais frequência.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HISTORICO = path.join(RAIZ, 'roteiros', 'historico.json');

// Ciclo de 10 dias sem repetições vizinhas (inclusive na virada do ciclo).
export const CICLO_PILARES = ['ia', 'enem', 'economia', 'neurociencia', 'sistemas', 'enem', 'seguranca', 'escola', 'medicina_chinesa', 'interdisciplinar'];

// Séries que combinam com cada pilar (giram a cada vez que o pilar volta).
export const SERIES_DO_PILAR = {
  ia: ['como_funciona', 'entenda_o_mundo', 'voce_sabia', 'conectando'],
  economia: ['entenda_o_mundo', 'como_funciona', 'conectando', 'voce_sabia'],
  neurociencia: ['voce_sabia', 'como_funciona', 'conectando'],
  seguranca: ['como_funciona', 'entenda_o_mundo', 'voce_sabia'],
  escola: ['aprenda_60s', 'como_funciona', 'voce_sabia'],
  sistemas: ['entenda_o_sistema', 'conectando'],
  enem: ['simulado_relampago', 'enem_1min', 'questao_comentada', 'redacao_1000', 'por_que_errada', 'conexoes_enem'],
  medicina_chinesa: ['voce_sabia', 'entenda_o_mundo', 'conectando'],
  interdisciplinar: ['conectando', 'voce_sabia', 'entenda_o_mundo'],
};
const CICLO_NIVEIS = ['basico', 'intermediario', 'basico', 'avancado', 'intermediario'];

export function lerHistorico() {
  try { return JSON.parse(fs.readFileSync(HISTORICO, 'utf8')); } catch { return []; }
}

export function registrarPublicacao(roteiro, extra = {}) {
  const h = lerHistorico();
  h.push({ data: new Date().toISOString().slice(0, 10), titulo: roteiro.titulo, pilar: roteiro.pilar, serie: roteiro.serie, nivel: roteiro.nivel, formato: roteiro.formato, ...extra });
  fs.mkdirSync(path.dirname(HISTORICO), { recursive: true });
  fs.writeFileSync(HISTORICO, JSON.stringify(h, null, 2));
}

// Próximos `dias` espaços da grade, continuando de onde o histórico parou.
export function esqueleto(dias = 7, { inicio = lerHistorico().length, longoACada = 7, livroACada = 28 } = {}) {
  const usos = {};
  for (let i = 0; i < inicio; i++) { const p = CICLO_PILARES[i % CICLO_PILARES.length]; usos[p] = (usos[p] || 0) + 1; }
  const grade = [];
  for (let d = 0; d < dias; d++) {
    const n = inicio + d;
    const pilar = CICLO_PILARES[n % CICLO_PILARES.length];
    const lista = SERIES_DO_PILAR[pilar];
    let serie = lista[(usos[pilar] || 0) % lista.length];
    const anterior = grade[grade.length - 1];
    if (anterior && anterior.serie === serie && lista.length > 1) serie = lista[((usos[pilar] || 0) + 1) % lista.length];
    usos[pilar] = (usos[pilar] || 0) + 1;
    const formato = (n + 1) % longoACada === 0 && pilar !== 'enem' ? 'longo' : 'curto';
    const item = { dia: d + 1, pilar, serie, nivel: CICLO_NIVEIS[n % CICLO_NIVEIS.length], formato };
    if ((n + 1) % livroACada === 0) item.livro = true; // "às vezes": um livro digital a cada ~4 semanas
    grade.push(item);
  }
  return grade;
}

// Confere a alternância de qualquer grade (usado para validar o que a IA devolve).
export function checarAlternancia(itens) {
  const problemas = [];
  for (let i = 1; i < itens.length; i++) {
    if (itens[i].pilar === itens[i - 1].pilar) problemas.push(`Dias ${i} e ${i + 1} repetem o pilar ${itens[i].pilar}.`);
    if (itens[i].serie === itens[i - 1].serie) problemas.push(`Dias ${i} e ${i + 1} repetem a série ${itens[i].serie}.`);
  }
  return problemas;
}

export const proximo = () => esqueleto(1)[0];
