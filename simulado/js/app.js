/* Road to America | simulados: inicialização, conta e rotas.
   Rotas do bloco de 30 minutos: #/ (início e histórico), #/bloco (bloco em
   andamento), #/resultado/<id>.
   Rotas dos simulados que replicam a prova (Step 1 com 14 blocos, Step 2 CK com 16,
   meio formulário e avaliação de prontidão): #/completos (escolha, em andamento e
   histórico), #/dia/<id> (dia de prova: tutorial, blocos, pausas, fim do dia),
   #/relatorio/<id> (relatório de desempenho e revisão item a item).

   Onde a tentativa fica gravada:
   - modo Supabase com login: store.saveSimulado (aparece no painel do admin);
   - modo Supabase sem login (visitante): só neste navegador, com convite à pré-inscrição;
   - modo demonstração (anki/config.js vazio): LocalStore do app de flashcards, também
     só neste navegador; entra no painel do admin de demonstração. */
import config from "../../anki/config.js";
import { LocalStore } from "../../anki/js/store-local.js";
import { SupabaseStore } from "../../anki/js/store-supabase.js";
import { aplicarTaxonomia } from "./rotulos.js";
import { HistoricoLocal, lerAndamento, apagarAndamento, gravarNotas } from "./armazenamento.js";
import { restaurarSessao, expirou, encerrar, paraTentativa } from "./sessao.js";
import { $, $$, e, toast, limparToasts } from "./dom.js";
import { alternarTema, rotularTema } from "./tema.js";
import telaInicio from "./tela-inicio.js";
import telaProva from "./tela-prova.js";
import telaResultado from "./tela-resultado.js";
import telaCompletos from "./tela-completos.js";
import telaDia from "./tela-dia.js";
import telaRelatorio from "./tela-relatorio.js";
import { carregarBanco } from "../../plataforma/js/banco.js";

const usaSupabase = !!(config.supabaseUrl && config.supabaseAnonKey);

const ctx = {
  modo: usaSupabase ? "supabase" : "demo",
  store: null,
  user: null,
  bancos: { step1: [], step2ck: [] },
  porId: new Map(),
  labs: null,
  local: new HistoricoLocal(),
  _cache: null,

  /* "participante" (conta real), "visitante" (sem login) ou "demo" */
  get conta() {
    if (this.modo === "demo") return "demo";
    return this.user ? "participante" : "visitante";
  },
  get gravaNaConta() { return this.conta !== "visitante"; },

  /* Quem é o dono do que fica neste navegador: o id da conta, "visitante" ou "demo".
     Num computador compartilhado, um bloco ou uma tentativa pendente de outra conta
     não pode ir para a conta de quem entrou depois. */
  get dono() {
    if (this.modo === "demo") return "demo";
    return this.user?.id || "visitante";
  },
  /* Bloco salvo por outra conta (um visitante que entra na conta no meio do bloco continua dono dele) */
  deOutraConta(sessao) {
    const d = sessao?.dono;
    return this.modo === "supabase" && !!d && d !== "visitante" && d !== this.dono;
  },

  /* Banco de questões completo (tabela questoes no Supabase; no modo demonstração,
     os itens públicos ou, em localhost com ?banco=completo, banco-privado/). Só
     participante com login (Supabase) ou modo demonstração. */
  async obterBanco() {
    if (this.conta === "visitante") return null;
    if (!this._bancoP || this._bancoDono !== this.dono) {
      this._bancoDono = this.dono;
      this._bancoP = carregarBanco({ store: this.store, labsTabela: this.labs }).catch((err) => { this._bancoP = null; throw err; });
    }
    return this._bancoP;
  },

  /* Respostas do bloco de 30 minutos no formato de respostas_item (origem
     "bloco_30"), para entrarem na estimativa de aprovação do banco */
  async gravarRespostasBloco(t, registro) {
    if (!this.gravaNaConta || !this.store?.saveRespostas || !registro?.id || String(registro.id).startsWith("loc-")) return;
    const linhas = (t.questoes || []).map((id, i) => {
      const q = this.porId.get(id);
      return {
        questao_id: id, step: t.step, resposta: t.respostas?.[i] ?? null,
        correta: !!q && t.respostas?.[i] != null && String(t.respostas[i]).toUpperCase() === String(q.correta).toUpperCase(),
        tempo_ms: Math.round(t.tempos_ms?.[i] || 0), marcada: !!t.marcadas?.[i],
        modo: "cronometrado", origem: "bloco_30", sessao_id: String(registro.id).slice(0, 64), bloco: 0, posicao: i, respondida_em: t.fim
      };
    });
    try { await this.store.saveRespostas(linhas); }
    catch (err) { console.warn("Respostas do bloco não entraram no banco de respostas:", err); }
  },

  async listarTentativas(step = null) {
    let lista = [];
    if (this.gravaNaConta && this.store) {
      try { lista = await this.store.listSimulados({ step }); }
      catch (err) { console.error(err); toast("Não foi possível ler o histórico da sua conta: " + (err.message || err), "erro"); }
    }
    /* tentativas feitas sem login ou que não chegaram ao banco */
    const locais = this.local.listar(step).filter((t) => (this.conta === "visitante" ? !t._pendente_envio : t._pendente_envio && t._dono === this.dono));
    return [...lista, ...locais].sort((a, b) => String(b.fim).localeCompare(String(a.fim)));
  },

  /* Grava e devolve { registro, onde: "conta" | "navegador", erro } */
  async salvarTentativa(t) {
    if (this.gravaNaConta && this.store) {
      try {
        const reg = await this.store.saveSimulado(t);
        await this.gravarRespostasBloco(t, reg);
        return { registro: reg, onde: this.modo === "demo" ? "demo" : "conta" };
      } catch (err) {
        console.error(err);
        const reg = this.local.salvar({ ...t, _pendente_envio: true, _dono: this.dono });
        return { registro: reg, onde: "navegador", erro: err.message || String(err) };
      }
    }
    return { registro: this.local.salvar(t), onde: "navegador" };
  },

  /* Reenvia para a conta as tentativas que ficaram só no navegador por falha de rede */
  async reenviarPendentes() {
    if (this.conta !== "participante") return 0;
    const pend = this.local.listar().filter((t) => t._pendente_envio && t._dono === this.dono);
    let n = 0;
    for (const t of pend) {
      try {
        const { id, user_id, criado_em, _pendente_envio, _gravado, _dono, ...resto } = t;
        const reg = await this.store.saveSimulado(resto);
        await this.gravarRespostasBloco(resto, reg);
        this.local.remover?.(id);
        n++;
      } catch { break; }
    }
    return n;
  },

  async obterTentativa(id) {
    if (String(id).startsWith("loc-")) return this.local.obter(id);
    const lista = await this.listarTentativas();
    return lista.find((t) => t.id === id) || null;
  },

  go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  render: () => render()
};

let telaAtual = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [caminho] = h.split("?");
  const partes = caminho.split("/").filter(Boolean);
  return { rota: partes[0] || "", sub: partes.slice(1) };
}

async function render() {
  limparToasts();
  const alvo = $("[data-tela]");
  const { rota, sub } = parseHash();
  if (telaAtual?.destroy) telaAtual.destroy();
  telaAtual = null;
  const modal = $("[data-modal]");
  if (modal?.open) modal.close();
  let tela = telaInicio;
  if (rota === "bloco") tela = telaProva;
  else if (rota === "resultado" && sub[0]) tela = telaResultado;
  else if (rota === "completos") tela = telaCompletos;
  else if (rota === "dia" && sub[0]) tela = telaDia;
  else if (rota === "relatorio" && sub[0]) tela = telaRelatorio;
  telaAtual = tela;
  const completo = tela === telaCompletos || tela === telaDia || tela === telaRelatorio;
  document.title = (tela.titulo ? tela.titulo + " | " : "") + (completo ? "Simulados completos" : "Simulado de 30 minutos") + " | Road to America";
  $("[data-app-tag]")?.replaceChildren(completo ? "Simulado completo" : "Simulado");
  try {
    await tela.render(ctx, alvo, { sub });
  } catch (err) {
    console.error(err);
    document.body.classList.remove("em-prova");
    alvo.innerHTML = '<div class="wrap section-sm"><div class="vazio"><h1 class="h-sm">Algo deu errado nesta tela.</h1><p>' + e(err.message || String(err)) + '</p><p><a class="btn btn--ghost btn--sm" href="#/">Voltar ao início</a></p></div></div>';
  }
  if (!ctx._primeira) ctx._primeira = true;
  else if (tela !== telaProva && !tela.focoProprio) {
    const h = $("h1", alvo);
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0 });
  }
}

/* ---------- Tema ---------- */
$$("[data-theme-toggle]").forEach((b) => b.addEventListener("click", alternarTema));
rotularTema();

/* ---------- Conta ---------- */
function mostrarConta() {
  const el = $("[data-conta]");
  el.hidden = false;
  el.className = "conta" + (ctx.conta === "demo" ? " conta--demo" : "");
  if (ctx.conta === "demo") el.textContent = "Demonstração";
  else if (ctx.conta === "participante") { el.textContent = ctx.user.nome || ctx.user.email; el.title = ctx.user.email || ""; }
  else el.textContent = "Visitante";
}

async function carregarJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error("Não foi possível carregar " + url + " (" + r.status + ").");
  return r.json();
}

/* Bloco que estava aberto quando a página fechou: se o tempo acabou, encerra e grava */
async function retomarOuFechar() {
  const salvo = restaurarSessao(lerAndamento());
  if (!salvo) { apagarAndamento(); return null; }
  if (!salvo.ids.every((id) => ctx.porId.has(id))) { apagarAndamento(); return null; }
  if (ctx.deOutraConta(salvo)) {
    apagarAndamento();
    toast("Havia neste navegador um bloco aberto por outra conta. Ele foi descartado e não entrou na sua conta.", "aviso", 7000);
    return null;
  }
  if (!salvo.encerrada && !expirou(salvo)) return salvo;
  const jaEncerrado = salvo.encerrada;
  encerrar(salvo, Date.now(), "tempo");
  let r;
  try { r = await ctx.salvarTentativa(paraTentativa(salvo, ctx.porId)); }
  catch (err) { console.error(err); toast("Não foi possível gravar o bloco encerrado: " + (err.message || err), "erro", 8000); return null; }
  gravarNotas(r.registro.id, salvo.notas);
  apagarAndamento();
  toast(jaEncerrado ? "O bloco encerrado na última visita foi gravado." : "O tempo do bloco terminou enquanto a página estava fechada. O resultado foi gravado.", "info", 6000);
  return { encerrado: r.registro.id };
}

async function boot() {
  const bootEl = $("[data-boot]");
  try {
    const [b1, b2, labs, tax] = await Promise.all([
      carregarJson("data/step1-questoes.json"),
      carregarJson("data/step2ck-questoes.json"),
      carregarJson("data/valores-laboratoriais.json"),
      carregarJson("../anki/data/taxonomia.json").catch(() => null)
    ]);
    ctx.bancos = { step1: b1, step2ck: b2 };
    ctx.porId = new Map([...b1, ...b2].map((q) => [q.id, q]));
    ctx.labs = labs;
    aplicarTaxonomia(tax);

    if (usaSupabase) {
      ctx.store = new SupabaseStore({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey, vendorUrl: "../anki/vendor/supabase.umd.js" });
      try { ctx.user = await ctx.store.init(); }
      catch (err) { console.error(err); ctx.user = null; toast("Sem conexão com a conta agora. O simulado funciona e grava neste navegador.", "aviso", 6000); }
      ctx.store.onAuthChange?.((u) => { ctx.user = u; mostrarConta(); if (!["bloco", "dia"].includes(parseHash().rota)) render(); });
    } else {
      ctx.store = new LocalStore();
      ctx.user = await ctx.store.init();
    }
    mostrarConta();
    const n = await ctx.reenviarPendentes();
    if (n) toast(n === 1 ? "Uma tentativa que tinha ficado no navegador foi enviada para a sua conta." : n + " tentativas que tinham ficado no navegador foram enviadas para a sua conta.", "ok");
    const r = await retomarOuFechar();
    bootEl.remove();
    window.addEventListener("hashchange", render);
    if (r?.encerrado) { location.replace("#/resultado/" + r.encerrado); }
    else if (parseHash().rota === "bloco" && !r) { location.replace("#/"); }
    render();
  } catch (err) {
    console.error(err);
    bootEl.innerHTML = '<p class="eyebrow"><span class="fita" aria-hidden="true"></span>Simulado de 30 minutos</p><h1 class="display h3">Não foi possível abrir o simulado.</h1><p class="body">' + e(err.message || String(err)) + "</p>";
  }
}

boot();
export default ctx;
