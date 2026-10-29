#!/usr/bin/env node
// Equilibra a letra certa (cerca de 25% para cada letra no ano e em cada mês)
// trocando de lugar a alternativa certa com uma errada. Só mexe em dias em que a
// ordem das alternativas não importa (não numéricas) e cujo texto não cita letras.
//
//   node instagram/ferramentas/rebalancear-letras.mjs           # mostra o plano
//   node instagram/ferramentas/rebalancear-letras.mjs --aplicar
import { blocos, salvarBloco, num3 } from './lib-dias.mjs';

const APLICAR = process.argv.includes('--aplicar');
const L = ['A', 'B', 'C', 'D'];
const BS = blocos();
const DIAS = BS.flatMap((b) => b.dias).sort((a, b) => a.dia - b.dia);

const REF_LETRA = [
  /\b(letra|letras|alternativa|alternativas|op[cç][aã]o|op[cç][oõ]es|option|options|answer|choice|gabarito)\s+[ABCD]\b/i,
  /\(([ABCD])\)/,
  /\b[ABCD]\s*,\s*[ABCD]\b/,
  /\b[ABCD]\s+e\s+[ABCD]\b/,
  /\b[ABCD]\s+(é|são|era|seria|fica|trata|descreve|seria)\b/,
  /\b[ABCD]\)\s/,
  /\b[ABCD]:\s/,
];
function textoSemLetra(d) {
  const partes = [d.gancho, d.gancho_apoio, d.legenda?.contexto, d.legenda?.cta_texto, d.legenda?.cta_slide, d.quiz?.pergunta,
    ...(d.explicacao?.certa || []), ...Object.values(d.explicacao?.erradas || {}), d.explicacao?.macete?.frase, d.explicacao?.macete?.apoio,
    d.explicacao?.macete?.fala, d.explicacao?.titulo, d.explicacao_pt?.por_que_certa, d.explicacao_pt?.macete, d.explicacao_pt?.pegadinha_de_prova,
    ...Object.values(d.explicacao_pt?.por_que_erradas || {}), d.imagem?.cena, d.imagem_macete?.cena, d.imagem_questao?.prompt_nano_banana_pro,
    d.imagem_explicacao?.prompt_nano_banana_pro, d.legenda_questao_pt,
    (d.legenda_explicacao_pt || '').replace(/letra [ABCD]\b/, '')];
  return partes.filter(Boolean).join('\n').replace(/\(?A, B, C ou D\)?/g, '');
}
const numerica = (t) => /^\s*[<>≥≤~]?\s*\d/.test(t);
function trocavel(d) {
  const alts = Object.values(d.questao.alternativas).map((a) => a.texto);
  if (alts.filter(numerica).length >= 3) return false;
  const t = textoSemLetra(d);
  if (REF_LETRA.some((r) => r.test(t))) return false;
  return true;
}

function trocar(d, de, para) {
  const q = d.questao;
  const a = q.alternativas;
  [a[de], a[para]] = [a[para], a[de]];
  q.alternativas = Object.fromEntries(L.map((l) => [l, a[l]]));
  const err = d.explicacao.erradas;
  err[de] = err[para];
  delete err[para];
  d.explicacao.erradas = Object.fromEntries(L.filter((l) => err[l]).map((l) => [l, err[l]]));
  const ep = d.explicacao_pt.por_que_erradas;
  ep[de] = ep[para];
  delete ep[para];
  d.explicacao_pt.por_que_erradas = Object.fromEntries(L.filter((l) => ep[l]).map((l) => [l, ep[l]]));
  q.correta = para;
  d.correta = para;
  d.alternativas = L.map((l) => ({ letra: l, texto: q.alternativas[l].texto.replace(/\*([^*\n]+)\*/g, '$1') }));
  d.story_quiz.opcoes = L.map((l) => (q.alternativas[l].quiz || q.alternativas[l].texto).replace(/\*([^*\n]+)\*/g, '$1'));
  d.story_quiz.correta = para;
  if (d.legenda_explicacao_pt) d.legenda_explicacao_pt = d.legenda_explicacao_pt.replace(new RegExp(`letra ${de}\\b`), `letra ${para}`);
  d.revisao = { ...(d.revisao || {}), letras: `Letras reordenadas em 29/10/2026 para equilibrar o gabarito do ano: a certa passou de ${de} para ${para}, trocando de lugar com a antiga ${para}. Conteúdo sem mudança.` };
}

// troca manual: --trocar 178:B,160:A (dia:letra nova)
const manual = process.argv.includes('--trocar') ? process.argv[process.argv.indexOf('--trocar') + 1] : null;
if (manual) {
  for (const par of manual.split(',')) {
    const [n, para] = par.split(':');
    const d = DIAS.find((x) => x.dia === Number(n));
    if (!trocavel(d)) throw new Error(`dia ${n} não pode trocar de letra (ordem numérica ou texto cita letras)`);
    console.log(`dia ${num3(d.dia)}: ${d.questao.correta} -> ${para}`);
    trocar(d, d.questao.correta, para);
  }
  if (APLICAR) for (const b of BS) salvarBloco(b);
  process.exit(0);
}

// alvo por mês: partes iguais; as sobras vão para as letras com menos sobra no ano
const meses = new Map();
for (const d of DIAS) {
  const k = d.data.slice(0, 7);
  if (!meses.has(k)) meses.set(k, []);
  meses.get(k).push(d);
}
const sobraAno = { A: 0, B: 0, C: 0, D: 0 };
const plano = [];
for (const [mes, lista] of meses) {
  const n = lista.length;
  const conta = Object.fromEntries(L.map((l) => [l, lista.filter((d) => d.questao.correta === l).length]));
  if (n < 4) { for (const l of L) sobraAno[l] += conta[l]; continue; }
  const base = Math.floor(n / 4);
  const alvo = Object.fromEntries(L.map((l) => [l, base]));
  // sobras: preferir letras que já estão acima no mês (menos trocas) e com menos sobra no ano
  const ordem = [...L].sort((x, y) => sobraAno[x] - sobraAno[y] || conta[y] - conta[x]);
  for (let i = 0; i < n % 4; i++) alvo[ordem[i]]++;
  for (const l of L) sobraAno[l] += alvo[l] - base;
  const usados = new Set();
  for (;;) {
    const acima = L.filter((l) => conta[l] > alvo[l]).sort((x, y) => conta[y] - alvo[y] - (conta[x] - alvo[x]));
    const abaixo = L.filter((l) => conta[l] < alvo[l]).sort((x, y) => conta[x] - alvo[x] - (conta[y] - alvo[y]));
    if (!acima.length || !abaixo.length) break;
    const de = acima[0];
    const para = abaixo[0];
    // candidato: trocável, ainda não mexido, e que não crie quatro iguais seguidos
    const cand = lista.filter((d) => d.questao.correta === de && !usados.has(d.dia) && trocavel(d));
    const semSeq = cand.filter((d) => {
      const i = DIAS.indexOf(d);
      const viz = [DIAS[i - 2], DIAS[i - 1], DIAS[i + 1], DIAS[i + 2]].map((x) => x && x.questao.correta);
      return !(viz[1] === para && (viz[0] === para || viz[2] === para)) && !(viz[2] === para && viz[3] === para);
    });
    const d = (semSeq.length ? semSeq : cand)[Math.floor((semSeq.length ? semSeq : cand).length / 2)];
    if (!d) { console.warn(`${mes}: sem dia trocável com a letra ${de}`); break; }
    usados.add(d.dia);
    plano.push({ dia: d.dia, mes, de, para });
    trocar(d, de, para);
    conta[de]--;
    conta[para]++;
  }
}
const total = Object.fromEntries(L.map((l) => [l, DIAS.filter((d) => d.questao.correta === l).length]));
console.log(`${plano.length} trocas`);
for (const p of plano) console.log(`  dia ${num3(p.dia)} (${p.mes}): ${p.de} -> ${p.para}`);
console.log('ano depois:', total);
if (APLICAR) {
  for (const b of BS) salvarBloco(b);
  console.log('gravado em instagram/dias/');
}
