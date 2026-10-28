/* Road to America | peças de interface compartilhadas entre as telas */
import { buildQueue, State } from "../scheduler.js";
import { renderFront, renderBack, ROTULO_BARALHO, ROTULO_STATUS } from "../cards.js";
import { sanitizeCardHtml } from "../util.js";
import { e, icon } from "../ui.js";

export function filtroDeParams(params) {
  const lista = (k) => (params.get(k) || "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    sistemas: lista("sistema"),
    disciplinas: lista("disciplina"),
    tags: lista("tag"),
    baralhos: lista("baralho"),
    rendimento: params.get("rendimento") || ""
  };
}
export function filtroVazio(f) {
  return !f || (!f.sistemas.length && !f.disciplinas.length && !f.tags.length && !f.baralhos.length && !f.rendimento);
}

export function montarFila(ctx, { filtro = null, modo = "agenda", limiteTreino = 50, now = new Date() } = {}) {
  return buildQueue({
    cards: ctx.cards,
    states: ctx.states,
    revlogHoje: ctx.revlogHoje(now),
    settings: ctx.settings,
    userId: ctx.user?.id,
    now,
    filtro: filtroVazio(filtro) ? null : filtro,
    modo,
    limiteTreino
  });
}

/* Ritmo médio por resposta, a partir do revlog (padrão de 9 s) */
export function ritmoMedio(revlog) {
  const ult = revlog.slice(-300).map((r) => r.duracao_ms).filter((ms) => ms > 0).map((ms) => Math.min(ms, 60000));
  return ult.length >= 20 ? ult.reduce((a, b) => a + b, 0) / ult.length : 9000;
}
export function estimativaMin(contagem, revlog) {
  const ms = ritmoMedio(revlog);
  return Math.max(1, Math.round(((contagem.revisao + contagem.aprendendo) * ms + contagem.novo * 3 * ms) / 60000));
}

export function badgeBaralho(b) {
  return '<span class="badge badge--' + e(b) + '">' + e(ROTULO_BARALHO[b] || b) + "</span>";
}
export function badgeStatus(c) {
  if (c.baralho === "pessoal") return "";
  return '<span class="badge badge--st-' + e(c.status) + '">' + e(ROTULO_STATUS[c.status] || c.status) + "</span>";
}

export const ROTULO_ESTADO = { [State.New]: "Novo", [State.Learning]: "Aprendendo", [State.Review]: "Revisão", [State.Relearning]: "Reaprendendo" };

/*
  Card no formato de cartão de embarque.
  lado: "frente" mostra só a pergunta; "verso" mostra pergunta, resposta e o porquê.
*/
export function cardPass(ctx, card, ord = 1, { lado = "frente", estado = null, previa = false } = {}) {
  const sis = ctx.tax.nomeSistema[card.sistema] || card.sistema;
  const dis = ctx.tax.nomeDisciplina[card.disciplina] || card.disciplina;
  const tipoEstado = estado ? ROTULO_ESTADO[estado.state] : "Novo";
  const lacuna = card.tipo === "cloze" ? '<span class="pass-card__ord">Lacuna c' + ord + "</span>" : "";
  const mostrarVerso = lado === "verso";
  const clozeVerso = mostrarVerso && card.tipo === "cloze";
  const complementoCloze = card.tipo === "cloze" && card.verso ? '<div class="pass-card__compl">' + sanitizeCardHtml(card.verso) + "</div>" : "";
  return (
    '<article class="pass-card' + (previa ? " pass-card--previa" : "") + (mostrarVerso ? " is-revealed" : "") + '" lang="en">' +
      '<header class="pass-card__top" lang="pt-BR">' +
        '<div class="pass-card__route"><span class="pass-card__k">Sistema</span><span class="pass-card__v">' + e(sis) + "</span></div>" +
        '<div class="pass-card__route"><span class="pass-card__k">Disciplina</span><span class="pass-card__v">' + e(dis) + "</span></div>" +
        '<div class="pass-card__meta">' +
          (card.rendimento === "alto" ? '<span class="chip chip--alto">' + icon("lightning") + "Alto rendimento</span>" : "") +
          (previa ? "" : '<span class="chip">' + e(tipoEstado) + "</span>") + lacuna +
        "</div>" +
      "</header>" +
      /* no cloze, o verso substitui o texto com a lacuna preenchida, como no Anki */
      '<div class="pass-card__q">' + ((clozeVerso ? renderBack(card, ord) : renderFront(card, ord)) || '<span class="muted">Escreva a frente para ver a prévia.</span>') + "</div>" +
      '<div class="pass-card__a" ' + (mostrarVerso ? "" : "hidden") + ">" +
        '<div class="perf" aria-hidden="true"></div>' +
        (clozeVerso ? "" : '<p class="pass-card__k" lang="pt-BR">Resposta</p>' +
        '<div class="pass-card__ans">' + (renderBack(card, ord) || '<span class="muted" lang="pt-BR">Sem resposta.</span>') + "</div>") +
        complementoCloze +
        (card.extra ? '<div class="pass-card__why"><p class="pass-card__k" lang="pt-BR">' + icon("gear-six") + "Mecanismo</p><div>" + sanitizeCardHtml(card.extra) + "</div></div>" : "") +
        (card.nota_pt ? '<div class="pass-card__pt" lang="pt-BR"><p class="pass-card__k"><span class="fita" aria-hidden="true"></span>Nota em português</p><div>' + sanitizeCardHtml(card.nota_pt) + "</div></div>" : "") +
        (card.fonte ? '<p class="pass-card__src" lang="pt-BR">Referência: <span lang="en">' + e(card.fonte) + "</span></p>" : "") +
      "</div>" +
    "</article>"
  );
}

export function emptyState({ titulo, texto, acoes = "" , icone = "signpost" }) {
  return '<div class="empty">' +
    '<div class="empty__sign" aria-hidden="true">' + icon(icone) + "</div>" +
    '<h2 class="display h3">' + e(titulo) + "</h2>" +
    '<p class="body">' + texto + "</p>" +
    (acoes ? '<div class="empty__acts">' + acoes + "</div>" : "") +
  "</div>";
}

export function pageHead({ eyebrow, titulo, lead = "", acoes = "" }) {
  return '<header class="page-head">' +
    '<div><p class="eyebrow"><span class="fita" aria-hidden="true"></span>' + e(eyebrow) + "</p>" +
    '<h1 class="display h2">' + titulo + "</h1>" +
    (lead ? '<p class="lead">' + lead + "</p>" : "") + "</div>" +
    (acoes ? '<div class="page-head__acts">' + acoes + "</div>" : "") +
  "</header>";
}

export const MOTIVOS_SINALIZACAO = [
  ["erro_factual", "Erro factual"],
  ["ambiguo", "Pergunta ambígua ou com mais de uma resposta"],
  ["desatualizado", "Conteúdo desatualizado"],
  ["traducao", "Problema na nota em português"],
  ["formatacao", "Formatação"],
  ["outro", "Outro"]
];

export async function sinalizar(ctx, card, dialogFn, toastFn) {
  const r = await dialogFn({
    titulo: "Sinalizar erro neste card",
    corpo:
      '<p class="hint">A curadoria recebe a sinalização com o card, e você acompanha a resposta em Cards &gt; Minhas sinalizações.</p>' +
      '<fieldset class="field"><legend>O que está errado?</legend><div class="radios">' +
      MOTIVOS_SINALIZACAO.map(([v, r], i) => '<label class="radio"><input type="radio" name="motivo" value="' + v + '"' + (i === 0 ? " checked" : "") + "><span>" + e(r) + "</span></label>").join("") +
      "</div></fieldset>" +
      '<div class="field"><label for="sin-texto">Explique (com a fonte, se puder)</label><textarea id="sin-texto" name="texto" class="input" rows="4" maxlength="2000" placeholder="Ex.: o efeito adverso clássico é hipercalemia, não hipocalemia (Katzung, cap. diuréticos)."></textarea></div>' +
      '<p class="error" data-dialog-erro hidden></p>',
    acoes: [{ rotulo: "Cancelar", valor: "cancelar", estilo: "ghost", cancelar: true }, { rotulo: "Enviar sinalização", valor: "enviar", icone: "flag" }],
    validar: (d) => (!d.texto || d.texto.trim().length < 8 ? "Descreva o problema em pelo menos uma frase." : "")
  });
  if (!r) return false;
  try {
    await ctx.store.addFlag({ card_id: card.id, motivo: r.dados.motivo, texto: r.dados.texto });
    toastFn("Sinalização enviada à curadoria. Obrigado.", "ok");
    ctx.atualizarBadge?.();
    return true;
  } catch (err) {
    toastFn(err.message, "erro");
    return false;
  }
}
