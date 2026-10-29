/* Road to America | app de flashcards: inicialização, estado global e rotas */
import config from "../config.js";
import { LocalStore } from "./store-local.js";
import { SupabaseStore } from "./store-supabase.js";
import { loadTaxonomy, loadSeeds } from "./data.js";
import { mergeSettings, makeScheduler } from "./scheduler.js";
import { isAdmin } from "./permissions.js";
import { dayStart } from "./util.js";
import { $, $$, e, icon, toast } from "./ui.js";
import { itensMenu } from "./menu.js";

import painel from "./views/painel.js";
import estudo from "./views/estudo.js";
import editor from "./views/editor.js";
import navegador from "./views/navegador.js";
import curadoria from "./views/curadoria.js";
import estatisticas from "./views/estatisticas.js";
import guia from "./views/guia.js";
import ajustes from "./views/ajustes.js";
import entrar from "./views/entrar.js";
import progresso from "./views/progresso.js";

const ROTAS = {
  "": painel,
  estudar: estudo,
  criar: editor,
  cards: navegador,
  curadoria,
  estatisticas,
  "como-estudar": guia,
  ajustes,
  entrar,
  progresso
};


const usaSupabase = !!(config.supabaseUrl && config.supabaseAnonKey);

const ctx = {
  modo: usaSupabase ? "supabase" : "local",
  store: null,
  tax: null,
  user: null,
  settings: mergeSettings({}),
  cards: [],
  cardMap: new Map(),
  states: new Map(),
  revlog: [],
  seedsRelatorio: [],
  seeds: [],
  _sched: null,

  get sched() {
    if (!this._sched) this._sched = makeScheduler(this.settings);
    return this._sched;
  },
  get admin() { return isAdmin(this.user); },

  async reloadCards() {
    this.cards = await this.store.listCards();
    this.cardMap = new Map(this.cards.map((c) => [c.id, c]));
  },
  async reloadSrs() {
    const [estados, revlog] = await Promise.all([this.store.listStates(), this.store.listRevlog()]);
    this.states = new Map(estados.map((s) => [s.key, s]));
    this.revlog = revlog;
  },
  async reloadSettings() {
    this.settings = mergeSettings(await this.store.getSettings());
    this._sched = null;
  },
  async reloadAll() {
    await Promise.all([this.reloadCards(), this.reloadSrs(), this.reloadSettings()]);
  },
  async saveSettings(s) {
    this.settings = mergeSettings(s);
    this._sched = null;
    await this.store.saveSettings(this.settings);
  },
  revlogHoje(now = new Date()) {
    const ini = dayStart(now).getTime();
    return this.revlog.filter((r) => new Date(r.review).getTime() >= ini);
  },
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
  const partes = caminho.split("/").filter(Boolean);
  return { rota: partes[0] || "", sub: partes.slice(1), params: new URLSearchParams(qs || "") };
}

function montarMenu() {
  const ul = $("[data-nav]");
  $(".nav__toggle").hidden = !ctx.user;
  $(".app-menu").hidden = !ctx.user;
  const { rota } = parseHash();
  const atual = rota === "estudar" ? "" : rota;
  const { html, n } = itensMenu({ admin: ctx.admin, pagina: "anki", rotaAtual: atual, e, icon });
  /* com mais de dez itens o menu só cabe numa linha sem ícones */
  ul.classList.toggle("app-links--cheio", n > 10);
  ul.innerHTML = html;
  atualizarBadge();
}

async function atualizarBadge() {
  const b = $("[data-badge-curadoria]");
  if (!b || !ctx.admin) return;
  const fila = ctx.cards.filter((c) => c.status === "em_revisao").length;
  let abertas = 0;
  try { abertas = (await ctx.store.listFlags()).filter((f) => f.status === "aberta").length; } catch { /* sem acesso */ }
  const n = fila + abertas;
  b.hidden = !n;
  b.textContent = n;
  b.setAttribute("aria-label", n + " pendências");
}
ctx.atualizarBadge = atualizarBadge;

async function render() {
  const alvo = $("[data-view]");
  const { rota, sub, params } = parseHash();
  if (viewAtual?.destroy) viewAtual.destroy();
  viewAtual = null;
  fecharMenu();
  /* um diálogo aberto (leech, sinalização) não deve sobreviver à troca de tela */
  const modal = $("[data-modal]");
  if (modal?.open) modal.close();

  if (ctx.modo === "supabase" && !ctx.user && rota !== "entrar") {
    location.replace("#/entrar");
    return;
  }
  let view = ROTAS[rota] || painel;
  if (view === curadoria && !ctx.admin) view = painel;
  montarMenu();
  viewAtual = view;
  document.title = (view.titulo ? view.titulo + " | " : "") + "Flashcards | Road to America";
  try {
    await view.render(ctx, alvo, { sub, params });
  } catch (err) {
    console.error(err);
    alvo.innerHTML = '<div class="wrap section-sm"><div class="empty"><h1 class="display h3">Algo deu errado nesta tela.</h1><p>' + e(err.message || String(err)) + '</p><a class="btn btn--ghost" href="#/">Voltar ao início</a></div></div>';
  }
  if (!ctx._primeiraRender) {
    ctx._primeiraRender = true;
  } else {
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
    ctx.tax = await loadTaxonomy("./data/");
    const seeds = await loadSeeds(ctx.tax, "./data/");
    ctx.seeds = seeds.cards;
    ctx.seedsRelatorio = seeds.relatorio;

    if (usaSupabase) {
      ctx.store = new SupabaseStore({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey });
      ctx.user = await ctx.store.init();
      $("[data-sair]").hidden = !ctx.user;
      $("[data-sair]").addEventListener("click", async () => { await ctx.store.signOut(); });
      ctx.store.onAuthChange(async (u) => {
        ctx.user = u;
        $("[data-sair]").hidden = !u;
        if (u) { await ctx.reloadAll(); ctx.go("#/"); } else { ctx.cards = []; ctx.go("#/entrar"); }
      });
    } else {
      ctx.store = new LocalStore();
      ctx.user = await ctx.store.init({ seeds: ctx.seeds });
      const demo = $("[data-demo]");
      demo.hidden = false;
      const sel = $("#papel-demo");
      sel.value = ctx.user.papel;
      sel.addEventListener("change", async () => {
        ctx.store.setDemoRole(sel.value);
        ctx.user = ctx.store.user;
        await ctx.reloadAll();
        toast(sel.value === "admin" ? "Agora você vê o app como administrador." : "Agora você vê o app como participante.", "info");
        if (parseHash().rota === "curadoria" && !ctx.admin) ctx.go("#/");
        else render();
      });
      let fechado = false;
      try { fechado = localStorage.getItem("r2a-anki-banner") === "1"; } catch { /* sem armazenamento */ }
      const banner = $("[data-demo-banner]");
      banner.hidden = fechado;
      $("[data-demo-fechar]").addEventListener("click", () => {
        banner.hidden = true;
        try { localStorage.setItem("r2a-anki-banner", "1"); } catch { /* sem armazenamento */ }
      });
    }
    if (ctx.user) await ctx.reloadAll();
  } catch (err) {
    console.error(err);
    bootEl.innerHTML = '<p class="eyebrow"><span class="fita" aria-hidden="true"></span>Área do aluno</p><h1 class="display h3">Não foi possível abrir os flashcards.</h1><p class="body">' + e(err.message || String(err)) + "</p>";
    return;
  }
  bootEl.remove();
  window.addEventListener("hashchange", render);
  render();
}

boot();
export default ctx;
