// Catálogo de elementos 3D, validação e planejamento de tempo dos roteiros.
// O catálogo é a "biblioteca visual" que os agentes conhecem: tudo que o motor sabe desenhar.

export const FORMATOS = {
  curto: { largura: 1080, altura: 1920, rapido: [540, 960], duracao: [25, 75], descricao: 'Reels/Shorts/TikTok, vertical 9:16, 30–75 s' },
  longo: { largura: 1920, altura: 1080, rapido: [960, 540], duracao: [120, 900], descricao: 'YouTube, horizontal 16:9, 2–15 min' },
};

export const PILARES = ['ia', 'economia', 'neurociencia', 'seguranca', 'escola', 'sistemas', 'enem', 'medicina_chinesa', 'interdisciplinar'];
export const SERIES = ['como_funciona', 'aprenda_60s', 'voce_sabia', 'entenda_o_mundo', 'conectando', 'entenda_o_sistema', 'enem_1min', 'questao_comentada', 'por_que_errada', 'redacao_1000', 'conexoes_enem', 'simulado_relampago'];
export const AREAS_ENEM = ['humanas', 'natureza', 'matematica', 'linguagens', 'redacao'];
export const NIVEIS = ['basico', 'intermediario', 'avancado'];
export const NOMES_SERIE = { como_funciona: 'Como funciona?', aprenda_60s: 'Aprenda em 60 segundos', voce_sabia: 'Você sabia?', entenda_o_mundo: 'Entenda o mundo', conectando: 'Conectando conhecimentos', entenda_o_sistema: 'Entenda o sistema', enem_1min: 'ENEM em 1 minuto', questao_comentada: 'Questão comentada', por_que_errada: 'Por que está errada?', redacao_1000: 'Redação nota 1000', conexoes_enem: 'Conexões ENEM', simulado_relampago: 'Simulado relâmpago' };
export const NOMES_NIVEL = { basico: 'Básico', intermediario: 'Intermediário', avancado: 'Avançado' };

export const ANIMACOES = ['surgir', 'crescer', 'cair', 'deslizar', 'aparecer', 'nenhuma'];

// Método de retenção do perfil: Curiosidade → Problema → Explicação → Demonstração → Descoberta → Reflexão
export const ETAPAS = ['gancho', 'curiosidade', 'explicacao', 'demonstracao', 'revelacao', 'fechamento'];
export const TECNICAS = ['curiosity_gap', 'open_loop', 'quebra_de_padrao', 'storytelling', 'progressao', 'surpresa', 'identificacao'];

export const METODO_RETENCAO = `MÉTODO DE RETENÇÃO (obrigatório) — o objetivo não é só ensinar: é a pessoa sentir que PRECISA ver o que vem a seguir, enquanto aprende algo relevante e verificável.
Fórmula: Curiosidade → Problema → Explicação → Demonstração → Descoberta → Reflexão. Cada vídeo responde UMA pergunta, explica UM mecanismo e entrega conhecimento verificável.
Estrutura (vídeo curto de ~45–60 s; no longo, repita o ciclo por capítulo, cada um abrindo o loop do próximo):
1. GANCHO (0–3 s, etapa "gancho"): pergunta ou afirmação surpreendente e verdadeira, no máximo ~8 palavras. Nada de "olá", "neste vídeo", apresentação ou contexto antes do gancho. Ex.: "Seu cérebro pode enganar você. E faz isso todos os dias."
2. CURIOSIDADE (3–10 s, "curiosidade"): situação do cotidiano com que a pessoa se identifica, ou o problema/fenômeno — e abra um loop ("e a resposta não é a que você imagina").
3. EXPLICAÇÃO (10–30 s, "explicacao" e "demonstracao"): mostre o mecanismo com a animação — comparações, esquemas, exemplo concreto. Cada cena acrescenta UMA informação nova (progressão).
4. REVELAÇÃO (30–45 s, "revelacao"): a informação mais importante; a causa e uma consequência — de preferência inesperada. Feche o loop aberto no início.
5. FECHAMENTO (45–60 s, "fechamento"): conclusão interessante, aplicação prática ou pergunta que provoque reflexão (e convide a comentar). Chamada para seguir só no fim, curta.
Técnicas (marque em cada cena o campo "tecnica"): curiosity_gap (pergunta com resposta adiada), open_loop (questão respondida mais adiante), quebra_de_padrao (novo enquadramento/objeto/movimento a cada 3–5 s), storytelling (história ou situação real), progressao (cada trecho soma algo novo), surpresa (descoberta ou consequência inesperada), identificacao (cotidiano do espectador).
Regra de ouro: não prolongue artificialmente. Cada segundo precisa acrescentar algo; corte frases de enchimento e repetições.`;

// tipo -> { desc, params } — usado para validar e para ensinar os agentes
export const CATALOGO = {
  // gerais
  rotulo: { desc: 'Etiqueta de texto presa a um ponto 3D', params: 'texto, subtexto, posicao[x,y,z]' },
  seta: { desc: 'Seta 3D (força, causa→efeito, direção)', params: 'de[x,y,z], para[x,y,z], cor, espessura' },
  fluxo: { desc: 'Partículas correndo de um ponto a outro (dados, dinheiro, calor, sinais)', params: 'de[x,y,z], para[x,y,z], cor, quantidade, velocidade, espalhamento, raio' },
  linha: { desc: 'Linha fina ligando dois pontos (conexões de um grafo)', params: 'de[x,y,z], para[x,y,z], cor' },
  cubo: { desc: 'Bloco genérico (dado, bloco de blockchain, peça)', params: 'posicao[x,y,z] (base), tamanho, cor' },
  esfera: { desc: 'Esfera genérica (átomo, nó, planeta, ideia)', params: 'posicao[x,y,z] (centro), raio, cor, brilho' },
  pessoa: { desc: 'Pessoa estilizada (escala humana)', params: 'x, z, altura, cor' },
  multidao: { desc: 'Grupo de pessoas (sociedade, mercado, usuários)', params: 'x, z, quantidade, raio, semente' },
  globo: { desc: 'Planeta Terra estilizado girando', params: 'posicao[x,y,z] (centro), raio' },
  terreno: { desc: 'Chão colorido', params: 'tamanho, cor' },
  // IA / tecnologia
  rede_neural: { desc: 'Rede neural com camadas de neurônios e sinais se propagando', params: 'camadas_neuronios[int...], posicao[x,y,z] (centro), espacamento, espacamento_vertical, raio, cor, cor_pulso, ciclo, rotacao, pulsos(bool)' },
  servidor: { desc: 'Rack de servidor com LEDs piscando (nuvem, data center)', params: 'x, z, altura, cor' },
  computador: { desc: 'Monitor de computador', params: 'x, z, rotacao, cor_tela' },
  // economia
  grafico_barras: { desc: 'Gráfico de barras 3D que cresce com valores e rótulos', params: 'valores[num...], rotulos[str...], posicao[x,y,z] (base), escala (m por unidade), cores[str...], prefixo, sufixo, casas, mostrar_valores(bool), rotacao, largura_barra' },
  grafico_linha: { desc: 'Gráfico de linha desenhado progressivamente', params: 'valores[num...], posicao[x,y,z] (canto inferior), largura, altura, cor, rotulo_final, subtexto, rotacao' },
  moedas: { desc: 'Pilhas de moedas caindo (dinheiro, juros, poupança)', params: 'x, z, quantidade, pilhas, raio, cor' },
  predio: { desc: 'Prédio com janelas (empresa, banco, cidade)', params: 'x, z, largura, profundidade, andares, cor' },
  cidade: { desc: 'Cidade inteira gerada (urbanismo, economia de escala)', params: 'linhas, colunas, quadra, rua, andares_max, semente, parques(0-1)' },
  // neurociência
  cerebro: { desc: 'Cérebro 3D com regiões brilhantes e rotuladas', params: 'posicao[x,y,z] (centro), escala, rotacao, cor, regioes[{nome, descricao, cor, posicao[x,y,z] relativa (±1), raio}]' },
  neuronio: { desc: 'Neurônio com dendritos, axônio e impulso elétrico viajando', params: 'de[x,y,z] (corpo), para[x,y,z] (terminal), cor, ciclo' },
  // segurança
  escudo: { desc: 'Escudo de proteção', params: 'posicao[x,y,z] (centro), escala, cor, rotacao' },
  cadeado: { desc: 'Cadeado (pode abrir após N segundos)', params: 'posicao[x,y,z] (centro), escala, cor, aberto(bool), abrir_em(s)' },
  // ENEM / provas
  questao: { desc: 'Questão de múltipla escolha na tela (enunciado + alternativas A–E) com contagem regressiva para o público responder e revelação da correta; pode mostrar por que cada distrator está errado', params: 'enunciado, alternativas["A) ...", ...], correta ("A"–"E"), origem (ex.: "ENEM 2019 (INEP)" ou "estilo ENEM"), contagem (s de pausa para responder; 0 = sem), revelar_em (s após aparecer), explicacoes{"B": "por que está errada", ...}' },
  // sistemas e pensamento sistêmico
  sistema: { desc: 'Diagrama vivo de um sistema: componentes ligados por fluxos e laços de feedback; "perturbar" um componente propaga o efeito pelas conexões (interdependência). Ideal para a série Entenda o sistema', params: 'componentes[{id, nome, descricao, posicao[x,y,z] relativa, cor, forma:"esfera"|"cubo"}], conexoes[{de, para, rotulo, tipo:"fluxo"|"feedback", cor}], posicao[x,y,z] (centro), intervalo (s entre componentes), perturbar{componente, em (s após aparecer), cor}' },
  yin_yang: { desc: 'Símbolo yin-yang em 3D girando (Medicina Tradicional Chinesa, filosofia chinesa, equilíbrio de opostos)', params: 'posicao[x,y,z] (centro), raio, velocidade' },
  // educação escolar / ciências
  molecula: { desc: 'Molécula de bolas e varetas (Química, Biologia)', params: 'atomos[{elemento: "H"|"O"|"C"|"N"|"Na"|"Cl"|..., posicao[x,y,z] relativa}], ligacoes[[i,j]...], posicao[x,y,z] (centro), escala, girar(bool)' },
  onda: { desc: 'Onda senoidal animada (som, luz, ondas, funções trigonométricas)', params: 'posicao[x,y,z] (início), comprimento_total, amplitude, comprimento_onda, velocidade, cor, rotacao' },
  celula: { desc: 'Célula em corte com núcleo e organelas (Biologia)', params: 'posicao[x,y,z] (centro), raio, cor, organelas(bool)' },
  linha_tempo: { desc: 'Linha do tempo com marcos que surgem em sequência (História, invenções)', params: 'eventos[{ano, texto}], posicao[x,y,z] (centro), comprimento, intervalo (s entre marcos), cor, rotacao' },
  equacao: { desc: 'Cartão grande com fórmula ou frase-chave preso a um ponto 3D (Matemática, Física, definições)', params: 'texto (ex.: "M = C · (1 + i)ⁿ"), subtexto, posicao[x,y,z]' },
  // construção / arquitetura
  estrutura: { desc: 'Esqueleto de prédio: pilares, vigas e lajes andar por andar', params: 'andares, vaos_x, vaos_z, vao, pe_direito, intervalo, fundacao(bool), x, z' },
  pilar: { desc: 'Pilar', params: 'x, z, altura, secao, base_y' },
  viga: { desc: 'Viga', params: 'de[x,z], para[x,z], y, altura, largura' },
  laje: { desc: 'Placa horizontal (laje, mesa, plataforma)', params: 'x, z, y, largura, profundidade, espessura, cor' },
  parede: { desc: 'Parede: material bloco (montada tijolo a tijolo), drywall, concreto ou vidro', params: 'de[x,z], para[x,z], altura, espessura, material, base_y' },
  camadas: { desc: 'Pilha de camadas que se separa (vista explodida) com rótulos — ótima para "do que X é feito"', params: 'camadas[{nome, espessura(m), cor}], orientacao(vertical|horizontal), largura, altura, posicao[x,y,z], rotacao, separacao' },
  telhado: { desc: 'Telhado de duas águas', params: 'x, z, y, largura, profundidade, altura' },
  sapata: { desc: 'Fundação rasa', params: 'x, z, largura, profundidade' },
  estaca: { desc: 'Fundação profunda', params: 'x, z, profundidade, diametro' },
  solo: { desc: 'Bloco de terra semitransparente', params: 'largura, profundidade, espessura, opacidade' },
  arvore: { desc: 'Árvore', params: 'x, z, altura' },
};

export function catalogoTexto() {
  return Object.entries(CATALOGO).map(([t, d]) => `- ${t}: ${d.desc}. Parâmetros: ${d.params}`).join('\n');
}

export const FORMATO_ROTEIRO = `{
  "titulo": "string",
  "pilar": "${PILARES.join('|')}",
  "serie": "${SERIES.join('|')}",
  "nivel": "${NIVEIS.join('|')}",
  "disciplinas": ["disciplinas conectadas, ex.: Economia", "Matemática", "História"],
  "enem": { "area": "humanas|natureza|matematica|linguagens|redacao", "competencia": "ex.: C5 / Competência de área 5", "habilidade": "ex.: H21", "origem_questao": "ENEM 2019, 1º dia, questão 12 (INEP) | estilo ENEM (autoral)" },
  "formato": "curto|longo",
  "publico": "string",
  "legenda_post": "texto da legenda do post (2–4 frases, com chamada para seguir/salvar)",
  "hashtags": ["#..."],
  "pergunta_central": "a pergunta que o vídeo responde",
  "loop_aberto": "a questão aberta no início que só é respondida na revelação",
  "fontes": ["referências confiáveis que sustentam os fatos citados"],
  "estilo": { "fundo": "#hex" },
  "cenas": [
    {
      "id": "c1",
      "etapa": "${ETAPAS.join('|')}",
      "tecnica": "${TECNICAS.join('|')}",
      "duracao": 6,
      "narracao": "texto falado; *palavras-chave* entre asteriscos ficam destacadas na legenda",
      "texto_tela": "título curto na tela (máx ~5 palavras) ou vazio",
      "camera": { "alvo": [x,y,z], "distancia": 14, "distancia_fim": 12, "elevacao": 25, "azimute": [20, 60] },
      "elementos": [ { "id": "unico", "tipo": "<tipo do catálogo>", "atraso": 0.5, "animacao": "${ANIMACOES.join('|')}", "...": "parâmetros do tipo" } ],
      "remover": ["ids de elementos de cenas anteriores que saem"],
      "destacar": ["ids que ficam em evidência (o resto esmaece)"],
      "explodir": [ { "id": "id de um elemento camadas", "fator": 1 } ]
    }
  ]
}`;

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const vet = (v, n) => Array.isArray(v) && v.length === n && v.every(num);

// Retorna lista de problemas (strings). Lista vazia = roteiro tecnicamente válido.
export function validar(r) {
  const erros = [];
  if (!r || typeof r !== 'object') return ['O roteiro não é um objeto JSON.'];
  if (!r.titulo) erros.push('Falta "titulo".');
  if (!FORMATOS[r.formato]) erros.push('"formato" deve ser "curto" ou "longo".');
  if (r.pilar && !PILARES.includes(r.pilar)) erros.push(`"pilar" deve ser um de: ${PILARES.join(', ')}.`);
  if (r.serie && !SERIES.includes(r.serie)) erros.push(`"serie" deve ser uma de: ${SERIES.join(', ')}.`);
  if (r.nivel && !NIVEIS.includes(r.nivel)) erros.push(`"nivel" deve ser um de: ${NIVEIS.join(', ')}.`);
  if (r.pilar === 'enem' && !(r.enem && AREAS_ENEM.includes(r.enem.area))) erros.push(`Vídeos do pilar ENEM exigem "enem.area" (${AREAS_ENEM.join(', ')}).`);
  if (r.disciplinas && !(Array.isArray(r.disciplinas) && r.disciplinas.every((d) => typeof d === 'string'))) erros.push('"disciplinas" deve ser lista de textos.');
  if (!Array.isArray(r.cenas) || !r.cenas.length) return [...erros, 'Falta a lista "cenas".'];
  const ids = new Set();
  r.cenas.forEach((c, i) => {
    const onde = `cena ${i + 1}${c.id ? ` (${c.id})` : ''}`;
    if (!c.narracao || typeof c.narracao !== 'string') erros.push(`${onde}: falta "narracao".`);
    if (c.etapa && !ETAPAS.includes(c.etapa)) erros.push(`${onde}: etapa "${c.etapa}" inválida (use ${ETAPAS.join(', ')}).`);
    if (c.texto_tela && c.texto_tela.split(/\s+/).length > 7) erros.push(`${onde}: "texto_tela" longo demais (máx 7 palavras).`);
    const k = c.camera || {};
    if (k.alvo && !vet(k.alvo, 3)) erros.push(`${onde}: camera.alvo deve ser [x,y,z].`);
    if (k.distancia != null && !(num(k.distancia) && k.distancia > 1 && k.distancia < 200)) erros.push(`${onde}: camera.distancia fora de 1–200.`);
    if (k.elevacao != null && !(num(k.elevacao) && k.elevacao >= -10 && k.elevacao <= 89)) erros.push(`${onde}: camera.elevacao fora de -10–89 graus.`);
    for (const e of c.elementos || []) {
      const q = `${onde}, elemento "${e.id ?? '?'}"`;
      if (!e.id) erros.push(`${q}: falta "id".`);
      else if (ids.has(e.id)) erros.push(`${q}: id repetido — use ids únicos no vídeo inteiro.`);
      ids.add(e.id);
      if (!CATALOGO[e.tipo]) { erros.push(`${q}: tipo "${e.tipo}" não existe. Use apenas: ${Object.keys(CATALOGO).join(', ')}.`); continue; }
      if (e.animacao && !ANIMACOES.includes(e.animacao)) erros.push(`${q}: animacao "${e.animacao}" inválida.`);
      for (const p of ['de', 'para']) if (e[p] != null && !(vet(e[p], 3) || vet(e[p], 2))) erros.push(`${q}: "${p}" deve ser [x,y,z] (ou [x,z] para paredes/vigas).`);
      if (e.posicao != null && !vet(e.posicao, 3)) erros.push(`${q}: "posicao" deve ser [x,y,z].`);
      if (['seta', 'fluxo', 'linha', 'neuronio'].includes(e.tipo) && !(vet(e.de, 3) && vet(e.para, 3))) erros.push(`${q}: ${e.tipo} exige "de" e "para" como [x,y,z].`);
      if (['viga', 'parede'].includes(e.tipo) && !(vet(e.de, 2) && vet(e.para, 2))) erros.push(`${q}: ${e.tipo} exige "de" e "para" como [x,z].`);
      if (e.tipo === 'grafico_barras' && !(Array.isArray(e.valores) && e.valores.length && e.valores.every(num))) erros.push(`${q}: grafico_barras exige "valores" numéricos.`);
      if (e.tipo === 'grafico_barras' && Array.isArray(e.valores)) {
        const alt = Math.max(...e.valores.map(Math.abs)) * (e.escala ?? 1);
        if (alt > 12) erros.push(`${q}: barra mais alta teria ${alt.toFixed(0)} m — ajuste "escala" para a maior barra ficar entre 2 e 6.`);
      }
      if (e.tipo === 'grafico_linha' && !(Array.isArray(e.valores) && e.valores.length >= 2 && e.valores.every(num))) erros.push(`${q}: grafico_linha exige ao menos 2 "valores".`);
      if (e.tipo === 'camadas' && !(Array.isArray(e.camadas) && e.camadas.length)) erros.push(`${q}: camadas exige a lista "camadas".`);
      if (e.tipo === 'rede_neural' && e.camadas_neuronios && !(Array.isArray(e.camadas_neuronios) && e.camadas_neuronios.every((n) => Number.isInteger(n) && n > 0 && n <= 12))) erros.push(`${q}: camadas_neuronios deve ser lista de inteiros 1–12.`);
      if (e.tipo === 'rotulo' && !e.texto) erros.push(`${q}: rotulo exige "texto".`);
      if (e.tipo === 'sistema') {
        const cs = Array.isArray(e.componentes) ? e.componentes : [];
        if (!cs.length || !cs.every((c) => c.id && vet(c.posicao, 3))) erros.push(`${q}: sistema exige "componentes" com id e posicao [x,y,z].`);
        const idsC = new Set(cs.map((c) => c.id));
        for (const k of e.conexoes || []) if (!idsC.has(k.de) || !idsC.has(k.para)) erros.push(`${q}: conexão ${k.de}→${k.para} usa componente inexistente.`);
        if (e.perturbar && !idsC.has(e.perturbar.componente)) erros.push(`${q}: perturbar.componente "${e.perturbar.componente}" não existe.`);
      }
      if (e.tipo === 'questao') {
        if (!e.enunciado || !Array.isArray(e.alternativas) || e.alternativas.length < 2) erros.push(`${q}: questao exige "enunciado" e "alternativas".`);
        if (!/^[A-E]$/.test(e.correta || '')) erros.push(`${q}: questao exige "correta" entre A e E.`);
        if (!e.origem) erros.push(`${q}: questao exige "origem" (ENEM ano + INEP, ou "estilo ENEM").`);
      }
      if (e.tipo === 'equacao' && !e.texto) erros.push(`${q}: equacao exige "texto".`);
      if (e.tipo === 'linha_tempo' && !(Array.isArray(e.eventos) && e.eventos.length)) erros.push(`${q}: linha_tempo exige "eventos".`);
      if (e.tipo === 'molecula' && !(Array.isArray(e.atomos) && e.atomos.length && e.atomos.every((a) => vet(a.posicao, 3)))) erros.push(`${q}: molecula exige "atomos" com posicao [x,y,z].`);
    }
    for (const id of [...(c.remover || []), ...(c.destacar || [])]) if (!ids.has(id)) erros.push(`${onde}: referencia "${id}", que ainda não existe.`);
    for (const x of [].concat(c.explodir || [])) if (x && x.id && !ids.has(x.id)) erros.push(`${onde}: explodir referencia "${x.id}", que ainda não existe.`);
  });
  return erros;
}

const palavras = (s) => (s || '').replace(/\*/g, '').split(/\s+/).filter(Boolean).length;
export const textoFalado = (s) => (s || '').replace(/\*/g, '');

// Define a duração final de cada cena (narração ~2,6 palavras/s ou o áudio real, se houver).
export function planejarTempos(r, duracoesAudio = []) {
  const cenas = r.cenas.map((c, i) => {
    const fala = palavras(c.narracao) / 2.6 + 0.7;
    const audio = duracoesAudio[i] ? duracoesAudio[i] + 0.35 : 0;
    return { ...c, duracao: +Math.max(c.duracao || 0, fala, audio, 2.5).toFixed(2) };
  });
  return { ...r, cenas };
}

export const duracaoTotal = (r) => r.cenas.reduce((s, c) => s + c.duracao, 0);

// Diagnóstico de retenção (não bloqueia a renderização; orienta Designer, Qualidade e Produtor).
export function analisarRetencao(r) {
  const alertas = [];
  const cenas = r.cenas || [];
  if (!cenas.length) return alertas;
  const g = cenas[0];
  const pal = (x) => palavras(x.narracao);
  if (g.etapa && g.etapa !== 'gancho') alertas.push('A primeira cena deveria ser o gancho.');
  if (pal(g) > 12) alertas.push(`Gancho com ${pal(g)} palavras (~${(pal(g) / 2.6).toFixed(1)} s) — deve caber em 3 s (≤ 8–10 palavras).`);
  if (/^(ol[áa]|oi|fala|neste v[íi]deo|hoje (eu )?vou|bem[- ]vindo)/i.test(textoFalado(g.narracao).trim())) alertas.push('O gancho começa com apresentação/saudação — comece direto pela pergunta ou surpresa.');
  const ultima = cenas[cenas.length - 1];
  if (ultima.etapa && ultima.etapa !== 'fechamento') alertas.push('A última cena deveria ser o fechamento (reflexão/aplicação).');
  const etapas = new Set(cenas.map((c) => c.etapa).filter(Boolean));
  for (const e of ['gancho', 'revelacao', 'fechamento']) if (etapas.size && !etapas.has(e)) alertas.push(`Falta a etapa "${e}".`);
  if (!r.loop_aberto) alertas.push('Defina "loop_aberto": a questão aberta no início e respondida na revelação.');
  const limite = r.formato === 'longo' ? 14 : 7;
  cenas.forEach((c, i) => {
    const d = Math.max(c.duracao || 0, pal(c) / 2.6 + 0.7);
    const k = c.camera || {};
    const camMove = (Array.isArray(k.azimute) && Math.abs(k.azimute[1] - k.azimute[0]) >= 15) || (k.distancia_fim != null && Math.abs(k.distancia_fim - (k.distancia ?? k.distancia_fim)) >= 1.5);
    const eventos = (c.elementos || []).length + (c.destacar || []).length + [].concat(c.explodir || []).length + (camMove ? 1 : 0);
    const limiteCena = limite * (1 + Math.min(eventos, 3) * 0.25); // cada mudança na tela renova a atenção
    if (d > limiteCena) alertas.push(`Cena ${c.id || i + 1} dura ~${d.toFixed(1)} s com poucas mudanças na tela — divida em duas ou acrescente movimento/elemento (limite ${limiteCena.toFixed(1)} s).`);
    if (i > 0) {
      const a = JSON.stringify(cenas[i - 1].camera || {}), b = JSON.stringify(c.camera || {});
      if (a === b && !(c.elementos || []).length) alertas.push(`Cena ${c.id || i + 1} repete a câmera da anterior e não traz elemento novo — falta progressão visual.`);
    }
  });
  const total = cenas.reduce((s, c) => s + Math.max(c.duracao || 0, pal(c) / 2.6 + 0.7), 0);
  if (r.formato === 'curto' && total > 75) alertas.push(`Vídeo curto com ~${total.toFixed(0)} s — enxugue para 45–60 s.`);
  const tecnicas = new Set(cenas.map((c) => c.tecnica).filter(Boolean));
  if (cenas.some((c) => c.tecnica) && tecnicas.size < 3) alertas.push('Use ao menos 3 técnicas de retenção diferentes ao longo do vídeo.');
  return alertas;
}
