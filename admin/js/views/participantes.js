/* Road to America | área administrativa: tabela de participantes
   Filtros e ordem ficam no endereço (#/participantes?status=risco&ordem=nome),
   para que um indicador da visão da turma abra a lista já filtrada. */
import { $, e, icon, download, num } from "../../../anki/js/ui.js";
import { NOME_STEP, ROTULO_SITUACAO_GARANTIA, dataBR } from "../../../plataforma/js/acompanhamento.js";
import {
  filtrarLinhas, ordenarLinhas, csvParticipantes, textoUltimaAtividade, rotuloTurma,
  CHAVES_ORDEM, pct, plural, estBancoAtual
} from "../calculos.js";
import { pageHead, chipStatus, chipGarantia, seloDemo, avisoLgpd } from "./comum.js";
import { importarPresenca, botaoImportar } from "./acoes.js";

const FILTROS = ["q", "status", "step", "turma", "garantia", "inatividade"];
const COLUNAS = [
  { chave: "nome", rotulo: "Participante" },
  { chave: "risco", rotulo: "Situação" },
  { chave: "ultima", rotulo: "Última atividade" },
  { chave: "retencao", rotulo: "Retenção 30 dias" },
  { chave: "simulado", rotulo: "Simulados" },
  { chave: "nbme", rotulo: "NBME" },
  { chave: "banco", rotulo: "Banco" },
  { chave: "presenca", rotulo: "Presença" },
  { chave: "prova", rotulo: "Prova" },
  { chave: null, rotulo: "Garantia" }
];
/* sentido padrão ao clicar numa coluna pela primeira vez */
const ORDENS = [["risco", "Situação (risco primeiro)"], ["nome", "Nome"], ["ultima", "Última atividade"], ["sequencia", "Sequência de estudo"], ["retencao", "Retenção 30 dias"], ["simulado", "Simulados"], ["nbme", "NBME"], ["banco", "Probabilidade no banco"], ["presenca", "Presença"], ["prova", "Data da prova"]];
const DIR_PADRAO = { nome: "asc", risco: "desc", ultima: "asc", sequencia: "desc", retencao: "asc", simulado: "asc", nbme: "asc", banco: "asc", presenca: "asc", prova: "asc" };

function opcoes(lista, atual) {
  return lista.map(([v, r]) => '<option value="' + e(v) + '"' + (v === atual ? " selected" : "") + ">" + e(r) + "</option>").join("");
}

export default {
  titulo: "Participantes",
  async render(ctx, el, { params }) {
    el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Carregando participantes...</p></div>';
    const { rows, agora } = await ctx.dados();
    const cfg = ctx.config;
    const f = Object.fromEntries(FILTROS.map((k) => [k, params.get(k) || ""]));
    let ordem = CHAVES_ORDEM.includes(params.get("ordem")) ? params.get("ordem") : "risco";
    let dir = params.get("dir") === "asc" ? "asc" : params.get("dir") === "desc" ? "desc" : DIR_PADRAO[ordem];
    const turmas = [...new Set(rows.map((r) => r.turma))].sort().map((t) => [t, rotuloTurma(t)]);

    el.innerHTML = '<div class="wrap section-sm">' +
      pageHead({
        eyebrow: "Área administrativa",
        titulo: "Participantes",
        lead: "Ordenados por risco: quem tem mais critérios e de nível mais alto aparece primeiro. Cada sinal traz o motivo. Clique no nome para abrir a ficha.",
        acoes: botaoImportar()
      }) +
      '<form class="filters filters--adm" data-filtros role="search" aria-label="Filtrar participantes" onsubmit="return false">' +
        '<div class="field filters__q"><label for="f-q">Buscar por nome ou e-mail</label><div class="input-icon">' + icon("magnifying-glass") + '<input id="f-q" name="q" class="input" type="search" autocomplete="off" value="' + e(f.q) + '"></div></div>' +
        '<div class="field"><label for="f-status">Situação</label><select id="f-status" name="status" class="input">' + opcoes([["", "Todas"], ["risco", "Em risco"], ["atencao", "Atenção"], ["em_dia", "Em dia"]], f.status) + "</select></div>" +
        '<div class="field"><label for="f-step">Step em preparo</label><select id="f-step" name="step" class="input">' + opcoes([["", "Todos"], ["step1", "Step 1"], ["step2ck", "Step 2 CK"], ["concluido", "Os dois aprovados"]], f.step) + "</select></div>" +
        '<div class="field"><label for="f-turma">Turma</label><select id="f-turma" name="turma" class="input">' + opcoes([["", "Todas"]].concat(turmas), f.turma) + "</select></div>" +
        '<div class="field"><label for="f-garantia">Garantia</label><select id="f-garantia" name="garantia" class="input">' + opcoes([["", "Todas"]].concat(Object.entries(ROTULO_SITUACAO_GARANTIA)), f.garantia) + "</select></div>" +
        '<div class="field"><label for="f-inat">Inatividade</label><select id="f-inat" name="inatividade" class="input">' + opcoes([["", "Todas"], ["ativo", "Ativo (menos de " + cfg.dias_inatividade + " dias)"], ["7", cfg.dias_inatividade + " dias ou mais sem estudo"], ["14", 2 * cfg.dias_inatividade + " dias ou mais sem estudo"], ["nunca", "Nunca estudou"]], f.inatividade) + "</select></div>" +
        '<div class="field filters__ord"><label for="f-ordem">Ordenar por</label><select id="f-ordem" name="ordem" class="input">' + opcoes(ORDENS, ordem) + "</select></div>" +
        '<div class="filters__acts"><button type="button" class="link-btn" data-limpar>' + icon("x") + "Limpar filtros</button></div>" +
      "</form>" +
      '<div class="list-head"><p class="list-head__n" data-contagem aria-live="polite"></p>' +
        '<div class="list-head__acts"><label class="check check--inline"><input type="checkbox" data-com-email> Incluir e-mails no CSV</label>' +
        '<button type="button" class="btn btn--sm" data-csv>' + icon("download-simple") + "Exportar CSV</button></div></div>" +
      '<div class="ptab-wrap"><table class="ptab"><caption class="sr-only">Participantes e sinais de rendimento</caption><thead><tr data-cab></tr></thead><tbody data-corpo></tbody></table></div>' +
      '<p class="hint ptab-nota">Retenção em cinza: menos de ' + cfg.retencao_min_revisoes + " revisões em 30 dias, amostra pequena. Simulados: média das " + cfg.simulado_ultimos + " últimas tentativas do Step em preparo. NBME: lançadas do Step em preparo e a última probabilidade de aprovação informada. Banco: probabilidade de estar acima do limiar do banco no Step em preparo (padrão de Angoff, não oficial); em cinza, estimativa preliminar. Os e-mails não aparecem na lista; a busca os considera e a ficha mostra o contato.</p>" +
      avisoLgpd() +
    "</div>";

    const form = $("[data-filtros]", el);
    const corpo = $("[data-corpo]", el);
    const cab = $("[data-cab]", el);
    let visiveis = rows;

    const sincronizarUrl = () => {
      const p = new URLSearchParams();
      for (const k of FILTROS) if (f[k]) p.set(k, f[k]);
      if (ordem !== "risco") p.set("ordem", ordem);
      if (dir !== DIR_PADRAO[ordem]) p.set("dir", dir);
      const qs = p.toString();
      history.replaceState(null, "", "#/participantes" + (qs ? "?" + qs : ""));
    };

    const desenhar = () => {
      visiveis = ordenarLinhas(filtrarLinhas(rows, f, { config: cfg }), ordem, dir);
      cab.innerHTML = COLUNAS.map((c) => {
        if (!c.chave) return '<th scope="col">' + e(c.rotulo) + "</th>";
        const ativo = c.chave === ordem;
        return '<th scope="col"' + (ativo ? ' aria-sort="' + (dir === "asc" ? "ascending" : "descending") + '"' : "") + '><button type="button" class="ptab__sort" data-ordem="' + c.chave + '">' + e(c.rotulo) +
          (ativo ? icon(dir === "asc" ? "arrow-up" : "arrow-down") : '<span class="ptab__sort-i" aria-hidden="true"></span>') + "</button></th>";
      }).join("");
      corpo.innerHTML = visiveis.length ? visiveis.map((r) => linhaHtml(r, cfg)).join("") :
        '<tr><td colspan="' + COLUNAS.length + '" class="ptab__vazio">Nenhum participante com esses filtros.</td></tr>';
      $("[data-contagem]", el).textContent = "Mostrando " + visiveis.length + " de " + plural(rows.length, "participante", "participantes") + ".";
      $("#f-ordem", el).value = ordem;
      sincronizarUrl();
    };
    desenhar();

    form.addEventListener("input", (ev) => {
      const n = ev.target.name;
      if (n === "ordem") { ordem = ev.target.value; dir = DIR_PADRAO[ordem]; }
      else if (FILTROS.includes(n)) f[n] = ev.target.value.trim ? ev.target.value.trim() : ev.target.value;
      desenhar();
    });
    $("[data-limpar]", el).addEventListener("click", () => {
      for (const k of FILTROS) { f[k] = ""; const c = form.elements[k]; if (c) c.value = ""; }
      desenhar();
      $("#f-q", el).focus();
    });
    cab.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-ordem]");
      if (!b) return;
      const k = b.dataset.ordem;
      if (k === ordem) dir = dir === "asc" ? "desc" : "asc";
      else { ordem = k; dir = DIR_PADRAO[k]; }
      desenhar();
      $('[data-ordem="' + k + '"]', cab)?.focus();
    });
    $("[data-csv]", el).addEventListener("click", () => {
      const comEmail = $("[data-com-email]", el).checked;
      const hoje = agora.toISOString().slice(0, 10);
      download("rendimento-participantes-" + hoje + ".csv", csvParticipantes(visiveis, { incluirEmail: comEmail }), "text/csv;charset=utf-8");
    });
    $("[data-importar]", el).addEventListener("click", async () => {
      if (await importarPresenca(ctx)) ctx.render();
    });
  }
};

function linhaHtml(r, cfg) {
  const step = r.step === "concluido" ? "Os dois Steps aprovados" : NOME_STEP[r.step];
  const ret = r.retencao === null ? '<span class="muted">sem dados</span>'
    : '<b class="' + (r.retencao_confiavel ? (r.retencao < cfg.retencao_minima ? "is-risco" : "") : "muted") + '">' + pct(r.retencao, 1) + "</b><small>" + num(r.retencao_n) + " rev.</small>";
  const sim = r.simulado_media === null ? '<span class="muted">nenhum</span>'
    : '<b class="' + (r.simulado_media_n >= cfg.simulado_ultimos && r.simulado_media < cfg.simulado_minimo ? "is-risco" : "") + '">' + pct(r.simulado_media) + "</b><small>" + plural(r.simulado_n, "tentativa", "tentativas") + "</small>";
  const nb = r.step === "concluido" ? '<span class="muted">não se aplica</span>'
    : "<b>" + (r.nbme_n >= r.nbme_minimo ? plural(r.nbme_n, "lançada", "lançadas") : r.nbme_n + " de " + r.nbme_minimo) + "</b><small>" + (r.nbme_prob === null ? "sem probabilidade" : "última " + String(r.nbme_prob).replace(".", ",") + "%") + "</small>";
  const pres = r.presenca === null ? '<span class="muted">não lançada</span>'
    : '<b class="' + (r.presenca < cfg.presenca_minima ? "is-risco" : "") + '">' + pct(r.presenca) + "</b><small>" + e(r.presenca_txt) + " aulas</small>";
  const prova = !r.prova ? '<span class="muted">sem data</span>'
    : "<b>" + e(dataBR(r.prova)) + "</b><small>" + (r.dias_prova < 0 ? "há " + plural(-r.dias_prova, "dia", "dias") : r.dias_prova === 0 ? "hoje" : "em " + plural(r.dias_prova, "dia", "dias")) + "</small>";
  const inat = r.riscos.some((x) => x.codigo === "inatividade");
  return '<tr class="ptab__tr ptab__tr--' + r.status + '">' +
    '<th scope="row" data-label="Participante"><a class="ptab__nome" href="#/p/' + encodeURIComponent(r.id) + '">' + e(r.nome) + "</a>" + (r.sintetico ? '<span class="ptab__demo">' + seloDemo(true) + "</span>" : "") + '<small class="ptab__sub">' + e(step) + " · " + e(rotuloTurma(r.turma)) + "</small></th>" +
    '<td data-label="Situação">' + chipStatus(r.status) + (r.riscos.length ? '<ul class="ptab__motivos">' + r.riscos.map((x) => '<li class="' + (x.nivel === "alto" ? "is-alto" : "") + '">' + e(x.titulo) + (x.nivel === "alto" ? " (alto)" : "") + "</li>").join("") + "</ul>" : "") + "</td>" +
    '<td data-label="Última atividade"><b class="' + (inat ? "is-risco" : "") + '">' + e(textoUltimaAtividade(r)) + "</b><small>sequência de " + plural(r.sequencia, "dia", "dias") + "</small></td>" +
    '<td data-label="Retenção 30 dias">' + ret + "</td>" +
    '<td data-label="Simulados">' + sim + "</td>" +
    '<td data-label="NBME">' + nb + "</td>" +
    '<td data-label="Banco">' + bancoHtml(r) + "</td>" +
    '<td data-label="Presença">' + pres + "</td>" +
    '<td data-label="Prova">' + prova + "</td>" +
    '<td data-label="Garantia">' + chipGarantia(r.garantia) + "</td>" +
  "</tr>";
}


function bancoHtml(r) {
  const x = estBancoAtual(r);
  if (!x) return '<span class="muted">' + (r.banco ? "sem respostas" : "indisponível") + "</span>";
  const baixo = x.confianca?.alta && x.p_aprovacao <= 0.1;
  const p = Math.round(x.p_aprovacao * 100);
  return "<b" + (baixo ? ' class="is-risco"' : x.confianca?.alta ? "" : ' class="muted"') + ">" + (p < 1 && x.p_aprovacao > 0 ? "&lt;1" : p > 99 && x.p_aprovacao < 1 ? "&gt;99" : p) + "%</b><small>" + (x.confianca?.alta ? "alta confiança" : "preliminar") + ", " + Math.round(x.n_efetivo) + " itens</small>";
}
