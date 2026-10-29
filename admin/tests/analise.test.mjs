/* Área administrativa: banco de questões (admin/js/analise.js) e dados fictícios
   da demonstração (plataforma/js/respostas-demo.js). Casos montados à mão e
   simulações de Rasch com habilidades e dificuldades conhecidas. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  thetasPessoas, quartisPessoas, distratoresPorQuartil, analisarBanco, filtrarItens, ordenarItens, resumoItens,
  estimativasTurma, riscosBanco, aplicarBanco, distribuicaoProbabilidade, coberturaBlueprint, leituraBanco,
  CODIGO_RISCO_BANCO, pctTxt, numTxt
} from "../js/analise.js";
import { montarBanco, TAXONOMIA } from "../../plataforma/js/banco.js";
import { expit, normalAleatoria, recalibrarRasch, correlacao } from "../../plataforma/js/psicometria.js";
import { rng } from "../../plataforma/js/simulado.js";
import { gerarBancoSintetico } from "../../plataforma/tests/sintetico.mjs";
import { gerarRespostasDemo, gerarDesfechosDemo, gerarReportesDemo, modeloVerdadeiro, examinandosDemo, SIMULACAO_DEMO } from "../../plataforma/js/respostas-demo.js";

const ler = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), "utf8"));
const publicos = [...ler("../../simulado/data/step1-questoes.json"), ...ler("../../simulado/data/step2ck-questoes.json")];

/* Matriz de Rasch simulada: nPessoas com theta ~ N(0, 1), cada uma responde todos os
   itens do Step; o item "trocado" tem a resposta verdadeira num distrator. */
function simular(banco, step, { nPessoas = 200, semente = 5, trocado = null } = {}) {
  const r = rng(semente);
  const itens = banco.steps[step];
  const matriz = [];
  const thetas = [];
  for (let j = 0; j < nPessoas; j++) {
    const th = normalAleatoria(r);
    thetas.push(th);
    for (const q of itens) {
      const letras = q.alternativas.map((a) => a.letra);
      const verdade = q.id === trocado ? letras.find((l) => l !== q.correta) : q.correta;
      const sabe = r() < expit(th - q.b_angoff);
      const erradas = letras.filter((l) => l !== verdade);
      const resposta = sabe ? verdade : erradas[Math.floor(r() * erradas.length)];
      matriz.push({ pessoa: j + 1, questao_id: q.id, resposta, correta: resposta === q.correta });
    }
  }
  return { matriz, thetas };
}

test("quartis: quatro grupos iguais pela habilidade; menos de 8 pessoas não divide", () => {
  const th = new Map([...Array(12).keys()].map((i) => [String(i + 1), { theta: i / 10 }]));
  const q = quartisPessoas(th);
  assert.deepEqual([...q.values()], [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
  assert.equal(quartisPessoas(new Map([...th].slice(0, 7))), null);
});

test("distratores por quartil: contagem conferida à mão", () => {
  const item = { correta: "B", alternativas: ["A", "B", "C", "D", "E"].map((letra) => ({ letra })) };
  const quartis = new Map([["1", 1], ["2", 1], ["3", 2], ["4", 3], ["5", 4], ["6", 4]]);
  const linhas = [
    { pessoa: 1, resposta: "A" }, { pessoa: 2, resposta: "C" }, { pessoa: 3, resposta: "B" },
    { pessoa: 4, resposta: "B" }, { pessoa: 5, resposta: "B" }, { pessoa: 6, resposta: null }
  ];
  const d = distratoresPorQuartil(linhas, item, quartis);
  assert.equal(d.n, 6);
  assert.deepEqual(d.n_quartil, [2, 1, 1, 2]);
  const B = d.opcoes.find((o) => o.letra === "B");
  assert.equal(B.correta, true);
  assert.deepEqual(B.q.map((x) => x.prop), [0, 1, 1, 0.5]);
  assert.equal(B.prop, 0.5);
  assert.deepEqual(d.opcoes.find((o) => o.letra === "A").q.map((x) => x.n), [1, 0, 0, 0]);
  assert.equal(d.em_branco.n, 1);
  assert.deepEqual(d.em_branco.q, [0, 0, 0, 0.5]);
});

test("análise do banco: item com gabarito trocado é apontado e seus distratores sobem com a habilidade", () => {
  const banco = montarBanco(gerarBancoSintetico({ porStep: 40, semente: 3 }));
  const alvo = banco.steps.step1[5].id;
  const { matriz } = simular(banco, "step1", { trocado: alvo });
  const reportes = [{ questao_id: alvo, status: "aberto" }, { questao_id: alvo, status: "resolvido" }];
  const an = analisarBanco({ banco, step: "step1", matriz, reportes });
  assert.equal(an.linhas.length, 40, "uma linha por item do Step");
  const l = an.linhas.find((x) => x.id === alvo);
  assert.ok(l.alertas.includes("pbis_negativa") && l.alertas.includes("distrator_atrai_melhores"), l.alertas.join(","));
  assert.equal(l.reportes, 1, "só reportes abertos ou em análise contam");
  const d = distratoresPorQuartil(an.matriz.filter((r) => r.questao_id === alvo), banco.porId.get(alvo), an.quartis);
  const verdade = d.opcoes.find((o) => !o.correta && o.q[3].prop > d.opcoes.find((x) => x.correta).q[3].prop);
  assert.ok(verdade && verdade.q[3].prop > verdade.q[0].prop, "o distrator verdadeiro sobe de Q1 para Q4");
  /* nos itens bons, a correta sobe de Q1 para Q4 */
  const bons = an.linhas.filter((x) => x.id !== alvo).slice(0, 10);
  for (const b of bons) {
    const dq = distratoresPorQuartil(an.matriz.filter((r) => r.questao_id === b.id), banco.porId.get(b.id), an.quartis);
    const c = dq.opcoes.find((o) => o.correta);
    assert.ok(c.q[3].prop > c.q[0].prop, b.id);
  }
  assert.ok(an.resumo.a_revisar >= 1);
  assert.equal(resumoItens(an.linhas).reportes_abertos, 1);
  /* filtros e ordem */
  assert.deepEqual(filtrarItens(an.linhas, { situacao: "reportes" }).map((x) => x.id), [alvo]);
  assert.ok(filtrarItens(an.linhas, { alerta: "pbis_negativa" }).some((x) => x.id === alvo));
  assert.equal(ordenarItens(an.linhas)[0].id, alvo, "reporte aberto e alerta de revisão vêm primeiro");
  const porP = ordenarItens(an.linhas, "p", "asc").map((x) => x.p);
  assert.deepEqual(porP, [...porP].sort((a, b) => a - b));
  const sis = an.linhas[0].sistema;
  assert.ok(filtrarItens(an.linhas, { sistema: sis }).every((x) => x.sistema === sis));
  const disc = an.linhas[0].disciplinas[0];
  assert.ok(filtrarItens(an.linhas, { disciplina: disc }).every((x) => x.disciplinas.includes(disc)));
});

test("thetas da matriz ordenam as pessoas como a habilidade verdadeira", () => {
  const banco = montarBanco(gerarBancoSintetico({ porStep: 60, semente: 4 }));
  const { matriz, thetas } = simular(banco, "step2ck", { nPessoas: 80, semente: 9 });
  const est = thetasPessoas(matriz, banco.porId);
  const r = correlacao(thetas, thetas.map((_, j) => est.get(String(j + 1)).theta));
  assert.ok(r > 0.9, "correlação " + r);
});

/* participante fictício: linha mínima do painel */
const linha = (id, plano = {}) => ({ id, nome: id, sintetico: false, riscos: [], status: "em_dia", avaliacao: { riscos: [], status: "em_dia" }, linha: { plano: { step1_aprovado: false, step2ck_aprovado: false, ...plano } } });
function respostasDe(banco, step, userId, theta, n, semente) {
  const r = rng(semente);
  return banco.steps[step].slice(0, n).map((q, k) => {
    const certo = r() < expit(theta - q.b_angoff);
    return { user_id: userId, questao_id: q.id, step, resposta: certo ? q.correta : "Z", correta: certo, modo: "cronometrado", origem: "banco", respondida_em: new Date(Date.UTC(2026, 9, 1, 0, k)).toISOString() };
  });
}

test("probabilidade da turma: baixa com alta confiança vira risco alto; preliminar não; Step aprovado sai", () => {
  const banco = montarBanco(gerarBancoSintetico({ porStep: 300, semente: 12 }));
  const rows = [linha("fraco"), linha("forte"), linha("pouco"), linha("aprovado", { step1_aprovado: true })];
  const respostas = [
    ...respostasDe(banco, "step1", "fraco", -1.6, 220, 1),
    ...respostasDe(banco, "step1", "forte", 1.8, 220, 2),
    ...respostasDe(banco, "step1", "pouco", -1.6, 15, 3),
    ...respostasDe(banco, "step1", "aprovado", -1.6, 220, 4)
  ];
  const est = estimativasTurma({ rows, respostas, banco });
  assert.equal(est.get("fraco").step2ck, null, "sem respostas no Step 2 CK");
  const fraco = est.get("fraco").step1;
  assert.ok(fraco.confianca.alta && fraco.p_aprovacao <= 0.1, "fraco: P " + fraco.p_aprovacao);
  assert.ok(est.get("forte").step1.confianca.alta && est.get("forte").step1.p_aprovacao >= 0.9);
  assert.equal(est.get("pouco").step1.confianca.alta, false);
  const rs = rows.map((r) => aplicarBanco(r, est.get(r.id)));
  const [f, fo, po, ap] = rs;
  assert.equal(f.status, "risco");
  assert.equal(f.riscos[0].codigo, CODIGO_RISCO_BANCO);
  assert.equal(f.riscos[0].nivel, "alto");
  assert.match(f.riscos[0].detalhe, /alta confiança/);
  assert.match(f.riscos[0].detalhe, /não é resultado oficial/);
  assert.equal(fo.status, "em_dia");
  assert.equal(po.status, "em_dia", "estimativa preliminar não acende o critério");
  assert.equal(ap.status, "em_dia", "Step aprovado não conta");
  assert.deepEqual(riscosBanco(linha("x"), { step1: null, step2ck: null }), []);
  /* aplicar duas vezes não duplica o critério */
  assert.equal(aplicarBanco(f, est.get("fraco")).riscos.length, 1);
  const d = distribuicaoProbabilidade(rs, "step1");
  assert.deepEqual([d.alta_abaixo, d.alta_acima, d.preliminar, d.sem_respostas], [2, 1, 1, 0]);
  assert.equal(distribuicaoProbabilidade(rs, "step2ck").sem_respostas, 4);
  const lb = leituraBanco(fraco, { status: "pronto" });
  assert.equal(lb.combinada.divergente, true, "EXIT 18 pronta e banco baixo com alta confiança: divergência");
});

test("blueprint: contagem por linha, faixas, multirrótulo e formulários sustentados", () => {
  const itens = montarBanco(gerarBancoSintetico({ porStep: 560, semente: 21 })).steps.step1;
  const c = coberturaBlueprint(itens, "step1");
  assert.equal(c.total, 560);
  assert.equal(c.tamanho_formulario, 280);
  const sis = c.dims.find((d) => d.dim === "sistema");
  assert.equal(sis.linhas.length, TAXONOMIA.step1.sistema.chaves.length);
  assert.equal(sis.linhas.reduce((s, l) => s + l.n, 0), 560, "sistema: um rótulo por item");
  assert.ok(sis.exigida);
  const cv = sis.linhas.find((l) => l.chave === "cardiovascular");
  assert.deepEqual(cv.pedido_formulario, [Math.ceil(0.07 * 280), Math.floor(0.11 * 280)]);
  assert.equal(cv.formularios, Math.floor(cv.n / Math.ceil(0.07 * 280)));
  const disc = c.dims.find((d) => d.dim === "disciplina");
  assert.equal(disc.exigida, false, "disciplina multirrótulo não é exigida");
  assert.ok(disc.linhas.reduce((s, l) => s + l.n, 0) >= 560);
  assert.ok(c.formularios_sem_repeticao <= 2);
  /* banco feito à mão: 10 itens, 1 cardiovascular (10%) dentro de 7 a 11%, 0 renal abaixo */
  const mao = Array.from({ length: 10 }, (_, i) => ({ step: "step1", sistema: i === 0 ? "cardiovascular" : "gastrointestinal", disciplina: "patologia", disciplinas: ["patologia", i < 3 ? "farmacologia" : null].filter(Boolean), competencia: "conhecimento_medico", dificuldade: "media", angoff: 0.65, b_angoff: -Math.log(0.65 / 0.35) }));
  const m = coberturaBlueprint(mao, "step1");
  const s2 = m.dims.find((d) => d.dim === "sistema").linhas;
  assert.equal(s2.find((l) => l.chave === "cardiovascular").situacao, "dentro");
  assert.equal(s2.find((l) => l.chave === "gastrointestinal").situacao, "acima");
  assert.equal(s2.find((l) => l.chave === "respiratorio_renal").situacao, "abaixo");
  assert.equal(s2.find((l) => l.chave === "respiratorio_renal").faltam_para_faixa, 2);
  const farm = m.dims.find((d) => d.dim === "disciplina").linhas.find((l) => l.chave === "farmacologia");
  assert.equal(farm.n, 3, "rótulo secundário conta");
  assert.ok(Math.abs(m.escore_corte_esperado - 0.65) < 1e-9);
  assert.equal(m.formularios_sem_repeticao, 0);
});

test("formatação em português", () => {
  assert.equal(pctTxt(0.003), "menos de 1%");
  assert.equal(pctTxt(0.9995), "mais de 99%");
  assert.equal(pctTxt(0.456, 1), "45,6%");
  assert.equal(numTxt(-0.6234, 2), "-0,62");
  assert.equal(numTxt(73), "73");
  assert.equal(numTxt(null), "sem dado");
});

test("demonstração: defeitos plantados acendem os alertas e a recalibração se aproxima da dificuldade verdadeira", () => {
  const agora = new Date("2026-10-29T12:00:00Z");
  const banco = montarBanco(publicos);
  const modelo = modeloVerdadeiro(publicos);
  const resp = gerarRespostasDemo({ itens: publicos, agora });
  assert.ok(resp.every((r) => r.sintetico && r.respondida_em <= agora.toISOString()));
  const pessoas = examinandosDemo({ itens: publicos });
  const cal = pessoas.filter((p) => p.grupo === "calibracao");
  assert.ok(cal.length >= 2 * SIMULACAO_DEMO.calibracao.min_pessoas, "turmas anteriores nos dois Steps");
  for (const step of ["step1", "step2ck"]) {
    const matriz = resp.filter((r) => r.step === step && r.modo !== "tutor").map((r) => ({ pessoa: r.user_id, questao_id: r.questao_id, resposta: r.resposta, correta: r.correta }));
    const an = analisarBanco({ banco, step, matriz });
    const def = [...modelo.values()].filter((m) => m.step === step && m.defeito);
    assert.deepEqual(def.map((m) => m.defeito).sort(), ["gabarito_trocado", "muito_dificil", "muito_facil", "pouco_discriminativo"]);
    const linhaDe = (d) => an.linhas.find((l) => l.id === def.find((m) => m.defeito === d).id);
    assert.ok(linhaDe("gabarito_trocado").alertas.includes("distrator_atrai_melhores"), step + " gabarito trocado");
    assert.ok(linhaDe("muito_dificil").alertas.includes("p_baixo"), step + " muito difícil");
    assert.ok(linhaDe("muito_facil").alertas.includes("p_alto"), step + " muito fácil");
    assert.ok(linhaDe("pouco_discriminativo").alertas.some((c) => c === "pbis_negativa" || c === "pbis_baixa"), step + " pouco discriminativo");
    assert.ok(an.linhas.filter((l) => l.confiavel).length >= 35, step + ": quase todos os itens com 30 respostas ou mais");
    /* recalibração: mais perto do b verdadeiro do que o Angoff, sem os itens com defeito */
    const rc = recalibrarRasch(matriz, banco.porId);
    const ok = rc.itens.filter((i) => !modelo.get(i.id).defeito);
    const verd = ok.map((i) => modelo.get(i.id).b);
    assert.ok(correlacao(ok.map((i) => i.b), verd) > correlacao(ok.map((i) => i.b_angoff), verd), step);
  }
  const desf = gerarDesfechosDemo({ itens: publicos, respostas: resp, agora });
  assert.ok(desf.every((d) => d.escore === null && ["pass", "fail"].includes(d.resultado) && d.data < "2026-10-29"));
  for (const step of ["step1", "step2ck"]) {
    const ds = desf.filter((d) => d.step === step);
    assert.ok(ds.filter((d) => d.resultado === "pass").length >= 10 && ds.filter((d) => d.resultado === "fail").length >= 10, step + ": 10 de cada para a regressão");
  }
  const reps = gerarReportesDemo({ itens: publicos, agora });
  assert.ok(reps.filter((r) => r.motivo === "gabarito").every((r) => modelo.get(r.questao_id).defeito === "gabarito_trocado"));
  /* correção de gabarito: as respostas fictícias passam a valer pela letra nova */
  const trocado = [...modelo.values()].find((m) => m.step === "step1" && m.defeito === "gabarito_trocado");
  const depois = gerarRespostasDemo({ itens: publicos, agora, gabaritos: new Map([[trocado.id, { correta: trocado.chave_verdadeira, versao: 2 }]]) });
  const doItem = depois.filter((r) => r.questao_id === trocado.id);
  assert.ok(doItem.every((r) => r.versao_item === 2 && r.correta === (r.resposta === trocado.chave_verdadeira)));
  assert.ok(doItem.filter((r) => r.correta).length / doItem.length > 0.5, "depois da correção, a maioria acerta");
});
