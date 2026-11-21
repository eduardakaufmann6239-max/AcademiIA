// Estúdio: coordena os cinco agentes de ponta a ponta.
//
//  PRÉ-PRODUÇÃO                         PRODUÇÃO                     PÓS-PRODUÇÃO
//  Roteirista → Designer → Qualidade ─► Produtor de Vídeo ─► MP4 ─► Revisor do Vídeo Final ─► Resumidor (PDF)
//       ▲          ▲           │              ▲                              │
//       └──────────┴─ correções┘              └──────── correções ───────────┘
import fs from 'node:fs';
import { produzirRoteiro } from './agentes.js';
import { criarProdutor } from './produtor.js';
import { criarRevisor } from './revisor.js';
import { gerarResumoPDF } from './resumo.js';
import { registrarPublicacao } from './agenda.js';

const lista = (ps) => ps.map((p) => `- [${p.gravidade}] ${p.tempo}: ${p.descricao}\n  Correção: ${p.correcao}`).join('\n');

// Produtor faz o vídeo; Revisor confere o MP4; se reprovar, o Produtor corrige (até `rodadas` vezes).
export async function produzirERevisar(roteiro, saida, { rodadas = 2, qualidade = 'padrao', log = console.log } = {}) {
  log('PRODUÇÃO — Produtor de Vídeo');
  const produtor = criarProdutor(roteiro, saida, { log });
  const revisor = criarRevisor({ log });
  let entrega = await produtor.produzir(`Produza este vídeo em qualidade "${qualidade}". Saída final: ${saida}.\nRoteiro:\n${JSON.stringify(roteiro, null, 1)}`);
  const pareceres = [];
  for (let r = 1; ; r++) {
    log(`PÓS-PRODUÇÃO — Revisor do Vídeo Final (rodada ${r})`);
    const parecer = await revisor.revisar(entrega.saida, produtor.roteiroAtual(), { qualidade });
    pareceres.push(parecer);
    log(`   Nota ${parecer.nota}/10 — ${parecer.aprovado ? 'APROVADO' : 'reprovado'}: ${parecer.resumo}`);
    if (parecer.aprovado || r > rodadas) {
      fs.writeFileSync(saida.replace(/\.mp4$/, '') + '-revisao.json', JSON.stringify(pareceres, null, 2));
      let pdf = null;
      if (parecer.aprovado) {
        log('MATERIAL DE ESTUDO — Agente Resumidor');
        pdf = await gerarResumoPDF(produtor.roteiroAtual(), saida.replace(/\.mp4$/, '') + '-resumo.pdf', { video: entrega.saida, log });
        registrarPublicacao(produtor.roteiroAtual(), { video: entrega.saida, pdf, subtema: roteiro.subtema });
      }
      return { ...entrega, aprovado: parecer.aprovado, pareceres, pdf };
    }
    entrega = await produtor.produzir(`O Revisor do Vídeo Final reprovou a entrega (nota ${parecer.nota}/10). Problemas:\n${lista(parecer.problemas)}\n\nCorrija com ajustes de produção, renderize de novo na qualidade "${qualidade}", confira e entregue.`);
  }
}

// Pipeline completo a partir de um tema.
export async function criarVideo(tema, { formato = 'curto', pilar, serie, nivel, publico, subtema, rodadasRoteiro = 3, rodadasRevisao = 2, qualidade = 'padrao', previa, salvarEm, log = console.log } = {}) {
  log('PRÉ-PRODUÇÃO — Roteirista, Designer e Qualidade');
  const pre = await produzirRoteiro(tema, { formato, pilar, serie, nivel, publico, rodadas: rodadasRoteiro, previa, log });
  const arq = salvarEm(pre.roteiro);
  fs.writeFileSync(arq.replace(/\.json$/, '.qualidade.json'), JSON.stringify(pre.pareceres, null, 2));
  log(`Roteiro salvo em ${arq}${pre.aprovado ? ' (aprovado)' : ' (ATENÇÃO: não aprovado no limite de rodadas)'}.`);
  if (!pre.aprovado) return { roteiro: pre.roteiro, arquivoRoteiro: arq, aprovado: false };
  const saida = arq.replace(/^roteiros\//, 'saida/').replace(/\.json$/, '.mp4');
  const pos = await produzirERevisar({ ...pre.roteiro, subtema }, saida, { rodadas: rodadasRevisao, qualidade, log });
  return { ...pos, arquivoRoteiro: arq };
}
