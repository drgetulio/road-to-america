/* Psicometria: Rasch ancorado, EAP, confiança, perfil, análise de itens,
   recalibração e regressão com desfechos. Os testes de simulação usam
   examinandos de habilidade conhecida (gerador com semente, resultado fixo). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eap, bDeAngoff, expit, logit, normalAleatoria, percentualEsperado, posteriorGrade, itensParaPrecisao, classificarConfianca,
  cobertura, perfilPorArea, estimarAluno, prontidaoCombinada, analisarItens, recalibrarRasch, regressaoLogistica,
  ajustarDesfechos, probAprovacaoDesfechos, ajustarEscore, preverEscore, montarDadosDesfechos, correlacao, normalCdf,
  REGRA_CONFIANCA, PADRAO_STEP2CK, prepararRespostas, itensMinimos
} from "../js/psicometria.js";
import { montarBanco, sistemasDoOutline } from "../js/banco.js";
import { rng } from "../js/simulado.js";
import { gerarBancoSintetico } from "./sintetico.mjs";

const GRADE_RAPIDA = { min: -6, max: 6, passo: 0.02 };

test("Rasch ancorado: no limiar (theta = 0) a probabilidade de acerto é o Angoff do item", () => {
  for (const a of [0.45, 0.62, 0.65, 0.8]) assert.ok(Math.abs(expit(0 - bDeAngoff(a)) - a) < 1e-12);
  assert.ok(Math.abs(logit(expit(1.234)) - 1.234) < 1e-12);
  assert.ok(Math.abs(normalCdf(1.2815515655446004) - 0.9) < 1e-6);
});

test("EAP sem respostas devolve a priori N(0; 1,5²); mais acertos sobem theta; resultado determinístico", () => {
  const vazio = eap([]);
  assert.ok(Math.abs(vazio.theta) < 1e-6);
  assert.ok(Math.abs(vazio.dp - 1.5) < 0.01);
  assert.ok(Math.abs(vazio.p_aprovacao - 0.5) < 1e-6);
  const bs = Array.from({ length: 40 }, (_, i) => bDeAngoff(0.45 + (i % 8) * 0.05));
  const metade = eap(bs.map((b, i) => ({ b, x: i % 2 })));
  const muitos = eap(bs.map((b, i) => ({ b, x: i % 5 ? 1 : 0 })));
  assert.ok(muitos.theta > metade.theta);
  assert.ok(muitos.p_aprovacao > metade.p_aprovacao);
  assert.ok(metade.ic90[0] < metade.theta && metade.theta < metade.ic90[1]);
  assert.deepEqual(eap(bs.map((b, i) => ({ b, x: i % 2 }))), metade);
  /* peso 0 é o mesmo que excluir; peso 2 é o mesmo que repetir a resposta */
  const r = [{ b: 0, x: 1 }, { b: 0.5, x: 0 }];
  assert.deepEqual(eap([...r, { b: 1, x: 1, w: 0 }]).theta, eap(r).theta);
  assert.ok(Math.abs(eap([{ b: 0, x: 1, w: 2 }]).theta - eap([{ b: 0, x: 1 }, { b: 0, x: 1 }]).theta) < 1e-9);
});

test("calibração da P(aprovação): entre examinandos simulados que recebem P perto de 0,9, cerca de 90% estão de fato acima do limiar", () => {
  const random = rng(20261029);
  const angs = Array.from({ length: 400 }, () => [0.8, 0.65, 0.45][Math.floor(random() * 3)] + (random() - 0.5) * 0.16);
  const bs = angs.map(bDeAngoff);
  const res = [];
  for (let j = 0; j < 2500; j++) {
    const theta = 1.5 * normalAleatoria(random);
    const n = 40 + Math.floor(random() * 160);
    const rs = [];
    for (let k = 0; k < n; k++) { const b = bs[Math.floor(random() * bs.length)]; rs.push({ b, x: random() < expit(theta - b) ? 1 : 0 }); }
    /* só a incerteza da medida (sigmaCorte 0): aqui o padrão é conhecido */
    const e = eap(rs, { grade: GRADE_RAPIDA, sigmaCorte: 0 });
    assert.equal(e.p_aprovacao, e.p_medida);
    res.push({ p: e.p_aprovacao, aprovado: theta > 0, dentro: e.ic90[0] <= theta && theta <= e.ic90[1] });
  }
  const faixa = (lo, hi) => { const s = res.filter((r) => r.p >= lo && r.p < hi); return { n: s.length, real: s.filter((r) => r.aprovado).length / s.length, media: s.reduce((a, r) => a + r.p, 0) / s.length }; };
  const f90 = faixa(0.85, 0.95);
  assert.ok(f90.n >= 60, "amostra suficiente perto de 0,9 (" + f90.n + ")");
  assert.ok(Math.abs(f90.real - f90.media) < 0.07, "proporção real " + f90.real.toFixed(3) + " para P média " + f90.media.toFixed(3));
  for (const [lo, hi] of [[0, 0.1], [0.1, 0.5], [0.5, 0.9], [0.9, 1.0001]]) {
    const f = faixa(lo, hi);
    assert.ok(Math.abs(f.real - f.media) < 0.08, "faixa " + lo + "-" + hi + ": real " + f.real.toFixed(3) + " para " + f.media.toFixed(3));
  }
  const alta = res.filter((r) => r.p >= 0.9);
  assert.ok(alta.filter((r) => r.aprovado).length / alta.length >= 0.95, "P >= 0,90 acerta a aprovação em pelo menos 95% dos casos simulados");
  const cob = res.filter((r) => r.dentro).length / res.length;
  assert.ok(cob > 0.87 && cob < 0.93, "intervalo de 90% cobre o theta verdadeiro em " + cob.toFixed(3));
});

test("percentual esperado: no limiar é a média dos Angoff; com mais habilidade sobe; intervalo contém a média", () => {
  const angs = [0.45, 0.65, 0.8, 0.7, 0.55];
  const bs = angs.map(bDeAngoff);
  const post0 = posteriorGrade([], { priori: { media: 0, dp: 0.01 } });
  const pe0 = percentualEsperado(post0, bs);
  assert.ok(Math.abs(pe0.limiar - angs.reduce((a, b) => a + b, 0) / angs.length) < 1e-12);
  assert.ok(Math.abs(pe0.media - pe0.limiar) < 1e-3);
  const post1 = posteriorGrade([], { priori: { media: 1, dp: 0.3 } });
  const pe1 = percentualEsperado(post1, bs);
  assert.ok(pe1.media > pe0.media);
  assert.ok(pe1.ic90[0] < pe1.media && pe1.media < pe1.ic90[1]);
});

test("regra de confiança: alta só com P decidida, N mínimo de itens e 80% dos sistemas; senão diz quantos itens faltam", () => {
  const sist = ["a", "b", "c", "d", "e"];
  const cob = cobertura({ a: 3, b: 1, c: 2, d: 1 }, sist, { minPorSistema: 1 });
  assert.equal(cob.proporcao, 0.8);
  /* mínimo padrão: 5 itens por sistema e metade do que o peso pede */
  assert.equal(cobertura({ a: 3, b: 1, c: 2, d: 1 }, sist).proporcao, 0);
  const cp = cobertura({ a: 40, b: 6, c: 5, d: 5, e: 4 }, sist, { pesos: { a: 0.6, b: 0.1, c: 0.1, d: 0.1, e: 0.1 }, nTotal: 60 });
  assert.deepEqual(cp.minimos, { a: 18, b: 5, c: 5, d: 5, e: 5 });
  assert.deepEqual(cp.faltando, ["e"]);
  assert.deepEqual(cob.faltando, ["e"]);
  const base = { theta: 0.5, dp: 0.24, n_efetivo: 80, n_minimo: 75, cob };
  assert.equal(classificarConfianca({ ...base, p: 0.93 }).rotulo, "precisao_alta");
  assert.match(classificarConfianca({ ...base, p: 0.93 }).texto, /^Precisão alta em relação ao padrão do banco \(padrão provisório\)$/);
  assert.doesNotMatch(classificarConfianca({ ...base, p: 0.93, origemCorte: "painel" }).texto, /provisório/);
  /* com o padrão incerto, perto do limiar nenhum número de itens decide */
  const lim = classificarConfianca({ ...base, p: 0.7, theta: 0.3, dp: 0.2, sigmaCorte: 0.4 });
  assert.equal(lim.faltam_itens, null);
  assert.equal(lim.padrao_limita, true);
  assert.equal(classificarConfianca({ ...base, p: 0.05, theta: -0.5 }).alta, true);
  const poucos = classificarConfianca({ ...base, p: 0.99, n_efetivo: 40 });
  assert.equal(poucos.rotulo, "estimativa_preliminar");
  assert.equal(poucos.faltam_itens, 35);
  assert.match(poucos.motivos.join(" "), /mínimo/);
  assert.equal(classificarConfianca({ ...base, p: 0.93, cob: cobertura({ a: 1 }, sist) }).alta, false);
  const perto = classificarConfianca({ ...base, p: 0.55, theta: 0.02, dp: 0.2 });
  assert.equal(perto.perto_do_limiar, true);
  assert.equal(perto.faltam_itens, null, "perto do limiar, mais itens quase não mudam a decisão");
  const quase = classificarConfianca({ ...base, p: 0.85, theta: 0.3, dp: 0.29, infoMedia: 0.2 });
  assert.equal(quase.faltam_itens, itensParaPrecisao(0.29, 0.3 / 1.2815515655446004, 0.2));
  assert.equal(itensParaPrecisao(0.4, 0.25, 0.2), Math.ceil((1 / 0.0625 - 1 / 0.16) / 0.2));
  /* N mínimo na prática: com Angoff de 0,45 a 0,80, perto de 70 a 80 itens */
  const n = itensMinimos([0.45, 0.65, 0.65, 0.8].map(bDeAngoff));
  assert.ok(n >= 65 && n <= 85, "n = " + n);
  /* o examinando no limiar com N itens chega mesmo a dp perto de 0,25 */
  const bs = Array.from({ length: n }, (_, i) => bDeAngoff([0.45, 0.65, 0.65, 0.8][i % 4]));
  const meio = eap(bs.map((b) => ({ b, x: expit(-b) > 0.6 ? 1 : 0 })));
  assert.ok(meio.dp < 0.3);
});

test("perfil por área: abaixo, igual ou acima do examinando no limiar, com incerteza e mínimo de itens", () => {
  const b = bDeAngoff(0.65);
  const mk = (area, acertos, total) => Array.from({ length: total }, (_, i) => ({ b, x: i < acertos ? 1 : 0, w: 1, item: { sistema: area } }));
  const usadas = [...mk("forte", 28, 30), ...mk("fraco", 8, 30), ...mk("meio", 13, 20), ...mk("pouco", 3, 3)];
  const p = Object.fromEntries(perfilPorArea(usadas, "sistema").map((x) => [x.chave, x]));
  assert.equal(p.forte.classe, "mais_alto");
  assert.equal(p.fraco.classe, "mais_baixo");
  assert.equal(p.meio.classe, "igual");
  assert.equal(p.pouco.classe, "insuficiente");
  assert.ok(Math.abs(p.meio.esperado_limiar - 0.65) < 1e-9);
});

test("estimarAluno: primeira resposta conta; tutor com peso 0,5; em branco no tutor sai e no cronometrado é erro; avisos do Step 2 CK", () => {
  const banco = montarBanco(gerarBancoSintetico({ porStep: 120, semente: 8 }));
  const ids = banco.steps.step2ck.map((q) => q.id);
  const corretas = new Map(banco.steps.step2ck.map((q) => [q.id, q.correta]));
  const t = (i) => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
  const respostas = [
    { questao_id: ids[0], resposta: corretas.get(ids[0]), correta: true, modo: "cronometrado", origem: "banco", respondida_em: t(1) },
    { questao_id: ids[0], resposta: "Z", correta: false, modo: "cronometrado", origem: "banco", respondida_em: t(2) },
    { questao_id: ids[1], resposta: null, correta: false, modo: "cronometrado", origem: "banco", respondida_em: t(3) },
    { questao_id: ids[2], resposta: null, correta: false, modo: "cronometrado", origem: "simulado", respondida_em: t(4) },
    { questao_id: ids[3], resposta: corretas.get(ids[3]), correta: true, modo: "tutor", origem: "banco", respondida_em: t(5) },
    { questao_id: "fora-do-banco", resposta: "A", correta: true, modo: "cronometrado", origem: "banco", respondida_em: t(6) },
    { questao_id: ids[4], resposta: null, correta: false, modo: "tutor", origem: "banco", respondida_em: t(7) }
  ];
  const { usadas, ignoradas } = prepararRespostas(respostas, banco.porId, { step: "step2ck" });
  /* em branco no bloco cronometrado do banco é erro, como na prova; em branco no tutor sai */
  assert.deepEqual(usadas.map((u) => [u.questao_id, u.x, u.w]), [[ids[0], 1, 1], [ids[1], 0, 1], [ids[2], 0, 1], [ids[3], 1, 0.5]]);
  assert.equal(ignoradas, 1);
  const e = estimarAluno({ step: "step2ck", respostas, itens: banco.porId, sistemas: sistemasDoOutline("step2ck") });
  assert.equal(e.n, 4);
  assert.equal(e.n_efetivo, 3.5);
  assert.equal(e.base, "angoff");
  assert.equal(e.oficial, false);
  assert.equal(e.confianca.rotulo, "estimativa_preliminar");
  assert.ok(e.confianca.faltam_itens_minimo > 0);
  assert.ok(e.confianca.faltam_itens === null ? e.confianca.padrao_limita || e.confianca.perto_do_limiar : e.confianca.faltam_itens > 0);
  assert.equal(e.limiar.escore_oficial, PADRAO_STEP2CK);
  assert.match(e.avisos.join(" "), /218/);
  assert.match(e.avisos.join(" "), /três dígitos só será estimada depois da calibração/);
  assert.equal(e.escore, null, "sem modelo de escores reais, nenhuma nota de três dígitos");
  assert.ok(e.percentual_esperado.itens === 120);
  assert.deepEqual(Object.keys(e.perfil), ["sistema", "disciplinas_oficiais", "competencia", "area"]);
});

test("estimarAluno com aluno simulado forte e muitas respostas chega à precisão alta", () => {
  const banco = montarBanco(gerarBancoSintetico({ porStep: 400, semente: 9 }));
  const random = rng(77);
  const theta = 1.0;
  const respostas = banco.steps.step1.slice(0, 160).map((q, i) => {
    const acerto = random() < expit(theta - q.b_angoff);
    return { questao_id: q.id, resposta: acerto ? q.correta : "Z", correta: acerto, modo: "cronometrado", origem: "banco", respondida_em: new Date(Date.UTC(2026, 8, 1) + i * 60000).toISOString() };
  });
  const e = estimarAluno({ step: "step1", respostas, itens: banco.porId, sistemas: sistemasDoOutline("step1") });
  assert.ok(e.n_efetivo >= e.confianca.n_minimo, "n " + e.n_efetivo + " para mínimo " + e.confianca.n_minimo);
  assert.ok(e.dp < 0.3, "dp " + e.dp);
  assert.ok(e.p_aprovacao >= 0.9);
  assert.equal(e.confianca.rotulo, "precisao_alta");
  assert.ok(e.cobertura.proporcao >= 0.8);
  assert.equal(e.confianca.faltam_itens, 0);
});

test("prontidão combinada: a EXIT 18 decide; o banco só complementa e aponta divergência", () => {
  const bancoAlto = { p_aprovacao: 0.96, confianca: { alta: true, rotulo: "alta_confianca" }, base: "angoff" };
  const bancoBaixo = { p_aprovacao: 0.04, confianca: { alta: true, rotulo: "alta_confianca" }, base: "angoff" };
  const prelim = { p_aprovacao: 0.97, confianca: { alta: false, rotulo: "estimativa_preliminar" }, base: "angoff" };
  assert.equal(prontidaoCombinada({ exit18: { status: "insuficiente" }, banco: bancoAlto }).status, "insuficiente", "o banco sozinho nunca declara pronto");
  assert.equal(prontidaoCombinada({ exit18: { status: "pronto" }, banco: bancoBaixo }).divergente, true);
  assert.equal(prontidaoCombinada({ exit18: { status: "pronto" }, banco: prelim }).divergente, false);
  assert.equal(prontidaoCombinada({ exit18: { status: "nao_pronto" }, banco: bancoAlto }).divergente, true);
  assert.equal(prontidaoCombinada({ exit18: { status: "nao_pronto" }, banco: bancoAlto }).status, "nao_pronto");
  assert.match(prontidaoCombinada({ exit18: { status: "pronto" }, banco: null }).regra, /EXIT 18 decide/);
});

test("análise de itens: p, ponto-bisserial corrigida conferida à mão, distratores e alertas", () => {
  /* 6 pessoas, 3 itens. Item Q1 com gabarito C. */
  const itens = new Map(["Q1", "Q2", "Q3"].map((id) => [id, { id, step: "step1", correta: "C", b_angoff: 0, alternativas: ["A", "B", "C", "D", "E"].map((l) => ({ letra: l })) }]));
  const m = { 1: ["C", "C", "C"], 2: ["C", "C", "A"], 3: ["B", "C", "C"], 4: ["C", "A", "A"], 5: ["B", "A", "A"], 6: ["B", "B", "A"] };
  const respostas = [];
  for (const [p, rs] of Object.entries(m)) rs.forEach((r, i) => respostas.push({ pessoa: p, questao_id: "Q" + (i + 1), resposta: r, correta: r === "C" }));
  const a = analisarItens(respostas, itens);
  const q1 = a.itens.find((x) => x.questao_id === "Q1");
  assert.equal(q1.n, 6);
  assert.equal(q1.p, 3 / 6);
  /* resto de cada pessoa sem o Q1: (1,2: 2/2 e 1/2), 3: 2/2, 4: 0/2, 5: 0/2, 6: 0/2 */
  const x = [1, 1, 0, 1, 0, 0], resto = [1, 0.5, 1, 0, 0, 0];
  assert.ok(Math.abs(q1.pbis - correlacao(x, resto)) < 1e-12);
  assert.equal(q1.opcoes.find((o) => o.letra === "B").n, 3);
  assert.equal(q1.n_superior, 1);
  assert.ok(q1.alertas.some((al) => al.codigo === "amostra_pequena"));

  /* item com gabarito trocado: os melhores marcam B (a resposta "certa" de fato) */
  const random = rng(5);
  const thetas = Array.from({ length: 300 }, () => normalAleatoria(random));
  const big = [];
  const itensBig = new Map();
  for (let i = 0; i < 30; i++) itensBig.set("I" + i, { id: "I" + i, step: "step1", correta: "A", b_angoff: (i - 15) / 10, alternativas: ["A", "B", "C", "D", "E"].map((l) => ({ letra: l })) });
  itensBig.set("ERRADO", { id: "ERRADO", step: "step1", correta: "A", b_angoff: 0, alternativas: ["A", "B", "C", "D", "E"].map((l) => ({ letra: l })) });
  itensBig.set("FACIL", { id: "FACIL", step: "step1", correta: "A", b_angoff: -5, alternativas: ["A", "B", "C", "D", "E"].map((l) => ({ letra: l })) });
  thetas.forEach((t, j) => {
    for (let i = 0; i < 30; i++) { const ok = random() < expit(t - (i - 15) / 10); big.push({ pessoa: "p" + j, questao_id: "I" + i, resposta: ok ? "A" : "C", correta: ok }); }
    const sabe = random() < expit(t);
    big.push({ pessoa: "p" + j, questao_id: "ERRADO", resposta: sabe ? "B" : "A", correta: !sabe });
    const f = random() < 0.99;
    big.push({ pessoa: "p" + j, questao_id: "FACIL", resposta: f ? "A" : "D", correta: f });
  });
  const ab = analisarItens(big, itensBig);
  const errado = ab.itens.find((x) => x.questao_id === "ERRADO");
  const cods = errado.alertas.map((al) => al.codigo);
  assert.ok(errado.pbis < 0);
  assert.ok(cods.includes("pbis_negativa"));
  assert.ok(cods.includes("distrator_atrai_melhores"));
  assert.ok(cods.includes("desajuste_rasch"), "item com gabarito trocado também desajusta no Rasch");
  const facil = ab.itens.find((x) => x.questao_id === "FACIL");
  assert.ok(facil.alertas.some((al) => al.codigo === "p_alto"));
  assert.ok(facil.alertas.some((al) => al.codigo === "distrator_nao_funcional"));
  const bom = ab.itens.find((x) => x.questao_id === "I15");
  assert.ok(bom.pbis > 0.2);
  assert.ok(bom.infit > 0.7 && bom.infit < 1.3 && bom.outfit > 0.7 && bom.outfit < 1.3, "item que segue o modelo fica dentro de 0,7 a 1,3");
  assert.equal(bom.revisar, false);
  assert.ok(ab.resumo.a_revisar >= 2);

  /* item que segue o Rasch, mas cujo Angoff errou a dificuldade em 1 logit: o ajuste
     mede a forma da curva, então não deve acusar desajuste */
  const deslocado = [];
  const itensD = new Map([...itensBig].filter(([k]) => k.startsWith("I")));
  itensD.set("ANGOFF_ERRADO", { id: "ANGOFF_ERRADO", step: "step1", correta: "A", b_angoff: -1, alternativas: ["A", "B", "C", "D", "E"].map((l) => ({ letra: l })) });
  thetas.forEach((t, j) => {
    for (let i = 0; i < 30; i++) { const ok = random() < expit(t - (i - 15) / 10); deslocado.push({ pessoa: "p" + j, questao_id: "I" + i, resposta: ok ? "A" : "C", correta: ok }); }
    const ok = random() < expit(t - 0);
    deslocado.push({ pessoa: "p" + j, questao_id: "ANGOFF_ERRADO", resposta: ok ? "A" : "C", correta: ok });
  });
  const ad = analisarItens(deslocado, itensD).itens.find((x) => x.questao_id === "ANGOFF_ERRADO");
  assert.ok(ad.b_ajuste > -0.4 && ad.b_ajuste < 0.4, "b do ajuste perto do verdadeiro (0): " + ad.b_ajuste);
  assert.ok(!ad.alertas.some((al) => al.codigo === "desajuste_rasch"), "Angoff deslocado não é desajuste: infit " + ad.infit + ", outfit " + ad.outfit);
});

test("prepararRespostas: resposta a uma versão anterior do item não é pontuada e consome a primeira exposição", () => {
  const itens = new Map([["X", { id: "X", step: "step1", versao: 2, b_angoff: 0 }], ["Y", { id: "Y", step: "step1", versao: 1, b_angoff: 0 }]]);
  const rs = [
    { questao_id: "X", correta: false, versao_item: 1, modo: "cronometrado", origem: "banco", resposta: "A", respondida_em: "2026-10-01T10:00:00Z" },
    { questao_id: "X", correta: true, versao_item: 2, modo: "cronometrado", origem: "banco", resposta: "B", respondida_em: "2026-10-02T10:00:00Z" },
    { questao_id: "Y", correta: true, versao_item: null, modo: "cronometrado", origem: "banco", resposta: "B", respondida_em: "2026-10-02T10:00:00Z" }
  ];
  const { usadas, ignoradas } = prepararRespostas(rs, itens, { step: "step1" });
  assert.deepEqual(usadas.map((u) => u.questao_id), ["Y"]);
  assert.equal(ignoradas, 1);
});

test("recuperação de parâmetros do Rasch: a recalibração regularizada recupera as dificuldades verdadeiras", () => {
  const random = rng(31);
  const I = 200, J = 500;
  const itens = new Map();
  const bVerdade = [];
  for (let i = 0; i < I; i++) {
    const ang = [0.8, 0.65, 0.45][i % 3] + (random() - 0.5) * 0.1;
    const b0 = bDeAngoff(ang);
    const bv = b0 + 0.5 * normalAleatoria(random);
    bVerdade.push(bv);
    itens.set("I" + i, { id: "I" + i, angoff: ang, b_angoff: b0 });
  }
  /* centra as dificuldades verdadeiras para que a ancoragem da curva do teste coincida */
  const thetas = Array.from({ length: J }, () => 1.0 * normalAleatoria(random));
  const respostas = [];
  thetas.forEach((t, j) => {
    const idx = [...Array(I).keys()].sort(() => random() - 0.5).slice(0, 120);
    for (const i of idx) respostas.push({ pessoa: j, questao_id: "I" + i, correta: random() < expit(t - bVerdade[i]) });
  });
  const r = recalibrarRasch(respostas, itens);
  assert.ok(r.convergiu);
  const est = new Map(r.itens.map((x) => [x.id, x.b]));
  const bE = [...Array(I).keys()].map((i) => est.get("I" + i));
  const bA = [...Array(I).keys()].map((i) => itens.get("I" + i).b_angoff);
  /* compara sem a translação (a ancoragem define a origem pelo Angoff) */
  const mE = bE.reduce((a, b) => a + b, 0) / I, mV = bVerdade.reduce((a, b) => a + b, 0) / I;
  const rmse = Math.sqrt(bE.reduce((s, b, i) => s + (b - mE - (bVerdade[i] - mV)) ** 2, 0) / I);
  const rmseAngoff = Math.sqrt(bA.reduce((s, b, i) => s + (b - bA.reduce((x, y) => x + y, 0) / I - (bVerdade[i] - mV)) ** 2, 0) / I);
  assert.ok(correlacao(bE, bVerdade) > 0.93, "correlação " + correlacao(bE, bVerdade).toFixed(3));
  assert.ok(rmse < 0.3, "rmse " + rmse.toFixed(3));
  assert.ok(rmse < rmseAngoff / 1.5, "a calibração melhora o Angoff (" + rmse.toFixed(3) + " contra " + rmseAngoff.toFixed(3) + ")");
  /* ancoragem: o escore de corte de Angoff fica igual */
  const corteAng = bA.reduce((s, b) => s + expit(-b), 0), corteNovo = bE.reduce((s, b) => s + expit(-b), 0);
  assert.ok(Math.abs(corteAng - corteNovo) < 1e-6);
  const thE = new Map(r.pessoas.map((p) => [Number(p.pessoa), p.theta]));
  assert.ok(correlacao(thetas, thetas.map((_, j) => thE.get(j))) > 0.9);
  assert.ok(r.itens.every((x) => x.ep > 0 && x.n > 0));
});

test("regressão logística e desfechos: recupera coeficientes, exige eventos suficientes, integra a incerteza", () => {
  const random = rng(12);
  const X = [], y = [];
  for (let i = 0; i < 4000; i++) { const t = 1.5 * normalAleatoria(random); X.push([t]); y.push(random() < expit(0.4 + 1.8 * t) ? 1 : 0); }
  const m = regressaoLogistica(X, y);
  assert.ok(m.convergiu);
  assert.ok(Math.abs(m.beta[0] - 0.4) < 0.15 && Math.abs(m.beta[1] - 1.8) < 0.2, JSON.stringify(m.beta));
  const poucos = ajustarDesfechos([{ theta: 1, resultado: "pass" }, { theta: -1, resultado: "fail" }, { theta: 0.5, resultado: "pass" }]);
  assert.equal(poucos.suficiente, false);
  const regs = X.slice(0, 300).map((x, i) => ({ theta: x[0], resultado: y[i] ? "pass" : "fail" }));
  const d = ajustarDesfechos(regs);
  assert.equal(d.suficiente, true);
  assert.ok(d.auc > 0.8);
  /* a regressão é calibrada sobre o EAP: dp não entra de novo (não conta o erro de medida duas vezes) */
  const p0 = probAprovacaoDesfechos(d, { theta: 0.5, dp: 0 });
  const p1 = probAprovacaoDesfechos(d, { theta: 0.5, dp: 0.8 });
  assert.equal(p1, p0, "dp é ignorado");
  const esc = ajustarEscore(X.slice(0, 40).map((x) => ({ theta: x[0], escore: Math.round(230 + 12 * x[0] + 8 * normalAleatoria(random)) })));
  assert.equal(esc.suficiente, true);
  assert.ok(Math.abs(esc.b - 12) < 5);
  const pr = preverEscore(esc, { theta: 0, dp: 0.2 });
  assert.ok(pr.p_limiar > 0.5 && pr.ic90[0] < pr.media && pr.media < pr.ic90[1]);
  assert.equal(ajustarEscore([{ theta: 0, escore: 220 }]).suficiente, false);
});

test("montarDadosDesfechos usa só as respostas dadas até a data da prova", () => {
  const itens = new Map([["A", { id: "A", step: "step1", b_angoff: 0 }], ["B", { id: "B", step: "step1", b_angoff: 0 }]]);
  const rs = new Map([["u1", [
    { questao_id: "A", resposta: "C", correta: true, modo: "cronometrado", origem: "banco", respondida_em: "2026-05-01T10:00:00Z" },
    { questao_id: "B", resposta: "D", correta: false, modo: "cronometrado", origem: "banco", respondida_em: "2026-07-01T10:00:00Z" }
  ]]]);
  const d = montarDadosDesfechos([{ user_id: "u1", step: "step1", data: "2026-06-01", resultado: "pass" }], rs, itens);
  assert.equal(d.length, 1);
  assert.equal(d[0].n, 1);
  assert.ok(d[0].theta > 0);
});

test("textoProbabilidade: o mesmo texto em todas as telas, sem cruzar os cortes da alta confiança", async () => {
  const { textoProbabilidade } = await import("../js/psicometria.js");
  assert.equal(textoProbabilidade(0), "< 1%");
  assert.equal(textoProbabilidade(0.004), "< 1%");
  assert.equal(textoProbabilidade(0.37), "37%");
  assert.equal(textoProbabilidade(0.374), "37%");
  assert.equal(textoProbabilidade(0.9), "90%");
  assert.equal(textoProbabilidade(0.897), "89,7%", "abaixo do corte de 90% não pode aparecer como 90%");
  assert.equal(textoProbabilidade(0.8999), "89,9%");
  assert.equal(textoProbabilidade(0.1), "10%");
  assert.equal(textoProbabilidade(0.103), "10,3%", "acima do corte de 10% não pode aparecer como 10%");
  assert.equal(textoProbabilidade(0.996), "> 99%");
  assert.equal(textoProbabilidade(1), "> 99%");
  assert.equal(textoProbabilidade(null), "sem dados");
  assert.equal(textoProbabilidade(Number.NaN), "sem dados");
});

/* ---------- correções da rodada 1 da banca (29/10/2026) ---------- */
import { pAcimaDoCorte, incertezaCorte, intervaloRelativo, ponderarPeloOutline, intervaloDesfechos, estimarEfeitoModo, INCERTEZA_CORTE } from "../js/psicometria.js";

/* Validação do sigma_c provisório (PSICOMETRIA.md, seção 6.1). Formulário de 280 itens
   com a mistura 20/55/25, erro de cada item com DP de 0,6 logit em torno da
   dificuldade-alvo e o banco inteiro deslocado (vies) em relação a ela. Erro: a
   classificação decidida (P >= 0,90 ou <= 0,10) do lado errado do limiar verdadeiro.
   Os números da tabela da seção 6.1 saem daqui (semente 20261029). */
function cenarioPadrao({ vies, sigma, media = 0, n = 500 }) {
  const random = rng(20261029);
  const angs = Array.from({ length: 280 }, (_, i) => [0.85, 0.69, 0.5][i % 20 < 4 ? 0 : i % 20 < 15 ? 1 : 2] + (random() - 0.5) * 0.08);
  const b0 = angs.map(bDeAngoff);
  const r2 = rng(7);
  const bv = b0.map((b) => b + vies + 0.6 * normalAleatoria(r2));
  let alta = 0, erro = 0;
  for (let j = 0; j < n; j++) {
    const th = media + 0.8 * normalAleatoria(r2);
    const rs = b0.map((b, i) => ({ b, x: r2() < expit(th - bv[i]) ? 1 : 0 }));
    const e = eap(rs, { grade: { min: -6, max: 6, passo: 0.05 }, sigmaCorte: sigma });
    if (e.p_aprovacao >= 0.9 || e.p_aprovacao <= 0.1) { alta++; if ((e.p_aprovacao >= 0.9) !== (th > 0)) erro++; }
  }
  return { decididos: alta / n, taxa: alta ? erro / alta : 0 };
}

test("incerteza do padrão: com sigma_c = 0,7 a classificação decidida erra menos de 4% até 0,75 logit de viés; 1,0 logit é o limite documentado", () => {
  const sig = INCERTEZA_CORTE.provisorio;
  assert.equal(sig, 0.7);
  const sem = cenarioPadrao({ vies: -0.5, sigma: 0 });
  assert.ok(sem.taxa > 0.12, "sem a incerteza do padrão, com viés de 0,5 logit a precisão alta erra " + (100 * sem.taxa).toFixed(1) + "%");
  const antigo = cenarioPadrao({ vies: -0.75, sigma: 0.4 });
  assert.ok(antigo.taxa > 0.08, "com o sigma antigo de 0,4 e viés de 0,75 logit, erra " + (100 * antigo.taxa).toFixed(1) + "%");
  for (const vies of [0, -0.5, 0.5, -0.75, 0.75]) {
    const r = cenarioPadrao({ vies, sigma: sig });
    assert.ok(r.taxa < 0.04, "viés " + vies + ": erra " + (100 * r.taxa).toFixed(1) + "%");
  }
  /* limite do método: com o banco 1,0 logit mais fácil o erro volta a subir */
  const limite = cenarioPadrao({ vies: -1.0, sigma: sig });
  assert.ok(limite.taxa > 0.02 && limite.taxa < 0.09, "viés de 1,0 logit: " + (100 * limite.taxa).toFixed(1) + "% (documentado como limite)");
  /* numa população realista (theta médio +0,9) a maioria ainda é classificada */
  const real = cenarioPadrao({ vies: -0.75, sigma: sig, media: 0.9 });
  assert.ok(real.decididos > 0.6 && real.taxa < 0.02, JSON.stringify(real));
});

test("incertezaCorte: provisório 0,7; painel pelo erro-padrão em logit, com piso; P e intervalo relativo, também com o corte deslocado", () => {
  assert.equal(incertezaCorte([{ b: 0, x: 1 }]).sigma, 0.7);
  assert.equal(incertezaCorte([{ b: 0, x: 1, item: { angoff_origem: "painel", angoff: 0.5, angoff_painel_ep: 0.02 } }]).sigma, 0.1, "0,02 / 0,25 = 0,08 vai ao piso de 0,1");
  const misto = incertezaCorte([{ b: 0, x: 1, item: { angoff_origem: "painel", angoff: 0.5, angoff_painel_ep: 0.05 } }, { b: 0, x: 0, item: { angoff_origem: "item" } }]);
  assert.ok(Math.abs(misto.sigma - 0.45) < 1e-12 && misto.origem === "misto");
  const post = posteriorGrade([], { priori: { media: 1, dp: 0.3 } });
  /* theta ~ N(1; 0,3²) e c ~ N(0; 0,4²): theta - c ~ N(1; 0,5²) */
  assert.ok(Math.abs(pAcimaDoCorte(post, 0.4) - normalCdf(2)) < 1e-4);
  const ic = intervaloRelativo(post, 0.4);
  assert.ok(Math.abs(ic[0] - (1 - 1.6449 * 0.5)) < 0.01 && Math.abs(ic[1] - (1 + 1.6449 * 0.5)) < 0.01, JSON.stringify(ic));
  /* c ~ N(0,5; 0,4²): theta - c ~ N(0,5; 0,5²) */
  assert.ok(Math.abs(pAcimaDoCorte(post, 0.4, null, 0.5) - normalCdf(1)) < 1e-4);
  const ic2 = intervaloRelativo(post, 0.4, 0.9, 0.5);
  assert.ok(Math.abs(ic2[0] - (0.5 - 1.6449 * 0.5)) < 0.01, JSON.stringify(ic2));
  assert.ok(Math.abs(pAcimaDoCorte(post, 0, null, 1) - 0.5) < 1e-3, "sem incerteza, P(theta > 1) = 0,5");
});

test("ponderarPeloOutline: repesa para a composição da prova, com limite, sem mudar a soma dos pesos", () => {
  const mk = (s, n, x) => Array.from({ length: n }, () => ({ b: 0, x, w: 1, item: { sistema: s } }));
  const usadas = [...mk("forte", 80, 1), ...mk("fraco", 20, 0)];
  const r = ponderarPeloOutline(usadas, { forte: 0.5, fraco: 0.5 });
  const soma = r.usadas.reduce((a, u) => a + u.w, 0);
  assert.ok(Math.abs(soma - 100) < 1e-9);
  assert.ok(Math.abs(r.fatores.forte - 0.625) < 1e-9 && Math.abs(r.fatores.fraco - 2.5) < 1e-9, JSON.stringify(r.fatores));
  assert.ok(Math.abs(r.distancia - 0.3) < 1e-12);
  /* quem responde sobretudo os sistemas fortes não ganha theta inflado */
  assert.ok(eap(r.usadas, { sigmaCorte: 0 }).theta < eap(usadas, { sigmaCorte: 0 }).theta);
  const lim = ponderarPeloOutline([...mk("a", 99, 1), ...mk("b", 1, 0)], { a: 0.5, b: 0.5 });
  assert.ok(lim.fatores.b / lim.fatores.a <= 9 + 1e-9, "fator limitado a [1/3, 3]");
});

test("desfechos: 30 aprovados e 30 reprovados para ir ao aluno, covariância dos coeficientes, taxa de resposta e ponderação", () => {
  const random = rng(44);
  const regs = [];
  for (let i = 0; i < 300; i++) { const t = 1.2 * normalAleatoria(random); regs.push({ theta: t, resultado: random() < expit(0.5 + 2 * t) ? "pass" : "fail" }); }
  const poucos = ajustarDesfechos(regs.slice(0, 50));
  assert.equal(poucos.suficiente, false);
  assert.equal(poucos.exploratorio, poucos.aprovados >= 10 && poucos.reprovados >= 10);
  const d = ajustarDesfechos(regs);
  assert.ok(d.aprovados >= 30 && d.reprovados >= 30 && d.suficiente);
  assert.ok(d.cov && d.cov[0][0] > 0 && d.cov[1][1] > 0);
  const iv = intervaloDesfechos(d, { theta: 0.2, dp: 0.2 });
  assert.ok(iv.ic90[0] < iv.p && iv.p < iv.ic90[1], JSON.stringify(iv));
  assert.ok(Math.abs(iv.p - probAprovacaoDesfechos(d, { theta: 0.2, dp: 0.2 })) < 1e-12);
  /* com poucos eventos o intervalo é mais largo */
  const d60 = ajustarDesfechos(regs.slice(0, 80), { min_por_classe: 10 });
  const iv60 = intervaloDesfechos(d60, { theta: 0.2, dp: 0.2 });
  assert.ok(iv60.ic90[1] - iv60.ic90[0] > iv.ic90[1] - iv.ic90[0]);
  /* quem não informa o resultado: taxa registrada; abaixo de 50% o modelo não vai ao aluno */
  const sem = Array.from({ length: 400 }, () => ({ theta: 1.2 * normalAleatoria(random) - 0.5 }));
  const baixa = ajustarDesfechos(regs, { naoRespondentes: sem });
  assert.ok(Math.abs(baixa.taxa_resposta - 300 / 700) < 1e-12);
  assert.equal(baixa.suficiente, false);
  assert.equal(baixa.ponderado, true);
  const boa = ajustarDesfechos(regs, { naoRespondentes: sem.slice(0, 100) });
  assert.equal(boa.suficiente, true);
});

test("efeito do modo tutor: deslocamento estimado com os dados da turma e aplicado ao b dos itens no tutor", () => {
  const random = rng(91);
  const itens = new Map(Array.from({ length: 120 }, (_, i) => ["I" + i, { id: "I" + i, step: "step1", b_angoff: (i % 7 - 3) / 3 }]));
  const resp = [];
  for (let j = 0; j < 150; j++) {
    const th = normalAleatoria(random);
    for (let i = 0; i < 120; i++) {
      const tutor = i % 3 === 0;
      const b = itens.get("I" + i).b_angoff;
      resp.push({ pessoa: j, questao_id: "I" + i, modo: tutor ? "tutor" : "cronometrado", correta: random() < expit(th - b + (tutor ? 0.6 : 0)) });
    }
  }
  const m = estimarEfeitoModo(resp, itens);
  assert.ok(m.suficiente && Math.abs(m.delta - 0.6) < 0.2, "delta " + m.delta);
  const { usadas } = prepararRespostas([{ questao_id: "I0", modo: "tutor", origem: "banco", resposta: "A", correta: true, respondida_em: "2026-10-01" }], itens, { step: "step1", efeitoModo: m });
  assert.ok(Math.abs(usadas[0].b - (itens.get("I0").b_angoff - m.delta)) < 1e-12);
});

/* ---------- rodada 2 da banca (29/10/2026) ---------- */
import { corteLigadoNbme, LIGACAO_NBME, SENSIBILIDADE_PADRAO, nomePadrao } from "../js/psicometria.js";

/* Examinando com theta ~ N(media, 1) em itens fixos; EAP com a priori do banco e
   posterior com a priori da população (para a probabilidade verdadeira). */
function examinando(r, bs, media = 0.3) {
  const th = media + normalAleatoria(r);
  const rs = bs.map((b) => ({ b, x: r() < expit(th - b) ? 1 : 0 }));
  const g = { min: -6, max: 6, passo: 0.05 };
  const e = eap(rs, { grade: g, sigmaCorte: 0 });
  e.posterior_pop = eap(rs, { grade: g, sigmaCorte: 0, incluirPosterior: true, priori: { media, dp: 1 } }).posterior;
  return { th, e };
}

test("desfechos sobre o EAP: calibração e cobertura do intervalo de P; integrar dp de novo piora", () => {
  const r0 = rng(5);
  const bs = Array.from({ length: 40 }, () => normalAleatoria(r0) * 0.9);
  const ruido = 0.5; /* P(Pass | theta) = Phi(theta / 0,5) */
  let meioT = 0, meioC = 0, errNovo = 0, errVelho = 0, tot = 0;
  for (let rep = 0; rep < 25; rep++) {
    const r = rng(100 + rep);
    const regs = Array.from({ length: 250 }, () => examinando(r, bs)).map(({ th, e }) => ({ theta: e.theta, resultado: r() < normalCdf(th / ruido) ? "pass" : "fail" }));
    const m = ajustarDesfechos(regs);
    assert.ok(m.suficiente, "réplica " + rep);
    for (let k = 0; k < 50; k++) {
      const { e } = examinando(r, bs);
      const { pontos, dens } = e.posterior_pop;
      let verdade = 0;
      for (let i = 1; i < pontos.length; i++) verdade += 0.5 * (pontos[i] - pontos[i - 1]) * (dens[i] * normalCdf(pontos[i] / ruido) + dens[i - 1] * normalCdf(pontos[i - 1] / ruido));
      const iv = intervaloDesfechos(m, { theta: e.theta, dp: e.dp });
      /* abordagem anterior: integrava de novo a incerteza de theta */
      const C = m.cov, mm = m.beta0 + m.beta1 * e.theta;
      const sd = Math.sqrt(C[0][0] + 2 * e.theta * C[0][1] + e.theta * e.theta * C[1][1] + (m.beta1 * m.beta1 + C[1][1]) * e.dp * e.dp);
      let s = 0, w = 0;
      for (let q = -40; q <= 40; q++) { const z = q / 10, d = Math.exp(-0.5 * z * z); s += d * expit(mm + z * sd); w += d; }
      errNovo += Math.abs(iv.p - verdade); errVelho += Math.abs(s / w - verdade); tot++;
      if (verdade > 0.1 && verdade < 0.9) { meioT++; if (verdade >= iv.ic90[0] && verdade <= iv.ic90[1]) meioC++; }
    }
  }
  const cob = meioC / meioT;
  assert.ok(cob > 0.85 && cob < 0.96, "cobertura do intervalo de 90% entre 10% e 90%: " + (100 * cob).toFixed(1) + "%");
  assert.ok(errNovo < errVelho, "erro médio " + (errNovo / tot).toFixed(4) + " contra " + (errVelho / tot).toFixed(4) + " integrando dp");
  assert.ok(errNovo / tot < 0.035);
  console.log("# cobertura " + (100 * cob).toFixed(1) + "% (" + meioT + " examinandos entre 10% e 90%); erro médio " + (errNovo / tot).toFixed(4) + " contra " + (errVelho / tot).toFixed(4));
});

test("ligação com a NBME: recupera o theta do padrão, erro-padrão pelo método delta, e o limiar ligado entra no lugar do provisório", () => {
  assert.deepEqual({ ...LIGACAO_NBME.limiar }, { step1: 196, step2ck: 218 });
  const r0 = rng(5);
  const bs = Array.from({ length: 100 }, () => normalAleatoria(r0) * 0.9);
  /* escore = 200 + 15 theta + N(0; 8²): o padrão 196 fica em theta = -4/15 */
  const alvo = -4 / 15;
  let cobre = 0, soma = 0;
  const R = 40;
  let ultimo = null;
  for (let rep = 0; rep < R; rep++) {
    const r = rng(900 + rep);
    const regs = Array.from({ length: 80 }, () => examinando(r, bs)).map(({ th, e }) => ({ theta: e.theta, escore: 200 + 15 * th + 8 * normalAleatoria(r) }));
    const mod = ajustarEscore(regs);
    assert.ok(Number.isFinite(mod.var_a) && Number.isFinite(mod.var_b) && Number.isFinite(mod.cov_ab));
    const c = corteLigadoNbme(mod, { step: "step1" });
    assert.ok(c.suficiente, c.motivo);
    soma += c.mu;
    if (Math.abs(c.mu - alvo) <= 1.6449 * c.ep) cobre++;
    ultimo = { mod, c };
  }
  assert.ok(Math.abs(soma / R - alvo) < 0.08, "média do corte ligado " + (soma / R).toFixed(3) + " para " + alvo.toFixed(3));
  assert.ok(cobre / R >= 0.8, "intervalo de 90% do corte cobriu " + cobre + " de " + R);
  /* método delta conferido à mão */
  const { mod, c } = ultimo;
  const d = 196 - mod.a;
  const ep = Math.sqrt(mod.var_a / mod.b ** 2 + d * d * mod.var_b / mod.b ** 4 + 2 * d * mod.cov_ab / mod.b ** 3);
  assert.ok(Math.abs(c.ep - ep) < 1e-12 && Math.abs(c.mu - d / mod.b) < 1e-12);
  assert.equal(c.sigma, Math.max(c.ep, 0.1));
  /* insuficiente: poucos escores, relação fraca ou sem covariância */
  assert.equal(corteLigadoNbme({ ...mod, n: 12 }, { step: "step1" }).suficiente, false);
  assert.equal(corteLigadoNbme({ ...mod, b: 0.5 }, { step: "step1" }).suficiente, false);
  assert.match(corteLigadoNbme({ a: 200, b: 10, n: 40 }).motivo, /covariância/);
  assert.equal(corteLigadoNbme(null).suficiente, false);
  /* estimarAluno: com a ligação suficiente, o limiar sai do provisório */
  const banco = montarBanco(gerarBancoSintetico({ porStep: 300, semente: 4 }));
  const random = rng(31);
  const respostas = banco.steps.step1.slice(0, 200).map((q, i) => {
    const ok = random() < expit(0.3 - q.b_angoff);
    return { questao_id: q.id, resposta: ok ? q.correta : "Z", correta: ok, modo: "cronometrado", origem: "banco", respondida_em: new Date(Date.UTC(2026, 8, 1) + i * 60000).toISOString() };
  });
  const prov = estimarAluno({ step: "step1", respostas, itens: banco.porId, sistemas: sistemasDoOutline("step1") });
  const lig = { ...c, mu: 0.6, ep: 0.12, sigma: 0.12, suficiente: true };
  const nb = estimarAluno({ step: "step1", respostas, itens: banco.porId, sistemas: sistemasDoOutline("step1"), ligacaoNbme: lig });
  assert.equal(prov.corte.origem, "provisorio");
  assert.ok(prov.sensibilidade && prov.sensibilidade.deslocamento === SENSIBILIDADE_PADRAO.deslocamento);
  assert.equal(nb.corte.origem, "nbme");
  assert.equal(nb.corte.centro, 0.6);
  assert.equal(nb.corte.sigma, 0.12);
  assert.equal(nb.sensibilidade, null, "sem análise de sensibilidade quando o limiar é empírico");
  assert.ok(nb.p_aprovacao < prov.p_aprovacao, "limiar mais alto, probabilidade menor");
  assert.ok(Math.abs(nb.ic90_relativo[0] - (prov.ic90[0] - 0.6)) < 0.3);
  assert.ok(nb.percentual_esperado.limiar > prov.percentual_esperado.limiar);
  assert.match(nb.avisos[0], /autoavaliações NBME da turma/);
  assert.equal(nomePadrao("nbme"), "ligado às autoavaliações NBME da turma");
  /* ligação insuficiente não muda nada */
  const ins = estimarAluno({ step: "step1", respostas, itens: banco.porId, sistemas: sistemasDoOutline("step1"), ligacaoNbme: { ...lig, suficiente: false } });
  assert.equal(ins.p_aprovacao, prov.p_aprovacao);
});

test("sensibilidade ao padrão provisório: probabilidade com o banco 0,75 logit mais fácil ou mais difícil", () => {
  const post = posteriorGrade([], { priori: { media: 0.5, dp: 0.2 } });
  /* theta ~ N(0,5; 0,2²): com o banco 0,75 mais fácil o limiar verdadeiro fica em +0,75 */
  assert.ok(Math.abs(pAcimaDoCorte(post, 0, null, 0.75) - normalCdf(-1.25)) < 1e-3);
  const banco = montarBanco(gerarBancoSintetico({ porStep: 200, semente: 6 }));
  const random = rng(8);
  const respostas = banco.steps.step1.slice(0, 160).map((q, i) => {
    const ok = random() < expit(0.6 - q.b_angoff);
    return { questao_id: q.id, resposta: ok ? q.correta : "Z", correta: ok, modo: "cronometrado", origem: "banco", respondida_em: new Date(Date.UTC(2026, 8, 1) + i * 60000).toISOString() };
  });
  const e = estimarAluno({ step: "step1", respostas, itens: banco.porId, sistemas: sistemasDoOutline("step1") });
  const s = e.sensibilidade;
  assert.ok(s.itens_mais_faceis < e.p_medida && e.p_medida < s.itens_mais_dificeis, JSON.stringify(s));
  assert.equal(s.pontos, 15);
  assert.equal(typeof s.muda_leitura, "boolean");
});
