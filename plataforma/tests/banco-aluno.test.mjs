/* Testes da lógica do banco de questões no espaço do aluno (plataforma/js/banco-aluno.js) */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { montarBanco, sistemasDoOutline } from "../js/banco.js";
import { rng } from "../js/simulado.js";
import { expit, prepararRespostas, eap, simularRespostas, normalAleatoria, bDoItem } from "../js/psicometria.js";
import { gerarBancoSintetico } from "./sintetico.mjs";
import {
  historicoItens, situacaoItem, filtrarPool, contagemFacetas, validarPedidoBloco, sortearBlocoBanco, criarBlocoBanco,
  confirmarResposta, travada, paraRespostasBanco, resumoBlocos, blocoPorArea, curvaEvolucao, contribuicaoPorArea,
  linksDeEstudo, recomendacoes, resumoAprovacao, estatisticasAluno, curvaPosterior, chavesDaDimensao, LIMITES_BLOCO, FILTROS_STEP
} from "../js/banco-aluno.js";
import { encerrar, responder, irPara, alternarMarca } from "../../simulado/js/sessao.js";
import { validarResposta, normalizarResposta } from "../js/registros.js";

const banco = montarBanco(gerarBancoSintetico({ porStep: 400, semente: 7 }), { origem: "teste" });
const publico = montarBanco([
  ...JSON.parse(await readFile(new URL("../../simulado/data/step1-questoes.json", import.meta.url), "utf8")),
  ...JSON.parse(await readFile(new URL("../../simulado/data/step2ck-questoes.json", import.meta.url), "utf8"))
], { origem: "demonstracao" });

const resp = (questao_id, resposta, correta, extra = {}) => ({ questao_id, resposta, correta, modo: "cronometrado", origem: "banco", respondida_em: "2026-10-01T10:00:00.000Z", marcada: false, ...extra });

test("histórico por item: primeira e última tentativa, em branco, marca mais recente", () => {
  const h = historicoItens([
    resp("a", "B", false, { respondida_em: "2026-10-01T10:00:00Z", marcada: true }),
    resp("a", "C", true, { respondida_em: "2026-10-02T10:00:00Z" }),
    resp("b", null, false, { respondida_em: "2026-10-01T10:00:00Z" }),
    resp("c", "A", true, { respondida_em: "2026-10-03T10:00:00Z", marcada: true })
  ]);
  assert.equal(h.get("a").n, 2);
  assert.equal(h.get("a").primeira_correta, false);
  assert.equal(h.get("a").ultima_correta, true);
  assert.equal(h.get("a").marcada, false, "a marca vale pela tentativa mais recente");
  assert.equal(h.get("b").em_branco_ultima, true);
  assert.equal(h.get("b").primeira_correta, null);
  assert.deepEqual(situacaoItem("a", h), { nao_vistas: false, erradas: false, marcadas: false, todas: true });
  assert.deepEqual(situacaoItem("b", h), { nao_vistas: false, erradas: true, marcadas: false, todas: true });
  assert.deepEqual(situacaoItem("c", h), { nao_vistas: false, erradas: false, marcadas: true, todas: true });
  assert.equal(situacaoItem("z", h).nao_vistas, true);
});

test("filtros: ou dentro da dimensão, e entre dimensões, disciplinas com todos os rótulos", () => {
  const s1 = banco.steps.step1;
  const cardio = filtrarPool(banco, { step: "step1", selecao: { sistema: ["cardiovascular"] } });
  assert.equal(cardio.length, s1.filter((q) => q.sistema === "cardiovascular").length);
  const dois = filtrarPool(banco, { step: "step1", selecao: { sistema: ["cardiovascular", "gastrointestinal"] } });
  assert.equal(dois.length, s1.filter((q) => ["cardiovascular", "gastrointestinal"].includes(q.sistema)).length);
  const comFarm = filtrarPool(banco, { step: "step1", selecao: { sistema: ["cardiovascular"], disciplina: ["farmacologia"] } });
  assert.ok(comFarm.every((q) => q.sistema === "cardiovascular" && q.disciplinas.includes("farmacologia")));
  /* Step 2 CK: disciplina clínica secundária também entra */
  const ped = filtrarPool(banco, { step: "step2ck", selecao: { disciplina_oficial: ["pediatria"] } });
  assert.equal(ped.length, banco.steps.step2ck.filter((q) => q.disciplinas_oficiais.includes("pediatria")).length);
  assert.ok(ped.some((q) => q.disciplina_oficial !== "pediatria"), "há item com pediatria como disciplina secundária");
  /* situação */
  const vistos = s1.slice(0, 30);
  const h = historicoItens(vistos.map((q, i) => resp(q.id, "A", i % 3 === 0, { marcada: i % 5 === 0 })));
  assert.equal(filtrarPool(banco, { step: "step1", situacao: "nao_vistas", historico: h }).length, s1.length - 30);
  assert.equal(filtrarPool(banco, { step: "step1", situacao: "erradas", historico: h }).length, 20);
  assert.equal(filtrarPool(banco, { step: "step1", situacao: "marcadas", historico: h }).length, 6);
});

test("contagem por faceta ignora o filtro da própria dimensão", () => {
  const c = contagemFacetas(banco, { step: "step1", selecao: { sistema: ["cardiovascular"] } });
  const totalSist = Object.values(c.dims.sistema).reduce((a, b) => a + b, 0);
  assert.equal(totalSist, banco.steps.step1.length, "a faceta de sistema conta todos os sistemas");
  const totalComp = Object.values(c.dims.competencia).reduce((a, b) => a + b, 0);
  assert.equal(totalComp, banco.steps.step1.filter((q) => q.sistema === "cardiovascular").length);
  assert.equal(c.disponiveis, totalComp);
  assert.equal(c.situacoes.todas, totalComp);
  assert.equal(c.situacoes.nao_vistas, totalComp);
  for (const f of FILTROS_STEP.step2ck) assert.ok(contagemFacetas(banco, { step: "step2ck" }).dims[f.dim], f.dim);
});

test("pedido de bloco: 1 a 20 itens, até 40 no modo livre, modos tutor e cronometrado", () => {
  assert.deepEqual(validarPedidoBloco({ step: "step1", n: 20, modo: "tutor" }), []);
  assert.equal(validarPedidoBloco({ step: "step1", n: 21, modo: "tutor" }).length, 1);
  assert.deepEqual(validarPedidoBloco({ step: "step1", n: 40, modo: "cronometrado", livre: true }), []);
  assert.equal(validarPedidoBloco({ step: "step1", n: 41, modo: "cronometrado", livre: true }).length, 1);
  assert.equal(validarPedidoBloco({ step: "step1", n: 0, modo: "tutor" }).length, 1);
  assert.equal(validarPedidoBloco({ step: "x", n: 5, modo: "y" }).length, 2);
  assert.equal(validarPedidoBloco({ step: "step1", n: 5, modo: "tutor", disponiveis: 0 }).length, 1);
});

test("sorteio do bloco: reprodutível, sem repetição, não vistas primeiro e estratificado", () => {
  const pool = filtrarPool(banco, { step: "step1" });
  const h = historicoItens(pool.slice(0, 200).map((q) => resp(q.id, "A", true)));
  const a = sortearBlocoBanco(pool, { n: 20, semente: 5, historico: h });
  const b = sortearBlocoBanco(pool, { n: 20, semente: 5, historico: h });
  assert.deepEqual(a.map((q) => q.id), b.map((q) => q.id));
  assert.equal(new Set(a.map((q) => q.id)).size, 20);
  assert.ok(a.every((q) => !h.has(q.id)), "com 200 não vistas, nenhuma vista entra");
  assert.ok(new Set(a.map((q) => q.sistema)).size >= 7, "pelo menos 7 sistemas num bloco de 20");
  assert.equal(sortearBlocoBanco(pool.slice(0, 3), { n: 20, semente: 1 }).length, 3, "pool menor que o pedido");
});

test("sessão do bloco: cronometrado com 90 s por item, tutor confirma e trava", () => {
  const itens = banco.steps.step1.slice(0, 10);
  const t0 = Date.parse("2026-10-29T12:00:00Z");
  const s = criarBlocoBanco({ step: "step1", itens, modo: "cronometrado", agora: t0, criterios: { situacao: "todas" }, dono: "u1" });
  assert.equal(s.limite_ms, 10 * LIMITES_BLOCO.ritmo_ms);
  assert.equal(s.origem, "banco");
  assert.match(s.id, /^bq-/);
  assert.equal(travada(s, 0), false);
  const t = criarBlocoBanco({ step: "step1", itens, modo: "tutor", agora: t0 });
  assert.equal(t.limite_ms, LIMITES_BLOCO.tutor_limite_ms);
  assert.throws(() => confirmarResposta(t, 0), /Escolha uma alternativa/);
  responder(t, 0, "B");
  confirmarResposta(t, 0);
  assert.equal(travada(t, 0), true);
  assert.equal(travada(t, 1), false);
  assert.throws(() => criarBlocoBanco({ step: "step1", itens: banco.steps.step1.slice(0, 21), modo: "tutor" }), /de 1 a 20/);
  assert.equal(criarBlocoBanco({ step: "step1", itens: banco.steps.step1.slice(0, 40), modo: "tutor", livre: true }).ids.length, 40);
  /* anotações já existentes entram na sessão */
  const comNotas = criarBlocoBanco({ step: "step1", itens: itens.slice(0, 2), modo: "tutor", notas: ["nota antiga", ""] });
  assert.deepEqual(comNotas.notas, ["nota antiga", ""]);
});

test("respostas do bloco encerrado: válidas para a camada de dados, com acerto, tempo e posição", () => {
  const itens = banco.steps.step1.slice(0, 5);
  const t0 = Date.parse("2026-10-29T12:00:00Z");
  const s = criarBlocoBanco({ step: "step1", itens, modo: "cronometrado", agora: t0 });
  responder(s, 0, itens[0].correta);
  irPara(s, 1, t0 + 60000);
  responder(s, 1, itens[1].correta === "A" ? "B" : "A");
  alternarMarca(s, 1);
  irPara(s, 2, t0 + 100000);
  assert.throws(() => paraRespostasBanco(s, banco.porId), /Encerre/);
  encerrar(s, t0 + 130000, "participante");
  const r = paraRespostasBanco(s, banco.porId);
  assert.equal(r.length, 5);
  assert.deepEqual(r.map((x) => x.posicao), [0, 1, 2, 3, 4]);
  assert.equal(r[0].correta, true);
  assert.equal(r[1].correta, false);
  assert.equal(r[1].marcada, true);
  assert.equal(r[2].resposta, null);
  assert.equal(r[0].tempo_ms, 60000);
  assert.equal(r[1].tempo_ms, 40000);
  assert.equal(r[2].tempo_ms, 30000);
  assert.ok(r.every((x) => x.sessao_id === s.id && x.origem === "banco" && x.modo === "cronometrado"));
  for (const x of r) assert.deepEqual(validarResposta(normalizarResposta(x), t0 + 200000), [], "resposta válida");
  /* histórico e resultado do bloco */
  const blocos = resumoBlocos(r, banco.porId);
  assert.equal(blocos.length, 1);
  assert.equal(blocos[0].acertos, 1);
  assert.equal(blocos[0].em_branco, 3);
  assert.equal(blocos[0].marcadas, 1);
  assert.equal(blocos[0].tempo_ms, 130000);
  assert.ok(Math.abs(blocos[0].esperado_limiar - itens.reduce((a, q) => a + q.angoff, 0) / 5) < 1e-12);
  const area = blocoPorArea(blocos[0], banco.porId, "sistema");
  assert.equal(area.reduce((a, x) => a + x.total, 0), 5);
});

test("histórico de blocos separa sessões, ignora simulados e ordena do mais recente", () => {
  const ids = banco.steps.step1.slice(0, 4).map((q) => q.id);
  const l = [
    resp(ids[0], "A", true, { sessao_id: "x", posicao: 0, respondida_em: "2026-10-01T10:00:00Z" }),
    resp(ids[1], "A", false, { sessao_id: "x", posicao: 1, respondida_em: "2026-10-01T10:00:00Z", modo: "tutor" }),
    resp(ids[2], "A", true, { sessao_id: "y", posicao: 0, respondida_em: "2026-10-05T10:00:00Z" }),
    resp(ids[3], "A", true, { sessao_id: "z", posicao: 0, origem: "simulado", respondida_em: "2026-10-06T10:00:00Z" })
  ];
  const b = resumoBlocos(l, banco.porId);
  assert.deepEqual(b.map((x) => x.id), ["y", "x"]);
  assert.equal(b[1].modo, "tutor");
  assert.equal(b[1].n, 2);
});

test("curva de evolução: um ponto por sessão, acumulando as respostas até a data", () => {
  const its = banco.steps.step1.slice(0, 60);
  const l = [];
  its.forEach((q, i) => l.push(resp(q.id, "A", i % 4 !== 0, { sessao_id: "s" + Math.floor(i / 20), posicao: i % 20, respondida_em: "2026-10-0" + (1 + Math.floor(i / 20)) + "T10:00:00Z" })));
  const c = curvaEvolucao({ respostas: l, itens: banco.porId, step: "step1" });
  assert.equal(c.length, 3);
  assert.deepEqual(c.map((p) => p.n), [20, 40, 60]);
  assert.ok(c.every((p) => p.sessao_total === 20 && p.sessao_acertos === 15));
  const { usadas } = prepararRespostas(l, banco.porId, { step: "step1" });
  assert.ok(Math.abs(c[2].p_aprovacao - eap(usadas).p_aprovacao) < 1e-12, "o último ponto é a estimativa atual");
  assert.equal(curvaEvolucao({ respostas: l, itens: banco.porId, step: "step1", maxPontos: 2 }).length, 2);
  assert.equal(curvaEvolucao({ respostas: l, itens: banco.porId, step: "step2ck" }).length, 0);
});

test("contribuição por área: a área fraca derruba a probabilidade; no limiar, ganho zero", () => {
  const random = rng(3);
  const its = banco.steps.step1;
  /* aluno um pouco acima do limiar em tudo, mas bem abaixo em cardiovascular */
  const l = its.map((q) => {
    const theta = q.sistema === "cardiovascular" ? -1.5 : 0.6;
    const p = expit(theta - bDoItem(q));
    return resp(q.id, "A", random() < p);
  });
  const { usadas } = prepararRespostas(l, banco.porId, { step: "step1" });
  const c = contribuicaoPorArea(usadas, "sistema", { step: "step1" });
  assert.equal(c[0].chave, "cardiovascular", "cardiovascular é a que mais derruba");
  assert.ok(c[0].ganho > 0 && c[0].deficit > 0);
  assert.ok(c[c.length - 1].ganho < 0, "uma área forte tem ganho negativo (sustenta a probabilidade)");
  assert.ok(c.every((x) => x.p_atual === c[0].p_atual));
  assert.equal(c[0].peso_prova, 0.09, "faixa oficial de 7% a 11%");
  /* área com respostas iguais ao esperado do limiar: ganho perto de zero */
  const q0 = its.filter((q) => q.sistema === "gastrointestinal");
  const fracionadas = [{ b: 0, x: 1, w: 0.5, item: { sistema: "gastrointestinal" } }, { b: 0, x: 0, w: 0.5, item: { sistema: "gastrointestinal" } }];
  const c2 = contribuicaoPorArea(fracionadas, "sistema", { step: "step1" });
  assert.ok(Math.abs(c2[0].ganho) < 1e-9, "acertar metade de itens com Angoff 0,5 é exatamente o limiar");
  assert.ok(q0.length > 0);
  /* disciplinas: item conta em cada rótulo */
  const cd = contribuicaoPorArea(usadas, "disciplinas", { step: "step1" });
  const somaN = cd.reduce((a, x) => a + x.n, 0);
  assert.equal(somaN, usadas.reduce((a, u) => a + u.item.disciplinas.length, 0));
});

test("links de estudo: conteúdo do Step 1, flashcards e bloco filtrado", () => {
  const l = linksDeEstudo("step1", "sistema", "cardiovascular");
  assert.deepEqual(l.map((x) => x.tipo), ["conteudo", "flashcards", "banco"]);
  assert.equal(l[0].href, "../conteudo-step1.html#s-cardio");
  assert.equal(l[1].href, "../anki/#/estudar?sistema=cardiovascular&modo=treino");
  assert.equal(l[2].href, "#/criar?step=step1&situacao=nao_vistas&sistema=cardiovascular");
  const ck = linksDeEstudo("step2ck", "sistema", "nervoso_sentidos", { base: "../questoes/#/", situacao: "erradas" });
  assert.equal(ck[0].href, "../conteudo-step1.html#s-neuro");
  assert.equal(ck[1].href, "../anki/#/estudar?sistema=comportamento_nervoso&modo=treino");
  assert.equal(ck[2].href, "../questoes/#/criar?step=step2ck&situacao=erradas&sistema=nervoso_sentidos");
  const disc = linksDeEstudo("step1", "disciplinas", "farmacologia");
  assert.equal(disc[0].href, "../anki/#/estudar?disciplina=farmacologia&modo=treino");
  assert.match(disc[1].href, /disciplina=farmacologia/);
  const comp = linksDeEstudo("step2ck", "competencia", "farmacoterapia");
  assert.deepEqual(comp.map((x) => x.tipo), ["banco"]);
});

test("âncoras do Conteúdo do Step 1 existem na página", async () => {
  const html = await readFile(new URL("../../conteudo-step1.html", import.meta.url), "utf8");
  for (const sis of sistemasDoOutline("step1")) {
    const a = linksDeEstudo("step1", "sistema", sis)[0].href.split("#")[1];
    assert.ok(html.includes('id="' + a + '"'), sis + " -> #" + a);
  }
  for (const sis of sistemasDoOutline("step2ck")) {
    const a = linksDeEstudo("step2ck", "sistema", sis)[0].href.split("#")[1];
    assert.ok(html.includes('id="' + a + '"'), sis + " -> #" + a);
  }
});

test("painel de aprovação: aluno simulado forte, fraco, sem respostas e Step 2 CK sem nota de três dígitos", () => {
  const random = rng(11);
  const its = banco.steps.step1;
  const gerar = (theta, n) => its.slice(0, n).map((q) => resp(q.id, "A", random() < expit(theta - bDoItem(q))));
  const forte = resumoAprovacao({ banco, respostas: gerar(1.2, 250), step: "step1" });
  assert.ok(forte.est.p_aprovacao > 0.97);
  assert.equal(forte.est.confianca.rotulo, "alta_confianca");
  assert.equal(forte.prontidao.status, "insuficiente", "sem NBME, a EXIT 18 fica insuficiente");
  assert.match(forte.prontidao.mensagem, /complementar/);
  const fraco = resumoAprovacao({ banco, respostas: gerar(-1.2, 250), step: "step1" });
  assert.ok(fraco.est.p_aprovacao < 0.03);
  assert.ok(fraco.recomendacoes.some((r) => r.tipo === "area"), "recomendações por área");
  assert.ok(fraco.recomendacoes.filter((r) => r.tipo === "area" && r.dim === "sistema").every((r, i, a) => i === 0 || a[i - 1].ganho >= r.ganho));
  const vazio = resumoAprovacao({ banco, respostas: [], step: "step1" });
  assert.equal(vazio.est.n, 0);
  assert.equal(vazio.est.confianca.rotulo, "estimativa_preliminar");
  assert.equal(vazio.prontidao.complementar, null);
  assert.ok(vazio.recomendacoes.some((r) => r.tipo === "cobertura") && vazio.recomendacoes.some((r) => r.tipo === "volume"));
  const ck = resumoAprovacao({ banco, respostas: banco.steps.step2ck.slice(0, 40).map((q) => resp(q.id, "A", true)), step: "step2ck" });
  assert.equal(ck.est.escore, null, "sem conversão para três dígitos");
  assert.match(ck.limiar_texto, /218/);
  assert.ok(ck.est.avisos.some((a) => /três dígitos/.test(a)));
  /* a EXIT 18 continua decidindo */
  const nbme = [{ step: "step1", modo: "standard", data: "2026-10-01", probabilidade: 95, faixa_acima_aprovacao_baixa: true }, { step: "step1", modo: "standard", data: "2026-10-15", probabilidade: 93, faixa_acima_aprovacao_baixa: true }];
  const comNbme = resumoAprovacao({ banco, respostas: gerar(-1.2, 250), step: "step1", nbme });
  assert.equal(comNbme.prontidao.status, "pronto");
  assert.equal(comNbme.prontidao.divergente, true, "banco com alta confiança abaixo do limiar: pede conversa com o mentor");
});

test("calibração da recomendação: em 300 alunos simulados, a área mais fraca é a sorteada como fraca", () => {
  const random = rng(20261029);
  const its = banco.steps.step1;
  const sistemas = sistemasDoOutline("step1");
  let acertos = 0;
  const N = 300;
  for (let k = 0; k < N; k++) {
    const fraca = sistemas[Math.floor(random() * sistemas.length)];
    const theta = normalAleatoria(random) * 0.5;
    const amostra = its.filter(() => random() < 0.5);
    const l = amostra.map((q) => resp(q.id, "A", random() < expit((q.sistema === fraca ? theta - 1.5 : theta) - bDoItem(q))));
    const { usadas } = prepararRespostas(l, banco.porId, { step: "step1" });
    if (contribuicaoPorArea(usadas, "sistema", { step: "step1" })[0].chave === fraca) acertos++;
  }
  /* com cerca de 200 itens, a área sorteada como fraca precisa ser apontada em pelo menos 80% dos casos */
  assert.ok(acertos / N >= 0.8, "acertou " + acertos + " de " + N);
});

test("estatísticas do aluno e curva posterior", () => {
  const its = banco.steps.step1.slice(0, 10);
  const l = its.map((q, i) => resp(q.id, i < 3 ? null : "A", i % 2 === 0, { marcada: i === 4 }));
  const st = estatisticasAluno(banco, historicoItens(l), "step1");
  assert.equal(st.vistos, 10);
  assert.equal(st.nao_vistos, banco.steps.step1.length - 10);
  assert.equal(st.primeira_respondidas, 7);
  assert.equal(st.marcados, 1);
  const cp = curvaPosterior(l, banco.porId, "step1");
  assert.ok(cp.pontos.length > 100 && cp.pontos[0][0] === -4);
  const area = cp.pontos.reduce((s, p, i, a) => (i ? s + 0.5 * (p[1] + a[i - 1][1]) * (p[0] - a[i - 1][0]) : 0), 0);
  assert.ok(area > 0.95 && area <= 1.0001, "área da densidade entre -4 e 4 perto de 1: " + area);
});

test("chaves das dimensões seguem o outline e funcionam com os 80 itens públicos", () => {
  assert.deepEqual(chavesDaDimensao("step1", "sistema"), sistemasDoOutline("step1"));
  assert.deepEqual(chavesDaDimensao("step1", "sistema", ["xyz"]).slice(-1), ["xyz"]);
  const c = contagemFacetas(publico, { step: "step2ck" });
  assert.equal(Object.values(c.dims.area).reduce((a, b) => a + b, 0), 40);
  const r = resumoAprovacao({ banco: publico, respostas: publico.steps.step2ck.slice(0, 20).map((q) => resp(q.id, "A", true)), step: "step2ck" });
  assert.equal(r.est.n, 20);
  assert.equal(r.itens_no_banco, 40);
});

test("revisão independente: linha repetida (reenvio ou cópia pendente) conta uma vez no histórico de blocos", () => {
  const ids = banco.steps.step1.slice(0, 3).map((q) => q.id);
  const l = ids.map((id, i) => resp(id, "A", i === 0, { sessao_id: "dup", posicao: i }));
  const b = resumoBlocos(l.concat(l.map((x) => ({ ...x }))), banco.porId);
  assert.equal(b.length, 1);
  assert.equal(b[0].n, 3);
  assert.equal(b[0].acertos, 1);
});

test("revisão independente: em branco no bloco cronometrado é erro (pular itens não infla a probabilidade); no tutor sai", () => {
  const itens = banco.steps.step1.slice(0, 60);
  const t = (i) => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
  const random = rng(31);
  const certo = itens.map(() => random() < 0.55);
  const respondeu = itens.map((q, i) => resp(q.id, certo[i] ? q.correta : "Z", certo[i], { respondida_em: t(i) }));
  const pulou = itens.map((q, i) => resp(q.id, certo[i] ? q.correta : null, certo[i], { respondida_em: t(i) }));
  const pR = eap(prepararRespostas(respondeu, banco.porId, { step: "step1" }).usadas).p_aprovacao;
  const pP = eap(prepararRespostas(pulou, banco.porId, { step: "step1" }).usadas).p_aprovacao;
  assert.ok(Math.abs(pR - pP) < 1e-12, "deixar em branco no cronometrado vale o mesmo que errar");
  const tutor = pulou.map((r) => ({ ...r, modo: "tutor" }));
  const u = prepararRespostas(tutor, banco.porId, { step: "step1" }).usadas;
  assert.equal(u.length, certo.filter(Boolean).length, "no tutor, o item em branco fica fora");
});

test("revisão independente: contribuição por área (base calculada uma vez) igual à conta direta com eap", () => {
  const random = rng(77);
  const itens = banco.steps.step1.slice(0, 150).map((q, i) => ({ ...q, b_calibrado: bDoItem(q) + 0.3 * normalAleatoria(random), _i: i }));
  const porId = new Map(itens.map((q) => [q.id, q]));
  const l = itens.map((q, i) => { const ac = random() < expit(-0.2 - q.b_calibrado); return resp(q.id, ac ? q.correta : "Z", ac, { modo: i % 4 ? "cronometrado" : "tutor", respondida_em: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() }); });
  const { usadas } = prepararRespostas(l, porId, { step: "step1" });
  for (const dim of ["sistema", "disciplinas", "competencia"]) {
    const base = eap(usadas).p_aprovacao;
    for (const c of contribuicaoPorArea(usadas, dim, { step: "step1" })) {
      const alt = [];
      for (const u of usadas) {
        const v = u.item[dim];
        if (!(Array.isArray(v) ? v : [v]).includes(c.chave)) { alt.push(u); continue; }
        const a = expit(-u.b);
        alt.push({ b: u.b, x: 1, w: u.w * a }, { b: u.b, x: 0, w: u.w * (1 - a) });
      }
      assert.ok(Math.abs(c.ganho - (eap(alt).p_aprovacao - base)) < 1e-10, dim + " " + c.chave);
    }
  }
});
