// Testes rápidos (sem rede, sem renderizar): roteiros de exemplo válidos, rodízio alternado e módulos carregando.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validar, planejarTempos } from '../src/roteiro.js';
import { esqueleto, checarAlternancia } from '../src/agenda.js';

let falhas = 0;
const caso = (nome, fn) => { try { fn(); console.log(`ok   ${nome}`); } catch (e) { falhas++; console.log(`FALHA ${nome}: ${e.message}`); } };

for (const f of fs.readdirSync('roteiros/exemplos').filter((x) => x.endsWith('.json')))
  caso(`roteiro ${f}`, () => assert.deepEqual(validar(planejarTempos(JSON.parse(fs.readFileSync(`roteiros/exemplos/${f}`, 'utf8')))), []));
caso('rodízio de 28 dias sem pilar ou série repetidos', () => assert.deepEqual(checarAlternancia(esqueleto(28, { inicio: 0 })), []));
caso('roteiro inválido é rejeitado', () => assert.ok(validar({ titulo: 'x', formato: 'curto', cenas: [{ narracao: 'a', elementos: [{ id: 'e', tipo: 'inexistente' }] }] }).length > 0));
for (const m of ['agentes', 'produtor', 'revisor', 'estudio', 'resumo', 'livro', 'subtemas'])
  await import(`../src/${m}.js`).then(() => console.log(`ok   módulo ${m}`), (e) => { falhas++; console.log(`FALHA módulo ${m}: ${e.message}`); });
process.exit(falhas ? 1 : 0);
