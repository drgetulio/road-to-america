import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LocalStore, CHAVE_COORTE } from "../../anki/js/store-local.js";
import { SupabaseStore } from "../../anki/js/store-supabase.js";
import { PermissionError } from "../../anki/js/permissions.js";
import { corrigirTentativa, sortearQuestoes } from "../js/simulado.js";
import { avaliarParticipante, resumoCoorte, CODIGOS_RISCO } from "../js/desempenho.js";
import { gerarCoorte, PERFIS, PREFIXO_SINTETICO } from "../js/coorte-demo.js";

const ler = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), "utf8"));
const bancos = { step1: ler("../../simulado/data/step1-questoes.json"), step2ck: ler("../../simulado/data/step2ck-questoes.json") };
const seeds = ler("../../anki/data/seed-a.json").slice(0, 30);

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
async function loja() {
  const storage = memoria();
  const s = new LocalStore({ storage, bancosSimulado: bancos });
  await s.init({ seeds });
  return { s, storage };
}
function tentativa(step = "step1", acertos = 12) {
  const qs = sortearQuestoes(bancos[step], { semente: 5 });
  const respostas = qs.map((q, i) => (i < acertos ? q.correta : "Z"));
  return corrigirTentativa({ step, questoes: qs, respostas, tempos_ms: qs.map(() => 80000), inicio: new Date(Date.now() - 27 * 60000), fim: new Date(Date.now() - 60000) });
}
const nbme = (extra = {}) => ({ step: "step1", formulario: "CBSSA Form 31", data: "2026-10-01", escore: 210, probabilidade: 88, ...extra });

test("simulado: participante grava e lista só os seus; não apaga; admin vê todos, inclusive a coorte", async () => {
  const { s } = await loja();
  s.setDemoRole("participante");
  const t = await s.saveSimulado(tentativa());
  assert.equal(t.user_id, "demo-participante");
  assert.equal(t.acertos, 12);
  assert.equal((await s.listSimulados()).length, 1);
  assert.equal((await s.listSimulados({ todos: true })).length, 1, "todos não vale para participante");
  await assert.rejects(() => s.deleteSimulado(t.id), PermissionError);
  await assert.rejects(() => s.saveSimulado({ ...t, acertos: 99 }), /acertos/i);
  s.setDemoRole("admin");
  const todos = await s.listSimulados({ todos: true });
  assert.ok(todos.length > 20);
  assert.ok(todos.some((x) => x.user_id.startsWith(PREFIXO_SINTETICO)));
  assert.equal((await s.listSimulados({ userId: "demo-participante" })).length, 1);
  await s.deleteSimulado(t.id);
  assert.equal((await s.listSimulados({ userId: "demo-participante" })).length, 0);
});

test("NBME: participante lança e corrige, não verifica; admin verifica; verificada fica travada", async () => {
  const { s } = await loja();
  s.setDemoRole("participante");
  await assert.rejects(() => s.saveNbme(nbme({ data: "2099-01-01" })), /futuro/);
  const n = await s.saveNbme({ ...nbme(), verificada: true });
  assert.equal(n.verificada, false);
  const n2 = await s.saveNbme({ ...nbme({ probabilidade: 90 }), id: n.id });
  assert.equal(n2.probabilidade, 90);
  await assert.rejects(() => s.verifyNbme(n.id), PermissionError);
  s.setDemoRole("admin");
  const v = await s.verifyNbme(n.id);
  assert.equal(v.verificada, true);
  assert.equal(v.verificada_por, "demo-admin");
  s.setDemoRole("participante");
  await assert.rejects(() => s.saveNbme({ ...nbme(), id: n.id }), PermissionError);
  await assert.rejects(() => s.deleteNbme(n.id), PermissionError);
  const outra = await s.saveNbme(nbme({ step: "step2ck", formulario: "CCSSA Form 12" }));
  await s.deleteNbme(outra.id);
  assert.equal((await s.listNbme()).length, 1);
});

test("presença: só o admin lança (manual ou CSV); participante lê a sua", async () => {
  const { s } = await loja();
  s.setDemoRole("participante");
  await assert.rejects(() => s.setPresenca("demo-participante", { aulas_assistidas: 40, aulas_totais: 40 }), PermissionError);
  await assert.rejects(() => s.importPresencaCsv("email,aulas_assistidas,aulas_totais\nparticipante@demo.local,1,1"), PermissionError);
  assert.equal(await s.getPresenca(), null);
  s.setDemoRole("admin");
  await assert.rejects(() => s.setPresenca("demo-participante", { aulas_assistidas: 5, aulas_totais: 4 }), /total/);
  const r = await s.importPresencaCsv("email;aulas_assistidas;aulas_totais\nPARTICIPANTE@demo.local;30;40\nninguem@x.com;1;2\nana.exemplo@demo.local;20;40\nerro;1;1");
  assert.equal(r.atualizados, 2);
  assert.deepEqual(r.nao_encontrados, ["ninguem@x.com"]);
  assert.equal(r.erros.length, 1);
  assert.equal((await s.getPresenca(PREFIXO_SINTETICO + "ana-exemplo")).aulas_assistidas, 20);
  s.setDemoRole("participante");
  assert.equal((await s.getPresenca()).aulas_assistidas, 30);
  assert.equal(await s.getPresenca(PREFIXO_SINTETICO + "ana-exemplo"), null);
});

test("plano: participante muda só as datas de prova; admin marca aprovação e matrícula", async () => {
  const { s } = await loja();
  s.setDemoRole("participante");
  const p = await s.savePlano({ data_prova_step1: "2027-02-01", step1_aprovado: true, data_matricula: "2020-01-01" });
  assert.equal(p.data_prova_step1, "2027-02-01");
  assert.equal(p.step1_aprovado, false);
  assert.equal(p.data_matricula, null);
  await assert.rejects(() => s.savePlano({ data_prova_step1: "01/02/2027" }), /Data inválida/);
  await assert.rejects(() => s.savePlano({ data_prova_step1: "2027-03-01" }, PREFIXO_SINTETICO + "ana-exemplo"), PermissionError);
  s.setDemoRole("admin");
  const q = await s.savePlano({ step1_aprovado: true, data_matricula: "2026-10-01" }, "demo-participante");
  assert.equal(q.step1_aprovado, true);
  assert.equal(q.data_prova_step1, "2027-02-01");
});

test("metas: participante lê, só admin grava", async () => {
  const { s } = await loja();
  s.setDemoRole("participante");
  assert.equal((await s.getConfigPlataforma()).meta_probabilidade, 90);
  await assert.rejects(() => s.saveConfigPlataforma({ meta_probabilidade: 70 }), PermissionError);
  s.setDemoRole("admin");
  await s.saveConfigPlataforma({ meta_probabilidade: 70 });
  s.setDemoRole("participante");
  assert.equal((await s.getConfigPlataforma()).meta_probabilidade, 70);
});

test("painel do admin: participante de demonstração + coorte sintética marcada, sem misturar dados", async () => {
  const { s, storage } = await loja();
  s.setDemoRole("participante");
  await s.saveSimulado(tentativa("step1", 15));
  await s.addRevlog({ card_id: seeds[0].id, ord: 1, rating: 3, state: 2, review: new Date().toISOString() });
  await assert.rejects(() => s.listResumoParticipantes(), PermissionError);
  await assert.rejects(() => s.listParticipantes(), PermissionError);
  await assert.rejects(() => s.getAtividadeDiaria(PREFIXO_SINTETICO + "ana-exemplo"), PermissionError);
  const meu = await s.getMeuResumo();
  assert.equal(meu.simulados.step1.n, 1);
  assert.equal(meu.flashcards.revisoes_hoje, 1);
  s.setDemoRole("admin");
  const linhas = await s.listResumoParticipantes();
  assert.equal(linhas.length, 1 + PERFIS.length);
  assert.equal(linhas.filter((l) => l.sintetico).length, PERFIS.length);
  const real = linhas.find((l) => !l.sintetico);
  assert.equal(real.user_id, "demo-participante");
  assert.equal(real.simulados.step1.n, 1, "o participante de demonstração só tem os próprios dados");
  assert.equal(real.flashcards.revisoes_30d, 1);
  assert.ok(linhas.filter((l) => l.sintetico).every((l) => l.email.endsWith("@demo.local")));
  /* a coorte não vai para o armazenamento principal */
  for (const [k, v] of storage._m) if (k !== CHAVE_COORTE) assert.ok(!v.includes(PREFIXO_SINTETICO), "chave " + k + " contém dados sintéticos");
  const serie = await s.getAtividadeDiaria(PREFIXO_SINTETICO + "bruno-ficticio", { dias: 30 });
  assert.equal(serie.length, 30);
  assert.ok(serie.reduce((a, b) => a + b.revisoes, 0) > 0);
  assert.equal((await s.listParticipantes()).length, 1 + PERFIS.length);
});

test("coorte: perfis variados cobrem todos os critérios de risco e os três status", async () => {
  const { s } = await loja();
  s.setDemoRole("admin");
  const linhas = (await s.listResumoParticipantes()).filter((l) => l.sintetico);
  const r = resumoCoorte(linhas);
  for (const k of Object.keys(CODIGOS_RISCO)) assert.ok(r.por_criterio[k] >= 1, "nenhum participante com " + k);
  assert.ok(r.por_status.em_dia >= 3 && r.por_status.atencao >= 3 && r.por_status.risco >= 3, JSON.stringify(r.por_status));
  const st = Object.fromEntries(linhas.map((l) => [l.user_id.replace(PREFIXO_SINTETICO, ""), avaliarParticipante(l)]));
  assert.equal(st["bruno-ficticio"].prontidao.step1.status, "pronto");
  assert.equal(st["nuno-ficticio"].prontidao.step1.status, "nao_pronto");
  assert.deepEqual(st["elisa-teste"].riscos.map((x) => x.codigo), ["retencao_baixa"]);
  assert.deepEqual(st["gabriela-exemplo"].riscos.map((x) => x.codigo), ["presenca_baixa"]);
  assert.deepEqual(st["hugo-ficticio"].riscos.map((x) => x.codigo), ["simulado_baixo"]);
  assert.deepEqual(st["fabio-amostra"].riscos.map((x) => x.codigo), ["nbme_probabilidade_baixa"]);
  assert.equal(st["iris-modelo"].riscos[0].codigo, "nbme_insuficiente");
  assert.equal(st["iris-modelo"].status, "risco");
  assert.equal(st["joao-amostra"].prontidao.step1.status, "aprovado");
  assert.equal(st["ana-exemplo"].status, "em_dia");
});

test("coorte: determinística no mesmo dia e com a mesma semente", () => {
  const agora = new Date(2026, 9, 28, 15);
  const a = gerarCoorte({ agora, bancos });
  const b = gerarCoorte({ agora: new Date(2026, 9, 28, 16), bancos });
  assert.equal(JSON.stringify(a.simulados), JSON.stringify(b.simulados));
  assert.equal(JSON.stringify(a.nbme), JSON.stringify(b.nbme));
  assert.equal(a.revlog["demo-sint-ana-exemplo"].filter((r) => new Date(r.review) < new Date(2026, 9, 28, 4)).length,
    b.revlog["demo-sint-ana-exemplo"].filter((r) => new Date(r.review) < new Date(2026, 9, 28, 4)).length);
  const c = gerarCoorte({ agora, bancos, semente: 1 });
  assert.notEqual(JSON.stringify(a.simulados), JSON.stringify(c.simulados));
});

test("edições do admin na coorte ficam numa chave separada e são desfeitas no reset", async () => {
  const { s, storage } = await loja();
  s.setDemoRole("admin");
  const nb = (await s.listNbme({ userId: PREFIXO_SINTETICO + "fabio-amostra" })).find((x) => !x.verificada);
  await s.verifyNbme(nb.id);
  assert.equal((await s.listNbme({ userId: PREFIXO_SINTETICO + "fabio-amostra" })).find((x) => x.id === nb.id).verificada, true);
  assert.ok(storage.getItem(CHAVE_COORTE).includes(nb.id));
  await s.resetDemo();
  assert.equal(storage.getItem(CHAVE_COORTE), null);
  assert.equal((await s.listNbme({ userId: PREFIXO_SINTETICO + "fabio-amostra" })).find((x) => x.id === nb.id).verificada, false);
});

test("as duas camadas de dados expõem os mesmos métodos públicos", () => {
  const pub = (C) => Object.getOwnPropertyNames(C.prototype).filter((k) => k !== "constructor" && !k.startsWith("_")).sort();
  const local = pub(LocalStore);
  const remoto = pub(SupabaseStore);
  assert.deepEqual(local.filter((k) => !remoto.includes(k)), ["resetDemo"], "só o modo demonstração tem resetDemo");
  assert.deepEqual(remoto.filter((k) => !local.includes(k)), []);
});

/* Cliente falso do Supabase: registra tabelas, filtros e RPCs, para conferir que
   a camada remota só usa o que existe em supabase/schema.sql */
function clienteFalso(respostas = {}) {
  const log = [];
  const construtor = (alvo) => {
    const q = { alvo, ops: [] };
    const proxy = new Proxy({}, {
      get(_, prop) {
        if (prop === "then") {
          const dado = typeof respostas[alvo] === "function" ? respostas[alvo](q) : respostas[alvo];
          return (ok) => ok({ data: dado === undefined ? [] : dado, error: null });
        }
        return (...args) => { q.ops.push([prop, ...args]); return proxy; };
      }
    });
    log.push(q);
    return proxy;
  };
  return {
    log,
    from: (t) => construtor("tabela:" + t),
    rpc: (nome, params) => { log.push({ alvo: "rpc:" + nome, params }); return Promise.resolve({ data: respostas["rpc:" + nome] ?? null, error: null }); }
  };
}

test("camada Supabase: tabelas, colunas filtradas e RPCs existem no schema.sql", async () => {
  const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
  const fake = clienteFalso({
    "tabela:simulados": (q) => (q.ops.some((o) => o[0] === "insert") ? { ...tentativa(), id: "x", percentual: "0.6" } : []),
    "tabela:nbme_autoavaliacoes": (q) => (q.ops.some((o) => o[0] === "insert" || o[0] === "update") ? { id: "n" } : []),
    "tabela:presenca": { user_id: "u" }, "tabela:plano_participante": { user_id: "u" }, "tabela:plataforma_config": { dados: {} }, "tabela:profiles": [],
    "rpc:r2a_admin_importar_presenca": { atualizados: 1, nao_encontrados: [], erros: [] },
    "rpc:r2a_admin_resumo_participantes": [], "rpc:r2a_meu_resumo": {}, "rpc:r2a_atividade_diaria": [{ dia: "2026-10-28", revisoes: 1, revisao_total: 1, revisao_acertos: 1 }]
  });
  const s = new SupabaseStore({ url: "x", anonKey: "y" });
  s.client = fake;
  s._user = { id: "u-admin", papel: "admin", nome: "A", email: "a@x.com" };
  const t = await s.saveSimulado(tentativa());
  assert.equal(t.percentual, 0.6, "numeric do PostgREST vira número");
  await s.listSimulados({ todos: true, step: "step1" });
  await s.saveNbme(nbme());
  await s.saveNbme({ ...nbme(), id: "n" });
  await s.verifyNbme("n");
  await s.listNbme({ userId: "u2" });
  await s.setPresenca("u2", { aulas_assistidas: 1, aulas_totais: 2 });
  await s.importPresencaCsv("email,aulas_assistidas,aulas_totais\na@x.com,1,2");
  await s.getPlano();
  await s.savePlano({ data_prova_step1: "2027-01-01", step1_aprovado: true }, "u2");
  await s.getConfigPlataforma();
  await s.saveConfigPlataforma({ meta_probabilidade: 85 });
  await s.listParticipantes();
  await s.getMeuResumo();
  await s.listResumoParticipantes();
  assert.equal((await s.getAtividadeDiaria("u2", { dias: 30 }))[0].dia, "2026-10-28");
  for (const q of fake.log) {
    const [tipo, nome] = q.alvo.split(":");
    if (tipo === "tabela") {
      assert.match(schema, new RegExp("create table if not exists public\\." + nome + " \\("), "tabela " + nome);
      for (const op of q.ops) if (op[0] === "eq" || op[0] === "order") assert.match(schema, new RegExp("\\n\\s+" + op[1] + "\\s"), "coluna " + op[1] + " em " + nome);
    } else {
      const m = new RegExp("create or replace function public\\." + nome + "\\(([^)]*)\\)").exec(schema);
      assert.ok(m, "função " + nome);
      for (const p of Object.keys(q.params)) assert.ok(m[1].includes(p + " "), "parâmetro " + p + " de " + nome);
    }
  }
  /* participante: savePlano não envia campos do admin */
  s._user = { id: "u-p", papel: "participante" };
  fake.log.length = 0;
  await s.savePlano({ data_prova_step1: "2027-01-01", step1_aprovado: true });
  const up = fake.log[0].ops.find((o) => o[0] === "upsert")[1];
  assert.deepEqual(Object.keys(up).sort(), ["data_prova_step1", "user_id"]);
  await assert.rejects(() => s.listResumoParticipantes(), PermissionError);
  await assert.rejects(() => s.verifyNbme("n"), PermissionError);
});
