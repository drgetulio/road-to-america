/* tools/importar-banco.mjs: validação, relatório, manifesto e envio (fetch simulado) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executar, lerArgs, itemParaDados } from "../../tools/importar-banco.mjs";
import { normalizarItem } from "../js/banco.js";
import { gerarBancoSintetico } from "./sintetico.mjs";

function raizTemporaria() {
  const raiz = mkdtempSync(join(tmpdir(), "r2a-imp-"));
  mkdirSync(join(raiz, "simulado/data"), { recursive: true });
  for (const f of ["step1-questoes.json", "step2ck-questoes.json", "valores-laboratoriais.json"]) cpSync(new URL("../../simulado/data/" + f, import.meta.url), join(raiz, "simulado/data", f));
  const itens = gerarBancoSintetico({ porStep: 30, semente: 11 });
  mkdirSync(join(raiz, "banco-privado/step1"), { recursive: true });
  mkdirSync(join(raiz, "banco-privado/step2ck"), { recursive: true });
  const s1 = itens.filter((q) => q.step === "step1");
  const ck = itens.filter((q) => q.step === "step2ck");
  writeFileSync(join(raiz, "banco-privado/step1/lote-01.json"), JSON.stringify([...s1, { ...s1[0], correta: "H", id: "R2A-S1-9999" }]));
  writeFileSync(join(raiz, "banco-privado/referencia-outline.json"), JSON.stringify({ x: 1 }));
  writeFileSync(join(raiz, "banco-privado/blueprint-step2ck.json"), JSON.stringify({ step: "step2ck", itens: [
    { spec_id: ck[0].spec_id, sistema: ck[0].sistema, competencia: ck[0].competencia, disciplinas_oficiais: ["Surgery", "Medicine"], outline_ref: "x_y", nutricao: true },
    { spec_id: ck[1].spec_id, sistema: ck[1].sistema === "endocrino" ? "respiratorio" : "endocrino", competencia: ck[1].competencia }
  ] }));
  ck[0] = { ...ck[0], disciplinas_oficiais: undefined };
  writeFileSync(join(raiz, "banco-privado/step2ck/lote-01.json"), JSON.stringify(ck));
  writeFileSync(join(raiz, "banco-privado/notas.json"), JSON.stringify({ texto: "não é lote" }));
  return raiz;
}

test("argumentos: credencial na linha de comando é recusada; status validado", () => {
  assert.throws(() => lerArgs(["--service-role-key", "abc"]), /variável de ambiente/);
  assert.throws(() => lerArgs(["--status", "publicado"]), /Status inválido/);
  assert.deepEqual(lerArgs(["--dry-run", "--lote", "50"]).lote, 50);
});

test("dry-run: valida, separa inválidos, ignora arquivos que não são lotes, grava relatório e manifesto sem rede", async () => {
  const raiz = raizTemporaria();
  const log = [];
  let rede = 0;
  const codigo = await executar(["--dry-run", "--relatorio", "rel.json", "--gerar-manifest"], { env: {}, fetch: async () => { rede++; }, log: (l) => log.push(l), raiz });
  assert.equal(codigo, 1, "item inválido dá código 1");
  assert.equal(rede, 0);
  const rel = JSON.parse(readFileSync(join(raiz, "rel.json"), "utf8"));
  assert.equal(rel.itens, 61);
  assert.equal(rel.validos, 60);
  assert.equal(rel.invalidos[0].id, "R2A-S1-9999");
  assert.ok(rel.arquivos.some((a) => a.arquivo.endsWith("notas.json") && /Não é um lote/.test(a.erro)));
  assert.ok(!rel.arquivos.some((a) => /referencia|blueprint/.test(a.arquivo)));
  const man = JSON.parse(readFileSync(join(raiz, "banco-privado/manifest.json"), "utf8"));
  assert.deepEqual(man.arquivos, ["step1/lote-01.json", "step2ck/lote-01.json"]);
  assert.deepEqual(man.blueprints, ["blueprint-step2ck.json"]);
  assert.deepEqual(rel.blueprints, ["blueprint-step2ck.json"]);
  assert.equal(rel.divergencias_blueprint.length, 1, "classificação do item diferente da especificação vira aviso no relatório");
  assert.equal(await executar(["--dry-run", "--ignorar-invalidos"], { env: {}, log: () => {}, raiz }), 0);
});

test("envio: upsert por id em lotes, chave só nos cabeçalhos, status preservado por padrão, relatório sem a chave", async () => {
  const raiz = raizTemporaria();
  const pedidos = [];
  const chave = "chave-de-servico-secreta";
  const fetch = async (url, op) => {
    pedidos.push({ url, op });
    if (op.method === "HEAD") return { ok: true, status: 200, headers: { get: () => "0-0/30" } };
    return { ok: true, status: 201, text: async () => "" };
  };
  const codigo = await executar(["--lote", "25", "--relatorio", "rel.json", "--ignorar-invalidos"], { env: { SUPABASE_URL: "https://exemplo.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: chave }, fetch, log: () => {}, raiz });
  assert.equal(codigo, 0);
  const posts = pedidos.filter((p) => p.op.method === "POST");
  assert.equal(posts.length, 3);
  assert.ok(posts.every((p) => p.url === "https://exemplo.supabase.co/rest/v1/questoes?on_conflict=id"));
  assert.equal(posts[0].op.headers.Prefer, "resolution=merge-duplicates,return=minimal");
  assert.equal(posts[0].op.headers.Authorization, "Bearer " + chave);
  const linhas = posts.flatMap((p) => JSON.parse(p.op.body));
  assert.equal(linhas.length, 60);
  assert.ok(linhas.every((l) => !("status" in l)), "sem --status, a reimportação não desfaz suspensões");
  assert.ok(linhas.every((l) => l.dados.id === l.id && !("b_angoff" in l.dados) && !("legado" in l.dados)));
  const enriquecido = linhas.find((l) => l.dados.spec_id && l.dados.outline_topicos?.includes("x_y"));
  assert.ok(enriquecido, "o item sem disciplinas_oficiais foi completado pelo blueprint");
  assert.deepEqual(enriquecido.dados.disciplinas_oficiais, ["cirurgia", "medicina"]);
  assert.equal(enriquecido.dados.disciplina_oficial, "cirurgia");
  assert.ok(enriquecido.dados.tags.includes("nutricao"));
  assert.ok(!readFileSync(join(raiz, "rel.json"), "utf8").includes(chave));
  const falha = await executar([], { env: { SUPABASE_URL: "https://exemplo.supabase.co", SUPABASE_SERVICE_ROLE_KEY: chave }, fetch: async () => ({ ok: false, status: 401, text: async () => "invalid " + chave }), log: () => {}, raiz });
  assert.equal(falha, 1);
  assert.equal(await executar([], { env: {}, log: () => {}, raiz }), 2, "sem credenciais no ambiente, não envia");
});

test("itemParaDados: Angoff só quando o item tem um próprio; campos do outro Step saem", () => {
  const [q] = gerarBancoSintetico({ porStep: 1, semente: 2 });
  const d = itemParaDados(normalizarItem({ ...q, angoff: undefined }));
  assert.ok(!("angoff" in d));
  assert.ok(!("area" in d) && !("tarefa" in d));
  assert.equal(itemParaDados(normalizarItem(q)).angoff, normalizarItem(q).angoff);
});
