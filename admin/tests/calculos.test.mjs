/* Testes dos cálculos da área administrativa (node:test).
   Uso, na raiz: node --test admin/tests/*.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  montarLinha, montarLinhas, filtrarLinhas, ordenarLinhas, csvParticipantes, indicadoresTurma, serieRevisoesTurma,
  tendenciaSimulados, mediaSimulados, areasFracas, distribuicaoRetencao, contagemCriterios, semanasAtividade,
  gradeCalor, nivelCalor, sugestoesAcao, prioridadeAtencao, turmaDe, rotuloTurma, textoUltimaAtividade, normalizarBusca, mediana
} from "../js/calculos.js";
import { checklistGarantia, leituraProntidao, situacaoGarantia, nomeArea, dataBR, pct, stepAtual } from "../../plataforma/js/acompanhamento.js";
import { avaliarParticipante, CONFIG_PADRAO } from "../../plataforma/js/desempenho.js";
import { gerarCoorte } from "../../plataforma/js/coorte-demo.js";
import { resumirParticipante } from "../../plataforma/js/desempenho.js";
import { addDays, dayStart } from "../../anki/js/util.js";

const AGORA = new Date(2026, 9, 28, 15);
const ler = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), "utf8"));
const bancos = { step1: ler("../../simulado/data/step1-questoes.json"), step2ck: ler("../../simulado/data/step2ck-questoes.json") };
const coorte = gerarCoorte({ agora: AGORA, bancos });
const linhasCoorte = coorte.participantes.map((x) => resumirParticipante({
  perfil: x, revlog: coorte.revlog[x.id], estados: coorte.estados[x.id], oficiais: coorte.oficiais,
  simulados: coorte.simulados.filter((s) => s.user_id === x.id), nbme: coorte.nbme.filter((n) => n.user_id === x.id),
  presenca: coorte.presenca[x.id], plano: coorte.planos[x.id], sintetico: true, agora: AGORA
}));
const rows = montarLinhas(linhasCoorte, { agora: AGORA });
const porSlug = (slug) => rows.find((r) => r.id === "demo-sint-" + slug);

/* linha mínima para casos de borda */
function linha(extra = {}) {
  return {
    user_id: "u1", nome: "Teste", email: "t@x.com", criado_em: "2026-09-01T12:00:00Z", sintetico: false,
    plano: { data_prova_step1: null, data_prova_step2ck: null, step1_aprovado: false, step2ck_aprovado: false, data_matricula: "2026-08-10", ciclo_basico_concluido_em: null },
    flashcards: { revisoes_hoje: 0, revisoes_7d: 70, revisoes_30d: 300, dias_estudados_30d: 20, por_dia_30: new Array(30).fill(10), retencao_30d: { total: 200, acertos: 180, taxa: 0.9 }, sequencia_atual: 5, maior_sequencia: 9, vistos: 10, vistos_itens: 12, maduros: 3, jovens: 4, aprendendo: 2, leeches: 0, suspensos: 0, total_oficial: 100, cobertura: 0.1, ultima_revisao: "2026-10-27T12:00:00Z" },
    simulados: { step1: { n: 0, ultimo_em: null, ultimos: [] }, step2ck: { n: 0, ultimo_em: null, ultimos: [] } },
    nbme: [], presenca: { aulas_assistidas: 36, aulas_totais: 40, percentual: 0.9, atualizado_em: null },
    ultima_atividade: "2026-10-27T12:00:00Z",
    ...extra
  };
}

test("linha da tabela: Step em preparo, turma pelo semestre da matrícula, situação da garantia", () => {
  const r = montarLinha(linha(), { agora: AGORA });
  assert.equal(r.step, "step1");
  assert.equal(r.turma, "2026/2");
  assert.equal(rotuloTurma(r.turma), "Matrícula 2026/2");
  assert.equal(turmaDe({ plano: { data_matricula: "2026-03-01" } }), "2026/1");
  assert.equal(turmaDe({ plano: {} }), "sem_matricula");
  assert.equal(r.garantia, "em_dia");
  assert.equal(r.status, "em_dia");
  const aprov = montarLinha(linha({ plano: { ...linha().plano, step1_aprovado: true, step2ck_aprovado: true } }), { agora: AGORA });
  assert.equal(aprov.step, "concluido");
  assert.equal(stepAtual({ plano: { step1_aprovado: true } }), "step2ck");
});

test("situação da garantia: atrasada por presença ou por NBME perto da prova; sem presença; verificar; cumprida", () => {
  const sit = (l) => situacaoGarantia(avaliarParticipante(l, { agora: AGORA }));
  assert.equal(sit(linha({ presenca: { aulas_assistidas: 20, aulas_totais: 40 } })), "atrasada");
  assert.equal(sit(linha({ presenca: null })), "sem_presenca");
  const prova = addDays(dayStart(AGORA), 20).toISOString().slice(0, 10);
  assert.equal(sit(linha({ plano: { ...linha().plano, data_prova_step1: prova } })), "atrasada");
  const nb = (id, step, verificada) => ({ id, step, formulario: "F", modo: "standard", data: "2026-10-01", escore: 220, probabilidade: 95, verificada });
  const ambos = [nb("a", "step1", true), nb("b", "step1", true), nb("c", "step2ck", false), nb("d", "step2ck", true)];
  assert.equal(sit(linha({ nbme: ambos })), "verificar");
  assert.equal(sit(linha({ nbme: ambos.map((x) => ({ ...x, verificada: true })) })), "cumprida");
});

test("filtros: busca sem acento por nome e e-mail, situação, Step, garantia, turma e inatividade", () => {
  assert.equal(normalizarBusca("Íris MODELO"), "iris modelo");
  assert.deepEqual(filtrarLinhas(rows, { q: "iris" }).map((r) => r.nome), ["Íris Modelo"]);
  assert.equal(filtrarLinhas(rows, { q: "fabio.amostra@demo" }).length, 1);
  const risco = filtrarLinhas(rows, { status: "risco" });
  assert.ok(risco.length >= 3 && risco.every((r) => r.status === "risco"));
  assert.ok(filtrarLinhas(rows, { step: "step2ck" }).every((r) => r.step === "step2ck"));
  assert.ok(filtrarLinhas(rows, { step: "step2ck" }).length >= 2);
  assert.ok(filtrarLinhas(rows, { garantia: "atrasada" }).every((r) => r.garantia === "atrasada"));
  assert.ok(filtrarLinhas(rows, { turma: "2026/1" }).every((r) => r.turma === "2026/1"));
  const inat7 = filtrarLinhas(rows, { inatividade: "7" }).map((r) => r.id.replace("demo-sint-", "")).sort();
  assert.deepEqual(inat7, ["carla-modelo", "diego-simulado", "lucas-simulado", "olivia-modelo"]);
  assert.deepEqual(filtrarLinhas(rows, { inatividade: "14" }).map((r) => r.id.replace("demo-sint-", "")).sort(), ["diego-simulado", "lucas-simulado"]);
  assert.deepEqual(filtrarLinhas(rows, { inatividade: "nunca" }).map((r) => r.nome), ["Lucas Simulado"]);
  const ativos = filtrarLinhas(rows, { inatividade: "ativo" });
  assert.equal(ativos.length + inat7.length, rows.length);
});

test("ordenação: risco primeiro, vazios sempre no fim, desempate por nome", () => {
  const ord = ordenarLinhas(rows, "risco", "desc");
  const st = ord.map((r) => r.status);
  assert.deepEqual(st, [...st].sort((a, b) => ({ risco: 0, atencao: 1, em_dia: 2 })[a] - ({ risco: 0, atencao: 1, em_dia: 2 })[b]));
  assert.ok(ord[0].risco_alto, "nível alto vem antes");
  for (const dir of ["asc", "desc"]) {
    const ret = ordenarLinhas(rows, "retencao", dir);
    const semDado = ret.findIndex((r) => r.retencao === null);
    assert.ok(semDado === -1 || ret.slice(semDado).every((r) => r.retencao === null), "vazios no fim em " + dir);
  }
  const asc = ordenarLinhas(rows, "retencao", "asc").filter((r) => r.retencao !== null).map((r) => r.retencao);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const nomes = ordenarLinhas(rows, "nome", "asc").map((r) => r.nome);
  assert.equal(nomes[0], "Ana Exemplo");
  const prova = ordenarLinhas(rows, "prova", "asc").map((r) => r.dias_prova);
  assert.equal(prova[0], Math.min(...prova.filter((x) => x !== null)));
});

test("CSV: ponto e vírgula, BOM, vírgula decimal, sem e-mail por padrão e proteção contra fórmula", () => {
  const csv = csvParticipantes([porSlug("elisa-teste")]);
  assert.ok(csv.startsWith("﻿nome;situacao;"));
  const [cab, l1] = csv.trim().split("\r\n");
  assert.equal(cab.split(";").length, l1.split(";").length);
  assert.ok(!csv.includes("@demo.local"));
  assert.match(l1, /;71,\d;/, "retenção com vírgula decimal");
  assert.match(l1, /;sim$/, "marca dado de demonstração");
  assert.ok(csvParticipantes([porSlug("elisa-teste")], { incluirEmail: true }).includes("elisa.teste@demo.local"));
  const perigoso = montarLinha(linha({ nome: '=HYPERLINK("x");1' }), { agora: AGORA });
  const linhaPerigosa = csvParticipantes([perigoso]).trim().split("\r\n")[1];
  assert.ok(linhaPerigosa.startsWith("\"'=HYPERLINK(\"\"x\"\");1\""), linhaPerigosa);
});

test("indicadores da turma batem com as linhas", () => {
  const sims = coorte.simulados;
  const ind = indicadoresTurma(rows, sims, { agora: AGORA });
  assert.equal(ind.participantes, 16);
  assert.equal(ind.ativos_7d + ind.inativos, 16);
  assert.equal(ind.ativos_7d, 12);
  assert.equal(ind.nunca_estudaram, 1);
  const serie = serieRevisoesTurma(linhasCoorte);
  assert.equal(serie.length, 30);
  assert.equal(ind.revisoes_dia_7d, serie.slice(-8, -1).reduce((a, b) => a + b, 0) / 7, "sete dias completos, sem hoje");
  const tot = linhasCoorte.reduce((a, l) => a + l.flashcards.retencao_30d.total, 0);
  const ac = linhasCoorte.reduce((a, l) => a + l.flashcards.retencao_30d.acertos, 0);
  assert.equal(ind.retencao_turma, ac / tot, "retenção ponderada pelas revisões");
  assert.equal(ind.status.risco + ind.status.atencao + ind.status.em_dia, 16);
  assert.equal(Object.values(ind.garantia).reduce((a, b) => a + b, 0), 16);
  assert.equal(ind.prontos, 1, "só o Bruno atende à EXIT 18");
  assert.ok(ind.simulados.step1.n > 0 && ind.simulados.step1.media > 0 && ind.simulados.step1.media < 1);
  const crit = contagemCriterios(rows);
  assert.equal(crit.inatividade, 4);
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([4, 1, 2, 3]), 2.5);
  assert.equal(mediana([null, undefined]), null);
});

test("simulados: média por janela com variação, tendência semanal e áreas fracas com mínimo de questões", () => {
  const s = (dias, acertos, step = "step1", user = "a") => ({ user_id: user, step, acertos, total: 20, fim: addDays(AGORA, -dias).toISOString(), por_sistema: { cardiovascular: { total: 5, acertos: Math.round(acertos / 4) }, ...(dias === 1 ? { renal_raro: { total: 1, acertos: 0 } } : {}) } });
  const lista = [s(1, 14), s(5, 16), s(20, 10), s(25, 12), s(3, 10, "step2ck", "b")];
  const m = mediaSimulados(lista, "step1", { agora: AGORA, dias: 14 });
  assert.equal(m.n, 2);
  assert.equal(m.media, 0.75);
  assert.equal(m.anterior, 0.55);
  assert.ok(Math.abs(m.variacao - 0.2) < 1e-9);
  const t = tendenciaSimulados(lista, "step1", { agora: AGORA, semanas: 4 });
  assert.equal(t.length, 4);
  assert.equal(t[3].n, 2);
  assert.equal(t[3].media, 0.75);
  assert.equal(t[2].n, 0);
  assert.equal(t[2].media, null);
  const fr = areasFracas(lista, "step1", { agora: AGORA });
  assert.deepEqual(fr.map((a) => a.chave), ["cardiovascular"], "área com menos de 4 questões fica de fora");
  assert.equal(fr[0].nome, "Cardiovascular");
  assert.equal(nomeArea("reprodutor_endocrino"), "Reprodutor e endócrino");
  assert.equal(nomeArea("ginecologia_obstetricia", { step: "step2ck" }), "Ginecologia e obstetrícia");
  assert.equal(nomeArea("chave_nova"), "Chave nova");
});

test("distribuição da retenção: só com volume mínimo e faixas que somam o total", () => {
  const d = distribuicaoRetencao(rows);
  assert.equal(d.abaixo_minimo + d.entre + d.na_meta + d.sem_volume, rows.length);
  assert.ok(d.pontos.every((p) => p.n >= CONFIG_PADRAO.retencao_min_revisoes));
  assert.deepEqual(d.pontos.filter((p) => p.taxa < 0.8).map((p) => p.nome).sort(), ["Elisa Teste", "Marina Exemplo"]);
});

test("ficha: semanas de atividade, grade do mapa de calor e níveis por quartil", () => {
  const atv = [];
  for (let i = 27; i >= 0; i--) atv.push({ dia: addDays(dayStart(AGORA), -i).toISOString().slice(0, 10), revisoes: i % 2 ? 0 : 10, revisao_total: i % 2 ? 0 : 8, revisao_acertos: i % 2 ? 0 : 6 });
  const sem = semanasAtividade(atv, { semanas: 4, minRevisoes: 20 });
  assert.equal(sem.length, 4);
  assert.equal(sem[3].revisoes, 40);
  assert.equal(sem[3].retencao, 0.75);
  assert.equal(semanasAtividade(atv, { semanas: 4, minRevisoes: 100 })[0].retencao, null, "semana com poucas revisões fica sem ponto");
  const grade = gradeCalor(atv, { agora: AGORA });
  assert.ok(grade.every((c) => c.length === 7));
  assert.equal(grade.flat().filter((c) => c.n !== null).length, 28, "só os dias da série entram");
  const nv = nivelCalor([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(nv(0), 0);
  assert.equal(nv(null), -1);
  assert.equal(nv(1), 1);
  assert.equal(nv(8), 4);
});

test("sugestões de ação trazem motivo e seguem os critérios", () => {
  const sims = coorte.simulados;
  const cod = (slug) => sugestoesAcao(porSlug(slug), { simulados: sims, agora: AGORA }).map((s) => s.codigo);
  assert.ok(cod("diego-simulado").includes("conversa_inatividade"));
  assert.ok(cod("diego-simulado").includes("retomar_revisoes"));
  assert.ok(cod("diego-simulado").includes("recuperar_aulas"));
  assert.ok(!cod("lucas-simulado").includes("retomar_revisoes"), "quem nunca estudou não tem revisões a retomar");
  assert.ok(cod("elisa-teste").includes("reduzir_novos"));
  assert.ok(cod("elisa-teste").includes("clinica_leeches"));
  assert.ok(cod("hugo-ficticio").includes("caderno_erros_step1"));
  assert.ok(cod("hugo-ficticio").some((c) => c.startsWith("revisar_step1_")), "revisar sistema fraco");
  assert.ok(cod("iris-modelo").includes("nbme_step1"));
  assert.ok(cod("marina-exemplo").includes("conversa_risco"), "risco por vários critérios pede conversa");
  const bruno = sugestoesAcao(porSlug("bruno-ficticio"), { simulados: sims, agora: AGORA });
  assert.equal(bruno[0].codigo, "exit18_step1");
  assert.equal(bruno[0].prioridade, 1);
  assert.match(bruno[0].titulo, /EXIT 18/);
  const todas = rows.flatMap((r) => sugestoesAcao(r, { simulados: sims, agora: AGORA }));
  assert.ok(todas.every((s) => s.motivo && s.motivo.length > 20 && [1, 2, 3].includes(s.prioridade)));
  assert.ok(todas.every((s) => !/[\u2013\u2014]/.test(s.titulo + s.motivo)), "sem travessão nem meia-risca");
  const s = sugestoesAcao(porSlug("diego-simulado"), { simulados: sims, agora: AGORA });
  assert.deepEqual(s.map((x) => x.prioridade), [...s.map((x) => x.prioridade)].sort());
  const fila = prioridadeAtencao(rows, 3);
  assert.equal(fila.length, 3);
  assert.ok(fila.every((r) => r.status === "risco"));
});

test("checklist da garantia e leitura da prontidão (EXIT 18)", () => {
  const b = porSlug("bruno-ficticio");
  const ck = checklistGarantia(b.linha, b.avaliacao);
  assert.deepEqual(ck.map((i) => i.chave), ["presenca", "nbme_step1", "nbme_step2ck", "prazo"]);
  /* Step 2 CK sem NBME e sem prova próxima: em andamento, não pendente */
  assert.deepEqual(ck.map((i) => i.ok), [true, true, null, true]);
  assert.deepEqual(ck.map((i) => i.estado), ["cumprido", "cumprido", "andamento", "cumprido"]);
  assert.match(ck[1].detalhe, /3 lançadas \(mínimo 2\)/);
  assert.match(ck[3].detalhe, /^De \d\d\/\d\d\/2026 a \d\d\/\d\d\/2029/);
  const g = porSlug("gabriela-exemplo");
  assert.match(checklistGarantia(g.linha, g.avaliacao)[0].detalhe, /faltam 3 aulas/);
  const semMat = montarLinha(linha({ plano: { ...linha().plano, data_matricula: null }, presenca: null }), { agora: AGORA });
  const ck2 = checklistGarantia(semMat.linha, semMat.avaliacao, { participante: true });
  assert.equal(ck2[0].ok, null);
  assert.match(ck2[0].detalhe, /sua presença/);
  assert.equal(ck2[3].ok, null);
  const p = leituraProntidao(b.avaliacao.prontidao.step1, b.linha, "step1", { agora: AGORA });
  assert.equal(p.status, "pronto");
  assert.equal(p.dias_para_prova, 12);
  assert.ok(p.avisos.some((a) => /12 dias/.test(a)));
  assert.match(p.criterio, /90% ou mais/);
  assert.equal(dataBR("2026-10-28"), "28/10/2026");
  assert.equal(pct(0.875, 1), "87,5%");
  assert.equal(pct(null), "sem dado");
  assert.equal(textoUltimaAtividade({ ultima_atividade: null }), "Nunca estudou");
  assert.equal(textoUltimaAtividade({ ultima_atividade: "x", dias_sem_estudo: 1 }), "Ontem");
  assert.equal(textoUltimaAtividade({ ultima_atividade: "x", dias_sem_estudo: -1 }), "Hoje", "relógio adiantado: nunca \"Há -1 dias\"");
  assert.equal(textoUltimaAtividade({ ultima_atividade: "x", dias_sem_estudo: 5 }), "Há 5 dias");
});
