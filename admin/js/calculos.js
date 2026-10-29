/* Road to America | área administrativa: cálculos das telas (funções puras).
   Recebem as linhas de resumo (store.listResumoParticipantes), as avaliações
   (avaliarParticipante) e as tentativas de simulado (store.listSimulados) e
   devolvem o que a tela desenha: indicadores da turma, séries dos gráficos,
   linhas da tabela, filtros, ordenação, CSV e sugestões de ação.
   As regras de risco, garantia e prontidão continuam em
   plataforma/js/desempenho.js; aqui só se agrega e se explica. */
import { avaliarParticipante, mergeConfig, parseData, CONFIG_PADRAO } from "../../plataforma/js/desempenho.js";
import { desempenhoPorArea, SIMULADO_30 } from "../../plataforma/js/simulado.js";
import { situacaoGarantia, stepAtual, NOME_STEP, nomeArea, pct, plural, dataBR, MIN_QUESTOES_AREA } from "../../plataforma/js/acompanhamento.js";
import { dayStart, addDays, dayKey } from "../../anki/js/util.js";
import { nomeChave } from "../../plataforma/js/banco.js";

const DIA = 86400000;
/* Meta de retenção desejada do preset da Road to America (EXIT 04 do PDF de
   overdeliveries; padrão do app em anki/js/scheduler.js). */
export const RETENCAO_DESEJADA = 0.9;
/* Limite de questões por área: definido em plataforma/js/acompanhamento.js */
export { MIN_QUESTOES_AREA };
/* Leeches a partir dos quais vale levar à Clínica de leeches (EXIT 12):
   critério interno de acompanhamento. */
export const MIN_LEECHES_CLINICA = 8;

export const ORDEM_STATUS = Object.freeze({ risco: 2, atencao: 1, em_dia: 0 });
export const ROTULO_STATUS = Object.freeze({ risco: "Em risco", atencao: "Atenção", em_dia: "Em dia" });

function diasEntre(a, b) {
  return Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / DIA);
}
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function mediana(xs) {
  const v = xs.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
/* Busca sem acento e sem diferenciar maiúsculas */
export function normalizarBusca(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/* Turma: não há campo de turma no cadastro; a tela agrupa pelo semestre da
   matrícula ("2026/2"). Sem matrícula lançada, fica "sem matrícula". */
export function turmaDe(linha) {
  const d = parseData(linha?.plano?.data_matricula);
  if (!d) return "sem_matricula";
  return d.getFullYear() + "/" + (d.getMonth() < 6 ? "1" : "2");
}
export function rotuloTurma(t) {
  return t === "sem_matricula" ? "Sem matrícula lançada" : "Matrícula " + t;
}

/* ---------- Linha da tabela de participantes ---------- */
export function montarLinha(linha, { config = CONFIG_PADRAO, agora = new Date(), avaliacao = null } = {}) {
  const c = mergeConfig(config);
  const av = avaliacao || avaliarParticipante(linha, { config: c, agora });
  const step = stepAtual(linha);
  const stepRef = step === "concluido" ? "step2ck" : step;
  const sim = linha.simulados?.[stepRef] || { n: 0, ultimos: [] };
  const nUlt = Math.max(1, Math.round(c.simulado_ultimos));
  const ult = (sim.ultimos || []).slice(0, nUlt);
  const nbStep = (linha.nbme || []).filter((x) => x.step === stepRef);
  const comProb = nbStep.filter((x) => x.probabilidade !== null && x.probabilidade !== undefined);
  const prova = linha.plano?.["data_prova_" + stepRef] || null;
  const ret = linha.flashcards?.retencao_30d || { total: 0, taxa: null };
  const riscosOrd = av.riscos.slice().sort((a, b) => (b.nivel === "alto") - (a.nivel === "alto"));
  return {
    id: linha.user_id,
    nome: linha.nome || "(sem nome)",
    email: linha.email || "",
    sintetico: !!linha.sintetico,
    status: av.status,
    status_ordem: ORDEM_STATUS[av.status],
    riscos: riscosOrd,
    motivo: riscosOrd.map((r) => r.titulo).join("; "),
    n_riscos: av.riscos.length,
    risco_alto: av.riscos.some((r) => r.nivel === "alto"),
    step,
    turma: turmaDe(linha),
    garantia: situacaoGarantia(av),
    dias_sem_estudo: av.dias_sem_estudo,
    ultima_atividade: linha.ultima_atividade || null,
    sequencia: linha.flashcards?.sequencia_atual ?? 0,
    revisoes_7d: linha.flashcards?.revisoes_7d ?? 0,
    retencao: ret.taxa,
    retencao_n: ret.total || 0,
    retencao_confiavel: (ret.total || 0) >= c.retencao_min_revisoes,
    simulado_media: ult.length ? media(ult.map((x) => x.percentual)) : null,
    simulado_media_n: ult.length,
    simulado_n: sim.n || 0,
    simulado_ultimo: sim.ultimos?.[0]?.percentual ?? null,
    nbme_n: nbStep.length,
    nbme_minimo: Math.round(c.nbme_minimo_por_step),
    nbme_prob: comProb.length ? Number(comProb[comProb.length - 1].probabilidade) : null,
    nbme_nao_verificadas: (linha.nbme || []).filter((x) => !x.verificada).length,
    presenca: linha.presenca?.percentual ?? null,
    presenca_txt: linha.presenca && linha.presenca.aulas_totais ? linha.presenca.aulas_assistidas + "/" + linha.presenca.aulas_totais : "",
    prova,
    dias_prova: prova ? diasEntre(agora, parseData(prova)) : null,
    /* EXIT 18 pede probabilidade de 90% ou mais E faixa provável inteira acima da
       aprovação baixa. Sem a faixa informada, a probabilidade sozinha não fecha o
       critério: a tela mostra "falta confirmar a faixa" e não conta como pronto. */
    prontidao: step === "concluido" ? "aprovado"
      : av.prontidao[stepRef].status === "pronto" && !av.prontidao[stepRef].faixa_confirmada ? "pronto_sem_faixa"
      : av.prontidao[stepRef].status,
    avaliacao: av,
    linha
  };
}

export function montarLinhas(linhas, { config = CONFIG_PADRAO, agora = new Date() } = {}) {
  return linhas.map((l) => montarLinha(l, { config, agora }));
}

/* ---------- Filtros ----------
   f: { q, status, step, turma, garantia, inatividade }
   inatividade: "ativo" (< limite), "7" (>= limite), "14" (>= 2x limite), "nunca" */
export function filtrarLinhas(rows, f = {}, { config = CONFIG_PADRAO } = {}) {
  const c = mergeConfig(config);
  const q = normalizarBusca(f.q);
  const lim = c.dias_inatividade;
  return rows.filter((r) => {
    if (q && !normalizarBusca(r.nome + " " + r.email).includes(q)) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.step && r.step !== f.step) return false;
    if (f.turma && r.turma !== f.turma) return false;
    if (f.garantia && r.garantia !== f.garantia) return false;
    if (f.inatividade) {
      const d = r.dias_sem_estudo;
      if (f.inatividade === "nunca") { if (r.ultima_atividade) return false; }
      else if (f.inatividade === "ativo") { if (!r.ultima_atividade || d === null || d >= lim) return false; }
      else if (f.inatividade === "7") { if (d === null || d < lim) return false; }
      else if (f.inatividade === "14") { if (d === null || d < 2 * lim) return false; }
    }
    return true;
  });
}

/* ---------- Ordenação ----------
   chave: risco | nome | ultima | sequencia | retencao | simulado | nbme | presenca | prova
   Vazios ficam sempre no fim, nos dois sentidos. */
const VALOR_ORDEM = {
  risco: (r) => r.status_ordem * 1000 + (r.risco_alto ? 100 : 0) + r.n_riscos * 10 + Math.min(9, Math.floor((r.dias_sem_estudo || 0) / 7)),
  nome: (r) => normalizarBusca(r.nome),
  ultima: (r) => (r.ultima_atividade ? new Date(r.ultima_atividade).getTime() : null),
  sequencia: (r) => r.sequencia,
  retencao: (r) => r.retencao,
  simulado: (r) => r.simulado_media,
  nbme: (r) => (r.nbme_prob !== null ? r.nbme_prob : r.nbme_n ? -1 + r.nbme_n / 100 : null),
  presenca: (r) => r.presenca,
  prova: (r) => r.dias_prova,
  banco: (r) => estBancoAtual(r)?.p_aprovacao ?? null
};
/* estimativa do banco do Step em preparo (admin/js/analise.js, aplicarBanco) */
export function estBancoAtual(r) {
  const step = r.step === "concluido" ? "step2ck" : r.step;
  return r.banco?.[step] || null;
}
export const CHAVES_ORDEM = Object.keys(VALOR_ORDEM);

export function ordenarLinhas(rows, chave = "risco", dir = "desc") {
  const val = VALOR_ORDEM[chave] || VALOR_ORDEM.risco;
  const s = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = val(a), vb = val(b);
    const na = va === null || va === undefined || Number.isNaN(va);
    const nb = vb === null || vb === undefined || Number.isNaN(vb);
    if (na && nb) return normalizarBusca(a.nome).localeCompare(normalizarBusca(b.nome), "pt-BR");
    if (na) return 1;
    if (nb) return -1;
    const cmp = typeof va === "string" ? va.localeCompare(vb, "pt-BR") : va - vb;
    return cmp ? cmp * s : normalizarBusca(a.nome).localeCompare(normalizarBusca(b.nome), "pt-BR");
  });
}

/* ---------- Exportação CSV ----------
   Separador ponto e vírgula e vírgula decimal (abre direto no Excel em
   português), BOM UTF-8 e proteção contra fórmula (célula que começa com
   = + - @ ganha um apóstrofo). E-mail só sai com incluirEmail. */
function celula(v) {
  let s = v === null || v === undefined ? "" : String(v);
  /* número negativo (dias desde a prova) não é fórmula: fica como está */
  if (/^[=+\-@\t\r]/.test(s) && !/^-\d+([.,]\d+)?$/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const dec = (x, casas = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "" : (x * 100).toFixed(casas).replace(".", ","));

export function csvParticipantes(rows, { incluirEmail = false } = {}) {
  const cab = ["nome"].concat(incluirEmail ? ["email"] : [], [
    "situacao", "motivos", "step_atual", "turma", "garantia", "ultima_atividade", "dias_sem_estudo", "sequencia_dias",
    "revisoes_7d", "retencao_30d_pct", "revisoes_na_retencao", "simulados_n", "simulado_media_pct", "nbme_lancadas_step_atual",
    "nbme_ultima_probabilidade", "presenca_pct", "aulas", "data_prova", "dias_ate_prova", "prontidao_exit18",
    "banco_prob_aprovacao_pct", "banco_confianca", "banco_itens", "dados_de_demonstracao"
  ]);
  const linhas = rows.map((r) => [r.nome].concat(incluirEmail ? [r.email] : [], [
    ROTULO_STATUS[r.status], r.motivo, r.step === "concluido" ? "concluído" : NOME_STEP[r.step], rotuloTurma(r.turma), r.garantia,
    r.ultima_atividade ? String(r.ultima_atividade).slice(0, 10) : "", r.dias_sem_estudo ?? "", r.sequencia, r.revisoes_7d,
    dec(r.retencao), r.retencao_n, r.simulado_n, dec(r.simulado_media), r.nbme_n,
    r.nbme_prob === null ? "" : String(r.nbme_prob).replace(".", ","), dec(r.presenca), r.presenca_txt, r.prova || "",
    r.dias_prova ?? "", r.prontidao,
    estBancoAtual(r) ? dec(estBancoAtual(r).p_aprovacao) : "", estBancoAtual(r) ? (estBancoAtual(r).confianca?.alta ? "alta" : "preliminar") : "",
    estBancoAtual(r) ? estBancoAtual(r).n : "", r.sintetico ? "sim" : "nao"
  ]));
  return "﻿" + [cab].concat(linhas).map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

/* ---------- Visão da turma ---------- */

/* Soma das revisões por dia da turma nos últimos 30 dias (do mais antigo para hoje) */
export function serieRevisoesTurma(linhas) {
  const out = new Array(30).fill(0);
  for (const l of linhas) (l.flashcards?.por_dia_30 || []).forEach((n, i) => { out[i] += n || 0; });
  return out;
}

/* Tentativas por semana de um Step: [{ inicio: Date, media, n }] das semanas
   mais antigas para a atual (semana = 7 dias terminando hoje). */
export function tendenciaSimulados(simulados, step, { agora = new Date(), semanas = 8 } = {}) {
  const hoje = dayStart(agora);
  const out = [];
  for (let w = semanas - 1; w >= 0; w--) {
    const ini = addDays(hoje, -7 * w - 6);
    const fim = addDays(hoje, -7 * w + 1);
    const doBloco = simulados.filter((s) => s.step === step && new Date(s.fim) >= ini && new Date(s.fim) < fim);
    out.push({ inicio: ini, fim: addDays(fim, -1), n: doBloco.length, media: doBloco.length ? doBloco.reduce((a, s) => a + s.acertos / s.total, 0) / doBloco.length : null });
  }
  return out;
}

/* Média de acerto de um Step numa janela e variação contra a janela anterior */
export function mediaSimulados(simulados, step, { agora = new Date(), dias = 14 } = {}) {
  const fim = addDays(dayStart(agora), 1).getTime();
  const ini = fim - dias * DIA;
  const iniAnt = ini - dias * DIA;
  const taxa = (xs) => (xs.length ? xs.reduce((a, s) => a + s.acertos / s.total, 0) / xs.length : null);
  const doStep = simulados.filter((s) => s.step === step && s.total > 0);
  const atual = doStep.filter((s) => { const t = new Date(s.fim).getTime(); return t >= ini && t < fim; });
  const ant = doStep.filter((s) => { const t = new Date(s.fim).getTime(); return t >= iniAnt && t < ini; });
  const ma = taxa(atual), mb = taxa(ant);
  return { media: ma, n: atual.length, anterior: mb, n_anterior: ant.length, variacao: ma !== null && mb !== null ? ma - mb : null, participantes: new Set(atual.map((s) => s.user_id)).size };
}

/* Áreas mais fracas da turma num Step: soma das questões de todas as tentativas
   da janela por sistema (Step 1) ou área (Step 2 CK). */
export function areasFracas(simulados, step, { campo = "por_sistema", agora = new Date(), dias = 60, minQuestoes = MIN_QUESTOES_AREA, tax = null } = {}) {
  const desde = addDays(dayStart(agora), -dias + 1).getTime();
  const lista = simulados.filter((s) => s.step === step && new Date(s.fim).getTime() >= desde);
  return desempenhoPorArea(lista, campo)
    .filter((a) => a.total >= minQuestoes)
    .map((a) => ({ ...a, nome: nomeArea(a.chave, { step, tax }) }));
}

/* Distribuição da retenção real: só participantes com o mínimo de revisões */
export function distribuicaoRetencao(rows, { config = CONFIG_PADRAO } = {}) {
  const c = mergeConfig(config);
  const validos = rows.filter((r) => r.retencao !== null && r.retencao_n >= c.retencao_min_revisoes);
  return {
    pontos: validos.map((r) => ({ id: r.id, nome: r.nome, taxa: r.retencao, n: r.retencao_n })).sort((a, b) => a.taxa - b.taxa),
    abaixo_minimo: validos.filter((r) => r.retencao < c.retencao_minima).length,
    entre: validos.filter((r) => r.retencao >= c.retencao_minima && r.retencao < RETENCAO_DESEJADA).length,
    na_meta: validos.filter((r) => r.retencao >= RETENCAO_DESEJADA).length,
    sem_volume: rows.length - validos.length
  };
}

export function indicadoresTurma(rows, simulados, { config = CONFIG_PADRAO, agora = new Date() } = {}) {
  const c = mergeConfig(config);
  const n = rows.length;
  const ativos = rows.filter((r) => r.ultima_atividade && r.dias_sem_estudo !== null && r.dias_sem_estudo < c.dias_inatividade);
  const serie = serieRevisoesTurma(rows.map((r) => r.linha));
  /* sete dias completos (ontem e os seis anteriores): o dia de hoje ainda está em curso */
  const ult7 = serie.slice(-8, -1);
  /* mediana por participante ativo nos mesmos 7 dias completos da média da turma */
  const porAtivo = rows
    .map((r) => (r.linha.flashcards?.por_dia_30 || []).slice(-8, -1).reduce((a, b) => a + (b || 0), 0))
    .filter((n) => n > 0).map((n) => n / 7);
  let tot = 0, ac = 0;
  for (const r of rows) {
    const rt = r.linha.flashcards?.retencao_30d;
    if (rt && rt.total) { tot += rt.total; ac += rt.acertos; }
  }
  const sit = { cumprida: 0, verificar: 0, em_dia: 0, atrasada: 0, sem_presenca: 0 };
  for (const r of rows) sit[r.garantia]++;
  const ids = new Set(rows.map((r) => r.id));
  const sims = simulados.filter((s) => ids.has(s.user_id));
  const status = { risco: 0, atencao: 0, em_dia: 0 };
  for (const r of rows) status[r.status]++;
  const prontos = rows.filter((r) => r.prontidao === "pronto").length;
  const prontos_sem_faixa = rows.filter((r) => r.prontidao === "pronto_sem_faixa").length;
  return {
    participantes: n,
    ativos_7d: ativos.length,
    inativos: n - ativos.length,
    nunca_estudaram: rows.filter((r) => !r.ultima_atividade).length,
    revisoes_dia_7d: ult7.reduce((a, b) => a + b, 0) / 7,
    revisoes_dia_mediana_ativo: mediana(porAtivo),
    serie_revisoes: serie,
    retencao_turma: tot ? ac / tot : null,
    retencao_revisoes: tot,
    retencao_mediana: mediana(rows.filter((r) => r.retencao_confiavel).map((r) => r.retencao)),
    retencao_desejada: RETENCAO_DESEJADA,
    retencao_minima: c.retencao_minima,
    simulados: { step1: mediaSimulados(sims, "step1", { agora }), step2ck: mediaSimulados(sims, "step2ck", { agora }) },
    garantia: sit,
    garantia_em_dia: n ? (sit.cumprida + sit.verificar + sit.em_dia) / n : null,
    status,
    prontos,
    prontos_sem_faixa,
    nbme_nao_verificadas: rows.reduce((a, r) => a + r.nbme_nao_verificadas, 0)
  };
}

/* Contagem de participantes por critério de risco (um participante conta uma vez por critério) */
export function contagemCriterios(rows) {
  const out = {};
  for (const r of rows) for (const k of new Set(r.riscos.map((x) => x.codigo))) out[k] = (out[k] || 0) + 1;
  return out;
}

/* ---------- Ficha: séries semanais a partir da atividade diária ----------
   atividade: [{ dia, revisoes, revisao_total, revisao_acertos }] do mais antigo para hoje.
   Devolve semanas de 7 dias terminando hoje: { inicio, revisoes, retencao, n_retencao }.
   A retenção semanal fica null com menos de minRevisoes revisões na semana. */
export function semanasAtividade(atividade, { semanas = 12, minRevisoes = 20 } = {}) {
  const dias = atividade.slice(-semanas * 7);
  const out = [];
  for (let i = 0; i < dias.length; i += 7) {
    const bloco = dias.slice(i, i + 7);
    const rev = bloco.reduce((a, d) => a + d.revisoes, 0);
    const t = bloco.reduce((a, d) => a + d.revisao_total, 0);
    const ac = bloco.reduce((a, d) => a + d.revisao_acertos, 0);
    out.push({ inicio: bloco[0].dia, fim: bloco[bloco.length - 1].dia, revisoes: rev, n_retencao: t, retencao: t >= minRevisoes ? ac / t : null });
  }
  return out;
}

/* Colunas de semana (domingo a sábado) para o mapa de calor */
export function gradeCalor(atividade, { agora = new Date() } = {}) {
  const mapa = new Map(atividade.map((d) => [d.dia, d.revisoes]));
  const hoje = dayStart(agora);
  const fimSemana = addDays(hoje, 6 - hoje.getDay());
  const semanas = Math.ceil(atividade.length / 7) + 1;
  const ini = addDays(fimSemana, -semanas * 7 + 1);
  const primeiro = atividade.length ? atividade[0].dia : dayKey(hoje);
  const cols = [];
  for (let w = 0; w < semanas; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const data = addDays(ini, w * 7 + d);
      const k = dayKey(data);
      const fora = data > hoje || k < primeiro;
      col.push({ data, dia: k, n: fora ? null : mapa.get(k) || 0 });
    }
    cols.push(col);
  }
  return cols;
}
/* Nível 0 a 4 por quartis dos dias com estudo (como nas Estatísticas do app) */
export function nivelCalor(valores) {
  const v = valores.filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p) => v[Math.floor(p * (v.length - 1))] || 1;
  const lim = [q(0.25), q(0.5), q(0.75)];
  return (n) => (n === null || n === undefined ? -1 : n === 0 ? 0 : n <= lim[0] ? 1 : n <= lim[1] ? 2 : n <= lim[2] ? 3 : 4);
}

/* ---------- Sugestões automáticas de ação ----------
   Cada sugestão: { codigo, titulo, motivo, prioridade: 1 (agora) | 2 (esta semana) | 3 (acompanhar) }.
   Baseadas nos critérios de desempenho.js e nos combinados do PDF de
   overdeliveries (EXIT 04, 07, 12, 18). Só sugerem; a decisão é da equipe. */
export function sugestoesAcao(row, { simulados = [], config = CONFIG_PADRAO, agora = new Date(), tax = null } = {}) {
  const c = mergeConfig(config);
  const l = row.linha;
  const av = row.avaliacao;
  const out = [];
  const add = (codigo, prioridade, titulo, motivo) => out.push({ codigo, prioridade, titulo, motivo });
  const tem = (cod) => av.riscos.find((r) => r.codigo === cod);
  const fc = l.flashcards || {};

  const inat = tem("inatividade");
  if (inat) {
    add("conversa_inatividade", inat.nivel === "alto" || av.status === "risco" ? 1 : 2, "Agendar conversa",
      inat.detalhe + " Uma conversa curta ajuda a entender o que mudou na rotina (plantão, saúde, desânimo) antes que o atraso cresça.");
    if (fc.vistos_itens > 0) {
      add("retomar_revisoes", 2, "Retomar só com revisões e zerar novos cards por alguns dias",
        "Depois de " + plural(inat.valor, "dia", "dias") + " parado, as revisões vencidas se acumulam. O combinado 01 da EXIT 04 é cortar os novos, nunca as revisões, até o atraso voltar ao normal.");
    }
  }
  if (av.status === "risco" && !inat) {
    add("conversa_risco", 1, "Agendar conversa",
      av.riscos.length >= 2 ? plural(av.riscos.length, "critério de risco aceso", "critérios de risco acesos") + " ao mesmo tempo (" + av.riscos.map((x) => x.titulo.toLowerCase()).join("; ") + "). Vale entender a rotina antes de mexer no plano."
        : av.riscos[0].titulo + " em nível alto. " + av.riscos[0].detalhe);
  }
  const ret = tem("retencao_baixa");
  if (ret) {
    add("reduzir_novos", 2, "Reduzir novos cards",
      ret.detalhe + " Menos cards novos por dia baixa a carga e dá espaço para consolidar o que já está em revisão.");
    add("botao_errei", 2, "Rever o uso dos botões Errei e Difícil",
      "Retenção real abaixo da desejada costuma vir de Difícil usado em card esquecido, o que infla os intervalos seguintes (combinado 02 da EXIT 04).");
  }
  if ((fc.leeches || 0) >= MIN_LEECHES_CLINICA) {
    add("clinica_leeches", 3, "Levar os leeches à Clínica de leeches",
      plural(fc.leeches, "card chegou", "cards chegaram") + " ao limite de lapsos. A sessão mensal da EXIT 12 serve para reescrever, separar ou apagar esses cards.");
  }

  /* simulados: áreas abaixo da meta nas tentativas do participante */
  for (const step of ["step1", "step2ck"]) {
    if (l.plano?.[step + "_aprovado"]) continue;
    const meus = simulados.filter((s) => s.user_id === row.id && s.step === step);
    const fracas = desempenhoPorArea(meus, "por_sistema").filter((a) => a.total >= MIN_QUESTOES_AREA && a.taxa < c.simulado_minimo).slice(0, 2);
    const sb = av.riscos.find((r) => r.codigo === "simulado_baixo" && r.step === step);
    if (sb) {
      add("caderno_erros_" + step, 2, "Revisar o caderno de erros do " + NOME_STEP[step],
        sb.detalhe + " Classificar cada erro pela causa (conteúdo, leitura da vinheta, inglês, raciocínio, tempo) mostra se o problema é de estudo ou de prova (EXIT 07).");
    }
    for (const a of fracas) {
      const nome = nomeArea(a.chave, { step, tax });
      add("revisar_" + step + "_" + a.chave, sb ? 2 : 3, "Revisar " + (step === "step2ck" ? "a área " : "o sistema ") + nome,
        a.acertos + " de " + a.total + " questões certas (" + pct(a.taxa) + ") nos simulados do " + NOME_STEP[step] + ", abaixo da meta de " + pct(c.simulado_minimo) + ".");
    }
    const lentos = meus.slice(0, 3).filter((s) => s.encerramento === "tempo");
    if (lentos.length >= 2) {
      add("ritmo_" + step, 3, "Treinar ritmo de prova",
        plural(lentos.length, "dos três últimos simulados terminou", "dos três últimos simulados terminaram") + " pelo tempo. Na prova o ritmo médio é de " + Math.round(SIMULADO_30.ritmo_ms / 1000) + " segundos por questão e um bloco encerrado não reabre.");
    }
  }

  const pres = tem("presenca_baixa");
  if (pres) {
    const g = av.garantia.presenca;
    add("recuperar_aulas", 2, "Combinar a recuperação das aulas gravadas",
      pres.detalhe + (g.faltam_aulas ? " Faltam " + plural(g.faltam_aulas, "aula", "aulas") + " para os " + pct(c.presenca_minima) + " exigidos pelo Termo da Garantia." : ""));
  }

  for (const r of av.riscos.filter((x) => x.codigo === "nbme_insuficiente")) {
    add("nbme_" + r.step, r.nivel === "alto" ? 1 : 2, "Programar as autoavaliações do " + NOME_STEP[r.step],
      r.detalhe + " São necessárias para o critério da EXIT 18 e para a garantia.");
  }

  /* prontidão perto da prova (decisão a 2 semanas, EXIT 18) */
  for (const step of ["step1", "step2ck"]) {
    if (l.plano?.[step + "_aprovado"]) continue;
    const prova = parseData(l.plano?.["data_prova_" + step]);
    if (!prova) continue;
    const dias = diasEntre(agora, prova);
    if (dias < 0 || dias > 21) continue;
    const pr = av.prontidao[step];
    if (pr.status === "pronto") {
      add("exit18_" + step, dias <= 14 ? 1 : 2, "Conversa de 20 minutos da EXIT 18 para fechar a recomendação",
        "Prova do " + NOME_STEP[step] + " em " + plural(dias, "dia", "dias") + " e as duas últimas autoavaliações atendem ao critério escrito." + (pr.faixa_confirmada ? "" : " Confirme a faixa provável de escore no relatório."));
    } else {
      add("exit18_" + step, 1, "Conversa de 20 minutos da EXIT 18: manter ou adiar a data",
        "Prova do " + NOME_STEP[step] + " em " + plural(dias, "dia", "dias") + " sem o critério atendido (" + pr.motivo.replace(/\.$/, "") + "). A decisão continua sendo do aluno.");
    }
  }
  const probBaixa = av.riscos.filter((x) => x.codigo === "nbme_probabilidade_baixa");
  for (const r of probBaixa) {
    if (out.some((s) => s.codigo === "exit18_" + r.step)) continue;
    add("plano_" + r.step, 2, "Revisar o plano até a próxima autoavaliação",
      r.detalhe + " Vale conferir no relatório as áreas mais fracas e ajustar a divisão do tempo antes da próxima CBSSA.");
  }

  /* banco de questões: probabilidade baixa com alta confiança (admin/js/analise.js) */
  for (const r of av.riscos.filter((x) => x.codigo === "banco_probabilidade_baixa")) {
    const est = row.banco?.[r.step];
    const baixas = (est?.perfil?.sistema || []).filter((x) => x.classe === "mais_baixo").slice(0, 3)
      .map((x) => nomeChave(r.step, "sistema", x.chave) || x.chave);
    add("banco_" + r.step, 1, "Rever com o aluno o plano e a data do " + NOME_STEP[r.step],
      r.detalhe + (baixas.length ? " Sistemas abaixo do examinando no limiar: " + baixas.join(", ") + "." : "") + " A EXIT 18 continua decidindo; o banco antecipa a conversa.");
  }

  if (row.nbme_nao_verificadas > 0) {
    add("verificar_nbme", 3, "Verificar as autoavaliações lançadas",
      plural(row.nbme_nao_verificadas, "autoavaliação lançada ainda não foi conferida", "autoavaliações lançadas ainda não foram conferidas") + " pela equipe. A verificação vale para a garantia.");
  }
  if (!l.plano?.data_matricula) {
    add("lancar_matricula", 3, "Lançar a data de matrícula", "Sem ela o prazo de 3 anos da garantia não pode ser calculado.");
  }
  if (av.garantia.presenca.cumpre === null) {
    add("lancar_presenca", 3, "Lançar a presença nas aulas", "A presença é uma das condições da garantia e ainda não tem registro.");
  }
  return out.sort((a, b) => a.prioridade - b.prioridade);
}

/* Participantes que pedem ação primeiro: em risco, depois atenção; nível alto antes */
export function prioridadeAtencao(rows, limite = 6) {
  return ordenarLinhas(rows.filter((r) => r.status !== "em_dia"), "risco", "desc").slice(0, limite);
}

/* Texto curto da última atividade */
export function textoUltimaAtividade(r) {
  if (!r.ultima_atividade) return "Nunca estudou";
  const d = r.dias_sem_estudo;
  if (d === 0) return "Hoje";
  if (d === 1) return "Ontem";
  return "Há " + d + " dias";
}

export { pct, dataBR, plural };
