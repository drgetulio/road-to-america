import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  criarSessao, irPara, proxima, anterior, responder, alternarMarca, alternarRiscada, definirNota,
  tempoRestante, expirou, encerrar, paraTentativa, restaurarSessao, avisoPendente, contagem, listaRevisao, sortearBloco
} from "../js/sessao.js";
import { SIMULADO_30, validarTentativa } from "../../plataforma/js/simulado.js";
import { idsDaUltima } from "../js/resultado.js";

const ler = (arq) => JSON.parse(readFileSync(new URL("../data/" + arq, import.meta.url)));
const B1 = ler("step1-questoes.json");
const B2 = ler("step2ck-questoes.json");
const porId = (banco) => new Map(banco.map((q) => [q.id, q]));
const contar = (qs, campo) => qs.reduce((m, q) => ((m[q[campo]] = (m[q[campo]] || 0) + 1), m), {});
const T0 = Date.parse("2026-10-28T12:00:00Z");
const SEG = 1000;

test("sorteio do bloco: 20 questões únicas, estratificadas pelo sistema (Step 1) e pela área (Step 2 CK)", () => {
  for (const banco of [B1, B2]) {
    const qs = sortearBloco({ banco, semente: 11 });
    assert.equal(qs.length, SIMULADO_30.questoes);
    assert.equal(new Set(qs.map((q) => q.id)).size, 20);
    const noBanco = contar(banco, "sistema");
    const noBloco = contar(qs, "sistema");
    for (const [k, v] of Object.entries(noBanco)) {
      const esperado = (v / banco.length) * 20;
      /* cota pelo maior resto: nunca se afasta mais de 1 da proporção exata */
      assert.ok(Math.abs((noBloco[k] || 0) - esperado) < 1 + 1e-9, k + ": " + (noBloco[k] || 0) + " contra " + esperado.toFixed(2));
    }
  }
});

test("sorteio do bloco: a tentativa seguinte não repete as questões da anterior (banco de 40)", () => {
  for (const banco of [B1, B2]) {
    for (let semente = 1; semente <= 25; semente++) {
      const primeira = sortearBloco({ banco, semente });
      const segunda = sortearBloco({ banco, semente: semente + 1000, vistas: primeira.map((q) => q.id) });
      const repetidas = segunda.filter((q) => primeira.some((p) => p.id === q.id));
      assert.equal(repetidas.length, 0, "semente " + semente + " repetiu " + repetidas.map((q) => q.id));
    }
  }
});

test("sorteio do bloco: a mesma semente reproduz o mesmo bloco, e sementes diferentes variam", () => {
  const a = sortearBloco({ banco: B1, semente: 42 }).map((q) => q.id);
  const b = sortearBloco({ banco: B1, semente: 42 }).map((q) => q.id);
  const c = sortearBloco({ banco: B1, semente: 43 }).map((q) => q.id);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("idsDaUltima pega a tentativa mais recente do mesmo Step", () => {
  const h = [
    { step: "step1", fim: "2026-10-01T10:00:00Z", questoes: ["a"] },
    { step: "step2ck", fim: "2026-10-27T10:00:00Z", questoes: ["ck"] },
    { step: "step1", fim: "2026-10-20T10:00:00Z", questoes: ["b", "c"] }
  ];
  assert.deepEqual(idsDaUltima(h, "step1"), ["b", "c"]);
  assert.deepEqual(idsDaUltima(h, "step2ck"), ["ck"]);
  assert.deepEqual(idsDaUltima([], "step1"), []);
});

test("cronômetro: 30:00 regressivo pelo relógio de parede, sem pausa", () => {
  const qs = B1.slice(0, 20);
  const s = criarSessao({ step: "step1", questoes: qs, agora: T0 });
  assert.equal(tempoRestante(s, T0), 30 * 60 * SEG);
  assert.equal(tempoRestante(s, T0 + 61 * SEG), 30 * 60 * SEG - 61 * SEG);
  assert.equal(expirou(s, T0 + 30 * 60 * SEG - 1), false);
  assert.equal(expirou(s, T0 + 30 * 60 * SEG), true);
  assert.equal(tempoRestante(s, T0 + 40 * 60 * SEG), 0);
});

test("tempo por questão soma idas e voltas dentro do bloco", () => {
  const qs = B1.slice(0, 20);
  const s = criarSessao({ step: "step1", questoes: qs, agora: T0 });
  proxima(s, T0 + 50 * SEG);          // q1: 50 s
  proxima(s, T0 + 150 * SEG);         // q2: 100 s
  anterior(s, T0 + 160 * SEG);        // q3: 10 s
  irPara(s, 0, T0 + 190 * SEG);       // q2: +30 s
  encerrar(s, T0 + 200 * SEG);        // q1: +10 s
  assert.equal(s.tempos_ms[0], 60 * SEG);
  assert.equal(s.tempos_ms[1], 130 * SEG);
  assert.equal(s.tempos_ms[2], 10 * SEG);
  assert.equal(s.tempos_ms.reduce((a, b) => a + b, 0), 200 * SEG);
  assert.equal(s.encerramento, "participante");
});

test("ao zerar o relógio o bloco se encerra no limite, e o tempo não passa de 30 minutos", () => {
  const qs = B2.slice(0, 20);
  const s = criarSessao({ step: "step2ck", questoes: qs, agora: T0 });
  proxima(s, T0 + 100 * SEG);
  encerrar(s, T0 + 45 * 60 * SEG, "tempo");
  assert.equal(s.encerramento, "tempo");
  assert.equal(s.fim, T0 + SIMULADO_30.duracao_ms);
  assert.equal(s.tempos_ms.reduce((a, b) => a + b, 0), SIMULADO_30.duracao_ms);
  /* encerrar pelo participante depois do limite também conta como tempo esgotado */
  const s2 = criarSessao({ step: "step2ck", questoes: qs, agora: T0 });
  encerrar(s2, T0 + 31 * 60 * SEG, "participante");
  assert.equal(s2.encerramento, "tempo");
});

test("bloco encerrado não reabre", () => {
  const s = criarSessao({ step: "step1", questoes: B1.slice(0, 20), agora: T0 });
  encerrar(s, T0 + 10 * SEG);
  assert.throws(() => responder(s, 0, "A"), /encerrado/);
  assert.throws(() => irPara(s, 3, T0 + 20 * SEG), /encerrado/);
  assert.throws(() => alternarMarca(s, 0), /encerrado/);
});

test("marcar, riscar e anotar não mudam a resposta; riscar alterna", () => {
  const s = criarSessao({ step: "step1", questoes: B1.slice(0, 20), agora: T0 });
  responder(s, 0, "c");
  alternarRiscada(s, 0, "C");
  alternarRiscada(s, 0, "a");
  assert.equal(s.respostas[0], "C");
  assert.deepEqual(s.riscadas[0], ["A", "C"]);
  alternarRiscada(s, 0, "C");
  assert.deepEqual(s.riscadas[0], ["A"]);
  alternarMarca(s, 2);
  definirNota(s, 2, "x".repeat(3000));
  assert.equal(s.notas[2].length, 2000);
  const c = contagem(s);
  assert.deepEqual(c, { total: 20, respondidas: 1, sem_resposta: 19, marcadas: 1 });
  assert.deepEqual(listaRevisao(s, "marcadas").map((x) => x.numero), [3]);
  assert.equal(listaRevisao(s, "sem_resposta").length, 19);
  responder(s, 0, null);
  assert.equal(contagem(s).respondidas, 0);
});

test("avisos discretos aos 5 minutos e a 1 minuto, uma vez cada", () => {
  const s = criarSessao({ step: "step1", questoes: B1.slice(0, 20), agora: T0 });
  assert.equal(avisoPendente(s, T0 + 10 * 60 * SEG), null);
  assert.equal(avisoPendente(s, T0 + 25 * 60 * SEG), 5 * 60 * SEG);
  assert.equal(avisoPendente(s, T0 + 25 * 60 * SEG + 5 * SEG), null);
  assert.equal(avisoPendente(s, T0 + 29 * 60 * SEG), 60 * SEG);
  assert.equal(avisoPendente(s, T0 + 29 * 60 * SEG + 30 * SEG), null);
  /* quem volta à aba já no último minuto recebe só o aviso de 1 minuto */
  const s2 = criarSessao({ step: "step1", questoes: B1.slice(0, 20), agora: T0 });
  assert.equal(avisoPendente(s2, T0 + 29 * 60 * SEG + 10 * SEG), 60 * SEG);
  assert.equal(avisoPendente(s2, T0 + 29 * 60 * SEG + 20 * SEG), null);
});

test("paraTentativa gera um registro válido para a camada de dados", () => {
  const qs = sortearBloco({ banco: B1, semente: 5 });
  const s = criarSessao({ step: "step1", questoes: qs, agora: T0 });
  qs.forEach((q, i) => { responder(s, i, i < 15 ? q.correta : (q.correta === "A" ? "B" : "A")); proxima(s, T0 + (i + 1) * 80 * SEG); });
  responder(s, 19, null);
  encerrar(s, T0 + 27 * 60 * SEG);
  const t = paraTentativa(s, porId(B1));
  assert.deepEqual(validarTentativa(t), []);
  assert.equal(t.total, 20);
  assert.equal(t.acertos, 15);
  assert.equal(t.em_branco, 1);
  assert.equal(t.duracao_ms, 27 * 60 * SEG);
  assert.equal(t.tempos_ms.reduce((a, b) => a + b, 0), 27 * 60 * SEG);
  assert.equal(Object.values(t.por_sistema).reduce((a, b) => a + b.total, 0), 20);
  assert.equal(Object.values(t.por_disciplina).reduce((a, b) => a + b.acertos, 0), 15);
});

test("paraTentativa recusa bloco aberto ou questão que saiu do banco", () => {
  const qs = B1.slice(0, 20);
  const s = criarSessao({ step: "step1", questoes: qs, agora: T0 });
  assert.throws(() => paraTentativa(s, porId(B1)), /Encerre/);
  encerrar(s, T0 + SEG);
  const m = porId(B1); m.delete(qs[3].id);
  assert.throws(() => paraTentativa(s, m), /banco/);
});

test("restaurar sessão salva: o relógio do bloco continua, o tempo fora da página não vai para a questão", () => {
  const qs = B1.slice(0, 20);
  const s = criarSessao({ step: "step1", questoes: qs, agora: T0 });
  responder(s, 0, "B");
  proxima(s, T0 + 40 * SEG);
  const salvo = JSON.parse(JSON.stringify(s));
  const r = restaurarSessao(salvo, T0 + 300 * SEG);
  assert.equal(r.respostas[0], "B");
  assert.equal(tempoRestante(r, T0 + 300 * SEG), 30 * 60 * SEG - 300 * SEG);
  proxima(r, T0 + 310 * SEG);
  assert.equal(r.tempos_ms[1], 10 * SEG, "só os 10 s depois de voltar");
  assert.equal(restaurarSessao({ v: 99 }), null);
  assert.equal(restaurarSessao({ ...salvo, respostas: [] }), null);
  assert.equal(restaurarSessao(null), null);
});
