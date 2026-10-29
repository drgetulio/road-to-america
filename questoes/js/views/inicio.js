/* Road to America | banco de questões: início (placas com a probabilidade de
   aprovação dos dois Steps, bloco em andamento, atalhos e últimos blocos) */
import { resumoAprovacao, resumoBlocos, estatisticasAluno, ROTULO_MODO } from "../../../plataforma/js/banco-aluno.js";
import { ITENS_FORMULARIO_OFICIAL } from "../../../plataforma/js/banco.js";
import { $, e, icon, toast } from "../../../anki/js/ui.js";
import { cabecalho, abas, NOME_STEP, pct, pctProb, plural, dataHoraBR, chipConfianca } from "../comum.js";
import { comecarBloco } from "../iniciar.js";

export function placaStep(r, st, { link = "#/aprovacao?step=" } = {}) {
  const est = r.est;
  const conf = est.confianca;
  const falta = conf.alta ? "" : conf.perto_do_limiar ? "Desempenho no limiar: mais itens quase não mudam a classificação." : conf.faltam_itens ? "Faltam cerca de " + plural(conf.faltam_itens, "item", "itens") + " para alta confiança." : conf.faltam_sistemas.length ? "Faltam itens em " + plural(conf.faltam_sistemas.length, "sistema", "sistemas") + " para alta confiança." : "";
  return '<article class="q-placa" aria-labelledby="pl-' + r.step + '">' +
    '<div class="q-placa__topo"><span class="exit-tab"><small>EXIT</small><b>' + (r.step === "step1" ? "S1" : "CK") + "</b></span>" +
      '<h2 class="q-placa__step" id="pl-' + r.step + '">' + NOME_STEP[r.step] + "</h2>" + chipConfianca(conf) + "</div>" +
    (est.n
      ? '<p class="q-placa__p"><b>' + pctProb(est.p_aprovacao) + "</b><span>" + (r.step === "step2ck" ? "de atingir o padrão de aprovação (218)" : "de estar acima do limiar de aprovação") + "</span></p>"
      : '<p class="q-placa__p q-placa__p--vazio"><b>Sem estimativa</b><span>Responda itens deste Step para começar.</span></p>') +
    '<dl class="q-placa__dados"><div><dt>Itens que contam</dt><dd>' + String(Math.round(est.n_efetivo * 10) / 10).replace(".", ",") + " <small>de " + conf.n_minimo + " mínimos</small></dd></div>" +
      "<div><dt>Acerto bruto</dt><dd>" + (est.n ? pct(est.taxa_bruta) : "sem dado") + "</dd></div>" +
      "<div><dt>Sistemas cobertos</dt><dd>" + est.cobertura.com_itens.length + " <small>de " + est.cobertura.total + "</small></dd></div></dl>" +
    (falta ? '<p class="q-placa__falta">' + e(falta) + "</p>" : "") +
    '<a class="btn btn--sign btn--sm" href="' + link + r.step + '">' + icon("gauge") + "Ver o painel do " + NOME_STEP[r.step] + "</a>" +
  "</article>";
}

export default {
  titulo: "",
  async render(ctx, el) {
    const [modelos, nbme, config] = await Promise.all([
      ctx.store.getModelosPsicometricos().catch(() => ({})),
      ctx.store.listNbme().catch(() => []),
      ctx.store.getConfigPlataforma().catch(() => undefined)
    ]);
    const rs = ["step1", "step2ck"].map((st) => resumoAprovacao({ banco: ctx.banco, respostas: ctx.respostas, step: st, modelos, nbme, config }));
    const blocos = resumoBlocos(ctx.respostas, ctx.banco.porId);
    const and = ctx.andamento();
    const st = ctx.step;
    const est = estatisticasAluno(ctx.banco, ctx.historico, st);
    const semBanco = !ctx.banco.itens.length;
    const origem = ctx.banco.origem === "supabase" ? "" : ctx.banco.origem === "demonstracao_completa"
      ? "Banco completo de desenvolvimento (banco-privado/), lido só neste computador."
      : "Modo demonstração: os 80 itens públicos (40 por Step). O banco completo fica no servidor e abre com a matrícula ativa.";

    el.innerHTML = '<div class="wrap section-sm q-pag" data-inicio>' +
      cabecalho({
        titulo: "Banco de questões",
        lead: "Itens no estilo NBME do Step 1 e do Step 2 CK, com explicação de cada alternativa. Monte blocos por sistema, disciplina e competência, no modo tutor ou cronometrado, e acompanhe a probabilidade de aprovação calculada a partir das suas respostas.",
        acoes: '<a class="btn btn--sm" href="#/criar">' + icon("plus-circle") + "Criar bloco</a>"
      }) +
      abas("") +
      (semBanco ? '<p class="alert alert--aviso">' + icon("warning") + "<span>O banco de questões ainda não está liberado para a sua conta. A equipe ativa a matrícula depois da confirmação da inscrição; os flashcards continuam disponíveis.</span></p>" : "") +
      (and ? '<section class="panel q-and" aria-labelledby="and-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="and-t">' + icon("hourglass-medium") + "Bloco em andamento</h2>" +
        '<a class="btn btn--sm" href="#/bloco">' + icon("play") + "Continuar</a></div>" +
        '<p class="hint">' + NOME_STEP[and.step] + ", " + plural(and.ids.length, "item", "itens") + ", modo " + ROTULO_MODO[and.modo].toLowerCase() + ", " + and.respostas.filter((x) => x !== null).length + " respondidos." +
        (and.modo === "cronometrado" ? " No modo cronometrado o relógio continua correndo com a página fechada, como na prova." : "") + "</p></section>" : "") +

      '<div class="q-placas">' + rs.map((r) => placaStep(r)).join("") + "</div>" +
      '<p class="q-nota">' + icon("info") + "<span>Probabilidade calculada pelo modelo de Rasch ancorado no padrão de Angoff do banco, com as suas primeiras respostas a cada item. Não é resultado oficial do USMLE nem do NBME; o critério principal para manter a data continua sendo a EXIT 18 (duas autoavaliações NBME seguidas com pelo menos 90%). " +
        '<a href="#/aprovacao">Como a estimativa é feita</a>.</span></p>' +

      '<div class="grid2 grid2--top">' +
        '<section class="panel" aria-labelledby="at-t"><div class="panel__head"><h2 class="h-sm" id="at-t">Começar agora</h2><p class="hint">Atalhos com o que mais se parece com a prova. O Step é o escolhido por último (' + NOME_STEP[st] + ").</p></div>" +
          '<div class="q-atalhos">' +
            '<button type="button" class="q-atalho" data-atalho="prova"' + (semBanco || and ? " disabled" : "") + ">" + icon("timer") + "<span><b>Bloco de prova</b><small>20 itens não vistos, cronometrado, 30 minutos</small></span></button>" +
            '<button type="button" class="q-atalho" data-atalho="erradas"' + (semBanco || and || !est.erradas ? " disabled" : "") + ">" + icon("arrow-counter-clockwise") + "<span><b>Refazer erradas</b><small>" + plural(Math.min(20, est.erradas), "item", "itens") + " no modo tutor</small></span></button>" +
            '<button type="button" class="q-atalho" data-atalho="marcadas"' + (semBanco || and || !est.marcados ? " disabled" : "") + ">" + icon("flag") + "<span><b>Rever marcadas</b><small>" + plural(Math.min(20, est.marcados), "item", "itens") + " no modo tutor</small></span></button>" +
          "</div>" +
        "</section>" +
        '<section class="panel" aria-labelledby="us-t"><div class="panel__head"><h2 class="h-sm" id="us-t">' + NOME_STEP[st] + ' no banco</h2></div>' +
          '<dl class="q-nums"><div><dt>Itens no banco</dt><dd>' + est.total + "</dd></div><div><dt>Vistos</dt><dd>" + est.vistos + "</dd></div><div><dt>Não vistos</dt><dd>" + est.nao_vistos + "</dd></div>" +
            "<div><dt>Certos na 1ª tentativa</dt><dd>" + (est.taxa_primeira === null ? "sem dado" : pct(est.taxa_primeira)) + "</dd></div><div><dt>Erradas</dt><dd>" + est.erradas + "</dd></div><div><dt>Marcadas</dt><dd>" + est.marcados + "</dd></div></dl>" +
          (ctx.banco.reduzido?.[st] ? '<p class="hint">Um formulário oficial completo tem até ' + ITENS_FORMULARIO_OFICIAL[st] + " itens; este banco tem " + est.total + ".</p>" : "") +
          (origem ? '<p class="hint">' + e(origem) + "</p>" : "") +
        "</section>" +
      "</div>" +

      '<section class="panel" aria-labelledby="ub-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="ub-t">Últimos blocos</h2><a class="link-btn" href="#/blocos">Todos os blocos</a></div>' +
        (blocos.length ? '<ul class="q-blocos">' + blocos.slice(0, 4).map((b) => linhaBloco(b)).join("") + "</ul>" : '<p class="body">Nenhum bloco feito ainda. Comece pelo bloco de prova acima ou monte um bloco por sistema.</p>') +
      "</section>" +
    "</div>";

    $("[data-inicio]", el).addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-atalho]");
      if (!b) return;
      const tipo = b.dataset.atalho;
      const pedido = tipo === "prova"
        ? { step: st, selecao: {}, situacao: "nao_vistas", n: 20, modo: "cronometrado", livre: false }
        : { step: st, selecao: {}, situacao: tipo, n: 20, modo: "tutor", livre: false };
      try { await comecarBloco(ctx, pedido); } catch (err) { toast(err.message, "erro"); }
    });
  }
};

export function linhaBloco(b) {
  return '<li class="q-bloco"><a href="#/resultado/' + encodeURIComponent(b.id) + '">' +
    '<span class="q-bloco__d">' + e(dataHoraBR(b.fim)) + "</span>" +
    "<b>" + NOME_STEP[b.step] + "</b>" +
    '<span class="q-bloco__m">' + ROTULO_MODO[b.modo] + " · " + plural(b.n, "item", "itens") + "</span>" +
    '<span class="q-bloco__n' + (b.esperado_limiar !== null && b.percentual < b.esperado_limiar ? " is-baixo" : "") + '">' + b.acertos + "/" + b.n + " (" + pct(b.percentual) + ")</span>" +
    '<span class="q-bloco__l">limiar ' + (b.esperado_limiar === null ? "sem dado" : pct(b.esperado_limiar)) + "</span>" +
    icon("caret-right") + "</a></li>";
}
