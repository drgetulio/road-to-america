import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuality, qualitySummary, similarity } from "../js/quality.js";

const bom = {
  tipo: "basico",
  frente: "Which enzyme deficiency causes hemolysis with Heinz bodies after oxidant drugs?",
  verso: "G6PD",
  extra: "Without NADPH, glutathione stays oxidized and hemoglobin precipitates.",
  tags: ["anemia"], fonte: "Robbins"
};
const codigos = (l) => l.map((x) => x.codigo);

test("card bem escrito passa sem avisos", () => {
  const r = checkQuality(bom, []);
  assert.equal(qualitySummary(r).selo, "pronto", JSON.stringify(r));
});

test("detecta pergunta de sim ou não", () => {
  assert.ok(codigos(checkQuality({ ...bom, frente: "Is G6PD deficiency X-linked?", verso: "Yes" })).includes("sim_nao"));
});

test("detecta verso longo e lista", () => {
  const r = checkQuality({ ...bom, verso: "Primaquine, dapsone, sulfonamides, fava beans, nitrofurantoin and rasburicase are the classic triggers that should be avoided" });
  assert.ok(codigos(r).includes("verso_longo"));
  assert.ok(codigos(r).includes("lista"));
});

test("detecta pedido de enumeração e duas ideias", () => {
  assert.ok(codigos(checkQuality({ ...bom, frente: "List the causes of microcytic anemia." })).includes("pede_lista"));
  assert.ok(codigos(checkQuality({ ...bom, frente: "What is the enzyme? What is the inheritance?" })).includes("duas_ideias"));
});

test("cloze com lacunas demais e sem mecanismo", () => {
  const r = checkQuality({ tipo: "cloze", frente: "{{c1::thiamine}} {{c2::riboflavin}} {{c3::niacin}} {{c4::biotin}} are B", verso: "", extra: "", tags: [], fonte: "" });
  const c = codigos(r);
  assert.ok(c.includes("cloze_demais"));
  assert.ok(c.includes("sem_mecanismo"));
  assert.ok(c.includes("cloze_oculta_demais"));
});

test("cloze que oculta palavra vazia", () => {
  const r = checkQuality({ tipo: "cloze", frente: "Loop diuretics act {{c1::on the}} thick ascending limb.", extra: "x", tags: ["a"], fonte: "f" });
  assert.ok(codigos(r).includes("cloze_trivial"));
});

test("erro de sintaxe no cloze bloqueia", () => {
  const r = checkQuality({ tipo: "cloze", frente: "{{c1::abc}", extra: "x" });
  assert.equal(qualitySummary(r).selo, "bloqueado");
});

test("similaridade aponta duplicata", () => {
  const existente = { id: "r2a-x-1", frente: "Which enzyme deficiency causes hemolysis with Heinz bodies after oxidant drugs?", verso: "G6PD" };
  assert.ok(similarity(bom.frente + " " + bom.verso, existente.frente + " " + existente.verso) > 0.85);
  assert.ok(codigos(checkQuality(bom, [existente])).includes("duplicata"));
  const outro = { id: "r2a-x-2", frente: "Which nerve innervates the deltoid?", verso: "Axillary nerve" };
  assert.ok(!codigos(checkQuality(bom, [outro])).some((c) => c === "duplicata" || c === "parecido"));
});

test("resposta presente na pergunta", () => {
  assert.ok(codigos(checkQuality({ ...bom, frente: "Which enzyme, G6PD, is deficient in favism?", verso: "G6PD" })).includes("resposta_na_pergunta"));
});
