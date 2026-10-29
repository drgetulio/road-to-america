// Legenda do post (questão de hoje + gabarito de ontem) e roteiro dos stories.
import { num3, dataCurta, dataLonga } from './dados.mjs';
import { semMarca } from './slides.mjs';

export function urlComUtm(base, config, n, meio) {
  const u = new URL(base);
  const p = new URLSearchParams({ ...config.utm, utm_medium: meio, utm_content: `dia_${num3(n)}` });
  // a âncora (#pre-inscricao) fica no fim
  const hash = u.hash;
  u.hash = '';
  return `${u.toString()}${u.search ? '&' : '?'}${p.toString()}${hash}`;
}

// CTA padrão do PROGRAMA.md, seção 9; o JSON pode trocar com "cta".
export function ctaDoDia(dia) {
  if (dia.cta) return dia.cta;
  const d = dia.dia_semana;
  const diaDoMes = Number((dia.data || '').slice(8, 10));
  if (d === 'domingo') return 'pre_inscricao';
  if (d === 'terça-feira' || d === 'quinta-feira') return 'simulado';
  if (d === 'quarta-feira' && diaDoMes <= 7) return 'verificador';
  return 'salvar';
}

const FRASES_CTA = {
  simulado: 'Gostou do formato? Faça um bloco inteiro de 30 minutos, grátis. O link está na bio.',
  pre_inscricao: 'Quer estudar com método e acompanhamento? A pré-inscrição está aberta. O link está na bio.',
  verificador: 'Sua escola está habilitada para o USMLE? Confira em 1 minuto. O link está na bio.',
  salvar: 'Salve para revisar no Remix de domingo e mande para quem vai fazer o Step com você.',
};

function hashtagDaArea(area) {
  const limpo = semMarca(area).replace(/\(.*?\)/g, '').trim();
  if (!limpo) return null;
  const sem = limpo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ');
  const tag = sem.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
  return tag.length > 2 && tag.length <= 30 ? `#${tag}` : null;
}

// Bloco do gabarito de ontem (publicado em D+1). É o único lugar da legenda em que
// entram a letra certa e os termos da resposta (explicacao.termos).
export function blocoGabarito(ontem) {
  const c = ontem.questao.correta;
  const alt = ontem.questao.alternativas.find((a) => a.letra === c);
  const linhas = [`Gabarito de ontem (dia ${num3(ontem.n)}): letra ${c}, ${alt ? semMarca(alt.texto) : ''}. Arraste até o fim para ver o porquê e o macete.`];
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

// Parte da legenda que apresenta a questão do dia D (sem nada da resposta).
export function legendaQuestao(dia, config) {
  const L = dia.legenda;
  const linhas = [semMarca(L.gancho || dia.gancho)];
  if (L.contexto) linhas.push('', semMarca(L.contexto));
  linhas.push('', 'Comente A, B, C ou D. O gabarito sai amanhã às 12h, junto com a próxima.');
  const termos = palavrasChaveDaQuestao(dia);
  if (termos.length) linhas.push('', `Palavras-chave: ${termos.join(', ')}`);
  return linhas.join('\n');
}

// Legenda só da questão do dia D (sem o gabarito de ontem), para revisão e planilha.
export function legendaSoQuestao(dia, config) {
  const L = dia.legenda;
  const linhas = [legendaQuestao(dia, config)];
  linhas.push('', semMarca(L.cta_texto || FRASES_CTA[ctaDoDia(dia)] || FRASES_CTA.salvar));
  if (dia.cvv) linhas.push('', 'Se você está passando por um momento difícil, fale com o CVV: ligue 188, 24 horas, gratuito, ou acesse cvv.org.br.');
  linhas.push('', ...assinaturaEAviso(config));
  linhas.push('', hashtags(dia, config));
  return linhas.join('\n') + '\n';
}

// Legenda completa do post do dia D: questão de hoje + gabarito de ontem (D+1 de ontem).
export function legenda(dia, ontem, config) {
  const L = dia.legenda;
  const linhas = [legendaQuestao(dia, config)];
  if (ontem) linhas.push('', blocoGabarito(ontem));
  const cta = ctaDoDia(dia);
  linhas.push('', semMarca(L.cta_texto || FRASES_CTA[cta] || FRASES_CTA.salvar));
  if (dia.cvv) linhas.push('', 'Se você está passando por um momento difícil, fale com o CVV: ligue 188, 24 horas, gratuito, ou acesse cvv.org.br.');
  linhas.push('', ...assinaturaEAviso(config));
  linhas.push('', hashtags(dia, config));
  return linhas.join('\n') + '\n';
}

export function roteiroStories(dia, config) {
  const q = dia.questao;
  const c = q.correta;
  const quiz = q.alternativas.map((a) => `  ${a.letra}) ${a.quiz || a.texto}${a.letra === c ? '   <- marcar como certa' : ''}`).join('\n');
  const linkSim = urlComUtm(config.links.simulado, config, dia.n, 'story');
  const linkPost = '(link do post do dia, copiado depois de publicar)';
  const domingo = dia.dia_semana === 'domingo';
  const blocos = [
    `STORIES DO DIA ${num3(dia.n)} (${dia.dia_semana}, ${dataLonga(dia.data)})`,
    '',
    `12h05  story-quiz.png + adesivo de QUIZ`,
    `  Pergunta do adesivo: ${dia.quiz.pergunta || 'Qual é a sua letra?'}`,
    quiz,
    '  Posicione o adesivo na área vazia (veja story-quiz-guia.png).',
    '',
    '12h06  Enquete "Você sabia ou chutou?" (opções: "Sabia" e "Chutei")',
    '',
    `20h30  Resultado parcial sem revelar a letra certa (ex.: "62% marcaram a mesma letra. Será que acertaram?") + adesivo de link para o post: ${linkPost}`,
    '',
    `${dia.explicacao_em ? dataCurta(dia.explicacao_em) : 'D+1'} 11h50  "Gabarito em 10 minutos" com a imagem do macete desfocada`,
  ];
  if (domingo) blocos.push('', `18h00  Placar da semana: as três questões com menor acerto + adesivo de link do simulado: ${linkSim}`);
  if (dia.cvv) blocos.push('', 'Em todos os stories de hoje: CVV 188 visível (a faixa amarela já sai no PNG).');
  blocos.push('', 'Links com UTM deste dia:',
    `  Simulado grátis: ${linkSim}`,
    `  Pré-inscrição:   ${urlComUtm(config.links.pre_inscricao, config, dia.n, 'story')}`,
    `  Verificador:     ${urlComUtm(config.links.verificador, config, dia.n, 'story')}`,
    `  Link da bio (feed): ${urlComUtm(config.links.simulado, config, dia.n, 'bio')}`);
  return blocos.join('\n') + '\n';
}
