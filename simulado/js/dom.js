/* Road to America | simulado: utilidades de interface (DOM).
   Ícones usados (lidos por tools/build-icons.py --app simulado):
    ph-arrow-left ph-arrow-right ph-calculator ph-caret-left ph-caret-right ph-cards
    ph-chart-bar ph-check ph-check-circle ph-circle-half ph-clock ph-clock-countdown
    ph-eraser ph-eye ph-flag ph-flag-banner ph-flask ph-gear-six ph-graduation-cap
    ph-hourglass-medium ph-info ph-keyboard ph-list-numbers ph-lock-simple
    ph-magnifying-glass ph-minus-circle ph-note-pencil ph-play ph-sign-in ph-sign-out
    ph-text-aa ph-text-strikethrough ph-highlighter-circle ph-warning ph-warning-circle
    ph-x ph-x-circle ph-arrow-counter-clockwise ph-clock-counter-clockwise ph-dots-three
    ph-arrow-square-out ph-seal-check ph-user-circle */
import { escapeHtml } from "../../anki/js/util.js";

export const e = escapeHtml;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const icon = (nome, extra = "") => '<i class="ph ph-' + nome + (extra ? " " + extra : "") + '" aria-hidden="true"></i>';

export function toast(msg, tipo = "info", ms = 4200) {
  const box = $("[data-toasts]");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast toast--" + tipo;
  el.setAttribute("role", tipo === "erro" ? "alert" : "status");
  const ic = { info: "info", ok: "check-circle", erro: "warning-circle", aviso: "clock-countdown" }[tipo] || "info";
  el.innerHTML = icon(ic) + "<span>" + e(msg) + "</span>";
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  setTimeout(() => { el.classList.remove("is-in"); setTimeout(() => el.remove(), 300); }, ms);
}

/* Anúncio para leitores de tela sem mostrar nada na tela */
export function anunciar(msg) {
  const el = $("[data-alerta]");
  if (!el) return;
  el.textContent = "";
  setTimeout(() => { el.textContent = msg; }, 30);
}

/* Diálogo modal simples. acoes: [{ rotulo, valor, estilo: "ghost" | "perigo" | "", icone }]
   Resolve com o valor do botão ou null (Esc ou fechar). */
export function dialogo({ titulo, corpo = "", acoes = [{ rotulo: "Fechar", valor: null, estilo: "ghost" }], largura = "" }) {
  const dlg = $("[data-modal]");
  const anterior = document.activeElement;
  dlg.className = "modal" + (largura ? " modal--" + largura : "");
  dlg.innerHTML =
    '<div class="modal__head"><h2 class="modal__title" id="modal-titulo">' + e(titulo) + "</h2>" +
    '<button type="button" class="icon-btn" data-fechar aria-label="Fechar">' + icon("x") + "</button></div>" +
    '<div class="modal__body">' + corpo + "</div>" +
    '<div class="modal__foot">' +
    acoes.map((a, i) => '<button type="button" class="btn btn--sm ' + (a.estilo === "ghost" ? "btn--ghost" : a.estilo === "perigo" ? "btn--perigo" : "") + '" data-acao="' + i + '"' + (a.foco ? " autofocus" : "") + ">" + (a.icone ? icon(a.icone) : "") + e(a.rotulo) + "</button>").join("") +
    "</div>";
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v) => {
      if (feito) return;
      feito = true;
      if (dlg.open) dlg.close();
      if (anterior && anterior.isConnected && anterior.focus) anterior.focus();
      resolve(v);
    };
    $$("[data-acao]", dlg).forEach((b) => b.addEventListener("click", () => fim(acoes[Number(b.dataset.acao)].valor)));
    $("[data-fechar]", dlg).addEventListener("click", () => fim(null));
    dlg.addEventListener("cancel", (ev) => { ev.preventDefault(); fim(null); }, { once: true });
    dlg.addEventListener("close", () => fim(null), { once: true });
    dlg.showModal();
    const foco = $("[autofocus]", dlg) || $("[data-acao]", dlg);
    if (foco) foco.focus();
  });
}

export function dataHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "");
}
export function dataCurta(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "");
}
