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
import { tomDoDia } from '../templates/lib/dados.mjs';

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
const cenaDoPrompt = (p) => {
  const m = /Scene:(.*?)(Vertical 4:5|$)/s.exec(p || '');
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

// ---------------------------------------------------------------- relatório
const tab = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' | ');
console.log('VALIDAÇÃO DOS 365 DIAS (instagram/dias)');
console.log(`dias lidos: ${DIAS.length} em ${blocos().length} blocos`);
console.log(`letras certas no ano: ${tab(distribuicao.ano)}`);
for (const m of distribuicao.meses) console.log(`  ${m.mes.padEnd(9)} ${String(m.dias).padStart(2)} dias  A ${m.A}  B ${m.B}  C ${m.C}  D ${m.D}`);
console.log(`datas sensíveis (sem piada): ${sensiveis.length} (${sensiveis.join(', ')})`);
console.log(`temas sensíveis (piada nunca sobre a doença): ${temasSensiveis.length} (${temasSensiveis.join(', ')})`);
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
if (SAIDA_JSON) fs.writeFileSync(SAIDA_JSON, JSON.stringify({ erros, avisos, secoes, distribuicao, sensiveis, temasSensiveis, pistas, render: renderResumo }, null, 2));
process.exit(erros.length ? 1 : 0);
