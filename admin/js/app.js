/* Road to America | área administrativa de rendimento: inicialização, acesso e rotas.
   Mesmo login e mesma camada de dados do app de flashcards (anki/). Só
   administradores entram; participante ou visitante vê a tela de acesso negado.
   Ícones usados aqui (todos já fazem parte do subconjunto de anki/icons/):
    ph-arrow-down ph-arrow-right ph-arrow-up ph-cards ph-chart-bar ph-chat-text ph-check
    ph-check-circle ph-circle-half ph-clock ph-download-simple ph-envelope-simple ph-funnel
    ph-gear-six ph-info ph-lightbulb ph-list ph-lock-simple ph-magnifying-glass ph-path
    ph-pencil-simple ph-seal-check ph-sign-out ph-signpost ph-trash ph-upload-simple
    ph-user-circle ph-users-three ph-warning ph-warning-circle ph-x ph-x-circle */
import config from "../../anki/config.js";
import { LocalStore } from "../../anki/js/store-local.js";
import { SupabaseStore } from "../../anki/js/store-supabase.js";
import { loadTaxonomy, loadSeeds } from "../../anki/js/data.js";
import { isAdmin } from "../../anki/js/permissions.js";
import { $, $$, e, icon, toast } from "../../anki/js/ui.js";
import { montarLinhas } from "./calculos.js";

import turma from "./views/turma.js";
import participantes from "./views/participantes.js";
import ficha from "./views/ficha.js";
import metas from "./views/metas.js";
import bloqueio from "./views/bloqueio.js";

const ROTAS = { "": turma, participantes, p: ficha, metas };

const MENU = [
  { rota: "", rotulo: "Turma", icone: "chart-bar" },
  { rota: "participantes", rotulo: "Participantes", icone: "users-three" },
  { rota: "metas", rotulo: "Metas e critérios", icone: "gear-six" },
  { href: "../anki/#/", rotulo: "Flashcards", icone: "cards" },
  { href: "../simulado/", rotulo: "Simulado", icone: "clock" },
  { href: "../conteudo-step1.html", rotulo: "Conteúdo do Step 1", icone: "signpost" }
];

const usaSupabase = !!(config.supabaseUrl && config.supabaseAnonKey);

const ctx = {
  modo: usaSupabase ? "supabase" : "local",
  store: null,
  tax: null,
  user: null,
  config: null,
  _dados: null,
  get admin() { return isAdmin(this.user); },

  /* Linhas de resumo, avaliações e simulados da turma, guardados até a próxima
     alteração (invalidar()) para que trocar de tela não refaça a conta. */
  async dados({ forcar = false } = {}) {
    if (this._dados && !forcar) return this._dados;
    const agora = new Date();
    const [cfg, linhas, simulados] = await Promise.all([
      this.store.getConfigPlataforma(),
      this.store.listResumoParticipantes({ agora }),
      this.store.listSimulados({ todos: true })
    ]);
    this.config = cfg;
    const rows = montarLinhas(linhas, { config: cfg, agora });
    this._dados = { agora, linhas, rows, simulados, porId: new Map(rows.map((r) => [r.id, r])) };
    return this._dados;
  },
  invalidar() { this._dados = null; },
  go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  render: () => render()
};

let viewAtual = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [caminho, qs] = h.split("?");
  const partes = caminho.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  return { rota: partes[0] || "", sub: partes.slice(1), params: new URLSearchParams(qs || "") };
}

function montarMenu() {
  const ul = $("[data-nav]");
  const { rota } = parseHash();
  const atual = rota === "p" ? "participantes" : rota;
  const itens = MENU.filter((m) => m.href || ctx.admin);
  ul.innerHTML = itens.map((m) => {
    const href = m.href || "#/" + m.rota;
    const corrente = !m.href && m.rota === atual;
    return '<li><a href="' + e(href) + '"' + (corrente ? ' aria-current="page"' : "") + (m.href ? ' class="app-links__ext"' : "") + ">" + icon(m.icone) + "<span>" + e(m.rotulo) + "</span></a></li>";
  }).join("");
}

async function render() {
  const alvo = $("[data-view]");
  const { rota, sub, params } = parseHash();
  if (viewAtual?.destroy) viewAtual.destroy();
  viewAtual = null;
  fecharMenu();
  const modal = $("[data-modal]");
  if (modal?.open) modal.close();
  montarMenu();

  let view = ROTAS[rota] || turma;
  if (!ctx.user || !ctx.admin) view = bloqueio;
  viewAtual = view;
  document.title = (view.titulo ? view.titulo + " | " : "") + "Rendimento | Road to America";
  try {
    await view.render(ctx, alvo, { sub, params });
  } catch (err) {
    console.error(err);
    alvo.innerHTML = '<div class="wrap section-sm"><div class="empty"><h1 class="display h3">Algo deu errado nesta tela.</h1><p>' + e(err.message || String(err)) + '</p><a class="btn btn--ghost" href="#/">Voltar à visão da turma</a></div></div>';
  }
  if (!ctx._primeiraRender) {
    ctx._primeiraRender = true;
  } else if (!params.has("manter")) {
    const h = $("h1", alvo);
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0 });
  }
}

/* ---------- Tema ---------- */
function temaAtual() {
  return document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function rotularTema() {
  $$("[data-theme-toggle]").forEach((b) => b.setAttribute("aria-label", temaAtual() === "dark" ? "Ativar tema claro" : "Ativar tema escuro"));
}
$$("[data-theme-toggle]").forEach((b) => b.addEventListener("click", () => {
  const prox = temaAtual() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", prox);
  try { localStorage.setItem("r2a-theme", prox); } catch { /* sem armazenamento */ }
  rotularTema();
}));
rotularTema();

/* ---------- Menu móvel ---------- */
const nav = $(".app-nav");
const toggle = $(".nav__toggle");
function fecharMenu() { nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Abrir menu"); }
toggle.addEventListener("click", () => {
  const aberto = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", aberto ? "true" : "false");
  toggle.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && nav.classList.contains("is-open")) { fecharMenu(); toggle.focus(); } });

/* ---------- Inicialização ---------- */
async function boot() {
  const bootEl = $("[data-boot]");
  try {
    ctx.tax = await loadTaxonomy("../anki/data/");
    if (usaSupabase) {
      ctx.store = new SupabaseStore({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey, vendorUrl: "../anki/vendor/supabase.umd.js" });
      ctx.user = await ctx.store.init();
      const sair = $("[data-sair]");
      sair.hidden = !ctx.user;
      sair.addEventListener("click", async () => { await ctx.store.signOut(); });
      ctx.store.onAuthChange((u) => { ctx.user = u; sair.hidden = !u; ctx.invalidar(); render(); });
    } else {
      const { cards } = await loadSeeds(ctx.tax, "../anki/data/");
      ctx.store = new LocalStore();
      ctx.user = await ctx.store.init({ seeds: cards });
      $("[data-demo]").hidden = false;
      $("[data-demo-banner]").hidden = false;
      const sel = $("#papel-demo");
      sel.value = ctx.user.papel;
      sel.addEventListener("change", () => {
        ctx.store.setDemoRole(sel.value);
        ctx.user = ctx.store.user;
        ctx.invalidar();
        toast(sel.value === "admin" ? "Agora você vê a área como administrador." : "Agora você vê a área como participante.", "info");
        render();
      });
    }
  } catch (err) {
    console.error(err);
    bootEl.innerHTML = '<p class="eyebrow"><span class="fita" aria-hidden="true"></span>Área administrativa</p><h1 class="display h3">Não foi possível abrir a área administrativa.</h1><p class="body">' + e(err.message || String(err)) + "</p>";
    return;
  }
  bootEl.remove();
  window.addEventListener("hashchange", render);
  render();
}

boot();
export default ctx;
