import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mesclar, alternar, remover, segmentos, realceEm } from "../js/realce.js";
import { novaCalculadora, teclar, formatar, teclaDoTeclado } from "../js/calculadora.js";
import { filtrarLabs, contarItens, normalizar } from "../js/labs.js";
import { HistoricoLocal, gravarAndamento, lerAndamento, apagarAndamento, gravarNotas, lerNotas, lerPrefs } from "../js/armazenamento.js";
import { corrigirTentativa } from "../../plataforma/js/simulado.js";

const LAB = JSON.parse(readFileSync(new URL("../data/valores-laboratoriais.json", import.meta.url)));
const B1 = JSON.parse(readFileSync(new URL("../data/step1-questoes.json", import.meta.url)));

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("realce: funde trechos, liga e desliga com o mesmo gesto", () => {
  assert.deepEqual(mesclar([[5, 10], [0, 3], [8, 12], [3, 4]]), [[0, 4], [5, 12]]);
  let r = alternar([], 2, 6);
  assert.deepEqual(r, [[2, 6]]);
  r = alternar(r, 4, 9);
  assert.deepEqual(r, [[2, 9]]);
  r = alternar(r, 3, 5);
  assert.deepEqual(r, [[2, 3], [5, 9]], "trecho já realçado é removido");
  assert.deepEqual(remover([[0, 10]], 0, 10), []);
  assert.deepEqual(realceEm([[2, 3], [5, 9]], 6), [5, 9]);
  assert.equal(realceEm([[2, 3]], 3), null);
  assert.deepEqual(alternar([], 7, 7), []);
});

test("realce: segmentos reconstroem o texto original", () => {
  const t = "A 24-year-old woman with type 1 diabetes";
  const segs = segmentos(t, [[2, 13], [30, 99]]);
  assert.equal(segs.map((s) => s.texto).join(""), t);
  assert.deepEqual(segs.map((s) => s.realce), [false, true, false, true]);
  assert.equal(segs[1].texto, "24-year-old");
  assert.equal(segmentos("", [[0, 3]]).length, 0);
});

const seq = (teclas) => teclas.reduce((e, k) => teclar(e, k), novaCalculadora());

test("calculadora: operações encadeadas, igual, porcentagem, raiz e erros", () => {
  assert.equal(seq(["1", "2", "+", "3", "0", "="]).visor, "42");
  assert.equal(seq(["7", "*", "6", "-", "2", "="]).visor, "40", "encadeia da esquerda para a direita");
  assert.equal(seq(["1", "/", "3", "="]).visor, "0.333333333333");
  assert.equal(seq(["0", ".", "1", "+", "0", ".", "2", "="]).visor, "0.3");
  assert.equal(seq(["2", "0", "0", "+", "1", "0", "%"]).visor, "20");
  assert.equal(seq(["5", "0", "%"]).visor, "0.5");
  assert.equal(seq(["8", "1", "sqrt"]).visor, "9");
  assert.equal(seq(["5", "/", "0", "="]).visor, "Erro");
  assert.equal(seq(["5", "/", "0", "=", "3"]).visor, "Erro", "depois do erro, só C limpa");
  assert.equal(seq(["5", "/", "0", "=", "C", "3"]).visor, "3");
  assert.equal(seq(["9", "neg"]).visor, "-9");
  assert.equal(seq(["1", "2", "3", "back"]).visor, "12");
  assert.equal(seq(["4", "+", "*", "2", "="]).visor, "8", "trocar o operador não calcula");
  assert.equal(seq(["1", ".", ".", "5"]).visor, "1.5");
  assert.equal(formatar(1e15), "1e+15");
  assert.equal(teclaDoTeclado("Enter"), "=");
  assert.equal(teclaDoTeclado(","), ".");
  assert.equal(teclaDoTeclado("q"), null);
});

test("calculadora: conta típica de prova (gradiente A-a) dá o número certo", () => {
  /* 0,21 x (760 - 47) - 40 / 0,8 = 149,73 - 50 = 99,73 */
  let e = seq(["7", "6", "0", "-", "4", "7", "="]);
  e = ["*", "0", ".", "2", "1", "="].reduce((x, k) => teclar(x, k), e);
  assert.equal(e.visor, "149.73");
  e = ["-", "5", "0", "="].reduce((x, k) => teclar(x, k), e);
  assert.equal(e.visor, "99.73");
});

test("tabela de valores laboratoriais: estrutura completa, sem campos vazios", () => {
  assert.ok(LAB.secoes.length >= 10);
  assert.equal(contarItens(LAB.secoes), LAB.total_itens);
  const ids = new Set();
  for (const s of LAB.secoes) {
    assert.ok(s.id && s.titulo && s.titulo_pt);
    assert.ok(!ids.has(s.id)); ids.add(s.id);
    for (const it of s.itens) {
      assert.ok(it.nome && it.pt, JSON.stringify(it));
      if (it.linhas) {
        assert.ok(it.linhas.length >= 2);
        for (const l of it.linhas) assert.equal(l.length, 3, it.nome);
      } else assert.ok(it.conv && it.si, it.nome);
    }
  }
  const texto = JSON.stringify(LAB);
  assert.ok(!/[\u2013\u2014]/.test(texto), "sem travessão nem meia-risca");
});

test("tabela de valores laboratoriais: valores-chave das vinhetas e conversões SI coerentes", () => {
  const achar = (termo) => filtrarLabs(LAB, termo).flatMap((s) => s.itens);
  const um = (termo) => { const r = achar(termo); assert.ok(r.length >= 1, termo); return r[0]; };
  assert.equal(um("sodium").conv, "136-146 mEq/L");
  assert.equal(um("potassium").conv, "3.5-5.0 mEq/L");
  assert.equal(um("bicarbonate").conv, "22-28 mEq/L");
  assert.equal(um("urea nitrogen").conv, "7-18 mg/dL");
  assert.equal(um("creatinine clearance").linhas[0][0], "Male");
  assert.equal(um("AST").conv, "12-38 U/L");
  assert.equal(um("platelet").conv, "150,000-400,000/mm³");
  /* conversões: creatinina x 88,4; ureia x 0,357; glicose / 18,0; cálcio / 4,008 */
  const faixa = (s) => s.match(/[\d.]+/g).map(Number);
  const [c1, c2] = faixa(um("creatinine").conv); const [s1, s2] = faixa(um("creatinine").si);
  assert.ok(Math.abs(c1 * 88.4 - s1) < 1 && Math.abs(c2 * 88.4 - s2) < 1);
  const [u1, u2] = faixa(um("urea nitrogen").conv); const [v1, v2] = faixa(um("urea nitrogen").si);
  assert.ok(Math.abs(u1 * 0.357 - v1) < 0.06 && Math.abs(u2 * 0.357 - v2) < 0.06);
  const gli = um("glucose fasting");
  const [g1, g2] = faixa(gli.linhas[0][1]); const [h1, h2] = faixa(gli.linhas[0][2]);
  assert.ok(Math.abs(g1 / 18.016 - h1) < 0.06 && Math.abs(g2 / 18.016 - h2) < 0.06);
  const [ca1, ca2] = faixa(um("calcium").conv); const [cs1, cs2] = faixa(um("calcium").si);
  assert.ok(Math.abs(ca1 / 4.008 - cs1) < 0.01 && Math.abs(ca2 / 4.008 - cs2) < 0.01);
});

test("busca na tabela: português, inglês, sem acento e por seção", () => {
  assert.ok(filtrarLabs(LAB, "sodio").flatMap((s) => s.itens).some((i) => i.nome.startsWith("Sodium")));
  assert.ok(filtrarLabs(LAB, "TGO").flatMap((s) => s.itens).some((i) => i.nome.includes("AST")));
  assert.ok(filtrarLabs(LAB, "pco2").flatMap((s) => s.itens).some((i) => i.nome.startsWith("PCO")));
  assert.equal(filtrarLabs(LAB, "glucose").length >= 2, true, "glicose no soro e no líquor");
  assert.equal(filtrarLabs(LAB, "zzzz").length, 0);
  assert.equal(filtrarLabs(LAB, "", "liquor").length, 1);
  assert.equal(contarItens(filtrarLabs(LAB, "")), LAB.total_itens);
  assert.equal(normalizar("Ácido  ÚRICO"), "acido urico");
});

function registro(n = 10) {
  const questoes = B1.slice(0, 20);
  return corrigirTentativa({
    step: "step1", questoes, respostas: questoes.map((q, i) => (i < n ? q.correta : null)),
    tempos_ms: questoes.map(() => 60000), inicio: "2026-10-28T12:00:00.000Z", fim: "2026-10-28T12:20:00.000Z"
  });
}

test("histórico do visitante: grava no navegador, lista o mais recente primeiro, recusa registro inválido", () => {
  const st = memoria();
  const h = new HistoricoLocal(st);
  const a = h.salvar(registro(10));
  const b = h.salvar({ ...registro(12), fim: "2026-10-28T13:00:00.000Z", inicio: "2026-10-28T12:40:00.000Z" });
  assert.ok(a.id.startsWith("loc-"));
  assert.equal(a.user_id, null);
  assert.deepEqual(h.listar().map((x) => x.id), [b.id, a.id]);
  assert.equal(h.listar("step2ck").length, 0);
  assert.equal(h.obter(a.id).acertos, 10);
  assert.throws(() => h.salvar({ step: "step1" }), /Step|questões|total/);
  h.limpar();
  assert.equal(h.listar().length, 0);
});

test("armazenamento quebrado não derruba a página", () => {
  const quebrado = { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("bloqueado"); }, removeItem() { throw new Error("bloqueado"); } };
  const h = new HistoricoLocal(quebrado);
  assert.deepEqual(h.listar(), []);
  assert.equal(h.salvar(registro())._gravado, false);
  assert.equal(lerAndamento(quebrado), null);
  assert.equal(gravarAndamento({ a: 1 }, quebrado), false);
  apagarAndamento(quebrado);
  assert.deepEqual(lerPrefs(quebrado), { fonte: "normal", step: "step1" });
});

test("andamento e anotações vão e voltam", () => {
  const st = memoria();
  gravarAndamento({ v: 1, x: [1, 2] }, st);
  assert.deepEqual(lerAndamento(st), { v: 1, x: [1, 2] });
  apagarAndamento(st);
  assert.equal(lerAndamento(st), null);
  gravarNotas("t1", ["", "rever K+"], st);
  assert.deepEqual(lerNotas("t1", st), ["", "rever K+"]);
  gravarNotas("t2", ["", ""], st);
  assert.equal(lerNotas("t2", st), null, "sem anotação nada é gravado");
});

test("labs: exames citados nas vinhetas do banco estão na tabela (revisão de 28/10/2026)", () => {
  for (const termo of ["lipase", "troponin", "d-dimer", "lactate", "c-reactive", "transferrin saturation", "fibrinogen",
    "magnesium", "bicarbonate", "pco2", "ferritin", "total iron-binding", "bilirubin direct", "creatine kinase", "tsh", "platelet"]) {
    assert.ok(contarItens(filtrarLabs(LAB, termo)) >= 1, "faltou na tabela: " + termo);
  }
  const compl = LAB.secoes.find((s) => s.id === "complementares");
  assert.ok(compl && /não constam da tabela do NBME/.test(compl.nota), "a seção complementar precisa avisar que está fora da tabela oficial");
  const mg = LAB.secoes.flatMap((s) => s.itens).find((i) => i.nome.startsWith("Magnesium"));
  assert.match(mg.nota, /0\.75-1\.0 mmol\/L/);
});
