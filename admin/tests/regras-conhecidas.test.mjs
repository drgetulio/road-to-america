/* Cálculos de rendimento conferidos com dados montados à mão, com o resultado
   esperado escrito antes (node:test). Cobrem retenção real, sequência de estudo,
   critérios de risco, situação da garantia, prazo, prontidão (EXIT 18) e os
   indicadores da turma. Uso, na raiz: node --test admin/tests/*.test.mjs
   O fuso é fixado em America/Sao_Paulo para o dia virar às 4h como no app. */
process.env.TZ = "America/Sao_Paulo";
const { test } = await import("node:test");
const assert = (await import("node:assert/strict")).default;
const { resumirParticipante, avaliarParticipante, garantia, prontidao, riscos } = await import("../../plataforma/js/desempenho.js");
const { checklistGarantia, leituraProntidao, situacaoGarantia } = await import("../../plataforma/js/acompanhamento.js");
const { montarLinha, montarLinhas, indicadoresTurma, areasFracas, distribuicaoRetencao } = await import("../js/calculos.js");

const AGORA = new Date(2026, 9, 28, 15, 0);      // 28/10/2026, 15h
const em = (diasAtras, hora = 10) => new Date(2026, 9, 28 - diasAtras, hora, 0).toISOString();
const rev = (diasAtras, state, rating, hora = 10) => ({ review: em(diasAtras, hora), state, rating, elapsed_days: 30 });
const perfil = { id: "p1", nome: "Caso", email: "caso@x.com", criado_em: em(200) };
const dataISO = (diasAFrente) => { const d = new Date(2026, 9, 28 + diasAFrente, 12); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

test("retenção real: só revisões de cards em revisão (state 2), Errei conta como esquecido, janela de 30 dias", () => {
  const revlog = [
    ...Array.from({ length: 7 }, () => rev(1, 2, 3)),   // 7 lembradas
    ...Array.from({ length: 2 }, () => rev(2, 2, 1)),   // 2 Errei
    rev(3, 2, 2),                                       // 1 Difícil (lembrada)
    rev(1, 0, 1), rev(1, 1, 1), rev(1, 3, 3),           // novo, aprendendo, reaprendendo: fora
    rev(30, 2, 1), rev(45, 2, 1)                        // fora da janela (dia 30 atrás já é o 31º dia)
  ];
  const l = resumirParticipante({ perfil, revlog, agora: AGORA });
  assert.deepEqual(l.flashcards.retencao_30d, { total: 10, acertos: 8, taxa: 0.8 });
  assert.equal(l.flashcards.revisoes_30d, 13, "30 dias contam todas as respostas, de qualquer estado");
});

test("sequência: o dia vira às 4h; estudar ontem mantém a sequência; um dia sem estudo zera", () => {
  /* ontem, anteontem e 3 dias atrás; depois um buraco; antes 5 dias seguidos */
  const dias = [1, 2, 3, 5, 6, 7, 8, 9];
  const l = resumirParticipante({ perfil, revlog: dias.map((d) => rev(d, 2, 3)), agora: AGORA });
  assert.equal(l.flashcards.sequencia_atual, 3);
  assert.equal(l.flashcards.maior_sequencia, 5);
  /* revisão às 2h de hoje pertence ao dia de ontem (vira às 4h) */
  const madrugada = resumirParticipante({ perfil, revlog: [rev(0, 2, 3, 2)], agora: AGORA });
  assert.equal(madrugada.flashcards.revisoes_hoje, 0);
  assert.equal(madrugada.flashcards.sequencia_atual, 1);
  /* última revisão há 2 dias: sequência atual zerada */
  const parada = resumirParticipante({ perfil, revlog: [rev(2, 2, 3), rev(3, 2, 3)], agora: AGORA });
  assert.equal(parada.flashcards.sequencia_atual, 0);
  assert.equal(parada.flashcards.maior_sequencia, 2);
});

function base(extra = {}) {
  return {
    user_id: "p1", nome: "Caso", email: "caso@x.com", criado_em: em(200), sintetico: false,
    plano: { data_prova_step1: null, data_prova_step2ck: null, step1_aprovado: false, step2ck_aprovado: false, data_matricula: "2026-08-10", ciclo_basico_concluido_em: null },
    flashcards: { revisoes_hoje: 0, revisoes_7d: 70, revisoes_30d: 300, dias_estudados_30d: 20, por_dia_30: new Array(30).fill(10),
      retencao_30d: { total: 200, acertos: 180, taxa: 0.9 }, sequencia_atual: 5, maior_sequencia: 9, vistos: 10, vistos_itens: 12,
      maduros: 3, jovens: 4, aprendendo: 2, leeches: 0, suspensos: 0, total_oficial: 100, cobertura: 0.1, ultima_revisao: em(1) },
    simulados: { step1: { n: 0, ultimo_em: null, ultimos: [] }, step2ck: { n: 0, ultimo_em: null, ultimos: [] } },
    nbme: [], presenca: { aulas_assistidas: 36, aulas_totais: 40, percentual: 0.9, atualizado_em: null },
    ultima_atividade: em(1), ...extra
  };
}
const nb = (step, diasAtras, prob, extra = {}) => ({ id: step + diasAtras, step, formulario: "Form " + diasAtras, modo: "standard", data: dataISO(-diasAtras), escore: 220, escore_texto: "", probabilidade: prob, faixa_acima_aprovacao_baixa: null, verificada: false, criado_em: em(diasAtras), ...extra });

test("risco: limites exatos de inatividade, retenção, simulados e presença", () => {
  const cod = (l) => riscos(l, undefined, AGORA).lista.map((r) => r.codigo + ":" + r.nivel);
  assert.deepEqual(cod(base({ ultima_atividade: em(6) })), [], "6 dias sem estudo ainda não acende");
  assert.deepEqual(cod(base({ ultima_atividade: em(7) })), ["inatividade:normal"]);
  assert.deepEqual(cod(base({ ultima_atividade: em(14) })), ["inatividade:alto"]);
  /* retenção 79,5% acende; 80% não; abaixo de 100 revisões não conta */
  assert.deepEqual(cod(base({ flashcards: { ...base().flashcards, retencao_30d: { total: 200, acertos: 159, taxa: 0.795 } } })), ["retencao_baixa:normal"]);
  assert.deepEqual(cod(base({ flashcards: { ...base().flashcards, retencao_30d: { total: 200, acertos: 160, taxa: 0.8 } } })), []);
  assert.deepEqual(cod(base({ flashcards: { ...base().flashcards, retencao_30d: { total: 99, acertos: 50, taxa: 0.505 } } })), []);
  /* média dos 2 últimos simulados: 55% e 60% = 57,5% acende; um só não basta */
  const sim = (ps) => ({ step1: { n: ps.length, ultimo_em: em(1), ultimos: ps.map((p) => ({ percentual: p, acertos: p * 20, total: 20 })) }, step2ck: { n: 0, ultimo_em: null, ultimos: [] } });
  assert.deepEqual(cod(base({ simulados: sim([0.55, 0.6, 0.9]) })), ["simulado_baixo:normal"]);
  assert.deepEqual(cod(base({ simulados: sim([0.3]) })), []);
  /* presença: 32/40 = 80% cumpre; 31/40 não */
  assert.deepEqual(cod(base({ presenca: { aulas_assistidas: 32, aulas_totais: 40 } })), []);
  assert.deepEqual(cod(base({ presenca: { aulas_assistidas: 31, aulas_totais: 40 } })), ["presenca_baixa:normal"]);
});

test("status: 1 critério normal = atenção; 2 critérios ou 1 alto = risco", () => {
  const st = (l) => avaliarParticipante(l, { agora: AGORA }).status;
  assert.equal(st(base()), "em_dia");
  assert.equal(st(base({ ultima_atividade: em(8) })), "atencao");
  assert.equal(st(base({ ultima_atividade: em(15) })), "risco");
  assert.equal(st(base({ ultima_atividade: em(8), presenca: { aulas_assistidas: 10, aulas_totais: 40 } })), "risco");
});

test("NBME perto da prova: insuficiente a menos de 60 dias, alto a 30 dias ou menos; Step aprovado não cobra", () => {
  const cod = (l) => riscos(l, undefined, AGORA).lista.map((r) => r.codigo + ":" + r.nivel);
  assert.deepEqual(cod(base({ plano: { ...base().plano, data_prova_step1: dataISO(60) } })), [], "60 dias: ainda não cobra");
  assert.deepEqual(cod(base({ plano: { ...base().plano, data_prova_step1: dataISO(59) } })), ["nbme_insuficiente:normal"]);
  assert.deepEqual(cod(base({ plano: { ...base().plano, data_prova_step1: dataISO(30) } })), ["nbme_insuficiente:alto"]);
  assert.deepEqual(cod(base({ plano: { ...base().plano, data_prova_step1: dataISO(30) }, nbme: [nb("step1", 10, 92), nb("step1", 3, 95)] })), []);
  assert.deepEqual(cod(base({ plano: { ...base().plano, data_prova_step1: dataISO(10), step1_aprovado: true } })), []);
});

test("garantia: prazo de 3 anos conta da conclusão do ciclo básico quando ela é posterior à matrícula", () => {
  const g1 = garantia(base(), undefined, AGORA);
  assert.deepEqual([g1.prazo.inicio, g1.prazo.fim], ["2026-08-10", "2029-08-10"]);
  const g2 = garantia(base({ plano: { ...base().plano, ciclo_basico_concluido_em: "2027-12-15" } }), undefined, AGORA);
  assert.deepEqual([g2.prazo.inicio, g2.prazo.fim], ["2027-12-15", "2030-12-15"]);
  /* faltam aulas: 30 de 40 -> precisa de 32 */
  assert.equal(garantia(base({ presenca: { aulas_assistidas: 30, aulas_totais: 40 } }), undefined, AGORA).presenca.faltam_aulas, 2);
});

test("garantia: lançada conta, verificada fecha; Step aprovado dispensa as NBMEs daquele Step", () => {
  const dois = [nb("step1", 20, 80), nb("step1", 5, 85), nb("step2ck", 9, 70), nb("step2ck", 2, 75)];
  const av = (l) => avaliarParticipante(l, { agora: AGORA });
  assert.equal(av(base({ nbme: dois })).garantia.cumpre, "pendente_verificacao");
  assert.equal(situacaoGarantia(av(base({ nbme: dois }))), "verificar");
  const verif = dois.map((x) => ({ ...x, verificada: true }));
  assert.equal(av(base({ nbme: verif })).garantia.cumpre, "sim");
  const aprov1 = base({ nbme: verif.filter((x) => x.step === "step2ck"), plano: { ...base().plano, step1_aprovado: true } });
  assert.equal(av(aprov1).garantia.cumpre, "sim");
  assert.equal(av(base({ nbme: dois.slice(0, 3) })).garantia.cumpre, "ainda_nao");
});

test("checklist: NBME que ainda não é cobrada fica em andamento; perto da prova ou com prazo vencido fica pendente", () => {
  const est = (l) => { const a = avaliarParticipante(l, { agora: AGORA }); return checklistGarantia(l, a).map((i) => i.estado); };
  assert.deepEqual(est(base()), ["cumprido", "andamento", "andamento", "cumprido"]);
  assert.deepEqual(est(base({ plano: { ...base().plano, data_prova_step1: dataISO(20) } })), ["cumprido", "pendente", "andamento", "cumprido"]);
  assert.deepEqual(est(base({ plano: { ...base().plano, data_matricula: "2022-01-10" } })), ["cumprido", "pendente", "pendente", "pendente"]);
  assert.deepEqual(est(base({ presenca: null, plano: { ...base().plano, data_matricula: null } })), ["sem_dado", "andamento", "andamento", "sem_dado"]);
});

test("prontidão EXIT 18: duas últimas em standard-paced com 90% ou mais; sem a faixa informada não aparece como atendido", () => {
  const l = (lista) => base({ nbme: lista, plano: { ...base().plano, data_prova_step1: dataISO(12) } });
  /* self-paced não entra; a mais antiga com 70% sai da conta */
  const ok = [nb("step1", 30, 70), nb("step1", 14, 91, { faixa_acima_aprovacao_baixa: true }), nb("step1", 9, 60, { modo: "self" }), nb("step1", 3, 93, { faixa_acima_aprovacao_baixa: true })];
  assert.equal(prontidao(ok, "step1").status, "pronto");
  assert.equal(montarLinha(l(ok), { agora: AGORA }).prontidao, "pronto");
  /* 89,9% numa das duas: não pronto */
  assert.equal(prontidao([nb("step1", 14, 89.9), nb("step1", 3, 95)], "step1").status, "nao_pronto");
  /* faixa marcada como não acima: não pronto mesmo com 95% */
  assert.equal(prontidao([nb("step1", 14, 95), nb("step1", 3, 95, { faixa_acima_aprovacao_baixa: false })], "step1").status, "nao_pronto");
  /* probabilidade atingida sem faixa: a regra devolve pronto, mas a tela separa */
  const semFaixa = l([nb("step1", 14, 92), nb("step1", 3, 95)]);
  const r = montarLinha(semFaixa, { agora: AGORA });
  assert.equal(r.prontidao, "pronto_sem_faixa");
  const leit = leituraProntidao(r.avaliacao.prontidao.step1, semFaixa, "step1", { agora: AGORA });
  assert.equal(leit.status_tela, "pronto_sem_faixa");
  assert.equal(leit.rotulo, "Falta confirmar a faixa");
  assert.equal(leit.dias_para_prova, 12);
  assert.ok(leit.avisos.some((a) => /12 dias/.test(a)));
  const ind = indicadoresTurma([r, montarLinha(l(ok), { agora: AGORA })], [], { agora: AGORA });
  assert.equal(ind.prontos, 1);
  assert.equal(ind.prontos_sem_faixa, 1);
});

test("turma: revisões por dia e mediana por ativo usam os mesmos 7 dias completos (sem o dia de hoje)", () => {
  /* A: 10 por dia nos 7 dias completos e 500 hoje; B: 0 nos 7 dias e 300 hoje */
  const porDia = (v7, hoje) => new Array(22).fill(0).concat(new Array(7).fill(v7), [hoje]);
  const a = montarLinha(base({ user_id: "a", flashcards: { ...base().flashcards, por_dia_30: porDia(10, 500), revisoes_7d: 70 + 500 } }), { agora: AGORA });
  const b = montarLinha(base({ user_id: "b", flashcards: { ...base().flashcards, por_dia_30: porDia(0, 300), revisoes_7d: 300 } }), { agora: AGORA });
  const ind = indicadoresTurma([a, b], [], { agora: AGORA });
  assert.equal(ind.revisoes_dia_7d, 10);
  assert.equal(ind.revisoes_dia_mediana_ativo, 10, "só A estudou nos 7 dias completos");
});

test("turma: retenção da turma soma revisões (não é média de taxas); distribuição exige volume mínimo", () => {
  const r1 = montarLinha(base({ user_id: "a", flashcards: { ...base().flashcards, retencao_30d: { total: 900, acertos: 810, taxa: 0.9 } } }), { agora: AGORA });
  const r2 = montarLinha(base({ user_id: "b", flashcards: { ...base().flashcards, retencao_30d: { total: 100, acertos: 70, taxa: 0.7 } } }), { agora: AGORA });
  const r3 = montarLinha(base({ user_id: "c", flashcards: { ...base().flashcards, retencao_30d: { total: 50, acertos: 10, taxa: 0.2 } } }), { agora: AGORA });
  const ind = indicadoresTurma([r1, r2, r3], [], { agora: AGORA });
  assert.equal(ind.retencao_turma, (810 + 70 + 10) / 1050);
  const d = distribuicaoRetencao([r1, r2, r3]);
  assert.deepEqual([d.abaixo_minimo, d.entre, d.na_meta, d.sem_volume], [1, 0, 1, 1]);
});

test("áreas fracas somam questões de várias tentativas e descartam áreas com menos de 4", () => {
  const t = (por_sistema) => ({ user_id: "a", step: "step1", fim: em(2), total: 20, acertos: 10, por_sistema });
  const sims = [t({ cardiovascular: { total: 3, acertos: 1 }, renal: { total: 2, acertos: 2 } }), t({ cardiovascular: { total: 2, acertos: 1 }, renal: { total: 1, acertos: 0 } })];
  const fr = areasFracas(sims, "step1", { agora: AGORA });
  assert.deepEqual(fr.map((a) => [a.chave, a.acertos, a.total]), [["cardiovascular", 2, 5]]);
});

test("CSV: número negativo continua número; texto que começa com sinal ganha apóstrofo", async () => {
  const { csvParticipantes } = await import("../js/calculos.js");
  const r = montarLinha(base({ nome: "=HYPERLINK(1)", plano: { ...base().plano, data_prova_step1: dataISO(-3), step1_aprovado: false } }), { agora: AGORA });
  const linha = csvParticipantes([r]).split("\r\n")[1].split(";");
  assert.equal(linha[0], "'=HYPERLINK(1)");
  assert.ok(linha.includes("-3"), "dias até a prova: -3 sem apóstrofo");
});
