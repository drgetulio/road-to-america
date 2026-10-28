import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeScheduler, newState, answer, previewIntervals, isLeechEvent, buildQueue, Session, Rating, State,
  mergeSettings, parseStep, stepsFromText, parseParams, simulateWorkload, interleaveBy, mixEvenly, DEFAULTS
} from "../js/scheduler.js";
import { rng } from "../js/util.js";

const AGORA = new Date(2026, 9, 28, 10, 0, 0);
const item = { key: "c1#1", card_id: "c1", ord: 1 };

test("padrões seguem o Anki com FSRS", () => {
  assert.equal(DEFAULTS.retencao, 0.9);
  assert.deepEqual(DEFAULTS.passosAprendizagem, ["1m", "10m"]);
  assert.deepEqual(DEFAULTS.passosReaprendizagem, ["10m"]);
  assert.equal(DEFAULTS.novosPorDia, 20);
  assert.equal(DEFAULTS.limiarLeech, 8);
  assert.equal(DEFAULTS.fuzz, true);
  const s = makeScheduler({});
  assert.equal(s.parameters.request_retention, 0.9);
  assert.equal(s.parameters.enable_fuzz, true);
  assert.equal(s.parameters.w.length, 21);
  assert.equal(s.parameters.w[20], 0.1542);
});

test("retenção fica entre 0,80 e 0,97 e passos não chegam a 1 dia", () => {
  assert.equal(mergeSettings({ retencao: 0.99 }).retencao, 0.97);
  assert.equal(mergeSettings({ retencao: 0.5 }).retencao, 0.8);
  assert.equal(parseStep("10m"), 10);
  assert.equal(parseStep("2h"), 120);
  assert.equal(parseStep("1d"), null);
  assert.equal(parseStep("24h"), null);
  assert.equal(stepsFromText("1m 1d"), null);
  assert.deepEqual(stepsFromText("1m, 10m"), ["1m", "10m"]);
  assert.deepEqual(mergeSettings({ passosAprendizagem: ["2d"] }).passosAprendizagem, ["1m", "10m"]);
});

test("parâmetros colados do Anki são aceitos com 21 números", () => {
  const w = "0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542";
  assert.equal(parseParams(w).length, 21);
  assert.equal(parseParams("1, 2, 3"), null);
});

test("card novo: Errei 1 min, Bom 10 min, depois vai para revisão", () => {
  const s = makeScheduler({ fuzz: false });
  const st0 = newState(item, AGORA);
  const p = previewIntervals(s, st0, AGORA);
  assert.equal(p[Rating.Again], 60000);
  assert.equal(p[Rating.Good], 600000);
  assert.ok(p[Rating.Again] < p[Rating.Hard] && p[Rating.Hard] < p[Rating.Good] && p[Rating.Good] < p[Rating.Easy]);
  const r1 = answer(s, item, st0, Rating.Good, AGORA);
  assert.equal(r1.state.state, State.Learning);
  assert.equal(r1.log.state, State.New);
  const t2 = new Date(AGORA.getTime() + 10 * 60000);
  const r2 = answer(s, item, r1.state, Rating.Good, t2);
  assert.equal(r2.state.state, State.Review);
  assert.ok(r2.state.scheduled_days >= 1);
});

test("lapso leva à reaprendizagem de 10 min", () => {
  const s = makeScheduler({ fuzz: false });
  let st = newState(item, AGORA);
  st = answer(s, item, st, Rating.Easy, AGORA).state;
  const depois = new Date(st.due);
  const r = answer(s, item, st, Rating.Again, depois);
  assert.equal(r.state.state, State.Relearning);
  assert.equal(r.state.lapses, 1);
  assert.equal(new Date(r.state.due) - depois, 600000);
});

test("leech no 8º lapso e de novo a cada 4", () => {
  const ev = (a, b) => isLeechEvent({ lapses: a }, { lapses: b }, 8);
  assert.equal(ev(6, 7), false);
  assert.equal(ev(7, 8), true);
  assert.equal(ev(8, 9), false);
  assert.equal(ev(11, 12), true);
  assert.equal(ev(15, 16), true);
  assert.equal(ev(8, 8), false);
});

test("answer suspende e marca o leech", () => {
  const s = makeScheduler({ fuzz: false });
  const st = { ...newState(item, AGORA), state: State.Review, stability: 3, difficulty: 7, reps: 20, lapses: 7, last_review: new Date(AGORA - 5 * 864e5).toISOString(), scheduled_days: 5, due: AGORA.toISOString() };
  const r = answer(s, item, st, Rating.Again, AGORA, 8);
  assert.equal(r.leech, true);
  assert.equal(r.state.suspenso, true);
  assert.equal(r.state.leech, true);
});

/* ---------- Fila do dia ---------- */
function baralho(n, sistemas = ["cardiovascular", "gastrointestinal", "respiratorio_renal"]) {
  return Array.from({ length: n }, (_, i) => ({
    id: "c" + i, tipo: "basico", frente: "Q" + i, verso: "A", sistema: sistemas[i % sistemas.length], disciplina: "patologia",
    tags: i % 2 ? ["par"] : [], rendimento: i % 4 === 0 ? "medio" : "alto", status: "aprovado", baralho: "oficial", autor_id: "r2a"
  }));
}
const fila = (cards, extra = {}) => buildQueue({ cards, states: new Map(), userId: "u1", now: AGORA, random: rng(1), ...extra });

test("limita os novos ao valor diário e conta os já feitos hoje", () => {
  const cards = baralho(60);
  assert.equal(fila(cards).fila.length, 20);
  const revlogHoje = [{ card_id: "c50", ord: 1, state: State.New }, { card_id: "c51", ord: 1, state: State.New }];
  const q = fila(cards, { revlogHoje });
  assert.equal(q.fila.length, 18);
  assert.ok(!q.fila.some((i) => i.card_id === "c50"), "nota vista hoje fica oculta");
});

test("alto rendimento entra antes do médio", () => {
  const q = fila(baralho(60), { settings: { novosPorDia: 10 } });
  assert.ok(q.fila.every((i) => i.rendimento === "alto"));
});

test("intercala sistemas: dois seguidos do mesmo sistema não acontecem quando há alternativa", () => {
  const q = fila(baralho(30), { settings: { novosPorDia: 18 } });
  for (let i = 1; i < q.fila.length; i++) assert.notEqual(q.fila[i].sistema, q.fila[i - 1].sistema);
});

test("oculta irmãos de cloze: uma lacuna por nota por dia", () => {
  const cards = [{ id: "z", tipo: "cloze", frente: "{{c1::a}} {{c2::b}} {{c3::c}}", verso: "", sistema: "geral", disciplina: "patologia", tags: [], rendimento: "alto", status: "aprovado", baralho: "oficial" }];
  assert.equal(fila(cards).fila.length, 1);
  assert.equal(fila(cards, { settings: { ocultarIrmaos: false } }).fila.length, 3);
});

test("revisões vencidas entram; atraso acima do limite pausa os novos", () => {
  const cards = baralho(40);
  const states = new Map();
  for (let i = 0; i < 30; i++) states.set("c" + i + "#1", { key: "c" + i + "#1", card_id: "c" + i, ord: 1, state: State.Review, due: new Date(AGORA - 864e5).toISOString(), scheduled_days: 3, lapses: 0 });
  const q1 = fila(cards, { states, settings: { revisoesPorDia: 200 } });
  assert.equal(q1.contagem.revisao, 30);
  assert.equal(q1.contagem.novo, 10);
  const q2 = fila(cards, { states, settings: { revisoesPorDia: 25 } });
  assert.equal(q2.contagem.revisao, 25);
  assert.equal(q2.atraso, 5);
  assert.equal(q2.contagem.novo, 0);
});

test("suspensos, rejeitados e pessoais de outros ficam fora", () => {
  const cards = baralho(3);
  cards.push({ ...cards[0], id: "p1", baralho: "pessoal", status: "rascunho", autor_id: "outro" });
  cards.push({ ...cards[0], id: "p2", baralho: "pessoal", status: "rascunho", autor_id: "u1" });
  cards.push({ ...cards[0], id: "r1", baralho: "comunidade", status: "em_revisao", autor_id: "u1" });
  const states = new Map([["c0#1", { key: "c0#1", state: State.New, suspenso: true }]]);
  const ids = fila(cards, { states }).fila.map((i) => i.card_id).sort();
  assert.deepEqual(ids, ["c1", "c2", "p2"]);
});

test("filtro por sistema e tag; sistemas não liberados não trazem novos", () => {
  const cards = baralho(30);
  const q = fila(cards, { filtro: { sistemas: ["cardiovascular"], tags: ["par"] } });
  assert.ok(q.fila.length > 0 && q.fila.every((i) => i.sistema === "cardiovascular" && Number(i.card_id.slice(1)) % 2 === 1));
  const q2 = fila(cards, { settings: { sistemasLiberados: ["gastrointestinal"] } });
  assert.ok(q2.fila.every((i) => i.sistema === "gastrointestinal"));
});

test("treino livre não depende do vencimento", () => {
  const cards = baralho(12);
  const states = new Map(cards.map((c) => [c.id + "#1", { key: c.id + "#1", state: State.Review, due: new Date(AGORA.getTime() + 30 * 864e5).toISOString() }]));
  assert.equal(fila(cards, { states }).fila.length, 0);
  assert.equal(fila(cards, { states, modo: "treino", limiteTreino: 5 }).fila.length, 5);
});

test("mistura novos entre revisões de modo uniforme", () => {
  const out = mixEvenly(["r", "r", "r", "r", "r", "r"], ["n", "n"]);
  assert.equal(out.length, 8);
  assert.notEqual(out[0], "n");
  assert.ok(out.indexOf("n") < 4 && out.lastIndexOf("n") >= 4);
  assert.equal(interleaveBy([1, 2, 3, 4], (x) => x % 2, rng(2)).length, 4);
});

/* ---------- Sessão ---------- */
test("sessão: card em aprendizagem volta, desfazer restaura", () => {
  const cards = baralho(2);
  const q = fila(cards);
  const estados = new Map();
  const sessao = new Session({ fila: q.fila, aprendendo: q.aprendendo, sched: makeScheduler({ fuzz: false }), getState: (k) => estados.get(k) });
  const a = sessao.next(AGORA);
  const r = sessao.answer(Rating.Again, AGORA);
  estados.set(a.key, r.state);
  assert.equal(sessao.aprendendo.length, 1);
  assert.equal(sessao.feitos, 1);
  const b = sessao.next(AGORA);
  assert.notEqual(b.key, a.key, "o outro card vem antes do que está em 1 min");
  sessao.answer(Rating.Good, AGORA);
  const c = sessao.next(AGORA);
  assert.equal(c.key, a.key, "aprender antes do prazo quando a fila acaba");
  const snap = (sessao.answer(Rating.Good, AGORA), sessao.undo());
  assert.equal(snap.item.key, a.key);
  assert.equal(sessao.feitos, 2);
  assert.equal(sessao.atual.key, a.key);
});

test("sessão em treino não chama o armazenamento e repete o errado", () => {
  const q = fila(baralho(3), { modo: "treino" });
  let chamadas = 0;
  const sessao = new Session({ fila: q.fila, sched: makeScheduler({}), getState: () => { chamadas++; return null; }, modo: "treino" });
  const a = sessao.next(AGORA);
  sessao.answer(Rating.Again, AGORA);
  assert.ok(sessao.fila.some((i) => i.key === a.key));
  assert.ok(chamadas <= 2);
});

test("simulação: retenção maior custa mais revisões", () => {
  const a = simulateWorkload({ retencao: 0.85, novosPorDia: 10, dias: 120 }).revisoesPorDia;
  const b = simulateWorkload({ retencao: 0.9, novosPorDia: 10, dias: 120 }).revisoesPorDia;
  const c = simulateWorkload({ retencao: 0.97, novosPorDia: 10, dias: 120 }).revisoesPorDia;
  assert.ok(a < b && b < c, [a, b, c].join(" "));
  assert.equal(simulateWorkload({ novosPorDia: 0 }).revisoesPorDia, 0);
});
