import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corrigirTentativa, SIMULADO_30 } from "../../plataforma/js/simulado.js";
import { relogio, pct, linhasPorCampo, resumo, itensRevisao, filtrarRevisao, sistemasParaRevisar, resumoHistorico, titulosAreas } from "../js/resultado.js";
import { rotulo, linkFlashcards, aplicarTaxonomia, ROTULOS } from "../js/rotulos.js";

const ler = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const B1 = ler("../data/step1-questoes.json");
const B2 = ler("../data/step2ck-questoes.json");
const TAX = ler("../../anki/data/taxonomia.json");
const porId = (b) => new Map(b.map((q) => [q.id, q]));
const outra = (q) => (q.correta === "A" ? "B" : "A");

function tentativa(banco, step, acertarAte, { branco = [], tempos = null, duracao = 25 * 60 * 1000 } = {}) {
  const questoes = banco.slice(0, 20);
  const respostas = questoes.map((q, i) => (branco.includes(i) ? null : i < acertarAte ? q.correta : outra(q)));
  const ini = Date.parse("2026-10-28T12:00:00Z");
  return corrigirTentativa({
    step, questoes, respostas,
    marcadas: questoes.map((_, i) => i % 5 === 0),
    tempos_ms: tempos || questoes.map(() => duracao / 20),
    inicio: new Date(ini).toISOString(), fim: new Date(ini + duracao).toISOString()
  });
}

test("relogio e pct formatam em português", () => {
  assert.equal(relogio(30 * 60 * 1000), "30:00");
  assert.equal(relogio(61 * 1000), "01:01");
  assert.equal(relogio(3725 * 1000), "1:02:05");
  assert.equal(relogio(-5), "00:00");
  assert.equal(pct(0.705, 1), "70,5%");
  assert.equal(pct(null), "sem dados");
});

test("resumo: acertos, erros, em branco e tempo médio do bloco contra os 90 s", () => {
  const t = tentativa(B1, "step1", 12, { branco: [19] });
  const r = resumo(t);
  assert.equal(r.acertos, 12);
  assert.equal(r.erros, 7);
  assert.equal(r.em_branco, 1);
  assert.equal(r.marcadas, 4);
  assert.equal(r.medio_bloco_ms, 75 * 1000);
  assert.equal(r.dentro_do_ritmo, true);
  assert.equal(r.ritmo_ms, SIMULADO_30.ritmo_ms);
  const lento = resumo(tentativa(B1, "step1", 10, { tempos: B1.slice(0, 20).map((_, i) => (i < 5 ? 150000 : 60000)), duracao: 30 * 60 * 1000 }));
  assert.equal(lento.acima_do_ritmo, 5);
});

test("linhas por sistema e disciplina somam o total e vêm com rótulo em português", () => {
  aplicarTaxonomia(TAX);
  const t = tentativa(B1, "step1", 14);
  for (const campo of ["por_sistema", "por_disciplina", "por_dificuldade"]) {
    const linhas = linhasPorCampo(t, "step1", campo);
    assert.equal(linhas.reduce((s, l) => s + l.total, 0), 20);
    assert.equal(linhas.reduce((s, l) => s + l.acertos, 0), 14);
    for (const l of linhas) assert.ok(l.rotulo && !l.rotulo.includes("_"), l.chave + " sem rótulo");
    for (let i = 1; i < linhas.length; i++) assert.ok(linhas[i - 1].taxa <= linhas[i].taxa, "ordenado da pior para a melhor");
  }
  const ck = linhasPorCampo(tentativa(B2, "step2ck", 10), "step2ck", "por_sistema");
  for (const l of ck) assert.ok(!l.rotulo.includes("_"), l.chave);
  assert.deepEqual(titulosAreas("step2ck"), { sistema: "Área", disciplina: "Tarefa" });
  assert.deepEqual(titulosAreas("step1"), { sistema: "Sistema", disciplina: "Disciplina" });
});

test("linhas agregam várias tentativas (histórico)", () => {
  const a = tentativa(B1, "step1", 20);
  const b = tentativa(B1, "step1", 0);
  const linhas = linhasPorCampo([a, b], "step1", "por_sistema");
  assert.equal(linhas.reduce((s, l) => s + l.total, 0), 40);
  for (const l of linhas) assert.equal(l.taxa, 0.5);
});

test("todas as chaves dos dois bancos têm rótulo próprio", () => {
  aplicarTaxonomia(TAX);
  for (const [banco, step] of [[B1, "step1"], [B2, "step2ck"]]) {
    for (const q of banco) {
      assert.ok(ROTULOS[step].sistema[q.sistema], step + " sistema " + q.sistema);
      assert.ok(ROTULOS[step].disciplina[q.disciplina], step + " disciplina " + q.disciplina);
      assert.ok(["Fácil", "Média", "Difícil"].includes(rotulo(step, "dificuldade", q.dificuldade)));
    }
  }
});

test("revisão questão por questão: situação, tempo e link para os flashcards só nas erradas", () => {
  const t = tentativa(B1, "step1", 10, { branco: [15] });
  const itens = itensRevisao(t, porId(B1));
  assert.equal(itens.length, 20);
  assert.equal(itens.filter((x) => x.situacao === "certa").length, 10);
  assert.equal(itens.filter((x) => x.situacao === "em_branco").length, 1);
  assert.equal(filtrarRevisao(itens, "erradas").length, 10);
  assert.equal(filtrarRevisao(itens, "marcadas").length, 4);
  for (const x of itens) {
    if (x.situacao === "certa") assert.equal(x.flashcards, null);
    else {
      assert.ok(x.flashcards.href.startsWith("../anki/#/estudar?"));
      const p = new URLSearchParams(x.flashcards.href.split("?")[1]);
      assert.equal(p.get("sistema"), x.questao.sistema);
      assert.equal(p.get("modo"), "treino");
    }
  }
  const grupos = sistemasParaRevisar(itens);
  assert.equal(grupos.reduce((s, g) => s + g.erros, 0), 10);
  for (let i = 1; i < grupos.length; i++) assert.ok(grupos[i - 1].erros >= grupos[i].erros);
});

test("questão que saiu do banco aparece como faltando, sem quebrar a revisão", () => {
  const t = tentativa(B1, "step1", 5);
  const m = porId(B1); m.delete(t.questoes[0]);
  const itens = itensRevisao(t, m);
  assert.equal(itens[0].faltando, true);
  assert.equal(itens[0].questao, null);
});

test("Step 2 CK: link para flashcards só nas áreas com sistema correspondente no Step 1", () => {
  assert.equal(linkFlashcards({ step: "step2ck", sistema: "cirurgia" }), null);
  const l = linkFlashcards({ step: "step2ck", sistema: "psiquiatria" });
  assert.equal(l.sistema, "comportamento_nervoso");
  assert.equal(l.aproximado, true);
  assert.equal(linkFlashcards({ step: "step1", sistema: "cardiovascular" }).aproximado, false);
  /* o sistema existe na taxonomia do app de flashcards */
  const chaves = new Set(TAX.sistemas.map((s) => s.chave));
  for (const q of [...B1, ...B2]) { const x = linkFlashcards(q); if (x) assert.ok(chaves.has(x.sistema), x.sistema); }
});

test("histórico: ordem, média, melhor e variação entre as duas últimas", () => {
  const h = [
    { step: "step1", fim: "2026-10-01T10:00:00Z", percentual: 0.5 },
    { step: "step1", fim: "2026-10-20T10:00:00Z", percentual: 0.7 },
    { step: "step2ck", fim: "2026-10-21T10:00:00Z", percentual: 0.9 },
    { step: "step1", fim: "2026-10-10T10:00:00Z", percentual: 0.6 }
  ];
  const r = resumoHistorico(h, "step1");
  assert.equal(r.n, 3);
  assert.equal(r.ultima.percentual, 0.7);
  assert.ok(Math.abs(r.media - 0.6) < 1e-9);
  assert.equal(r.melhor, 0.7);
  assert.ok(Math.abs(r.variacao - 0.1) < 1e-9);
  assert.equal(resumoHistorico([], "step1").variacao, null);
  assert.equal(resumoHistorico(h).n, 4);
});
