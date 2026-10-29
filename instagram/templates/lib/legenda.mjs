// Legenda do post (gabarito de ontem primeiro + questão de hoje) e roteiro dos stories.
// Endereço escrito só no direct, no adesivo de link e na bio: a legenda leva a palavra-chave
// (instagram/conversao.json, lido por ./conversao.mjs).
import { num3, dataCurta, dataLonga } from './dados.mjs';
import { semMarca } from './slides.mjs';
import { ctaDoDia as ctaConversao, textoCta, linhaDesafio, desafioDoDia, proximaLive, ehDiaDeLive, dataFalada, conversao } from './conversao.mjs';

export function urlComUtm(base, config, n, meio) {
  const u = new URL(base);
  const p = new URLSearchParams({ ...config.utm, utm_medium: meio, utm_content: `dia_${num3(n)}` });
  // a âncora (#pre-inscricao) fica no fim
  const hash = u.hash;
  u.hash = '';
  return `${u.toString()}${u.search ? '&' : '?'}${p.toString()}${hash}`;
}

// CTA do dia: palavra-chave por quadro, desafio, live e verificador (conversao.json).
export function ctaDoDia(dia) {
  return ctaConversao({ ...dia, n: dia.n ?? dia.dia });
}

function hashtagDaArea(area) {
  const limpo = semMarca(area).replace(/\(.*?\)/g, '').trim();
  if (!limpo) return null;
  const sem = limpo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ');
  const tag = sem.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
  return tag.length > 2 && tag.length <= 30 ? `#${tag}` : null;
}

// Bloco do gabarito de ontem (publicado em D+1, nos primeiros slides do post). É o único lugar
// da legenda em que entram a letra certa e os termos da resposta (explicacao.termos).
export function blocoGabarito(ontem) {
  const c = ontem.questao.correta;
  const alt = ontem.questao.alternativas.find((a) => a.letra === c);
  const linhas = [`Gabarito de ontem (dia ${num3(ontem.n)}): letra ${c}, ${alt ? semMarca(alt.texto) : ''}. O porquê e o macete estão nos primeiros slides; a questão de hoje vem logo depois.`];
  const termos = (ontem.explicacao.termos || []).map(semMarca).filter(Boolean);
  if (termos.length) linhas.push(`Termos-chave da resposta: ${termos.join(', ')}`);
  return linhas.join('\n');
}

// Palavras-chave da questão de hoje: só legenda.palavras_chave, que são neutras
// (assunto, sinais e exames da vinheta). Os termos da resposta nunca entram aqui;
// eles ficam para o bloco do gabarito, no post do dia seguinte.
export function palavrasChaveDaQuestao(dia) {
  const lista = Array.isArray(dia.legenda.palavras_chave) ? dia.legenda.palavras_chave : [];
  return lista.map(semMarca).filter(Boolean);
}

function assinaturaEAviso(config) {
  const ass = config.assinatura;
  const assinatura = [ass.nome, ass.crm].filter(Boolean).join(', ');
  const espec = ass.rqe && ass.especialidade ? `${ass.especialidade}, RQE ${ass.rqe}` : null;
  return [assinatura + (espec ? `. ${espec}` : '') + '.', config.aviso];
}

function hashtags(dia, config) {
  const L = dia.legenda;
  const tags = [...config.hashtags_base];
  tags.splice(1, 0, /2/.test(dia.step) ? '#USMLEStep2CK' : '#USMLEStep1');
  const extra = L.hashtags || [hashtagDaArea(dia.area)].filter(Boolean);
  for (const t of extra) if (!tags.includes(t) && tags.length < 8) tags.push(t);
  return tags.join(' ');
}

export const LINHA_RESPONDA = 'Vote na enquete dos stories ou comente A, B, C ou D. O gabarito sai amanhã às 12h, no primeiro slide do post.';
const LINHA_CVV = 'Se você está passando por um momento difícil, fale com o CVV: ligue 188, 24 horas, gratuito, ou acesse cvv.org.br.';

// Parte da legenda que apresenta a questão do dia D (sem nada da resposta).
export function legendaQuestao(dia, config) {
  const L = dia.legenda;
  const linhas = [semMarca(L.gancho || dia.gancho)];
  if (L.contexto) linhas.push('', semMarca(L.contexto));
  linhas.push('', LINHA_RESPONDA);
  const termos = palavrasChaveDaQuestao(dia);
  if (termos.length) linhas.push('', `Palavras-chave: ${termos.join(', ')}`);
  return linhas.join('\n');
}

function fechamento(dia, config) {
  const linhas = ['', semMarca(textoCta(dia))];
  const des = ctaDoDia(dia) === 'desafio' ? null : linhaDesafio(dia);
  if (des) linhas.push('', des);
  if (dia.cvv) linhas.push('', LINHA_CVV);
  linhas.push('', ...assinaturaEAviso(config));
  linhas.push('', hashtags(dia, config));
  return linhas;
}

// Legenda só da questão do dia D (sem o gabarito de ontem), para revisão e planilha.
export function legendaSoQuestao(dia, config) {
  return [legendaQuestao(dia, config), ...fechamento(dia, config)].join('\n') + '\n';
}

// Legenda completa do post do dia D: a recompensa de quem voltou (gabarito de ontem) abre,
// e a questão de hoje vem em seguida, na mesma ordem dos slides.
export function legenda(dia, ontem, config) {
  if (!ontem) return legendaSoQuestao(dia, config);
  const L = dia.legenda;
  const gancho = semMarca(L.gancho || dia.gancho);
  const linhas = [`Ontem deu ${ontem.questao.correta}. A de hoje: ${gancho}`, '', blocoGabarito(ontem), '', `Questão de hoje (dia ${num3(dia.n)}).`];
  if (L.contexto) linhas.push(semMarca(L.contexto));
  linhas.push('', LINHA_RESPONDA);
  const termos = palavrasChaveDaQuestao(dia);
  if (termos.length) linhas.push('', `Palavras-chave: ${termos.join(', ')}`);
  linhas.push(...fechamento(dia, config));
  return linhas.join('\n') + '\n';
}

const opcoesCurtas = (d) => d.questao.alternativas.map((a) => `${a.letra}) ${a.quiz || a.texto}`);

// Roteiro dos stories do dia D. O dia D só tem ENQUETE (sem gabarito); o QUIZ com a letra
// certa é do D+1 e abre com o resultado da enquete de ontem (conversao.json, stories).
export function roteiroStories(dia, config, ontem = null) {
  const linkSim = urlComUtm(config.links.simulado, config, dia.n, 'story');
  const linkPost = '(link do post do dia, copiado depois de publicar)';
  const domingo = dia.dia_semana === 'domingo';
  const des = desafioDoDia(dia.data || '');
  const blocos = [`STORIES DO DIA ${num3(dia.n)} (${dia.dia_semana}, ${dataLonga(dia.data)})`, ''];
  if (ontem) {
    const c = ontem.questao.correta;
    blocos.push(
      `12h05  GABARITO DE ONTEM: story-gabarito.png da pasta dia-${num3(ontem.n)} + adesivo de QUIZ`,
      '  Antes de postar: escreva as porcentagens da enquete de ontem nas quatro barras (ou cole o print do resultado em cima do cartão).',
      `  Pergunta do quiz (segunda chance, já com o achado da vinheta): ${ontem.quiz.resumo || ontem.quiz.pergunta || 'Qual era a letra?'}`,
      ...ontem.questao.alternativas.map((a) => `    ${a.letra}) ${a.quiz || a.texto}${a.letra === c ? '   <- marcar como certa' : ''}`),
      '  Texto: "Errou ontem? Segunda chance. O porquê está no primeiro slide do post."',
      '',
    );
  } else {
    blocos.push('12h05  (dia 1: ainda não há gabarito de ontem)', '');
  }
  blocos.push(
    `12h06  QUESTÃO DE HOJE: story-enquete.png + adesivo de ENQUETE com 4 opções (A, B, C, D), sem resposta certa`,
    `  Pergunta da enquete: ${dia.quiz.pergunta || 'Qual é a sua letra?'}`,
    '  Opções do adesivo: A, B, C e D (o texto de cada uma já está no story):',
    ...opcoesCurtas(dia).map((t) => `    ${t}`),
    '  Posicione o adesivo na área vazia (veja story-enquete-guia.png).',
    '',
    '12h07  Controle deslizante "Quanta certeza você tem?" no mesmo fundo (modo completo)',
  );
  if (des && des.fase === 'em_andamento') blocos.push('', `12h08  story-desafio.png: ${conversao().desafio.nome}, dia ${des.dia_do_desafio} de 30${des.dia_do_desafio === 1 ? ' (desafio-cartela.png desta pasta vai no direct de quem comentar DESAFIO)' : ''}`);
  if (des && des.fase === 'inscricao') blocos.push('', `12h08  Aviso do ${conversao().desafio.nome}: começa em ${dataCurta(des.inicio)}; adesivo de contagem regressiva e "comente DESAFIO no post de hoje"`);
  blocos.push('', `20h30  Resultado parcial da enquete sem revelar a letra certa (ex.: "a turma está dividida entre duas letras") + adesivo de link para o post: ${linkPost} (modo completo)`);
  if (ehDiaDeLive(dia.data)) blocos.push('', `19h30  Lembrete: Live de Correção hoje às ${conversao().lives.horario}`, `${conversao().lives.horario}  Live de Correção (roteiro em conversao.json, lives)`);
  else {
    const prox = proximaLive(dia.data);
    if (prox && dia.dia_semana === 'sábado' && prox <= somar(dia.data, 7)) blocos.push('', `16h00  Caixa de perguntas: "Qual questão do mês você quer ver corrigida na live de ${dataFalada(prox)}?"`);
  }
  if (domingo) blocos.push('', `18h00  Placar da semana: as três questões com menor acerto${des && des.fase === 'em_andamento' ? ' + check-in do desafio (caixa de perguntas)' : ''} + adesivo de link do simulado: ${linkSim}`);
  if (dia.cvv) blocos.push('', 'Em todos os stories de hoje: CVV 188 visível (a faixa amarela já sai no PNG).');
  blocos.push('', 'Modo enxuto: só os stories das 12h05 e 12h06.');
  blocos.push('', 'Links com UTM deste dia (adesivo de link e bio):',
    `  Simulado grátis: ${linkSim}`,
    `  Pré-inscrição:   ${urlComUtm(config.links.pre_inscricao, config, dia.n, 'story')}`,
    `  Verificador:     ${urlComUtm(config.links.verificador, config, dia.n, 'story')}`,
    `  Link da bio (feed): ${urlComUtm(config.links.simulado, config, dia.n, 'bio')}`);
  return blocos.join('\n') + '\n';
}

function somar(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
