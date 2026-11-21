#!/usr/bin/env node
// Conhecimento Explicado — estúdio de vídeos 3D com uma equipe de agentes de IA.
import fs from 'node:fs';
import path from 'node:path';
import { capturarQuadros } from './render.js';
import { validar, planejarTempos, duracaoTotal } from './roteiro.js';
import { produzirDireto, MARCA } from './producao.js';

const AJUDA = `
Conhecimento Explicado — estúdio de vídeos 3D com agentes de IA

Equipe: Roteirista → Designer → Qualidade → Produtor de Vídeo → Revisor do Vídeo Final → Resumidor (PDF)
        (+ Editor de pauta e Analista de métricas)

Com IA (precisa de ANTHROPIC_API_KEY):
  criar "<tema>" [--formato curto|longo] [--pilar <pilar>] [--serie <serie>] [--nivel basico|intermediario|avancado]
                 [--qualidade padrao|hd] [--rodadas 3] [--revisoes 2]
        Os 5 agentes criam, produzem e revisam o vídeo do zero.
        Pilares: ia, economia, neurociencia, seguranca, escola, sistemas, enem, interdisciplinar
        Séries: como_funciona, aprenda_60s, voce_sabia, entenda_o_mundo, conectando, entenda_o_sistema,
                enem_1min, questao_comentada, por_que_errada, redacao_1000, conexoes_enem, simulado_relampago
  produzir <roteiro.json> [--qualidade padrao|hd]   Produtor + Revisor a partir de um roteiro pronto.
  revisar <video.mp4> <roteiro.json>                Só o Revisor do Vídeo Final.
  pauta [--dias 7] [--offline]                      Calendário com conteúdo ALTERNADO (rodízio de pilares/séries,
                                                    subtemas favoritos primeiro). --offline: sem IA.
  resumir <arquivos...> [--modo fiel|simplificado|aprofundado|comparativo|estruturado|provas]
          [--nivel fundamental|medio|avancado] [--foco "..."] [--sem-ilustracoes] [--saida x.pdf]
                                                    Agente Resumidor para qualquer material (PDF, TXT, MD, DOCX):
                                                    resumo hierárquico, mapa mental, ilustrações 3D, conceitos,
                                                    ENEM, fichas e questões — com a origem de cada informação.
  livro "<tema>" [--capitulos 6] [--nivel fundamental|medio|avancado] [--pilar p]
                                                    Agente Autor: e-book em PDF (capa 3D, capítulos ilustrados,
                                                    exercícios, glossário, referências), revisado pela Qualidade.
  livro --sugerir                                   Sugere temas de livro (favoritos e pilares mais publicados).
  livro --coletanea [--pilar p]                     Sem IA: reúne os roteiros de vídeo em um livro.
  aprender <metricas.csv>                           Agente Analista: lê métricas reais e gera lições
                                                    (roteiros/aprendizados.md) usadas nos próximos roteiros.

Sem IA (funciona offline):
  render <roteiro.json> [--rapido|--hd] [--sem-voz] [--saida arquivo.mp4]
  verificar <video.mp4> <roteiro.json>   Verificações automáticas do MP4 (duração, pretos, silêncios).
  previa <roteiro.json>                  Um quadro JPEG por cena.
  validar <roteiro.json>                 Confere o roteiro (técnica + diagnóstico de retenção).
  resumo <roteiro.json> [--video v.mp4]  PDF de estudo do vídeo (com IA se houver chave; senão, direto do roteiro).
  proximo                                Próximo pilar/série/subtema do rodízio.
  subtemas [--pilar p] [--adicionar "título" --pilar p [--favorito]]   Lista/adiciona subtemas (★ = favorito).
  favoritar "<trecho do título>" | desfavoritar "<trecho>"
  publicado <roteiro.json>               Registra no histórico (o rodízio continua a partir dele).
  exemplos [--rapido]                    Renderiza roteiros/exemplos/*.json.

Variáveis: ANTHROPIC_API_KEY, MODELO_CLAUDE (padrão claude-opus-5-5),
           ELEVENLABS_API_KEY / ELEVENLABS_VOZ (narração), MARCA (padrão @conhecimentoexplicado), SEM_MUSICA=1
`;

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v && !v.startsWith('--')) { o[k] = v; i++; } else o[k] = true; } else o._.push(a);
  }
  return o;
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const ler = (arq) => JSON.parse(fs.readFileSync(arq, 'utf8'));
const qualidadeDe = (o) => (o.hd ? 'hd' : o.rapido ? 'rapido' : o.qualidade || 'padrao');

function temposPrevia(r) {
  let t = 0;
  return r.cenas.map((c, i) => { const m = t + c.duracao * 0.75; t += c.duracao; return { cena: c.id || String(i + 1), t: m }; });
}
async function previaQuadros(r) {
  const tp = temposPrevia(r);
  const { quadros } = await capturarQuadros(r, tp.map((x) => x.t), { marca: MARCA });
  return quadros.map((q, i) => ({ ...q, cena: tp[i].cena }));
}

async function main() {
  const o = args(process.argv.slice(2));
  const cmd = o._[0];
  if (!cmd || o.ajuda || o.help) return console.log(AJUDA);

  switch (cmd) {
    case 'validar': {
      const r = planejarTempos(ler(o._[1])); const e = validar(r);
      const { analisarRetencao } = await import('./roteiro.js');
      const ret = analisarRetencao(r);
      console.log(e.length ? 'Problemas:\n- ' + e.join('\n- ') : `OK — ${r.cenas.length} cenas, ${duracaoTotal(r).toFixed(1)} s.`);
      console.log(ret.length ? 'Retenção — sugestões:\n- ' + ret.join('\n- ') : 'Retenção: sem alertas.');
      process.exitCode = e.length ? 1 : 0; return;
    }
    case 'render': {
      const arq = o._[1]; if (!arq) throw new Error('Informe o roteiro .json');
      await produzirDireto(ler(arq), o.saida || path.join('saida', path.basename(arq, '.json') + '.mp4'), { semVoz: !!o['sem-voz'], qualidade: qualidadeDe(o), fps: o.fps ? +o.fps : 30 });
      return;
    }
    case 'exemplos': {
      const pasta = 'roteiros/exemplos';
      for (const f of fs.readdirSync(pasta).filter((x) => x.endsWith('.json')).sort())
        await produzirDireto(ler(path.join(pasta, f)), path.join('saida', f.replace('.json', '.mp4')), { semVoz: !!o['sem-voz'], qualidade: qualidadeDe(o) });
      return;
    }
    case 'previa': {
      const r = planejarTempos(ler(o._[1])); const pasta = o.saida || path.join('saida', 'previa-' + path.basename(o._[1], '.json'));
      fs.mkdirSync(pasta, { recursive: true });
      const qs = await previaQuadros(r);
      qs.forEach((q) => fs.writeFileSync(path.join(pasta, `cena-${q.cena}.jpg`), q.jpeg));
      console.log(`${qs.length} quadros salvos em ${pasta}`); return;
    }
    case 'verificar': {
      const { verificacoesAutomaticas } = await import('./revisor.js');
      const r = verificacoesAutomaticas(o._[1], planejarTempos(ler(o._[2])));
      console.log(JSON.stringify(r, null, 2)); process.exitCode = r.problemas.length ? 1 : 0; return;
    }
    case 'revisar': {
      const { criarRevisor } = await import('./revisor.js');
      const p = await criarRevisor().revisar(o._[1], planejarTempos(ler(o._[2])));
      console.log(JSON.stringify(p, null, 2)); return;
    }
    case 'produzir': {
      const { produzirERevisar } = await import('./estudio.js');
      const arq = o._[1]; if (!arq) throw new Error('Informe o roteiro .json');
      const res = await produzirERevisar(ler(arq), o.saida || path.join('saida', path.basename(arq, '.json') + '.mp4'), { qualidade: qualidadeDe(o), rodadas: +(o.revisoes || 2) });
      console.log(`\n${res.aprovado ? 'APROVADO' : 'NÃO APROVADO (veja o parecer)'} — ${res.saida}\nLegenda: ${res.post}`); return;
    }
    case 'criar': {
      const tema = o._.slice(1).join(' '); if (!tema) throw new Error('Informe o tema: node src/cli.js criar "Como funciona a inflação"');
      const { criarVideo } = await import('./estudio.js');
      const res = await criarVideo(tema, {
        formato: o.formato || 'curto', pilar: o.pilar, serie: o.serie, nivel: o.nivel, publico: o.publico, qualidade: qualidadeDe(o),
        subtema: tema, rodadasRoteiro: +(o.rodadas || 3), rodadasRevisao: +(o.revisoes || 2), previa: previaQuadros,
        salvarEm: (r) => { fs.mkdirSync('roteiros', { recursive: true }); const a = path.join('roteiros', slug(r.titulo || tema) + '.json'); fs.writeFileSync(a, JSON.stringify(r, null, 2)); return a; },
      });
      console.log(res.saida ? `\n${res.aprovado ? 'APROVADO' : 'NÃO APROVADO (veja o parecer)'} — vídeo: ${res.saida}\nLegenda: ${res.post}${res.pdf ? `\nPDF de estudo: ${res.pdf}` : ''}` : `\nRoteiro não aprovado; vídeo não produzido. Veja ${res.arquivoRoteiro.replace('.json', '.qualidade.json')}.`);
      return;
    }
    case 'pauta': {
      const { gerarPauta } = await import('./agentes.js');
      const itens = await gerarPauta({ dias: +(o.dias || 7), semIA: !!o.offline || !process.env.ANTHROPIC_API_KEY });
      fs.mkdirSync('roteiros', { recursive: true });
      let md = '# Pauta\n\n| Dia | Pilar | Série | Nível | Formato | Título | Gancho | Disciplinas | Ideia visual | Horário |\n|---|---|---|---|---|---|---|---|---|---|\n' + itens.map((i) => `| ${i.dia} | ${i.pilar} | ${i.serie} | ${i.nivel} | ${i.formato} | ${i.titulo} | ${i.gancho} | ${(i.disciplinas || []).join(' + ')}${i.favorito ? ' ★' : ''} | ${i.ideia_visual} | ${i.horario} |`).join('\n') + '\n';
      const livros = itens.filter((i) => i.livro);
      if (livros.length) { const { sugerirTemasLivro } = await import('./livro.js'); const sug = sugerirTemasLivro(livros.length); md += `\n## Livro do mês\n${livros.map((l, k) => `- Dia ${l.dia}: ${sug[k]?.tema || `livro sobre ${l.pilar}`} → node src/cli.js livro "<tema>" --pilar ${sug[k]?.pilar || l.pilar}`).join('\n')}\n`; }
      fs.writeFileSync('roteiros/pauta.md', md); fs.writeFileSync('roteiros/pauta.json', JSON.stringify(itens, null, 2));
      console.log(md); return;
    }
    case 'resumo': {
      const { gerarResumoPDF } = await import('./resumo.js');
      const arq = o._[1]; if (!arq) throw new Error('Informe o roteiro .json');
      await gerarResumoPDF(ler(arq), o.saida || path.join('saida', path.basename(arq, '.json') + '-resumo.pdf'), { video: o.video, semIA: !!o['sem-ia'] || !process.env.ANTHROPIC_API_KEY, modo: o.modo, nivel: o.nivel });
      return;
    }
    case 'resumir': {
      const { resumirMateriais } = await import('./resumo.js');
      const arqs = o._.slice(1); if (!arqs.length) throw new Error('Informe ao menos um arquivo (PDF, TXT, MD, DOCX).');
      await resumirMateriais(arqs, { modo: o.modo || 'estruturado', nivel: o.nivel || 'medio', foco: o.foco, saida: o.saida, ilustrarTopicos: !o['sem-ilustracoes'] });
      return;
    }
    case 'proximo': {
      const { proximo } = await import('./agenda.js'); const { escolherSubtema } = await import('./subtemas.js');
      const p = proximo(); const st = escolherSubtema(p.pilar);
      console.log(`Próximo: pilar ${p.pilar} · série ${p.serie} · nível ${p.nivel} · ${p.formato}\nSubtema: ${st ? `${st.favorito ? '★ ' : ''}${st.titulo}` : '(nenhum livre — adicione em subtemas.json)'}\n\nCriar: node src/cli.js criar "${st?.titulo || '<tema>'}" --pilar ${p.pilar} --serie ${p.serie} --nivel ${p.nivel} --formato ${p.formato}`);
      return;
    }
    case 'subtemas': {
      const m = await import('./subtemas.js');
      if (o.adicionar) { m.adicionarSubtema(o.adicionar, o.pilar, !!o.favorito); console.log('Adicionado.'); }
      console.log(m.listarSubtemas(o.pilar)); return;
    }
    case 'favoritar': case 'desfavoritar': {
      const { marcarFavorito } = await import('./subtemas.js');
      const r = marcarFavorito(o._.slice(1).join(' '), cmd === 'favoritar');
      console.log(r.length ? `${cmd === 'favoritar' ? '★ Favoritado' : 'Desfavoritado'}:\n- ${r.join('\n- ')}` : 'Nenhum subtema encontrado com esse trecho.'); return;
    }
    case 'publicado': {
      const { registrarPublicacao } = await import('./agenda.js');
      registrarPublicacao(ler(o._[1])); console.log('Registrado no histórico.'); return;
    }
    case 'livro': {
      const m = await import('./livro.js');
      if (o.sugerir) { for (const x of m.sugerirTemasLivro()) console.log(`- ${x.tema}  [${x.pilar}; ${x.motivo}]`); return; }
      if (o.coletanea) { await m.coletanea({ pilar: o.pilar, titulo: o.titulo, saida: o.saida }); return; }
      const tema = o._.slice(1).join(' '); if (!tema) throw new Error('Informe o tema do livro, ou use --sugerir / --coletanea.');
      await m.escreverLivro(tema, { capitulos: +(o.capitulos || 6), nivel: o.nivel || 'medio', publico: o.publico, pilar: o.pilar, saida: o.saida });
      return;
    }
    case 'aprender': {
      const { aprenderComMetricas } = await import('./agentes.js');
      if (!o._[1]) throw new Error('Informe o CSV de métricas (veja docs/metricas-exemplo.csv).');
      const r = await aprenderComMetricas(fs.readFileSync(o._[1], 'utf8'));
      console.log(r.texto + `\n\nSalvo em ${r.arquivo} — os próximos roteiros já usam essas lições.`); return;
    }
    default: console.log(AJUDA);
  }
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
