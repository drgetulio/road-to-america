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
  assert.equal(fila.filter((x) => !x.sintetico).length, 1);
  assert.ok(fila.filter((x) => x.sintetico).length >= 2, "a demonstração traz reportes fictícios sobre itens com defeito plantado");
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
  await assert.rejects(() => s.saveResultadoOficial({ user_id: "demo-participante", step: "step2ck", data: "2026-08-01", escore: 230, resultado: "fail" }), /não combina/);
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
  /* na demonstração, os desfechos fictícios das turmas anteriores bastam para a regressão */
  assert.equal(d.pass_fail.suficiente, true, "desfechos fictícios suficientes na demonstração");
  assert.ok(d.pass_fail.beta1 > 0 && d.pass_fail.auc > 0.8, "quem tem theta maior passa mais");
  const reais = new LocalStore({ storage: memoria(), bancosSimulado: { step1: [], step2ck: [] }, questoes: publicos });
  await reais.init({ seeds: [] });
  reais.setDemoRole("admin");
  reais._demo = async () => ({ respostas: [], desfechos: [], reportes: [] });
  assert.equal((await calibrarDesfechos({ store: reais, step: "step1" })).pass_fail.suficiente, false, "sem resultados oficiais, o modelo de Pass/Fail não é ajustado");
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

test("revisão de itens (LocalStore): gabarito com versão, recorreção das respostas, marca de revisão, status com motivo e histórico", async () => {
  const s = await loja();
  s.setDemoRole("participante");
  const q1 = publicos.find((q) => q.id === "s1-001");
  const nova = q1.alternativas.map((a) => a.letra).find((l) => l !== q1.correta);
  await s.saveRespostas([resp("s1-001", nova), resp("s1-001", q1.correta)]);
  await assert.rejects(() => s.editarGabarito("s1-001", { correta: nova, motivo: "Tentativa do aluno" }), PermissionError);
  await assert.rejects(() => s.marcarRevisaoQuestao("s1-001", { revisao: true }), PermissionError);
  await assert.rejects(() => s.listHistoricoQuestao("s1-001"), PermissionError);
  s.setDemoRole("admin");
  await s.salvarCalibracao([{ id: "s1-001", b: 0.2, ep: 0.3, n: 40 }]);
  await assert.rejects(() => s.editarGabarito("s1-001", { correta: nova, motivo: "ok" }), /motivo/);
  await assert.rejects(() => s.editarGabarito("s1-001", { correta: "J", motivo: "Letra que não existe" }), /alternativas/);
  await assert.rejects(() => s.editarGabarito("s1-001", { correta: q1.correta, motivo: "Mesma alternativa de antes" }), /já é o gabarito/);
  const r = await s.editarGabarito("s1-001", { correta: nova, motivo: "Referência revista pela equipe" });
  assert.deepEqual([r.versao, r.de, r.para, r.recorrigidas], [2, q1.correta, nova, 2]);
  const banco = await carregarBanco({ store: s, incluirInativos: true });
  const it = banco.porId.get("s1-001");
  assert.equal(it.correta, nova);
  assert.equal(it.versao, 2);
  assert.ok(!Number.isFinite(it.b_calibrado), "versão nova apaga a calibração");
  const minhas = (await s.listRespostas({ userId: "demo-participante" })).filter((x) => x.questao_id === "s1-001");
  assert.deepEqual(minhas.map((x) => [x.correta, x.versao_item]), [[true, 2], [false, 2]]);
  /* as respostas fictícias da demonstração seguem o gabarito em vigor */
  const fict = (await s.listRespostas({ todos: true })).filter((x) => x.sintetico && x.questao_id === "s1-001");
  assert.ok(fict.length > 0 && fict.every((x) => x.correta === (x.resposta === nova) && x.versao_item === 2));
  /* estatísticas só da versão atual: tudo foi levado à versão 2 */
  const est = (await s.getEstatisticasItens({ step: "step1" })).find((x) => x.questao_id === "s1-001");
  assert.ok(est.n >= 1);
  await s.marcarRevisaoQuestao("s1-002", { revisao: true, nota: "p abaixo de 0,20" });
  await s.setStatusQuestao("s1-003", "suspenso", { motivo: "Valores laboratoriais desatualizados" });
  const lista = await s.listQuestoes({ step: "step1", incluirInativas: true });
  assert.equal(lista.find((x) => x.id === "s1-002").em_revisao, true);
  assert.equal(lista.find((x) => x.id === "s1-002").revisao_nota, "p abaixo de 0,20");
  assert.equal(lista.find((x) => x.id === "s1-003").status, "suspenso");
  const hist = await s.listHistoricoQuestao();
  assert.deepEqual(hist.map((h) => [h.questao_id, h.acao, h.de, h.para]), [["s1-001", "gabarito", q1.correta, nova], ["s1-002", "revisao", "nao", "sim"], ["s1-003", "status", "ativo", "suspenso"]]);
  assert.equal(hist[0].motivo, "Referência revista pela equipe");
  assert.equal(hist[0].editor_id, "demo-admin");
  assert.equal((await s.listHistoricoQuestao("s1-003"))[0].motivo, "Valores laboratoriais desatualizados");
  /* sem recorreção as respostas ficam na versão 2; uma recorreção seguinte (versão 3
     para 4) só mexe nas respostas da versão em vigor, e as da versão 2 continuam fora */
  const r3 = await s.editarGabarito("s1-001", { correta: q1.correta, motivo: "Volta ao gabarito original", recorrigir: false });
  assert.deepEqual([r3.versao, r3.recorrigidas], [3, 0]);
  const terceira = q1.alternativas.map((a) => a.letra).find((l) => l !== q1.correta && l !== nova);
  const r4 = await s.editarGabarito("s1-001", { correta: terceira, motivo: "Teste de recorreção restrita", recorrigir: true });
  assert.equal(r4.versao, 4);
  const depois = (await s.listRespostas({ userId: "demo-participante" })).filter((x) => x.questao_id === "s1-001");
  assert.deepEqual(depois.map((x) => x.versao_item), [2, 2], "respostas da versão 2 não sobem para a 4");
  s.setDemoRole("participante");
  assert.equal((await s.listQuestoes({ step: "step1" })).find((x) => x.id === "s1-002").em_revisao, undefined, "o aluno não vê a marca de revisão");
});

test("demonstração: reportes e desfechos fictícios aparecem só para o admin, com selo, e não são apagados", async () => {
  const s = await loja();
  s.setDemoRole("admin");
  const reps = await s.listReportes({ todos: true });
  const fict = reps.find((r) => r.sintetico);
  assert.ok(fict && fict.status === "aberto");
  const res = await s.resolverReporte(fict.id, { status: "em_analise", resposta: "Conferindo a referência." });
  assert.equal(res.status, "em_analise");
  assert.equal((await s.listReportes({ todos: true })).find((r) => r.id === fict.id).status, "em_analise", "a resolução do reporte fictício fica gravada");
  const desf = await s.listResultadosOficiais({ todos: true });
  assert.ok(desf.length > 20 && desf.every((d) => d.sintetico && d.escore === null && ["pass", "fail"].includes(d.resultado)), "só Pass/Fail fictício, sem nota de três dígitos");
  await assert.rejects(() => s.deleteResultadoOficial(desf[0].id), /fictício/);
  s.setDemoRole("participante");
  assert.equal((await s.listReportes({ todos: true })).filter((r) => r.sintetico).length, 0);
  assert.equal((await s.listResultadosOficiais({ todos: true })).length, 0);
});

test("revisão de itens (SupabaseStore): passa pelas funções do banco com os parâmetros do schema", async () => {
  const sql = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
  const chamadas = [];
  const s = new SupabaseStore({ url: "x", anonKey: "y" });
  const tabela = (nome) => {
    const q = { nome, ops: [] };
    const p = new Proxy({}, { get(_, k) { if (k === "then") return (ok) => ok({ data: [], error: null }); return (...a) => { q.ops.push([k, ...a]); return p; }; } });
    chamadas.push(q);
    return p;
  };
  s.client = {
    from: tabela,
    rpc: (nome, params) => { chamadas.push({ rpc: nome, params }); return Promise.resolve({ data: { id: params.p_id, status: params.p_status, em_revisao: params.p_revisao, revisao_nota: params.p_nota, versao: 2 }, error: null }); }
  };
  s._user = { id: "a", papel: "admin", nome: "A", email: "a@x" };
  await s.editarGabarito("R2A-S1-0001", { correta: "b", motivo: "Referência revista" });
  await s.marcarRevisaoQuestao("R2A-S1-0001", { revisao: true, nota: "p baixo" });
  assert.deepEqual(await s.setStatusQuestao("R2A-S1-0001", "suspenso", { motivo: "Retirado" }), { id: "R2A-S1-0001", status: "suspenso" });
  await s.listHistoricoQuestao("R2A-S1-0001");
  await assert.rejects(() => s.editarGabarito("R2A-S1-0001", { correta: "B", motivo: "x" }), /motivo/);
  for (const c of chamadas) {
    if (c.rpc) {
      const m = new RegExp("create or replace function public\\." + c.rpc + "\\(([^)]*)\\)").exec(sql);
      assert.ok(m, "função " + c.rpc);
      for (const k of Object.keys(c.params)) assert.ok(m[1].includes(k + " "), "parâmetro " + k + " de " + c.rpc);
    } else {
      assert.match(sql, new RegExp("create table if not exists public\\." + c.nome + " \\("));
      for (const op of c.ops) if (op[0] === "eq" || op[0] === "order") assert.match(sql, new RegExp("\\n\\s+" + op[1] + "\\s"), "coluna " + op[1]);
    }
  }
  assert.equal(chamadas[0].params.p_correta, "B", "letra em maiúscula");
  s._user = { id: "p", papel: "participante", nome: "P", email: "p@x" };
  await assert.rejects(() => s.editarGabarito("R2A-S1-0001", { correta: "B", motivo: "Referência revista" }), PermissionError);
});
