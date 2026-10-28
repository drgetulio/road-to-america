import { test } from "node:test";
import assert from "node:assert/strict";
import { retention, forecast, activity, coverage, maturity } from "../js/stats.js";
import { buildTaxonomy } from "../js/data.js";
import { readFileSync } from "node:fs";

const AGORA = new Date(2026, 9, 28, 12);
const dia = (n) => new Date(AGORA.getTime() - n * 864e5).toISOString();

test("retenção real conta só revisões de cards em revisão", () => {
  const log = [
    { state: 2, rating: 3, review: dia(1), elapsed_days: 30 },
    { state: 2, rating: 1, review: dia(2), elapsed_days: 3 },
    { state: 2, rating: 2, review: dia(3), elapsed_days: 25 },
    { state: 0, rating: 1, review: dia(1) },
    { state: 2, rating: 1, review: dia(60) }
  ];
  const r = retention(log, { dias: 30, now: AGORA });
  assert.equal(r.total, 3);
  assert.equal(r.acertos, 2);
  assert.equal(retention(log, { dias: 30, now: AGORA, maduros: true }).total, 2);
});

test("previsão soma atrasados no dia 0", () => {
  const f = forecast([{ state: 2, due: dia(3) }, { state: 2, due: dia(-1) }, { state: 0, due: dia(0) }, { state: 2, due: dia(-2), suspenso: true }], { dias: 5, now: AGORA });
  assert.equal(f[0], 1);
  assert.equal(f[1], 1);
  assert.equal(f.reduce((a, b) => a + b), 2);
});

test("sequência de dias", () => {
  const log = [0, 1, 2, 4, 5, 6, 7].map((n) => ({ review: dia(n) }));
  const a = activity(log, { now: AGORA });
  assert.equal(a.atual, 3);
  assert.equal(a.maior, 4);
});

test("cobertura compara com a faixa do outline e agrupa nutrição em bioquímica", () => {
  const tax = buildTaxonomy(JSON.parse(readFileSync(new URL("../data/taxonomia.json", import.meta.url))));
  const cards = [
    ...Array(10).fill({ sistema: "cardiovascular", disciplina: "patologia" }),
    ...Array(1).fill({ sistema: "bioestatistica", disciplina: "nutricao" }),
    ...Array(5).fill({ sistema: "geral", disciplina: "bioquimica" })
  ].map((c, i) => ({ ...c, id: "c" + i }));
  const cov = coverage(cards, tax.sistemas, "sistema");
  const cv = cov.find((x) => x.chave === "cardiovascular");
  assert.equal(Math.round(cv.share), 91);
  assert.equal(cv.situacao, "acima");
  assert.equal(cov.find((x) => x.chave === "gastrointestinal").situacao, "abaixo");
  assert.equal(cov.find((x) => x.chave === "geral").situacao, "sem_faixa");
  const dis = coverage(cards, tax.disciplinas, "disciplina");
  assert.equal(dis.find((x) => x.chave === "bioquimica").n, 6);
  assert.ok(!dis.find((x) => x.chave === "nutricao"));
});

test("maturidade", () => {
  const its = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];
  const st = new Map([["b", { state: 2, scheduled_days: 30 }], ["c", { state: 1 }], ["d", { state: 2, scheduled_days: 4, suspenso: true, leech: true }]]);
  const m = maturity(its, st);
  assert.deepEqual([m.novos, m.aprendendo, m.maduros, m.suspensos, m.leeches], [1, 1, 1, 1, 1]);
});

test("taxonomia tem 11 sistemas com faixa e soma das faixas mínimas abaixo de 100", () => {
  const tax = buildTaxonomy(JSON.parse(readFileSync(new URL("../data/taxonomia.json", import.meta.url))));
  const comFaixa = tax.sistemas.filter((s) => s.faixa_min != null);
  assert.equal(comFaixa.length, 11);
  assert.ok(comFaixa.reduce((n, s) => n + s.faixa_min, 0) <= 100);
});
