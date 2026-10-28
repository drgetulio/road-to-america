/* Road to America | estatísticas (funções puras) */
import { State } from "../vendor/ts-fsrs.mjs";
import { dayKey, dayStart, addDays } from "./util.js";

/* Retenção real: proporção de revisões de cards já em revisão (não novos nem
   em aprendizagem) respondidas com Difícil, Bom ou Fácil */
export function retention(revlog, { dias = 30, now = new Date(), maduros = false } = {}) {
  const desde = addDays(dayStart(now), -dias + 1).getTime();
  let total = 0;
  let acertos = 0;
  for (const r of revlog) {
    if (r.state !== State.Review) continue;
    if (new Date(r.review).getTime() < desde) continue;
    if (maduros && !(r.elapsed_days >= 21)) continue;
    total++;
    if (r.rating > 1) acertos++;
  }
  return { total, acertos, taxa: total ? acertos / total : null };
}

/* Previsão de revisões por dia (dia 0 = hoje, inclui atrasadas) */
export function forecast(estados, { dias = 30, now = new Date() } = {}) {
  const inicio = dayStart(now).getTime();
  const DIA = 86400000;
  const out = new Array(dias).fill(0);
  for (const st of estados) {
    if (!st || st.suspenso || st.state === State.New) continue;
    const d = Math.floor((new Date(st.due).getTime() - inicio) / DIA);
    if (d < dias) out[Math.max(0, d)]++;
  }
  return out;
}

/* Revisões por dia de estudo, sequência atual e maior sequência */
export function activity(revlog, { now = new Date() } = {}) {
  const porDia = new Map();
  for (const r of revlog) {
    const k = dayKey(new Date(r.review));
    porDia.set(k, (porDia.get(k) || 0) + 1);
  }
  let atual = 0;
  let d = dayStart(now);
  if (!porDia.has(dayKey(d))) d = addDays(d, -1);
  while (porDia.has(dayKey(d))) { atual++; d = addDays(d, -1); }
  const chaves = [...porDia.keys()].sort();
  let maior = 0;
  let corrida = 0;
  let anterior = null;
  for (const k of chaves) {
    const dt = new Date(k + "T12:00:00");
    if (anterior && Math.round((dt - anterior) / 86400000) === 1) corrida++;
    else corrida = 1;
    maior = Math.max(maior, corrida);
    anterior = dt;
  }
  return { porDia, atual, maior, diasEstudados: porDia.size };
}

/* Mapa de calor: semanas x 7 dias, terminando na semana de hoje */
export function heatmapGrid(porDia, { semanas = 26, now = new Date() } = {}) {
  const hoje = dayStart(now);
  const fim = addDays(hoje, 6 - hoje.getDay());
  const inicio = addDays(fim, -(semanas * 7) + 1);
  const cols = [];
  for (let w = 0; w < semanas; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const dia = addDays(inicio, w * 7 + i);
      const k = dayKey(addDays(dia, 0));
      col.push({ data: dia, chave: k, n: dia > hoje ? null : porDia.get(k) || 0 });
    }
    cols.push(col);
  }
  return cols;
}

export function maturity(itens, estados) {
  const out = { novos: 0, aprendendo: 0, jovens: 0, maduros: 0, suspensos: 0, leeches: 0, total: itens.length };
  for (const it of itens) {
    const st = estados.get(it.key);
    if (st?.leech) out.leeches++;
    if (st?.suspenso) { out.suspensos++; continue; }
    if (!st || st.state === State.New) out.novos++;
    else if (st.state === State.Learning || st.state === State.Relearning) out.aprendendo++;
    else if (st.scheduled_days >= 21) out.maduros++;
    else out.jovens++;
  }
  return out;
}

/*
  Cobertura do baralho por sistema ou disciplina, comparada à faixa do outline.
  As categorias sem faixa (conceitos transversais) ficam fora do denominador.
*/
export function coverage(cards, entradas, campo = "sistema", { vistos = null } = {}) {
  const alias = {};
  for (const e of entradas) if (e.agrupar_em) alias[e.chave] = e.agrupar_em;
  const cont = {};
  const vist = {};
  for (const c of cards) {
    const k = alias[c[campo]] || c[campo];
    cont[k] = (cont[k] || 0) + 1;
    if (vistos && vistos.has(c.id)) vist[k] = (vist[k] || 0) + 1;
  }
  const comFaixa = entradas.filter((e) => e.faixa_min != null && !e.agrupar_em);
  const denom = comFaixa.reduce((n, e) => n + (cont[e.chave] || 0), 0);
  return entradas.filter((e) => !e.agrupar_em).map((e) => {
    const n = cont[e.chave] || 0;
    const share = denom && e.faixa_min != null ? (n / denom) * 100 : null;
    let situacao = "sem_faixa";
    if (e.faixa_min != null) {
      if (!denom) situacao = "abaixo";
      else if (share < e.faixa_min) situacao = "abaixo";
      else if (share > e.faixa_max) situacao = "acima";
      else situacao = "dentro";
    }
    return { ...e, n, share, situacao, vistos: vist[e.chave] || 0 };
  });
}
