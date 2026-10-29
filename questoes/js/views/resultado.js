/* Road to America | banco de questões: resultado e revisão de um bloco.
   Acerto contra o examinando no limiar (média do Angoff dos mesmos itens), tempo
   contra o ritmo de 90 s, acerto por área e a revisão de cada item com a resposta
   dada, a correta e a explicação de cada alternativa. */
import { resumoBlocos, blocoPorArea, ROTULO_MODO, LIMITES_BLOCO } from "../../../plataforma/js/banco-aluno.js";
import { htmlTabelaItem } from "../../../simulado/js/interface-bloco.js";
import { $, $$, e, icon, toast } from "../../../anki/js/ui.js";
import { cabecalho, abas, NOME_STEP, pct, plural, dataHoraBR, segundos, minSeg, nome, ROTULO_DIM, barraLimiar } from "../comum.js";
import { htmlExplicacao, reportarItem } from "../explicacao.js";
import { lerPendentes } from "../local.js";
import { comecarComIds } from "../iniciar.js";

const FILTROS = [["todas", "Todas"], ["erradas", "Erradas"], ["certas", "Certas"], ["em_branco", "Em branco"], ["marcadas", "Marcadas"]];

export default {
  titulo: "Resultado do bloco",
  async render(ctx, el, { sub, params }) {
    let id = "";
    try { id = decodeURIComponent(sub[0] || ""); } catch { id = ""; }
    const todas = ctx.respostas.concat(lerPendentes(ctx.dono).flat());
    const b = resumoBlocos(todas, ctx.banco.porId).find((x) => x.id === id);
    if (!b) {
      el.innerHTML = '<div class="wrap section-sm"><div class="empty"><h1 class="display h3">Bloco não encontrado.</h1><p class="body">Ele pode ser de outra conta ou ainda não ter chegado ao servidor.</p><a class="btn btn--ghost" href="#/blocos">Ver meus blocos</a></div></div>';
      return;
    }
    let notas = new Map();
    try { notas = new Map((await ctx.store.listAnotacoesItem()).map((a) => [a.questao_id, a.texto])); } catch { /* sem anotações */ }
    const st = b.step;
    const ult = ctx._ultimoBloco?.id === id ? ctx._ultimoBloco : null;
    ctx._ultimoBloco = null;
    const medio = b.n ? b.tempo_ms / b.n : 0;
    const acima90 = b.itens.filter((x) => x.tempo_ms > LIMITES_BLOCO.ritmo_ms).length;
    const erradasIds = b.itens.filter((x) => !x.correta).map((x) => x.questao_id);
    const dims = st === "step1" ? [["sistema", "sistema"], ["disciplinas", "disciplinas"], ["competencia", "competencia"]] : [["sistema", "sistema"], ["disciplinas_oficiais", "disciplinas_oficiais"], ["competencia", "competencia"], ["area", "area"]];
    let filtro = FILTROS.some(([f]) => f === params.get("filtro")) ? params.get("filtro") : "todas";
    const abaixo = b.esperado_limiar !== null && b.percentual < b.esperado_limiar;

    el.innerHTML = '<div class="wrap section-sm q-pag res" data-res>' +
      cabecalho({ titulo: "Resultado do bloco", lead: NOME_STEP[st] + ", modo " + ROTULO_MODO[b.modo].toLowerCase() + ", encerrado em " + e(dataHoraBR(b.fim)) + "." }) +
      abas("blocos") +
      (ult?.porTempo ? '<p class="alert alert--aviso">' + icon("clock") + "<span>O tempo do bloco acabou e ele foi encerrado, como na prova. As questões sem resposta contam como erro, no bloco e na estimativa de aprovação.</span></p>" : "") +
      '<article class="embarque" aria-labelledby="res-t">' +
        '<div class="embarque__main">' +
          '<p class="embarque__top"><span>Bloco do banco</span><span>' + NOME_STEP[st] + " · " + ROTULO_MODO[b.modo] + "</span></p>" +
          '<h2 class="h-sm" id="res-t">' + b.acertos + " de " + b.n + (b.n === 1 ? " certa" : " certas") + "</h2>" +
          '<dl class="embarque__dados">' +
            "<div><dt>Seu acerto</dt><dd>" + pct(b.percentual) + "<small>" + (b.em_branco ? plural(b.em_branco, "em branco", "em branco") + " contam como erro" : "todas respondidas") + "</small></dd></div>" +
            "<div><dt>Examinando no limiar</dt><dd>" + (b.esperado_limiar === null ? "sem dado" : pct(b.esperado_limiar)) + "<small>média do Angoff destes itens</small></dd></div>" +
            "<div><dt>Tempo médio</dt><dd>" + segundos(medio) + "<small>ritmo da prova: 90 s; " + plural(acima90, "item acima", "itens acima") + "</small></dd></div>" +
            "<div><dt>Tempo total</dt><dd>" + minSeg(b.tempo_ms) + "<small>" + (b.modo === "cronometrado" ? "limite de " + minSeg(b.n * LIMITES_BLOCO.ritmo_ms) : "sem limite no tutor") + "</small></dd></div>" +
            "<div><dt>Marcadas</dt><dd>" + b.marcadas + "<small>para rever</small></dd></div>" +
            "<div><dt>Leitura</dt><dd>" + (b.esperado_limiar === null ? "sem dado" : abaixo ? "Abaixo do limiar" : "No limiar ou acima") + "<small>um bloco só não decide; veja o painel</small></dd></div>" +
          "</dl>" +
        "</div>" +
        '<div class="embarque__stub"><span>Acerto</span><b>' + Math.round(b.percentual * 100) + "</b><em>%</em></div>" +
      "</article>" +
      '<div class="acoes q-res-acoes">' +
        (erradasIds.length ? '<button type="button" class="btn btn--sm" data-refazer>' + icon("arrow-counter-clockwise") + "Refazer as " + plural(Math.min(40, erradasIds.length), "errada", "erradas") + " no modo tutor</button>" : "") +
        '<a class="btn btn--ghost btn--sm" href="#/criar?step=' + st + '">' + icon("plus-circle") + "Novo bloco</a>" +
        '<a class="btn btn--ghost btn--sm" href="#/aprovacao?step=' + st + '">' + icon("gauge") + "Probabilidade de aprovação</a>" +
      "</div>" +

      '<section class="panel" aria-labelledby="ar-t"><div class="panel__head"><h2 class="h-sm" id="ar-t">Acerto por área neste bloco</h2>' +
        '<p class="hint">A marca na barra é o acerto esperado do examinando no limiar nos mesmos itens. Com poucos itens por área, use como pista; o painel de aprovação junta todos os blocos.</p></div>' +
        '<div class="q-areas-grid">' + dims.map(([d, campo]) => {
          const linhas = blocoPorArea(b, ctx.banco.porId, campo);
          if (!linhas.length) return "";
          return '<div><h3 class="h-xs">' + e(ROTULO_DIM[st][d]) + '</h3><table class="q-tab"><thead><tr><th scope="col">' + e(ROTULO_DIM[st][d]) + '</th><th scope="col" class="num">Certas</th><th scope="col">Você e o limiar</th></tr></thead><tbody>' +
            linhas.map((a) => '<tr><th scope="row">' + e(nome(st, d, a.chave)) + '</th><td class="num">' + a.acertos + "/" + a.total + "</td><td>" + barraLimiar(a.taxa, a.esperado_limiar, "Você " + pct(a.taxa) + "; limiar " + pct(a.esperado_limiar)) + "</td></tr>").join("") +
            "</tbody></table></div>";
        }).join("") + "</div>" +
      "</section>" +

      '<section class="panel" aria-labelledby="rv-t"><div class="panel__head"><h2 class="h-sm" id="rv-t">Revisão questão por questão</h2></div>' +
        '<div class="filtros" role="group" aria-label="Filtrar questões" data-filtros></div>' +
        '<ol class="qrev" data-lista></ol>' +
      "</section>" +
    "</div>";

    const root = $("[data-res]", el);
    const passa = (x) => filtro === "todas" || (filtro === "erradas" && x.resposta !== null && !x.correta) || (filtro === "certas" && x.correta) || (filtro === "em_branco" && x.resposta === null) || (filtro === "marcadas" && x.marcada);
    const conta = (f) => b.itens.filter((x) => (f === "todas" ? true : f === "erradas" ? x.resposta !== null && !x.correta : f === "certas" ? x.correta : f === "em_branco" ? x.resposta === null : x.marcada)).length;
    function desenharLista() {
      $("[data-filtros]", root).innerHTML = FILTROS.map(([f, t]) => '<button type="button" class="filtro" data-filtro="' + f + '" aria-pressed="' + (filtro === f) + '">' + t + " (" + conta(f) + ")</button>").join("");
      const itens = b.itens.filter(passa);
      $("[data-lista]", root).innerHTML = itens.length ? itens.map((x) => {
        const q = ctx.banco.porId.get(x.questao_id);
        const estado = x.resposta === null ? "em_branco" : x.correta ? "certa" : "errada";
        const rot = { certa: "Certa", errada: "Errada", em_branco: "Em branco" }[estado];
        if (!q) return '<li><div class="vazio"><p>Questão ' + (x.posicao + 1) + " (" + e(x.questao_id) + ") não está mais no banco.</p></div></li>";
        return '<li><details data-q="' + e(q.id) + '"><summary>' +
          '<span class="qrev__n qrev__n--' + estado + '" aria-hidden="true">' + (x.posicao + 1) + "</span>" +
          '<span class="qrev__meta"><b>Questão ' + (x.posicao + 1) + ": " + rot + "</b><span>" + e(nome(st, "sistema", q.sistema)) + " · " + segundos(x.tempo_ms) + (x.marcada ? " · marcada" : "") + "</span></span>" +
          '<span class="qrev__chips">' + (x.resposta !== null ? '<span class="chip">sua: ' + e(x.resposta) + "</span>" : "") + '<span class="chip chip--ok">correta: ' + e(q.correta) + "</span></span></summary>" +
          '<div class="qrev__corpo">' +
            '<p class="texto-q" lang="en">' + e(q.vinheta) + "</p>" + htmlTabelaItem(q.tabela) +
            '<p class="texto-q texto-q--pergunta" lang="en">' + e(q.pergunta) + "</p>" +
            (Object.keys(q.explicacoes_alternativas || {}).length ? "" : '<ol class="alts-rev">' + q.alternativas.map((a) => '<li class="' + (a.letra === q.correta ? "is-correta" : "") + (a.letra === x.resposta ? " is-sua" : "") + '"><span class="letra">' + e(a.letra) + '.</span><span lang="en">' + e(a.texto) + "</span>" +
              (a.letra === q.correta ? '<span class="chip chip--ok">correta</span>' : a.letra === x.resposta ? '<span class="chip chip--erro">sua resposta</span>' : "<span></span>") + "</li>").join("") + "</ol>") +
            htmlExplicacao(q, x.resposta, { idBase: "r" + x.posicao, anotacao: notas.get(q.id) || "" }) +
          "</div></details></li>";
      }).join("") : '<li><div class="vazio"><p>Nenhuma questão neste filtro.</p></div></li>';
    }
    desenharLista();
    root.addEventListener("click", async (ev) => {
      const f = ev.target.closest("[data-filtro]");
      if (f) { filtro = f.dataset.filtro; desenharLista(); $('[data-filtro="' + filtro + '"]', root)?.focus(); return; }
      const rep = ev.target.closest("[data-reportar]");
      if (rep) { reportarItem(ctx, rep.dataset.reportar); return; }
      if (ev.target.closest("[data-refazer]")) {
        try { await comecarComIds(ctx, { step: st, ids: erradasIds, modo: "tutor" }); } catch (err) { toast(err.message, "erro"); }
      }
    });
  }
};
