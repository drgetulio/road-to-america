/* Camada de dados do banco de questões: LocalStore (modo demonstração) e
   SupabaseStore (cliente simulado; as regras reais estão na RLS, testada em
   supabase/teste-local/02-testa-rls.sql, blocos Q1 a Q8). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LocalStore } from "../../anki/js/store-local.js";
import { SupabaseStore } from "../../anki/js/store-supabase.js";
import { PermissionError } from "../../anki/js/permissions.js";
import { montarBanco, carregarBanco } from "../js/banco.js";
import { montarFormularioFixo, novaSessao, iniciarBloco, responder, encerrarBloco, corrigirSessao } from "../js/formularios.js";
import { analisarItens, estimarAluno } from "../js/psicometria.js";
import { PREFIXO_SINTETICO } from "../js/coorte-demo.js";
import { gerarRespostasDemo } from "../js/respostas-demo.js";
import { gerarBancoSintetico } from "./sintetico.mjs";

const ler = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), "utf8"));
const publicos = [...ler("../../simulado/data/step1-questoes.json"), ...ler("../../simulado/data/step2ck-questoes.json")];
function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
async function loja(questoes = publicos) {
  const s = new LocalStore({ storage: memoria(), bancosSimulado: { step1: [], step2ck: [] }, questoes });
  await s.init({ seeds: [] });
  return s;
}
const resp = (questao_id, resposta, extra = {}) => ({ questao_id, step: "step1", resposta, correta: true, modo: "cronometrado", origem: "banco", tempo_ms: 60000, ...extra });

test("respostas: o gabarito vem do banco (acerto forjado é corrigido); o aluno lê só as suas; admin vê a turma com a coorte sintética", async () => {
  const s = await loja();
  s.setDemoRole("participante");
  const [errada, certa] = await s.saveRespostas([resp("s1-001", "A", { step: "step2ck" }), resp("s1-002", publicos[1].correta)]);
  assert.equal(errada.correta, false);
  assert.equal(errada.step, "step1");
  assert.equal(errada.versao_item, 1);
  assert.equal(certa.correta, true);
  await assert.rejects(() => s.saveResposta(resp("s1-003", "Q")), /Alternativa/);
  await assert.rejects(() => s.saveResposta(resp("s1-003", "A", { origem: "outro" })), /Origem/);
  await assert.rejects(() => s.saveResposta(resp("s1-003", "A", { respondida_em: new Date(Date.now() + 864e5).toISOString() })), /futuro/);
  assert.equal((await s.listRespostas()).length, 2);
  assert.equal((await s.listRespostas({ todos: true })).length, 2, "todos não vale para participante");
  s.setDemoRole("admin");
  const turma = await s.listRespostas({ todos: true });
  assert.ok(turma.some((r) => r.user_id.startsWith(PREFIXO_SINTETICO) && r.sintetico));
  assert.equal((await s.listRespostas({ userId: "demo-participante" })).length, 2);
});

test("respostas sintéticas da demonstração são determinísticas e seguem a habilidade do perfil", () => {
  const agora = new Date("2026-10-29T12:00:00Z");
  const a = gerarRespostasDemo({ itens: publicos, agora });
  const b = gerarRespostasDemo({ itens: publicos, agora });
  assert.deepEqual(a, b);
  const taxa = (slug) => { const r = a.filter((x) => x.user_id === PREFIXO_SINTETICO + slug); return r.filter((x) => x.correta).length / r.length; };
  assert.ok(taxa("bruno-ficticio") > taxa("hugo-ficticio"));
  assert.ok(a.every((r) => r.respondida_em <= agora.toISOString()));
});

test("simulado completo: cria, avança, não reabre bloco, conclui e trava; outro aluno não acessa; só admin apaga", async () => {
  const s = await loja();
  s.setDemoRole("participante");
  const banco = await carregarBanco({ store: s });
  const f = montarFormularioFixo(banco, "step1", "S1-A");
  let sessao = novaSessao(f);
  const reg = await s.criarSimuladoCompleto({ formulario: f, sessao });
  assert.equal(reg.estado, "em_andamento");
  assert.equal(reg.reduzido, true);
  const t0 = Date.now() - 3 * 3600e3;
  sessao = iniciarBloco(sessao, t0);
  sessao = responder(sessao, 0, { resposta: "C", tempo_ms_add: 50000 }, t0 + 60000);
  sessao = encerrarBloco(sessao, t0 + 25 * 60000);
  const salvo = await s.salvarProgressoSimulado(reg.id, sessao);
  assert.equal(salvo.bloco_atual, 1);
  const volta = JSON.parse(JSON.stringify(sessao)); volta.respostas[0][0].resposta = "D";
  await assert.rejects(() => s.salvarProgressoSimulado(reg.id, volta), /encerrado/);
  await assert.rejects(() => s.salvarProgressoSimulado(reg.id, { ...sessao, bloco_atual: 0 }), /não reabre/);
  sessao = iniciarBloco(sessao, t0 + 30 * 60000);
  sessao = encerrarBloco(sessao, t0 + 50 * 60000);
  const { resultado, respostas } = corrigirSessao(f, sessao, banco.porId, { sessaoId: reg.id });
  await s.saveRespostas(respostas);
  const fim = await s.concluirSimuladoCompleto(reg.id, { sessao, resultado });
  assert.equal(fim.estado, "concluido");
  assert.ok(fim.fim);
  await assert.rejects(() => s.salvarProgressoSimulado(reg.id, sessao), PermissionError);
  assert.equal((await s.listSimuladosCompletos({ estado: "concluido" })).length, 1);
  await assert.rejects(() => s.deleteSimuladoCompleto(reg.id), PermissionError);
  /* as respostas do simulado entram na estimativa do aluno */
  const est = estimarAluno({ step: "step1", respostas: await s.listRespostas({ step: "step1" }), itens: banco.porId });
  assert.equal(est.n, 40);
  s.setDemoRole("admin");
  assert.equal((await s.listSimuladosCompletos({ todos: true })).length, 1);
  await s.deleteSimuladoCompleto(reg.id);
  assert.equal((await s.listSimuladosCompletos({ todos: true })).length, 0);
});

test("anotações por item são privadas; vazias apagam; limite de 5000 caracteres", async () => {
  const s = await loja();
  s.setDemoRole("participante");
  await s.saveAnotacaoItem("s1-001", "marcos do desenvolvimento");
  assert.equal((await s.getAnotacaoItem("s1-001")).texto, "marcos do desenvolvimento");
  await assert.rejects(() => s.saveAnotacaoItem("s1-001", "x".repeat(5001)), /5000/);
  s.setDemoRole("admin");
  assert.equal(await s.getAnotacaoItem("s1-001"), null, "o admin não vê a anotação do aluno");
  s.setDemoRole("participante");
  assert.equal(await s.saveAnotacaoItem("s1-001", "  "), null);
  assert.equal((await s.listAnotacoesItem()).length, 0);
});

test("reportes: aluno cria (sempre aberto) e vê os seus; admin vê a fila e resolve com carimbo", async () => {
  const s = await loja();
  s.setDemoRole("participante");
  await assert.rejects(() => s.reportarItem({ questao_id: "s1-001", motivo: "inventado" }), /motivo/);
  await assert.rejects(() => s.reportarItem({ questao_id: "s1-001", motivo: "outro", texto: "" }), /Descreva/);
  const r = await s.reportarItem({ questao_id: "s1-001", motivo: "gabarito", texto: "Acho que é 9 meses", status: "resolvido" });
  assert.equal(r.status, "aberto");
  assert.equal(r.versao_item, 1);
  await assert.rejects(() => s.resolverReporte(r.id, { status: "resolvido" }), PermissionError);
  s.setDemoRole("admin");
  const fila = await s.listReportes({ todos: true, status: "aberto" });
  assert.equal(fila.length, 1);
  const ok = await s.resolverReporte(r.id, { status: "rejeitado", resposta: "Gabarito conferido com as listas do CDC." });
  assert.equal(ok.resolvido_por, "demo-admin");
  assert.ok(ok.resolvido_em);
});

test("resultados oficiais: só o admin lança; Step 1 sem nota; Step 2 CK com nota deriva Pass pelo padrão de 218", async () => {
  const s = await loja();
  s.setDemoRole("participante");
  await assert.rejects(() => s.saveResultadoOficial({ user_id: "demo-participante", step: "step1", data: "2026-06-01", resultado: "pass" }), PermissionError);
  s.setDemoRole("admin");
  await assert.rejects(() => s.saveResultadoOficial({ user_id: "demo-participante", step: "step1", data: "2026-06-01", resultado: "pass", escore: 230 }), /Pass ou Fail/);
  const ck = await s.saveResultadoOficial({ user_id: "demo-participante", step: "step2ck", data: "2026-08-01", escore: 217 });
  assert.equal(ck.resultado, "fail");
  await assert.rejects(() => s.saveResultadoOficial({ user_id: "demo-participante", step: "step2ck", data: "2024-08-01", escore: 216 }), /anteriores/);
  s.setDemoRole("participante");
  assert.equal((await s.listResultadosOficiais()).length, 1);
});

test("leituras do admin: matriz pseudonimizada (primeira resposta, sem tutor) e estatísticas no formato do banco", async () => {
  const s = await loja();
  s.setDemoRole("participante");
  await s.saveRespostas([resp("s1-001", "A", { respondida_em: "2026-10-01T10:00:00Z" }), resp("s1-001", "C", { respondida_em: "2026-10-02T10:00:00Z" }), resp("s1-002", "A", { modo: "tutor" })]);
  await assert.rejects(() => s.listRespostasCalibracao(), PermissionError);
  await assert.rejects(() => s.getEstatisticasItens(), PermissionError);
  s.setDemoRole("admin");
  const m = await s.listRespostasCalibracao({ step: "step1" });
  assert.ok(m.every((r) => Number.isInteger(r.pessoa) && !("user_id" in r) && r.modo !== "tutor"));
  const minhas = m.filter((r) => r.questao_id === "s1-001");
  const pessoas = new Set(m.map((r) => r.pessoa));
  assert.equal(new Set(minhas.map((r) => r.pessoa)).size, minhas.length, "uma linha por pessoa e item");
  assert.ok(pessoas.size >= 10);
  const est = await s.getEstatisticasItens({ step: "step1" });
  const e1 = est.find((x) => x.questao_id === "s1-001");
  assert.deepEqual(Object.keys(e1).sort(), ["acertos", "em_branco", "n", "n_inferior", "n_superior", "opcoes", "opcoes_inferior", "opcoes_superior", "p", "pbis", "questao_id", "step", "tempo_mediano_ms"].sort());
  assert.equal(e1.n, minhas.length);
  const banco = await carregarBanco({ store: s });
  const completa = analisarItens(m, banco.porId);
  assert.equal(completa.itens.length, est.length);
  /* calibração gravada aparece no item e volta ao Angoff quando apagada */
  await s.salvarCalibracao([{ id: "s1-001", b: -0.3, ep: 0.4, n: 12 }]);
  assert.equal((await carregarBanco({ store: s })).porId.get("s1-001").b_calibrado, -0.3);
  await s.salvarCalibracao([{ id: "s1-001", b: null }]);
  assert.equal((await carregarBanco({ store: s })).porId.get("s1-001").b_calibrado, null);
  await assert.rejects(() => s.salvarCalibracao([{ id: "s1-001", b: 40 }]), /inválida/);
});

test("SupabaseStore: lê questoes ativas, grava respostas em lote e barra o participante antes da rede nas leituras do admin", async () => {
  const chamadas = [];
  const resultado = { data: [], error: null };
  const q = new Proxy({}, {
    get(_, p) {
      if (p === "then") return (ok) => ok(resultado);
      return (...a) => { chamadas.push([p, ...a]); return q; };
    }
  });
  const s = new SupabaseStore({ url: "x", anonKey: "y" });
  s.client = { from: (t) => { chamadas.push(["from", t]); return q; }, rpc: (f, a) => { chamadas.push(["rpc", f, a]); return q; } };
  s._user = { id: "u1", papel: "participante", ativo: true };
  await s.listQuestoes({ step: "step1" });
  assert.deepEqual(chamadas.filter((c) => c[0] === "eq").map((c) => c.slice(1)), [["step", "step1"], ["status", "ativo"]]);
  for (const m of ["listRespostasCalibracao", "getEstatisticasItens", "deleteSimuladoCompleto", "saveResultadoOficial", "setAtivo", "setStatusQuestao", "salvarCalibracao"]) {
    chamadas.length = 0;
    await assert.rejects(() => s[m]({}), PermissionError, m);
    assert.equal(chamadas.length, 0, m + " não chega à rede");
  }
  chamadas.length = 0;
  resultado.data = [{ id: "r1" }];
  await s.saveRespostas(Array.from({ length: 1200 }, (_, i) => resp("R2A-S1-" + String(i).padStart(4, "0"), "A")));
  assert.equal(chamadas.filter((c) => c[0] === "insert").length, 3, "lotes de 500");
  await assert.rejects(() => s.saveRespostas([resp("x y", "A")]), /Identificador/);
  s._user = { id: "a1", papel: "admin" };
  chamadas.length = 0;
  resultado.data = [];
  await s.getEstatisticasItens({ step: "step2ck" });
  assert.deepEqual(chamadas.find((c) => c[0] === "rpc").slice(1), ["r2a_admin_estatisticas_itens", { p_step: "step2ck", p_incluir_tutor: false, p_todas_versoes: false }]);
});

test("schema: tabelas do banco com RLS, sem privilégio para anon e com funções do admin de search_path fixo", () => {
  const sql = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
  for (const t of ["questoes", "respostas_item", "simulados_completos", "anotacoes_item", "reportes_item", "resultados_oficiais", "modelos_psicometricos"]) {
    assert.match(sql, new RegExp("create table if not exists public\\." + t + " \\("));
    assert.match(sql, new RegExp("alter table public\\." + t + "\\s+enable row level security"));
  }
  assert.match(sql, /create policy questoes_select on public\.questoes for select to authenticated\s+using \(\(status = 'ativo' and \(select public\.pode_ler_banco\(\)\)\) or \(select public\.is_admin\(\)\)\)/);
  for (const f of ["r2a_admin_respostas_calibracao", "r2a_admin_estatisticas_itens", "r2a_admin_salvar_calibracao", "pode_ler_banco"]) {
    const bloco = sql.slice(sql.indexOf("create or replace function public." + f));
    assert.match(bloco.slice(0, 600), /security definer\s+set search_path = public/, f);
  }
  assert.match(sql, /revoke all on public\.questoes, public\.respostas_item, public\.simulados_completos, public\.anotacoes_item,\s+public\.reportes_item, public\.resultados_oficiais, public\.modelos_psicometricos from anon, authenticated;/);
});

test("rotinas do admin: recalibração com a turma (só itens com dados suficientes) e desfechos com NBME da coorte", async () => {
  const { prepararRecalibracao, aplicarRecalibracao, desfazerCalibracao, calibrarDesfechos, salvarModelo } = await import("../js/calibracao.js");
  const s = await loja();
  s.setDemoRole("participante");
  await assert.rejects(() => prepararRecalibracao({ store: s, step: "step1" }), PermissionError);
  s.setDemoRole("admin");
  const prep = await prepararRecalibracao({ store: s, step: "step1", minRespostas: 5 });
  assert.ok(prep.convergiu);
  assert.ok(prep.a_aplicar > 0 && prep.a_aplicar <= prep.itens.length);
  assert.equal(prep.demonstracao, true);
  const g = await aplicarRecalibracao({ store: s, preparo: prep });
  assert.equal(g.gravados, prep.a_aplicar);
  const b = await carregarBanco({ store: s });
  const cal = b.steps.step1.filter((q) => q.b_calibrado !== null);
  assert.equal(cal.length, prep.a_aplicar);
  /* ancoragem: nos itens recalibrados, o examinando no limiar mantém o escore de corte de Angoff */
  const soma = (f) => cal.reduce((acc, q) => acc + f(q), 0);
  const expit = (x) => 1 / (1 + Math.exp(-x));
  assert.ok(Math.abs(soma((q) => expit(-q.b_calibrado)) - soma((q) => q.angoff)) < 0.01);
  await desfazerCalibracao({ store: s, ids: cal.map((q) => q.id) });
  assert.equal((await carregarBanco({ store: s })).steps.step1.filter((q) => q.b_calibrado !== null).length, 0);
  const d = await calibrarDesfechos({ store: s, step: "step1" });
  assert.equal(d.pass_fail.suficiente, false, "sem resultados oficiais, o modelo de Pass/Fail não é ajustado");
  assert.ok(d.n.nbme > 0, "a coorte de demonstração tem NBMEs para a regressão de escore");
  const m = await salvarModelo({ store: s, step: "step1", desfechos: d });
  assert.equal(m.demonstracao, true);
  s.setDemoRole("participante");
  const modelos = await s.getModelosPsicometricos();
  assert.equal(modelos.step1.metodo, "regressao_logistica_e_linear_sobre_theta_eap");
  assert.equal(modelos.step2ck, null);
  await assert.rejects(() => s.saveModeloPsicometrico("step1", {}), PermissionError);
});

test("SupabaseStore: com schema antigo (sem profiles.ativo), o perfil continua lido e o admin não vira participante", async () => {
  const s = new SupabaseStore({ url: "x", anonKey: "y" });
  const selects = [];
  const q = (cols) => new Proxy({}, {
    get(_, p) {
      if (p === "then") return (ok) => ok(cols.includes("ativo") ? { data: null, error: { code: "42703", message: "column profiles.ativo does not exist" } } : { data: { id: "a1", email: "a@x", nome: "Adm", papel: "admin" }, error: null });
      return () => q(cols);
    }
  });
  s.client = { from: () => ({ select: (cols) => { selects.push(cols); return q(cols); } }) };
  await s._carregarPerfil({ id: "a1", email: "a@x" });
  assert.equal(s.user.papel, "admin");
  assert.equal(s.user.ativo, true);
  assert.equal(selects.length, 2);
});
