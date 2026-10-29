/* Painel Angoff de juízes: cálculos (plataforma/js/angoff.js) e fluxo na camada de dados
   do modo demonstração (rodadas, gabarito só depois da estimativa, feedback, discussão,
   Hofstee e publicação com pelo menos 10 juízes). As regras do Supabase estão em
   supabase/teste-local/02-testa-rls.sql, blocos A1 a A8. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LocalStore } from "../../anki/js/store-local.js";
import { PermissionError } from "../../anki/js/permissions.js";
import { carregarBanco } from "../js/banco.js";
import {
  resumoRodada, hofstee, verificarHofstee, reprovacaoNoCorte, valoresParaPublicar, proximoEstado, rodadasFechadas,
  validarEstimativa, validarHofstee, validarPainel, pObservado, distribuicaoEscores, estatisticaItem, MIN_JUIZES, CORTE_EP_MAX,
  regraHofsteePublicacao, JUSTIFICATIVA_MIN
} from "../js/angoff.js";

const ler = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), "utf8"));
const publicos = [...ler("../../simulado/data/step1-questoes.json"), ...ler("../../simulado/data/step2ck-questoes.json")];
function memoria() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
async function loja() { const s = new LocalStore({ storage: memoria(), bancosSimulado: { step1: [], step2ck: [] }, questoes: publicos }); await s.init({ seeds: [] }); return s; }

test("Angoff modificado: corte é a média das médias dos itens; erro-padrão pelos cortes dos juízes", () => {
  const itens = ["a", "b"];
  const av = [];
  [[60, 40], [70, 50], [50, 30], [80, 60], [40, 20]].forEach(([va, vb], j) => { av.push({ juiz_id: "j" + j, questao_id: "a", rodada: 1, valor: va }, { juiz_id: "j" + j, questao_id: "b", rodada: 1, valor: vb }); });
  const r = resumoRodada(itens, av, 1);
  assert.equal(r.itens.a.media, 60);
  assert.equal(r.itens.b.media, 40);
  assert.equal(r.corte, 0.5);
  assert.equal(r.corte_bruto, 1, "escore de corte esperado em 2 itens");
  assert.equal(r.n_juizes_completos, 5);
  /* cortes dos juízes: 0.5, 0.6, 0.4, 0.7, 0.3 -> dp 0.158, ep 0.0707 */
  assert.ok(Math.abs(r.corte_ep - 0.1581 / Math.sqrt(5)) < 1e-3);
  assert.deepEqual(estatisticaItem([5, 15, 95, 100]).histograma, [1, 1, 0, 0, 0, 0, 0, 0, 0, 2]);
});

test("publicação: só itens com pelo menos 10 juízes na rodada final e erro-padrão do corte abaixo de 0,02", () => {
  const painel = { itens: ["a", "b"], rodada: 2 };
  const av = [];
  /* 10 juízes avaliam os dois itens; um 11º só o item a */
  for (let j = 0; j < 10; j++) av.push({ juiz_id: "j" + j, questao_id: "a", rodada: 2, valor: 60 + j }, { juiz_id: "j" + j, questao_id: "b", rodada: 2, valor: 50 + (j % 3) });
  av.push({ juiz_id: "j10", questao_id: "a", rodada: 2, valor: 65 });
  for (let j = 0; j < 12; j++) av.push({ juiz_id: "j" + j, questao_id: "b", rodada: 1, valor: 90 });
  const OK = { verificacao: { ok: true } };
  const r = valoresParaPublicar(painel, av, OK);
  assert.equal(r.bloqueado, false);
  assert.ok(r.corte_ep < 0.02);
  assert.deepEqual(r.publicar.map((x) => [x.questao_id, x.juizes]), [["a", 11], ["b", 10]]);
  assert.ok(Math.abs(r.publicar[0].angoff - 0.6455) < 1e-4);
  assert.ok(r.publicar[0].ep > 0 && r.publicar[0].ep < 0.02);
  assert.equal(MIN_JUIZES, 10);
  assert.equal(CORTE_EP_MAX, 0.02);
  /* 9 juízes: nenhum item passa */
  const nove = av.filter((a) => a.juiz_id !== "j9" && a.juiz_id !== "j10");
  assert.equal(valoresParaPublicar(painel, nove, OK).publicar.length, 0);
  /* juízes muito discordantes: erro-padrão do corte acima de 0,02 bloqueia a publicação */
  const disc = [];
  for (let j = 0; j < 10; j++) disc.push({ juiz_id: "j" + j, questao_id: "a", rodada: 2, valor: j % 2 ? 90 : 30 }, { juiz_id: "j" + j, questao_id: "b", rodada: 2, valor: j % 2 ? 90 : 30 });
  const rb = valoresParaPublicar(painel, disc, OK);
  assert.equal(rb.bloqueado, true);
  assert.equal(rb.publicar.length, 0);
  assert.match(rb.motivo, /Erro-padrão do corte/);
});

test("publicação exige Hofstee: sem resposta ou fora das janelas, só com justificativa registrada", () => {
  const painel = { itens: ["a", "b"], rodada: 1 };
  const av = [];
  for (let j = 0; j < 10; j++) av.push({ juiz_id: "j" + j, questao_id: "a", rodada: 1, valor: 60 + (j % 2) }, { juiz_id: "j" + j, questao_id: "b", rodada: 1, valor: 62 - (j % 2) });
  /* sem verificação de Hofstee */
  const sem = valoresParaPublicar(painel, av);
  assert.equal(sem.bloqueado, true);
  assert.equal(sem.publicar.length, 0);
  assert.match(sem.motivo, /Sem verificação de Hofstee.*justificativa de pelo menos 30/);
  /* verificação que não passa */
  const nao = valoresParaPublicar(painel, av, { verificacao: { ok: false, motivo: "O corte do Angoff fica fora da janela de corte aceitável dos juízes." } });
  assert.equal(nao.bloqueado, true);
  assert.match(nao.motivo, /não passa na verificação de Hofstee/);
  assert.equal(valoresParaPublicar(painel, av, { verificacao: { ok: false }, justificativa: "curta demais" }).bloqueado, true);
  const just = "Painel piloto com dois itens; Hofstee será refeito com a turma de 2027.";
  const comJust = valoresParaPublicar(painel, av, { verificacao: { ok: false }, justificativa: just });
  assert.equal(comJust.bloqueado, false);
  assert.equal(comJust.publicar.length, 2);
  assert.equal(comJust.exige_justificativa, true);
  assert.equal(valoresParaPublicar(painel, av, { verificacao: { ok: true } }).exige_justificativa, false);
  /* regra do servidor (a mesma do SQL): resposta válida e corte na janela de corte média */
  assert.equal(JUSTIFICATIVA_MIN, 30);
  const vazio = regraHofsteePublicacao(0.61, [], "");
  assert.ok(vazio.bloqueado && /Nenhum juiz respondeu o Hofstee/.test(vazio.motivo));
  assert.equal(regraHofsteePublicacao(0.61, [], just).bloqueado, false);
  const hofs = [{ k_min: 55, k_max: 70, f_min: 5, f_max: 20 }, { k_min: 57, k_max: 72, f_min: 4, f_max: 18 }];
  assert.equal(regraHofsteePublicacao(0.61, hofs).ok, true);
  const fora = regraHofsteePublicacao(0.75, hofs);
  assert.ok(fora.bloqueado && /fora da janela de corte dos juízes \(56 a 71%\)/.test(fora.motivo), fora.motivo);
  assert.equal(regraHofsteePublicacao(0.75, hofs, just).bloqueado, false);
});

test("Hofstee com escores comparáveis: escore esperado no formulário do painel pelo theta de cada pessoa", () => {
  const porId = new Map(["a", "b", "c", "d"].map((id, i) => [id, { id, b_angoff: i - 1.5 }]));
  /* u1 respondeu só os itens fáceis (fora do painel c, d) e acertou; u2 só os difíceis e acertou */
  const r = [
    ...["a", "b"].map((q) => ({ user_id: "u1", questao_id: q, correta: true, modo: "cronometrado", respondida_em: "2026-10-01" })),
    ...["c", "d"].map((q) => ({ user_id: "u2", questao_id: q, correta: true, modo: "cronometrado", respondida_em: "2026-10-01" }))
  ];
  const brutos = distribuicaoEscores(r, ["a", "b", "c", "d"], { minItens: 1 });
  assert.deepEqual(brutos, [100, 100], "a porcentagem bruta empata os dois");
  const esperados = distribuicaoEscores(r, ["a", "b", "c", "d"], { minItens: 1, porId });
  assert.ok(esperados[1] - esperados[0] > 5, "pelo theta, quem acertou os difíceis fica acima: " + esperados.map((x) => x.toFixed(1)).join(", "));
});

test("rodadas: avaliação, discussão e nova rodada até o máximo; feedback só das rodadas fechadas", () => {
  let p = { estado: "avaliacao", rodada: 1, rodadas_max: 2 };
  assert.deepEqual(rodadasFechadas(p), []);
  assert.throws(() => proximoEstado(p, "abrir_rodada"), /Feche/);
  p = { ...p, ...proximoEstado(p, "fechar_rodada") };
  assert.deepEqual(p, { estado: "discussao", rodada: 1, rodadas_max: 2 });
  assert.deepEqual(rodadasFechadas(p), [1]);
  p = { ...p, ...proximoEstado(p, "abrir_rodada") };
  assert.deepEqual([p.estado, p.rodada], ["avaliacao", 2]);
  assert.deepEqual(rodadasFechadas(p), [1]);
  p = { ...p, ...proximoEstado(p, "fechar_rodada") };
  assert.throws(() => proximoEstado(p, "abrir_rodada"), /última rodada/);
  p = { ...p, ...proximoEstado(p, "encerrar") };
  assert.throws(() => proximoEstado(p, "fechar_rodada"), /encerrado/);
});

test("validações: estimativa inteira de 0 a 100, Hofstee com janelas válidas, painel com nome e itens", () => {
  assert.deepEqual(validarEstimativa(0), []);
  assert.deepEqual(validarEstimativa(100), []);
  for (const v of [-1, 101, 50.5, "", null]) assert.equal(validarEstimativa(v).length, 1, String(v));
  assert.deepEqual(validarHofstee({ k_min: 50, k_max: 70, f_min: 5, f_max: 20 }), []);
  assert.match(validarHofstee({ k_min: 70, k_max: 50, f_min: 5, f_max: 20 }).join(), /corte mínimo/);
  assert.match(validarHofstee({ k_min: 50, k_max: 70, f_min: 25, f_max: 20 }).join(), /reprovação mínima/);
  assert.ok(validarPainel({ step: "step1", nome: "ok", itens: [] }).length >= 2);
  assert.deepEqual(validarPainel({ step: "step1", nome: "Painel A", itens: ["x"], rodadas_max: 3 }), []);
});

test("Hofstee: cruzamento da reta (k_min, f_max)-(k_max, f_min) com a curva de reprovação; verificação do corte do Angoff", () => {
  /* 100 examinandos com escores 1, 2, ..., 100: F(c) = c - 1 (em %) para c inteiro */
  const escores = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(reprovacaoNoCorte(escores, 50), 49);
  const juizes = [{ k_min: 40, k_max: 70, f_min: 10, f_max: 60 }, { k_min: 40, k_max: 70, f_min: 10, f_max: 60 }];
  const h = hofstee(juizes, escores);
  /* reta f = 60 - (c - 40) * 50 / 30 e curva F(c) = c - 1 */
  assert.ok(h.cruzou);
  /* c - 1 = 60 - (c - 40) * 5 / 3  ->  c = 47,9 */
  assert.ok(Math.abs(h.corte - 47.9) <= 0.3, "corte de Hofstee " + h.corte);
  const ok = verificarHofstee(0.55, h, escores);
  assert.equal(ok.ok, true);
  assert.equal(ok.dentro_janela_corte, true);
  const fora = verificarHofstee(0.75, h, escores);
  assert.equal(fora.ok, false);
  assert.match(fora.motivo, /fora da janela de corte/);
  const baixa = hofstee([{ k_min: 40, k_max: 70, f_min: 0, f_max: 1 }], Array(50).fill(10).concat(Array(50).fill(90)));
  assert.equal(baixa.corte, 40, "curva acima da reta: vai para o mínimo aceitável");
  assert.equal(hofstee([], escores).corte, null);
});

test("p observado e escores: primeira resposta de cada pessoa, sem modo tutor", () => {
  const r = [
    { user_id: "u1", questao_id: "a", correta: true, modo: "cronometrado", respondida_em: "2026-10-01" },
    { user_id: "u1", questao_id: "a", correta: false, modo: "cronometrado", respondida_em: "2026-10-02" },
    { user_id: "u2", questao_id: "a", correta: false, modo: "tutor", respondida_em: "2026-10-01" },
    { user_id: "u2", questao_id: "a", correta: false, modo: "cronometrado", respondida_em: "2026-10-03" },
    { user_id: "u2", questao_id: "b", correta: true, modo: "cronometrado", respondida_em: "2026-10-03" }
  ];
  assert.deepEqual(pObservado(r, ["a", "b"]), { a: { n: 2, acertos: 1, p: 0.5 }, b: { n: 1, acertos: 1, p: 1 } });
  assert.deepEqual(distribuicaoEscores(r, ["a", "b"], { minItens: 1 }), [50, 100]);
});

test("fluxo no modo demonstração: juízes, item sem gabarito até a estimativa, feedback, discussão, Hofstee e publicação", async () => {
  const s = await loja();
  s.setDemoRole("admin");
  const banco = await carregarBanco({ store: s });
  const itens = banco.steps.step1.slice(0, 6).map((q) => q.id);
  const possiveis = await s.listJuizesPossiveis();
  assert.ok(possiveis.length >= 7 && possiveis.some((p) => p.id === "demo-admin"));
  assert.ok(!possiveis.some((p) => p.id === "demo-participante"), "aluno com matrícula ativa não é juiz");
  await assert.rejects(() => s.criarPainelAngoff({ step: "step1", nome: "P", itens }), /nome/);
  assert.ok(possiveis.filter((p) => p.sintetico).length >= 10, "mentores fictícios suficientes para o mínimo de 10 juízes");
  const juizes = ["demo-admin", ...possiveis.filter((p) => p.sintetico).slice(0, 10).map((p) => p.id)];
  const p = await s.criarPainelAngoff({ step: "step1", nome: "Painel do formulário A", itens, rodadas_max: 2, juizes });
  await assert.rejects(() => s.designarJuizesAngoff(p.id, ["demo-participante"]), /matrícula ativa/);
  /* itens chegam sem gabarito; a estimativa revela */
  const doPainel = await s.listItensPainelAngoff(p.id);
  assert.equal(doPainel.length, 6);
  assert.ok(doPainel.every((q) => q.correta === undefined && q.explicacao === undefined && q.vinheta));
  assert.deepEqual(await s.revelarPainelAngoff(p.id).then((r) => Object.keys(r).length), 6, "o admin vê tudo");
  await assert.rejects(() => s.avaliarItemAngoff(p.id, itens[0], 101), /0 a 100/);
  const r1 = await s.avaliarItemAngoff(p.id, itens[0], 62, "distrator forte");
  assert.equal(r1.revelado.correta, banco.porId.get(itens[0]).correta);
  for (const id of itens.slice(1)) await s.avaliarItemAngoff(p.id, id, 55);
  assert.equal((await s.feedbackPainelAngoff(p.id)).estimativas.length, 0, "sem feedback com a rodada aberta");
  await s.avancarPainelAngoff(p.id, "fechar_rodada");
  const fb = await s.feedbackPainelAngoff(p.id);
  assert.equal(fb.rodadas_fechadas, 1);
  assert.equal(fb.estimativas.find((x) => x.questao_id === itens[0]).n, 11, "o admin e os 10 mentores fictícios");
  assert.ok(fb.p_observado[itens[0]].n > 0, "p observado da turma de demonstração");
  await assert.rejects(() => s.avaliarItemAngoff(p.id, itens[0], 60), /rodada de avaliação/);
  await s.comentarAngoff(p.id, { questao_id: itens[0], texto: "O limítrofe confunde B e C." });
  assert.equal((await s.listDiscussaoAngoff(p.id))[0].rodada, 1);
  await s.salvarHofsteeAngoff(p.id, { k_min: 55, k_max: 72, f_min: 5, f_max: 22 });
  await s.avancarPainelAngoff(p.id, "abrir_rodada");
  for (const id of itens) await s.avaliarItemAngoff(p.id, id, 60);
  await assert.rejects(() => s.publicarAngoff(p.id), /Encerre/);
  await s.avancarPainelAngoff(p.id, "encerrar");
  const av = await s.listAvaliacoesAngoff(p.id);
  const r2 = resumoRodada(itens, av, 2);
  assert.equal(r2.n_juizes, 11);
  assert.ok(r2.corte > 0.3 && r2.corte < 0.95);
  const hs = await s.listHofsteeAngoff(p.id);
  assert.equal(hs.length, 11, "o admin e os 10 fictícios responderam o Hofstee");
  /* sem Hofstee, a camada de dados recusa; com justificativa, publica e guarda o motivo */
  const ang = s._angoff();
  const guardados = ang.hofstee.filter((x) => x.painel_id === p.id);
  ang.hofstee = ang.hofstee.filter((x) => x.painel_id !== p.id);
  await assert.rejects(() => s.publicarAngoff(p.id), /Nenhum juiz respondeu o Hofstee/);
  const pj = await s.publicarAngoff(p.id, { justificativa: "Teste: Hofstee perdido na migração, refazer na próxima rodada." });
  assert.equal(pj.hofstee_ok, false);
  assert.match(pj.justificativa, /migração/);
  ang.hofstee.push(...guardados);
  const pub = await s.publicarAngoff(p.id);
  assert.equal(pub.publicados, 6);
  const depois = await carregarBanco({ store: s });
  const q = depois.porId.get(itens[0]);
  assert.equal(q.angoff_origem, "painel");
  assert.equal(q.angoff_painel_juizes, 11);
  assert.ok(q.angoff_painel_ep > 0, "o erro-padrão do item vai junto");
  assert.equal(q.angoff, valoresParaPublicar({ itens, rodada: 2 }, av, { verificacao: { ok: true } }).publicar[0].angoff);
  assert.equal(pub.hofstee_ok, true, "corte de 60% dentro da janela média dos juízes");
  assert.equal(q.angoff_item, banco.porId.get(itens[0]).angoff, "o Angoff do item fica guardado para a montagem dos formulários");
  /* o participante não vê o painel */
  s.setDemoRole("participante");
  assert.deepEqual(await s.listPaineisAngoff(), []);
  await assert.rejects(() => s.listItensPainelAngoff(p.id), PermissionError);
  await assert.rejects(() => s.avancarPainelAngoff(p.id, "encerrar"), PermissionError);
});

test("camada remota: toda função e tabela usada pelo SupabaseStore existe no schema", () => {
  const js = readFileSync(new URL("../../anki/js/store-supabase.js", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
  const rpcs = [...new Set([...js.matchAll(/rpc\("([a-z0-9_]+)"/g)].map((m) => m[1]))];
  const tabelas = [...new Set([...js.matchAll(/from\("([a-z0-9_]+)"\)/g)].map((m) => m[1]))];
  assert.ok(rpcs.includes("r2a_angoff_avaliar") && rpcs.includes("r2a_responder") && rpcs.includes("r2a_corrigir_simulado"));
  for (const f of rpcs) assert.match(sql, new RegExp("create or replace function public\\." + f + "\\("), "função " + f);
  for (const t of tabelas) assert.match(sql, new RegExp("create table if not exists public\\." + t + " \\("), "tabela " + t);
  for (const f of ["r2a_angoff_itens", "r2a_angoff_avaliar", "r2a_angoff_revelar", "r2a_angoff_feedback", "r2a_admin_angoff_avancar", "r2a_admin_publicar_angoff"]) {
    const bloco = sql.slice(sql.indexOf("create or replace function public." + f + "("));
    assert.match(bloco.slice(0, 400), /security definer\s+set search_path = public/, f);
    assert.match(sql, new RegExp("revoke all on function public\\." + f + "\\([^)]*\\) from public, anon;"), f + " sem anon");
  }
});
