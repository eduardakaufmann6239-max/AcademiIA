// Agente Autor — de vez em quando, transforma um tema em LIVRO DIGITAL (PDF): capa 3D, sumário, capítulos
// com gancho, seções, destaques, ilustrações 3D, mapa mental, exercícios com gabarito, glossário e referências.
// Fluxo: Autor planeja → Autor escreve cada capítulo → Qualidade revisa o livro → Autor corrige → diagramação em PDF.
// Sem chave de API: monta uma COLETÂNEA a partir dos roteiros de vídeo já publicados de um pilar.
import fs from 'node:fs';
import path from 'node:path';
import { capturarQuadros } from './render.js';
import { planejarTempos, textoFalado, NOMES_SERIE } from './roteiro.js';
import { imprimirPDF, ilustrarTitulos, mapaMentalSVG } from './resumo.js';
import { lerHistorico } from './agenda.js';
import { lerSubtemas } from './subtemas.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const S = (props, req = Object.keys(props)) => ({ type: 'object', additionalProperties: false, required: req, properties: props });
const str = { type: 'string' }, lista = (it) => ({ type: 'array', items: it });

const ESQ_PLANO = { type: 'json_schema', schema: S({
  titulo: str, subtitulo: str, publico: str, apresentacao: str,
  capitulos: lista(S({ titulo: str, objetivo: str, topicos: lista(str) })),
}) };
const ESQ_CAPITULO = { type: 'json_schema', schema: S({
  titulo: str, abertura: str,
  secoes: lista(S({ titulo: str, paragrafos: lista(str) })),
  destaque: S({ titulo: str, texto: str }),
  mapa_mental: S({ centro: str, ramos: lista(S({ titulo: str, filhos: lista(str) })) }),
  resumo: lista(str),
  exercicios: lista(S({ pergunta: str, resposta: str })),
  glossario: lista(S({ termo: str, definicao: str })),
  fontes: lista(str),
}) };
const ESQ_REVISAO = { type: 'json_schema', schema: S({
  aprovado: { type: 'boolean' }, resumo: str,
  correcoes: lista(S({ capitulo: { type: 'integer' }, problema: str, correcao: str })),
}) };

// Sugestões de tema para livro: pilares com mais vídeos publicados (viram coletânea/aprofundamento) e favoritos.
export function sugerirTemasLivro(n = 5) {
  const h = lerHistorico(); const cont = {};
  for (const x of h) if (x.pilar) cont[x.pilar] = (cont[x.pilar] || 0) + 1;
  const sub = lerSubtemas(); const sugestoes = [];
  for (const [pilar, k] of Object.entries(cont).sort((a, b) => b[1] - a[1])) if (k >= 3) sugestoes.push({ tema: `Guia completo: ${pilar} — reunindo e aprofundando os ${k} vídeos publicados`, pilar, motivo: `${k} vídeos publicados` });
  for (const [pilar, l] of Object.entries(sub)) if (Array.isArray(l)) { const f = l.filter((s) => s.favorito).slice(0, 3); if (f.length >= 3) sugestoes.push({ tema: `${f[0].titulo.replace(/\?$/, '')} e outras questões de ${pilar}`, pilar, motivo: `favoritos: ${f.map((x) => x.titulo).join(' / ')}` }); }
  return sugestoes.slice(0, n);
}

async function capa(titulo, pilar) {
  const cenas = {
    ia: [{ id: 'r', tipo: 'rede_neural', camadas_neuronios: [4, 6, 6, 3], posicao: [0, 3, 0] }],
    economia: [{ id: 'g', tipo: 'grafico_barras', valores: [1.5, 2.4, 3.2, 4.4], posicao: [0, 0, 0], mostrar_valores: false }, { id: 'm', tipo: 'moedas', x: 2.6, z: 1, quantidade: 12, pilhas: 2 }],
    neurociencia: [{ id: 'c', tipo: 'cerebro', posicao: [0, 3, 0], rotacao: 50 }],
    seguranca: [{ id: 'e', tipo: 'escudo', posicao: [0, 3, 0], escala: 1.6 }],
    sistemas: [{ id: 's', tipo: 'sistema', posicao: [0, 3, 0], componentes: [{ id: 'a', posicao: [-2, 1, 0] }, { id: 'b', posicao: [2, 1, 0], forma: 'cubo' }, { id: 'c', posicao: [0, -1.4, 0] }], conexoes: [{ de: 'a', para: 'b' }, { de: 'b', para: 'c' }, { de: 'c', para: 'a', tipo: 'feedback' }] }],
    medicina_chinesa: [{ id: 'y', tipo: 'yin_yang', posicao: [0, 3, 0], raio: 2 }],
    escola: [{ id: 'm', tipo: 'molecula', posicao: [0, 3, 0], escala: 2 }],
    enem: [{ id: 'l', tipo: 'linha_tempo', posicao: [0, 2, 0], eventos: [{ ano: 'Ler' }, { ano: 'Entender' }, { ano: 'Resolver' }] }],
  };
  const elementos = cenas[pilar] || [{ id: 'g', tipo: 'globo', posicao: [0, 3, 0], raio: 2.4 }];
  const r = planejarTempos({ titulo, formato: 'curto', cenas: [{ id: 'c', narracao: titulo, duracao: 5, camera: { alvo: [0, 3, 0], distancia: 6.5, elevacao: 15, azimute: [20, 25] }, elementos: elementos.map((e) => ({ ...e, atraso: 0 })) }] });
  const { quadros } = await capturarQuadros(r, [4.9], { semTextos: true, tamanho: { largura: 1240, altura: 1754 } });
  return quadros[0].jpeg;
}

function diagramar(livro, perfil) {
  const caps = livro.capitulos;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(livro.titulo)}</title><style>
  @page { size: A4; margin: 18mm 17mm 20mm; } @page :first { margin: 0; }
  body { font-family: 'DejaVu Serif', Georgia, serif; color: #1f2933; font-size: 11pt; line-height: 1.6; }
  h1, h2, h3, .sans { font-family: Inter, 'DejaVu Sans', sans-serif; color: #1d3557; }
  .capa { position: relative; width: 210mm; height: 297mm; page-break-after: always; overflow: hidden; }
  .capa img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .capa .tit { position: absolute; left: 12mm; right: 12mm; top: 18mm; background: rgba(29,53,87,.92); color: #fff; border-radius: 6mm; padding: 9mm 10mm; }
  .capa .tit h1 { color: #fff; font-size: 30pt; line-height: 1.1; margin: 0 0 4mm; } .capa .tit p { margin: 0; font-family: Inter, sans-serif; font-size: 13pt; color: #a8dadc; }
  .capa .rod { position: absolute; left: 12mm; bottom: 14mm; font-family: Inter, sans-serif; font-weight: 800; color: #1d3557; background: #fff; padding: 2mm 5mm; border-radius: 3mm; } .capa .rod b { color: #e63946; }
  .pag { page-break-before: always; }
  .sumario li { margin: 3px 0; font-family: Inter, sans-serif; }
  h2.cap { font-size: 22pt; border-bottom: 3px solid #e63946; padding-bottom: 4px; margin-top: 0; } .num { color: #e63946; font-size: 12pt; display: block; letter-spacing: .1em; }
  h3 { font-size: 13.5pt; margin: 16px 0 4px; } p { text-align: justify; margin: 0 0 8px; }
  .abertura { font-size: 12.5pt; font-style: italic; color: #457b9d; border-left: 4px solid #ffb703; padding-left: 10px; }
  figure { margin: 10px 0; break-inside: avoid; } figure img { width: 100%; border-radius: 6px; } figcaption { font-family: Inter, sans-serif; font-size: 8.5pt; color: #457b9d; }
  .destaque { background: #1d3557; color: #fff; border-radius: 8px; padding: 10px 14px; margin: 12px 0; break-inside: avoid; } .destaque h4 { margin: 0 0 4px; color: #ffb703; font-family: Inter, sans-serif; } .destaque p { margin: 0; }
  .caixa { border: 1px solid #d0d7de; border-radius: 8px; padding: 8px 12px; margin: 10px 0; break-inside: avoid; font-family: Inter, sans-serif; font-size: 9.8pt; }
  .gab { font-size: 9pt; color: #2a9d8f; } .fontes { font-size: 8.8pt; color: #52606d; }
  </style></head><body>
  <section class="capa"><img src="data:image/jpeg;base64,${livro.capa.toString('base64')}">
    <div class="tit"><h1>${esc(livro.titulo)}</h1><p>${esc(livro.subtitulo || '')}</p></div>
    <div class="rod">${esc(perfil.nome.toUpperCase())} · <b>${esc(perfil.arroba)}</b></div></section>
  <section><h2 class="sans">Apresentação</h2>${String(livro.apresentacao || '').split(/\n+/).map((p) => `<p>${md(p)}</p>`).join('')}
    <h2 class="sans">Sumário</h2><ol class="sumario">${caps.map((c) => `<li>${esc(c.titulo)}</li>`).join('')}<li>Glossário</li><li>Referências</li></ol></section>
  ${caps.map((c, i) => `<section class="pag"><h2 class="cap"><span class="num">CAPÍTULO ${i + 1}</span>${esc(c.titulo)}</h2>
    ${c.abertura ? `<p class="abertura">${md(c.abertura)}</p>` : ''}
    ${c.ilustracao ? `<figure><img src="data:image/jpeg;base64,${c.ilustracao.jpeg.toString('base64')}"><figcaption>Figura ${i + 1}. ${esc(c.ilustracao.legenda)}</figcaption></figure>` : ''}
    ${(c.secoes || []).map((s) => `<h3>${esc(s.titulo)}</h3>${(s.paragrafos || []).map((p) => `<p>${md(p)}</p>`).join('')}`).join('')}
    ${c.destaque?.texto ? `<div class="destaque"><h4>${esc(c.destaque.titulo)}</h4><p>${md(c.destaque.texto)}</p></div>` : ''}
    ${c.mapa_mental?.ramos?.length ? `<div class="caixa"><strong>Mapa do capítulo</strong>${mapaMentalSVG(c.mapa_mental)}</div>` : ''}
    ${c.resumo?.length ? `<div class="caixa"><strong>Em resumo</strong><ul>${c.resumo.map((x) => `<li>${md(x)}</li>`).join('')}</ul></div>` : ''}
    ${c.exercicios?.length ? `<div class="caixa"><strong>Exercícios</strong><ol>${c.exercicios.map((x) => `<li>${md(x.pergunta)}<br><span class="gab">Gabarito: ${md(x.resposta)}</span></li>`).join('')}</ol></div>` : ''}
  </section>`).join('')}
  <section class="pag"><h2 class="sans">Glossário</h2><dl>${[...new Map(caps.flatMap((c) => c.glossario || []).map((g) => [g.termo.toLowerCase(), g])).values()].sort((a, b) => a.termo.localeCompare(b.termo)).map((g) => `<dt><strong>${esc(g.termo)}</strong></dt><dd>${md(g.definicao)}</dd>`).join('')}</dl>
  <h2 class="sans">Referências</h2><ul class="fontes">${[...new Set(caps.flatMap((c) => c.fontes || []))].map((f) => `<li>${esc(f)}</li>`).join('')}</ul></section>
  </body></html>`;
}

// Livro escrito pelo Agente Autor (precisa de ANTHROPIC_API_KEY).
export async function escreverLivro(tema, { capitulos = 6, nivel = 'medio', publico, pilar, saida, log = console.log } = {}) {
  const { Agente, contextoPerfil, PERFIL_PADRAO } = await import('./agentes.js');
  const regras = `${contextoPerfil()}

Você escreve livros didáticos curtos (e-books) do perfil, com o mesmo método dos vídeos: cada capítulo responde a uma pergunta, explica um mecanismo e entrega conhecimento verificável; abre com um gancho, avança por progressão, revela algo e fecha com reflexão/aplicação. Conecte disciplinas e use pensamento sistêmico quando couber.
Rigor: só fatos consensuais ou bem documentados, números com ordem de grandeza correta e datados quando mudam; cite apenas fontes reais e verificáveis (livros, artigos, órgãos oficiais) — nunca invente referências. Diferencie claramente fato, interpretação e opinião. Siga as regras editoriais do perfil.
Estilo: português do Brasil, claro, parágrafos de 3–5 frases, exemplos do cotidiano brasileiro, termos técnicos explicados na primeira aparição. Nível: ${nivel}.`;
  const autor = new Agente('Autor', `Você é o Agente Autor da plataforma.\n${regras}`, { esforco: 'high', log });

  log('1/4 Autor planejando o livro...');
  const plano = JSON.parse(await autor.perguntar(`Planeje um livro sobre: "${tema}". ${capitulos} capítulos em progressão (do fundamento à aplicação). ${publico ? `Público: ${publico}.` : ''} Título atraente e verdadeiro, subtítulo, apresentação (2–3 parágrafos) e, por capítulo, título, objetivo de aprendizagem e 3–5 tópicos.`, { formato: ESQ_PLANO }));

  log(`2/4 Autor escrevendo ${plano.capitulos.length} capítulos...`);
  const caps = [];
  for (const [i, c] of plano.capitulos.entries()) {
    log(`   capítulo ${i + 1}: ${c.titulo}`);
    caps.push(JSON.parse(await autor.perguntar(`Escreva o capítulo ${i + 1} — "${c.titulo}" (objetivo: ${c.objetivo}; tópicos: ${c.topicos.join('; ')}). 900–1400 palavras nas seções, um quadro de destaque (curiosidade, alerta ou "na prova"), mapa mental, resumo em tópicos, 3–4 exercícios com gabarito comentado, glossário dos termos novos e fontes reais.`, { formato: ESQ_CAPITULO })));
  }

  log('3/4 Qualidade revisando o livro...');
  const qualidade = new Agente('Qualidade', `Você é o editor de qualidade e checador de fatos da plataforma.\n${contextoPerfil()}\nRevise o livro: precisão (fatos, números, datas, fontes reais e pertinentes), didática e progressão, coerência entre capítulos, regras editoriais. Aponte só problemas que importam, com correção concreta.`, { esforco: 'high', log });
  const rev = JSON.parse(await qualidade.perguntar(`Livro para revisão:\n${JSON.stringify({ ...plano, capitulos: caps }, null, 1)}`, { formato: ESQ_REVISAO }));
  log(`   ${rev.aprovado ? 'aprovado' : `${rev.correcoes.length} correção(ões)`}: ${rev.resumo}`);
  for (const n of [...new Set(rev.correcoes.map((x) => x.capitulo))]) {
    const i = n - 1; if (!caps[i]) continue;
    const lista = rev.correcoes.filter((x) => x.capitulo === n).map((x) => `- ${x.problema} → ${x.correcao}`).join('\n');
    log(`   Autor corrigindo o capítulo ${n}...`);
    caps[i] = JSON.parse(await autor.perguntar(`A Qualidade pediu correções no capítulo ${n}:\n${lista}\nDevolva o capítulo ${n} COMPLETO corrigido.`, { formato: ESQ_CAPITULO }));
  }

  log('4/4 Ilustrando e diagramando...');
  const ilustracoes = await ilustrarTitulos(autor, caps.map((c) => c.titulo), log);
  ilustracoes.forEach((x) => { if (caps[x.topico]) caps[x.topico].ilustracao = x; });
  const livro = { ...plano, capitulos: caps, capa: await capa(plano.titulo, pilar), revisao: rev };
  const destino = saida || path.join('saida', 'livros', `${slug(plano.titulo)}.pdf`);
  await imprimirPDF(diagramar(livro, PERFIL_PADRAO), destino);
  fs.writeFileSync(destino.replace(/\.pdf$/, '.json'), JSON.stringify({ ...livro, capa: undefined, capitulos: caps.map((c) => ({ ...c, ilustracao: c.ilustracao ? { legenda: c.ilustracao.legenda } : undefined })) }, null, 2));
  log(`Livro pronto: ${destino}`);
  return destino;
}

// Coletânea sem IA: reúne roteiros de vídeo (de um pilar) em um livro, com quadros de cada vídeo.
export async function coletanea({ pilar, pastas = ['roteiros', 'roteiros/exemplos'], titulo, saida, log = console.log } = {}) {
  const { PERFIL_PADRAO } = await import('./agentes.js');
  const roteiros = pastas.flatMap((p) => (fs.existsSync(p) ? fs.readdirSync(p).filter((f) => f.endsWith('.json') && !/qualidade|pauta|historico|roteiro-final/.test(f)).map((f) => path.join(p, f)) : []))
    .map((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } })
    .filter((r) => r?.cenas && (!pilar || r.pilar === pilar));
  if (!roteiros.length) throw new Error(`Nenhum roteiro${pilar ? ` do pilar ${pilar}` : ''} encontrado.`);
  log(`Montando coletânea com ${roteiros.length} vídeo(s)...`);
  const caps = [];
  for (const r0 of roteiros) {
    const r = planejarTempos(r0);
    let t = 0; const tempos = r.cenas.map((c) => { const m = t + c.duracao * 0.8; t += c.duracao; return m; });
    const { quadros } = await capturarQuadros(r, [tempos[Math.floor(tempos.length / 2)]], { semTextos: true, tamanho: { largura: 1200, altura: 1200 } });
    caps.push({
      titulo: r.titulo, abertura: r.pergunta_central || '',
      ilustracao: { jpeg: quadros[0].jpeg, legenda: `${NOMES_SERIE[r.serie] || ''} ${(r.disciplinas || []).join(' + ')}`.trim() },
      secoes: [{ titulo: 'Explicação', paragrafos: r.cenas.map((c) => textoFalado(c.narracao)) }],
      resumo: r.cenas.map((c) => c.texto_tela).filter(Boolean),
      exercicios: r.cenas.flatMap((c) => (c.elementos || []).filter((e) => e.tipo === 'questao')).map((q) => ({ pergunta: `${q.enunciado} ${q.alternativas.join(' ')}`, resposta: `${q.correta}${q.explicacoes?.[q.correta] ? ` — ${q.explicacoes[q.correta]}` : ''}` })),
      glossario: [], fontes: r.fontes || [],
    });
  }
  const nome = titulo || `Coletânea${pilar ? ` — ${pilar}` : ''}: ${PERFIL_PADRAO.nome}`;
  const livro = { titulo: nome, subtitulo: PERFIL_PADRAO.slogan, apresentacao: `Esta coletânea reúne ${caps.length} explicações publicadas em vídeo pelo perfil ${PERFIL_PADRAO.arroba}, organizadas para leitura e revisão.`, capitulos: caps, capa: await capa(nome, pilar) };
  const destino = saida || path.join('saida', 'livros', `${slug(nome)}.pdf`);
  await imprimirPDF(diagramar(livro, PERFIL_PADRAO), destino);
  log(`Coletânea pronta: ${destino}`);
  return destino;
}
