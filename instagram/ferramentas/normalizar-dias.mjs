#!/usr/bin/env node
// Padroniza os 365 dias de instagram/dias/ (pode rodar mais de uma vez):
//  - campos do calendário que faltavam (explicacao_em, tipo_pergunta);
//  - imagem_macete e texto alternativo onde faltavam;
//  - prompts das 730 imagens com a paleta do site (assets/css/base.css), a descrição
//    fixa de cada personagem e o mesmo fecho de composição e de proibições;
//  - espelhos usados na planilha (gancho_pt, alternativas, story_quiz, conceito_visual).
import { pathToFileURL } from 'node:url';
import { blocos, salvarBloco, calendario, semMarca, num3 } from './lib-dias.mjs';

export const ESTILO =
  'Colorful editorial cartoon illustration, clean vector-like shading, thick rounded navy outlines, Road to America brand palette of navy #0f2747, red #b0243a and white, with small green #1d8a4b and yellow #f1c232 accents, on a flat paper background in #f3f5f2.';
export const COMPOSICAO =
  'Vertical 4:5 composition: main character and key elements in the upper half, the lower third left as a smooth plain floor with no details, top corners kept clear.';
export const PROIBICOES = 'No text, no letters, no numbers, no logos, no watermark, no real people, no patients, no blood, no gore.';

// Descrição visual fixa (em inglês, para o prompt) de cada personagem.
export const PERSONAGENS = {
  'Macrô': 'a round pale-lilac macrophage blob with short stubby pseudopods, big friendly eyes, a red-and-white checkered napkin tied around the neck and a small blank ID badge on a lanyard',
  Mito: 'a tired orange bean-shaped mitochondrion with visible inner cristae, soft dark under-eye circles, a wrinkled white lab coat, a blank coffee cup in hand and a small blank ID badge',
  'Seu Néfron': 'a wine-red kidney-bean character with a navy necktie, reading glasses on the tip of his nose, a rubber stamp in one hand and a neat stack of blank paper forms',
  'Capitã Plaqueta': 'a cheerful yellow disc-shaped platelet character wearing a green reflective safety vest, a whistle and a navy cap, with small traffic cones beside her',
  'Tia Meia-Vida': 'a friendly hourglass-shaped pharmacist character with arms, red-framed glasses, a white apron with pens in the pocket and a gray hair bun; the sand inside her hourglass body is the medicine slowly draining away',
  'Viés': 'a small white bedsheet ghost with a zigzag hem, navy eyes and a magnifying glass, always half hidden behind a blank 2x2 table or chart',
};
export const APOIO = {
  garcom: 'a friendly cartoon churrascaria waiter drawn as a simple round-headed mascot (not a real person), white shirt, red vest and navy bow tie',
  onibus: 'the Road to America bus, a rounded navy cartoon bus with a green and yellow stripe along its side',
};
const NOMES = {
  Macro: 'Macrô', 'Macrô': 'Macrô', Mito: 'Mito', 'Seu Nefron': 'Seu Néfron', 'Seu Néfron': 'Seu Néfron', 'Capitã Plaqueta': 'Capitã Plaqueta',
  'Captain Platelet': 'Capitã Plaqueta', 'Tia Meia-Vida': 'Tia Meia-Vida', 'Aunt Half-Life': 'Tia Meia-Vida', Bias: 'Viés', 'Viés': 'Viés',
};
const RE_PERS = new RegExp(`Recurring characters?: (${Object.keys(NOMES).map((n) => n.replace(/[-]/g, '\\-')).join('|')}), (.*?)\\.(?=\\s+(Recurring|Scene:))`, 'gs');
const RE_COMPOSICAO = /(Vertical 4:5 composition|Composition for (a )?(4:5 vertical|vertical 4:5) (frame|format)|Composition for 4:5 vertical format)/;

export function padronizarPrompt(p) {
  let s = p.trim();
  // 1. estilo e paleta (primeira frase)
  const fim = s.indexOf('. ');
  if (!s.startsWith('Colorful editorial cartoon illustration') || fim < 0) throw new Error(`prompt fora do padrão: ${s.slice(0, 80)}`);
  s = ESTILO + s.slice(fim + 1);
  // 2. personagens fixos
  s = s.replace(RE_PERS, (_, nome, desc) => {
    const canon = PERSONAGENS[NOMES[nome]];
    const extra = /pharmacy counter/.test(desc) ? ', standing behind a small-town pharmacy counter' : '';
    return `Recurring character: ${nome}, ${canon}${extra}.`;
  });
  s = s.replace(/a friendly cartoon churrascaria waiter drawn as a simple round-headed mascot \(not a real person\), white shirt, red vest and navy bow tie/g, APOIO.garcom);
  s = s.replace(/the Road to America bus, a rounded navy cartoon bus with a green and yellow stripe along its side/g, APOIO.onibus);
  // 3. composição e proibições no fim
  const m = RE_COMPOSICAO.exec(s);
  if (!m) throw new Error(`prompt sem composição: ${s.slice(-120)}`);
  const cabeca = s.slice(0, m.index).trim();
  const cauda = s.slice(m.index);
  const humor = cauda
    .split(/(?<=\.)\s+/)
    .filter((f) => !RE_COMPOSICAO.test(f) && !/^No /.test(f))
    .map((f) => f.split(';')[0].trim().replace(/[.;,]*$/, '.'))
    .filter((f) => f.length > 1 && !/^(no |without )/i.test(f));
  return [cabeca, ...humor, COMPOSICAO, PROIBICOES].join(' ').replace(/\s+/g, ' ').trim();
}

export function normalizar() {
const cal = new Map(calendario().dias.map((d) => [d.dia, d]));
let mudancas = 0;
const conta = {};
const marca = (k) => { conta[k] = (conta[k] || 0) + 1; mudancas++; };

for (const b of blocos()) {
  for (const d of b.dias) {
    const c = cal.get(d.dia);
    for (const k of ['explicacao_em', 'tipo_pergunta']) if (d[k] === undefined && c[k] !== undefined) { d[k] = c[k]; marca(`calendário: ${k}`); }
    if (d.explicacao_em === undefined) { d.explicacao_em = c.explicacao_em; marca('calendário: explicacao_em'); }
    // imagens do render
    if (!d.imagem_macete) {
      d.imagem_macete = { arquivo: `dia-${num3(d.dia)}-macete.png`, cena: d.imagem_explicacao.conceito_visual, foco: '50% 40%', alt: semMarca(d.explicacao.titulo || d.gancho) };
      marca('imagem_macete criada');
    }
    if (!d.imagem.alt) { d.imagem.alt = semMarca(d.gancho); marca('alt da imagem'); }
    if (!d.imagem_macete.alt) { d.imagem_macete.alt = semMarca(d.explicacao.titulo || d.gancho); marca('alt do macete'); }
    d.imagem.arquivo = `dia-${num3(d.dia)}.png`;
    d.imagem_macete.arquivo = `dia-${num3(d.dia)}-macete.png`;
    // prompts
    for (const k of ['imagem_questao', 'imagem_explicacao']) {
      const novo = padronizarPrompt(d[k].prompt_nano_banana_pro);
      if (novo !== d[k].prompt_nano_banana_pro) { d[k].prompt_nano_banana_pro = novo; marca('prompt padronizado'); }
      d[k].parametros = { modelo: 'nano_banana_pro', resolucao: '2k', proporcao: '4:5' };
    }
    // espelhos
    const alts = Array.isArray(d.questao.alternativas)
      ? Object.fromEntries(d.questao.alternativas.map((a, i) => [a.letra || 'ABCD'[i], { texto: a.texto, ...(a.quiz ? { quiz: a.quiz } : {}), ...(a.dia != null ? { dia: a.dia } : {}) }]))
      : d.questao.alternativas;
    for (const [l, v] of Object.entries(alts)) if (typeof v === 'string') alts[l] = { texto: v };
    if (JSON.stringify(alts) !== JSON.stringify(d.questao.alternativas)) { d.questao.alternativas = alts; marca('alternativas em objeto'); }
    const espelho = {
      gancho_pt: semMarca(d.gancho),
      vinheta_en: semMarca(d.questao.vinheta),
      pergunta_en: semMarca(d.questao.pergunta),
      correta: d.questao.correta,
      alternativas: Object.entries(alts).map(([letra, v]) => ({ letra, texto: semMarca(v.texto) })),
    };
    for (const [k, v] of Object.entries(espelho)) if (JSON.stringify(d[k]) !== JSON.stringify(v)) { d[k] = v; marca(`espelho ${k}`); }
    const sq = { pergunta_curta_pt: d.quiz?.pergunta || d.story_quiz?.pergunta_curta_pt, opcoes: Object.values(alts).map((v) => semMarca(v.quiz || v.texto)), correta: d.questao.correta };
    if (JSON.stringify(sq) !== JSON.stringify(d.story_quiz)) { d.story_quiz = sq; marca('espelho story_quiz'); }
    if (!d.quiz || d.quiz.pergunta !== sq.pergunta_curta_pt) { d.quiz = { ...(d.quiz || {}), pergunta: sq.pergunta_curta_pt }; marca('quiz.pergunta'); }
    if (d.imagem_questao.conceito_visual !== d.imagem.cena) { d.imagem_questao.conceito_visual = d.imagem.cena; marca('espelho conceito_visual'); }
    if (d.imagem_explicacao.conceito_visual !== d.imagem_macete.cena) { d.imagem_explicacao.conceito_visual = d.imagem_macete.cena; marca('espelho conceito_visual'); }
    d.explicacao_pt.por_que_erradas = Object.fromEntries(Object.entries(d.explicacao.erradas).map(([k, v]) => [k, semMarca(v)]));
  }
  salvarBloco(b);
}
console.log(`${mudancas} mudanças`);
for (const [k, v] of Object.entries(conta)) console.log(`  ${k}: ${v}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) normalizar();
