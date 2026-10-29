/* Conferências com o banco completo (banco-privado/, fora do git). Sem a pasta, os
   testes são pulados. Com os blueprints: um item por especificação, montado com a
   classificação e o Angoff-alvo, precisa usar só chaves do outline e permitir os
   formulários oficiais dentro das faixas, inclusive as faixas multirrótulo das
   disciplinas. Com os lotes escritos: o banco real passa pela mesma validação do
   importador e, quando houver itens suficientes, os formulários oficiais saem
   completos e dentro das faixas. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { montarBanco, enriquecerComBlueprint } from "../js/banco.js";
import { montarFormularioFixo, verificarFormulario, FORMULARIOS_FIXOS } from "../js/formularios.js";
import { prepararImportacao } from "../../tools/importar-banco.mjs";

const raiz = fileURLToPath(new URL("../../", import.meta.url));
const dir = raiz + "banco-privado/";
const ler = (p) => JSON.parse(readFileSync(p, "utf8"));
/* um blueprint por Step: o principal (blueprint-step1.json, blueprint-step2ck.json) com as
   especificações das extensões do mesmo Step (blueprint-step2ck-extensao.json) */
const bps = (() => {
  if (!existsSync(dir)) return [];
  const nomes = readdirSync(dir).filter((n) => /^blueprint-step(1|2ck)(-[^.]+)?\.json$/.test(n)).sort();
  const porStep = new Map();
  for (const n of nomes) {
    const bp = ler(dir + n);
    const atual = porStep.get(bp.step);
    porStep.set(bp.step, atual ? { ...atual, itens: [...atual.itens, ...bp.itens] } : { ...bp, itens: [...bp.itens] });
  }
  return [...porStep.values()];
})();
test("extensão do blueprint do Step 2 CK: CK-0481 a CK-0600 somam-se às 480 especificações sem colisão", { skip: bps.length ? false : "sem banco-privado/blueprint-*.json" }, () => {
  const ck = bps.find((b) => b.step === "step2ck");
  const ids = ck.itens.map((s) => s.spec_id);
  assert.equal(new Set(ids).size, ids.length, "spec_id repetido entre o blueprint e a extensão");
  if (existsSync(dir + "blueprint-step2ck-extensao.json")) {
    assert.equal(ids.length, 600);
    assert.ok(ids.includes("CK-0481") && ids.includes("CK-0600"));
  }
});
const publicos = [...ler(raiz + "simulado/data/step1-questoes.json"), ...ler(raiz + "simulado/data/step2ck-questoes.json")];

test("blueprints do banco completo: chaves do outline e formulários oficiais dentro das faixas", { skip: bps.length ? false : "sem banco-privado/blueprint-*.json" }, () => {
  const letras = ["A", "B", "C", "D", "E"];
  const itens = bps.flatMap((bp) => bp.itens.map((sp) => ({
    id: "R2A-" + (sp.step === "step1" ? "S1" : "CK") + "-" + String(sp.spec_id).split("-")[1], spec_id: sp.spec_id, step: sp.step,
    vinheta: "Specification check item, not a real question.", pergunta: "Which of the following?",
    alternativas: letras.map((l) => ({ letra: l, texto: "Option " + l })), correta: "B",
    dificuldade: sp.dificuldade_alvo, angoff: sp.angoff_alvo
  })));
  const enr = enriquecerComBlueprint(itens, bps);
  const banco = montarBanco([...publicos, ...enr.itens]);
  assert.equal(banco.invalidos.length, 0, JSON.stringify(banco.invalidos.slice(0, 3)));
  assert.deepEqual(banco.itens.filter((q) => q.taxonomia_desconhecida.length).map((q) => q.id), [], "toda chave do blueprint está na taxonomia da plataforma");
  for (const bp of bps) {
    const step = bp.step;
    for (const tipo of ["completo", "meio", "prontidao"]) {
      for (const { codigo } of FORMULARIOS_FIXOS[step]) {
        const f = montarFormularioFixo(banco, step, codigo, tipo);
        const v = verificarFormulario(f, banco.porId);
        assert.equal(f.reduzido, false);
        assert.ok(v.ok, step + " " + tipo + " " + codigo + ": " + v.problemas.join(" | "));
        if (tipo === "completo") {
          const multi = v.dimensoes[step === "step1" ? "disciplina" : "disciplina_oficial"].filter((x) => x.faixa);
          assert.ok(multi.every((x) => x.dentro_multirrotulo), "disciplinas (todos os rótulos) dentro das faixas: " + multi.filter((x) => !x.dentro_multirrotulo).map((x) => x.chave).join(", "));
        }
      }
    }
  }
});

const temLotes = existsSync(dir) && readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && /^step/.test(e.name));
test("lotes escritos do banco completo: validação do importador e formulários quando houver itens suficientes", { skip: temLotes ? false : "sem lotes em banco-privado/step*/" }, async (t) => {
  const { relatorio, linhas } = await prepararImportacao({ dir: "banco-privado", status: null, incluirPublicos: true, blueprint: true }, { raiz });
  t.diagnostic("itens " + relatorio.itens + ", válidos " + relatorio.validos + ", inválidos " + relatorio.invalidos.length + ", com avisos " + relatorio.avisos.length + ", divergências do blueprint " + relatorio.divergencias_blueprint.length);
  for (const x of relatorio.invalidos.slice(0, 10)) t.diagnostic("inválido " + x.id + ": " + x.erros.join(" "));
  const banco = montarBanco(linhas.map((l) => l.dados));
  assert.equal(banco.invalidos.length, 0, "o que o importador aceita, o carregador também aceita");
  for (const step of ["step1", "step2ck"]) {
    const precisa = step === "step1" ? 280 : 318;
    if (banco.contagem[step] < precisa * 1.6) { t.diagnostic(step + ": " + banco.contagem[step] + " itens; formulários completos ainda em versão reduzida"); continue; }
    const f = montarFormularioFixo(banco, step, FORMULARIOS_FIXOS[step][0].codigo, "completo");
    const v = verificarFormulario(f, banco.porId);
    assert.ok(v.ok, step + ": " + v.problemas.join(" | "));
  }
});
