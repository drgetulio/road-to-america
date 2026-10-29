/* Road to America | relatório de desempenho do simulado completo e revisão item a
   item. Funções puras sobre o registro SimuladoCompleto (plataforma/INTERFACE.md),
   o banco (plataforma/js/banco.js) e a psicometria (plataforma/js/psicometria.js).

   O relatório segue a lógica do relatório oficial do USMLE sem copiar a sua forma:
   - Step 1: posição em relação ao limiar do banco pela probabilidade
     P(theta > c | respostas), com o rótulo de precisão da regra de PSICOMETRIA.md
     (seção 7). Pass ou Fail só quando o limiar está ligado às autoavaliações NBME da
     turma ou há modelo de desfechos suficiente;
   - Step 2 CK: probabilidade de atingir o padrão de aprovação (218 desde
     01/07/2025), sem nota de três dígitos, que só será estimada depois da
     calibração com escores reais (seção 9);
   - perfil por área de conteúdo em relação ao examinando no limiar (mais baixo,
     igual, mais alto), com o intervalo de 90% de cada área (seção 8). O relatório
     oficial mostra esse perfil a quem é reprovado; aqui ele aparece sempre. */
import { estimarAluno, bDoItem, DIMENSOES_PERFIL, REGRA_CONFIANCA, textoProbabilidade, nomePadrao, padraoProvisorio } from "../../plataforma/js/psicometria.js";
import { corrigirSessao, itensForaDoCorte, LIMITE_JA_VISTOS } from "../../plataforma/js/formularios.js";
import { sistemasDoOutline, pesosDoOutline, nomeChave, TAXONOMIA } from "../../plataforma/js/banco.js";

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

export { LIMITE_JA_VISTOS };
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

/* Dificuldades (b) dos itens do formulário que contam: base do percentual esperado */
export function bsDoFormulario(form, porId) {
  const get = getter(porId);
  const fora = itensForaDoCorte(form, porId);
  return form.blocos.flat().filter((id) => !fora.has(id)).map(get).filter(Boolean).map((q) => bDoItem(q));
}

/* Estimativa a partir só das respostas deste simulado. Os itens públicos de um
   formulário fixo ficam fora do corte (itensForaDoCorte): a estimativa usa os outros,
   e fora_do_corte diz quantos e quais saíram. */
export function estimativaDoSimulado({ form, linhas, porId, modelos = null }) {
  const step = form.step;
  const fora = itensForaDoCorte(form, porId);
  const est = estimarAluno({
    step,
    respostas: fora.size ? (linhas || []).filter((l) => !fora.has(l.questao_id)) : linhas,
    itens: porId,
    sistemas: sistemasDoOutline(step),
    pesosSistemas: pesosDoOutline(step),
    bsFormulario: bsDoFormulario(form, porId),
    modeloDesfechos: modelos?.[step]?.desfechos || null,
    modeloEscore: step === "step2ck" ? modelos?.[step]?.escore_oficial || null : null,
    ligacaoNbme: modelos?.[step]?.ligacao_nbme || null,
    /* o formulário já segue a composição do outline: sem repesagem */
    ponderar: false
  });
  Object.defineProperty(est, "fora_do_corte", { value: { n: fora.size, ids: [...fora] }, enumerable: true });
  return est;
}

/* Estimativa com todas as respostas do aluno no banco (indicador complementar) */
export function estimativaGeral({ step, respostas, porId, modelos = null }) {
  return estimarAluno({
    step,
    respostas,
    itens: porId,
    sistemas: sistemasDoOutline(step),
    pesosSistemas: pesosDoOutline(step),
    modeloDesfechos: modelos?.[step]?.desfechos || null,
    modeloEscore: step === "step2ck" ? modelos?.[step]?.escore_oficial || null : null,
    ligacaoNbme: modelos?.[step]?.ligacao_nbme || null,
    efeitoModo: modelos?.[step]?.efeito_modo || null
  });
}

/* Validade do simulado como medida de prontidão (PSICOMETRIA.md, seção 17):
   - padronizado: condições oficiais escolhidas e nenhuma parada (como o
     standard-paced do NBME);
   - reaplicação: mais de LIMITE_JA_VISTOS (25%) dos itens já respondidos antes do
     início (gravado no formulário ao começar; sem esse registro, pelas respostas
     anteriores ao dia, jaVistos);
   - valido_prontidao: padronizado, sem reaplicação e formulário completo (não
     reduzido nem parcial). Fora disso, o relatório mostra a estimativa como leitura
     de estudo. */
export function validadeDoSimulado(reg, jaVistos = null) {
  const s = reg?.sessao || {};
  const form = reg?.formulario || {};
  const padronizado = s.condicoes === "oficiais" && !(s.suspensoes || []).length && !s.suspensa;
  const frac = form.ja_vistos ? (form.ja_vistos.total ? form.ja_vistos.n / form.ja_vistos.total : 0) : jaVistos ? (jaVistos.total ? jaVistos.n / jaVistos.total : 0) : 0;
  const reaplicacao = form.ja_vistos ? !!form.ja_vistos.reaplicacao : frac > LIMITE_JA_VISTOS;
  const inteiro = !form.reduzido && !form.parcial && form.tipo === "completo";
  const motivos = [];
  if (!padronizado) motivos.push(s.condicoes === "oficiais" ? "o dia foi interrompido" : "o dia foi feito em condições de estudo, com a opção de parar");
  if (reaplicacao) motivos.push("mais de " + Math.round(LIMITE_JA_VISTOS * 100) + "% dos itens já tinham sido respondidos antes (reaplicação, não comparável)");
  if (!inteiro) motivos.push(form.parcial ? "o formulário é parcial" : form.reduzido ? "o formulário é reduzido" : "o formato não é o simulado completo");
  return { padronizado, condicoes: s.condicoes || "estudo", reaplicacao, fracao_vistos: frac, inteiro, valido_prontidao: padronizado && !reaplicacao && inteiro, motivos };
}

/* Resumo gravado com o simulado concluído (aparece no histórico) */
export function instantaneo(est, validade = null) {
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
    corte_origem: est.corte?.origem ?? null,
    sigma_corte: est.corte?.sigma ?? null,
    padronizado: validade ? validade.padronizado : null,
    reaplicacao: validade ? validade.reaplicacao : null,
    valido_prontidao: validade ? validade.valido_prontidao : null,
    calculado_em: new Date().toISOString()
  };
}

/* Resultado estimado do cabeçalho do relatório.
   Pass ou Fail (no Step 2 CK, acima ou abaixo do padrão) só aparece quando a
   probabilidade sai da faixa de 10% a 90% (REGRA_CONFIANCA). Dentro dela, o
   resultado fica "indefinido, perto do limiar", com a tendência dita em texto: uma
   probabilidade de 55% não autoriza escrever Pass. O rótulo de confiança (alta ou
   preliminar) continua separado, porque também depende do número de itens e da
   cobertura do outline. */
export function resultadoEstimado(est, step) {
  const p = est.p_aprovacao;
  const decidido = p >= REGRA_CONFIANCA.p_alta || p <= REGRA_CONFIANCA.p_baixa;
  const passa = p >= 0.5;
  const alta = !!est.confianca?.alta;
  const faixa = Math.round(REGRA_CONFIANCA.p_baixa * 100) + "% e " + Math.round(REGRA_CONFIANCA.p_alta * 100) + "%";
  const confianca = est.confianca?.texto || (alta ? "Precisão alta em relação ao padrão do banco" : "Estimativa preliminar");
  const origem = est.corte?.origem;
  const padrao = "padrão " + nomePadrao(origem);
  /* Pass e Fail só com padrão empírico (ligação com a NBME) ou com o modelo de
     desfechos; com o padrão provisório ou do painel, a leitura é a posição em relação
     ao limiar do banco */
  const empirico = origem === "nbme" || !!est.desfechos;
  const fraseP = "Probabilidade de estar acima do limiar do banco (" + padrao + (step === "step2ck" ? ", que representa o mínimo de 218" : "") + "): " + textoProbabilidade(p);
  if (!decidido) {
    const tend = step === "step2ck" || !empirico ? (passa ? "acima do limiar" : "abaixo do limiar") : (passa ? "Pass" : "Fail");
    return {
      codigo: "indefinido",
      decidido: false,
      tendencia: passa ? "acima" : "abaixo",
      titulo: step === "step2ck" ? "Perto do limiar do banco: resultado indefinido" : "Resultado estimado: indefinido, perto do limiar do banco",
      selo: "Indefinido",
      p,
      frase: fraseP + ". Com a probabilidade entre " + faixa + ", o resultado não pode ser afirmado; a tendência é " + tend + ".",
      alta,
      confianca
    };
  }
  if (step === "step2ck") {
    return {
      codigo: passa ? "atinge" : "nao_atinge",
      decidido: true,
      tendencia: passa ? "acima" : "abaixo",
      titulo: passa ? "Acima do limiar do banco para o padrão mínimo" : "Abaixo do limiar do banco para o padrão mínimo",
      selo: empirico ? (passa ? "Acima do padrão" : "Abaixo do padrão") : (passa ? "Acima do limiar do banco" : "Abaixo do limiar do banco"),
      p,
      frase: fraseP + ".",
      alta,
      confianca
    };
  }
  if (!empirico) {
    return {
      codigo: passa ? "acima" : "abaixo",
      decidido: true,
      tendencia: passa ? "acima" : "abaixo",
      titulo: passa ? "Acima do limiar do banco" : "Abaixo do limiar do banco",
      selo: passa ? "Acima do limiar do banco" : "Abaixo do limiar do banco",
      p,
      frase: fraseP + ". Enquanto o padrão for " + (padraoProvisorio(origem) ? "provisório" : "só do painel") + ", o relatório mostra a posição em relação ao limiar do banco, e não Pass ou Fail.",
      alta,
      confianca
    };
  }
  return {
    codigo: passa ? "pass" : "fail",
    decidido: true,
    tendencia: passa ? "acima" : "abaixo",
    titulo: passa ? "Resultado estimado " + (origem === "nbme" ? "pelo limiar ligado à NBME" : "pelos resultados oficiais da turma") + ": Pass" : "Resultado estimado " + (origem === "nbme" ? "pelo limiar ligado à NBME" : "pelos resultados oficiais da turma") + ": Fail",
    selo: passa ? "Pass" : "Fail",
    p,
    frase: fraseP + ".",
    alta,
    confianca
  };
}

/* Perfil de desempenho por dimensão, na ordem do outline, com as posições na escala */
export function perfilRelatorio(est, step) {
  const out = [];
  /* posições relativas ao limiar em uso (0 no padrão do banco; o corte ligado à NBME quando houver) */
  const c = est.corte?.centro || 0;
  for (const dim of DIMENSOES_RELATORIO[step] || []) {
    const linhas = est.perfil?.[dim] || [];
    const dimTax = DIM_TAX[dim];
    const ordem = (TAXONOMIA[step]?.[dimTax]?.chaves || []).map((c) => c.chave);
    const pos = (k) => { const i = ordem.indexOf(k); return i < 0 ? 999 : i; };
    const areas = linhas.slice().sort((a, b) => pos(a.chave) - pos(b.chave) || String(a.chave).localeCompare(String(b.chave))).map((l) => ({
      ...l,
      nome: nomeChave(step, dimTax, l.chave),
      rotulo_classe: ROTULO_CLASSE[l.classe] || l.classe,
      x_theta: posicaoEscala(l.theta - c),
      x_lo: posicaoEscala(l.ic[0] - c),
      x_hi: posicaoEscala(l.ic[1] - c)
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

/* Itens do formulário que o aluno já tinha respondido no banco antes deste dia
   (outra sessão, data anterior ao início). A repetição mede em parte a memória do
   item e tende a elevar o acerto; o relatório avisa quantos foram. */
export function itensJaVistos(reg, respostas) {
  const ids = new Set(reg.formulario.blocos.flat());
  const ini = Date.parse(reg.sessao?.inicio || reg.inicio || "");
  const vistos = new Set();
  for (const r of respostas || []) {
    if (!ids.has(r.questao_id) || (r.sessao_id && r.sessao_id === reg.id)) continue;
    const t = Date.parse(r.respondida_em || "");
    if (Number.isFinite(ini) && Number.isFinite(t) && t >= ini) continue;
    vistos.add(r.questao_id);
  }
  return { n: vistos.size, total: ids.size, ids: [...vistos] };
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

/* Texto do critério de precisão, para a tela */
export function textoRegraConfianca(est) {
  return "Precisão alta só com probabilidade de pelo menos " + Math.round(REGRA_CONFIANCA.p_alta * 100) + "% ou de no máximo " + Math.round(REGRA_CONFIANCA.p_baixa * 100) +
    "% (já contando a incerteza do padrão, de " + String(Math.round((est.corte?.sigma ?? 0) * 100) / 100).replace(".", ",") + " logit), com pelo menos " + est.confianca.n_minimo + " itens e itens suficientes em pelo menos " + Math.round(REGRA_CONFIANCA.cobertura_min * 100) +
    "% dos sistemas do outline (pelo menos " + REGRA_CONFIANCA.min_por_sistema + " por sistema e metade do que o peso do sistema pede). A precisão é em relação ao padrão do banco; alta confiança de aprovação no USMLE só com o modelo calibrado pelos resultados oficiais da turma.";
}

/* Leitura da precisão em uma frase, com quantos itens faltam */
export function leituraConfianca(est) {
  const c = est.confianca;
  if (c.alta) return "A probabilidade está fora da faixa de 10% a 90%, com itens suficientes e itens na maioria dos sistemas do outline. A leitura é em relação ao padrão " + nomePadrao(c.origem_corte) + (padraoProvisorio(c.origem_corte) ? " do banco." : ".");
  if (c.padrao_limita) return "Você está perto demais do limiar para a incerteza do padrão " + nomePadrao(c.origem_corte) + ": mais itens não decidem a classificação enquanto o padrão não for fixado (painel de juízes ou ligação com as autoavaliações NBME da turma). O que muda a leitura é subir a habilidade nas áreas mais fracas.";
  if (c.perto_do_limiar) return "Seu desempenho está praticamente no limiar: mais itens quase não mudam a classificação, e o que decide é subir a habilidade nas áreas mais fracas.";
  const faltam = c.faltam_itens ?? c.faltam_itens_minimo;
  return faltam ? "Faltam cerca de " + faltam + (faltam === 1 ? " item respondido" : " itens respondidos") + " para a regra de precisão alta." : "Ainda não dá para afirmar a posição em relação ao limiar com precisão alta.";
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
    alta: !!est?.alta,
    padronizado: est?.padronizado ?? (reg.sessao ? reg.sessao.condicoes === "oficiais" && !(reg.sessao.suspensoes || []).length : null),
    reaplicacao: est?.reaplicacao ?? !!reg.formulario?.ja_vistos?.reaplicacao,
    valido_prontidao: est?.valido_prontidao ?? null
  };
}

export { DIMENSOES_PERFIL };
