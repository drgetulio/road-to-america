/* Road to America | utilidades de interface (DOM) */
/* Ícones usados pelo app (lidos por tools/build-icons.py --app anki para gerar anki/icons/):
    ph-arrow-counter-clockwise ph-arrow-down ph-arrow-right ph-arrow-up ph-brackets-curly ph-cards
    ph-chart-bar ph-chat-text ph-caret-down ph-check ph-check-circle ph-circle-half ph-clock
    ph-clock-counter-clockwise ph-download-simple ph-envelope-simple ph-eye ph-flag ph-funnel
    ph-gear-six ph-hourglass-medium ph-info ph-keyboard ph-lightbulb ph-lightning ph-list
    ph-lock-simple ph-magnifying-glass ph-path ph-pause-circle ph-pencil-simple ph-play-circle
    ph-plus ph-plus-circle ph-seal-check ph-sign-out ph-signpost ph-text-b ph-text-italic ph-trash
    ph-upload-simple ph-user-circle ph-users-three ph-warning ph-warning-circle ph-x ph-x-circle */
import { escapeHtml } from "./util.js";

export const e = escapeHtml;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const icon = (nome, extra = "") => '<i class="ph ph-' + nome + (extra ? " " + extra : "") + '" aria-hidden="true"></i>';

export const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function toast(msg, tipo = "info", ms = 4200) {
  const box = $("[data-toasts]");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast toast--" + tipo;
  el.setAttribute("role", tipo === "erro" ? "alert" : "status");
  const ic = { info: "info", ok: "check-circle", erro: "warning-circle", aviso: "warning" }[tipo] || "info";
  el.innerHTML = icon(ic) + "<span>" + e(msg) + "</span>";
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  setTimeout(() => {
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/*
  Caixa de diálogo com <dialog>. corpo é HTML. Os botões de ação enviam o
  formulário; a promessa resolve com { acao, dados } ou null se cancelada.
*/
export function dialog({ titulo, corpo = "", acoes = [{ rotulo: "Fechar", valor: "fechar", estilo: "ghost" }], largura = "", aoAbrir = null, validar = null }) {
  const dlg = $("[data-modal]");
  const anterior = document.activeElement;
  dlg.className = "modal" + (largura ? " modal--" + largura : "");
  dlg.innerHTML =
    '<form method="dialog" class="modal__form" novalidate>' +
    '<div class="modal__head"><h2 class="modal__title" id="modal-titulo">' + e(titulo) + '</h2>' +
    '<button type="button" class="icon-btn" data-fechar aria-label="Fechar">' + icon("x") + "</button></div>" +
    '<div class="modal__body">' + corpo + "</div>" +
    '<div class="modal__foot">' +
    acoes.map((a) => '<button class="btn ' + (a.estilo === "ghost" ? "btn--ghost" : a.estilo === "perigo" ? "btn--perigo" : "") + ' btn--sm" value="' + e(a.valor) + '"' + (a.cancelar ? " formnovalidate" : "") + ">" + (a.icone ? icon(a.icone) : "") + e(a.rotulo) + "</button>").join("") +
    "</div></form>";
  return new Promise((resolve) => {
    let resolvido = false;
    const fim = (v) => {
      if (resolvido) return;
      resolvido = true;
      if (dlg.open) dlg.close();
      if (anterior && anterior.focus) anterior.focus();
      resolve(v);
    };
    const form = $("form", dlg);
    form.addEventListener("submit", (ev) => {
      const acao = ev.submitter?.value || "ok";
      const a = acoes.find((x) => x.valor === acao);
      if (a?.cancelar || acao === "fechar") { ev.preventDefault(); fim(null); return; }
      const dados = Object.fromEntries(new FormData(form).entries());
      if (validar) {
        const msg = validar(dados, acao);
        if (msg) {
          ev.preventDefault();
          const box = $("[data-dialog-erro]", dlg);
          if (box) { box.textContent = msg; box.hidden = false; }
          return;
        }
      }
      ev.preventDefault();
      fim({ acao, dados });
    });
    $("[data-fechar]", dlg).addEventListener("click", () => fim(null));
    dlg.addEventListener("cancel", (ev) => { ev.preventDefault(); fim(null); }, { once: true });
    dlg.addEventListener("close", () => fim(null), { once: true });
    dlg.showModal();
    if (aoAbrir) aoAbrir(dlg);
    const foco = $("[autofocus]", dlg) || $(".modal__body input, .modal__body textarea, .modal__body select", dlg);
    if (foco) foco.focus();
  });
}

export async function confirmar(titulo, texto, rotulo = "Confirmar", perigo = false) {
  const r = await dialog({
    titulo,
    corpo: "<p>" + e(texto) + "</p>",
    acoes: [{ rotulo: "Cancelar", valor: "cancelar", estilo: "ghost", cancelar: true }, { rotulo, valor: "ok", estilo: perigo ? "perigo" : "" }]
  });
  return !!r;
}

export function download(nome, texto, tipo = "text/plain;charset=utf-8") {
  const blob = new Blob([texto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(file) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(r.error);
    r.readAsText(file, "utf-8");
  });
}

export function optionList(lista, selecionado = "", { vazio = null, rotulo = (x) => x.nome_pt, valor = (x) => x.chave } = {}) {
  let out = vazio !== null ? '<option value="">' + e(vazio) + "</option>" : "";
  for (const x of lista) {
    const v = valor(x);
    out += '<option value="' + e(v) + '"' + (v === selecionado ? " selected" : "") + ">" + e(rotulo(x)) + "</option>";
  }
  return out;
}

export function dataCurta(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "");
}
export function dataHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "");
}

export function num(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}
