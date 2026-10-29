/* Road to America | área administrativa: blueprint e cobertura do banco
   Itens ativos por sistema, disciplina e competência (tarefa do médico no Step 2 CK)
   contra as faixas oficiais do outline do USMLE (TAXONOMIA em plataforma/js/banco.js),
   com o que um formulário completo pede de cada linha e quantos formulários sem
   repetição o banco sustenta. */
import { $, e, icon, num } from "../../../anki/js/ui.js";
import { FORMATO_OFICIAL } from "../../../plataforma/js/simulado.js";
import { montarFormularioFixo, verificarFormulario, FORMULARIOS_FIXOS } from "../../../plataforma/js/formularios.js";
import { plural } from "../../../plataforma/js/acompanhamento.js";
import { coberturaBlueprint, pctTxt, numTxt } from "../analise.js";
import { faixasBlueprint, tabela } from "../graficos.js";
import { pageHead, tile, abasStep, avisoLgpd } from "./comum.js";

const ROTULO_SIT = { dentro: "dentro", abaixo: "abaixo", acima: "acima", sem_faixa: "sem faixa" };

export default {
  titulo: "Blueprint e cobertura",
  async render(ctx, el, { params }) {
    const step = params.get("step") === "step2ck" ? "step2ck" : "step1";
    el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Contando os itens do banco...</p></div>';
    const banco = await ctx.bancoAdmin();
    const ativos = (banco.steps[step] || []).filter((q) => q.status === "ativo");
    const c = coberturaBlueprint(ativos, step);
    const exigidas = c.dims.filter((d) => d.exigida);
    const dentro = exigidas.reduce((s, d) => s + d.dentro, 0), comFaixa = exigidas.reduce((s, d) => s + d.com_faixa, 0);
    const fo = FORMATO_OFICIAL[step];
    const of = "Até " + fo.questoes_max + " itens em " + fo.blocos + " blocos de " + fo.minutos_por_bloco + " minutos, dia de " + fo.horas_sessao + " h (usmle.org, formato vigente desde " + fo.vigente_desde.split("-").reverse().join("/") + ").";

    el.innerHTML = '<div class="wrap section-sm">' +
      pageHead({
        eyebrow: "Banco de questões",
        titulo: "Blueprint e cobertura do banco",
        lead: "Itens ativos do banco contra as faixas oficiais do conteúdo do USMLE. Mostra se o banco sustenta formulários completos dentro das faixas e em que linhas faltam itens. A origem de cada faixa está no fim de cada seção."
      }) +
      abasStep("blueprint", step) +
      (banco.reduzido?.[step] ? '<p class="alert alert--aviso">' + icon("warning") + "<span>O banco carregado tem " + plural(c.total, "item ativo", "itens ativos") + " neste Step, menos que um formulário oficial (" + c.tamanho_formulario + " itens). " + (ctx.modo === "local" ? "No modo demonstração entram só os itens públicos; o banco completo é lido em <code>localhost</code> com <code>?banco=completo</code>." : "Importe os lotes com <code>tools/importar-banco.mjs</code>.") + "</span></p>" : "") +
      '<section class="tiles tiles--adm" aria-label="Resumo da cobertura">' +
        tile({ rotulo: "Itens ativos", valor: num(c.total), sub: plural((banco.steps[step] || []).length - c.total, "item fora do banco", "itens fora do banco") + " não entram na conta." }) +
        tile({ rotulo: "Formulário oficial", valor: num(c.tamanho_formulario), sub: e(of) }) +
        tile({ rotulo: "Formulários completos sem repetir item", valor: num(c.formularios_sem_repeticao), sub: "Limitado pelo total e pela linha mais escassa das faixas exigidas.", estado: c.formularios_sem_repeticao >= 3 ? "ok" : "abaixo" }) +
        tile({ rotulo: "Linhas dentro da faixa", valor: num(dentro) + " <small>de " + num(comFaixa) + "</small>", sub: "Sistemas e " + (step === "step1" ? "competências" : "tarefas do médico") + ", cuja faixa a montagem exige.", estado: dentro === comFaixa ? "ok" : "abaixo" }) +
        tile({ rotulo: "Dificuldade declarada", valor: c.por_dificuldade.map((x) => x.n).join(" · "), sub: "Fácil, média e difícil. Dificuldade-alvo média de " + numTxt(c.angoff_medio, 2) + ": o examinando no limiar acerta, em média, " + pctTxt(c.escore_corte_esperado) + " do banco." }) +
      "</section>" +
      c.dims.map((d) => secaoDim(d, step, c)).join("") +
      '<section class="panel" aria-labelledby="ff-t"><div class="panel__head"><h2 class="h-sm" id="ff-t">Formulários fixos do simulado completo</h2>' +
        '<p class="hint">Monta os formulários fixos A e B deste Step e confere cada um contra as faixas, como faz a tela do aluno. A e B dividem o banco sem repetir item; quando não sobra o bastante para um B completo, ele sai parcial, com o restante. Com o banco pequeno, os formulários saem reduzidos.</p></div>' +
        '<p class="acts-row"><button class="btn btn--sm" type="button" data-conferir>' + icon("list-checks") + "Conferir os formulários fixos</button></p><div data-ff-out aria-live=\"polite\"></div>" +
      "</section>" +
      avisoLgpd("Esta tela usa só os itens; nenhum dado de aluno.") +
    "</div>";

    $("[data-conferir]", el).addEventListener("click", (ev) => {
      ev.currentTarget.disabled = true;
      const out = $("[data-ff-out]", el);
      const linhas = FORMULARIOS_FIXOS[step].map((f) => {
        try {
          const form = montarFormularioFixo(banco, step, f.codigo, "completo");
          const v = verificarFormulario(form, banco.porId);
          return { codigo: f.codigo, nome: f.nome, total: form.total, blocos: form.blocos.length, reduzido: form.reduzido, parcial: !!form.parcial, gravado: form.origem_montagem === "gravado", corte: v.corte?.angoff_medio, ok: v.ok, problemas: v.problemas, avisos: v.avisos, motivo: form.motivo_reducao || form.motivo_parcial || "" };
        } catch (err) { return { codigo: f.codigo, nome: f.nome, erro: err.message }; }
      });
      out.innerHTML = '<ul class="sinais">' + linhas.map((l) => '<li class="sinal' + (l.erro || (!l.reduzido && !l.ok) ? " sinal--alto" : "") + '">' + icon(l.erro || !l.ok ? "warning-circle" : l.reduzido ? "info" : "check-circle") +
        "<div><b>" + e(l.nome) + " (" + e(l.codigo) + ")</b><p>" + (l.erro ? e(l.erro) : plural(l.total, "item", "itens") + " em " + plural(l.blocos, "bloco", "blocos") + ". " + (l.reduzido ? "Versão reduzida: " + e(l.motivo) : (l.parcial ? e(l.motivo) + " " : "") + (l.gravado ? "Composição gravada (formularios_fixos). " : "") + (Number.isFinite(l.corte) ? "Corte provisório pela média da dificuldade-alvo: " + pctTxt(l.corte, 1) + ". " : "") + (l.ok ? "Todas as faixas exigidas atendidas." : plural(l.problemas.length, "problema", "problemas") + ": " + e(l.problemas.slice(0, 3).join(" ")))) + (l.avisos?.length && !l.reduzido ? " " + plural(l.avisos.length, "aviso", "avisos") + " nas disciplinas com todos os rótulos." : "")) + "</p></div></li>").join("") + "</ul>";
      ev.currentTarget.disabled = false;
    });
  }
};

function secaoDim(d, step, c) {
  const idT = "bp-" + d.dim;
  const abaixo = d.linhas.filter((l) => l.situacao === "abaixo");
  return '<section class="panel" aria-labelledby="' + idT + '"><div class="panel__head"><h2 class="h-sm" id="' + idT + '">' + e(d.titulo) + "</h2>" +
    '<p class="hint">' + (d.exigida ? "Faixa exigida na montagem: o formulário completo precisa cair dentro dela." : "Um item pode contar em mais de uma linha, como no outline oficial (a soma passa de 100%); a faixa é alvo e não trava a montagem.") +
      (abaixo.length ? " Abaixo da faixa: " + e(abaixo.map((l) => l.nome + " (faltam " + l.faltam_para_faixa + ")").join("; ")) + "." : "") + "</p></div>" +
    '<p class="bp-legenda" aria-hidden="true"><span class="bp-legenda__faixa"></span>faixa oficial <span class="bp-legenda__fill"></span>proporção no banco</p>' +
    faixasBlueprint(d.linhas, { titulo: d.titulo + " do " + (step === "step1" ? "Step 1" : "Step 2 CK") + " contra as faixas oficiais" }) +
    tabela(d.titulo, ["Linha do outline", "Itens", "% do banco", "Faixa oficial", "Situação", "Itens por formulário completo", "Formulários que sustenta"],
      d.linhas.map((l) => [l.nome, String(l.n), pctTxt(l.pct, 1), l.faixa ? l.faixa[0] + " a " + l.faixa[1] + "%" : "sem faixa", ROTULO_SIT[l.situacao], l.pedido_formulario ? l.pedido_formulario[0] + " a " + l.pedido_formulario[1] : "", l.formularios === null ? "" : String(l.formularios)])) +
    (d.linhas.some((l) => l.nota) ? '<p class="hint">' + e(d.linhas.filter((l) => l.nota).map((l) => l.nome + ": " + l.nota).join(" ")) + "</p>" : "") +
    (d.fora_do_outline.length ? '<p class="hint">Fora do outline: ' + e(d.fora_do_outline.map((x) => x.chave + " (" + x.n + ")").join(", ")) + ".</p>" : "") +
    (d.gargalo && c.total ? '<p class="hint">Linha mais escassa: ' + e(d.gargalo.nome) + ", com " + plural(d.gargalo.n, "item", "itens") + " para " + d.gargalo.pedido_formulario[0] + " por formulário completo.</p>" : "") +
    '<p class="hint bp-fonte">Fonte: ' + e(d.fonte) + "</p>" +
  "</section>";
}
