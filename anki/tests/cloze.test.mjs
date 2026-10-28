import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCloze, clozeOrds, clozeErrors, renderCloze, wrapCloze } from "../js/cloze.js";
import { sanitizeCardHtml, plainText } from "../js/util.js";

test("lê lacunas, números e dicas", () => {
  const t = "{{c1::Spironolactone}} blocks the {{c2::aldosterone::hormone}} receptor; {{c1::K+}} rises.";
  const l = parseCloze(t);
  assert.equal(l.length, 3);
  assert.deepEqual(l.map((x) => x.ord), [1, 2, 1]);
  assert.equal(l[1].dica, "hormone");
  assert.deepEqual(clozeOrds(t), [1, 2]);
});

test("frente oculta só a lacuna da vez e mostra a dica", () => {
  const t = "{{c1::Spironolactone}} blocks the {{c2::aldosterone::hormone}} receptor.";
  const f1 = renderCloze(t, 1, "frente");
  assert.match(f1, /\[\.\.\.\]/);
  assert.match(f1, /aldosterone/);
  const f2 = renderCloze(t, 2, "frente");
  assert.match(f2, /\[hormone\]/);
  assert.match(f2, /Spironolactone/);
  const v2 = renderCloze(t, 2, "verso");
  assert.match(v2, /cloze--ans">aldosterone</);
});

test("aponta erros de sintaxe", () => {
  assert.ok(clozeErrors("Sem lacunas aqui").length);
  assert.ok(clozeErrors("{{c1::abc}").length, "chaves desbalanceadas");
  assert.ok(clozeErrors("{{c1::}} vazio").length, "lacuna vazia");
  assert.ok(clozeErrors("{{c::abc}} sem número").length, "lacuna mal escrita");
  assert.ok(clozeErrors("{{c0::abc}}").length, "c0");
  assert.deepEqual(clozeErrors("{{c1::ok}} e {{c2::ok}}"), []);
});

test("insere lacuna em volta da seleção com o próximo número", () => {
  const t = "Metformin activates AMPK";
  const r = wrapCloze(t, 20, 24);
  assert.equal(r.texto, "Metformin activates {{c1::AMPK}}");
  const r2 = wrapCloze(r.texto, 0, 9);
  assert.equal(r2.texto, "{{c2::Metformin}} activates {{c1::AMPK}}");
  const r3 = wrapCloze(r2.texto, 0, 0, true);
  assert.ok(r3.texto.startsWith("{{c2::}}"));
});

test("sanitiza HTML do card e mantém só as etiquetas permitidas", () => {
  assert.equal(sanitizeCardHtml("Na<sup>+</sup> e <b>K</b>"), "Na<sup>+</sup> e <b>K</b>");
  assert.equal(sanitizeCardHtml('<img src=x onerror="alert(1)">oi'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;oi");
  assert.equal(sanitizeCardHtml('<b onclick="x">a</b>'), "&lt;b onclick=&quot;x&quot;&gt;a");
  assert.equal(sanitizeCardHtml("<b>aberto"), "<b>aberto</b>");
  assert.equal(sanitizeCardHtml("solto</i>"), "solto");
  assert.equal(plainText("{{c1::FBN1::gene}} <i>x</i>"), "FBN1 x");
});
