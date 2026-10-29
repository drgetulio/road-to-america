#!/usr/bin/env node
// Padroniza os 365 dias de instagram/dias/ (pode rodar mais de uma vez):
//  - campos do calendário que faltavam (explicacao_em, tipo_pergunta);
//  - imagem_macete e texto alternativo onde faltavam;
//  - prompts das 730 imagens com a paleta do site (assets/css/base.css), a descrição
//    fixa de cada personagem e o mesmo fecho de composição e de proibições;
//  - espelhos usados na planilha (gancho_pt, alternativas, story_quiz, conceito_visual).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { blocos, salvarBloco, calendario, semMarca, num3, PASTA_INSTAGRAM } from './lib-dias.mjs';

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
  // anfitriões dos quadros (PROGRAMA.md, seção 3)
  termica: 'a red pump-top coffee thermos character with a navy cap, sleepy but sharp eyes, a small stethoscope around her neck and a blank clipboard',
  allen: 'a small silver L-shaped hex key character with big round eyes, a navy carpenter apron and a tiny red pencil tucked behind where an ear would be',
  bussola: 'a round brass pocket-compass character with a yellow case and navy rim, a red needle on her pale face, big friendly eyes, a small green scarf and a tiny blank notebook',
};
// Consistência do elenco (PROGRAMA.md, seção 3.1): cada personagem tem uma folha de referência
// (model sheet) gerada uma vez no Nano Banana Pro; o arquivo vai como imagem de referência
// (Higgsfield, medias com role "image_references") em todo prompt em que ele aparece.
export const ELENCO = {
  'Macrô': { slug: 'macro', desc: () => PERSONAGENS['Macrô'] },
  Mito: { slug: 'mito', desc: () => PERSONAGENS.Mito },
  'Seu Néfron': { slug: 'seu-nefron', desc: () => PERSONAGENS['Seu Néfron'] },
  'Capitã Plaqueta': { slug: 'capita-plaqueta', desc: () => PERSONAGENS['Capitã Plaqueta'] },
  'Tia Meia-Vida': { slug: 'tia-meia-vida', desc: () => PERSONAGENS['Tia Meia-Vida'] },
  'Viés': { slug: 'vies', desc: () => PERSONAGENS['Viés'] },
  'Dona Térmica': { slug: 'dona-termica', desc: () => APOIO.termica },
  'Seu Allen': { slug: 'seu-allen', desc: () => APOIO.allen },
  'Garçom Espetinho': { slug: 'garcom-espetinho', desc: () => APOIO.garcom },
  'Dona Bússola': { slug: 'dona-bussola', desc: () => APOIO.bussola },
};
// cena enxuta (PROGRAMA.md, seção 3): até 3 elementos principais e fundo limpo
export const LIMPEZA = 'Clean, uncluttered background with no more than three main elements.';
export const PASTA_REFERENCIAS = 'instagram/imagens/referencias';
export const arquivoReferencia = (nome) => `${PASTA_REFERENCIAS}/${ELENCO[nome].slug}.png`;
const FRASE_REF = (nomes) => `Keep ${nomes.length > 1 ? 'these characters' : 'the character'} identical to the attached reference sheet${nomes.length > 1 ? 's' : ''} of ${nomes.join(' and ')}: same body shape, colors, outfit, proportions and outline thickness.`;
const RE_FRASE_REF = /\s*Keep (the character|these characters) identical to the attached reference sheets? of [^:]+: same body shape, colors, outfit, proportions and outline thickness\./g;
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// personagens do elenco que aparecem no prompt (cabeçalho fixo ou nome na cena)
export function elencoDoPrompt(p) {
  const fixos = [...String(p).matchAll(/Recurring characters?: ([^,]+),/g)].map((m) => NOMES[m[1]] || m[1]);
  const cena = /Scene:(.*?)(Vertical 4:5|$)/s.exec(p)?.[1] || '';
  const ALIAS = { ...NOMES, ...Object.fromEntries(Object.keys(ELENCO).map((n) => [n, n])) };
  const citados = Object.keys(ALIAS).filter((n) => new RegExp(`(^|[^\\p{L}])${escRe(n)}([^\\p{L}]|$)`, 'u').test(cena)).map((n) => ALIAS[n]);
  return [...new Set([...fixos, ...citados])].filter((n) => ELENCO[n]);
}
// garante o cabeçalho "Recurring character" de quem aparece na cena e a frase da folha de referência
// herdar: elenco da imagem da questão, para a imagem do macete (o "depois" da mesma cena)
export function comReferencia(p, herdar = []) {
  let s = p.replace(RE_FRASE_REF, '');
  let nomes = elencoDoPrompt(s);
  if (!nomes.length && herdar.length) nomes = [...herdar];
  const fixos = new Set([...s.matchAll(/Recurring characters?: ([^,]+),/g)].map((m) => NOMES[m[1]] || m[1]));
  const faltam = nomes.filter((n) => !fixos.has(n));
  if (faltam.length) {
    const i = s.indexOf(' Scene:');
    if (i > 0) s = `${s.slice(0, i)} ${faltam.map((n) => `Recurring character: ${n}, ${ELENCO[n].desc()}.`).join(' ')}${s.slice(i)}`;
  }
  s = s.replace(/Clean, uncluttered background with only a few elements\./g, LIMPEZA);
  if (!/Clean, uncluttered background/.test(s)) {
    const m = RE_COMPOSICAO.exec(s);
    if (m) s = `${s.slice(0, m.index).trim()} ${LIMPEZA} ${s.slice(m.index)}`;
  }
  if (nomes.length) {
    const m = RE_COMPOSICAO.exec(s);
    if (m) s = `${s.slice(0, m.index).trim()} ${FRASE_REF(nomes)} ${s.slice(m.index)}`;
  }
  return { prompt: s.replace(/\s+/g, ' ').trim(), nomes };
}

// Prompt da folha de referência (model sheet) de um personagem: gerar uma vez, conferir e reusar.
export function promptFolha(nome) {
  return `${ESTILO} Character model sheet of one recurring cartoon character: ${nome}, ${ELENCO[nome].desc()}. ` +
    'Show the same character on one sheet, evenly spaced on the flat paper background: a full-body front view, a full-body side profile view, a full-body three-quarter view, ' +
    'and a row of four head close-ups with different expressions (happy, surprised, tired, focused). Identical proportions, colors, outfit and outline thickness in every view, ' +
    'neutral standing pose in the three turnarounds, only the fixed props of the character. Wide 16:9 sheet. ' + PROIBICOES;
}

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
    return `Recurring character: ${NOMES[nome]}, ${canon}${extra}.`;
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
    const ref = {};
    for (const k of ['imagem_questao', 'imagem_explicacao']) {
      const { prompt: novo, nomes } = comReferencia(padronizarPrompt(d[k].prompt_nano_banana_pro), k === 'imagem_explicacao' ? ref.questao : []);
      if (novo !== d[k].prompt_nano_banana_pro) { d[k].prompt_nano_banana_pro = novo; marca('prompt padronizado'); }
      d[k].parametros = { modelo: 'nano_banana_pro', resolucao: '2k', proporcao: '4:5' };
      ref[k === 'imagem_questao' ? 'questao' : 'macete'] = nomes;
    }
    const todos = [...new Set([...ref.questao, ...ref.macete])];
    const pr = {
      questao: ref.questao,
      macete: ref.macete,
      arquivos: todos.map(arquivoReferencia),
      higgsfield: { model: 'nano_banana_pro', medias: todos.map((n) => ({ role: 'image_references', personagem: n, arquivo: arquivoReferencia(n), value: `media_id de ${n} em instagram/personagens-referencia.json` })) },
    };
    if (JSON.stringify(pr) !== JSON.stringify(d.personagem_referencia)) { d.personagem_referencia = pr; marca('personagem_referencia'); }
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
// cadastro das folhas de referência (mantém os media_id já preenchidos à mão)
const arqRef = path.join(PASTA_INSTAGRAM, 'personagens-referencia.json');
const antigo = fs.existsSync(arqRef) ? JSON.parse(fs.readFileSync(arqRef, 'utf8')) : { personagens: [] };
const mid = new Map((antigo.personagens || []).map((p) => [p.nome, p.media_id ?? null]));
const usos = {};
for (const b of blocos()) for (const d of b.dias) for (const n of d.personagem_referencia?.arquivos ? [...new Set([...(d.personagem_referencia.questao || []), ...(d.personagem_referencia.macete || [])])] : []) usos[n] = (usos[n] || 0) + 1;
const cadastro = {
  descricao: 'Folhas de referência (model sheets) do elenco fixo. Gere cada folha uma vez no Higgsfield (Nano Banana Pro, 2k, 16:9), confira contra a descrição fixa, salve no arquivo indicado e suba com media_upload; anote o media_id aqui. Em todo prompt do dia, passe em medias, com role "image_references", a folha de cada personagem listado em personagem_referencia do dia.',
  gerado_por: 'instagram/ferramentas/normalizar-dias.mjs (o media_id preenchido à mão é preservado)',
  modelo: 'nano_banana_pro',
  parametros_folha: { resolucao: '2k', proporcao: '16:9' },
  personagens: Object.keys(ELENCO).map((nome) => ({ nome, arquivo: arquivoReferencia(nome), media_id: mid.get(nome) ?? null, dias_com_o_personagem: usos[nome] || 0, descricao_fixa_en: ELENCO[nome].desc(), prompt_folha: promptFolha(nome) })),
};
fs.writeFileSync(arqRef, JSON.stringify(cadastro, null, 1) + '\n');
console.log(`${mudancas} mudanças`);
for (const [k, v] of Object.entries(conta)) console.log(`  ${k}: ${v}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) normalizar();
