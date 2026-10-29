#!/usr/bin/env node
// Validação do ano inteiro da Questão de Embarque (365 dias escritos em instagram/dias/).
//
//   node instagram/ferramentas/validar-dias.mjs            # tudo, inclusive render.mjs --so-conferir
//   node instagram/ferramentas/validar-dias.mjs --sem-render
//   node instagram/ferramentas/validar-dias.mjs --json saida.json
//
// Erros (x) fazem o script sair com código 1. Avisos (!) pedem leitura humana.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { todosOsDias, blocos, calendario, exportarQuestoes, semMarca, num3, PASTA_INSTAGRAM, RAIZ } from './lib-dias.mjs';
import os from 'node:os';
import { tomDoDia, montarDia } from '../templates/lib/dados.mjs';
import { legenda } from '../templates/lib/legenda.mjs';
import { conversao, pacoteNaData, diasDoPacote, remixQueRevisa, ctaDoDia as ctaDoDiaConv } from '../templates/lib/conversao.mjs';

const args = process.argv.slice(2);
const SEM_RENDER = args.includes('--sem-render');
const SAIDA_JSON = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

const erros = [];
const avisos = [];
const secoes = {};
const erro = (sec, t) => { erros.push(`[${sec}] ${t}`); (secoes[sec] ||= { erros: 0, avisos: 0 }).erros++; };
const aviso = (sec, t) => { avisos.push(`[${sec}] ${t}`); (secoes[sec] ||= { erros: 0, avisos: 0 }).avisos++; };
const ok = (sec) => (secoes[sec] ||= { erros: 0, avisos: 0 });

const cal = calendario();
const CAL = new Map(cal.dias.map((d) => [d.dia, d]));
const DIAS = todosOsDias();
const config = JSON.parse(fs.readFileSync(path.join(PASTA_INSTAGRAM, 'templates', 'config.json'), 'utf8'));
const rot = (d) => `dia ${num3(d.dia)}`;

const alternativasDe = (d) => (Array.isArray(d.questao.alternativas)
  ? d.questao.alternativas.map((v, i) => [typeof v === 'string' ? 'ABCD'[i] : v.letra || 'ABCD'[i], v])
  : Object.entries(d.questao.alternativas)).map(([letra, v]) => ({
  letra,
  texto: typeof v === 'string' ? v : v.texto,
  quiz: semMarca(typeof v === 'string' ? v : v.quiz || v.texto),
  dia: typeof v === 'string' ? null : v.dia ?? null,
}));

// ---------------------------------------------------------------- 1. presença e calendário
{
  const S = 'calendario';
  ok(S);
  const vistos = new Map();
  for (const b of blocos()) {
    for (const d of b.dias) {
      if (d.dia < b.ini || d.dia > b.fim) erro(S, `${rot(d)} está em ${b.nome}, fora da faixa ${b.ini} a ${b.fim}`);
      if (vistos.has(d.dia)) erro(S, `${rot(d)} aparece duas vezes (${vistos.get(d.dia)} e ${b.nome})`);
      vistos.set(d.dia, b.nome);
    }
    if (b.dias.length !== b.fim - b.ini + 1) erro(S, `${b.nome} tem ${b.dias.length} dias; esperado ${b.fim - b.ini + 1}`);
  }
  for (let n = 1; n <= 365; n++) if (!vistos.has(n)) erro(S, `falta o dia ${num3(n)}`);
  if (cal.dias.length !== 365) erro(S, `calendario.json tem ${cal.dias.length} dias`);
  const CAMPOS = ['data', 'dia_semana', 'quadro', 'step', 'sistema', 'topico', 'conceito', 'personagem', 'remix_de', 'explicacao_em', 'tipo_pergunta'];
  for (const d of DIAS) {
    const c = CAL.get(d.dia);
    if (!c) continue;
    for (const k of CAMPOS) {
      const a = JSON.stringify(d[k] ?? null);
      const e = JSON.stringify(c[k] ?? null);
      if (d[k] === undefined) erro(S, `${rot(d)}: falta "${k}" (calendário: ${e})`);
      else if (a !== e) erro(S, `${rot(d)}: "${k}" = ${a.slice(0, 80)}, calendário = ${e.slice(0, 80)}`);
    }
    if (d.gancho_data !== (c.gancho_data ?? null)) aviso(S, `${rot(d)}: gancho_data diferente do calendário`);
    // explicação no dia seguinte
    const prox = new Date(`${d.data}T12:00:00Z`);
    prox.setUTCDate(prox.getUTCDate() + 1);
    if (d.explicacao_em && d.explicacao_em !== prox.toISOString().slice(0, 10)) erro(S, `${rot(d)}: explicacao_em ${d.explicacao_em} não é D+1`);
    if (d.dia > 1) {
      const ant = CAL.get(d.dia - 1);
      if (ant && ant.explicacao_em !== d.data) erro(S, `${rot(d)}: o gabarito do dia anterior não sai na data deste dia`);
    }
  }
}

// ---------------------------------------------------------------- 2. estrutura e coerência interna
{
  const S = 'estrutura';
  ok(S);
  for (const d of DIAS) {
    const q = d.questao || {};
    const alts = alternativasDe(d);
    if (!d.gancho) erro(S, `${rot(d)}: sem gancho`);
    if (!q.vinheta || !q.pergunta) erro(S, `${rot(d)}: sem vinheta ou pergunta`);
    const palavras = `${q.vinheta} ${q.pergunta}`.trim().split(/\s+/).length;
    if (palavras > config.limites.palavras_vinheta) erro(S, `${rot(d)}: vinheta + pergunta com ${palavras} palavras`);
    if (alts.map((a) => a.letra).join('') !== 'ABCD') erro(S, `${rot(d)}: alternativas ${alts.map((a) => a.letra).join('')}`);
    if (!'ABCD'.includes(q.correta) || q.correta.length !== 1) erro(S, `${rot(d)}: correta inválida`);
    if (d.correta !== q.correta) erro(S, `${rot(d)}: correta do topo (${d.correta}) diferente de questao.correta (${q.correta})`);
    const textos = alts.map((a) => semMarca(a.texto).toLowerCase());
    if (new Set(textos).size !== 4) erro(S, `${rot(d)}: alternativas repetidas`);
    for (const a of alts) if (a.letra !== q.correta && !d.explicacao?.erradas?.[a.letra]) erro(S, `${rot(d)}: falta explicação da errada ${a.letra}`);
    if (d.explicacao?.erradas?.[q.correta]) erro(S, `${rot(d)}: a letra certa ${q.correta} tem explicação de errada`);
    if (!d.explicacao?.certa?.length) erro(S, `${rot(d)}: sem explicação da certa`);
    if (!d.explicacao?.macete?.frase) aviso(S, `${rot(d)}: sem macete`);
    if (!Array.isArray(d.explicacao?.termos) || d.explicacao.termos.length < 2) aviso(S, `${rot(d)}: menos de 2 termos-chave da resposta`);
    if (!d.imagem?.arquivo || d.imagem.arquivo !== `dia-${num3(d.dia)}.png`) erro(S, `${rot(d)}: imagem.arquivo deve ser dia-${num3(d.dia)}.png`);
    if (!d.imagem_macete?.arquivo || d.imagem_macete.arquivo !== `dia-${num3(d.dia)}-macete.png`) erro(S, `${rot(d)}: imagem_macete.arquivo deve ser dia-${num3(d.dia)}-macete.png`);
    if (!d.imagem?.alt) aviso(S, `${rot(d)}: imagem sem texto alternativo`);
    // espelhos usados na planilha
    if (semMarca(d.gancho) !== d.gancho_pt) erro(S, `${rot(d)}: gancho_pt diferente do gancho`);
    if (semMarca(q.vinheta) !== d.vinheta_en) erro(S, `${rot(d)}: vinheta_en diferente de questao.vinheta`);
    if (JSON.stringify(alts.map((a) => semMarca(a.texto))) !== JSON.stringify((d.alternativas || []).map((a) => a.texto))) erro(S, `${rot(d)}: alternativas do topo diferentes de questao.alternativas`);
    if ((d.imagem?.cena || '') !== d.imagem_questao?.conceito_visual) erro(S, `${rot(d)}: imagem.cena diferente de imagem_questao.conceito_visual`);
    if ((d.imagem_macete?.cena || '') !== d.imagem_explicacao?.conceito_visual) erro(S, `${rot(d)}: imagem_macete.cena diferente de imagem_explicacao.conceito_visual`);
    if (d.remix_de) {
      const marcados = alts.map((a) => a.dia).filter((x) => x != null);
      for (const r of d.remix_de) if (!marcados.includes(r)) aviso(S, `${rot(d)}: remix sem alternativa marcada com o dia ${r}`);
      for (const m of marcados) if (!d.remix_de.includes(m)) erro(S, `${rot(d)}: alternativa marcada com o dia ${m}, que não está em remix_de`);
    }
  }
}

// ---------------------------------------------------------------- 3. duplicidade de conceito e vinheta
function palavrasNorm(t) {
  return semMarca(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\d+([.,/]\d+)*/g, '#').replace(/[^a-z0-9# ]+/g, ' ').split(/\s+/).filter(Boolean);
}
function shingles(t, n = 4) {
  const p = palavrasNorm(t);
  const s = new Set();
  for (let i = 0; i + n <= p.length; i++) s.add(p.slice(i, i + n).join(' '));
  return s;
}
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
};
{
  const S = 'duplicidade';
  ok(S);
  // o remix repete de propósito o mnemônico do dia revisado (PROGRAMA.md, seção 11, passo 6)
  const remixDe = (a, b) => (DIAS[b - 1].remix_de || []).includes(a);
  const porChave = (f, rotulo, nivel = erro, remixPode = false) => {
    const m = new Map();
    for (const d of DIAS) {
      const k = f(d);
      if (!k) continue;
      if (m.has(k) && remixPode && remixDe(m.get(k), d.dia)) continue;
      if (m.has(k)) nivel(S, `${rotulo} repetido: dia ${num3(m.get(k))} (${DIAS[m.get(k) - 1]._bloco}) e ${rot(d)} (${d._bloco}): "${k.slice(0, 70)}"`);
      else m.set(k, d.dia);
    }
  };
  porChave((d) => d.conceito.toLowerCase().trim(), 'conceito');
  porChave((d) => CAL.get(d.dia)?.chave, 'chave do calendário');
  porChave((d) => palavrasNorm(d.questao.vinheta).join(' '), 'vinheta');
  porChave((d) => palavrasNorm(d.gancho).join(' '), 'gancho');
  porChave((d) => palavrasNorm(d.explicacao.macete.frase).join(' '), 'macete', erro, true);
  porChave((d) => palavrasNorm(d.imagem.cena).join(' '), 'cena da imagem da questão');
  porChave((d) => palavrasNorm(d.imagem_macete?.cena).join(' '), 'cena da imagem do macete');
  // vinhetas parecidas (4 palavras seguidas em comum, Jaccard)
  const sh = DIAS.map((d) => shingles(`${d.questao.vinheta} ${d.questao.pergunta}`));
  for (let i = 0; i < DIAS.length; i++) {
    for (let j = i + 1; j < DIAS.length; j++) {
      const s = jaccard(sh[i], sh[j]);
      if (s >= 0.3) erro(S, `vinhetas muito parecidas (${(s * 100).toFixed(0)}%): dia ${num3(DIAS[i].dia)} e dia ${num3(DIAS[j].dia)}`);
      else if (s >= 0.18) aviso(S, `vinhetas parecidas (${(s * 100).toFixed(0)}%): dia ${num3(DIAS[i].dia)} e dia ${num3(DIAS[j].dia)}`);
    }
  }
  // mesma resposta certa em dois dias de conteúdo novo (pode ser legítimo; leitura humana)
  const resp = new Map();
  for (const d of DIAS) {
    if (d.remix_de) continue;
    const certa = alternativasDe(d).find((a) => a.letra === d.questao.correta);
    const k = palavrasNorm(certa?.texto).join(' ');
    if (resp.has(k)) aviso(S, `mesma resposta certa nos dias ${num3(resp.get(k))} e ${num3(d.dia)}: "${semMarca(certa.texto)}"`);
    else resp.set(k, d.dia);
  }
}

// ---------------------------------------------------------------- 4. distribuição das letras
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const distribuicao = { ano: {}, meses: [] };
{
  const S = 'letras';
  ok(S);
  const conta = (lista) => Object.fromEntries('ABCD'.split('').map((l) => [l, lista.filter((d) => d.questao.correta === l).length]));
  distribuicao.ano = conta(DIAS);
  const n = DIAS.length;
  for (const [l, c] of Object.entries(distribuicao.ano)) {
    const p = c / n;
    if (p < 0.23 || p > 0.27) erro(S, `ano: letra ${l} em ${c} dias (${(p * 100).toFixed(1)}%), fora de 23% a 27%`);
  }
  const porMes = new Map();
  for (const d of DIAS) {
    const k = d.data.slice(0, 7);
    if (!porMes.has(k)) porMes.set(k, []);
    porMes.get(k).push(d);
  }
  for (const [k, lista] of porMes) {
    const c = conta(lista);
    const alvo = lista.length / 4;
    const [a, m] = k.split('-');
    distribuicao.meses.push({ mes: `${MESES[Number(m) - 1]}/${a}`, dias: lista.length, ...c });
    if (lista.length < 8) continue; // 01/11/2027 sozinho no mês
    for (const [l, v] of Object.entries(c)) {
      if (Math.abs(v - alvo) > 2) erro(S, `${k}: letra ${l} em ${v} de ${lista.length} dias (alvo ${alvo.toFixed(1)})`);
    }
  }
  // sequências longas da mesma letra
  let seq = 1;
  for (let i = 1; i < DIAS.length; i++) {
    seq = DIAS[i].questao.correta === DIAS[i - 1].questao.correta ? seq + 1 : 1;
    if (seq === 4) aviso(S, `letra ${DIAS[i].questao.correta} quatro dias seguidos até o dia ${num3(DIAS[i].dia)}`);
  }
  // a legenda do gabarito (D+1) precisa citar a letra certa, e só ela
  for (const d of DIAS) {
    const cab = (d.legenda_explicacao_pt || '').split('\n')[0];
    if (!new RegExp(`letra ${d.questao.correta}\\b`).test(d.legenda_explicacao_pt || '')) erro(S, `${rot(d)}: legenda_explicacao_pt não cita a letra ${d.questao.correta}`);
    for (const l of 'ABCD') if (l !== d.questao.correta && new RegExp(`letra ${l}\\b`).test(cab)) erro(S, `${rot(d)}: legenda_explicacao_pt cita a letra ${l} no gabarito`);
  }
  // o story precisa marcar a mesma letra
  for (const d of DIAS) if (d.story_quiz?.correta !== d.questao.correta) erro(S, `${rot(d)}: story_quiz.correta ${d.story_quiz?.correta} e questão ${d.questao.correta}`);
}

// ---------------------------------------------------------------- 5. pista da resposta no dia D
const PARADAS = new Set(('with from that this which most likely next step best patient patients therapy treatment test testing level levels ' +
  'increase increased decrease decreased high higher low lower normal acute chronic disease syndrome deficiency type cell cells ' +
  'para com sem uma umas como mais menos qual quem onde ' +
  'none other only both each than into over under after before about between ' +
  'what when where who whom whose ' +
  'agent drug dose doses oral intravenous daily ' +
  'dia dias hoje ontem amanha porque agora antes alta alto hora horas proxima proximo anos fora nome nomes caso casos ' +
  'parents infant adult adults child children woman women hospital').split(/\s+/));
function raiz(w) {
  const s = w.replace(/(.)\1+/g, '$1');
  return s.length > 6 ? s.slice(0, 6) : s;
}
function raizes(t) {
  return new Set(palavrasNorm(t).filter((w) => w.length >= 4 && !PARADAS.has(w) && !/^#+$/.test(w)).map(raiz));
}
// partes do prompt que descrevem o personagem fixo não contam como pista
// (as frases fixas de fundo limpo e da folha de referência também não contam)
const cenaDoPrompt = (p) => {
  const m = /Scene:(.*?)(Clean, uncluttered background|Keep (the character|these characters) identical|Vertical 4:5|$)/s.exec(p || '');
  return m ? m[1] : p || '';
};
const pistas = [];
// Coincidências já lidas por um humano e aceitas (a palavra aparece, mas não entrega a resposta).
const ACEITAS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(PASTA_INSTAGRAM, 'ferramentas', 'pistas-aceitas.json'), 'utf8')).aceitas || {};
  } catch {
    return {};
  }
})();
const aceita = (d, onde, raizes) => (ACEITAS[String(d.dia)] || []).some((a) => (a.onde === '*' || a.onde === onde) && raizes.every((r) => a.raizes.includes(r)));
{
  const S = 'pista';
  ok(S);
  for (const d of DIAS) {
    const alts = alternativasDe(d);
    const certa = alts.find((a) => a.letra === d.questao.correta);
    if (!certa) continue;
    const doEnunciado = raizes(`${d.questao.vinheta} ${d.questao.pergunta}`);
    const dasErradas = new Set();
    for (const a of alts) if (a !== certa) for (const r of raizes(`${a.texto} ${a.quiz}`)) dasErradas.add(r);
    const daResposta = [...raizes(`${certa.texto} ${certa.quiz}`)].filter((r) => !doEnunciado.has(r) && !dasErradas.has(r));
    const dosTermos = [...raizes((d.explicacao.termos || []).join(' '))].filter((r) => !doEnunciado.has(r) && !dasErradas.has(r));
    const alvos = {
      gancho: `${d.gancho} ${d.gancho_apoio || ''}`,
      'imagem da questão (cena e alt)': `${d.imagem.cena || ''} ${d.imagem.alt || ''}`,
      'prompt da imagem da questão': cenaDoPrompt(d.imagem_questao?.prompt_nano_banana_pro),
      'legenda D (contexto)': d.legenda?.contexto || '',
      'legenda D (palavras-chave)': (d.legenda?.palavras_chave || []).join(' '),
      'legenda_questao_pt': d.legenda_questao_pt || '',
      'pergunta do quiz': d.quiz?.pergunta || d.story_quiz?.pergunta_curta_pt || '',
    };
    for (const [onde, texto] of Object.entries(alvos)) {
      const r = raizes(texto);
      const achadoResp = daResposta.filter((x) => r.has(x));
      const achadoTermo = dosTermos.filter((x) => r.has(x) && !achadoResp.includes(x));
      if (achadoResp.length) {
        const ok = aceita(d, onde, achadoResp);
        pistas.push({ dia: d.dia, onde, tipo: 'resposta', raizes: achadoResp, certa: semMarca(certa.texto), aceita: ok, remix: !!d.remix_de });
        // no remix, gancho e contexto citam os três conceitos revisados de propósito
        const nivel = ok || d.remix_de ? aviso : erro;
        nivel(S, `${rot(d)}: ${onde} tem palavra da resposta certa (${achadoResp.join(', ')}; certa: "${semMarca(certa.texto)}")${ok ? ' [aceita: pistas-aceitas.json]' : d.remix_de ? ' [remix: conceitos revisados citados de propósito]' : ''}`);
      }
      if (achadoTermo.length) {
        pistas.push({ dia: d.dia, onde, tipo: 'termo', raizes: achadoTermo, certa: semMarca(certa.texto) });
        aviso(S, `${rot(d)}: ${onde} repete termo da explicação (${achadoTermo.join(', ')}); confira se entrega a resposta`);
      }
    }
    // palavras-chave da questão nunca podem ser os termos da resposta
    const pc = (d.legenda?.palavras_chave || []).map((t) => palavrasNorm(t).join(' '));
    const tr = (d.explicacao.termos || []).map((t) => palavrasNorm(t).join(' '));
    const iguais = pc.filter((t) => tr.includes(t) && !palavrasNorm(`${d.questao.vinheta} ${d.questao.pergunta}`).join(' ').includes(t));
    if (iguais.length) erro(S, `${rot(d)}: palavras_chave da legenda D iguais aos termos da resposta (${iguais.join('; ')})`);
    if (!pc.length) aviso(S, `${rot(d)}: legenda sem palavras_chave neutras`);
  }
}

// ---------------------------------------------------------------- 6. story quiz
{
  const S = 'story_quiz';
  ok(S);
  for (const d of DIAS) {
    const sq = d.story_quiz || {};
    const alts = alternativasDe(d);
    if (!Array.isArray(sq.opcoes) || sq.opcoes.length !== 4) {
      erro(S, `${rot(d)}: story_quiz com ${sq.opcoes?.length ?? 0} opções`);
      continue;
    }
    sq.opcoes.forEach((o, i) => {
      if (!o || !String(o).trim()) erro(S, `${rot(d)}: opção ${'ABCD'[i]} vazia`);
      if (String(o).length > config.limites.caracteres_quiz) erro(S, `${rot(d)}: opção ${'ABCD'[i]} com ${String(o).length} caracteres ("${o}")`);
      if (o !== alts[i].quiz) erro(S, `${rot(d)}: opção ${'ABCD'[i]} do story ("${o}") diferente do quiz da alternativa ("${alts[i].quiz}")`);
    });
    if (new Set(sq.opcoes.map((o) => String(o).toLowerCase())).size !== 4) erro(S, `${rot(d)}: opções do quiz repetidas`);
    const perg = sq.pergunta_curta_pt || d.quiz?.pergunta || '';
    if (!perg) erro(S, `${rot(d)}: sem pergunta do quiz`);
    else if (perg.length > 80) aviso(S, `${rot(d)}: pergunta do quiz com ${perg.length} caracteres`);
    if (sq.pergunta_curta_pt && d.quiz?.pergunta && sq.pergunta_curta_pt !== d.quiz.pergunta) erro(S, `${rot(d)}: pergunta do story diferente de quiz.pergunta`);
  }
}

// ---------------------------------------------------------------- 6b. regras da rodada 4 (avaliação médica e de conteúdo)
// enquete do dia D sem achados da vinheta; a certa não é a única mais longa; intruso nos remixes;
// remix diferente do dia revisado; teto de 15% por personagem; cenas com até 3 elementos principais.
const LIM = config.limites || {};
const elencoAno = { principal: {}, porQuadro: {}, naImagem: {} };
const cenasMedidas = { erro: [], aviso: [] };
let intrusoResumo = null;
let alternativasResumo = null;
{
  const S = 'enquete';
  ok(S);
  const PERG = config.enquete?.pergunta || 'Qual é a sua letra?';
  // regra única de língua: opção em inglês da prova (termos do USMLE), nunca em português
  const PT = /[ãõçê]|\b(não|com|sem|para|uma|umas|dos|das|pelo|pela|então|depois|antes|ou|de|da|em|e)\b(?![.])/i;
  const PT_OK = /\bde Quervain\b|\b(hepatitis|vitamin|type|group) E\b/gi;
  // números de achado (sem ordinais como 4th, que são nome de estrutura)
  const nums = (t) => (String(t || '').match(/\d+([.,]\d+)?(?!st|nd|rd|th)/g) || []);
  for (const d of DIAS) {
    const sq = d.story_quiz || {};
    const perg = sq.pergunta_curta_pt || d.quiz?.pergunta || '';
    if (perg !== PERG) erro(S, `${rot(d)}: a enquete do dia D pergunta "${perg.slice(0, 60)}"; a regra é "${PERG}" (o achado decisivo vai em quiz.resumo, para o D+1 e o Reel)`);
    const vin = new Set(nums(d.questao.vinheta));
    for (const a of alternativasDe(d)) {
      if (PT.test(a.quiz.replace(PT_OK, ''))) erro(S, `${rot(d)}: opção ${a.letra} da enquete fora da regra de língua (inglês da prova): "${a.quiz}"`);
      const extra = nums(a.quiz).filter((n) => !nums(a.texto).includes(n) && vin.has(n));
      if (extra.length) erro(S, `${rot(d)}: opção ${a.letra} da enquete traz número da vinheta que a alternativa não tem (${extra.join(', ')}): "${a.quiz}"`);
    }
    if (!d.quiz?.resumo) aviso(S, `${rot(d)}: sem quiz.resumo (pergunta com o achado, usada no quiz do D+1 e no Reel)`);
    else if (d.quiz.resumo.length > 90) aviso(S, `${rot(d)}: quiz.resumo com ${d.quiz.resumo.length} caracteres`);
  }
}
{
  const S = 'alternativas';
  ok(S);
  let unicas = 0, certaMaisLonga = 0, unicasCurtas = 0, certaMaisCurta = 0;
  for (const d of DIAS) {
    const alts = alternativasDe(d);
    for (const [campo, f] of [['texto', (a) => semMarca(a.texto).length], ['opção da enquete', (a) => a.quiz.length]]) {
      const lens = alts.map(f);
      const mx = Math.max(...lens);
      const mn = Math.min(...lens);
      const maiores = alts.filter((a, i) => lens[i] === mx);
      const menores = alts.filter((a, i) => lens[i] === mn);
      if (maiores.length === 1) {
        if (campo === 'texto') unicas++;
        if (maiores[0].letra === d.questao.correta) {
          if (campo === 'texto') certaMaisLonga++;
          erro(S, `${rot(d)}: a certa (${d.questao.correta}) é a única alternativa mais longa no ${campo} (${mx} caracteres)`);
        }
      }
      if (campo === 'texto' && menores.length === 1) { unicasCurtas++; if (menores[0].letra === d.questao.correta) certaMaisCurta++; }
    }
  }
  const pc = unicasCurtas ? certaMaisCurta / unicasCurtas : 0;
  if (pc > 0.35) aviso(S, `a certa é a única mais curta em ${(pc * 100).toFixed(0)}% dos dias com uma alternativa mais curta (esperado perto de 25%)`);
  alternativasResumo = { dias_com_unica_mais_longa: unicas, certa_e_a_mais_longa: certaMaisLonga, dias_com_unica_mais_curta: unicasCurtas, certa_e_a_mais_curta: certaMaisCurta, pct_certa_mais_curta: Number((pc * 100).toFixed(1)) };
}
{
  const S = 'remix';
  ok(S);
  const R = DIAS.filter((d) => d.remix_de);
  const intruso = R.filter((d) => (d.questao.alternativas[d.questao.correta]?.dia ?? null) === null);
  const [lo, hi] = LIM.intruso_remix || [0.35, 0.65];
  const p = R.length ? intruso.length / R.length : 0;
  if (p < lo || p > hi) erro(S, `a resposta do remix é o intruso (alternativa sem selo "visto no dia") em ${intruso.length} de ${R.length} domingos (${(p * 100).toFixed(0)}%); a faixa é ${lo * 100}% a ${hi * 100}%`);
  for (let i = 0; i < R.length; i += 13) {
    const tri = R.slice(i, i + 13);
    const n = tri.filter((d) => intruso.includes(d)).length;
    if (n < 3 || n > tri.length - 3) aviso(S, `domingos ${tri[0].dia} a ${tri.at(-1).dia}: intruso certo em ${n} de ${tri.length} (fica previsível)`);
  }
  intrusoResumo = { domingos: R.length, intruso_certo: intruso.length, pct: Number((p * 100).toFixed(1)) };
  const raizesResp = (t) => palavrasNorm(t).filter((w) => w.length >= 3 && !['the', 'and', 'with', 'for', 'from', 'into'].includes(w)).map((w) => w.slice(0, 6));
  const jac = (a, b) => { const x = new Set(a); const y = new Set(b); let k = 0; for (const v of x) if (y.has(v)) k++; return x.size + y.size - k ? k / (x.size + y.size - k) : 0; };
  for (const d of R) {
    const certa = semMarca(d.questao.alternativas[d.questao.correta].texto);
    const shD = shingles(`${d.questao.vinheta} ${d.questao.pergunta}`, 3);
    for (const r of d.remix_de) {
      const o = DIAS[r - 1];
      if (!o) continue;
      const certaO = semMarca(o.questao.alternativas[o.questao.correta].texto);
      const jr = jac(raizesResp(certa), raizesResp(certaO));
      const jv = jaccard(shD, shingles(`${o.questao.vinheta} ${o.questao.pergunta}`, 3));
      if (palavrasNorm(certa).join(' ') === palavrasNorm(certaO).join(' ') || jr >= 0.75) erro(S, `${rot(d)}: o remix tem a mesma resposta do dia ${num3(r)} ("${certa}"); a revisão precisa de pergunta nova`);
      else if (jr >= 0.5) aviso(S, `${rot(d)}: resposta parecida com a do dia ${num3(r)} ("${certa}" e "${certaO}"); confira se é contraste e não repetição`);
      if (jv >= 0.35) erro(S, `${rot(d)}: vinheta do remix ${(jv * 100).toFixed(0)}% igual à do dia ${num3(r)}`);
      else if (jv >= 0.2) aviso(S, `${rot(d)}: vinheta do remix parecida com a do dia ${num3(r)} (${(jv * 100).toFixed(0)}%)`);
    }
  }
}
{
  const S = 'elenco';
  ok(S);
  const teto = LIM.teto_personagem_ano ?? 0.15;
  const max = Math.floor(teto * DIAS.length);
  let refs = null;
  try { refs = JSON.parse(fs.readFileSync(path.join(PASTA_INSTAGRAM, 'personagens-referencia.json'), 'utf8')); } catch { erro(S, 'falta instagram/personagens-referencia.json (rode normalizar-dias.mjs)'); }
  const arquivosRef = new Set((refs?.personagens || []).map((x) => x.arquivo));
  for (const d of DIAS) {
    const q = d.personagem || d.anfitriao || 'sem personagem';
    elencoAno.principal[q] = (elencoAno.principal[q] || 0) + 1;
    (elencoAno.porQuadro[d.quadro] ||= {})[q] = (elencoAno.porQuadro[d.quadro][q] || 0) + 1;
    const pr = d.personagem_referencia;
    if (!pr) { erro(S, `${rot(d)}: sem personagem_referencia (rode normalizar-dias.mjs)`); continue; }
    for (const n of pr.questao || []) elencoAno.naImagem[n] = (elencoAno.naImagem[n] || 0) + 1;
    for (const a of pr.arquivos || []) if (!arquivosRef.has(a)) erro(S, `${rot(d)}: referência ${a} fora de personagens-referencia.json`);
    if ((pr.questao || []).length && !/identical to the attached reference sheet/.test(d.imagem_questao.prompt_nano_banana_pro)) erro(S, `${rot(d)}: prompt da questão sem a frase da folha de referência`);
    if ((pr.questao || []).length > 2) erro(S, `${rot(d)}: ${pr.questao.length} personagens fixos na imagem da questão (no máximo 2, um em ação)`);
    if (d.personagem && !(pr.questao || []).includes(d.personagem) && !(pr.macete || []).includes(d.personagem)) aviso(S, `${rot(d)}: o personagem do dia (${d.personagem}) não aparece em nenhum prompt`);
  }
  for (const [n, c] of Object.entries(elencoAno.principal)) if (n !== 'sem personagem' && c > max) erro(S, `${n} é o personagem do dia em ${c} dias (${(c / DIAS.length * 100).toFixed(1)}%); o teto é ${teto * 100}% do ano (${max} dias)`);
  for (const [n, c] of Object.entries(elencoAno.naImagem)) if (c > max) erro(S, `${n} aparece em ${c} imagens de questão (${(c / DIAS.length * 100).toFixed(1)}%); o teto é ${teto * 100}% do ano (${max})`);
}
{
  const S = 'cenas';
  ok(S);
  // Elementos principais estimados na cena em português: artigos indefinidos e quantidades, sem contar
  // a assinatura do quadro (vinil, relógio, plaquinha, tabela 2x2, comanda, setinhas) nem o fundo.
  const ASSINATURA = /\b(um |uma |num |numa )?(pequeno |pequena )?(vinil( pequeno)?|rel[oó]gio( redondo)?( de parede)?( sem n[uú]meros)?|plaquinha verde e vermelha|tabela 2x2( em branco)?|comanda( de boteco)?( em branco)?|setinhas de manual( de montagem)?|crach[aá] em branco|quadrinho|quadro na parede)\b[^,;.]*/gi;
  const IGNORAR = /\b(cada um|cada uma|uma delas|um deles|uma das|um dos|um de cada|um ao outro|uma a uma|um a um|uma vez|um pouco|de um lado|uma pitada|um canto|num canto|um ar|uma cara|um sorriso|um olhar|uma pose)\b/gi;
  const elementos = (cena) => {
    const t = ` ${String(cena).replace(/fundo limpo\.?/gi, ' ').replace(/(tom|cena) [^.]*\.?$/i, ' ').replace(ASSINATURA, ' ').replace(IGNORAR, ' ')} `;
    const total = (t.match(/\b(um|uma|num|numa|dum|duma)\b/gi) || []).length + (t.match(/\b(dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez)\b/gi) || []).length;
    const m = /(:|\()\s*([^.;)]*)/.exec(t);
    const lista = m ? m[2].split(/,|\be\b/).filter((x) => /\b(um|uma)\b/.test(x)).length : 0;
    return { total, lista, palavras: String(cena).split(/\s+/).length };
  };
  const limE = LIM.elementos_cena_erro ?? 6;
  const limP = LIM.palavras_cena_erro ?? 60;
  for (const d of DIAS) {
    const e = elementos(d.imagem.cena);
    const motivos = [];
    if (e.total >= limE) motivos.push(`cerca de ${e.total} elementos`);
    if (e.lista >= 4) motivos.push(`lista de ${e.lista} objetos (as alternativas desenhadas?)`);
    if (e.palavras > limP) motivos.push(`${e.palavras} palavras`);
    if (motivos.length) { cenasMedidas.erro.push(d.dia); erro(S, `${rot(d)}: cena da questão carregada demais para o feed (${motivos.join(', ')}); no máximo 3 elementos principais, um personagem em ação e fundo limpo`); }
    else if (e.total === limE - 1 || e.palavras > 50) { cenasMedidas.aviso.push(d.dia); aviso(S, `${rot(d)}: cena da questão no limite (${e.total} elementos, ${e.palavras} palavras)`); }
    const pq = d.imagem_questao.prompt_nano_banana_pro;
    if (!/Clean, uncluttered background with no more than three main elements\./.test(pq)) erro(S, `${rot(d)}: prompt da questão sem "Clean, uncluttered background with no more than three main elements."`);
    const cena = /Scene:(.*?)(Vertical 4:5|$)/s.exec(pq)?.[1] || '';
    if (/\b(arrows?|pointing|points?) (at|to|toward)\b|\bpunchline that points\b/i.test(cena)) aviso(S, `${rot(d)}: a cena da questão tem algo que aponta ("${cena.match(/\b(arrows?|pointing|points?) (at|to|toward)\b|\bpunchline that points\b/i)[0]}"); confira se não indica a resposta`);
  }
}

// ---------------------------------------------------------------- 7. dias sensíveis
// Datas sensíveis (PROGRAMA.md, seção 6): o humor sai e entra o acolhimento.
const DATA_SENSIVEL = /AIDS|HIV|c[aâ]ncer|hansen|suic|Setembro Amarelo|Alzheimer|autis|Down|sa[uú]de mental|Janeiro Branco|Finados|doen[cç]as raras|luto|viol[eê]ncia|sem piada|sem humor|acolhed|respeitos|CVV/i;
// Temas em que a piada nunca pode ser sobre a doença (câncer, HIV, demência, autismo...).
const TEMA_SENSIVEL = /c[aâ]ncer|carcinoma|tumor|neoplas|linfoma|leucemia|mieloma|melanoma|sarcoma|BRCA|retinoblastoma|leucoc[oó]ria|met[aá]st|suic|HIV|AIDS|dem[eê]ncia|Alzheimer|autis|Down|trissomia|luto|abuso|viol[eê]ncia|maus-tratos|hansen|lepra|esquizofren|depress|anorexia|bulimia/i;
const HUMOR_EN = /\b(playful|witty|funny|hilarious|comic(al)?|jok(e|es|ing)|gags?|slapstick|silly|goofy|zany|prank|mischievous|cheeky|wink(s|ing)?|festive|confetti|party|humou?r(ous)?)\b/gi;
const HUMOR_TEMA = /\b(playful|witty|funny|hilarious|comic(al)?|jok(e|es|ing)|gags?|slapstick|silly|goofy|zany|prank|mischievous|cheeky|humou?r(ous)?)\b/gi;
const NEGA_HUMOR = /\bno (jokes or gags|jokes|gags?)\b|\bno gag\b|without (jokes|gags)/gi;
const HUMOR_PT = /\b(piadas?|kkk+|haha+|rsrs|zoeira|zoar|treta)\b|[\u{1F602}\u{1F923}\u{1F606}\u{1F61C}\u{1F92A}]/giu;
const sensiveis = [];
const temasSensiveis = [];
{
  const S = 'sensivel';
  ok(S);
  for (const d of DIAS) {
    const c = CAL.get(d.dia) || {};
    const tom = tomDoDia(d, c, d.data);
    const dataSensivel = tom === 'acolhedor' || DATA_SENSIVEL.test(c.gancho_data || '');
    const temaSensivel = !d.remix_de && TEMA_SENSIVEL.test(`${d.topico} ${d.conceito}`);
    if (!dataSensivel && !temaSensivel) continue;
    if (dataSensivel) sensiveis.push(d.dia);
    else temasSensiveis.push(d.dia);
    const nivel = dataSensivel ? erro : aviso;
    if (dataSensivel && tom !== 'acolhedor') erro(S, `${rot(d)}: data sensível (${(c.gancho_data || '').slice(0, 50)}) sem tom acolhedor`);
    for (const k of ['imagem_questao', 'imagem_explicacao']) {
      const bruto = d[k]?.prompt_nano_banana_pro || '';
      const p = bruto.replace(NEGA_HUMOR, '');
      const h = p.match(dataSensivel ? HUMOR_EN : HUMOR_TEMA);
      if (h) (temaSensivel ? erro : nivel)(S, `${rot(d)}: prompt de ${k} pede humor em ${dataSensivel ? 'data' : 'tema'} sensível (${[...new Set(h.map((x) => x.toLowerCase()))].join(', ')})`);
      if (dataSensivel && !/respectful|gentle|calm|serene|reassuring|caring|kind|supportive|hopeful/i.test(bruto)) erro(S, `${rot(d)}: prompt de ${k} sem indicação de tom calmo e respeitoso`);
    }
    // "sem piada" é aviso de tom, não piada
    const pt = [d.gancho, d.gancho_apoio, d.legenda?.contexto, d.legenda_questao_pt, d.legenda_explicacao_pt, d.explicacao?.macete?.frase, d.explicacao?.macete?.apoio, d.imagem?.cena, d.imagem_macete?.cena]
      .filter(Boolean).join(' \n ').replace(/sem piadas?/gi, '');
    const h = pt.match(HUMOR_PT);
    if (h) nivel(S, `${rot(d)}: texto com marca de humor em ${dataSensivel ? 'data' : 'tema'} sensível (${[...new Set(h)].join(', ')})`);
    if (/CVV/i.test(c.gancho_data || '') && !/188/.test(d.legenda_questao_pt || '')) erro(S, `${rot(d)}: data com CVV sem a linha do CVV 188 na legenda`);
  }
}

// ---------------------------------------------------------------- 8. compliance de texto
const PROMESSA = /aprova[cç][aã]o garantida|garant\w* (a |sua |de )?(aprova|nota|match|vaga|resultado)|passe no step|passar no step|voc[eê] vai passar|vai passar no|nota garantida|match garantido|100% de aprova|taxa de aprova[cç][aã]o|o melhor curso|aprovado com certeza|resultado garantido|garantia de aprova/i;
const TRAVESSAO = /[—–]/;
const JARGAO = ['vale ressaltar', 'é importante ressaltar', 'é importante destacar', 'mergulhar', 'mergulhe', 'desvendar', 'desvende', 'no mundo de', 'no universo de', 'jornada de aprendizado', 'potencializar', 'alavancar', 'em suma', 'além disso,', 'não é apenas', 'mais do que nunca', 'sem dúvida', 'crucial', 'fundamental para', 'robusto'];
function textos(o, caminho = '', out = []) {
  if (typeof o === 'string') out.push([caminho, o]);
  else if (Array.isArray(o)) o.forEach((x, i) => textos(x, `${caminho}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k !== 'revisao' && k !== '_bloco') textos(v, caminho ? `${caminho}.${k}` : k, out);
  return out;
}
{
  const S = 'compliance';
  ok(S);
  for (const d of DIAS) {
    for (const [campo, t] of textos(d)) {
      if (TRAVESSAO.test(t)) erro(S, `${rot(d)}: travessão ou meia-risca em ${campo}`);
      if (PROMESSA.test(t)) erro(S, `${rot(d)}: promessa de resultado em ${campo}: "${t.match(PROMESSA)[0]}"`);
      if (!/prompt|vinheta|pergunta|alternativas|questao|termos|conceito$|fonte/.test(campo)) {
        const baixo = t.toLowerCase();
        for (const j of JARGAO) if (baixo.includes(j)) aviso(S, `${rot(d)}: jargão "${j}" em ${campo}`);
      }
    }
    for (const k of ['legenda_questao_pt', 'legenda_explicacao_pt']) {
      if (!/CRM-DF 13610/.test(d[k] || '')) erro(S, `${rot(d)}: ${k} sem "CRM-DF 13610"`);
      if (/https?:\/\//.test(d[k] || '')) aviso(S, `${rot(d)}: ${k} com link clicável (no feed vai "link na bio")`);
    }
  }
  if (!/^CRM-DF \d+$/.test(config.assinatura.crm)) erro(S, `config.json: CRM "${config.assinatura.crm}"`);
}

// ---------------------------------------------------------------- 9. prompts das imagens
const PALETA_SITE = ['#0f2747', '#b0243a', '#f3f5f2', '#1d8a4b', '#f1c232'];
{
  const S = 'prompts';
  ok(S);
  for (const d of DIAS) {
    for (const k of ['imagem_questao', 'imagem_explicacao']) {
      const im = d[k];
      if (!im?.prompt_nano_banana_pro) { erro(S, `${rot(d)}: falta ${k}.prompt_nano_banana_pro`); continue; }
      const p = im.prompt_nano_banana_pro;
      const hex = (p.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase());
      for (const h of hex) if (!PALETA_SITE.includes(h)) erro(S, `${rot(d)}: ${k} usa a cor ${h}, fora da paleta do site`);
      for (const h of PALETA_SITE) if (!hex.includes(h)) erro(S, `${rot(d)}: ${k} sem a cor ${h} da paleta do site`);
      if (!/No text/i.test(p)) erro(S, `${rot(d)}: ${k} sem "No text"`);
      if (!/4:5/.test(p)) erro(S, `${rot(d)}: ${k} sem a proporção 4:5 no texto`);
      const par = im.parametros || {};
      if (par.modelo !== 'nano_banana_pro' || par.resolucao !== '2k' || par.proporcao !== '4:5') erro(S, `${rot(d)}: ${k}.parametros ${JSON.stringify(par)}`);
      if (/\b(real person|photo of a patient|photograph)\b/i.test(p.replace(/no real people|not a real person|no photos?/gi, ''))) aviso(S, `${rot(d)}: ${k} cita foto ou pessoa real`);
    }
  }
}

// ---------------------------------------------------------------- 10. render.mjs --so-conferir (inclui o banco privado)
let renderResumo = null;
if (!SEM_RENDER) {
  const S = 'render';
  ok(S);
  const pasta = exportarQuestoes(DIAS);
  const r = spawnSync(process.execPath, [path.join(PASTA_INSTAGRAM, 'templates', 'render.mjs'), '--intervalo', '1-365', '--so-conferir', '--fonte', pasta], { encoding: 'utf8', cwd: RAIZ, maxBuffer: 64 * 1024 * 1024 });
  const linhas = `${r.stdout}\n${r.stderr}`.split('\n').filter(Boolean);
  const x = linhas.filter((l) => l.startsWith('x '));
  const avs = linhas.filter((l) => l.startsWith('! '));
  const pendentes = avs.filter((l) => /imagem (do macete )?pendente/.test(l)).length;
  const outros = avs.filter((l) => !/imagem (do macete )?pendente/.test(l));
  const banco = x.filter((l) => /banco privado/.test(l));
  const semBanco = linhas.some((l) => /banco privado não encontrado/.test(l));
  if (semBanco) erro(S, 'banco privado não encontrado: a comparação de cópia não rodou');
  for (const l of x) erro(S, l.slice(2));
  for (const l of outros) aviso(S, l.slice(2));
  renderResumo = { codigo: r.status, erros: x.length, banco_privado: banco.length, imagens_pendentes: pendentes, outros_avisos: outros.length, banco_conferido: !semBanco };
}

// ---------------------------------------------------------------- 11. conversão ativa (links, CTA, desafio, live)
{
  const S = 'conversao';
  ok(S);
  const C = conversao();
  const URL_ESCRITA = /https?:\/\/|github\.io|www\.|\.com\.br|link na bio/i;
  const semCvv = (t) => String(t || '').replace(/cvv\.org\.br/gi, '');
  for (const d of DIAS) {
    for (const [campo, t] of [['legenda_questao_pt', d.legenda_questao_pt], ['legenda_explicacao_pt', d.legenda_explicacao_pt], ['legenda.cta_texto', d.legenda?.cta_texto], ['legenda.contexto', d.legenda?.contexto]]) {
      if (t && URL_ESCRITA.test(semCvv(t))) erro(S, `${rot(d)}: endereço escrito em ${campo} (link só na bio, no adesivo de link e no direct)`);
    }
    if ('cta' in d) aviso(S, `${rot(d)}: campo antigo "cta" (use cta_forcado; rode conversao-ativa.mjs)`);
    if (d.cta_forcado && !C.slide_cta[d.cta_forcado]) erro(S, `${rot(d)}: cta_forcado "${d.cta_forcado}" não existe em conversao.json`);
  }
  // legenda completa do post, como o render monta (gabarito de ontem + questão de hoje)
  const tmpq = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-val-'));
  exportarQuestoes(DIAS, tmpq);
  const M = new Map(DIAS.map((d) => [d.dia, montarDia(d.dia, tmpq, path.join(PASTA_INSTAGRAM, 'imagens'))]));
  for (const d of DIAS) {
    const leg = legenda(M.get(d.dia), M.get(d.dia - 1) || null, config);
    if (URL_ESCRITA.test(semCvv(leg))) erro(S, `${rot(d)}: legenda do post com endereço escrito`);
    if (!/CRM-DF/.test(leg)) erro(S, `${rot(d)}: legenda do post sem CRM`);
  }
  fs.rmSync(tmpq, { recursive: true, force: true });
  for (const [tipo, s] of Object.entries(C.slide_cta)) if (s.palavra && !C.palavras[s.palavra]) erro(S, `slide_cta.${tipo}: palavra ${s.palavra} sem resposta automática`);
  for (const [palavra, p] of Object.entries(C.palavras)) {
    if (!/\{aviso\}/.test(p.dm)) erro(S, `palavra ${palavra}: resposta automática sem aviso de privacidade`);
    if (!/\{assinatura\}/.test(p.dm)) erro(S, `palavra ${palavra}: resposta automática sem assinatura com CRM`);
    if (p.link && !C.links[p.link]) erro(S, `palavra ${palavra}: link ${p.link} não existe`);
  }
  const PROMESSA = /aprova[cç][aã]o garantida|passe no step|garant[ai]\w* (a |sua )?(aprova|vaga|nota|match)|o melhor curso/i;
  const TRAV = /[—–]/;
  const todoTexto = JSON.stringify(C);
  if (TRAV.test(todoTexto)) erro(S, 'conversao.json com travessão ou meia-risca');
  if (PROMESSA.test(todoTexto)) erro(S, 'conversao.json com promessa proibida');
  const ini = cal.periodo.inicio;
  const fim = cal.periodo.fim;
  for (const e of C.desafio.edicoes) {
    const n = (iso) => DIAS.find((x) => x.data === iso)?.dia;
    if (n(e.inicio) !== e.dia_inicio || n(e.fim) !== e.dia_fim) erro(S, `desafio ${e.edicao}: dia_inicio/dia_fim não batem com as datas`);
    if (e.dia_fim - e.dia_inicio !== 29) erro(S, `desafio ${e.edicao}: não tem 30 dias`);
    if (!(e.inscricao[1] < e.inicio)) erro(S, `desafio ${e.edicao}: inscrição termina depois do início`);
  }
  for (const d of C.lives.datas) {
    if (d < ini || d > fim) erro(S, `live ${d} fora do programa`);
    const dd = DIAS.find((x) => x.data === d);
    if (dd && dd.dia_semana !== 'quinta-feira') aviso(S, `live ${d} não cai numa quinta`);
    if (dd && dd.tom === 'acolhedor') aviso(S, `live ${d} cai numa data sensível`);
  }
  if (C.lives.datas.length !== 12) erro(S, `são ${C.lives.datas.length} lives; o plano é uma por mês`);
  // MACETE: a promessa ("os sete macetes mais recentes") precisa casar com a entrega
  for (const d of DIAS) {
    const m = montarDiaSimples(d);
    if (palavraCta(m) !== 'MACETE') continue;
    const k = pacoteNaData(d.data, '12h00');
    if (!k) erro(S, `${rot(d)}: CTA MACETE antes do primeiro pacote de macetes (sexta do dia 5)`);
  }
  if (/No domingo eles voltam no Remix/i.test(C.palavras.MACETE.dm + C.palavras.MACETE.resposta_publica.join(' '))) erro(S, 'MACETE promete que todos os macetes voltam no Remix de domingo');
}

let reelsResumo = null;
// ---------------------------------------------------------------- 12. Reels semanais (instagram/reels-semanais.json)
{
  const S = 'reels';
  ok(S);
  const arq = path.join(PASTA_INSTAGRAM, 'reels-semanais.json');
  if (!fs.existsSync(arq)) erro(S, 'falta instagram/reels-semanais.json (rode gerar-reels-semanais.mjs)');
  else {
    const R = JSON.parse(fs.readFileSync(arq, 'utf8')).reels;
    const C = conversao();
    const ganchos = new Map();
    if (R.length !== 52) erro(S, `são ${R.length} Reels; esperado 52`);
    const TRAV = /[—–]/;
    const URL_ESCRITA = /https?:\/\/|github\.io|www\.|link na bio/i;
    R.forEach((r, i) => {
      const o = r.id;
      if (r.semana !== i + 1) erro(S, `${o}: semana ${r.semana} fora de ordem`);
      const sexta = DIAS[7 * i + 4];
      if (!sexta || sexta.data !== r.publicar_em || sexta.dia_semana !== 'sexta-feira') erro(S, `${o}: publicar_em ${r.publicar_em} não é a sexta da semana`);
      if (r.duracao_s < 15 || r.duracao_s > 30) erro(S, `${o}: ${r.duracao_s} s (o Reel tem de 15 a 30 s)`);
      const c = r.cenas;
      if (c[0].inicio_s !== 0 || c[0].fim_s > 2.01) erro(S, `${o}: o gancho precisa ocupar os 2 primeiros segundos`);
      for (let k = 1; k < c.length; k++) if (Math.abs(c[k].inicio_s - c[k - 1].fim_s) > 0.001) erro(S, `${o}: buraco ou sobreposição entre as cenas ${k} e ${k + 1}`);
      if (Math.abs(c.at(-1).fim_s - r.duracao_s) > 0.001) erro(S, `${o}: a última cena não termina em duracao_s`);
      for (const x of c) {
        if (!x.texto_tela) erro(S, `${o}: cena sem texto na tela`);
        if (TRAV.test(x.texto_tela)) erro(S, `${o}: travessão no texto da tela`);
        if (URL_ESCRITA.test(x.texto_tela)) erro(S, `${o}: endereço no texto da tela`);
        if ((x.texto_tela.match(/\*/g) || []).length % 2) erro(S, `${o}: asterisco de destaque sem par`);
        if (x.tipo_visual === 'alternativas' && (!x.opcoes || x.opcoes.length !== 4)) erro(S, `${o}: alternativas sem as 4 opções`);
        // texto começando com "Comente" vira a caixa de comentário no Remotion (reels/src/segmentos.ts) e some com as opções
        if (x.tipo_visual !== 'legenda_cinetica' && /^Comente\s/i.test(x.texto_tela)) erro(S, `${o}: cena ${x.tipo_visual} com texto começando por "Comente" (o render troca pela caixa de comentário)`);
        if (x.tipo_visual === 'personagem' && !x.personagem) erro(S, `${o}: cena de personagem sem nome`);
        if (semMarca(x.texto_tela).length > 160) aviso(S, `${o}: texto de cena com ${semMarca(x.texto_tela).length} caracteres (difícil de ler em 5 s)`);
      }
      if (!C.palavras[r.palavra_chave]) erro(S, `${o}: palavra-chave ${r.palavra_chave} sem resposta automática`);
      if (!c.some((x) => new RegExp(`Comente \\*${r.palavra_chave}\\*`).test(x.texto_tela))) erro(S, `${o}: falta a cena "Comente ${r.palavra_chave}"`);
      if (URL_ESCRITA.test(r.legenda)) erro(S, `${o}: endereço escrito na legenda do Reel`);
      if (!/CRM-DF/.test(r.legenda)) erro(S, `${o}: legenda sem CRM`);
      if (TRAV.test(r.legenda)) erro(S, `${o}: travessão na legenda`);
      if (r.audio?.musica_embutida !== false) erro(S, `${o}: o vídeo não pode levar música embutida`);
      if (r.dia_questao) {
        const d = DIAS[r.dia_questao - 1];
        if (!(d.explicacao_em <= r.publicar_em)) erro(S, `${o}: mostra a questão do dia ${r.dia_questao} antes do gabarito sair`);
        if ((d.tom === 'acolhedor' || d.cvv) && r.formato !== 'macete') erro(S, `${o}: data sensível num formato com piada`);
      }
      if (r.formato === 'resultado' && r.status === 'pronto' && ['A', 'B', 'C', 'D'].some((l) => typeof r.resultado?.[l] !== 'number')) erro(S, `${o}: resultado marcado como pronto sem os números da enquete`);
      // plano B do Resultado: nada de número nem de barra de percentual
      if (r.formato === 'resultado' && r.status === 'pronto_plano_b' && c.some((x) => /\{erro\}/.test(x.texto_tela) || x.percentuais_de)) erro(S, `${o}: plano B do Resultado mostra número da enquete`);
      if (r.formato === 'resultado' && !['pronto', 'pronto_plano_b'].includes(r.status)) erro(S, `${o}: Resultado sem plano B (status ${r.status})`);
      // gancho próprio da questão da semana
      const g = palavrasNorm(r.gancho_0a2s).join(' ');
      if (ganchos.has(g)) erro(S, `${o}: gancho igual ao de ${ganchos.get(g)} ("${semMarca(r.gancho_0a2s)}")`);
      else ganchos.set(g, o);
      if (r.dia_questao) {
        const d = DIAS[r.dia_questao - 1];
        const fonteDia = raizes(`${d.questao.vinheta} ${d.quiz?.resumo || ''} ${d.gancho} ${d.topico} ${d.conceito} ${(d.explicacao.termos || []).join(' ')}`);
        const doGancho = [...raizes(r.gancho_0a2s)].filter((x) => fonteDia.has(x));
        if (!doGancho.length) erro(S, `${o}: gancho genérico, sem nenhum dado da questão do dia ${r.dia_questao} ("${semMarca(r.gancho_0a2s)}")`);
      }
      // Pegadinha: troque um dado e a resposta muda
      if (r.formato === 'pegadinha') {
        const t = c.find((x) => x.contraste === 'troca');
        const n = c.find((x) => x.contraste === 'nova_resposta');
        if (!t || !n || !/Troque/.test(t.texto_tela)) erro(S, `${o}: Pegadinha sem o contraste "troque um dado e a resposta muda"`);
        else if (r.dia_questao) {
          const d = DIAS[r.dia_questao - 1];
          const letra = /^([ABCD]),/.exec(semMarca(r.contraste?.resposta || ''))?.[1];
          if (letra && letra === d.questao.correta) erro(S, `${o}: a troca de dado leva à mesma letra certa (${letra})`);
        }
      }
      // Macete: só promete o Remix quando o conceito volta
      const promessa = c.find((x) => /Volta no \*?Remix/i.test(x.texto_tela));
      if (promessa && r.dia_questao) {
        const v = remixQueRevisa(r.dia_questao, DIAS);
        if (!v) erro(S, `${o}: promete a volta no Remix, mas o dia ${r.dia_questao} não está em nenhum remix_de depois dele`);
        else if (!promessa.texto_tela.includes(v.data.split('-').reverse().slice(0, 2).join('/'))) erro(S, `${o}: a data do Remix na tela não é a do domingo que revisa o dia ${r.dia_questao} (${v.data})`);
      }
      if (/volta no remix/i.test(r.legenda) && !(r.dia_questao && remixQueRevisa(r.dia_questao, DIAS))) erro(S, `${o}: a legenda promete a volta no Remix sem o conceito voltar`);
      // MACETE no direct: o pacote ativo na sexta às 19h precisa trazer a questão do Reel
      if (r.palavra_chave === 'MACETE' && r.dia_questao) {
        const k = pacoteNaData(r.publicar_em, '19h00');
        const [a, b] = k ? diasDoPacote(k) : [0, -1];
        if (!(r.dia_questao >= a && r.dia_questao <= b)) erro(S, `${o}: pede MACETE, mas o pacote do direct ativo na sexta (dias ${a} a ${b}) não traz o macete do dia ${r.dia_questao}`);
      }
      if (r.dia_questao && !r.ilustracoes) erro(S, `${o}: sem o campo ilustracoes (imagens do carrossel para o Reel)`);
    });
    reelsResumo = { reels: R.length, ganchos_unicos: ganchos.size, por_formato: R.reduce((acc, r) => ((acc[r.formato] = (acc[r.formato] || 0) + 1), acc), {}), resultado_plano_b: R.filter((r) => r.status === 'pronto_plano_b').length, macete_promete_remix: R.filter((r) => r.cenas.some((x) => /Volta no \*?Remix/.test(x.texto_tela))).length, macete_sem_remix: R.filter((r) => r.formato === 'macete' && !r.cenas.some((x) => /Volta no \*?Remix/.test(x.texto_tela))).length };
  }
}

// ---------------------------------------------------------------- relatório
function montarDiaSimples(d) { return { ...d, n: d.dia }; }
function palavraCta(m) { const t = ctaDoDiaConv(m); return (conversao().slide_cta[t] || {}).palavra || null; }
const tab = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' | ');
console.log('VALIDAÇÃO DOS 365 DIAS (instagram/dias)');
console.log(`dias lidos: ${DIAS.length} em ${blocos().length} blocos`);
console.log(`letras certas no ano: ${tab(distribuicao.ano)}`);
for (const m of distribuicao.meses) console.log(`  ${m.mes.padEnd(9)} ${String(m.dias).padStart(2)} dias  A ${m.A}  B ${m.B}  C ${m.C}  D ${m.D}`);
console.log(`datas sensíveis (sem piada): ${sensiveis.length} (${sensiveis.join(', ')})`);
console.log(`temas sensíveis (piada nunca sobre a doença): ${temasSensiveis.length} (${temasSensiveis.join(', ')})`);
console.log(`enquete do dia D: "${config.enquete?.pergunta || 'Qual é a sua letra?'}" nos ${DIAS.filter((d) => d.story_quiz?.pergunta_curta_pt === (config.enquete?.pergunta || 'Qual é a sua letra?')).length} dias; quiz.resumo em ${DIAS.filter((d) => d.quiz?.resumo).length}`);
if (alternativasResumo) console.log(`alternativas: a certa é a única mais longa em ${alternativasResumo.certa_e_a_mais_longa} de ${alternativasResumo.dias_com_unica_mais_longa} dias com uma mais longa; a única mais curta em ${alternativasResumo.certa_e_a_mais_curta} de ${alternativasResumo.dias_com_unica_mais_curta} (${alternativasResumo.pct_certa_mais_curta}%)`);
if (intrusoResumo) console.log(`remix: intruso certo em ${intrusoResumo.intruso_certo} de ${intrusoResumo.domingos} domingos (${intrusoResumo.pct}%)`);
console.log(`elenco (personagem do dia, teto ${((LIM.teto_personagem_ano ?? 0.15) * 100).toFixed(0)}% = ${Math.floor((LIM.teto_personagem_ano ?? 0.15) * DIAS.length)} dias): ${Object.entries(elencoAno.principal).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c} (${(c / DIAS.length * 100).toFixed(1)}%)`).join(', ')}`);
for (const [q, v] of Object.entries(elencoAno.porQuadro)) console.log(`  ${q.padEnd(20)} ${Object.entries(v).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', ')}`);
console.log(`cenas da questão: ${cenasMedidas.erro.length} carregadas demais, ${cenasMedidas.aviso.length} no limite`);
if (reelsResumo) console.log(`reels: ${reelsResumo.reels}, ${reelsResumo.ganchos_unicos} ganchos únicos, ${JSON.stringify(reelsResumo.por_formato)}, Resultado no plano B ${reelsResumo.resultado_plano_b}, Macete que promete Remix ${reelsResumo.macete_promete_remix} (e ${reelsResumo.macete_sem_remix} que pede para salvar)`);
if (renderResumo) console.log(`render --so-conferir: ${renderResumo.erros} erro(s), ${renderResumo.banco_privado} de cópia do banco privado, ${renderResumo.imagens_pendentes} aviso(s) de imagem pendente, ${renderResumo.outros_avisos} outro(s) aviso(s); banco conferido: ${renderResumo.banco_conferido ? 'sim' : 'não'}`);
console.log('');
for (const [s, v] of Object.entries(secoes)) console.log(`${(v.erros ? 'x' : 'ok').padEnd(2)} ${s.padEnd(12)} ${v.erros} erro(s), ${v.avisos} aviso(s)`);
if (avisos.length) {
  console.log(`\nAVISOS (${avisos.length})`);
  for (const a of avisos) console.log(`! ${a}`);
}
if (erros.length) {
  console.log(`\nERROS (${erros.length})`);
  for (const e of erros) console.log(`x ${e}`);
}
if (SAIDA_JSON) fs.writeFileSync(SAIDA_JSON, JSON.stringify({ erros, avisos, secoes, distribuicao, sensiveis, temasSensiveis, pistas, alternativas: alternativasResumo, remix: intrusoResumo, elenco: elencoAno, cenas: cenasMedidas, reels: reelsResumo, render: renderResumo }, null, 2));
process.exit(erros.length ? 1 : 0);
