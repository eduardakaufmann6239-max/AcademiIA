// Subtemas curados por pilar, com favoritos. A pauta escolhe primeiro favoritos ainda não publicados.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerHistorico } from './agenda.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQ = path.join(RAIZ, 'subtemas.json');

export const lerSubtemas = () => JSON.parse(fs.readFileSync(ARQ, 'utf8'));
const salvar = (d) => fs.writeFileSync(ARQ, JSON.stringify(d, null, 2) + '\n');
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function marcarFavorito(trecho, valor = true) {
  const d = lerSubtemas(); const achados = [];
  for (const [pilar, lista] of Object.entries(d)) if (Array.isArray(lista)) for (const s of lista) if (norm(s.titulo).includes(norm(trecho))) { s.favorito = valor; achados.push(`${pilar}: ${s.titulo}`); }
  if (achados.length) salvar(d);
  return achados;
}

export function adicionarSubtema(titulo, pilar, favorito = false) {
  const d = lerSubtemas();
  if (!Array.isArray(d[pilar])) throw new Error(`Pilar "${pilar}" não existe em subtemas.json.`);
  d[pilar].push({ titulo, ...(favorito ? { favorito: true } : {}) });
  salvar(d);
}

// Escolhe o próximo subtema de um pilar: favoritos primeiro, depois os demais; pula os já publicados/reservados.
export function escolherSubtema(pilar, reservados = new Set()) {
  const lista = lerSubtemas()[pilar] || [];
  const publicados = new Set(lerHistorico().map((h) => norm(h.subtema || h.titulo || '')));
  const livre = (s) => !publicados.has(norm(s.titulo)) && !reservados.has(norm(s.titulo));
  const escolhido = lista.find((s) => s.favorito && livre(s)) || lista.find(livre) || null;
  if (escolhido) reservados.add(norm(escolhido.titulo));
  return escolhido;
}

export function listarSubtemas(pilar) {
  const d = lerSubtemas();
  return Object.entries(d).filter(([k, v]) => Array.isArray(v) && (!pilar || k === pilar))
    .map(([k, v]) => `\n${k}\n` + v.map((s) => `  ${s.favorito ? '★' : '·'} ${s.titulo}`).join('\n')).join('\n');
}
