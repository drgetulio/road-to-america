/* Relatório do simulado completo: resultado estimado, confiança, perfil por área em
   relação ao limiar, blocos, revisão item a item e card pré-preenchido. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarBanco, sistemasDoOutline } from "../../plataforma/js/banco.js";
import { montarFormularioFixo } from "../../plataforma/js/formularios.js";
import { bDoItem, expit } from "../../plataforma/js/psicometria.js";
import { rng } from "../../plataforma/js/simulado.js";
import { gerarBancoSintetico } from "../../plataforma/tests/sintetico.mjs";
import { criarDia, comecarBloco, irParaQuestao, escolherResposta, fecharBloco, definirNotaItem } from "../js/dia-prova.js";
import {
  corrigirRegistro, estimativaDoSimulado, resultadoEstimado, perfilRelatorio, prioridades, resumoBlocos, itensRevisao,
  filtrarItens, itensJaVistos, cardDoItem, linkCriarFlashcard, linhaHistorico, instantaneo, posicaoEscala, CK_PARA_STEP1, ROTULO_CLASSE
} from "../js/relatorio.js";
import { preenchimento, retornoSeguro } from "../../anki/js/views/editor.js";

const MIN = 60000;
const T0 = Date.parse("2026-10-29T08:00:00Z");
const banco = montarBanco(gerarBancoSintetico({ porStep: 600, semente: 11 }), { origem: "teste" });

/* Faz o dia inteiro com um examinando de habilidade theta (Rasch ancorado no Angoff) */
function fazerDia(step, codigo, theta, semente = 1, { emBranco = 0 } = {}) {
  const form = montarFormularioFixo(banco, step, codigo, "completo");
  const random = rng(semente);
  let s = criarDia(form);
  let t = T0;
  form.blocos.forEach((ids, b) => {
    s = comecarBloco(s, form, t);
    ids.forEach((id, i) => {
      s = irParaQuestao(s, i, t);
      const q = banco.porId.get(id);
      if (i >= ids.length - emBranco) { t += 60000; return; }
      const acerta = random() < expit(theta - bDoItem(q));
      const errada = q.alternativas.find((a) => a.letra !== q.correta).letra;
      s = escolherResposta(s, i, acerta ? q.correta : errada, t + 30000);
      if (b === 0 && i === 0) s = definirNotaItem(s, form, 0, "anotação de teste");
      t += 80000;
    });
    s = fecharBloco(s, t, "participante");
    t += 4 * MIN;
  });
  const reg = { id: "sc-teste-" + semente, step, tipo: "completo", formulario: form, sessao: s, estado: "concluido" };
  const { resultado, respostas } = corrigirRegistro(reg, banco.porId);
  const est = estimativaDoSimulado({ form, linhas: respostas, porId: banco.porId });
  return { form, s, reg, resultado, respostas, est };
}

test("Step 1, examinando forte: acima do limiar do banco com precisão alta (sem Pass com padrão provisório), perfil nas três dimensões do outline", () => {
  const { est, resultado, reg } = fazerDia("step1", "S1-A", 1.6, 3);
  assert.equal(est.n, 280);
  assert.ok(est.p_aprovacao > 0.95, "P = " + est.p_aprovacao + " (com a incerteza de 0,7 logit do padrão provisório)");
  assert.equal(est.confianca.alta, true);
  const r = resultadoEstimado(est, "step1");
  assert.equal(r.codigo, "acima");
  assert.equal(r.selo, "Acima do limiar do banco", "Pass e Fail só com a ligação com a NBME ou com desfechos");
  assert.doesNotMatch(r.titulo + " " + r.selo, /\b(Pass|Fail)\b/);
  assert.match(r.confianca, /Precisão alta em relação ao padrão do banco \(padrão provisório\)/);
  assert.match(r.frase, /limiar do banco \(padrão provisório\)/, "a frase não fala em probabilidade de aprovação no USMLE");
  assert.ok(Math.abs(est.corte.sigma - 0.7) < 1e-9 && est.corte.origem === "provisorio" && est.p_aprovacao <= est.p_medida + 1e-12, "a incerteza do padrão entra na probabilidade");
  const perfil = perfilRelatorio(est, "step1");
  assert.deepEqual(perfil.map((p) => p.dim), ["sistema", "disciplinas", "competencia"]);
  const sis = perfil[0].areas.map((a) => a.chave);
  assert.equal(sis[0], "desenvolvimento_humano", "ordem do outline");
  for (const p of perfil) for (const a of p.areas) {
    assert.ok(a.x_lo <= a.x_theta + 1e-9 && a.x_theta <= a.x_hi + 1e-9, a.chave);
    assert.ok(a.x_lo >= 0 && a.x_hi <= 100);
    assert.ok(a.nome && !/_/.test(a.nome), "nome legível: " + a.nome);
    assert.ok(ROTULO_CLASSE[a.classe]);
  }
  assert.ok(perfil[0].areas.filter((a) => a.classe === "mais_alto").length >= 5, "examinando forte fica acima do limiar na maioria dos sistemas");
  assert.equal(perfil[0].areas.filter((a) => a.classe === "mais_baixo").length, 0);
  const blocos = resumoBlocos(reg, banco.porId);
  assert.equal(blocos.length, 14);
  assert.equal(blocos.reduce((a, b) => a + b.acertos, 0), resultado.acertos);
  assert.ok(blocos.every((b) => b.encerrado && b.usado_ms + b.sobra_ms === b.limite_ms));
  const snap = instantaneo(est);
  assert.equal(snap.alta, true);
  assert.equal(snap.n, 280);
});

test("Step 1, examinando fraco: abaixo do limiar do banco com precisão alta e áreas abaixo do limiar como prioridade", () => {
  const { est } = fazerDia("step1", "S1-B", -1.6, 5);
  assert.ok(est.p_aprovacao < 0.05);
  assert.equal(est.confianca.alta, true);
  assert.equal(resultadoEstimado(est, "step1").codigo, "abaixo");
  const prio = prioridades(perfilRelatorio(est, "step1"));
  assert.ok(prio.length > 0 && prio.length <= 5);
  assert.ok(prio.every((a) => a.classe === "mais_baixo" || a.p_acima < 0.5));
  assert.ok(prio[0].dim, "prioridade sabe de que dimensão veio");
});

test("examinando no limiar: precisão alta só com P fora de 0,10 a 0,90 (280 itens e todos os sistemas cobertos)", () => {
  let preliminares = 0;
  for (const semente of [8, 13, 17, 19]) {
    const { est } = fazerDia("step1", "S1-B", 0, semente);
    const decidido = est.p_aprovacao >= 0.9 || est.p_aprovacao <= 0.1;
    assert.equal(est.confianca.alta, decidido, "P = " + est.p_aprovacao);
    const r = resultadoEstimado(est, "step1");
    assert.equal(r.confianca, decidido ? "Precisão alta em relação ao padrão do banco (padrão provisório)" : "Estimativa preliminar");
    if (!decidido) {
      preliminares++;
      assert.equal(r.codigo, "indefinido", "entre 10% e 90% não se escreve Pass nem Fail");
      assert.doesNotMatch(r.titulo + " " + r.selo, /\b(Pass|Fail)\b/);
      assert.match(r.frase, /tendência é (acima|abaixo) do limiar/);
    }
  }
  assert.ok(preliminares >= 1, "no limiar, ao menos uma das quatro tentativas fica preliminar");
});

test("resultado estimado: Pass e Fail só com padrão empírico e fora da faixa de 10% a 90%; dentro dela, indefinido com a tendência", () => {
  const base = { confianca: { alta: false }, corte: { origem: "nbme" } };
  const prov = { confianca: { alta: false }, corte: { origem: "provisorio" } };
  assert.equal(resultadoEstimado({ ...prov, p_aprovacao: 0.95 }, "step1").selo, "Acima do limiar do banco");
  assert.equal(resultadoEstimado({ ...prov, p_aprovacao: 0.05 }, "step1").selo, "Abaixo do limiar do banco");
  assert.equal(resultadoEstimado({ ...prov, p_aprovacao: 0.95, desfechos: { p_aprovacao: 0.97 } }, "step1").codigo, "pass", "com modelo de desfechos, Pass");
  assert.equal(resultadoEstimado({ ...prov, p_aprovacao: 0.95 }, "step2ck").selo, "Acima do limiar do banco");
  assert.equal(resultadoEstimado({ ...base, p_aprovacao: 0.95 }, "step1").titulo, "Resultado estimado pelo limiar ligado à NBME: Pass");
  assert.equal(resultadoEstimado({ ...base, p_aprovacao: 0.55 }, "step1").codigo, "indefinido");
  assert.equal(resultadoEstimado({ ...base, p_aprovacao: 0.89 }, "step1").tendencia, "acima");
  assert.equal(resultadoEstimado({ ...base, p_aprovacao: 0.2 }, "step1").tendencia, "abaixo");
  assert.equal(resultadoEstimado({ ...base, p_aprovacao: 0.9 }, "step1").codigo, "pass");
  assert.equal(resultadoEstimado({ ...base, p_aprovacao: 0.1 }, "step1").codigo, "fail");
  const ck = resultadoEstimado({ ...base, p_aprovacao: 0.6 }, "step2ck");
  assert.equal(ck.codigo, "indefinido");
  assert.match(ck.frase, /218/);
  assert.match(ck.frase, /acima do limiar/);
  assert.equal(resultadoEstimado({ ...base, p_aprovacao: 0.95 }, "step2ck").codigo, "atinge");
});

test("Step 2 CK: probabilidade de atingir o padrão, sem nota de três dígitos inventada", () => {
  const { est, form } = fazerDia("step2ck", "CK-A", 1.6, 9, { emBranco: 1 });
  assert.equal(form.total, 318);
  assert.equal(est.escore, null, "sem modelo calibrado com notas reais, não há nota");
  const r = resultadoEstimado(est, "step2ck");
  assert.equal(r.codigo, "atinge");
  assert.match(r.frase, /218/);
  assert.doesNotMatch(r.titulo + " " + r.selo, /\d{3}/, "nenhuma nota de três dígitos no resultado");
  assert.equal("escore" in r, false);
  assert.ok(est.avisos.some((a) => /três dígitos/.test(a)));
  const perfil = perfilRelatorio(est, "step2ck");
  assert.deepEqual(perfil.map((p) => p.dim), ["sistema", "disciplinas_oficiais", "competencia"]);
  assert.equal(perfil[2].titulo, "Tarefas do médico (competências)");
});

test("revisão item a item: ordem da prova, situação, filtros, tempo e anotação", () => {
  const { reg, resultado } = fazerDia("step2ck", "CK-A", 0.4, 12, { emBranco: 2 });
  const itens = itensRevisao(reg, banco.porId);
  assert.equal(itens.length, 318);
  assert.equal(itens[0].numero, 1);
  assert.equal(itens[0].nota, "anotação de teste");
  assert.equal(filtrarItens(itens, { situacao: "certas" }).length, resultado.acertos);
  assert.equal(filtrarItens(itens, { situacao: "erradas" }).length, 318 - resultado.acertos);
  assert.equal(filtrarItens(itens, { situacao: "todas", bloco: 15 }).length, reg.formulario.blocos[15].length);
  assert.equal(itens.filter((x) => x.situacao === "em_branco").length, 2 * 16);
  assert.ok(itens.every((x) => x.tempo_ms > 0));
});

test("card pré-preenchido: os campos chegam ao editor do app de flashcards, e o retorno só aceita página do site", () => {
  const q = banco.steps.step1[0];
  const c = cardDoItem(q);
  assert.equal(c.sistema, q.sistema);
  assert.equal(c.disciplina, q.disciplina);
  assert.equal(c.verso, q.alternativas.find((a) => a.letra === q.correta).texto);
  const url = linkCriarFlashcard(q, { retorno: "../simulado/#/relatorio/sc-1" });
  assert.match(url, /^\.\.\/anki\/#\/criar\?/);
  const params = new URLSearchParams(url.split("?")[1]);
  const pre = preenchimento(params);
  assert.equal(pre.frente, c.frente);
  assert.equal(pre.de_questao, q.id);
  assert.ok(pre.tags.includes("simulado"));
  assert.equal(retornoSeguro(params.get("retorno")), "../simulado/#/relatorio/sc-1");
  assert.equal(retornoSeguro("https://exemplo.com/"), "");
  assert.equal(retornoSeguro("javascript:alert(1)"), "");
  const ck = banco.steps.step2ck.find((x) => x.sistema === "nervoso_sentidos");
  assert.equal(cardDoItem(ck).sistema, "comportamento_nervoso");
  assert.equal(cardDoItem(ck).disciplina, "");
  const s1 = new Set(sistemasDoOutline("step1"));
  for (const k of sistemasDoOutline("step2ck")) assert.ok(s1.has(CK_PARA_STEP1[k]), "sistema do Step 2 CK sem correspondência: " + k);
});

test("histórico e escala do perfil", () => {
  const { reg, resultado, est } = fazerDia("step1", "S1-A", 0.8, 21);
  const l = linhaHistorico({ ...reg, resultado: { ...resultado, estimativa: instantaneo(est) }, fim: "2026-10-29T17:00:00Z" });
  assert.equal(l.total, 280);
  assert.equal(l.acertos, resultado.acertos);
  assert.equal(l.p_aprovacao, est.p_aprovacao);
  assert.equal(posicaoEscala(0), 50);
  assert.equal(posicaoEscala(-9), 0);
  assert.equal(posicaoEscala(9), 100);
});

test("itens já vistos: conta só respostas de outras sessões anteriores ao início do dia", () => {
  const { reg } = fazerDia("step1", "S1-A", 0.5, 21);
  const [a, b, c] = reg.formulario.blocos[0];
  const antes = new Date(Date.parse(reg.sessao.inicio) - 86400000).toISOString();
  const depois = new Date(Date.parse(reg.sessao.inicio) + 60000).toISOString();
  const r = itensJaVistos(reg, [
    { questao_id: a, respondida_em: antes, sessao_id: "outro" },
    { questao_id: b, respondida_em: depois, sessao_id: reg.id },
    { questao_id: c, respondida_em: depois, sessao_id: "outro" },
    { questao_id: "fora-do-form", respondida_em: antes }
  ]);
  assert.equal(r.n, 1);
  assert.deepEqual(r.ids, [a]);
  assert.equal(r.total, 280);
});

test("validade do simulado: só o dia em condições oficiais, sem paradas, sem reaplicação e completo vale para a prontidão", async () => {
  const { validadeDoSimulado } = await import("../js/relatorio.js");
  const { reg, est } = fazerDia("step1", "S1-A", 1.0, 21);
  const estudo = validadeDoSimulado(reg);
  assert.equal(estudo.padronizado, false, "o dia de teste foi criado em condições de estudo");
  assert.equal(estudo.valido_prontidao, false);
  const oficial = validadeDoSimulado({ ...reg, sessao: { ...reg.sessao, condicoes: "oficiais", suspensoes: [] } });
  assert.equal(oficial.valido_prontidao, true);
  const reap = validadeDoSimulado({ ...reg, sessao: { ...reg.sessao, condicoes: "oficiais", suspensoes: [] }, formulario: { ...reg.formulario, ja_vistos: { n: 100, total: 280, reaplicacao: true } } });
  assert.equal(reap.reaplicacao, true);
  assert.equal(reap.valido_prontidao, false);
  assert.match(reap.motivos.join(" "), /reaplicação, não comparável/);
  const snap = instantaneo(est, oficial);
  assert.equal(snap.valido_prontidao, true);
  assert.equal(snap.corte_origem, "provisorio");
});
