/* Road to America | banco de questões: inicialização, conta e rotas.
   Mesmo login, mesma camada de dados e mesmo menu do app de flashcards (anki/).
   Rotas: #/ (início), #/criar, #/bloco (bloco em andamento), #/blocos,
   #/resultado/<id>, #/desempenho, #/aprovacao.
   A tela do bloco é a do simulado (simulado/js/interface-bloco.js); a lógica do
   banco no espaço do aluno está em plataforma/js/banco-aluno.js. */
import config from "../../anki/config.js";
import { LocalStore } from "../../anki/js/store-local.js";
import { SupabaseStore } from "../../anki/js/store-supabase.js";
import { isAdmin } from "../../anki/js/permissions.js";
import { itensMenu } from "../../anki/js/menu.js";
import { $, $$, e, icon, toast } from "../../anki/js/ui.js";
import { carregarBanco } from "../../plataforma/js/banco.js";
import { historicoItens } from "../../plataforma/js/banco-aluno.js";
import { lerAndamento, lerPendentes, trocarPendentes, lerPrefs, gravarPrefs } from "./local.js";

import inicio from "./views/inicio.js";
import criar from "./views/criar.js";
import bloco from "./views/bloco.js";
import blocos from "./views/blocos.js";
import resultado from "./views/resultado.js";
import desempenho from "./views/desempenho.js";
import aprovacao from "./views/aprovacao.js";

const ROTAS = { "": inicio, criar, bloco, blocos, resultado, desempenho, aprovacao };
const usaSupabase = !!(config.supabaseUrl && config.supabaseAnonKey);

const ctx = {
  modo: usaSupabase ? "supabase" : "local",
  store: null,
  user: null,
  banco: null,
  labs: null,
  respostas: [],
  historico: new Map(),
  _primeira: false,
  get admin() { return isAdmin(this.user); },
  get dono() { return this.user?.id || "visitante"; },
  get step() { return lerPrefs().step; },
  set step(s) { gravarPrefs({ step: s }); },

  async recarregarRespostas() {
    this.respostas = await this.store.listRespostas();
    this.historico = historicoItens(this.respostas);
  },
  async recarregarBanco() {
    this.banco = await carregarBanco({ store: this.store });
  },
  /* Bloco em andamento deste navegador e desta conta (ou null) */
  andamento() {
    const s = lerAndamento();
    if (!s || s.encerrada || s.dono !== this.dono) return null;
    return s;
  },
  async enviarPendentes() {
    const pend = lerPendentes(this.dono);
    if (!pend.length) return 0;
    const resta = [];
    let n = 0;
    for (const lista of pend) {
      try { await this.store.saveRespostas(lista); n++; } catch { resta.push(lista); }
    }
    trocarPendentes(this.dono, resta);
    return n;
  },
  go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
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
  const { html, n } = itensMenu({ admin: ctx.admin, pagina: "questoes", e, icon });
  ul.classList.toggle("app-links--cheio", n > 10);
  ul.innerHTML = html;
}

async function render() {
  const alvo = $("[data-view]");
  const { rota, sub, params } = parseHash();
  if (viewAtual?.destroy) viewAtual.destroy();
  viewAtual = null;
  fecharMenu();
  const modal = $("[data-modal]");
  if (modal?.open) modal.close();
  const view = ROTAS[rota] || inicio;
  viewAtual = view;
  document.title = (view.titulo ? view.titulo + " | " : "") + "Banco de questões | Road to America";
  try {
    await view.render(ctx, alvo, { sub, params });
  } catch (err) {
    console.error(err);
    document.body.classList.remove("em-prova");
    alvo.innerHTML = '<div class="wrap section-sm"><div class="empty"><h1 class="display h3">Algo deu errado nesta tela.</h1><p>' + e(err.message || String(err)) + '</p><a class="btn btn--ghost" href="#/">Voltar ao início</a></div></div>';
  }
  if (!ctx._primeira) ctx._primeira = true;
  else if (view !== bloco) {
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

async function carregarLabs() {
  const r = await fetch("../simulado/data/valores-laboratoriais.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("Não foi possível carregar a tabela de valores laboratoriais (" + r.status + ").");
  return r.json();
}

/* ---------- Inicialização ---------- */
async function boot() {
  const bootEl = $("[data-boot]");
  try {
    ctx.labs = await carregarLabs();
    if (usaSupabase) {
      ctx.store = new SupabaseStore({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey, vendorUrl: "../anki/vendor/supabase.umd.js" });
      ctx.user = await ctx.store.init();
      if (!ctx.user) { location.replace("../anki/#/entrar"); return; }
      $("[data-sair]").hidden = false;
      $("[data-sair]").addEventListener("click", async () => { await ctx.store.signOut(); location.replace("../anki/#/entrar"); });
      ctx.store.onAuthChange?.((u) => { if (!u) location.replace("../anki/#/entrar"); });
    } else {
      ctx.store = new LocalStore();
      ctx.user = await ctx.store.init();
      const demo = $("[data-demo]");
      demo.hidden = false;
      const sel = $("#papel-demo");
      sel.value = ctx.user.papel;
      sel.addEventListener("change", async () => {
        if (parseHash().rota === "bloco") { sel.value = ctx.user.papel; toast("Termine ou saia do bloco antes de trocar o papel.", "aviso"); return; }
        ctx.store.setDemoRole(sel.value);
        ctx.user = ctx.store.user;
        await Promise.all([ctx.recarregarBanco(), ctx.recarregarRespostas()]);
        toast(sel.value === "admin" ? "Agora você vê o banco como administrador." : "Agora você vê o banco como participante.", "info");
        render();
      });
      const banner = $("[data-demo-banner]");
      banner.hidden = lerPrefs().banner;
      $("[data-demo-fechar]").addEventListener("click", () => { banner.hidden = true; gravarPrefs({ banner: true }); });
    }
    await Promise.all([ctx.recarregarBanco(), ctx.recarregarRespostas()]);
    const n = await ctx.enviarPendentes();
    if (n) { await ctx.recarregarRespostas(); toast(n === 1 ? "Um bloco que tinha ficado no navegador foi enviado para a sua conta." : n + " blocos que tinham ficado no navegador foram enviados para a sua conta.", "ok"); }
  } catch (err) {
    console.error(err);
    bootEl.innerHTML = '<p class="eyebrow"><span class="fita" aria-hidden="true"></span>Banco de questões</p><h1 class="display h3">Não foi possível abrir o banco de questões.</h1><p class="body">' + e(err.message || String(err)) + "</p>";
    return;
  }
  bootEl.remove();
  montarMenu();
  window.addEventListener("hashchange", render);
  if (parseHash().rota === "bloco" && !ctx.andamento()) location.replace("#/");
  render();
}

boot();
export default ctx;
