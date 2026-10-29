/* Road to America | relatório de desempenho do simulado completo e revisão item a
   item. Funções puras sobre o registro SimuladoCompleto (plataforma/INTERFACE.md),
   o banco (plataforma/js/banco.js) e a psicometria (plataforma/js/psicometria.js).

   O relatório segue a lógica do relatório oficial do USMLE sem copiar a sua forma:
   - Step 1: resultado estimado Pass ou Fail pela probabilidade de aprovação
     P(theta > 0 | respostas), com o rótulo de confiança da regra de PSICOMETRIA.md
     (seção 7);
   - Step 2 CK: probabilidade de atingir o padrão de aprovação (218 desde
     01/07/2025), sem nota de três dígitos, que só será estimada depois da
     calibração com escores reais (seção 9);
   - perfil por área de conteúdo em relação ao examinando no limiar (mais baixo,
     igual, mais alto), com o intervalo de 90% de cada área (seção 8). O relatório
     oficial mostra esse perfil a quem é reprovado; aqui ele aparece sempre. */
import { estimarAluno, bDoItem, DIMENSOES_PERFIL, REGRA_CONFIANCA } from "../../plataforma/js/psicometria.js";
import { corrigirSessao } from "../../plataforma/js/formularios.js";
import { sistemasDoOutline, nomeChave, TAXONOMIA } from "../../plataforma/js/banco.js";

export const NOMES_TIPO = Object.freeze({ completo: "Simulado completo", meio: "Meio formulário", prontidao: "Avaliação de prontidão" });

/* Dimensão do perfil -> dimensão da taxonomia (nomes e ordem do outline) */
const DIM_TAX = Object.freeze({ sistema: "sistema", disciplinas: "disciplina", competencia: "competencia", disciplinas_oficiais: "disciplina_oficial", area: "area" });
export const TITULOS_PERFIL = Object.freeze({
  step1: Object.freeze({ sistema: "Sistemas", disciplinas: "Disciplinas", competencia: "Competências" }),
  step2ck: Object.freeze({ sistema: "Sistemas", disciplinas_oficiais: "Disciplinas clínicas", competencia: "Tarefas do médico (competências)" })
});
/* O relatório mostra sistemas, disciplinas e competências; a área do painel do
   Step 2 CK é etiqueta interna, sem faixa oficial, e fica de fora */
export const DIMENSOES_RELATORIO = Object.freeze({ step1: ["sistema", "disciplinas", "competencia"], step2ck: ["sistema", "disciplinas_oficiais", "competencia"] });

export const ROTULO_CLASSE = Object.freeze({
  mais_baixo: "Mais baixo",
  igual: "Igual",
  mais_alto: "Mais alto",
  insuficiente: "Poucos itens"
});

/* Escala do perfil: theta de -3 a +3 logit, com o limiar (0) no meio */
export const ESCALA_PERFIL = Object.freeze({ min: -3, max: 3 });
export function posicaoEscala(theta, { min, max } = ESCALA_PERFIL) {
  const t = Math.max(min, Math.min(max, Number(theta) || 0));
  return ((t - min) / (max - min)) * 100;
}

const getter = (porId) => (porId instanceof Map ? (id) => porId.get(id) : (id) => porId?.[id]);

/* Linhas de respostas_item do simulado (as mesmas que vão para store.saveRespostas) */
export function corrigirRegistro(reg, porId) {
  return corrigirSessao(reg.formulario, reg.sessao, porId, { sessaoId: reg.id });
}

/* Dificuldades (b) dos itens do formulário: base do percentual esperado */
export function bsDoFormulario(form, porId) {
  const get = getter(porId);
  return form.blocos.flat().map(get).filter(Boolean).map((q) => bDoItem(q));
}

/* Estimativa a partir só das respostas deste simulado */
export function estimativaDoSimulado({ form, linhas, porId, modelos = null }) {
  const step = form.step;
  return estimarAluno({
    step,
    respostas: linhas,
    itens: porId,
    sistemas: sistemasDoOutline(step),
    bsFormulario: bsDoFormulario(form, porId),
    modeloDesfechos: modelos?.[step]?.desfechos || null,
    modeloEscore: step === "step2ck" ? modelos?.[step]?.escore_oficial || null : null
  });
}

/* Estimativa com todas as respostas do aluno no banco (indicador complementar) */
export function estimativaGeral({ step, respostas, porId, modelos = null }) {
  return estimarAluno({
    step,
    respostas,
    itens: porId,
    sistemas: sistemasDoOutline(step),
    modeloDesfechos: modelos?.[step]?.desfechos || null,
    modeloEscore: step === "step2ck" ? modelos?.[step]?.escore_oficial || null : null
  });
}

/* Resumo gravado com o simulado concluído (aparece no histórico) */
export function instantaneo(est) {
  return {
    p_aprovacao: est.p_aprovacao,
    theta: est.theta,
    dp: est.dp,
    ic90: est.ic90,
    rotulo: est.confianca.rotulo,
    alta: !!est.confianca.alta,
    n: est.n,
    base: est.base,
    percentual_esperado: est.percentual_esperado?.media ?? null,
    calculado_em: new Date().toISOString()
  };
}

/* Resultado estimado do cabeçalho do relatório */
export function resultadoEstimado(est, step) {
  const p = est.p_aprovacao;
  const passa = p >= 0.5;
  const alta = !!est.confianca?.alta;
  const pct = (x) => (x * 100).toFixed(1).replace(".", ",") + "%";
  if (step === "step2ck") {
    return {
      codigo: passa ? "atinge" : "nao_atinge",
      titulo: passa ? "Padrão de aprovação provavelmente atingido" : "Padrão de aprovação provavelmente não atingido",
      selo: passa ? "Acima do padrão" : "Abaixo do padrão",
      p,
      frase: "Probabilidade de atingir o padrão de aprovação do banco, que representa o mínimo de 218: " + pct(p) + ".",
      alta,
      confianca: alta ? "Alta confiança" : "Estimativa preliminar"
    };
  }
  return {
    codigo: passa ? "pass" : "fail",
    titulo: passa ? "Resultado estimado: Pass" : "Resultado estimado: Fail",
    selo: passa ? "Pass" : "Fail",
    p,
    frase: "Probabilidade de aprovação estimada: " + pct(p) + ".",
    alta,
    confianca: alta ? "Alta confiança" : "Estimativa preliminar"
  };
}

/* Perfil de desempenho por dimensão, na ordem do outline, com as posições na escala */
export function perfilRelatorio(est, step) {
  const out = [];
  for (const dim of DIMENSOES_RELATORIO[step] || []) {
    const linhas = est.perfil?.[dim] || [];
    const dimTax = DIM_TAX[dim];
    const ordem = (TAXONOMIA[step]?.[dimTax]?.chaves || []).map((c) => c.chave);
    const pos = (k) => { const i = ordem.indexOf(k); return i < 0 ? 999 : i; };
    const areas = linhas.slice().sort((a, b) => pos(a.chave) - pos(b.chave) || String(a.chave).localeCompare(String(b.chave))).map((l) => ({
      ...l,
      nome: nomeChave(step, dimTax, l.chave),
      rotulo_classe: ROTULO_CLASSE[l.classe] || l.classe,
      x_theta: posicaoEscala(l.theta),
      x_lo: posicaoEscala(l.ic[0]),
      x_hi: posicaoEscala(l.ic[1])
    }));
    const contagem = { mais_baixo: 0, igual: 0, mais_alto: 0, insuficiente: 0 };
    for (const a of areas) contagem[a.classe] = (contagem[a.classe] || 0) + 1;
    out.push({ dim, titulo: TITULOS_PERFIL[step][dim], areas, contagem });
  }
  return out;
}

/* Áreas mais fracas (mais baixo primeiro, depois as de menor P(acima do limiar)) */
export function prioridades(perfil, max = 5) {
  const todas = perfil.flatMap((p) => p.areas.filter((a) => a.classe !== "insuficiente").map((a) => ({ ...a, dim: p.dim, dimensao: p.titulo })));
  return todas.sort((a, b) => (a.classe === "mais_baixo" ? 0 : 1) - (b.classe === "mais_baixo" ? 0 : 1) || a.p_acima - b.p_acima).slice(0, max)
    .filter((a) => a.classe === "mais_baixo" || a.p_acima < 0.5);
}

/* Resumo bloco a bloco */
export function resumoBlocos(reg, porId) {
  const get = getter(porId);
  const { formulario: form, sessao: s } = reg;
  return form.blocos.map((ids, b) => {
    const enc = s.encerramentos.find((x) => x.bloco === b) || null;
    let acertos = 0, branco = 0, marcadas = 0, tempo = 0;
    ids.forEach((id, i) => {
      const r = s.respostas[b]?.[i] || {};
      const q = get(id);
      if (r.resposta === null || r.resposta === undefined) branco++;
      else if (q && r.resposta === q.correta) acertos++;
      if (r.marcada) marcadas++;
      tempo += r.tempo_ms || 0;
    });
    return {
      bloco: b, numero: b + 1, total: ids.length, acertos, em_branco: branco, marcadas,
      percentual: ids.length ? acertos / ids.length : 0,
      usado_ms: enc ? enc.usado_ms : null, limite_ms: enc ? enc.limite_ms : null, sobra_ms: enc ? enc.sobra_ms : null,
      motivo: enc ? enc.motivo : null, encerrado: !!enc,
      medio_ms: ids.length ? tempo / ids.length : 0
    };
  });
}

/* Itens da revisão item a item, na ordem da prova */
export function itensRevisao(reg, porId) {
  const get = getter(porId);
  const { formulario: form, sessao: s } = reg;
  let numero = 0;
  const out = [];
  form.blocos.forEach((ids, b) => ids.forEach((id, i) => {
    numero++;
    const q = get(id) || null;
    const r = s.respostas[b]?.[i] || { resposta: null, marcada: false, tempo_ms: 0 };
    const resposta = r.resposta ?? null;
    const situacao = resposta === null ? "em_branco" : q && resposta === q.correta ? "certa" : "errada";
    out.push({ numero, bloco: b, posicao: i, id, questao: q, faltando: !q, resposta, situacao, marcada: !!r.marcada, tempo_ms: r.tempo_ms || 0, nota: s.notas?.[id] || "" });
  }));
  return out;
}

export function filtrarItens(itens, { situacao = "todas", bloco = null } = {}) {
  return itens.filter((x) => (bloco === null || x.bloco === bloco) &&
    (situacao === "erradas" ? x.situacao !== "certa" : situacao === "marcadas" ? x.marcada : situacao === "certas" ? x.situacao === "certa" : true));
}

/* Ritmo do dia: média por item contra os 90 s de referência (30 min / 20 itens) */
export function ritmoDoDia(itens) {
  const tempos = itens.map((x) => x.tempo_ms);
  const total = tempos.reduce((a, b) => a + b, 0);
  return { medio_ms: itens.length ? total / itens.length : 0, acima_90: tempos.filter((t) => t > 90000).length, referencia_ms: 90000 };
}

/* ---------- Flashcards a partir do item ---------- */

/* Sistema do Step 2 CK -> sistema do outline do Step 1 (cards do app) */
export const CK_PARA_STEP1 = Object.freeze({
  ciencias_sociais_etica_seguranca: "ciencias_sociais",
  renal_urinario_reprodutor: "respiratorio_renal",
  cardiovascular: "cardiovascular",
  musculoesqueletico_pele: "musculoesqueletico_pele",
  saude_comportamental: "comportamento_nervoso",
  sangue_imune: "sangue_imune",
  gastrointestinal: "gastrointestinal",
  nervoso_sentidos: "comportamento_nervoso",
  respiratorio: "respiratorio_renal",
  multissistemico: "multissistemico",
  endocrino: "reprodutor_endocrino",
  gestacao_parto_puerperio: "reprodutor_endocrino",
  bioestatistica_epidemiologia: "bioestatistica",
  desenvolvimento_humano: "desenvolvimento_humano"
});

const curto = (t, max) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…"; };

/* Campos do card pré-preenchido (o aluno revisa no editor antes de salvar) */
export function cardDoItem(q) {
  if (!q) return null;
  const correta = (q.alternativas || []).find((a) => a.letra === q.correta);
  const explic = q.explicacoes_alternativas?.[q.correta] || q.explicacao || "";
  const sistema = q.step === "step1" ? q.sistema : CK_PARA_STEP1[q.sistema] || "";
  return {
    frente: curto(q.objetivo_educacional || q.pergunta, 400),
    verso: curto(correta ? correta.texto : "", 200),
    extra: curto(explic, 600),
    nota_pt: curto(q.explicacao_pt, 500),
    sistema,
    disciplina: q.step === "step1" ? q.disciplina || "" : "",
    tags: ["simulado", "questao_" + String(q.id).toLowerCase().replace(/[^a-z0-9]+/g, "_")].join(" "),
    fonte: curto(q.fonte, 200),
    de_questao: q.id
  };
}

/* Link do editor do app de flashcards (anki/#/criar), que aceita estes parâmetros
   desde 29/10/2026. retorno: caminho relativo de volta ao relatório. */
export function linkCriarFlashcard(q, { base = "../anki/", retorno = "" } = {}) {
  const c = cardDoItem(q);
  if (!c) return null;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(c)) if (v) p.set(k, v);
  if (retorno) p.set("retorno", retorno);
  return base + "#/criar?" + p.toString();
}

/* Texto do critério de confiança, para a tela */
export function textoRegraConfianca(est) {
  return "Alta confiança só com probabilidade de pelo menos " + Math.round(REGRA_CONFIANCA.p_alta * 100) + "% ou de no máximo " + Math.round(REGRA_CONFIANCA.p_baixa * 100) +
    "%, com pelo menos " + est.confianca.n_minimo + " itens e itens em pelo menos " + Math.round(REGRA_CONFIANCA.cobertura_min * 100) + "% dos sistemas do outline.";
}

/* Linha do histórico de simulados completos */
export function linhaHistorico(reg) {
  const r = reg.resultado || null;
  const est = r?.estimativa || null;
  return {
    id: reg.id, step: reg.step, tipo: reg.tipo, nome: reg.nome, estado: reg.estado, reduzido: !!reg.reduzido,
    data: reg.fim || reg.atualizado_em || reg.inicio,
    total: r?.total ?? reg.formulario?.total ?? null,
    acertos: r?.acertos ?? null,
    percentual: r?.percentual ?? null,
    blocos: reg.formulario?.blocos?.length ?? null,
    bloco_atual: reg.sessao?.bloco_atual ?? reg.bloco_atual ?? 0,
    p_aprovacao: est?.p_aprovacao ?? null,
    alta: !!est?.alta
  };
}

export { DIMENSOES_PERFIL };
