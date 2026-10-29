/* Road to America | área administrativa: banco de questões (funções puras).

   O que a área administrativa calcula sobre o banco, a partir das funções de
   plataforma/js/psicometria.js e plataforma/js/banco.js:
   - análise de itens para a tabela e a ficha do item (p, ponto-bisserial corrigida,
     D, infit, outfit, alertas), com os distratores por quartil de habilidade;
   - probabilidade de aprovação de cada participante pelo banco (estimarAluno) e o
     critério de risco "probabilidade baixa com precisão alta";
   - distribuição da turma;
   - cobertura do banco contra as faixas oficiais do outline.
   Método em plataforma/PSICOMETRIA.md (seções 11, 12, 13 e 19). Sem DOM. */
import {
  analisarItens, estimarAluno, eap, bDoItem, prontidaoCombinada, expit,
  REGRA_CONFIANCA, LIMIARES_ITEM, PADRAO_STEP2CK, textoProbabilidade
} from "../../plataforma/js/psicometria.js";
import { TAXONOMIA, CAMPO_MULTIRROTULO, ITENS_FORMULARIO_OFICIAL, sistemasDoOutline, pesosDoOutline, nomeChave } from "../../plataforma/js/banco.js";

export const STEPS = ["step1", "step2ck"];

/* ---------- análise de itens ---------- */

export const ROTULO_ALERTA = Object.freeze({
  p_baixo: "Muito difícil (p < 0,20)",
  p_alto: "Muito fácil (p > 0,95)",
  pbis_negativa: "Discriminação negativa",
  pbis_baixa: "Discriminação abaixo de 0,10",
  distrator_atrai_melhores: "Distrator atrai os melhores",
  desajuste_rasch: "Desajuste ao Rasch",
  distrator_nao_funcional: "Distrator pouco escolhido",
  amostra_pequena: "Menos de 30 respostas"
});
/* alertas que pedem revisão do item (nível "revisar" em analisarItens) */
export const ALERTAS_REVISAR = Object.freeze(["p_baixo", "p_alto", "pbis_negativa", "pbis_baixa", "distrator_atrai_melhores", "desajuste_rasch"]);

/* Habilidade de cada pessoa da matriz pseudonimizada (EAP com todos os itens que ela
   respondeu no Step, b calibrado quando houver). Grade de 0,05 logit: basta para
   ordenar as pessoas e calcular infit e outfit. */
export function thetasPessoas(matriz, porId, { usarCalibrado = true } = {}) {
  const por = new Map();
  for (const r of matriz || []) {
    const q = porId.get(r.questao_id);
    if (!q) continue;
    const k = String(r.pessoa);
    (por.get(k) || por.set(k, []).get(k)).push({ b: bDoItem(q, { usarCalibrado }), x: r.correta ? 1 : 0 });
  }
  const out = new Map();
  for (const [k, rs] of por) { const e = eap(rs, { grade: { min: -6, max: 6, passo: 0.05 } }); out.set(k, { theta: e.theta, dp: e.dp, n: rs.length }); }
  return out;
}

/* Quartil de habilidade de cada pessoa (1 = 25% mais baixos, 4 = 25% mais altos).
   Empate desfeito pelo identificador, para o resultado não depender da ordem. */
export function quartisPessoas(thetas, { minimo = 8 } = {}) {
  const lista = [...thetas].map(([k, v]) => [k, v.theta]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (lista.length < minimo) return null;
  const out = new Map();
  lista.forEach(([k], i) => out.set(k, Math.min(4, 1 + Math.floor((4 * i) / lista.length))));
  return out;
}

/* Quem escolheu cada alternativa, por quartil de habilidade: a "curva de opção"
   que o NBME e os programas clássicos de análise de itens mostram. */
export function distratoresPorQuartil(linhas, item, quartis) {
  const letras = (item?.alternativas || []).map((a) => a.letra);
  for (const r of linhas) if (r.resposta && !letras.includes(r.resposta)) letras.push(r.resposta);
  letras.sort();
  const nq = [0, 0, 0, 0];
  const cont = new Map(letras.map((l) => [l, { n: 0, q: [0, 0, 0, 0] }]));
  let branco = 0;
  const brancoQ = [0, 0, 0, 0];
  for (const r of linhas) {
    const g = quartis ? quartis.get(String(r.pessoa)) : null;
    if (g) nq[g - 1]++;
    if (!r.resposta) { branco++; if (g) brancoQ[g - 1]++; continue; }
    const c = cont.get(r.resposta);
    c.n++;
    if (g) c.q[g - 1]++;
  }
  const n = linhas.length;
  return {
    n, n_quartil: nq, por_quartil: !!quartis,
    em_branco: { n: branco, prop: n ? branco / n : null, q: brancoQ.map((x, i) => (nq[i] ? x / nq[i] : null)) },
    opcoes: letras.map((l) => {
      const c = cont.get(l);
      return { letra: l, correta: l === item?.correta, n: c.n, prop: n ? c.n / n : null, q: c.q.map((x, i) => ({ n: x, prop: nq[i] ? x / nq[i] : null })) };
    })
  };
}

/* Análise completa de um Step para a tabela: uma linha por item do banco (inclusive
   os que ainda não têm respostas), com os índices, os alertas, o status e os
   reportes abertos. matriz: store.listRespostasCalibracao({ step }). */
export function analisarBanco({ banco, step, matriz = [], reportes = [], usarCalibrado = true }) {
  const itens = banco.itens.filter((q) => q.step === step);
  const porId = banco.porId;
  const doStep = (matriz || []).filter((r) => porId.get(r.questao_id)?.step === step);
  const thetas = thetasPessoas(doStep, porId, { usarCalibrado });
  const quartis = quartisPessoas(thetas);
  const mapaTheta = new Map([...thetas].map(([k, v]) => [k, v.theta]));
  const a = analisarItens(doStep, porId, { usarCalibrado, thetas: mapaTheta });
  const porItem = new Map(a.itens.map((x) => [x.questao_id, x]));
  const abertos = new Map();
  for (const r of reportes || []) if (r.status === "aberto" || r.status === "em_analise") abertos.set(r.questao_id, (abertos.get(r.questao_id) || 0) + 1);
  const linhas = itens.map((q) => linhaItem(q, porItem.get(q.id), abertos.get(q.id) || 0));
  return { step, linhas, porItem, thetas, quartis, matriz: doStep, resumo: { ...a.resumo, ...resumoItens(linhas) } };
}

function linhaItem(q, an, reportes) {
  const alertas = an ? an.alertas : [];
  return {
    id: q.id, step: q.step, versao: q.versao || 1, status: q.status || "ativo", em_revisao: !!q.em_revisao, revisao_nota: q.revisao_nota || "",
    sistema: q.sistema, disciplina: q.disciplina, disciplinas: q.step === "step1" ? (q.disciplinas || [q.disciplina]) : (q.disciplinas_oficiais || [q.disciplina_oficial]).filter(Boolean),
    competencia: q.competencia, area: q.area || null, dificuldade: q.dificuldade,
    angoff: q.angoff, b_angoff: q.b_angoff, b_calibrado: Number.isFinite(q.b_calibrado) ? q.b_calibrado : null, ep_calibrado: Number.isFinite(q.ep_calibrado) ? q.ep_calibrado : null,
    n: an?.n || 0, acertos: an?.acertos || 0, p: an ? an.p : null, pbis: an ? an.pbis : null, d: an ? an.d : null,
    infit: an ? an.infit : null, outfit: an ? an.outfit : null, confiavel: !!an?.confiavel,
    alertas: alertas.filter((x) => x.nivel === "revisar").map((x) => x.codigo),
    informativos: alertas.filter((x) => x.nivel !== "revisar").map((x) => x.codigo),
    textos: alertas,
    revisar: !!an?.revisar, reportes
  };
}

export function resumoItens(linhas) {
  const por_alerta = {};
  for (const l of linhas) for (const c of l.alertas) por_alerta[c] = (por_alerta[c] || 0) + 1;
  return {
    total: linhas.length,
    com_dados: linhas.filter((l) => l.n > 0).length,
    confiaveis: linhas.filter((l) => l.confiavel).length,
    a_revisar: linhas.filter((l) => l.revisar).length,
    a_revisar_confiaveis: linhas.filter((l) => l.revisar && l.confiavel).length,
    em_revisao: linhas.filter((l) => l.em_revisao).length,
    fora_do_banco: linhas.filter((l) => l.status !== "ativo").length,
    calibrados: linhas.filter((l) => l.b_calibrado !== null).length,
    reportes_abertos: linhas.reduce((s, l) => s + l.reportes, 0),
    por_alerta
  };
}

/* f: { sistema, disciplina, competencia, alerta, situacao, q }
   alerta: "" | "revisar" | "nenhum" | código; situacao: "" | "ativo" | "fora" | "revisao" | "reportes" | "calibrado" */
export function filtrarItens(linhas, f = {}) {
  const q = String(f.q || "").trim().toLowerCase();
  return linhas.filter((l) => {
    if (q && !l.id.toLowerCase().includes(q)) return false;
    if (f.sistema && l.sistema !== f.sistema) return false;
    if (f.disciplina && !l.disciplinas.includes(f.disciplina)) return false;
    if (f.competencia && l.competencia !== f.competencia) return false;
    if (f.alerta === "revisar" && !l.revisar) return false;
    if (f.alerta === "nenhum" && (l.revisar || !l.n)) return false;
    if (f.alerta && !["revisar", "nenhum"].includes(f.alerta) && !l.alertas.includes(f.alerta) && !l.informativos.includes(f.alerta)) return false;
    if (f.situacao === "ativo" && l.status !== "ativo") return false;
    if (f.situacao === "fora" && l.status === "ativo") return false;
    if (f.situacao === "revisao" && !l.em_revisao) return false;
    if (f.situacao === "reportes" && !l.reportes) return false;
    if (f.situacao === "calibrado" && l.b_calibrado === null) return false;
    return true;
  });
}

const VALOR_ORDEM_ITEM = {
  prioridade: (l) => (l.reportes ? 4000 : 0) + (l.revisar ? (l.confiavel ? 3000 : 1500) : 0) + l.alertas.length * 100 + (l.em_revisao ? 50 : 0) + Math.min(49, l.n / 10),
  id: (l) => l.id,
  p: (l) => l.p,
  pbis: (l) => l.pbis,
  angoff: (l) => l.angoff,
  b: (l) => (l.b_calibrado ?? l.b_angoff),
  n: (l) => l.n
};
export const ORDENS_ITEM = Object.keys(VALOR_ORDEM_ITEM);
export function ordenarItens(linhas, chave = "prioridade", dir = "desc") {
  const v = VALOR_ORDEM_ITEM[chave] || VALOR_ORDEM_ITEM.prioridade;
  const s = dir === "asc" ? 1 : -1;
  return linhas.slice().sort((a, b) => {
    const va = v(a), vb = v(b);
    const na = va === null || va === undefined, nb = vb === null || vb === undefined;
    if (na && nb) return a.id < b.id ? -1 : 1;
    if (na) return 1;
    if (nb) return -1;
    const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return c ? c * s : a.id < b.id ? -1 : 1;
  });
}

/* ---------- probabilidade de aprovação da turma ---------- */

export const CODIGO_RISCO_BANCO = "banco_probabilidade_baixa";
export const ROTULO_RISCO_BANCO = "Probabilidade baixa no banco, com precisão alta";

/* Estimativa de cada participante nos dois Steps.
   rows: linhas do painel (montarLinha); respostas: store.listRespostas({ todos: true });
   banco: carregarBanco(); modelos: store.getModelosPsicometricos().
   Devolve Map user_id -> { step1, step2ck } com a saída de estimarAluno, ou null
   para o Step sem nenhuma resposta. */
export function estimativasTurma({ rows, respostas, banco, modelos = null }) {
  const por = new Map();
  for (const r of respostas || []) (por.get(r.user_id) || por.set(r.user_id, []).get(r.user_id)).push(r);
  const out = new Map();
  for (const row of rows) {
    const rs = por.get(row.id) || [];
    const e = {};
    for (const step of STEPS) {
      const doStep = rs.filter((r) => r.step === step);
      e[step] = doStep.length ? estimarAluno({
        step, respostas: doStep, itens: banco.porId, sistemas: sistemasDoOutline(step), pesosSistemas: pesosDoOutline(step),
        modeloDesfechos: modelos?.[step]?.desfechos || null,
        modeloEscore: step === "step2ck" ? modelos?.[step]?.escore_oficial || null : null,
        ligacaoNbme: modelos?.[step]?.ligacao_nbme || null,
        efeitoModo: modelos?.[step]?.efeito_modo || null
      }) : null;
      /* modelo gravado no modo demonstração: desfechos fictícios, a tela precisa dizer */
      if (e[step]?.desfechos) e[step].desfechos.demonstracao = !!modelos?.[step]?.demonstracao;
      if (e[step]?.escore) e[step].escore.demonstracao = !!modelos?.[step]?.demonstracao;
    }
    out.set(row.id, e);
  }
  return out;
}

/* Steps que ainda contam para o participante (o aprovado sai do risco) */
export function stepsPendentes(row) {
  const p = row.linha?.plano || {};
  return STEPS.filter((s) => !p[s + "_aprovado"]);
}

/* Critério de risco do banco: probabilidade de aprovação de no máximo 10% com
   precisão alta (a mesma regra de PSICOMETRIA.md, seção 7, já com a incerteza do
   padrão) num Step pendente. Nível alto: com precisão alta, a estimativa já é decisiva. */
export function riscosBanco(row, est, { regra = REGRA_CONFIANCA } = {}) {
  const out = [];
  for (const step of stepsPendentes(row)) {
    const x = est?.[step];
    if (!x || !x.confianca?.alta || x.p_aprovacao > regra.p_baixa) continue;
    const nome = step === "step1" ? "Step 1" : "Step 2 CK";
    out.push({
      codigo: CODIGO_RISCO_BANCO, nivel: "alto", titulo: ROTULO_RISCO_BANCO, step,
      detalhe: nome + ": probabilidade de " + textoProbabilidade(x.p_aprovacao) + " de estar acima do limiar do banco, com precisão alta em relação ao padrão do banco (" + numTxt(x.n_efetivo) + " itens, intervalo de 90% de θ de " + numTxt(x.ic90[0], 2) + " a " + numTxt(x.ic90[1], 2) + "). Padrão provisório do banco (dificuldade-alvo, sem painel de juízes); não é resultado oficial.",
      valor: x.p_aprovacao, limite: regra.p_baixa
    });
  }
  return out;
}

/* Junta a estimativa do banco à linha do painel: acrescenta o critério de risco e
   refaz a situação com a regra de desempenho.js (em dia sem critérios; atenção com
   um critério normal; risco com dois ou mais ou com qualquer critério alto). */
export function aplicarBanco(row, est) {
  const extra = riscosBanco(row, est);
  const riscos = row.riscos.filter((x) => x.codigo !== CODIGO_RISCO_BANCO).concat(extra)
    .sort((a, b) => (b.nivel === "alto") - (a.nivel === "alto"));
  const status = !riscos.length ? "em_dia" : riscos.length >= 2 || riscos.some((x) => x.nivel === "alto") ? "risco" : "atencao";
  const ordem = { risco: 2, atencao: 1, em_dia: 0 };
  return {
    ...row, banco: est || { step1: null, step2ck: null }, riscos, status, status_ordem: ordem[status],
    n_riscos: riscos.length, risco_alto: riscos.some((x) => x.nivel === "alto"), motivo: riscos.map((x) => x.titulo).join("; "),
    avaliacao: { ...row.avaliacao, riscos, status }
  };
}

/* Distribuição da probabilidade na turma num Step: um ponto por participante com
   respostas, separado pela confiança. */
export function distribuicaoProbabilidade(rows, step, { regra = REGRA_CONFIANCA } = {}) {
  const pontos = [];
  let sem = 0;
  for (const r of rows) {
    const x = r.banco?.[step];
    if (!x) { sem++; continue; }
    pontos.push({ id: r.id, nome: r.nome, p: x.p_aprovacao, alta: !!x.confianca?.alta, n: x.n_efetivo, faltam: x.confianca?.faltam_itens ?? null, sintetico: !!r.sintetico });
  }
  pontos.sort((a, b) => a.p - b.p || (a.nome < b.nome ? -1 : 1));
  return {
    step, pontos, sem_respostas: sem,
    alta_acima: pontos.filter((p) => p.alta && p.p >= regra.p_alta).length,
    alta_abaixo: pontos.filter((p) => p.alta && p.p <= regra.p_baixa).length,
    preliminar: pontos.filter((p) => !p.alta).length,
    mediana: pontos.length ? pontos[Math.floor((pontos.length - 1) / 2)].p : null
  };
}

/* Leitura da estimativa para a ficha: prontidão combinada com a EXIT 18 */
export function leituraBanco(est, prontidaoExit18) {
  if (!est) return null;
  return { ...est, combinada: prontidaoCombinada({ exit18: prontidaoExit18, banco: est }) };
}

/* ---------- blueprint e cobertura do banco ---------- */

/* Dimensões com faixa oficial mostradas na tela, por Step. multirrotulo: o item conta
   em cada rótulo (disciplinas do Step 1 com as secundárias; disciplinas clínicas do
   Step 2 CK), como no outline, em que a soma passa de 100%. */
export const DIMENSOES_BLUEPRINT = Object.freeze({
  step1: [
    { dim: "sistema", titulo: "Sistemas", campo: "sistema" },
    { dim: "disciplina", titulo: "Disciplinas (todos os rótulos do item)", campo: "disciplinas", multirrotulo: true },
    { dim: "competencia", titulo: "Competências", campo: "competencia" }
  ],
  step2ck: [
    { dim: "sistema", titulo: "Sistemas", campo: "sistema" },
    { dim: "disciplina_oficial", titulo: "Disciplinas clínicas (todos os rótulos do item)", campo: "disciplinas_oficiais", multirrotulo: true },
    { dim: "competencia", titulo: "Tarefas do médico", campo: "competencia" }
  ]
});

/* itens: itens ativos do Step (normalizados). Para cada chave do outline: n, % do
   banco, faixa oficial, situação ("dentro", "abaixo", "acima", "sem_faixa"),
   itens que um formulário completo pede pela faixa ([mínimo, máximo]) e quantos
   formulários completos sem repetição o banco sustenta só por essa linha. */
export function coberturaBlueprint(itens, step) {
  const total = itens.length;
  const tamanho = ITENS_FORMULARIO_OFICIAL[step];
  const dims = DIMENSOES_BLUEPRINT[step].map((d) => {
    const tax = TAXONOMIA[step][d.dim];
    const cont = new Map();
    for (const q of itens) {
      const v = d.multirrotulo ? [...new Set([q[d.dim], ...(q[CAMPO_MULTIRROTULO[step][d.dim]] || [])].filter(Boolean))] : [q[d.campo]];
      for (const c of v) if (c) cont.set(c, (cont.get(c) || 0) + 1);
    }
    const conhecidas = new Set(tax.chaves.map((c) => c.chave));
    const linhas = tax.chaves.map((c) => {
      const n = cont.get(c.chave) || 0;
      const pct = total ? n / total : 0;
      const faixa = c.faixa || null;
      const situacao = !faixa ? "sem_faixa" : pct < faixa[0] / 100 - 1e-9 ? "abaixo" : pct > faixa[1] / 100 + 1e-9 ? "acima" : "dentro";
      const pedido = faixa ? [Math.ceil((faixa[0] / 100) * tamanho), Math.floor((faixa[1] / 100) * tamanho)] : null;
      return {
        chave: c.chave, nome: c.nome, nome_en: c.nome_en, nota: c.nota || "", n, pct, faixa, situacao, pedido_formulario: pedido,
        formularios: pedido && pedido[0] > 0 ? Math.floor(n / pedido[0]) : null,
        faltam_para_faixa: faixa && situacao === "abaixo" ? Math.ceil((faixa[0] / 100) * total - n) : 0
      };
    });
    const fora = [...cont].filter(([k]) => !conhecidas.has(k)).map(([chave, n]) => ({ chave, n }));
    const exigida = !!tax.exigir_faixa && !d.multirrotulo;
    const comFaixa = linhas.filter((l) => l.formularios !== null);
    return {
      ...d, exigida, linhas, fora_do_outline: fora, fonte: tax.fonte,
      dentro: linhas.filter((l) => l.situacao === "dentro").length, com_faixa: linhas.filter((l) => l.faixa).length,
      gargalo: exigida && comFaixa.length ? comFaixa.reduce((m, l) => (l.formularios < m.formularios ? l : m), comFaixa[0]) : null
    };
  });
  const formulariosTotal = tamanho ? Math.floor(total / tamanho) : 0;
  const gargalos = dims.filter((d) => d.gargalo).map((d) => d.gargalo.formularios);
  return {
    step, total, tamanho_formulario: tamanho, dims,
    formularios_sem_repeticao: Math.min(formulariosTotal, ...(gargalos.length ? gargalos : [formulariosTotal])),
    por_dificuldade: ["facil", "media", "dificil"].map((k) => ({ chave: k, n: itens.filter((q) => q.dificuldade === k).length })),
    angoff_medio: total ? itens.reduce((s, q) => s + q.angoff, 0) / total : null,
    escore_corte_esperado: total ? itens.reduce((s, q) => s + expit(-q.b_angoff), 0) / total : null
  };
}

/* ---------- formatação ---------- */
export function pctTxt(x, casas = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "sem dado";
  if (casas === 0 && x > 0 && x < 0.01) return "menos de 1%";
  if (casas === 0 && x < 1 && x > 0.99) return "mais de 99%";
  return (x * 100).toFixed(casas).replace(".", ",") + "%";
}
export function numTxt(x, casas = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "sem dado";
  const v = Math.abs(x) < 0.5 * 10 ** -casas ? 0 : x;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas >= 2 ? casas : 0 });
}
export function nomeDim(step, dim, chave) { return chave ? nomeChave(step, dim, chave) : "sem classificação"; }
export { PADRAO_STEP2CK, LIMIARES_ITEM, REGRA_CONFIANCA };
