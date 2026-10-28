import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FORMATO_OFICIAL, SIMULADO_30, cotasProporcionais, sortearQuestoes, corrigirTentativa, validarTentativa, desempenhoPorArea, ritmo
} from "../js/simulado.js";

const ler = (arq) => JSON.parse(readFileSync(new URL("../../simulado/data/" + arq, import.meta.url)));
const B1 = ler("step1-questoes.json");
const B2 = ler("step2ck-questoes.json");
const contar = (qs, campo) => qs.reduce((m, q) => ((m[q[campo]] = (m[q[campo]] || 0) + 1), m), {});

test("formato: um bloco oficial de 30 minutos tem 20 questões nos dois Steps, 90 s cada", () => {
  for (const s of ["step1", "step2ck"]) {
    assert.equal(FORMATO_OFICIAL[s].minutos_por_bloco, 30);
    assert.equal(FORMATO_OFICIAL[s].questoes_por_bloco, SIMULADO_30.questoes);
  }
  assert.equal(FORMATO_OFICIAL.step1.blocos, 14);
  assert.equal(FORMATO_OFICIAL.step1.questoes_max, 280);
  assert.equal(FORMATO_OFICIAL.step2ck.blocos, 16);
  assert.equal(FORMATO_OFICIAL.step2ck.questoes_max, 318);
  assert.equal(SIMULADO_30.questoes * SIMULADO_30.ritmo_ms, SIMULADO_30.duracao_ms);
});

test("cotas pelo maior resto somam n e respeitam o disponível", () => {
  const c = cotasProporcionais({ a: 5, b: 5, c: 1 }, { a: 5, b: 5, c: 1 }, 6);
  assert.equal(Object.values(c).reduce((x, y) => x + y, 0), 6);
  assert.deepEqual(c, { a: 3, b: 3, c: 0 });
  const d = cotasProporcionais({ a: 10, b: 1 }, { a: 2, b: 30 }, 10);
  assert.deepEqual(d, { a: 2, b: 8 }, "grupo esgotado repassa as vagas");
  assert.equal(Object.values(cotasProporcionais({ a: 1 }, { a: 3 }, 20)).reduce((x, y) => x + y, 0), 3);
});

test("sorteio estratificado: 20 questões únicas, cada sistema perto da proporção do banco", () => {
  for (const [banco, n] of [[B1, 20], [B2, 20]]) {
    const qs = sortearQuestoes(banco, { n, semente: 7 });
    assert.equal(qs.length, n);
    assert.equal(new Set(qs.map((q) => q.id)).size, n);
    const noBanco = contar(banco, "sistema");
    const sorteadas = contar(qs, "sistema");
    for (const [k, v] of Object.entries(noBanco)) {
      const ideal = (v / banco.length) * n;
      const got = sorteadas[k] || 0;
      assert.ok(got >= Math.floor(ideal) && got <= Math.ceil(ideal), k + ": " + got + " para ideal " + ideal);
    }
  }
});

test("sorteio é reprodutível com a mesma semente e muda com outra", () => {
  const a = sortearQuestoes(B1, { semente: 42 }).map((q) => q.id);
  const b = sortearQuestoes(B1, { semente: 42 }).map((q) => q.id);
  const c = sortearQuestoes(B1, { semente: 43 }).map((q) => q.id);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("sorteio prefere questões ainda não vistas dentro de cada estrato", () => {
  const primeira = sortearQuestoes(B1, { semente: 1 });
  const vistas = primeira.map((q) => q.id);
  const segunda = sortearQuestoes(B1, { semente: 2, vistas });
  const repetidas = segunda.filter((q) => vistas.includes(q.id));
  /* com 40 questões e 20 vistas, só repete onde o estrato não tem não vistas suficientes */
  const naoVistasPorSistema = contar(B1.filter((q) => !vistas.includes(q.id)), "sistema");
  const segundaPorSistema = contar(segunda, "sistema");
  const minimoRepetido = Object.entries(segundaPorSistema).reduce((s, [k, v]) => s + Math.max(0, v - (naoVistasPorSistema[k] || 0)), 0);
  assert.equal(repetidas.length, minimoRepetido);
});

test("sorteio com pesos informados prioriza os estratos com peso e completa até n", () => {
  const qs = sortearQuestoes(B1, { semente: 3, pesos: { cardiovascular: 1, gastrointestinal: 1 } });
  assert.equal(qs.length, 20);
  const alvo = B1.filter((q) => ["cardiovascular", "gastrointestinal"].includes(q.sistema)).map((q) => q.id);
  assert.equal(alvo.length, 7);
  assert.ok(alvo.every((id) => qs.some((q) => q.id === id)), "as 4 + 3 questões com peso entram todas");
});

test("correção conta acertos, brancos e acerto por sistema e disciplina", () => {
  const qs = B1.slice(0, 4);
  const respostas = [qs[0].correta, "Z", null, qs[3].correta.toLowerCase()];
  const t = corrigirTentativa({
    step: "step1", questoes: qs, respostas, marcadas: [true], tempos_ms: [60000, 100000, 0, 80000],
    inicio: "2026-10-28T10:00:00.000Z", fim: "2026-10-28T10:04:00.000Z"
  });
  assert.equal(t.total, 4);
  assert.equal(t.acertos, 2);
  assert.equal(t.em_branco, 1);
  assert.equal(t.percentual, 0.5);
  assert.equal(t.duracao_ms, 240000);
  assert.deepEqual(t.marcadas, [true, false, false, false]);
  assert.deepEqual(t.respostas, [qs[0].correta, "Z", null, qs[3].correta]);
  const soma = Object.values(t.por_sistema).reduce((s, v) => s + v.total, 0);
  assert.equal(soma, 4);
  assert.equal(Object.values(t.por_disciplina).reduce((s, v) => s + v.acertos, 0), 2);
  assert.deepEqual(validarTentativa(t), []);
  assert.equal(ritmo(t).acima_do_ritmo, 1 / 3);
});

test("validação recusa tentativas incoerentes", () => {
  const ok = corrigirTentativa({ step: "step1", questoes: B1.slice(0, 2), respostas: ["A", "B"], inicio: "2026-10-28T10:00:00Z", fim: "2026-10-28T10:01:00Z" });
  assert.deepEqual(validarTentativa(ok), []);
  assert.ok(validarTentativa({ ...ok, step: "step3" }).length);
  assert.ok(validarTentativa({ ...ok, acertos: 3 }).length);
  assert.ok(validarTentativa({ ...ok, respostas: ["A"] }).length);
  assert.ok(validarTentativa({ ...ok, fim: "2026-10-28T09:00:00Z" }).length);
  assert.ok(validarTentativa(null).length);
});

test("desempenho por área soma tentativas e ordena da pior para a melhor", () => {
  const r = desempenhoPorArea([
    { por_sistema: { cardiovascular: { total: 2, acertos: 2 }, gastrointestinal: { total: 2, acertos: 0 } } },
    { por_sistema: { cardiovascular: { total: 2, acertos: 1 } } }
  ]);
  assert.equal(r[0].chave, "gastrointestinal");
  assert.equal(r[1].total, 4);
  assert.equal(r[1].taxa, 0.75);
});
