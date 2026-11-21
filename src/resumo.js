// Agente Resumidor — transforma materiais extensos (PDF, texto, apostila, livro, documento ou o roteiro de um vídeo)
// em conhecimento organizado: resumo hierárquico, mapa mental, conceitos-chave, ENEM, fichas e questões de revisão.
//
// REGRA FUNDAMENTAL: toda informação é marcada com a sua origem —
//   material     → está no material original (com referência: página/trecho/cena)
//   complemento  → explicação complementar para facilitar o entendimento
//   inferencia   → conclusão tirada a partir do material, que ele não diz explicitamente
//   externo      → informação externa/atualizada que não vem do material
// e nada complementar é apresentado como se estivesse no original.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planejarTempos, textoFalado, NOMES_SERIE, NOMES_NIVEL } from './roteiro.js';
import { capturarQuadros, carregarPlaywright } from './render.js';
import { extrairQuadros } from './producao.js';

export const MODOS = {
  fiel: 'Resumo fiel — preserva as informações essenciais da fonte, sem simplificar o sentido; quase tudo deve ser "material".',
  simplificado: 'Resumo simplificado — explica conceitos difíceis em linguagem acessível, com analogias (marcadas como "complemento").',
  aprofundado: 'Resumo aprofundado — desenvolve mecanismos, causas e consequências.',
  comparativo: 'Resumo comparativo — identifica semelhanças e diferenças entre as fontes ou entre os conceitos do material.',
  estruturado: 'Resumo estruturado — organiza tudo hierarquicamente em tópicos e subtópicos.',
  provas: 'Resumo para provas — prioriza conceitos cobrados, aplicações acadêmicas, pegadinhas e o que cai no ENEM/vestibulares.',
};
export const NIVEIS_RESUMO = {
  fundamental: 'Ensino Fundamental — frases curtas, exemplos concretos, sem jargão.',
  medio: 'Ensino Médio — termos técnicos explicados, foco em ENEM/vestibulares.',
  avancado: 'Nível avançado — linguagem técnica, nuances e limitações.',
};
const ORIGENS = ['material', 'complemento', 'inferencia', 'externo'];
const NOME_ORIGEM = { material: 'Do material', complemento: 'Explicação complementar', inferencia: 'Inferência', externo: 'Informação externa' };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const negrito = (s) => esc(s).replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/\*/g, '');

// ---------------------------------------------------------------- esquema de saída (structured outputs)
const ITEM = {
  type: 'object', additionalProperties: false, required: ['texto', 'origem', 'referencia'],
  properties: { texto: { type: 'string' }, origem: { type: 'string', enum: ORIGENS }, referencia: { type: 'string', description: 'página, seção, trecho ou cena de onde veio; vazio se não for do material' } },
};
const ESQUEMA = {
  type: 'json_schema',
  schema: {
    type: 'object', additionalProperties: false,
    required: ['titulo', 'resumo', 'topicos', 'conceitos', 'mapa_mental', 'comparacao', 'enem', 'fichas', 'questoes', 'avisos'],
    properties: {
      titulo: { type: 'string' },
      resumo: { type: 'array', items: ITEM, description: '3 a 6 frases' },
      topicos: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['titulo', 'itens', 'subtopicos'],
          properties: {
            titulo: { type: 'string' }, itens: { type: 'array', items: ITEM },
            subtopicos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['titulo', 'itens'], properties: { titulo: { type: 'string' }, itens: { type: 'array', items: ITEM } } } },
          },
        },
      },
      conceitos: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['termo', 'tipo', 'texto', 'origem', 'referencia'],
          properties: { termo: { type: 'string' }, tipo: { type: 'string', enum: ['definicao', 'argumento', 'formula', 'dado', 'exemplo'] }, texto: { type: 'string' }, origem: { type: 'string', enum: ORIGENS }, referencia: { type: 'string' } },
        },
      },
      mapa_mental: {
        type: 'object', additionalProperties: false, required: ['centro', 'ramos'],
        properties: { centro: { type: 'string' }, ramos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['titulo', 'filhos'], properties: { titulo: { type: 'string' }, filhos: { type: 'array', items: { type: 'string' } } } } } },
      },
      comparacao: {
        type: 'array', description: 'só no modo comparativo; vazio nos outros',
        items: { type: 'object', additionalProperties: false, required: ['aspecto', 'semelhanca', 'diferenca', 'origem'], properties: { aspecto: { type: 'string' }, semelhanca: { type: 'string' }, diferenca: { type: 'string' }, origem: { type: 'string', enum: ORIGENS } } },
      },
      enem: {
        type: 'object', additionalProperties: false, required: ['relevante', 'areas', 'competencias_habilidades', 'como_cai'],
        properties: {
          relevante: { type: 'boolean' }, areas: { type: 'array', items: { type: 'string' } },
          competencias_habilidades: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['codigo', 'descricao'], properties: { codigo: { type: 'string' }, descricao: { type: 'string' } } } },
          como_cai: { type: 'string' },
        },
      },
      fichas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['frente', 'verso'], properties: { frente: { type: 'string' }, verso: { type: 'string' } } } },
      questoes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['pergunta', 'resposta', 'nivel'], properties: { pergunta: { type: 'string' }, resposta: { type: 'string' }, nivel: { type: 'string', enum: ['lembrar', 'compreender', 'aplicar', 'analisar'] } } } },
      avisos: { type: 'array', items: { type: 'string' }, description: 'limitações: trechos ilegíveis, material incompleto, pontos controversos' },
    },
  },
};

// ---------------------------------------------------------------- leitura dos materiais
function blocoDoArquivo(arq) {
  const ext = path.extname(arq).toLowerCase(), titulo = path.basename(arq);
  if (ext === '.pdf') return { type: 'document', title: titulo, source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(arq).toString('base64') } };
  let texto;
  if (ext === '.docx') {
    const xml = execFileSync('unzip', ['-p', arq, 'word/document.xml'], { maxBuffer: 1 << 28 }).toString();
    texto = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  } else if (ext === '.json') {
    const r = JSON.parse(fs.readFileSync(arq, 'utf8'));
    texto = r.cenas ? roteiroComoTexto(r) : JSON.stringify(r, null, 1);
  } else texto = fs.readFileSync(arq, 'utf8');
  return { type: 'document', title: titulo, source: { type: 'text', media_type: 'text/plain', data: texto } };
}

function roteiroComoTexto(r) {
  const linhas = [`VÍDEO: ${r.titulo}`, r.pergunta_central && `Pergunta central: ${r.pergunta_central}`];
  r.cenas.forEach((c, i) => {
    linhas.push(`\n[Cena ${c.id || i + 1}${c.etapa ? ` — ${c.etapa}` : ''}] Texto na tela: ${c.texto_tela || '-'}\nNarração: ${textoFalado(c.narracao)}`);
    for (const e of c.elementos || []) {
      if (['rotulo', 'equacao'].includes(e.tipo)) linhas.push(`Na tela (${e.tipo}): ${[e.texto, e.subtexto].filter(Boolean).join(' — ')}`);
      if (e.tipo === 'questao') linhas.push(`Questão (${e.origem}): ${e.enunciado}\n${(e.alternativas || []).join('\n')}\nCorreta: ${e.correta}${e.explicacoes ? `\nExplicações: ${JSON.stringify(e.explicacoes)}` : ''}`);
      if (e.tipo === 'sistema') linhas.push(`Sistema: componentes ${(e.componentes || []).map((c) => `${c.nome}${c.descricao ? ` (${c.descricao})` : ''}`).join(', ')}; conexões ${(e.conexoes || []).map((k) => `${k.de}→${k.para}${k.rotulo ? ` (${k.rotulo})` : ''}`).join(', ')}`);
      if (e.tipo === 'linha_tempo') linhas.push(`Linha do tempo: ${(e.eventos || []).map((x) => `${x.ano}: ${x.texto}`).join('; ')}`);
      if (e.tipo === 'camadas') linhas.push(`Camadas: ${(e.camadas || []).map((x) => x.nome).join(', ')}`);
      if (e.tipo === 'cerebro') for (const rg of e.regioes || []) linhas.push(`Região destacada: ${rg.nome}${rg.descricao ? ` — ${rg.descricao}` : ''}`);
      if (e.tipo === 'grafico_barras') linhas.push(`Gráfico: ${(e.rotulos || []).join(', ')}`);
    }
  });
  if (r.fontes?.length) linhas.push(`\nFontes citadas: ${r.fontes.join('; ')}`);
  return linhas.filter(Boolean).join('\n');
}

// Versão sem IA (só para roteiros de vídeo): tudo vem do próprio roteiro, logo origem = material.
function resumoSemIA(r) {
  const NOMES_ETAPA = { gancho: 'A pergunta', curiosidade: 'O problema', explicacao: 'Explicação', demonstracao: 'Demonstração', revelacao: 'A descoberta', fechamento: 'Reflexão' };
  const topicos = [];
  r.cenas.forEach((c, i) => {
    const titulo = NOMES_ETAPA[c.etapa] || c.texto_tela || `Parte ${i + 1}`;
    const item = { texto: textoFalado(c.narracao), origem: 'material', referencia: `cena ${c.id || i + 1}` };
    const ult = topicos[topicos.length - 1];
    if (ult && ult.titulo === titulo) ult.itens.push(item); else topicos.push({ titulo, itens: [item], subtopicos: [] });
  });
  const termos = [...new Set(r.cenas.flatMap((c) => [...(c.narracao || '').matchAll(/\*([^*]+)\*/g)].map((m) => m[1].trim())))];
  return {
    titulo: r.titulo,
    resumo: [{ texto: r.pergunta_central ? `Pergunta central: ${r.pergunta_central}` : (r.legenda_post || r.titulo), origem: 'material', referencia: 'roteiro' }],
    topicos,
    conceitos: termos.map((t) => ({ termo: t, tipo: 'definicao', texto: '', origem: 'material', referencia: '' })),
    mapa_mental: { centro: r.titulo, ramos: topicos.slice(0, 6).map((t) => ({ titulo: t.titulo, filhos: r.cenas.filter((c) => (NOMES_ETAPA[c.etapa] || c.texto_tela) === t.titulo).map((c) => c.texto_tela).filter(Boolean).slice(0, 3) })) },
    comparacao: [],
    enem: { relevante: !!r.enem, areas: r.enem ? [r.enem.area] : [], competencias_habilidades: r.enem?.habilidade ? [{ codigo: `${r.enem.competencia || ''} ${r.enem.habilidade}`.trim(), descricao: '' }] : [], como_cai: '' },
    fichas: r.cenas.filter((c) => c.texto_tela).map((c) => ({ frente: c.texto_tela, verso: textoFalado(c.narracao) })),
    questoes: [], avisos: ['Resumo gerado sem IA, direto do roteiro: defina ANTHROPIC_API_KEY para glossário, questões e mapa mental completos.'],
  };
}

// ---------------------------------------------------------------- mapa mental (SVG radial)
export function mapaMentalSVG(m) {
  const W = 760, H = 520, cx = W / 2, cy = H / 2, ramos = m.ramos || [];
  const cores = ['#457b9d', '#2a9d8f', '#e76f51', '#9b5de5', '#f4a261', '#e63946', '#1d3557', '#06d6a0'];
  const quebra = (t, n = 18) => { const p = String(t).split(' '); const l = ['']; for (const w of p) { if ((l[l.length - 1] + ' ' + w).trim().length > n) l.push(w); else l[l.length - 1] = (l[l.length - 1] + ' ' + w).trim(); } return l.slice(0, 3); };
  const texto = (x, y, t, tam, cor, peso = 600, n) => { const ls = quebra(t, n); return `<text x="${x}" y="${y - ((ls.length - 1) * tam * 0.6)}" font-size="${tam}" fill="${cor}" font-weight="${peso}" text-anchor="middle">${ls.map((l, i) => `<tspan x="${x}" dy="${i ? tam * 1.15 : 0}">${esc(l)}</tspan>`).join('')}</text>`; };
  let s = '';
  ramos.forEach((r, i) => {
    const a = (i / Math.max(1, ramos.length)) * Math.PI * 2 - Math.PI / 2, c = cores[i % cores.length];
    const rx = cx + Math.cos(a) * 190, ry = cy + Math.sin(a) * 150;
    s += `<path d="M${cx},${cy} Q${(cx + rx) / 2 + Math.sin(a) * 20},${(cy + ry) / 2 - Math.cos(a) * 20} ${rx},${ry}" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    (r.filhos || []).slice(0, 4).forEach((f, j, arr) => {
      const b = a + (j - (arr.length - 1) / 2) * 0.32, fx = cx + Math.cos(b) * 300, fy = cy + Math.sin(b) * 215;
      s += `<line x1="${rx}" y1="${ry}" x2="${fx}" y2="${fy}" stroke="${c}" stroke-width="2" opacity=".6"/>`;
      s += texto(fx, fy + 4, f, 10, '#1d3557', 500, 20);
    });
    s += `<rect x="${rx - 62}" y="${ry - 20}" width="124" height="40" rx="12" fill="${c}"/>` + texto(rx, ry + 4, r.titulo, 11, '#fff', 700, 18);
  });
  s += `<rect x="${cx - 95}" y="${cy - 30}" width="190" height="60" rx="16" fill="#1d3557"/>` + texto(cx, cy + 5, m.centro, 13, '#fff', 800, 24);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Inter, DejaVu Sans, sans-serif">${s}</svg>`;
}

// ---------------------------------------------------------------- HTML → PDF
const selo = (o) => `<span class="o o-${o}">${NOME_ORIGEM[o] || o}</span>`;
const linhaItem = (it) => `<li>${negrito(it.texto)} ${selo(it.origem)}${it.referencia ? ` <span class="ref">${esc(it.referencia)}</span>` : ''}</li>`;

function html({ dados, perfil, meta, imagens, ilustracoes = [] }) {
  const d = dados;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(d.titulo)}</title><style>
  @page { size: A4; margin: 15mm 14mm; }
  body { font-family: Inter, 'DejaVu Sans', sans-serif; color: #1d3557; font-size: 10.3pt; line-height: 1.45; }
  header { border-bottom: 3px solid #e63946; padding-bottom: 8px; margin-bottom: 10px; }
  .marca { font-weight: 800; font-size: 8.5pt; letter-spacing: .04em; color: #457b9d; } .marca b { color: #e63946; }
  h1 { font-size: 20pt; margin: 4px 0 6px; line-height: 1.15; }
  .meta span { display: inline-block; background: #e9eef2; border-radius: 10px; padding: 2px 9px; margin: 0 5px 3px 0; font-size: 8.3pt; font-weight: 700; }
  .legenda { font-size: 8pt; margin: 6px 0 0; }
  h2 { font-size: 12.5pt; border-left: 5px solid #ffb703; padding-left: 8px; margin: 16px 0 6px; break-after: avoid; }
  h3 { font-size: 10.8pt; margin: 8px 0 3px; } h4 { font-size: 10pt; margin: 6px 0 2px; color: #457b9d; }
  ul { margin: 3px 0 6px; padding-left: 18px; } li { margin: 2px 0; }
  .o { display: inline-block; font-size: 7pt; font-weight: 700; border-radius: 8px; padding: 0 6px; vertical-align: 1px; white-space: nowrap; }
  .o-material { background: #d8f3dc; color: #1b4332; } .o-complemento { background: #dbeafe; color: #1e3a8a; }
  .o-inferencia { background: #fff3c4; color: #7a5b00; } .o-externo { background: #ede0fb; color: #5b2a86; }
  .ref { font-size: 7.5pt; color: #6c757d; }
  .caixa { border: 1px solid #d0d7de; border-radius: 8px; padding: 8px 11px; margin: 8px 0; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; } th, td { border: 1px solid #d0d7de; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #e9eef2; }
  .fichas { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .ficha { border: 1.5px dashed #457b9d; border-radius: 8px; padding: 6px 9px; break-inside: avoid; } .ficha b { display: block; color: #e63946; }
  .quadros { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; } .quadros img { width: 100%; border-radius: 6px; border: 1px solid #d0d7de; }
  .quadros figure { margin: 0; } .quadros figcaption { font-size: 7.5pt; text-align: center; color: #457b9d; }
  .ilustra { margin: 6px 0 8px; break-inside: avoid; } .ilustra img { width: 100%; border-radius: 8px; border: 1px solid #d0d7de; } .ilustra figcaption { font-size: 8.3pt; color: #457b9d; margin-top: 2px; }
  .aviso { font-size: 8.5pt; color: #7a5b00; background: #fff8e1; border-radius: 6px; padding: 5px 8px; }
  </style></head><body>
  <header><div class="marca">${esc(perfil.nome.toUpperCase())} · <b>${esc(perfil.arroba)}</b> · Agente Resumidor</div>
  <h1>${esc(d.titulo)}</h1><div class="meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
  <p class="legenda">Origem de cada informação: ${ORIGENS.map(selo).join(' ')}</p></header>

  <h2>Resumo</h2><ul>${d.resumo.map(linhaItem).join('')}</ul>
  ${imagens.length ? `<h2>O que aparece no vídeo</h2><div class="quadros">${imagens.map((q) => `<figure><img src="data:image/jpeg;base64,${q.jpeg.toString('base64')}"><figcaption>${esc(q.legenda)}</figcaption></figure>`).join('')}</div>` : ''}
  <h2>Mapa mental</h2><div class="caixa">${mapaMentalSVG(d.mapa_mental)}</div>
  <h2>Conteúdo organizado</h2>
  ${d.topicos.map((t, i) => `<h3>${i + 1}. ${esc(t.titulo)}</h3>${ilustracoes.filter((x) => x.topico === i).map((x) => `<figure class="ilustra"><img src="data:image/jpeg;base64,${x.jpeg.toString('base64')}"><figcaption>${esc(x.legenda)} ${selo('complemento')}</figcaption></figure>`).join('')}<ul>${t.itens.map(linhaItem).join('')}</ul>${(t.subtopicos || []).map((s, j) => `<h4>${i + 1}.${j + 1} ${esc(s.titulo)}</h4><ul>${s.itens.map(linhaItem).join('')}</ul>`).join('')}`).join('')}
  ${d.conceitos.length ? `<h2>Conceitos-chave</h2><table><tr><th>Termo</th><th>Tipo</th><th>Explicação</th><th>Origem</th></tr>${d.conceitos.map((c) => `<tr><td><strong>${esc(c.termo)}</strong></td><td>${esc(c.tipo)}</td><td>${negrito(c.texto)}${c.referencia ? ` <span class="ref">${esc(c.referencia)}</span>` : ''}</td><td>${selo(c.origem)}</td></tr>`).join('')}</table>` : ''}
  ${d.comparacao.length ? `<h2>Comparação</h2><table><tr><th>Aspecto</th><th>Semelhanças</th><th>Diferenças</th><th>Origem</th></tr>${d.comparacao.map((c) => `<tr><td><strong>${esc(c.aspecto)}</strong></td><td>${esc(c.semelhanca)}</td><td>${esc(c.diferenca)}</td><td>${selo(c.origem)}</td></tr>`).join('')}</table>` : ''}
  ${d.enem.relevante ? `<h2>Para o ENEM</h2><div class="caixa">${d.enem.areas.length ? `<p><strong>Áreas:</strong> ${esc(d.enem.areas.join(', '))}</p>` : ''}${d.enem.competencias_habilidades.length ? `<ul>${d.enem.competencias_habilidades.map((h) => `<li><strong>${esc(h.codigo)}</strong> ${esc(h.descricao)}</li>`).join('')}</ul>` : ''}${d.enem.como_cai ? `<p><strong>Como costuma cair:</strong> ${esc(d.enem.como_cai)} ${selo('complemento')}</p>` : ''}</div>` : ''}
  ${d.fichas.length ? `<h2>Fichas de estudo</h2><div class="fichas">${d.fichas.map((f) => `<div class="ficha"><b>${esc(f.frente)}</b>${esc(f.verso)}</div>`).join('')}</div>` : ''}
  ${d.questoes.length ? `<h2>Questões de revisão</h2><ol>${d.questoes.map((q) => `<li>${esc(q.pergunta)} <span class="ref">(${esc(q.nivel)})</span><br><small><em>Resposta: ${esc(q.resposta)}</em></small></li>`).join('')}</ol>` : ''}
  ${d.avisos.length ? `<h2>Avisos</h2>${d.avisos.map((a) => `<p class="aviso">${esc(a)}</p>`).join('')}` : ''}
  </body></html>`;
}

export async function imprimirPDF(pagina, saida) {
  fs.mkdirSync(path.dirname(path.resolve(saida)), { recursive: true });
  fs.writeFileSync(saida.replace(/\.pdf$/i, '.html'), pagina);
  const { chromium } = carregarPlaywright();
  const browser = await chromium.launch();
  try { const page = await browser.newPage(); await page.setContent(pagina, { waitUntil: 'load' }); await page.pdf({ path: saida, format: 'A4', printBackground: true }); }
  finally { await browser.close(); }
  return saida;
}

function validarOrigens(d) { // garante a regra mesmo se algo vier fora do padrão
  const ok = (o) => (ORIGENS.includes(o) ? o : 'complemento');
  for (const it of [...d.resumo, ...d.topicos.flatMap((t) => [...t.itens, ...(t.subtopicos || []).flatMap((s) => s.itens)]), ...d.conceitos, ...d.comparacao]) {
    it.origem = ok(it.origem);
    if (it.origem !== 'material' && 'referencia' in it && it.referencia && !/^(—|-)?$/.test(it.referencia) && it.origem === 'externo') it.referencia = it.referencia; // fontes externas podem citar referência
  }
  return d;
}

// ---------------------------------------------------------------- ilustrações 3D
// O próprio Resumidor desenha cenas com a biblioteca 3D; o motor renderiza cada uma como imagem estática.
async function ilustrar(agente, dados, log) { return ilustrarTitulos(agente, dados.topicos.slice(0, 4).map((t) => t.titulo), log); }

export async function ilustrarTitulos(agente, topicos, log = console.log, { largura = 1200, altura = 675 } = {}) {
  const { planejarTempos: pt, catalogoTexto, validar } = await import('./roteiro.js');
  if (!topicos.length) return [];
  log(`  · Resumidor desenhando ${topicos.length} ilustração(ões) 3D...`);
  let roteiro;
  try {
    roteiro = await agente.pedirRoteiro(`Agora crie ILUSTRAÇÕES 3D para o material, uma por tópico: ${topicos.map((t, i) => `${i + 1}) ${t}`).join('; ')}.
Devolva um roteiro JSON com "titulo", "formato": "longo" e uma cena por tópico (na mesma ordem). Cada cena é uma imagem independente (ignore continuidade): coloque nela todos os elementos necessários, com ids únicos no roteiro inteiro, "atraso": 0, e uma câmera que enquadre tudo (horizontal 16:9, distancia 9–18). Em "narracao" escreva a legenda da imagem (uma frase). Use rótulos curtos para nomear as partes. A imagem deve EXPLICAR o tópico (metáfora visual clara), sem poluição (até ~5 elementos).
Biblioteca (use somente estes tipos):
${catalogoTexto()}`);
  } catch (e) { log(`  · ilustrações não geradas: ${e.message}`); return []; }
  const imagens = [];
  for (const [i, cena] of roteiro.cenas.entries()) {
    const unico = pt({ titulo: roteiro.titulo || 'ilustração', formato: 'longo', cenas: [{ ...cena, duracao: 4, remover: [], destacar: [], explodir: cena.explodir || [] }] });
    if (validar(unico).length) continue;
    try {
      const { quadros } = await capturarQuadros(unico, [unico.cenas[0].duracao - 0.05], { semTextos: true, tamanho: { largura, altura } });
      imagens.push({ jpeg: quadros[0].jpeg, legenda: textoFalado(cena.narracao), topico: i });
    } catch (e) { log(`  · falha ao renderizar ilustração ${i + 1}: ${e.message}`); }
  }
  return imagens;
}

// ---------------------------------------------------------------- API pública
// Resumir qualquer material (um ou vários arquivos).
export async function resumirMateriais(arquivos, { modo = 'estruturado', nivel = 'medio', saida, foco, ilustrarTopicos = true, log = console.log } = {}) {
  if (!MODOS[modo]) throw new Error(`Modo inválido. Use: ${Object.keys(MODOS).join(', ')}`);
  if (!NIVEIS_RESUMO[nivel]) throw new Error(`Nível inválido. Use: ${Object.keys(NIVEIS_RESUMO).join(', ')}`);
  if (modo === 'comparativo' && arquivos.length < 2) log('  (modo comparativo com 1 arquivo: compara conceitos dentro do próprio material)');
  const { Agente, contextoPerfil, PERFIL_PADRAO } = await import('./agentes.js');
  const agente = new Agente('Resumidor', `Você é o Agente Resumidor da plataforma: transforma grandes volumes de informação em conhecimento organizado, compreensível e útil para aprendizagem e revisão.
${contextoPerfil()}

Processo: leitura → análise → seleção do essencial → organização (hierarquia de tópicos e subtópicos) → mapa mental → conceitos-chave (definições, argumentos, fórmulas, dados) → relevância para o ENEM (áreas e, só se tiver segurança, competências/habilidades da Matriz de Referência do INEP) → fichas de estudo → questões de revisão (de lembrar a analisar).

REGRA FUNDAMENTAL — marque a origem de CADA informação:
- "material": está no material original. Preencha "referencia" com página, seção, trecho curto ou cena.
- "complemento": explicação/analogia sua para facilitar o entendimento.
- "inferencia": conclusão que você tira do material, mas que ele não afirma explicitamente.
- "externo": informação de fora do material (contexto, atualização). Só use se for consenso e diga a fonte em "referencia"; se não tiver certeza, não inclua.
Nunca invente conteúdo nem apresente complemento/inferência/externo como se estivesse no documento. Se o material tiver erro ou estiver desatualizado, registre em "avisos" em vez de corrigir silenciosamente.`, { esforco: 'high', log });

  const conteudo = arquivos.map(blocoDoArquivo);
  conteudo.push({ type: 'text', text: `Modo: ${MODOS[modo]}\nNível: ${NIVEIS_RESUMO[nivel]}${foco ? `\nFoco pedido: ${foco}` : ''}\nMateriais: ${arquivos.map((a) => path.basename(a)).join(', ')}.${modo !== 'comparativo' ? ' Deixe "comparacao" vazio.' : ''}` });
  log(`  · Resumidor lendo ${arquivos.length} material(is) — modo ${modo}, nível ${nivel}...`);
  const dados = validarOrigens(JSON.parse(await agente.perguntar(conteudo, { formato: ESQUEMA })));
  const ilustracoes = ilustrarTopicos ? await ilustrar(agente, dados, log) : [];
  const destino = saida || path.join('saida', 'resumos', `${path.basename(arquivos[0]).replace(/\.[^.]+$/, '')}-${modo}.pdf`);
  await imprimirPDF(html({ dados, perfil: PERFIL_PADRAO, meta: [MODOS[modo].split(' — ')[0], NIVEIS_RESUMO[nivel].split(' — ')[0], `Fonte: ${arquivos.map((a) => path.basename(a)).join(', ')}`], imagens: [], ilustracoes }), destino);
  fs.writeFileSync(destino.replace(/\.pdf$/i, '.json'), JSON.stringify(dados, null, 2));
  log(`  · PDF: ${destino}`);
  return { pdf: destino, dados };
}

// Resumo do vídeo: tudo o que foi apresentado, com quadros do vídeo.
export async function gerarResumoPDF(roteiro, saidaPDF, { video, modo = 'estruturado', nivel, semIA = !process.env.ANTHROPIC_API_KEY, log = console.log } = {}) {
  const { PERFIL_PADRAO } = await import('./agentes.js');
  const r = planejarTempos(roteiro);
  const nivelResumo = nivel || (r.nivel === 'avancado' ? 'avancado' : r.nivel === 'basico' ? 'fundamental' : 'medio');
  let dados;
  if (semIA) { log('  · Resumidor (sem IA, direto do roteiro)...'); dados = resumoSemIA(r); }
  else {
    const tmp = saidaPDF.replace(/\.pdf$/i, '') + '-roteiro.txt';
    fs.writeFileSync(tmp, roteiroComoTexto(r));
    dados = (await resumirMateriais([tmp], { modo, nivel: nivelResumo, saida: saidaPDF, ilustrarTopicos: false, foco: 'Resuma TUDO o que foi apresentado no vídeo (narração, textos na tela, rótulos, questões, sistemas). Referências = número da cena.', log })).dados;
    fs.unlinkSync(tmp);
  }
  let t = 0; const tempos = r.cenas.map((c) => { const m = t + c.duracao * 0.75; t += c.duracao; return m; });
  const quadros = video && fs.existsSync(video) ? extrairQuadros(video, tempos, saidaPDF.replace(/\.pdf$/i, '') + '-quadros') : (await capturarQuadros(r, tempos)).quadros;
  const imagens = quadros.slice(0, 8).map((q, i) => ({ jpeg: q.jpeg, legenda: r.cenas[i].texto_tela || `Cena ${i + 1}` }));
  const meta = [NOMES_SERIE[r.serie], NOMES_NIVEL[r.nivel] && `Nível ${NOMES_NIVEL[r.nivel]}`, (r.disciplinas || []).join(' + '), r.enem && `ENEM · ${r.enem.area}`].filter(Boolean);
  await imprimirPDF(html({ dados: { ...dados, titulo: r.titulo }, perfil: PERFIL_PADRAO, meta, imagens }), saidaPDF);
  log(`  · PDF de estudo: ${saidaPDF}`);
  return saidaPDF;
}
