/* Road to America | banco de questões: histórico de blocos */
import { resumoBlocos } from "../../../plataforma/js/banco-aluno.js";
import { $, e, icon } from "../../../anki/js/ui.js";
import { cabecalho, abas, NOME_STEP, plural } from "../comum.js";
import { lerPendentes } from "../local.js";
import { linhaBloco } from "./inicio.js";

export default {
  titulo: "Meus blocos",
  async render(ctx, el, { params }) {
    const pend = lerPendentes(ctx.dono).flat();
    const todos = resumoBlocos(ctx.respostas.concat(pend), ctx.banco.porId);
    const idsPend = new Set(pend.map((r) => r.sessao_id));
    let step = ["step1", "step2ck"].includes(params.get("step")) ? params.get("step") : "todos";
    const desenhar = () => {
      const lista = todos.filter((b) => step === "todos" || b.step === step);
      $("[data-lista]", el).innerHTML = lista.length
        ? '<ul class="q-blocos">' + lista.map((b) => linhaBloco(b).replace("</a></li>", (idsPend.has(b.id) ? '<span class="prog-chip prog-chip--aviso">só neste navegador</span>' : "") + "</a></li>")).join("") + "</ul>"
        : '<p class="body">Nenhum bloco ' + (step === "todos" ? "" : "do " + NOME_STEP[step] + " ") + "ainda.</p>";
      $("[data-conta]", el).textContent = plural(lista.length, "bloco", "blocos") + ", " + plural(lista.reduce((s, b) => s + b.n, 0), "item", "itens") + ".";
    };
    el.innerHTML = '<div class="wrap section-sm q-pag" data-blocos>' +
      cabecalho({ titulo: "Meus blocos", lead: "Todos os blocos do banco, do mais recente para o mais antigo. Abra um bloco para ver o resultado e revisar cada questão com a explicação.", acoes: '<a class="btn btn--sm" href="#/criar">' + icon("plus-circle") + "Criar bloco</a>" }) +
      abas("blocos") +
      '<section class="panel"><div class="panel__head panel__head--row"><div class="filtros" role="group" aria-label="Filtrar por Step">' +
        [["todos", "Todos"], ["step1", "Step 1"], ["step2ck", "Step 2 CK"]].map(([v, t]) => '<button type="button" class="filtro" data-step="' + v + '" aria-pressed="' + (step === v) + '">' + e(t) + "</button>").join("") +
        '</div><p class="hint" data-conta role="status"></p></div><div data-lista></div></section>' +
    "</div>";
    desenhar();
    $("[data-blocos]", el).addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-step]");
      if (!b) return;
      step = b.dataset.step;
      el.querySelectorAll("[data-step]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.step === step)));
      desenhar();
    });
  }
};
