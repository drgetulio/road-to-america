/* Road to America | painel do dia (tela inicial do app) */
import { montarFila, estimativaMin, pageHead, emptyState } from "./shared.js";
import { activity, retention, forecast } from "../stats.js";
import { isStudyable } from "../cards.js";
import { dayStart, pct } from "../util.js";
import { e, icon, optionList, num } from "../ui.js";

export default {
  titulo: "Estudar",
  async render(ctx, el) {
    const now = new Date();
    const q = montarFila(ctx, { now });
    const c = q.contagem;
    const totalHoje = c.novo + c.revisao + c.aprendendo;
    const min = estimativaMin(c, ctx.revlog);
    const ativ = activity(ctx.revlog, { now });
    const ret = retention(ctx.revlog, { dias: 30, now });
    const prev = forecast([...ctx.states.values()], { dias: 7, now });
    const estudaveis = ctx.cards.filter((x) => isStudyable(x, ctx.user.id));
    const hojeTxt = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    const feitasHoje = ctx.revlogHoje(now).length;

    let prova = "";
    if (ctx.settings.dataProva) {
      const dias = Math.ceil((new Date(ctx.settings.dataProva + "T08:00:00") - dayStart(now)) / 86400000);
      prova = dias >= 0 ? (dias === 0 ? "É hoje" : "Faltam " + num(dias) + (dias === 1 ? " dia" : " dias")) : "Prova realizada";
    }

    const alertas = [];
    if (q.atraso > 0) alertas.push(["aviso", "warning", "Há " + num(q.atraso) + " revisões além do seu limite diário. Para o atraso não crescer, os cards novos ficam pausados até ele baixar.", '<a href="#/ajustes">Rever limites</a>']);
    const leeches = [...ctx.states.values()].filter((s) => s.leech && s.suspenso).length;
    if (leeches) alertas.push(["aviso", "warning-circle", num(leeches) + (leeches === 1 ? " card foi suspenso" : " cards foram suspensos") + " depois de 8 erros (leech). Reescrever costuma resolver mais rápido que insistir.", '<a href="#/cards?filtro=leech">Ver leeches</a>']);
    const rejeitados = ctx.cards.filter((x) => x.autor_id === ctx.user.id && x.status === "rejeitado").length;
    if (rejeitados) alertas.push(["info", "chat-text", num(rejeitados) + (rejeitados === 1 ? " card seu voltou" : " cards seus voltaram") + " da curadoria com comentário.", '<a href="#/cards?meus=1&amp;status=rejeitado">Ver comentários</a>']);
    if (ctx.admin) {
      const fila = ctx.cards.filter((x) => x.status === "em_revisao").length;
      if (fila) alertas.push(["info", "seal-check", num(fila) + (fila === 1 ? " card aguarda" : " cards aguardam") + " revisão da curadoria.", '<a href="#/curadoria">Abrir fila</a>']);
    }
    if (Array.isArray(ctx.settings.sistemasLiberados) && ctx.settings.sistemasLiberados.length < ctx.tax.sistemas.length) {
      alertas.push(["info", "lock-simple", "Cards novos liberados em " + ctx.settings.sistemasLiberados.length + " de " + ctx.tax.sistemas.length + " sistemas. Libere cada sistema depois da aula ou da leitura da apostila.", '<a href="#/ajustes#liberados">Ajustar</a>']);
    }

    const sinal = totalHoje
      ? '<dl class="highway__counts">' +
          '<div class="k-rev"><dt>Revisões</dt><dd>' + num(c.revisao) + "</dd></div>" +
          '<div class="k-novo"><dt>Novos</dt><dd>' + num(c.novo) + "</dd></div>" +
          '<div class="k-apr"><dt>Aprendendo</dt><dd>' + num(c.aprendendo) + "</dd></div>" +
        "</dl>" +
        '<p class="highway__est">' + icon("clock") + "Cerca de " + num(min) + " min, pelo seu ritmo." + (feitasHoje ? " Você já respondeu " + num(feitasHoje) + " hoje." : "") + "</p>" +
        '<a class="btn btn--sign" href="#/estudar" data-comecar>' + "Começar sessão " + icon("arrow-right") + "</a>"
      : '<p class="highway__done">' + (estudaveis.length ? "Tudo em dia por hoje." : "Ainda não há cards para estudar.") + "</p>" +
        '<p class="highway__est">' + (estudaveis.length ? (prev[1] ? "Amanhã vencem " + num(prev[1]) + " revisões." : "Nada vence amanhã.") + " Os intervalos já foram calculados pelo FSRS; para praticar sem mexer na agenda, use o treino livre." : "Os cards oficiais aparecem aqui quando forem publicados. Enquanto isso, crie os seus.") + "</p>" +
        (estudaveis.length ? '<a class="btn btn--sign" href="#/estudar?modo=treino">Treino livre ' + icon("arrow-right") + "</a>" : '<a class="btn btn--sign" href="#/criar">Criar card ' + icon("plus") + "</a>");

    el.innerHTML =
      '<div class="wrap section-sm">' +
      pageHead({ eyebrow: "USMLE Step 1 · " + hojeTxt, titulo: "Sua sessão de hoje", lead: "Revisões que vencem hoje e cards novos, misturados entre sistemas como na prova." }) +
      '<div class="painel">' +
        '<section class="highway" aria-labelledby="hw-t">' +
          '<div class="highway__top"><span class="highway__route">' + icon("path") + "Rota do dia</span>" +
            '<span class="exit-tab" aria-hidden="true"><small>EXIT</small><b>S1</b></span></div>' +
          '<h2 class="highway__title" id="hw-t">Step 1</h2>' + sinal +
        "</section>" +
        '<aside class="boarding" aria-label="Seu cartão de embarque">' +
          '<div class="boarding__main">' +
            '<p class="boarding__top"><span>Cartão de embarque</span><span>R2A</span></p>' +
            '<p class="boarding__name">' + e(ctx.user.nome || "Participante") + "</p>" +
            '<dl class="boarding__data">' +
              "<div><dt>Destino</dt><dd>USMLE Step 1</dd></div>" +
              "<div><dt>Prova</dt><dd>" + (prova ? e(prova) : '<a href="#/ajustes#prova">Definir data</a>') + "</dd></div>" +
              "<div><dt>Sequência</dt><dd>" + num(ativ.atual) + (ativ.atual === 1 ? " dia" : " dias") + "</dd></div>" +
              "<div><dt>Retenção (30 d)</dt><dd>" + (ret.taxa == null ? "Sem dados" : pct(ret.taxa)) + " <small>meta " + pct(ctx.settings.retencao) + "</small></dd></div>" +
            "</dl>" +
            semana(prev, now) +
            '<p class="boarding__code" aria-hidden="true"><span class="barcode"></span><span>R2A · ' + e(codigo(ctx.user.id)) + " · STEP 1</span></p>" +
          "</div>" +
          '<div class="boarding__stub"><span>Cards</span><b>' + num(estudaveis.length) + "</b><span>no baralho</span></div>" +
        "</aside>" +
      "</div>" +
      (alertas.length ? '<ul class="alerts">' + alertas.map(([t, ic, txt, link]) => '<li class="alert alert--' + t + '">' + icon(ic) + "<span>" + e(txt) + " " + link + "</span></li>").join("") + "</ul>" : "") +
      sessaoPersonalizada(ctx) +
      "</div>";

    const form = el.querySelector("[data-custom]");
    form?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const d = new FormData(form);
      const p = new URLSearchParams();
      const sis = d.getAll("sistema").filter(Boolean);
      if (sis.length) p.set("sistema", sis.join(","));
      if (d.get("disciplina")) p.set("disciplina", d.get("disciplina"));
      if (d.get("tag")) p.set("tag", String(d.get("tag")).trim().toLowerCase().replace(/\s+/g, "_"));
      if (d.get("modo") === "treino") { p.set("modo", "treino"); p.set("n", d.get("n") || "30"); }
      ctx.go("#/estudar?" + p.toString());
    });
    const modo = form?.querySelectorAll("input[name=modo]");
    const nWrap = form?.querySelector("[data-n]");
    modo?.forEach((r) => r.addEventListener("change", () => { nWrap.hidden = form.querySelector("input[name=modo]:checked").value !== "treino"; }));
  }
};

/* Código curto e estável derivado do id do usuário, só decorativo */
function codigo(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36).toUpperCase().slice(0, 6).padStart(6, "0");
}

/* Próximos 7 dias, em barras pequenas dentro do cartão de embarque */
function semana(prev, now) {
  const max = Math.max(1, ...prev);
  const dias = prev.map((n, i) => {
    const d = new Date(now.getTime() + i * 86400000);
    const rot = i === 0 ? "hoje" : d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").slice(0, 3);
    return '<li><span class="wk__bar"><span style="height:' + Math.round((n / max) * 100) + '%"></span></span><span class="wk__n">' + n + '</span><span class="wk__d">' + e(rot) + "</span></li>";
  }).join("");
  return '<div class="wk"><p class="wk__t">Revisões nos próximos 7 dias</p><ol class="wk__list" aria-label="Revisões previstas por dia">' + dias + "</ol></div>";
}

function sessaoPersonalizada(ctx) {
  const tags = [...new Set(ctx.cards.flatMap((c) => c.tags))].filter((t) => t !== "step1").sort();
  return '<details class="panel custom">' +
    '<summary class="custom__sum"><span class="custom__sum-t"><span class="display h3">Sessão personalizada</span>' +
    '<span class="hint">Filtre por sistema, disciplina ou tema. No modo agenda, entram só os cards que já venciam hoje, então a programação não muda.</span></span>' + icon("caret-down") + "</summary>" +
    '<form data-custom class="custom__form">' +
      '<fieldset class="field custom__sis"><legend>Sistemas</legend><div class="checks">' +
        ctx.tax.sistemas.map((s) => '<label class="check"><input type="checkbox" name="sistema" value="' + e(s.chave) + '"><span>' + e(s.nome_curto || s.nome_pt) + "</span></label>").join("") +
      "</div></fieldset>" +
      '<div class="custom__row">' +
        '<div class="field"><label for="cs-dis">Disciplina</label><select id="cs-dis" name="disciplina" class="input">' + optionList(ctx.tax.disciplinas.filter((d) => !d.agrupar_em), "", { vazio: "Todas" }) + "</select></div>" +
        '<div class="field"><label for="cs-tag">Tag</label><input id="cs-tag" name="tag" class="input" list="cs-tags" placeholder="ex.: diureticos" autocomplete="off"><datalist id="cs-tags">' + tags.map((t) => '<option value="' + e(t) + '">').join("") + "</datalist></div>" +
      "</div>" +
      '<fieldset class="field"><legend>Modo</legend><div class="radios radios--row">' +
        '<label class="radio"><input type="radio" name="modo" value="agenda" checked><span><b>Agenda</b> · só o que vence hoje, com registro normal</span></label>' +
        '<label class="radio"><input type="radio" name="modo" value="treino"><span><b>Treino livre</b> · qualquer card do filtro, sem mexer na agenda</span></label>' +
      "</div></fieldset>" +
      '<div class="field" data-n hidden><label for="cs-n">Quantidade de cards no treino</label><input id="cs-n" name="n" type="number" min="5" max="200" value="30" class="input input--short"></div>' +
      '<button class="btn" type="submit">' + icon("funnel") + "Começar sessão filtrada</button>" +
    "</form></details>";
}
