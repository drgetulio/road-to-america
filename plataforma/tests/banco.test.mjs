/* Carregador do banco: normalização, validação, índice e leitura no modo demonstração */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizarItem, validarItem, montarBanco, filtrarBanco, contarPor, lerBancoDemo, carregarBanco, chaveCanonica,
  nomesLaboratoriais, TAXONOMIA, ANGOFF_PADRAO, sistemasDoOutline, assinaturaBanco, nomeChave, bancoCompletoPedido
} from "../js/banco.js";
import { LocalStore } from "../../anki/js/store-local.js";
import { gerarBancoSintetico, gerarItemSintetico } from "./sintetico.mjs";
import { rng } from "../js/simulado.js";

const ler = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), "utf8"));
const publicos = [...ler("../../simulado/data/step1-questoes.json"), ...ler("../../simulado/data/step2ck-questoes.json")];
const labs = nomesLaboratoriais(ler("../../simulado/data/valores-laboratoriais.json"));
function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("os 80 itens públicos (contrato anterior) entram todos, com Angoff padrão e classificação do outline", () => {
  const b = montarBanco(publicos, { labs });
  assert.deepEqual(b.contagem, { step1: 40, step2ck: 40 });
  assert.equal(b.invalidos.length, 0);
  for (const q of b.itens) {
    assert.equal(q.legado, true);
    assert.equal(q.angoff_origem, "padrao_dificuldade");
    assert.equal(q.angoff, ANGOFF_PADRAO[q.dificuldade]);
    assert.ok(Math.abs(q.b_angoff + Math.log(q.angoff / (1 - q.angoff))) < 1e-12);
  }
  const s1 = new Set(sistemasDoOutline("step1"));
  const ck = new Set(sistemasDoOutline("step2ck"));
  assert.ok(b.steps.step1.every((q) => s1.has(q.sistema) && q.competencia));
  assert.ok(b.steps.step2ck.every((q) => ck.has(q.sistema) && q.area && q.tarefa && q.competencia && !q.disciplina), "CK antigo: área e tarefa saem dos campos antigos; sistema e competência, da reclassificação");
  const discs = new Set(TAXONOMIA.step2ck.disciplina_oficial.chaves.map((c) => c.chave));
  assert.ok(b.steps.step2ck.every((q) => q.disciplinas_oficiais.length && q.disciplinas_oficiais.every((d) => discs.has(d)) && q.disciplina_oficial === q.disciplinas_oficiais[0]));
  assert.equal(b.porId.get("ck-001").sistema, "endocrino");
  assert.equal(b.porId.get("ck-040").competencia, "aprendizagem_baseada_pratica");
  assert.equal(b.porId.get("ck-032").area, "neurologia");
  assert.deepEqual(b.porId.get("ck-013").disciplinas_oficiais, ["cirurgia", "medicina"]);
  assert.equal(b.porId.get("s1-038").competencia, "comunicacao_interpessoal");
  assert.deepEqual(b.porId.get("s1-004").disciplinas_secundarias, ["nutricao"]);
  assert.deepEqual(b.porId.get("s1-004").disciplinas, ["patologia", "nutricao"]);
  assert.equal(contarPor(b.steps.step1, "competencia").conhecimento_medico, 31);
});

test("normalização: sinônimos, acentos, Angoff em percentual e padrões do contrato", () => {
  assert.deepEqual(chaveCanonica("step1", "sistema", "Saúde comportamental"), { chave: "comportamento_nervoso", conhecida: true });
  assert.deepEqual(chaveCanonica("step1", "competencia", "applying_foundational_science"), { chave: "conhecimento_medico", conhecida: true });
  assert.deepEqual(chaveCanonica("step2ck", "area", "Obstetrícia e Ginecologia"), { chave: "ginecologia_obstetricia", conhecida: true });
  assert.equal(chaveCanonica("step2ck", "sistema", "Ornitologia").conhecida, false);
  const random = rng(1);
  const base = gerarItemSintetico({ step: "step1", n: 7, random, sistema: "cardiovascular" });
  const q = normalizarItem({ ...base, angoff: 62, dificuldade: "Média", step: "Step 1", competencia: undefined, pergunta: "Which of the following is the most likely diagnosis?" });
  assert.equal(q.angoff, 0.62);
  assert.equal(q.angoff_origem, "item");
  assert.equal(q.dificuldade, "media");
  assert.equal(q.step, "step1");
  assert.equal(q.competencia, "diagnostico");
  const sem = normalizarItem({ ...base, angoff: undefined, dificuldade: "dificil" });
  assert.equal(sem.angoff, 0.45);
  assert.equal(nomeChave("step2ck", "competencia", "manejo_misto"), "Cuidado ao paciente: manejo misto");
  assert.deepEqual(chaveCanonica("step2ck", "disciplina_oficial", "Obstetrics & Gynecology"), { chave: "ginecologia_obstetricia", conhecida: true });
  assert.deepEqual(chaveCanonica("step2ck", "sistema", "gestacao"), { chave: "gestacao_parto_puerperio", conhecida: true });
  const ckSem = normalizarItem({ ...gerarItemSintetico({ step: "step2ck", n: 9, random, sistema: "respiratorio" }), disciplinas_oficiais: undefined, area: "neurologia" });
  assert.deepEqual(ckSem.disciplinas_oficiais, ["medicina"], "sem disciplinas_oficiais, a principal sai da área do projeto");
});

test("validação: erros tiram o item; avisos ficam no relatório", () => {
  const random = rng(2);
  const ok = gerarItemSintetico({ step: "step2ck", n: 1, random, sistema: "cardiovascular" });
  assert.deepEqual(validarItem(normalizarItem(ok)).erros, []);
  const casos = [
    [{ correta: "H" }, /correta não está/],
    [{ alternativas: ok.alternativas.slice(0, 4) }, /5 a 8/],
    [{ alternativas: ok.alternativas.map((a, i) => ({ ...a, letra: i === 2 ? "A" : a.letra })) }, /letras/],
    [{ sistema: "" }, /Sistema ausente/],
    [{ area: "" }, /Área clínica/],
    [{ competencia: "" }, /competência do outline/],
    [{ dificuldade: "impossivel" }, /Dificuldade/],
    [{ id: "com espaço" }, /Identificador/],
    [{ angoff: 1.5 }, /Angoff/]
  ];
  for (const [mudanca, re] of casos) assert.match(validarItem(normalizarItem({ ...ok, ...mudanca })).erros.join(" "), re);
  const av = validarItem(normalizarItem({ ...ok, explicacao_pt: "Resumo \u2014 com travessão", pergunta: "Which of the following is NOT true?", valores_lab: ["Unobtainium, serum"] }), { labs });
  assert.equal(av.erros.length, 0);
  assert.match(av.avisos.join(" "), /Travessão/);
  assert.match(av.avisos.join(" "), /negativa/);
  assert.match(av.avisos.join(" "), /fora da tabela/);
  const lab = validarItem(normalizarItem({ ...ok, valores_lab: ["Potassium, serum", "Hemoglobin"] }), { labs });
  assert.ok(!lab.avisos.some((a) => /laboratoriais/.test(a)), "nomes da tabela oficial passam, com ou sem o sufixo do material");
});

test("montarBanco: duplicado fica com a versão maior; índice e filtro por dimensão; assinatura muda com o banco", () => {
  const brutos = gerarBancoSintetico({ porStep: 60, semente: 3 });
  const dup = { ...brutos[0], versao: 2, vinheta: brutos[0].vinheta + " Revised." };
  const b = montarBanco([...brutos, dup, { id: "quebrado" }]);
  assert.equal(b.contagem.step1 + b.contagem.step2ck, 120);
  assert.deepEqual(b.duplicados, [brutos[0].id]);
  assert.equal(b.porId.get(brutos[0].id).versao, 2);
  assert.equal(b.invalidos.length, 1);
  const cardio = b.indice.step1.sistema.cardiovascular || [];
  assert.deepEqual(filtrarBanco(b, { step: "step1", sistema: "cardiovascular" }).map((q) => q.id), cardio);
  assert.ok(filtrarBanco(b, { step: "step2ck", area: ["pediatria", "psiquiatria"], dificuldade: "dificil" }).every((q) => ["pediatria", "psiquiatria"].includes(q.area) && q.dificuldade === "dificil"));
  assert.equal(b.reduzido.step1, true);
  assert.notEqual(b.assinatura, assinaturaBanco(b.itens.slice(1)));
  const susp = montarBanco([{ ...brutos[1], status: "suspenso" }]);
  assert.equal(susp.itens.length, 0, "inativo fica fora por padrão");
  assert.equal(montarBanco([{ ...brutos[1], status: "suspenso" }], { incluirInativos: true }).itens.length, 1);
});

test("lerBancoDemo: públicos sempre; banco completo só quando o manifesto existe; caminho com .. é recusado", async () => {
  const sint = gerarBancoSintetico({ porStep: 5, semente: 4 });
  const arquivos = {
    "simulado/data/step1-questoes.json": ler("../../simulado/data/step1-questoes.json"),
    "simulado/data/step2ck-questoes.json": ler("../../simulado/data/step2ck-questoes.json")
  };
  const falso = (mapa) => async (url) => {
    const p = new URL(url).pathname.replace(/^\//, "");
    return mapa[p] ? { ok: true, status: 200, json: async () => structuredClone(mapa[p]) } : { ok: false, status: 404, json: async () => null };
  };
  const base = "http://localhost/";
  const so = await lerBancoDemo({ base, fetch: falso(arquivos) });
  assert.equal(bancoCompletoPedido(), false, "fora do navegador em localhost, o banco completo não é procurado");
  assert.equal(so.itens.length, 80);
  assert.equal(so.privado, false);
  const comp = await lerBancoDemo({
    base, privado: true,
    fetch: falso({ ...arquivos, "banco-privado/manifest.json": { arquivos: ["step1/lote-01.json", "../segredo.json"] }, "banco-privado/step1/lote-01.json": sint })
  });
  assert.equal(comp.privado, true);
  assert.equal(comp.itens.length, 90);
  assert.equal(comp.fontes.find((f) => f.arquivo.includes("segredo"))?.ok, false);
});

test("carregarBanco pela camada de dados: participante ativo lê; inativo não lê; admin vê suspensos se pedir", async () => {
  const sint = gerarBancoSintetico({ porStep: 30, semente: 5 });
  const s = new LocalStore({ storage: memoria(), bancosSimulado: { step1: [], step2ck: [] }, questoes: sint });
  await s.init({ seeds: [] });
  s.setDemoRole("participante");
  let b = await carregarBanco({ store: s });
  assert.equal(b.itens.length, 60);
  assert.equal(b.origem, "demonstracao");
  s.setDemoRole("admin");
  await s.setStatusQuestao(sint[0].id, "suspenso");
  await s.setAtivo("demo-participante", false);
  assert.equal((await carregarBanco({ store: s })).itens.length, 59);
  assert.equal((await carregarBanco({ store: s, incluirInativos: true })).itens.length, 60);
  s.setDemoRole("participante");
  b = await carregarBanco({ store: s });
  assert.equal(b.itens.length, 0, "matrícula inativa não lê o banco");
});
