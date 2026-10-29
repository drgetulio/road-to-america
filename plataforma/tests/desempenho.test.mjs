import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG_PADRAO, mergeConfig, resumirParticipante, riscos, avaliarParticipante, garantia, prontidao, resumoCoorte,
  parsePresencaCsv, validarNbme, normalizarNbme, atividadeDiaria
} from "../js/desempenho.js";

const AGORA = new Date(2026, 9, 28, 15);
const DIA = 864e5;
const diasAtras = (n, h = 0) => new Date(AGORA.getTime() - n * DIA + h * 36e5).toISOString();
const dataISO = (n) => { const d = new Date(AGORA.getTime() + n * DIA); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

/* Linha mínima "em dia": estudou hoje, sem dados que disparem critérios */
function linha(extra = {}) {
  const base = {
    user_id: "u1", nome: "Teste", email: "t@demo.local", criado_em: diasAtras(100), sintetico: true,
    plano: { data_prova_step1: null, data_prova_step2ck: null, step1_aprovado: false, step2ck_aprovado: false, data_matricula: null, ciclo_basico_concluido_em: null },
    flashcards: { retencao_30d: { total: 500, acertos: 450, taxa: 0.9 } },
    simulados: { step1: { n: 0, ultimo_em: null, ultimos: [] }, step2ck: { n: 0, ultimo_em: null, ultimos: [] } },
    nbme: [], presenca: { aulas_assistidas: 40, aulas_totais: 40, percentual: 1 },
    ultima_atividade: diasAtras(0, -1)
  };
  return { ...base, ...extra, plano: { ...base.plano, ...(extra.plano || {}) } };
}
const codigos = (l, cfg) => riscos(l, cfg || CONFIG_PADRAO, AGORA).lista.map((r) => r.codigo);
const sim = (...pcts) => ({ n: pcts.length, ultimo_em: diasAtras(1), ultimos: pcts.map((p, i) => ({ percentual: p, acertos: Math.round(p * 20), total: 20, fim: diasAtras(i + 1) })) });
const nb = (step, n, prob, extra = {}) => ({ id: step + n, step, formulario: "Form " + n, modo: "standard", data: dataISO(-n), escore: 210, probabilidade: prob, faixa_acima_aprovacao_baixa: null, verificada: false, criado_em: diasAtras(n), ...extra });

test("linha em dia não dispara nenhum critério", () => {
  const a = avaliarParticipante(linha(), { agora: AGORA });
  assert.equal(a.status, "em_dia");
  assert.deepEqual(a.riscos, []);
});

test("inatividade: 6 dias não, 7 dias sim, 14 dias é nível alto", () => {
  assert.deepEqual(codigos(linha({ ultima_atividade: diasAtras(6) })), []);
  const r7 = riscos(linha({ ultima_atividade: diasAtras(7) }), CONFIG_PADRAO, AGORA);
  assert.equal(r7.lista[0].codigo, "inatividade");
  assert.equal(r7.lista[0].nivel, "normal");
  assert.equal(r7.dias_sem_estudo, 7);
  assert.equal(riscos(linha({ ultima_atividade: diasAtras(14) }), CONFIG_PADRAO, AGORA).lista[0].nivel, "alto");
  assert.equal(avaliarParticipante(linha({ ultima_atividade: diasAtras(14) }), { agora: AGORA }).status, "risco");
  assert.equal(avaliarParticipante(linha({ ultima_atividade: diasAtras(8) }), { agora: AGORA }).status, "atencao");
});

test("inatividade sem nenhum estudo conta a partir da criação da conta", () => {
  assert.deepEqual(codigos(linha({ ultima_atividade: null, criado_em: diasAtras(3) })), []);
  const r = riscos(linha({ ultima_atividade: null, criado_em: diasAtras(20) }), CONFIG_PADRAO, AGORA).lista[0];
  assert.equal(r.codigo, "inatividade");
  assert.match(r.detalhe, /Nenhum estudo/);
});

test("retenção baixa exige taxa abaixo de 80% com pelo menos 100 revisões", () => {
  assert.deepEqual(codigos(linha({ flashcards: { retencao_30d: { total: 99, acertos: 50, taxa: 50 / 99 } } })), []);
  assert.deepEqual(codigos(linha({ flashcards: { retencao_30d: { total: 100, acertos: 80, taxa: 0.8 } } })), []);
  assert.deepEqual(codigos(linha({ flashcards: { retencao_30d: { total: 100, acertos: 79, taxa: 0.79 } } })), ["retencao_baixa"]);
});

test("simulados: média dos 2 últimos de cada Step abaixo de 60%, exigindo 2 tentativas", () => {
  assert.deepEqual(codigos(linha({ simulados: { step1: sim(0.3), step2ck: sim() } })), [], "uma tentativa só não basta");
  assert.deepEqual(codigos(linha({ simulados: { step1: sim(0.6, 0.6, 0.1), step2ck: sim() } })), [], "60% exatos não disparam e a 3ª mais antiga não entra");
  const r = riscos(linha({ simulados: { step1: sim(0.75), step2ck: sim(0.5, 0.65) } }), CONFIG_PADRAO, AGORA).lista;
  assert.deepEqual(r.map((x) => [x.codigo, x.step]), [["simulado_baixo", "step2ck"]]);
});

test("presença: 32 de 40 (80%) cumpre, 31 de 40 dispara", () => {
  assert.deepEqual(codigos(linha({ presenca: { aulas_assistidas: 32, aulas_totais: 40 } })), []);
  assert.deepEqual(codigos(linha({ presenca: { aulas_assistidas: 31, aulas_totais: 40 } })), ["presenca_baixa"]);
  assert.deepEqual(codigos(linha({ presenca: null })), [], "sem lançamento não há critério");
  assert.deepEqual(codigos(linha({ presenca: { aulas_assistidas: 0, aulas_totais: 0 } })), []);
});

test("NBME insuficiente: menos de 2 lançadas para um Step pendente a menos de 60 dias da prova", () => {
  const um = [nb("step1", 5, 95)];
  assert.deepEqual(codigos(linha({ nbme: um, plano: { data_prova_step1: dataISO(60) } })), [], "60 dias ainda não");
  const r59 = riscos(linha({ nbme: um, plano: { data_prova_step1: dataISO(59) } }), CONFIG_PADRAO, AGORA).lista;
  assert.deepEqual(r59.map((x) => [x.codigo, x.nivel]), [["nbme_insuficiente", "normal"]]);
  const r30 = riscos(linha({ nbme: um, plano: { data_prova_step1: dataISO(30) } }), CONFIG_PADRAO, AGORA).lista;
  assert.equal(r30[0].nivel, "alto");
  assert.deepEqual(codigos(linha({ nbme: [...um, nb("step1", 9, 93)], plano: { data_prova_step1: dataISO(20) } })), []);
  assert.deepEqual(codigos(linha({ nbme: [], plano: { data_prova_step1: dataISO(-3) } })), [], "prova já passou");
  assert.deepEqual(codigos(linha({ nbme: [], plano: { data_prova_step1: dataISO(10), step1_aprovado: true } })), [], "Step aprovado não exige");
});

test("probabilidade da última NBME abaixo da meta do admin", () => {
  const l = linha({ nbme: [nb("step1", 20, 60), nb("step1", 5, 85)] });
  assert.deepEqual(codigos(l), ["nbme_probabilidade_baixa"]);
  assert.deepEqual(codigos(l, { ...CONFIG_PADRAO, meta_probabilidade: 80 }), [], "meta ajustada pelo admin");
  assert.deepEqual(codigos(linha({ nbme: [nb("step1", 20, 60), nb("step1", 5, 92)] })), [], "vale a última");
  assert.deepEqual(codigos(linha({ nbme: [nb("step1", 5, null, { escore_texto: "x" })] })), [], "sem probabilidade não dispara");
});

test("dois critérios normais viram risco", () => {
  const a = avaliarParticipante(linha({ presenca: { aulas_assistidas: 10, aulas_totais: 40 }, ultima_atividade: diasAtras(8) }), { agora: AGORA });
  assert.equal(a.status, "risco");
  assert.equal(a.riscos.length, 2);
});

test("garantia: presença, NBMEs por Step pendente e verificação", () => {
  let g = garantia(linha({ nbme: [nb("step1", 1, 90), nb("step1", 2, 90), nb("step2ck", 1, 90), nb("step2ck", 2, 90)] }), CONFIG_PADRAO, AGORA);
  assert.equal(g.cumpre, "pendente_verificacao");
  assert.equal(g.nbme.step1.lancados, 2);
  const ver = { verificada: true };
  g = garantia(linha({ nbme: [nb("step1", 1, 90, ver), nb("step1", 2, 90, ver), nb("step2ck", 1, 90, ver), nb("step2ck", 2, 90, ver)] }), CONFIG_PADRAO, AGORA);
  assert.equal(g.cumpre, "sim");
  g = garantia(linha({ nbme: [nb("step2ck", 1, 90, ver), nb("step2ck", 2, 90, ver)], plano: { step1_aprovado: true } }), CONFIG_PADRAO, AGORA);
  assert.equal(g.cumpre, "sim", "Step 1 aprovado dispensa as NBMEs dele");
  assert.equal(g.nbme.step1.exigido, false);
  g = garantia(linha({ nbme: [nb("step2ck", 1, 90, ver)], plano: { step1_aprovado: true } }), CONFIG_PADRAO, AGORA);
  assert.equal(g.cumpre, "ainda_nao");
  g = garantia(linha({ presenca: { aulas_assistidas: 30, aulas_totais: 40 }, plano: { step1_aprovado: true, step2ck_aprovado: true } }), CONFIG_PADRAO, AGORA);
  assert.equal(g.cumpre, "ainda_nao");
  assert.equal(g.presenca.faltam_aulas, 2);
  assert.equal(g.todos_aprovados, true);
  g = garantia(linha({ presenca: null, plano: { step1_aprovado: true, step2ck_aprovado: true } }), CONFIG_PADRAO, AGORA);
  assert.equal(g.cumpre, "sem_dados_presenca");
});

test("garantia: prazo de 3 anos a partir da matrícula ou da conclusão do ciclo básico, o que vier depois", () => {
  let g = garantia(linha({ plano: { data_matricula: "2026-10-01" } }), CONFIG_PADRAO, AGORA);
  assert.deepEqual([g.prazo.inicio, g.prazo.fim], ["2026-10-01", "2029-10-01"]);
  g = garantia(linha({ plano: { data_matricula: "2026-10-01", ciclo_basico_concluido_em: "2027-12-15" } }), CONFIG_PADRAO, AGORA);
  assert.deepEqual([g.prazo.inicio, g.prazo.fim], ["2027-12-15", "2030-12-15"]);
  assert.equal(garantia(linha(), CONFIG_PADRAO, AGORA).prazo, null);
});

test("prontidão (EXIT 18): duas últimas em standard-paced com probabilidade >= 90%", () => {
  assert.equal(prontidao([nb("step1", 3, 95)], "step1").status, "insuficiente");
  assert.equal(prontidao([nb("step1", 9, 91), nb("step1", 3, 95)], "step1").status, "pronto");
  assert.equal(prontidao([nb("step1", 9, 91), nb("step1", 3, 95)], "step1").faixa_confirmada, false);
  assert.equal(prontidao([nb("step1", 9, 85), nb("step1", 3, 95)], "step1").status, "nao_pronto");
  assert.equal(prontidao([nb("step1", 20, 40), nb("step1", 9, 91), nb("step1", 3, 95)], "step1").status, "pronto", "só as duas últimas contam");
  assert.equal(prontidao([nb("step1", 9, 91), nb("step1", 3, 95, { modo: "self" })], "step1").status, "insuficiente", "self-paced não entra");
  assert.equal(prontidao([nb("step1", 9, 91, { faixa_acima_aprovacao_baixa: true }), nb("step1", 3, 95, { faixa_acima_aprovacao_baixa: false })], "step1").status, "nao_pronto");
  const ok = prontidao([nb("step1", 9, 91, { faixa_acima_aprovacao_baixa: true }), nb("step1", 3, 95, { faixa_acima_aprovacao_baixa: true })], "step1");
  assert.equal(ok.status, "pronto");
  assert.equal(ok.faixa_confirmada, true);
  assert.equal(prontidao([nb("step1", 9, null, { escore_texto: "x" }), nb("step1", 3, 95)], "step1").status, "insuficiente");
  const av = avaliarParticipante(linha({ plano: { step1_aprovado: true } }), { agora: AGORA });
  assert.equal(av.prontidao.step1.status, "aprovado");
});

test("configuração: aceita percentuais em 0 a 1 ou 0 a 100 e ignora valores inválidos", () => {
  const c = mergeConfig({ presenca_minima: 75, simulado_minimo: 0.5, dias_inatividade: "abc", meta_probabilidade: 150 });
  assert.equal(c.presenca_minima, 0.75);
  assert.equal(c.simulado_minimo, 0.5);
  assert.equal(c.dias_inatividade, 7);
  assert.equal(c.meta_probabilidade, 100);
});

test("resumirParticipante: revisões, retenção, série de 30 dias, sequência, cobertura e data da prova dos ajustes", () => {
  const revlog = [
    { review: diasAtras(0, -2), state: 2, rating: 3 },
    { review: diasAtras(0, -3), state: 2, rating: 1 },
    { review: diasAtras(1), state: 0, rating: 3 },
    { review: diasAtras(2), state: 2, rating: 4 },
    { review: diasAtras(10), state: 2, rating: 3 },
    { review: diasAtras(40), state: 2, rating: 1 }
  ];
  const estados = [
    { key: "a#1", card_id: "a", state: 2, scheduled_days: 30 },
    { key: "a#2", card_id: "a", state: 2, scheduled_days: 5, leech: true },
    { key: "b#1", card_id: "b", state: 1, scheduled_days: 0 },
    { key: "c#1", card_id: "c", state: 0 },
    { key: "p#1", card_id: "pessoal", state: 2, scheduled_days: 40, suspenso: true }
  ];
  const l = resumirParticipante({
    perfil: { id: "u", nome: "N", email: "e" }, revlog, estados, oficiais: ["a", "b", "c", "d"],
    simulados: [{ id: "s1", step: "step1", acertos: 10, total: 20, fim: diasAtras(3) }, { id: "s2", step: "step1", acertos: 15, total: 20, fim: diasAtras(1) }],
    nbme: [nb("step1", 4, 88)], presenca: { aulas_assistidas: 9, aulas_totais: 10 },
    configuracoes: { dataProva: "2027-01-10" }, agora: AGORA
  });
  const f = l.flashcards;
  assert.equal(f.revisoes_hoje, 2);
  assert.equal(f.revisoes_7d, 4);
  assert.equal(f.revisoes_30d, 5);
  assert.equal(f.por_dia_30.length, 30);
  assert.equal(f.por_dia_30[29], 2);
  assert.equal(f.por_dia_30[28], 1);
  assert.equal(f.dias_estudados_30d, 4);
  assert.deepEqual([f.retencao_30d.total, f.retencao_30d.acertos], [4, 3]);
  assert.equal(f.sequencia_atual, 3);
  assert.deepEqual([f.vistos, f.vistos_itens, f.maduros, f.jovens, f.aprendendo, f.leeches, f.suspensos], [2, 4, 1, 1, 1, 1, 1]);
  assert.equal(f.cobertura, 0.5);
  assert.equal(l.simulados.step1.n, 2);
  assert.equal(l.simulados.step1.ultimos[0].percentual, 0.75, "mais recente primeiro");
  assert.equal(l.plano.data_prova_step1, "2027-01-10");
  assert.equal(l.presenca.percentual, 0.9);
  assert.equal(l.ultima_atividade, revlog[0].review);
});

test("atividade diária devolve um dia por posição, com acertos de revisão", () => {
  const a = atividadeDiaria([{ review: diasAtras(0, -1), state: 2, rating: 3 }, { review: diasAtras(0, -2), state: 2, rating: 1 }, { review: diasAtras(3), state: 0, rating: 3 }], { dias: 7, agora: AGORA });
  assert.equal(a.length, 7);
  assert.deepEqual(a[6], { dia: dataISO(0), revisoes: 2, revisao_total: 2, revisao_acertos: 1 });
  assert.equal(a[3].revisoes, 1);
});

test("resumo da coorte conta status, critérios e garantia", () => {
  const r = resumoCoorte([linha(), linha({ ultima_atividade: diasAtras(30) }), linha({ presenca: { aulas_assistidas: 1, aulas_totais: 10 } })], { agora: AGORA });
  assert.deepEqual(r.por_status, { em_dia: 1, atencao: 1, risco: 1 });
  assert.equal(r.por_criterio.inatividade, 1);
  assert.equal(r.por_criterio.presenca_baixa, 1);
  assert.equal(r.garantia.ainda_nao, 3);
  assert.equal(r.avaliacoes.length, 3);
});

test("CSV de presença: separadores, BOM, cabeçalho em qualquer ordem, erros por linha e e-mail repetido", () => {
  const r = parsePresencaCsv("﻿aulas_totais;Email;aulas_assistidas\n40;Ana@X.com;35\n40;bia@x.com;41\n40;nao-email;3\n40;ana@x.com;36\n\n");
  assert.deepEqual(r.linhas, [{ email: "ana@x.com", aulas_assistidas: 36, aulas_totais: 40 }]);
  assert.deepEqual(r.erros.map((e) => e.linha), [3, 4]);
  const v = parsePresencaCsv('email,aulas_assistidas,aulas_totais\r\n"c@x.com","10","12"');
  assert.deepEqual(v.linhas, [{ email: "c@x.com", aulas_assistidas: 10, aulas_totais: 12 }]);
  assert.equal(parsePresencaCsv("nome,total\nx,1").erros.length, 1);
  assert.equal(parsePresencaCsv("").erros.length, 1);
  const tab = parsePresencaCsv("email\taulas_assistidas\taulas_totais\nd@x.com\t1.5\t2");
  assert.equal(tab.linhas.length, 0);
  assert.equal(tab.erros.length, 1);
});

test("validação e normalização da NBME", () => {
  const ok = { step: "step1", formulario: "CBSSA Form 31", data: dataISO(-1), escore: "212", probabilidade: "91.5" };
  assert.deepEqual(validarNbme(ok, AGORA), []);
  assert.ok(validarNbme({ ...ok, step: "x" }, AGORA).length);
  assert.ok(validarNbme({ ...ok, data: dataISO(10) }, AGORA).length);
  assert.ok(validarNbme({ ...ok, data: "28/10/2026" }, AGORA).length);
  assert.ok(validarNbme({ ...ok, escore: 1000 }, AGORA).length);
  assert.ok(validarNbme({ ...ok, escore: null }, AGORA).length);
  assert.deepEqual(validarNbme({ ...ok, escore: null, escore_texto: "Pass, faixa baixa" }, AGORA), []);
  assert.ok(validarNbme({ ...ok, probabilidade: 101 }, AGORA).length);
  const n = normalizarNbme(ok);
  assert.equal(n.escore, 212);
  assert.equal(n.probabilidade, 91.5);
  assert.equal(n.modo, "standard");
  assert.equal(n.faixa_acima_aprovacao_baixa, null);
});

test("última atividade conta o banco de questões e os simulados completos", async () => {
  const { resumirParticipante } = await import("../js/desempenho.js");
  const agora = new Date("2026-10-29T15:00:00Z");
  const perfil = { id: "u1", nome: "Teste", criado_em: "2026-01-01T00:00:00Z" };
  assert.equal(resumirParticipante({ perfil, agora }).ultima_atividade, null, "sem nada, nunca estudou");
  const r = resumirParticipante({ perfil, agora, respostas: [{ respondida_em: "2026-10-28T10:00:00Z" }, { respondida_em: "2026-10-20T10:00:00Z" }] });
  assert.equal(r.ultima_atividade, "2026-10-28T10:00:00.000Z");
  const c = resumirParticipante({ perfil, agora, respostas: [{ respondida_em: "2026-10-28T10:00:00Z" }], simuladosCompletos: [{ atualizado_em: "2026-10-29T09:00:00Z" }] });
  assert.equal(c.ultima_atividade, "2026-10-29T09:00:00.000Z", "dia de prova parado no meio, ainda sem respostas gravadas");
});

test("relógio adiantado: atividade gravada no futuro conta como hoje, nunca dias negativos", () => {
  const a = avaliarParticipante(linha({ ultima_atividade: diasAtras(-1) }), { agora: AGORA });
  assert.equal(a.dias_sem_estudo, 0);
  assert.equal(a.status, "em_dia");
});
