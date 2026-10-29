/* Road to America | área administrativa: análise de itens do banco de questões
   Tabela de todos os itens de um Step com dificuldade (p), discriminação
   (ponto-bisserial corrigida e D), Angoff, b de Angoff e calibrado, ajuste ao
   Rasch, alertas e situação. Filtros e ordem ficam no endereço. */
import { $, e, icon, num } from "../../../anki/js/ui.js";
import { TAXONOMIA, nomeChave } from "../../../plataforma/js/banco.js";
import { MOTIVOS_REPORTE } from "../../../plataforma/js/registros.js";
import { analisarBanco, filtrarItens, ordenarItens, ROTULO_ALERTA, ALERTAS_REVISAR, ORDENS_ITEM, pctTxt, numTxt, LIMIARES_ITEM } from "../analise.js";
import { pageHead, tile, abasStep, avisoDemoBanco, avisoLgpd } from "./comum.js";
import { dataBR, plural } from "../../../plataforma/js/acompanhamento.js";

const FILTROS = ["q", "sistema", "disciplina", "competencia", "alerta", "situacao"];
const ORDENS = [["prioridade", "Prioridade de revisão"], ["id", "Identificador"], ["p", "Dificuldade (p)"], ["pbis", "Discriminação"], ["angoff", "Angoff"], ["b", "b em uso"], ["n", "Respostas"]];
const DIR_PADRAO = { prioridade: "desc", id: "asc", p: "asc", pbis: "asc", angoff: "asc", b: "desc", n: "desc" };
const POR_PAGINA = 100;
export const ROTULO_STATUS_ITEM = { ativo: "No banco", rascunho: "Rascunho", suspenso: "Retirado", aposentado: "Aposentado" };

function opcoes(lista, atual) {
  return lista.map(([v, r]) => '<option value="' + e(v) + '"' + (v === atual ? " selected" : "") + ">" + e(r) + "</option>").join("");
}
const dimDisciplina = (step) => (step === "step1" ? "disciplina" : "disciplina_oficial");

/* Cache da análise por Step: refeita quando ctx.invalidar() limpa o banco */
export async function analiseDoStep(ctx, step) {
  const banco = await ctx.bancoAdmin();
  if (ctx._analise?.banco === banco && ctx._analise.step === step) return ctx._analise.dados;
  const [matriz, reportes] = await Promise.all([ctx.store.listRespostasCalibracao({ step }), ctx.store.listReportes({ todos: true })]);
  const dados = analisarBanco({ banco, step, matriz, reportes });
  dados.reportes = reportes;
  dados.banco = banco;
  ctx._analise = { banco, step, dados };
  return dados;
}

export default {
  titulo: "Análise de itens",
  async render(ctx, el, { params }) {
    const step = params.get("step") === "step2ck" ? "step2ck" : "step1";
    el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Calculando a análise de itens...</p></div>';
    const an = await analiseDoStep(ctx, step);
    const r = an.resumo;
    const f = Object.fromEntries(FILTROS.map((k) => [k, params.get(k) || ""]));
    let ordem = ORDENS_ITEM.includes(params.get("ordem")) ? params.get("ordem") : "prioridade";
    let dir = params.get("dir") === "asc" || params.get("dir") === "desc" ? params.get("dir") : DIR_PADRAO[ordem];
    let pagina = 1;
    const tax = TAXONOMIA[step];
    const nomesDisc = tax[dimDisciplina(step)].chaves;
    const abertos = an.reportes.filter((x) => (x.status === "aberto" || x.status === "em_analise") && an.banco.porId.get(x.questao_id)?.step === step);

    el.innerHTML = '<div class="wrap section-sm">' +
      pageHead({
        eyebrow: "Banco de questões",
        titulo: "Análise de itens",
        lead: "Índices de cada item calculados com a primeira resposta de cada pessoa, sem o modo tutor, na versão atual do item. Os alertas seguem os limites do método (p abaixo de 0,20 ou acima de 0,95, discriminação negativa ou abaixo de 0,10, distrator mais escolhido que a correta pelos melhores, infit ou outfit fora de 0,7 a 1,3). Com menos de " + LIMIARES_ITEM.n_min + " respostas, os números ainda oscilam e aparecem como provisórios.",
        acoes: '<a class="btn btn--ghost btn--sm" href="#/calibracao?step=' + step + '">' + icon("gauge") + 'Recalibrar</a><a class="btn btn--ghost btn--sm" href="#/blueprint?step=' + step + '">' + icon("path") + "Blueprint</a>"
      }) +
      avisoDemoBanco(ctx) +
      abasStep("itens", step) +
      '<section class="tiles tiles--adm" aria-label="Resumo dos itens">' +
        tile({ rotulo: "Itens do Step", valor: num(r.total), sub: plural(r.fora_do_banco, "fora do banco", "fora do banco") + "; " + plural(r.em_revisao, "marcado para revisão", "marcados para revisão") + "." }) +
        tile({ rotulo: "Com " + LIMIARES_ITEM.n_min + " respostas ou mais", valor: num(r.confiaveis), sub: plural(r.com_dados, "item tem", "itens têm") + " alguma resposta; " + plural(r.pessoas || 0, "pessoa", "pessoas") + " e " + num(r.respostas || 0) + " respostas na matriz." }) +
        tile({ rotulo: "Pedem revisão", valor: num(r.a_revisar_confiaveis) + ' <small>de ' + num(r.a_revisar) + "</small>", sub: "Com amostra suficiente, de todos os que têm algum alerta de revisão.", estado: r.a_revisar_confiaveis ? "abaixo" : "ok", href: "#/itens?step=" + step + "&alerta=revisar" }) +
        tile({ rotulo: "Reportes de alunos", valor: num(abertos.length), sub: "Abertos ou em análise.", estado: abertos.length ? "abaixo" : "ok", href: "#/itens?step=" + step + "&situacao=reportes" }) +
        tile({ rotulo: "Calibrados com a turma", valor: num(r.calibrados), sub: "Os demais usam o b de Angoff.", href: "#/calibracao?step=" + step }) +
      "</section>" +
      (abertos.length ? '<section class="panel" aria-labelledby="rep-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="rep-t">Reportes de erro dos alunos</h2><a class="link-btn" href="#/itens?step=' + step + '&situacao=reportes">Ver os itens com reporte' + icon("arrow-right") + "</a></div>" +
        '<ul class="reps">' + abertos.slice(0, 5).map((x) => '<li class="rep"><div class="rep__top"><a class="rep__item" href="#/item/' + encodeURIComponent(x.questao_id) + '">' + e(x.questao_id) + '</a><span class="chip">' + e(MOTIVOS_REPORTE[x.motivo] || x.motivo) + "</span>" + (x.status === "em_analise" ? '<span class="gar gar--aviso">em análise</span>' : "") + (x.sintetico ? '<span class="selo-demo">dados de demonstração</span>' : "") + '<small class="muted">' + e(dataBR(x.criado_em)) + "</small></div>" +
          (x.texto ? '<p class="rep__txt">' + e(x.texto) + "</p>" : "") + "</li>").join("") + "</ul>" +
        (abertos.length > 5 ? '<p class="hint">Mais ' + plural(abertos.length - 5, "reporte", "reportes") + " na ficha de cada item.</p>" : "") + "</section>" : "") +
      '<form class="filters filters--itens" data-filtros role="search" aria-label="Filtrar itens" onsubmit="return false">' +
        '<div class="field filters__q"><label for="i-q">Buscar pelo identificador</label><div class="input-icon">' + icon("magnifying-glass") + '<input id="i-q" name="q" class="input" type="search" autocomplete="off" value="' + e(f.q) + '"></div></div>' +
        '<div class="field"><label for="i-sis">Sistema</label><select id="i-sis" name="sistema" class="input">' + opcoes([["", "Todos"]].concat(tax.sistema.chaves.map((c) => [c.chave, c.nome])), f.sistema) + "</select></div>" +
        '<div class="field"><label for="i-dis">' + (step === "step1" ? "Disciplina" : "Disciplina clínica") + '</label><select id="i-dis" name="disciplina" class="input">' + opcoes([["", "Todas"]].concat(nomesDisc.map((c) => [c.chave, c.nome])), f.disciplina) + "</select></div>" +
        '<div class="field"><label for="i-comp">' + (step === "step1" ? "Competência" : "Tarefa do médico") + '</label><select id="i-comp" name="competencia" class="input">' + opcoes([["", "Todas"]].concat(tax.competencia.chaves.map((c) => [c.chave, c.nome])), f.competencia) + "</select></div>" +
        '<div class="field"><label for="i-al">Alerta</label><select id="i-al" name="alerta" class="input">' + opcoes([["", "Todos os itens"], ["revisar", "Qualquer alerta de revisão"], ["nenhum", "Sem alerta (com respostas)"]].concat(Object.entries(ROTULO_ALERTA)), f.alerta) + "</select></div>" +
        '<div class="field"><label for="i-sit">Situação</label><select id="i-sit" name="situacao" class="input">' + opcoes([["", "Todas"], ["ativo", "No banco"], ["fora", "Fora do banco"], ["revisao", "Marcados para revisão"], ["reportes", "Com reporte aberto"], ["calibrado", "Calibrados"]], f.situacao) + "</select></div>" +
        '<div class="field filters__ord"><label for="i-ord">Ordenar por</label><select id="i-ord" name="ordem" class="input">' + opcoes(ORDENS, ordem) + "</select></div>" +
        '<div class="filters__acts"><button type="button" class="link-btn" data-limpar>' + icon("x") + "Limpar filtros</button></div>" +
      "</form>" +
      '<div class="list-head"><p class="list-head__n" data-contagem aria-live="polite"></p></div>' +
      '<div class="ptab-wrap"><table class="ptab itab"><caption class="sr-only">Itens do ' + (step === "step1" ? "Step 1" : "Step 2 CK") + ' e seus índices</caption><thead><tr>' +
        ["Item", "Respostas", "Dificuldade p", "Discriminação", "Angoff", "b em uso", "Ajuste ao Rasch", "Alertas", "Situação"].map((c) => '<th scope="col">' + c + "</th>").join("") +
      '</tr></thead><tbody data-corpo></tbody></table></div>' +
      '<p class="mais" data-mais-wrap hidden><button type="button" class="btn btn--ghost btn--sm" data-mais>Mostrar mais itens</button></p>' +
      '<p class="hint ptab-nota">Dificuldade p: proporção de acerto. Discriminação: ponto-bisserial corrigida (correlação entre acertar o item e o acerto da pessoa nos outros itens); D é a diferença de acerto entre os 27% melhores e os 27% piores. b em uso: dificuldade de Rasch na escala ancorada no limiar (0 = examinando no limiar acerta com a probabilidade de Angoff); calibrado quando houver, senão o de Angoff. Ajuste: infit e outfit, com a dificuldade estimada pelas respostas do próprio item, para medir a forma da curva e não o erro do Angoff; esperado perto de 1 (alerta fora de 0,7 a 1,3, com 30 respostas ou mais).</p>' +
      avisoLgpd("Os índices usam a matriz pseudonimizada de respostas: nenhuma tela de itens mostra quem respondeu o quê.") +
    "</div>";

    const form = $("[data-filtros]", el);
    const corpo = $("[data-corpo]", el);
    const sincronizar = () => {
      const p = new URLSearchParams({ step });
      for (const k of FILTROS) if (f[k]) p.set(k, f[k]);
      if (ordem !== "prioridade") p.set("ordem", ordem);
      if (dir !== DIR_PADRAO[ordem]) p.set("dir", dir);
      history.replaceState(null, "", "#/itens?" + p.toString());
    };
    const desenhar = () => {
      const lista = ordenarItens(filtrarItens(an.linhas, f), ordem, dir);
      const vis = lista.slice(0, pagina * POR_PAGINA);
      corpo.innerHTML = vis.length ? vis.map((l) => linhaHtml(l, step)).join("") : '<tr><td colspan="9" class="ptab__vazio">Nenhum item com esses filtros.</td></tr>';
      $("[data-contagem]", el).textContent = "Mostrando " + vis.length + " de " + plural(lista.length, "item filtrado", "itens filtrados") + " (" + an.linhas.length + " no Step).";
      $("[data-mais-wrap]", el).hidden = lista.length <= vis.length;
      sincronizar();
    };
    desenhar();
    form.addEventListener("input", (ev) => {
      const n = ev.target.name;
      if (n === "ordem") { ordem = ev.target.value; dir = DIR_PADRAO[ordem]; }
      else if (FILTROS.includes(n)) f[n] = String(ev.target.value).trim();
      pagina = 1;
      desenhar();
    });
    $("[data-limpar]", el).addEventListener("click", () => {
      for (const k of FILTROS) { f[k] = ""; if (form.elements[k]) form.elements[k].value = ""; }
      pagina = 1;
      desenhar();
      $("#i-q", el).focus();
    });
    $("[data-mais]", el).addEventListener("click", () => { pagina++; desenhar(); });
  }
};

function linhaHtml(l, step) {
  const prov = l.n && !l.confiavel;
  const v = (x, casas = 2) => (x === null || x === undefined ? '<span class="muted">sem dado</span>' : "<b" + (prov ? ' class="muted"' : "") + ">" + numTxt(x, casas) + "</b>");
  const alertas = l.alertas.map((c) => '<li class="' + (l.confiavel ? "is-alto" : "") + '">' + e(ROTULO_ALERTA[c] || c) + "</li>").join("");
  const sit = '<span class="gar gar--' + (l.status === "ativo" ? "ok" : "risco") + '">' + e(ROTULO_STATUS_ITEM[l.status] || l.status) + "</span>" +
    (l.em_revisao ? '<span class="gar gar--aviso">' + icon("flag") + "Em revisão</span>" : "") +
    (l.reportes ? '<span class="gar gar--risco">' + plural(l.reportes, "reporte", "reportes") + "</span>" : "") +
    (l.versao > 1 ? '<small>versão ' + l.versao + "</small>" : "");
  return '<tr class="ptab__tr' + (l.revisar && l.confiavel ? " ptab__tr--risco" : l.revisar || l.reportes ? " ptab__tr--atencao" : "") + '">' +
    '<th scope="row" data-label="Item"><a class="ptab__nome" href="#/item/' + encodeURIComponent(l.id) + '">' + e(l.id) + '</a><small class="ptab__sub">' + e(nomeChave(step, "sistema", l.sistema) || "sem sistema") + "</small></th>" +
    '<td data-label="Respostas"><b' + (prov ? ' class="muted"' : "") + ">" + num(l.n) + "</b>" + (prov ? "<small>provisório</small>" : "") + "</td>" +
    '<td data-label="Dificuldade p">' + (l.p === null ? '<span class="muted">sem respostas</span>' : "<b" + (prov ? ' class="muted"' : l.p < LIMIARES_ITEM.p_min || l.p > LIMIARES_ITEM.p_max ? ' class="is-risco"' : "") + ">" + numTxt(l.p, 2) + "</b><small>" + pctTxt(l.p) + " de acerto</small>") + "</td>" +
    '<td data-label="Discriminação">' + (l.pbis === null ? '<span class="muted">sem dado</span>' : "<b" + (prov ? ' class="muted"' : l.pbis < LIMIARES_ITEM.pbis_min ? ' class="is-risco"' : "") + ">" + numTxt(l.pbis, 2) + "</b>") + (l.d === null ? "" : "<small>D " + numTxt(l.d, 2) + "</small>") + "</td>" +
    '<td data-label="Angoff"><b>' + numTxt(l.angoff, 2) + "</b><small>b " + numTxt(l.b_angoff, 2) + "</small></td>" +
    '<td data-label="b em uso">' + (l.b_calibrado !== null ? "<b>" + numTxt(l.b_calibrado, 2) + "</b><small>calibrado" + (l.ep_calibrado !== null ? ", EP " + numTxt(l.ep_calibrado, 2) : "") + "</small>" : "<b>" + numTxt(l.b_angoff, 2) + "</b><small>Angoff</small>") + "</td>" +
    '<td data-label="Ajuste ao Rasch">' + (l.infit === null ? '<span class="muted">sem dado</span>' : v(l.infit) + "<small>outfit " + numTxt(l.outfit, 2) + "</small>") + "</td>" +
    '<td data-label="Alertas">' + (alertas ? '<ul class="ptab__motivos">' + alertas + "</ul>" : l.n ? '<span class="muted">nenhum</span>' : '<span class="muted">sem respostas</span>') + "</td>" +
    '<td data-label="Situação"><div class="itab__sit">' + sit + "</div></td>" +
  "</tr>";
}
export { ALERTAS_REVISAR };
