/* Road to America | rendimento dos participantes: agregados, critérios de risco,
   condições da garantia e prontidão (EXIT 18). Funções puras, sem DOM e sem banco.

   - resumirParticipante(): monta a LINHA DE RESUMO de um participante a partir dos
     dados brutos (modo demonstração). No modo Supabase a mesma linha vem pronta das
     funções r2a_meu_resumo() e r2a_admin_resumo_participantes() do schema.sql.
   - avaliarParticipante(): aplica à linha os critérios de risco, as condições da
     garantia e o critério de prontidão. É a única implementação dessas regras,
     usada nos dois modos.
   - resumoCoorte(): contagens para o topo do painel do administrador.
   - parsePresencaCsv(): leitura do CSV de presença (email, aulas_assistidas, aulas_totais).
   Formato das linhas e das regras: plataforma/INTERFACE.md. */
import { retention, activity } from "../../anki/js/stats.js";
import { dayKey, dayStart, addDays } from "../../anki/js/util.js";

export const STEPS = ["step1", "step2ck"];

/*
  Parâmetros padrão (o administrador pode trocar em store.saveConfigPlataforma).
  De onde vêm:
  - presenca_minima 0,80 e nbme_minimo_por_step 2: Termo da Garantia (garantia.html).
  - meta_probabilidade 90 e prontidao_seguidas 2: critério da EXIT 18 (duas
    autoavaliações seguidas, em standard-paced, com probabilidade de aprovação de
    90% ou mais), em materiais/overdeliveries-step1.html.
  - retencao_minima 0,80: menor retenção desejada aceita pelo app (RETENCAO_MIN em
    anki/js/scheduler.js); a meta do preset é 0,90 (EXIT 04).
  - os demais são critérios internos de acompanhamento, ajustáveis pelo admin.
*/
export const CONFIG_PADRAO = Object.freeze({
  dias_inatividade: 7,
  retencao_minima: 0.8,
  retencao_janela_dias: 30,
  retencao_min_revisoes: 100,
  simulado_minimo: 0.6,
  simulado_ultimos: 2,
  presenca_minima: 0.8,
  nbme_minimo_por_step: 2,
  nbme_antecedencia_dias: 60,
  meta_probabilidade: 90,
  prontidao_seguidas: 2,
  garantia_anos: 3
});

export function mergeConfig(c = {}) {
  const out = { ...CONFIG_PADRAO };
  for (const k of Object.keys(CONFIG_PADRAO)) {
    const v = Number(c?.[k]);
    if (c && c[k] !== undefined && c[k] !== null && c[k] !== "" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  if (out.retencao_minima > 1) out.retencao_minima /= 100;
  if (out.simulado_minimo > 1) out.simulado_minimo /= 100;
  if (out.presenca_minima > 1) out.presenca_minima /= 100;
  out.meta_probabilidade = Math.min(100, out.meta_probabilidade);
  return out;
}

const DIA = 86400000;
const dataISO = (d) => (d ? new Date(d).toISOString() : null);
/* "AAAA-MM-DD" -> Date ao meio-dia local (evita troca de dia por fuso) */
export function parseData(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t) : null; }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}
function diasEntre(a, b) {
  return Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / DIA);
}
function maisRecente(...ds) {
  let m = null;
  for (const d of ds) {
    if (!d) continue;
    const t = new Date(d).getTime();
    if (Number.isFinite(t) && (m === null || t > m)) m = t;
  }
  return m === null ? null : new Date(m).toISOString();
}

/*
  Linha de resumo de um participante a partir dos dados brutos.
  perfil: { id, nome, email, criado_em }
  revlog: entradas do revlog ({ review, state, rating, elapsed_days })
  estados: estados FSRS ({ key, card_id, state, scheduled_days, suspenso, leech })
  oficiais: ids dos cards oficiais aprovados (para a cobertura)
  simulados, nbme: registros do participante
  presenca: { aulas_assistidas, aulas_totais, atualizado_em } ou null
  plano: { data_prova_step1, data_prova_step2ck, step1_aprovado, step2ck_aprovado,
           data_matricula, ciclo_basico_concluido_em } ou null
  configuracoes: ajustes do app de flashcards (dataProva vira data do Step 1 se faltar)
*/
export function resumirParticipante({ perfil, revlog = [], estados = [], oficiais = [], simulados = [], nbme = [], presenca = null, plano = null, configuracoes = null, sintetico = false, agora = new Date() }) {
  const hoje = dayStart(agora);
  const ini7 = addDays(hoje, -6).getTime();
  const ini30 = addDays(hoje, -29).getTime();
  const fimHoje = addDays(hoje, 1).getTime();

  /* flashcards */
  const porDiaMapa = new Map();
  let r7 = 0, r30 = 0, rHoje = 0, ultima = null;
  for (const r of revlog) {
    const t = new Date(r.review).getTime();
    if (!Number.isFinite(t)) continue;
    if (ultima === null || t > ultima) ultima = t;
    if (t >= fimHoje) continue;
    if (t >= hoje.getTime()) rHoje++;
    if (t >= ini7) r7++;
    if (t >= ini30) {
      r30++;
      const k = dayKey(new Date(t));
      porDiaMapa.set(k, (porDiaMapa.get(k) || 0) + 1);
    }
  }
  const por_dia_30 = [];
  for (let i = 29; i >= 0; i--) por_dia_30.push(porDiaMapa.get(dayKey(addDays(hoje, -i))) || 0);
  const ret = retention(revlog, { dias: 30, now: agora });
  const atv = activity(revlog, { now: agora });

  const oficiaisSet = new Set(oficiais);
  const vistosCards = new Set();
  let maduros = 0, jovens = 0, aprendendo = 0, leeches = 0, suspensos = 0, vistos_itens = 0;
  for (const st of estados) {
    if (!st) continue;
    if (st.leech) leeches++;
    if (st.state > 0) {
      vistos_itens++;
      const cid = st.card_id || String(st.key || "").split("#")[0];
      if (oficiaisSet.has(cid)) vistosCards.add(cid);
    }
    if (st.suspenso) { suspensos++; continue; }
    if (st.state === 2) { if (st.scheduled_days >= 21) maduros++; else jovens++; }
    else if (st.state === 1 || st.state === 3) aprendendo++;
  }
  const total_oficial = oficiaisSet.size;

  /* simulados por Step: n, último, cinco mais recentes */
  const sim = {};
  for (const step of STEPS) {
    const lista = simulados.filter((s) => s.step === step).sort((a, b) => String(b.fim).localeCompare(String(a.fim)));
    sim[step] = {
      n: lista.length,
      ultimo_em: lista[0]?.fim || null,
      ultimos: lista.slice(0, 5).map((s) => ({ id: s.id, percentual: s.total ? s.acertos / s.total : 0, acertos: s.acertos, total: s.total, fim: s.fim }))
    };
  }

  const nb = nbme
    .map((x) => ({
      id: x.id, step: x.step, formulario: x.formulario, modo: x.modo || "standard", data: x.data,
      escore: x.escore ?? null, escore_texto: x.escore_texto || "", probabilidade: x.probabilidade ?? null,
      faixa_acima_aprovacao_baixa: x.faixa_acima_aprovacao_baixa ?? null, verificada: !!x.verificada, criado_em: x.criado_em || null
    }))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.criado_em).localeCompare(String(b.criado_em)));

  const pres = presenca
    ? {
        aulas_assistidas: Number(presenca.aulas_assistidas) || 0,
        aulas_totais: Number(presenca.aulas_totais) || 0,
        percentual: Number(presenca.aulas_totais) > 0 ? (Number(presenca.aulas_assistidas) || 0) / Number(presenca.aulas_totais) : null,
        atualizado_em: presenca.atualizado_em || null
      }
    : null;

  const dpCfg = configuracoes && /^\d{4}-\d{2}-\d{2}$/.test(configuracoes.dataProva || "") ? configuracoes.dataProva : null;
  const pl = {
    data_prova_step1: plano?.data_prova_step1 || dpCfg || null,
    data_prova_step2ck: plano?.data_prova_step2ck || null,
    step1_aprovado: !!plano?.step1_aprovado,
    step2ck_aprovado: !!plano?.step2ck_aprovado,
    data_matricula: plano?.data_matricula || null,
    ciclo_basico_concluido_em: plano?.ciclo_basico_concluido_em || null
  };

  const ultimaNbme = nb.length ? nb[nb.length - 1].data : null;
  return {
    user_id: perfil.id,
    nome: perfil.nome || "",
    email: perfil.email || "",
    criado_em: perfil.criado_em || null,
    sintetico: !!sintetico,
    plano: pl,
    flashcards: {
      revisoes_hoje: rHoje,
      revisoes_7d: r7,
      revisoes_30d: r30,
      dias_estudados_30d: por_dia_30.filter((n) => n > 0).length,
      por_dia_30,
      retencao_30d: { total: ret.total, acertos: ret.acertos, taxa: ret.taxa },
      sequencia_atual: atv.atual,
      maior_sequencia: atv.maior,
      vistos: vistosCards.size,
      vistos_itens,
      maduros, jovens, aprendendo, leeches, suspensos,
      total_oficial,
      cobertura: total_oficial ? vistosCards.size / total_oficial : null,
      ultima_revisao: ultima === null ? null : new Date(ultima).toISOString()
    },
    simulados: sim,
    nbme: nb,
    presenca: pres,
    ultima_atividade: maisRecente(ultima === null ? null : ultima, sim.step1.ultimo_em, sim.step2ck.ultimo_em, ultimaNbme ? parseData(ultimaNbme) : null)
  };
}

/* ---------- Prontidão (EXIT 18) ----------
   Recomenda manter a data quando as duas autoavaliações mais recentes do Step,
   feitas em standard-paced, têm probabilidade de aprovação >= meta. Quando o
   participante informa a faixa provável de escore, ela precisa estar inteira
   acima da faixa de aprovação baixa; se não informar, a prontidão vale com o aviso
   faixa_confirmada = false. A decisão final é do aluno. */
export function prontidao(nbme, step, cfg = CONFIG_PADRAO) {
  const c = mergeConfig(cfg);
  const lista = (nbme || []).filter((x) => x.step === step && (x.modo || "standard") === "standard")
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.criado_em || "").localeCompare(String(b.criado_em || "")));
  const k = Math.max(1, Math.round(c.prontidao_seguidas));
  const ultimas = lista.slice(-k);
  if (ultimas.length < k) {
    return { step, status: "insuficiente", atende: false, faixa_confirmada: false, consideradas: ultimas, motivo: "Faltam autoavaliações em standard-paced: " + ultimas.length + " de " + k + "." };
  }
  const semProb = ultimas.filter((x) => x.probabilidade === null || x.probabilidade === undefined);
  if (semProb.length) {
    return { step, status: "insuficiente", atende: false, faixa_confirmada: false, consideradas: ultimas, motivo: "Probabilidade de aprovação não informada em " + semProb.length + " autoavaliação(ões)." };
  }
  const abaixo = ultimas.filter((x) => Number(x.probabilidade) < c.meta_probabilidade);
  const faixaNegativa = ultimas.some((x) => x.faixa_acima_aprovacao_baixa === false);
  const faixa_confirmada = ultimas.every((x) => x.faixa_acima_aprovacao_baixa === true);
  if (abaixo.length || faixaNegativa) {
    return {
      step, status: "nao_pronto", atende: false, faixa_confirmada, consideradas: ultimas,
      motivo: abaixo.length
        ? "Probabilidade abaixo de " + c.meta_probabilidade + "% em " + abaixo.length + " das " + k + " últimas."
        : "Faixa provável de escore não está inteira acima da faixa de aprovação baixa."
    };
  }
  return { step, status: "pronto", atende: true, faixa_confirmada, consideradas: ultimas, motivo: faixa_confirmada ? "" : "Faixa provável de escore não informada." };
}

/* ---------- Condições da garantia (garantia.html) ----------
   1) pelo menos 80% das aulas assistidas;
   2) no mínimo 2 autoavaliações oficiais do NBME para cada Step que faltar,
      lançadas no painel.
   Lançada conta para a condição; a verificação pelo admin muda o estado de
   "pendente_verificacao" para "sim".
   cumpre: "sim" | "pendente_verificacao" | "ainda_nao" | "sem_dados_presenca".
   "ainda_nao" descreve o momento atual: a garantia só é pedida ao fim do prazo. */
export function garantia(linha, cfg = CONFIG_PADRAO, agora = new Date()) {
  const c = mergeConfig(cfg);
  const p = linha.presenca;
  const presenca = (() => {
    if (!p || !p.aulas_totais) return { percentual: null, aulas_assistidas: p?.aulas_assistidas ?? null, aulas_totais: p?.aulas_totais ?? null, cumpre: null, faltam_aulas: null };
    const pctv = p.aulas_assistidas / p.aulas_totais;
    const exig = Math.ceil(c.presenca_minima * p.aulas_totais - 1e-9);
    return { percentual: pctv, aulas_assistidas: p.aulas_assistidas, aulas_totais: p.aulas_totais, cumpre: pctv + 1e-9 >= c.presenca_minima, faltam_aulas: Math.max(0, exig - p.aulas_assistidas) };
  })();
  const nb = {};
  for (const step of STEPS) {
    const aprovado = !!linha.plano?.[step + "_aprovado"];
    const doStep = (linha.nbme || []).filter((x) => x.step === step);
    const lancados = doStep.length;
    const verificados = doStep.filter((x) => x.verificada).length;
    const min = Math.round(c.nbme_minimo_por_step);
    nb[step] = {
      exigido: !aprovado,
      lancados,
      verificados,
      minimo: min,
      cumpre: aprovado ? true : lancados >= min,
      pendente_verificacao: !aprovado && lancados >= min && verificados < min
    };
  }
  let cumpre;
  const nbOk = STEPS.every((s) => nb[s].cumpre);
  const nbVer = STEPS.every((s) => !nb[s].exigido || !nb[s].pendente_verificacao);
  if (presenca.cumpre === false || !nbOk) cumpre = "ainda_nao";
  else if (presenca.cumpre === null) cumpre = "sem_dados_presenca";
  else cumpre = nbVer ? "sim" : "pendente_verificacao";

  const inicio = parseData(linha.plano?.ciclo_basico_concluido_em) && parseData(linha.plano?.data_matricula)
    ? new Date(Math.max(parseData(linha.plano.ciclo_basico_concluido_em), parseData(linha.plano.data_matricula)))
    : parseData(linha.plano?.data_matricula);
  let prazo = null;
  if (inicio) {
    const fim = new Date(inicio);
    fim.setFullYear(fim.getFullYear() + Math.round(c.garantia_anos));
    prazo = { inicio: dataISO(inicio).slice(0, 10), fim: dataISO(fim).slice(0, 10), dias_restantes: diasEntre(agora, fim) };
  }
  return { cumpre, presenca, nbme: nb, prazo, todos_aprovados: STEPS.every((s) => !!linha.plano?.[s + "_aprovado"]) };
}

/* ---------- Critérios de risco ----------
   Cada critério devolve { codigo, nivel, titulo, detalhe, valor, limite, step? }.
   nivel "alto" para: inatividade >= 2x o limite; NBME insuficiente a 30 dias ou
   menos da prova. status: "em_dia" (nenhum critério), "atencao" (1 critério de
   nível normal), "risco" (2 ou mais critérios, ou algum de nível alto). */
export const CODIGOS_RISCO = Object.freeze({
  inatividade: "Sem estudo recente",
  retencao_baixa: "Retenção real baixa",
  simulado_baixo: "Simulados abaixo da meta",
  presenca_baixa: "Presença abaixo de 80%",
  nbme_insuficiente: "Faltam autoavaliações NBME perto da prova",
  nbme_probabilidade_baixa: "Probabilidade NBME abaixo da meta"
});

const pct = (x) => (x === null || x === undefined ? "sem dado" : (Math.round(x * 1000) / 10).toString().replace(".", ",") + "%");

export function riscos(linha, cfg = CONFIG_PADRAO, agora = new Date()) {
  const c = mergeConfig(cfg);
  const out = [];
  const add = (codigo, nivel, detalhe, valor, limite, step) => out.push({ codigo, nivel, titulo: CODIGOS_RISCO[codigo], detalhe, valor, limite, ...(step ? { step } : {}) });

  /* 1. inatividade: dias desde a última atividade (revisão, simulado ou NBME);
        sem nenhuma atividade, conta a partir da criação da conta */
  const ref = linha.ultima_atividade || linha.criado_em;
  const diasSem = ref ? diasEntre(ref, agora) : null;
  if (diasSem !== null && diasSem >= c.dias_inatividade) {
    add("inatividade", diasSem >= 2 * c.dias_inatividade ? "alto" : "normal",
      linha.ultima_atividade ? "Sem estudo registrado há " + diasSem + " dias." : "Nenhum estudo registrado desde a criação da conta, há " + diasSem + " dias.",
      diasSem, c.dias_inatividade);
  }

  /* 2. retenção real na janela, só com volume mínimo de revisões */
  const ret = linha.flashcards?.retencao_30d;
  if (ret && ret.total >= c.retencao_min_revisoes && ret.taxa !== null && ret.taxa < c.retencao_minima) {
    add("retencao_baixa", "normal", "Retenção real de " + pct(ret.taxa) + " em " + ret.total + " revisões dos últimos " + c.retencao_janela_dias + " dias (meta mínima " + pct(c.retencao_minima) + ").", ret.taxa, c.retencao_minima);
  }

  /* 3. média dos N últimos simulados de cada Step (exige N tentativas) */
  const nUlt = Math.max(1, Math.round(c.simulado_ultimos));
  for (const step of STEPS) {
    const s = linha.simulados?.[step];
    if (!s || (s.ultimos || []).length < nUlt) continue;
    const ult = s.ultimos.slice(0, nUlt);
    const media = ult.reduce((a, b) => a + b.percentual, 0) / ult.length;
    if (media < c.simulado_minimo) {
      add("simulado_baixo", "normal", "Média de " + pct(media) + " nos " + nUlt + " últimos simulados do " + (step === "step1" ? "Step 1" : "Step 2 CK") + " (meta " + pct(c.simulado_minimo) + ").", media, c.simulado_minimo, step);
    }
  }

  /* 4. presença */
  const p = linha.presenca;
  if (p && p.aulas_totais > 0 && p.aulas_assistidas / p.aulas_totais < c.presenca_minima - 1e-9) {
    add("presenca_baixa", "normal", p.aulas_assistidas + " de " + p.aulas_totais + " aulas (" + pct(p.aulas_assistidas / p.aulas_totais) + ").", p.aulas_assistidas / p.aulas_totais, c.presenca_minima);
  }

  /* 5 e 6. NBME por Step pendente */
  for (const step of STEPS) {
    if (linha.plano?.[step + "_aprovado"]) continue;
    const doStep = (linha.nbme || []).filter((x) => x.step === step);
    const prova = parseData(linha.plano?.["data_prova_" + step]);
    if (prova) {
      const faltam = diasEntre(agora, prova);
      if (faltam >= 0 && faltam < c.nbme_antecedencia_dias && doStep.length < c.nbme_minimo_por_step) {
        add("nbme_insuficiente", faltam <= 30 ? "alto" : "normal",
          doStep.length + " de " + c.nbme_minimo_por_step + " autoavaliações do " + (step === "step1" ? "Step 1" : "Step 2 CK") + " lançadas, com a prova daqui a " + faltam + " dias.",
          doStep.length, c.nbme_minimo_por_step, step);
      }
    }
    const comProb = doStep.filter((x) => x.probabilidade !== null && x.probabilidade !== undefined);
    const ultima = comProb[comProb.length - 1];
    if (ultima && Number(ultima.probabilidade) < c.meta_probabilidade) {
      add("nbme_probabilidade_baixa", "normal", "Última autoavaliação do " + (step === "step1" ? "Step 1" : "Step 2 CK") + " (" + (ultima.formulario || "NBME") + ", " + ultima.data + "): probabilidade de " + String(ultima.probabilidade).replace(".", ",") + "% (meta " + c.meta_probabilidade + "%).", Number(ultima.probabilidade), c.meta_probabilidade, step);
    }
  }
  return { lista: out, dias_sem_estudo: diasSem };
}

export function avaliarParticipante(linha, { config = CONFIG_PADRAO, agora = new Date() } = {}) {
  const c = mergeConfig(config);
  const r = riscos(linha, c, agora);
  const status = !r.lista.length ? "em_dia" : (r.lista.length >= 2 || r.lista.some((x) => x.nivel === "alto")) ? "risco" : "atencao";
  return {
    user_id: linha.user_id,
    status,
    riscos: r.lista,
    dias_sem_estudo: r.dias_sem_estudo,
    garantia: garantia(linha, c, agora),
    prontidao: Object.fromEntries(STEPS.map((s) => [s, linha.plano?.[s + "_aprovado"]
      ? { step: s, status: "aprovado", atende: true, faixa_confirmada: true, consideradas: [], motivo: "Step já aprovado." }
      : prontidao(linha.nbme, s, c)]))
  };
}

/* Topo do painel do admin: contagens por status e por critério e medianas */
export function resumoCoorte(linhas, { config = CONFIG_PADRAO, agora = new Date() } = {}) {
  const av = linhas.map((l) => avaliarParticipante(l, { config, agora }));
  const porStatus = { em_dia: 0, atencao: 0, risco: 0 };
  const porCriterio = Object.fromEntries(Object.keys(CODIGOS_RISCO).map((k) => [k, 0]));
  const garantiaCont = { sim: 0, pendente_verificacao: 0, ainda_nao: 0, sem_dados_presenca: 0 };
  for (const a of av) {
    porStatus[a.status]++;
    for (const k of new Set(a.riscos.map((x) => x.codigo))) porCriterio[k]++;
    garantiaCont[a.garantia.cumpre]++;
  }
  const mediana = (xs) => {
    const v = xs.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  return {
    participantes: linhas.length,
    por_status: porStatus,
    por_criterio: porCriterio,
    garantia: garantiaCont,
    mediana_retencao_30d: mediana(linhas.map((l) => l.flashcards?.retencao_30d?.taxa)),
    mediana_revisoes_7d: mediana(linhas.map((l) => l.flashcards?.revisoes_7d)),
    mediana_presenca: mediana(linhas.map((l) => l.presenca?.percentual)),
    mediana_cobertura: mediana(linhas.map((l) => l.flashcards?.cobertura)),
    avaliacoes: av
  };
}

/* ---------- CSV de presença ----------
   Cabeçalho obrigatório com email, aulas_assistidas e aulas_totais (qualquer
   ordem, maiúsculas ou minúsculas). Aceita vírgula, ponto e vírgula ou tab e BOM.
   Devolve { linhas: [{ email, aulas_assistidas, aulas_totais }], erros: [{ linha, motivo }] }.
   Um e-mail repetido fica com a última linha. */
export function parsePresencaCsv(texto) {
  const erros = [];
  const bruto = String(texto || "").replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const idxCab = bruto.findIndex((l) => l.trim() !== "");
  if (idxCab < 0) return { linhas: [], erros: [{ linha: 0, motivo: "Arquivo vazio." }] };
  const cab = bruto[idxCab];
  const sep = [";", "\t", ","].map((s) => [s, cab.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const limpar = (s) => s.trim().replace(/^"(.*)"$/, "$1").trim();
  const nomes = cab.split(sep).map((s) => limpar(s).toLowerCase());
  const iE = nomes.indexOf("email");
  const iA = nomes.indexOf("aulas_assistidas");
  const iT = nomes.indexOf("aulas_totais");
  if (iE < 0 || iA < 0 || iT < 0) return { linhas: [], erros: [{ linha: idxCab + 1, motivo: "O cabeçalho precisa ter as colunas email, aulas_assistidas e aulas_totais." }] };
  const porEmail = new Map();
  for (let i = idxCab + 1; i < bruto.length; i++) {
    const l = bruto[i];
    if (!l.trim()) continue;
    const cols = l.split(sep).map(limpar);
    const email = (cols[iE] || "").toLowerCase();
    const a = Number(cols[iA]);
    const t = Number(cols[iT]);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { erros.push({ linha: i + 1, motivo: "E-mail inválido." }); continue; }
    if (!Number.isInteger(a) || !Number.isInteger(t) || a < 0 || t < 0) { erros.push({ linha: i + 1, motivo: "Use números inteiros não negativos." }); continue; }
    if (a > t) { erros.push({ linha: i + 1, motivo: "Aulas assistidas maior que o total." }); continue; }
    porEmail.set(email, { email, aulas_assistidas: a, aulas_totais: t });
  }
  return { linhas: [...porEmail.values()], erros };
}

/* Validação de uma autoavaliação NBME antes de gravar. Devolve mensagens de erro. */
export function validarNbme(x, agora = new Date()) {
  const erros = [];
  if (!x || typeof x !== "object") return ["Registro vazio."];
  if (!STEPS.includes(x.step)) erros.push("Escolha o Step.");
  const f = String(x.formulario || "").trim();
  if (!f || f.length > 80) erros.push("Informe o nome do formulário (até 80 caracteres).");
  if (x.modo && !["standard", "self", "desconhecido"].includes(x.modo)) erros.push("Modo inválido.");
  const d = parseData(x.data);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.data))) erros.push("Informe a data no formato AAAA-MM-DD.");
  else if (d.getTime() > addDays(dayStart(agora), 2).getTime()) erros.push("A data não pode estar no futuro.");
  const temEscore = x.escore !== null && x.escore !== undefined && x.escore !== "";
  if (temEscore && (!Number.isInteger(Number(x.escore)) || Number(x.escore) < 1 || Number(x.escore) > 999)) erros.push("O escore precisa ser um número inteiro de 1 a 999.");
  if (!temEscore && !String(x.escore_texto || "").trim()) erros.push("Informe o escore (três dígitos) ou o equivalente do relatório.");
  if (String(x.escore_texto || "").length > 40) erros.push("O escore equivalente tem no máximo 40 caracteres.");
  const temProb = x.probabilidade !== null && x.probabilidade !== undefined && x.probabilidade !== "";
  if (temProb && !(Number(x.probabilidade) >= 0 && Number(x.probabilidade) <= 100)) erros.push("A probabilidade de aprovação vai de 0 a 100.");
  if (String(x.observacao || "").length > 1000) erros.push("Observação com no máximo 1000 caracteres.");
  return erros;
}

/* Normaliza a entrada de NBME para gravação (mesmos campos nos dois modos) */
export function normalizarNbme(x) {
  const temEscore = x.escore !== null && x.escore !== undefined && x.escore !== "";
  const temProb = x.probabilidade !== null && x.probabilidade !== undefined && x.probabilidade !== "";
  const faixa = x.faixa_acima_aprovacao_baixa;
  return {
    step: x.step,
    formulario: String(x.formulario || "").trim(),
    modo: x.modo || "standard",
    data: String(x.data).slice(0, 10),
    escore: temEscore ? Number(x.escore) : null,
    escore_texto: String(x.escore_texto || "").trim(),
    probabilidade: temProb ? Math.round(Number(x.probabilidade) * 100) / 100 : null,
    faixa_acima_aprovacao_baixa: faixa === true || faixa === false ? faixa : null,
    observacao: String(x.observacao || "").trim()
  };
}

/* Série diária [{ dia, revisoes, revisao_total, revisao_acertos }] do mais antigo
   para hoje, com o dia virando às 4h como no restante do app */
export function atividadeDiaria(revlog, { dias = 182, agora = new Date() } = {}) {
  const hoje = dayStart(agora);
  const ini = addDays(hoje, -(dias - 1)).getTime();
  const fim = addDays(hoje, 1).getTime();
  const mapa = new Map();
  for (const r of revlog) {
    const t = new Date(r.review).getTime();
    if (!(t >= ini && t < fim)) continue;
    const k = dayKey(new Date(t));
    const o = mapa.get(k) || { revisoes: 0, revisao_total: 0, revisao_acertos: 0 };
    o.revisoes++;
    if (r.state === 2) { o.revisao_total++; if (r.rating > 1) o.revisao_acertos++; }
    mapa.set(k, o);
  }
  const out = [];
  for (let i = dias - 1; i >= 0; i--) {
    const k = dayKey(addDays(hoje, -i));
    out.push({ dia: k, ...(mapa.get(k) || { revisoes: 0, revisao_total: 0, revisao_acertos: 0 }) });
  }
  return out;
}
