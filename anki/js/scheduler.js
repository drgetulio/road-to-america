/* Road to America | agendamento com FSRS (ts-fsrs) e montagem da sessão do dia */
import {
  fsrs, generatorParameters, createEmptyCard, Rating, State, default_w, migrateParameters
} from "../vendor/ts-fsrs.mjs";
import { itemsOf, isStudyable } from "./cards.js";
import { dayStart, dayEnd, shuffle, rng } from "./util.js";

export { Rating, State };

export const DEFAULTS = Object.freeze({
  retencao: 0.9,
  novosPorDia: 20,
  revisoesPorDia: 200,
  intervaloMaximo: 36500,
  passosAprendizagem: ["1m", "10m"],
  passosReaprendizagem: ["10m"],
  fuzz: true,
  ocultarIrmaos: true,
  limiarLeech: 8,
  ordemNovos: "rendimento",
  sistemasLiberados: null,
  parametros: "",
  dataProva: ""
});

export const RETENCAO_MIN = 0.8;
export const RETENCAO_MAX = 0.97;
export const APRENDER_ANTES_MIN = 20;

export function mergeSettings(s = {}) {
  const out = { ...DEFAULTS, ...(s || {}) };
  out.retencao = clampNum(out.retencao, RETENCAO_MIN, RETENCAO_MAX, DEFAULTS.retencao);
  out.novosPorDia = Math.round(clampNum(out.novosPorDia, 0, 9999, DEFAULTS.novosPorDia));
  out.revisoesPorDia = Math.round(clampNum(out.revisoesPorDia, 0, 99999, DEFAULTS.revisoesPorDia));
  out.intervaloMaximo = Math.round(clampNum(out.intervaloMaximo, 1, 36500, DEFAULTS.intervaloMaximo));
  out.limiarLeech = Math.round(clampNum(out.limiarLeech, 1, 99, DEFAULTS.limiarLeech));
  if (!validSteps(out.passosAprendizagem)) out.passosAprendizagem = [...DEFAULTS.passosAprendizagem];
  if (!validSteps(out.passosReaprendizagem)) out.passosReaprendizagem = [...DEFAULTS.passosReaprendizagem];
  return out;
}
function clampNum(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

/* Passos de (re)aprendizagem: com FSRS, nenhum deve chegar a 1 dia (manual do Anki) */
export function parseStep(s) {
  const m = /^(\d+(?:\.\d+)?)\s*(s|m|h)$/.exec(String(s).trim());
  if (!m) return null;
  const n = Number(m[1]);
  const min = m[2] === "s" ? n / 60 : m[2] === "m" ? n : n * 60;
  return min > 0 && min < 1440 ? min : null;
}
export function validSteps(arr) {
  return Array.isArray(arr) && arr.length <= 6 && arr.every((x) => parseStep(x) !== null);
}
export function stepsFromText(t) {
  const arr = String(t || "").split(/[\s,;]+/).filter(Boolean);
  return validSteps(arr) ? arr : null;
}

/* Parâmetros FSRS colados do Anki (17, 19 ou 21 números) */
export function parseParams(t) {
  if (!String(t || "").trim()) return null;
  const nums = String(t).split(/[\s,;]+/).filter(Boolean).map(Number);
  if (![17, 19, 21].includes(nums.length) || nums.some((n) => !Number.isFinite(n))) return null;
  try { return migrateParameters(nums); } catch { return null; }
}

export function makeScheduler(settings = {}) {
  const s = mergeSettings(settings);
  const w = parseParams(s.parametros) || default_w;
  return fsrs(generatorParameters({
    request_retention: s.retencao,
    maximum_interval: s.intervaloMaximo,
    enable_fuzz: !!s.fuzz,
    enable_short_term: true,
    learning_steps: s.passosAprendizagem,
    relearning_steps: s.passosReaprendizagem,
    w
  }));
}

/* ---------- Conversão entre o estado salvo e o Card do ts-fsrs ---------- */
export function newState(item, now = new Date()) {
  return toStored(item, createEmptyCard(now));
}

export function toStored(item, c, extra = {}) {
  return {
    key: item.key,
    card_id: item.card_id,
    ord: item.ord,
    due: new Date(c.due).toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    learning_steps: c.learning_steps ?? 0,
    state: c.state,
    last_review: c.last_review ? new Date(c.last_review).toISOString() : null,
    suspenso: !!extra.suspenso,
    leech: !!extra.leech
  };
}

export function toFsrsCard(st) {
  return {
    due: new Date(st.due),
    stability: Number(st.stability) || 0,
    difficulty: Number(st.difficulty) || 0,
    elapsed_days: Number(st.elapsed_days) || 0,
    scheduled_days: Number(st.scheduled_days) || 0,
    reps: Number(st.reps) || 0,
    lapses: Number(st.lapses) || 0,
    learning_steps: Number(st.learning_steps) || 0,
    state: Number(st.state) || 0,
    last_review: st.last_review ? new Date(st.last_review) : undefined
  };
}

/* Próximo intervalo previsto em cada botão (ms a partir de agora) */
export function previewIntervals(sched, st, now = new Date()) {
  const rec = sched.repeat(toFsrsCard(st), now);
  const out = {};
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    out[g] = new Date(rec[g].card.due).getTime() - now.getTime();
  }
  return out;
}

/* Responde um item. Devolve o novo estado salvo e o registro do revlog. */
export function answer(sched, item, st, rating, now = new Date(), limiarLeech = 8) {
  const rec = sched.next(toFsrsCard(st), now, rating);
  const next = toStored(item, rec.card, { suspenso: st.suspenso, leech: st.leech });
  const leech = isLeechEvent(st, next, limiarLeech);
  if (leech) { next.leech = true; next.suspenso = true; }
  const log = {
    card_id: item.card_id,
    ord: item.ord,
    rating,
    state: rec.log.state,
    due: new Date(rec.log.due).toISOString(),
    stability: rec.log.stability,
    difficulty: rec.log.difficulty,
    elapsed_days: rec.log.elapsed_days,
    last_elapsed_days: rec.log.last_elapsed_days,
    scheduled_days: rec.log.scheduled_days,
    review: now.toISOString()
  };
  return { state: next, log, leech };
}

/* Leech: ao atingir o limiar de lapsos e, se continuar falhando, a cada metade
   do limiar (8, 12, 16...), como no Anki */
export function isLeechEvent(prev, next, limiar = 8) {
  if (!(next.lapses > (prev.lapses || 0))) return false;
  if (next.lapses < limiar) return false;
  const passo = Math.max(1, Math.ceil(limiar / 2));
  return (next.lapses - limiar) % passo === 0;
}

/* ---------- Montagem da fila do dia ---------- */
export function matchesFilter(card, f) {
  if (!f) return true;
  if (f.sistemas?.length && !f.sistemas.includes(card.sistema)) return false;
  if (f.disciplinas?.length && !f.disciplinas.includes(card.disciplina)) return false;
  if (f.baralhos?.length && !f.baralhos.includes(card.baralho)) return false;
  if (f.tags?.length && !f.tags.some((t) => card.tags.includes(t))) return false;
  if (f.rendimento && card.rendimento !== f.rendimento) return false;
  return true;
}

/* Intercala por sistema: alterna os grupos em rodízio, para que dois cards
   seguidos raramente sejam do mesmo sistema */
export function interleaveBy(items, keyFn, random = Math.random) {
  const grupos = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(it);
  }
  const filas = shuffle([...grupos.values()], random);
  const out = [];
  let resta = items.length;
  while (resta) {
    for (const f of filas) {
      if (f.length) { out.push(f.shift()); resta--; }
    }
  }
  return out;
}

/* Espalha os novos entre as revisões, de modo uniforme */
export function mixEvenly(revisoes, novos) {
  if (!novos.length) return revisoes.slice();
  if (!revisoes.length) return novos.slice();
  const out = [];
  const passo = (revisoes.length + novos.length) / novos.length;
  let iN = 0;
  let iR = 0;
  for (let pos = 0; pos < revisoes.length + novos.length; pos++) {
    const alvoNovo = Math.floor(iN * passo + passo / 2);
    if (iN < novos.length && pos >= alvoNovo) out.push(novos[iN++]);
    else if (iR < revisoes.length) out.push(revisoes[iR++]);
    else out.push(novos[iN++]);
  }
  return out;
}

/*
  Monta a fila do dia.
  cards: cards visíveis; states: Map key -> estado; revlogHoje: registros de hoje;
  modo: "agenda" (padrão) ou "treino" (não altera a agenda).
*/
export function buildQueue({ cards, states, revlogHoje = [], settings = {}, userId, now = new Date(), filtro = null, modo = "agenda", random = Math.random, limiteTreino = 50 }) {
  const s = mergeSettings(settings);
  const fimDia = dayEnd(now);
  const limiteAprender = new Date(now.getTime() + APRENDER_ANTES_MIN * 60000);
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const elegiveis = cards.filter((c) => isStudyable(c, userId) && matchesFilter(c, filtro));

  if (modo === "treino") {
    const itens = [];
    for (const c of elegiveis) {
      for (const it of itemsOf(c)) {
        const st = states.get(it.key);
        if (st?.suspenso) continue;
        itens.push({ ...it, tipo: st && st.state !== State.New ? "revisao" : "novo", sistema: c.sistema });
      }
    }
    const fila = interleaveBy(shuffle(itens, random), (i) => i.sistema, random).slice(0, limiteTreino);
    return { fila, aprendendo: [], contagem: contar(fila, []), atraso: 0, novosRestantesHoje: 0, cardMap };
  }

  const tocadosHoje = new Set(revlogHoje.map((r) => r.card_id));
  const novosHoje = new Set(revlogHoje.filter((r) => r.state === State.New).map((r) => r.card_id + "#" + r.ord)).size;
  const revisoesHoje = revlogHoje.filter((r) => r.state === State.Review).length;
  const liberados = Array.isArray(s.sistemasLiberados) ? new Set(s.sistemasLiberados) : null;

  const aprendendo = [];
  const revisoes = [];
  const novos = [];
  for (const c of elegiveis) {
    for (const it of itemsOf(c)) {
      const st = states.get(it.key);
      if (st?.suspenso) continue;
      const base = { ...it, sistema: c.sistema, rendimento: c.rendimento };
      if (!st || st.state === State.New) {
        if (liberados && !liberados.has(c.sistema)) continue;
        novos.push({ ...base, tipo: "novo" });
      } else if (st.state === State.Learning || st.state === State.Relearning) {
        const due = new Date(st.due);
        if (due < fimDia) aprendendo.push({ ...base, tipo: "aprendendo", due: due.getTime() });
      } else if (new Date(st.due) < fimDia) {
        revisoes.push({ ...base, tipo: "revisao", due: new Date(st.due).getTime() });
      }
    }
  }

  /* irmãos: um item por nota por dia; notas já vistas hoje ficam para amanhã */
  const usados = new Set();
  const pegar = (lista) => lista.filter((it) => {
    if (!s.ocultarIrmaos) return true;
    if (usados.has(it.card_id) || tocadosHoje.has(it.card_id)) return false;
    usados.add(it.card_id);
    return true;
  });
  for (const it of aprendendo) usados.add(it.card_id);

  /* revisões: as mais atrasadas primeiro decidem quem entra no limite; depois intercala */
  const revOrdenadas = pegar(revisoes.sort((a, b) => a.due - b.due));
  const vagasRev = Math.max(0, s.revisoesPorDia - revisoesHoje);
  const revDoDia = revOrdenadas.slice(0, vagasRev);
  const atraso = revOrdenadas.length - revDoDia.length;

  /* com revisões atrasadas além do limite, os novos são os primeiros a sair */
  const vagasNovos = atraso > 0 ? 0 : Math.max(0, s.novosPorDia - novosHoje);
  let candidatos = novos;
  if (s.ordemNovos === "aleatoria") candidatos = shuffle(novos, random);
  else {
    const alto = novos.filter((n) => n.rendimento === "alto");
    const medio = novos.filter((n) => n.rendimento !== "alto");
    candidatos = [...interleaveBy(alto, (i) => i.sistema, random), ...interleaveBy(medio, (i) => i.sistema, random)];
  }
  const novosDoDia = pegar(candidatos).slice(0, Math.max(0, vagasNovos));

  const revMisturadas = interleaveBy(shuffle(revDoDia, random), (i) => i.sistema, random);
  const novosMisturados = s.ordemNovos === "aleatoria" ? novosDoDia : interleaveBy(novosDoDia, (i) => i.sistema, random);
  const fila = mixEvenly(revMisturadas, novosMisturados);
  aprendendo.sort((a, b) => a.due - b.due);
  return {
    fila,
    aprendendo,
    contagem: contar(fila, aprendendo),
    atraso,
    novosRestantesHoje: Math.max(0, s.novosPorDia - novosHoje - novosDoDia.length),
    limiteAprender,
    cardMap
  };
}

export function contar(fila, aprendendo) {
  const c = { novo: 0, aprendendo: aprendendo.length, revisao: 0 };
  for (const it of fila) {
    if (it.tipo === "novo") c.novo++;
    else if (it.tipo === "aprendendo") c.aprendendo++;
    else c.revisao++;
  }
  return c;
}

/* ---------- Sessão de estudo ---------- */
export class Session {
  constructor({ fila, aprendendo = [], sched, getState, modo = "agenda", limiarLeech = 8 }) {
    this.fila = fila.slice();
    this.aprendendo = aprendendo.slice();
    this.sched = sched;
    this.getState = getState;
    this.modo = modo;
    this.limiarLeech = limiarLeech;
    this.feitos = 0;
    this.total = fila.length + aprendendo.length;
    this.atual = null;
    this.desfazer = [];
    this.estadosTreino = new Map();
  }

  restantes() { return contar(this.fila, this.aprendendo); }

  /* Escolhe o próximo item. Pode devolver { espera: Date } se só restarem
     cards em aprendizagem que vencem mais tarde hoje. */
  next(now = new Date()) {
    const t = now.getTime();
    this.aprendendo.sort((a, b) => a.due - b.due);
    if (this.aprendendo.length && this.aprendendo[0].due <= t) this.atual = this.aprendendo.shift();
    else if (this.fila.length) this.atual = this.fila.shift();
    else if (this.aprendendo.length && this.aprendendo[0].due <= t + APRENDER_ANTES_MIN * 60000) this.atual = this.aprendendo.shift();
    else if (this.aprendendo.length) { this.atual = null; return { espera: new Date(this.aprendendo[0].due) }; }
    else { this.atual = null; return null; }
    return this.atual;
  }

  stateOf(item, now = new Date()) {
    if (this.modo === "treino" && this.estadosTreino.has(item.key)) return this.estadosTreino.get(item.key);
    return this.getState(item.key) || newState(item, now);
  }

  preview(now = new Date()) {
    if (!this.atual) return null;
    return previewIntervals(this.sched, this.stateOf(this.atual, now), now);
  }

  /* Registra a resposta. No modo treino o resultado só vale dentro da sessão. */
  answer(rating, now = new Date()) {
    const item = this.atual;
    if (!item) throw new Error("Nenhum card em exibição.");
    const anterior = this.stateOf(item, now);
    const snap = { item, anterior, fila: this.fila.slice(), aprendendo: this.aprendendo.slice(), feitos: this.feitos, total: this.total };
    const res = answer(this.sched, item, anterior, rating, now, this.limiarLeech);
    if (this.modo === "treino") {
      this.estadosTreino.set(item.key, res.state);
      if (rating === Rating.Again) this.fila.splice(Math.min(this.fila.length, 3), 0, { ...item, tipo: "aprendendo" });
    } else if (!res.leech && (res.state.state === State.Learning || res.state.state === State.Relearning)) {
      const due = new Date(res.state.due).getTime();
      if (due < dayEnd(now).getTime()) this.aprendendo.push({ ...item, tipo: "aprendendo", due });
    }
    this.feitos++;
    this.total = this.feitos + this.fila.length + this.aprendendo.length;
    this.desfazer.push(snap);
    if (this.desfazer.length > 20) this.desfazer.shift();
    this.atual = null;
    return { ...res, anterior, item };
  }

  canUndo() { return this.desfazer.length > 0; }

  /* Volta à situação anterior à última resposta e devolve o item e o estado
     que precisam ser restaurados no armazenamento */
  undo() {
    const snap = this.desfazer.pop();
    if (!snap) return null;
    this.fila = snap.fila;
    this.aprendendo = snap.aprendendo;
    this.feitos = snap.feitos;
    this.total = snap.total;
    if (this.modo === "treino") this.estadosTreino.delete(snap.item.key);
    this.atual = snap.item;
    return snap;
  }
}

/* ---------- Simulação de carga ----------
   Estima quantas revisões por dia um ritmo de cards novos gera, com a
   retenção desejada escolhida. Cada revisão é lembrada com a probabilidade
   prevista pelo próprio FSRS; quem esquece aperta Errei e quem lembra, Bom. */
export function simulateWorkload({ retencao = 0.9, novosPorDia = 20, dias = 365, janela = 30, semente = 7, parametros = "", intervaloMaximo = 36500, amostra = 8 } = {}) {
  /* a carga cresce de forma linear com o número de novos por dia: simula uma
     amostra menor e multiplica, para caber em poucos milissegundos */
  const base = Math.max(1, Math.min(novosPorDia, amostra));
  const escala = novosPorDia / base;
  if (novosPorDia <= 0) return { revisoesPorDia: 0, porDia: new Array(dias).fill(0) };
  const sched = makeScheduler({ retencao, fuzz: false, parametros, intervaloMaximo });
  const random = rng(semente);
  const DIA = 86400000;
  const inicio = new Date(Date.UTC(2026, 0, 5, 12));
  let cards = [];
  const porDia = new Array(dias).fill(0);
  for (let d = 0; d < dias; d++) {
    const hoje = new Date(inicio.getTime() + d * DIA);
    for (let i = 0; i < base; i++) cards.push(createEmptyCard(hoje));
    for (let k = 0; k < cards.length; k++) {
      let c = cards[k];
      let guarda = 0;
      let t = hoje;
      while (new Date(c.due).getTime() <= hoje.getTime() + DIA - 1 && guarda++ < 8) {
        const quando = new Date(Math.max(t.getTime(), new Date(c.due).getTime()));
        let grade = Rating.Good;
        if (c.state === State.Review) {
          const r = sched.get_retrievability(c, quando, false);
          grade = random() < r ? Rating.Good : Rating.Again;
          porDia[d]++;
        } else if (c.state !== State.New) {
          porDia[d]++;
        }
        c = sched.next(c, quando, grade).card;
        t = quando;
      }
      cards[k] = c;
    }
  }
  const escalado = porDia.map((n) => n * escala);
  const ult = escalado.slice(-janela);
  return { revisoesPorDia: Math.round(ult.reduce((a, b) => a + b, 0) / ult.length), porDia: escalado };
}

/* Retenção prevista hoje (retrievability) de um estado salvo */
export function retrievability(sched, st, now = new Date()) {
  if (!st || st.state === State.New) return null;
  return sched.get_retrievability(toFsrsCard(st), now, false);
}

export { dayStart, dayEnd };
