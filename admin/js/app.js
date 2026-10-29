/* Road to America | área administrativa de rendimento: inicialização, acesso e rotas.
   Mesmo login e mesma camada de dados do app de flashcards (anki/). Só
   administradores entram; participante ou visitante vê a tela de acesso negado.
   Ícones usados aqui (todos já fazem parte do subconjunto de anki/icons/):
    ph-arrow-counter-clockwise ph-arrow-down ph-arrow-right ph-arrow-up ph-cards ph-chart-bar
    ph-chat-text ph-check ph-check-circle ph-circle-half ph-clock ph-clock-counter-clockwise
    ph-download-simple ph-envelope-simple ph-eye ph-flag ph-funnel ph-gauge ph-gear-six ph-info
    ph-lightbulb ph-list ph-list-checks ph-lock-simple ph-magnifying-glass ph-path ph-pencil-simple
    ph-seal-check ph-sign-out ph-signpost ph-trash ph-upload-simple ph-user-circle ph-users-three
    ph-warning ph-warning-circle ph-x ph-x-circle */
import config from "../../anki/config.js";
import { LocalStore } from "../../anki/js/store-local.js";
import { SupabaseStore } from "../../anki/js/store-supabase.js";
import { loadTaxonomy, loadSeeds } from "../../anki/js/data.js";
import { isAdmin } from "../../anki/js/permissions.js";
import { $, $$, e, icon, toast, limparToasts } from "../../anki/js/ui.js";
import { montarLinhas } from "./calculos.js";
import { carregarBanco } from "../../plataforma/js/banco.js";
import { estimativasTurma, aplicarBanco } from "./analise.js";

import turma from "./views/turma.js";
import participantes from "./views/participantes.js";
import ficha from "./views/ficha.js";
import metas from "./views/metas.js";
import bloqueio from "./views/bloqueio.js";
import itens from "./views/itens.js";
import item from "./views/item.js";
import calibracao from "./views/calibracao.js";
import blueprint from "./views/blueprint.js";
import angoff from "./views/angoff.js";

const ROTAS = { "": turma, participantes, p: ficha, metas, itens, item, calibracao, blueprint, angoff };
/* rota de detalhe -> item do menu que fica marcado */
const MENU_PAI = { p: "participantes", item: "itens" };

const MENU = [
  { rota: "", rotulo: "Turma", icone: "chart-bar" },
  { rota: "participantes", rotulo: "Participantes", icone: "users-three" },
  { rota: "itens", rotulo: "Itens", icone: "list-checks" },
  { rota: "calibracao", rotulo: "Calibração", icone: "gauge" },
  { rota: "blueprint", rotulo: "Blueprint", icone: "path" },
  { rota: "angoff", rotulo: "Painel Angoff", icone: "users-three", juiz: true },
  { rota: "metas", rotulo: "Metas", icone: "gear-six" },
  { href: "../anki/#/", rotulo: "Flashcards", icone: "cards" },
  { href: "../questoes/", rotulo: "Questões", icone: "list-checks" },
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
    let rows = montarLinhas(linhas, { config: cfg, agora });
    /* probabilidade de aprovação pelo banco: entra na linha e no critério de risco.
       Se o banco não abrir (schema sem as tabelas novas, por exemplo), o painel
       continua sem ela e a tela avisa. */
    let psico = null;
    try { psico = await this.psico(rows); this.psicoErro = ""; }
    catch (err) { console.warn("Banco de questões indisponível no painel:", err); this.psicoErro = err.message || String(err); }
    if (psico) rows = rows.map((r) => aplicarBanco(r, psico.estimativas.get(r.id)));
    this._dados = { agora, linhas, rows, simulados, psico, porId: new Map(rows.map((r) => [r.id, r])) };
    return this._dados;
  },
  _psico: null,
  psicoErro: "",
  async psico(rows) {
    if (this._psico) return this._psico;
    const [banco, respostas, modelos] = await Promise.all([
      carregarBanco({ store: this.store }),
      this.store.listRespostas({ todos: true }),
      this.store.getModelosPsicometricos()
    ]);
    this._psico = { banco, respostas, modelos, estimativas: estimativasTurma({ rows, respostas, banco, modelos }) };
    return this._psico;
  },
  /* banco com os itens fora do banco (suspensos, aposentados, rascunhos), para as telas de itens */
  _bancoAdmin: null,
  async bancoAdmin() {
    if (!this._bancoAdmin) this._bancoAdmin = await carregarBanco({ store: this.store, incluirInativos: true });
    return this._bancoAdmin;
  },
  invalidar() { this._dados = null; this._psico = null; this._bancoAdmin = null; this.juiz = null; },
  /* juiz designado de algum painel Angoff (mentor sem papel de admin) */
  juiz: null,
  async ehJuiz() {
    if (!this.user || this.admin) return false;
    try { return (await this.store.listPaineisAngoff()).length > 0; } catch { return false; }
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
  const partes = caminho.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  return { rota: partes[0] || "", sub: partes.slice(1), params: new URLSearchParams(qs || "") };
}

function montarMenu() {
  const ul = $("[data-nav]");
  const { rota } = parseHash();
  const atual = MENU_PAI[rota] ?? rota;
  /* o juiz designado que não é admin vê só o painel Angoff */
  const itens = MENU.filter((m) => m.href || ctx.admin || (m.juiz && ctx.juiz));
  ul.innerHTML = itens.map((m) => {
    const href = m.href || "#/" + m.rota;
    const corrente = !m.href && m.rota === atual;
    return '<li><a href="' + e(href) + '"' + (corrente ? ' aria-current="page"' : "") + (m.href ? ' class="app-links__ext"' : "") + ">" + icon(m.icone) + "<span>" + e(m.rotulo) + "</span></a></li>";
  }).join("");
}

async function render() {
  limparToasts();
  const alvo = $("[data-view]");
  const { rota, sub, params } = parseHash();
  if (viewAtual?.destroy) viewAtual.destroy();
  viewAtual = null;
  fecharMenu();
  const modal = $("[data-modal]");
  if (modal?.open) modal.close();
  if (ctx.user && !ctx.admin && ctx.juiz === null) ctx.juiz = await ctx.ehJuiz();
  montarMenu();

  let view = ROTAS[rota] || turma;
  if (!ctx.user || (!ctx.admin && !(ctx.juiz && view === angoff))) view = bloqueio;
  if (view === bloqueio && ctx.juiz) { location.replace("#/angoff"); return; }
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
