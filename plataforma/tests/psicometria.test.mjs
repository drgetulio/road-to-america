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
    const e = eap(rs, { grade: GRADE_RAPIDA });
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
  const cob = cobertura({ a: 3, b: 1, c: 2, d: 1 }, sist);
  assert.equal(cob.proporcao, 0.8);
  assert.deepEqual(cob.faltando, ["e"]);
  const base = { theta: 0.5, dp: 0.24, n_efetivo: 80, n_minimo: 75, cob };
  assert.equal(classificarConfianca({ ...base, p: 0.93 }).rotulo, "alta_confianca");
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
  assert.ok(e.confianca.faltam_itens > 0);
  assert.equal(e.limiar.escore_oficial, PADRAO_STEP2CK);
  assert.match(e.avisos.join(" "), /218/);
  assert.match(e.avisos.join(" "), /três dígitos só será estimada depois da calibração/);
  assert.equal(e.escore, null, "sem modelo de escores reais, nenhuma nota de três dígitos");
  assert.ok(e.percentual_esperado.itens === 120);
  assert.deepEqual(Object.keys(e.perfil), ["sistema", "disciplinas_oficiais", "competencia", "area"]);
});

test("estimarAluno com aluno simulado forte e muitas respostas chega a alta confiança", () => {
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
  assert.equal(e.confianca.rotulo, "alta_confianca");
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
  const p0 = probAprovacaoDesfechos(d, { theta: 0.5, dp: 0 });
  const p1 = probAprovacaoDesfechos(d, { theta: 0.5, dp: 0.8 });
  assert.ok(p1 < p0, "com mais incerteza a probabilidade se aproxima de 0,5");
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
