/* Road to America | sessão de estudo (recuperação ativa + FSRS) */
import { Session, Rating, State } from "../scheduler.js";
import { canEdit } from "../permissions.js";
import { formatInterval, pct } from "../util.js";
import { $, $$, e, icon, toast, dialog } from "../ui.js";
import { montarFila, filtroDeParams, filtroVazio, cardPass, emptyState, sinalizar } from "./shared.js";

const BOTOES = [
  { r: Rating.Again, rot: "Errei", cls: "again", tecla: "1" },
  { r: Rating.Hard, rot: "Difícil", cls: "hard", tecla: "2" },
  { r: Rating.Good, rot: "Bom", cls: "good", tecla: "3" },
  { r: Rating.Easy, rot: "Fácil", cls: "easy", tecla: "4" }
];

let limpar = null;

export default {
  titulo: "Sessão de estudo",
  destroy() { if (limpar) limpar(); limpar = null; },
  async render(ctx, el, { params }) {
    const modo = params.get("modo") === "treino" ? "treino" : "agenda";
    const filtro = filtroDeParams(params);
    const n = Math.min(200, Math.max(5, Number(params.get("n")) || 50));
    const q = montarFila(ctx, { filtro, modo, limiteTreino: n });
    const sessao = new Session({ fila: q.fila, aprendendo: q.aprendendo, sched: ctx.sched, getState: (k) => ctx.states.get(k), modo, limiarLeech: ctx.settings.limiarLeech });
    const filtrada = !filtroVazio(filtro);

    if (!q.fila.length && !q.aprendendo.length) {
      el.innerHTML = '<div class="wrap section-sm">' + emptyState({
        titulo: filtrada ? "Nada vence hoje com este filtro." : "Nada para estudar agora.",
        texto: filtrada ? "No modo agenda só entram os cards que já venciam hoje. Para praticar este recorte sem alterar a agenda, use o treino livre." : "As revisões de hoje estão feitas. O FSRS já agendou as próximas; volte amanhã.",
        acoes: '<a class="btn btn--ghost" href="#/">Voltar ao painel</a>' + (modo === "agenda" ? '<a class="btn" href="#/estudar?' + e(new URLSearchParams([...params.entries(), ["modo", "treino"]]).toString()) + '">Treino livre</a>' : ""),
        icone: "check-circle"
      }) + "</div>";
      return;
    }

    el.innerHTML =
      '<div class="study" data-study>' +
        '<div class="study__bar"><div class="wrap study__bar-in">' +
          '<a class="icon-btn" href="#/" aria-label="Encerrar sessão" data-sair-sessao>' + icon("x") + "</a>" +
          '<div class="study__progress" role="progressbar" aria-label="Progresso da sessão" aria-valuemin="0" data-prog><span></span></div>' +
          '<p class="study__counts" data-counts></p>' +
        "</div></div>" +
        (modo === "treino" ? '<p class="wrap study__mode">' + icon("info") + "Treino livre: as respostas valem só para esta sessão e não mudam a agenda.</p>" : filtrada ? '<p class="wrap study__mode">' + icon("funnel") + "Sessão filtrada: só cards que já venciam hoje.</p>" : "") +
        '<h1 class="sr-only">Sessão de estudo</h1>' +
        '<div class="wrap study__tools" data-tools>' +
          '<button type="button" class="tool-btn" data-undo disabled>' + icon("arrow-counter-clockwise") + "<span>Desfazer</span><kbd>Z</kbd></button>" +
          '<button type="button" class="tool-btn" data-flag>' + icon("flag") + "<span>Sinalizar erro</span><kbd>S</kbd></button>" +
          '<button type="button" class="tool-btn" data-edit>' + icon("pencil-simple") + "<span>Editar</span><kbd>E</kbd></button>" +
          '<button type="button" class="tool-btn tool-btn--help" data-help>' + icon("keyboard") + "<span>Atalhos</span><kbd>?</kbd></button>" +
        "</div>" +
        '<div class="wrap study__stage" data-stage></div>' +
        '<div class="study__answer" data-answer></div>' +
        '<p class="sr-only" aria-live="polite" data-live></p>' +
      "</div>";

    const stage = $("[data-stage]", el);
    const answerBox = $("[data-answer]", el);
    const live = $("[data-live]", el);
    let revelado = false;
    let mostradoEm = Date.now();
    let espera = null;
    let ocupado = false;
    const resumo = { respostas: 0, acertos: 0, inicio: Date.now(), porNota: { 1: 0, 2: 0, 3: 0, 4: 0 } };
    const revlogIds = [];

    function atualizarBarra() {
      const rest = sessao.restantes();
      const total = Math.max(1, sessao.feitos + rest.novo + rest.aprendendo + rest.revisao + (sessao.atual ? 1 : 0));
      const prog = $("[data-prog]", el);
      prog.setAttribute("aria-valuemax", String(total));
      prog.setAttribute("aria-valuenow", String(sessao.feitos));
      prog.setAttribute("aria-valuetext", sessao.feitos + " de " + total + " respostas");
      $("span", prog).style.width = Math.round((sessao.feitos / total) * 100) + "%";
      const at = sessao.atual;
      const marca = (t) => (at && at.tipo === t ? " is-now" : "");
      $("[data-counts]", el).innerHTML =
        '<span class="cnt cnt--novo' + marca("novo") + '" title="Novos"><span class="sr-only">Novos: </span>' + (rest.novo + (at?.tipo === "novo" ? 1 : 0)) + "</span>" +
        '<span class="cnt cnt--apr' + marca("aprendendo") + '" title="Aprendendo"><span class="sr-only">Aprendendo: </span>' + (rest.aprendendo + (at?.tipo === "aprendendo" ? 1 : 0)) + "</span>" +
        '<span class="cnt cnt--rev' + marca("revisao") + '" title="Revisões"><span class="sr-only">Revisões: </span>' + (rest.revisao + (at?.tipo === "revisao" ? 1 : 0)) + "</span>";
      $("[data-undo]", el).disabled = !sessao.canUndo();
      const card = at ? ctx.cardMap.get(at.card_id) : null;
      $("[data-edit]", el).hidden = !(card && canEdit(card, ctx.user));
      $("[data-flag]", el).hidden = !card;
    }

    function mostrar(item, { focar = true } = {}) {
      const card = ctx.cardMap.get(item.card_id);
      if (!card) { proximo(); return; }
      revelado = false;
      mostradoEm = Date.now();
      const st = sessao.stateOf(item);
      stage.innerHTML = '<div class="stage-in" tabindex="-1" data-q aria-label="Pergunta">' + cardPass(ctx, card, item.ord, { lado: "frente", estado: st }) + "</div>";
      answerBox.innerHTML = '<div class="wrap"><button type="button" class="btn btn--block btn--reveal" data-reveal>Mostrar resposta <kbd>Espaço</kbd></button></div>';
      $("[data-reveal]", answerBox).addEventListener("click", revelar);
      atualizarBarra();
      if (focar) $("[data-q]", stage).focus({ preventScroll: true });
    }

    function revelar() {
      if (revelado || !sessao.atual) return;
      revelado = true;
      const card = ctx.cardMap.get(sessao.atual.card_id);
      const st = sessao.stateOf(sessao.atual);
      stage.innerHTML = '<div class="stage-in stage-in--rev" tabindex="-1" data-q aria-label="Resposta">' + cardPass(ctx, card, sessao.atual.ord, { lado: "verso", estado: st }) + "</div>";
      const prev = sessao.preview(new Date());
      answerBox.innerHTML = '<div class="wrap grades" role="group" aria-label="Como foi sua lembrança?">' +
        BOTOES.map((b) => '<button type="button" class="grade grade--' + b.cls + '" data-grade="' + b.r + '" aria-keyshortcuts="' + b.tecla + '">' +
          '<span class="grade__ivl">' + e(formatInterval(prev[b.r])) + "</span>" +
          '<span class="grade__lbl">' + e(b.rot) + "</span>" +
          '<kbd class="grade__key">' + b.tecla + "</kbd>" +
          '<span class="sr-only">, próxima revisão em ' + e(formatInterval(prev[b.r])) + "</span>" +
        "</button>").join("") +
        '</div><p class="wrap grades__hint">Difícil conta como acerto. Se esqueceu, aperte Errei: assim o FSRS ajusta o intervalo de verdade.</p>';
      $$("[data-grade]", answerBox).forEach((b) => b.addEventListener("click", () => responder(Number(b.dataset.grade))));
      $("[data-q]", stage).focus({ preventScroll: true });
      const ans = $(".pass-card__a", stage);
      if (ans && window.innerWidth < 760) ans.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }

    async function responder(rating) {
      if (!revelado || ocupado || !sessao.atual) return;
      ocupado = true;
      const agora = new Date();
      const dur = Math.min(120000, Date.now() - mostradoEm);
      const item = sessao.atual;
      const tinhaEstado = ctx.states.has(item.key);
      let res;
      try {
        res = sessao.answer(rating, agora);
      } catch (err) { ocupado = false; toast(err.message, "erro"); return; }
      resumo.respostas++;
      resumo.porNota[rating]++;
      if (rating > 1) resumo.acertos++;
      const snap = sessao.desfazer[sessao.desfazer.length - 1];
      snap.tinhaEstado = tinhaEstado;
      if (modo === "agenda") {
        try {
          ctx.states.set(item.key, res.state);
          await ctx.store.saveState(res.state);
          const entrada = { ...res.log, duracao_ms: dur };
          const id = await ctx.store.addRevlog(entrada);
          ctx.revlog.push({ ...entrada, id });
          snap.revlogId = id;
          revlogIds.push(id);
        } catch (err) {
          toast("Não foi possível salvar a resposta: " + err.message, "erro");
        }
      }
      live.textContent = BOTOES.find((b) => b.r === rating).rot + ". Próxima revisão em " + formatInterval(new Date(res.state.due) - agora) + ".";
      ocupado = false;
      if (res.leech && modo === "agenda") await avisarLeech(ctx.cardMap.get(item.card_id));
      proximo();
    }

    async function avisarLeech(card) {
      const podeEditar = canEdit(card, ctx.user);
      const r = await dialog({
        titulo: "Este card virou leech",
        corpo: "<p>Você errou este card " + ctx.settings.limiarLeech + " vezes. Ele foi suspenso e marcado como <b>leech</b> para não consumir mais tempo do que ensina.</p>" +
          "<p>O que mais resolve é reescrever: simplificar a pergunta, deixar uma única resposta, acrescentar um mnemônico ou separar dois fatos que se confundem. Se a confusão é com um card parecido, aprenda bem um antes de reativar o outro.</p>",
        acoes: [
          { rotulo: "Continuar a sessão", valor: "seguir", estilo: "ghost", cancelar: true },
          { rotulo: "Sinalizar à curadoria", valor: "sinalizar", estilo: "ghost", icone: "flag" },
          { rotulo: podeEditar ? "Reescrever agora" : "Criar minha versão", valor: "editar", icone: "pencil-simple" }
        ]
      });
      if (r?.acao === "editar") ctx.go(podeEditar ? "#/criar?id=" + encodeURIComponent(card.id) + "&voltar=estudar" : "#/criar?copiar=" + encodeURIComponent(card.id));
      else if (r?.acao === "sinalizar") await sinalizar(ctx, card, dialog, toast);
    }

    function proximo() {
      clearTimeout(espera);
      const r = sessao.next(new Date());
      if (r && r.espera) {
        const min = Math.max(1, Math.round((r.espera - new Date()) / 60000));
        stage.innerHTML = '<div class="stage-in" tabindex="-1" data-q>' + emptyState({
          titulo: "Próximo card em " + min + " min.",
          texto: "Restam só cards em aprendizagem, que precisam de alguns minutos de intervalo. Você pode esperar aqui ou encerrar; eles continuam valendo hoje.",
          acoes: '<button class="btn" type="button" data-agora>Mostrar agora</button><a class="btn btn--ghost" href="#/">Encerrar</a>',
          icone: "hourglass-medium"
        }) + "</div>";
        answerBox.innerHTML = "";
        $("[data-agora]", stage).addEventListener("click", () => {
          sessao.aprendendo.sort((a, b) => a.due - b.due);
          sessao.atual = sessao.aprendendo.shift();
          mostrar(sessao.atual);
        });
        $("[data-q]", stage).focus({ preventScroll: true });
        atualizarBarra();
        espera = setTimeout(proximo, 20000);
        return;
      }
      if (!r) { concluir(); return; }
      mostrar(r);
    }

    function concluir() {
      atualizarBarra();
      const minutos = Math.max(1, Math.round((Date.now() - resumo.inicio) / 60000));
      const taxa = resumo.respostas ? resumo.acertos / resumo.respostas : 0;
      answerBox.innerHTML = "";
      $("[data-tools]", el).hidden = true;
      stage.innerHTML = '<div class="stage-in" tabindex="-1" data-q>' +
        '<section class="done">' +
          '<div class="done__stamp" aria-hidden="true"><span>Sessão</span><b>OK</b><span>' + new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") + "</span></div>" +
          '<h2 class="display h2">Sessão concluída.</h2>' +
          '<dl class="done__stats">' +
            "<div><dt>Respostas</dt><dd>" + resumo.respostas + "</dd></div>" +
            "<div><dt>Lembradas</dt><dd>" + pct(taxa) + "</dd></div>" +
            "<div><dt>Tempo</dt><dd>" + minutos + " min</dd></div>" +
          "</dl>" +
          '<p class="body">' + (modo === "treino" ? "Treino livre não altera a agenda. As revisões de verdade continuam no painel." : "As respostas já estão salvas. Agora vale fazer questões no estilo da prova: os cards e as questões previram o escore no Step 1 cada um por conta própria (Deng et al., 2015).") + "</p>" +
          '<div class="empty__acts"><a class="btn" href="#/">Voltar ao painel</a><a class="btn btn--ghost" href="#/estatisticas">Ver estatísticas</a></div>' +
        "</section></div>";
      $("[data-q]", stage).focus({ preventScroll: true });
      live.textContent = "Sessão concluída.";
    }

    async function desfazer() {
      if (!sessao.canUndo() || ocupado) return;
      const snap = sessao.undo();
      resumo.respostas = Math.max(0, resumo.respostas - 1);
      if (modo === "agenda") {
        try {
          if (snap.tinhaEstado) { ctx.states.set(snap.item.key, snap.anterior); await ctx.store.saveState(snap.anterior); }
          else { ctx.states.delete(snap.item.key); await ctx.store.deleteState(snap.item.key); }
          if (snap.revlogId) {
            await ctx.store.deleteRevlog(snap.revlogId);
            ctx.revlog = ctx.revlog.filter((r) => r.id !== snap.revlogId);
          }
        } catch (err) { toast("Não foi possível desfazer: " + err.message, "erro"); }
      }
      $("[data-tools]", el).hidden = false;
      toast("Última resposta desfeita.", "info", 2200);
      mostrar(snap.item);
    }

    async function ajuda() {
      await dialog({
        titulo: "Atalhos de teclado",
        corpo: '<dl class="keys">' +
          "<div><dt><kbd>Espaço</kbd> ou <kbd>Enter</kbd></dt><dd>Mostrar resposta; com a resposta à vista, responde Bom</dd></div>" +
          "<div><dt><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></dt><dd>Errei, Difícil, Bom, Fácil</dd></div>" +
          "<div><dt><kbd>Z</kbd></dt><dd>Desfazer a última resposta</dd></div>" +
          "<div><dt><kbd>S</kbd></dt><dd>Sinalizar erro no card</dd></div>" +
          "<div><dt><kbd>E</kbd></dt><dd>Editar (cards que você pode editar)</dd></div>" +
          "<div><dt><kbd>Esc</kbd></dt><dd>Fechar janelas</dd></div>" +
        "</dl>"
      });
    }

    function onKey(ev) {
      if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const t = ev.target;
      if (t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
      const emBotao = t.closest && t.closest("button, a");
      const k = ev.key;
      if ((k === " " || k === "Enter") && !emBotao) {
        ev.preventDefault();
        if (!sessao.atual) return;
        if (!revelado) revelar(); else responder(Rating.Good);
        return;
      }
      if (/^[1-4]$/.test(k) && revelado) { ev.preventDefault(); responder(Number(k)); return; }
      const low = k.toLowerCase();
      if (low === "z") { ev.preventDefault(); desfazer(); }
      else if (low === "s" && sessao.atual) { ev.preventDefault(); $("[data-flag]", el).click(); }
      else if (low === "e" && sessao.atual && !$("[data-edit]", el).hidden) { ev.preventDefault(); $("[data-edit]", el).click(); }
      else if (k === "?") { ev.preventDefault(); ajuda(); }
    }

    $("[data-undo]", el).addEventListener("click", desfazer);
    $("[data-help]", el).addEventListener("click", ajuda);
    $("[data-flag]", el).addEventListener("click", () => {
      const c = sessao.atual && ctx.cardMap.get(sessao.atual.card_id);
      if (c) sinalizar(ctx, c, dialog, toast);
    });
    $("[data-edit]", el).addEventListener("click", () => {
      const c = sessao.atual && ctx.cardMap.get(sessao.atual.card_id);
      if (c) ctx.go("#/criar?id=" + encodeURIComponent(c.id) + "&voltar=estudar");
    });
    document.addEventListener("keydown", onKey);
    limpar = () => { document.removeEventListener("keydown", onKey); clearTimeout(espera); };

    proximo();
  }
};
