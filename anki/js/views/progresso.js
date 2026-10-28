/* Road to America | Meu progresso: checklist da garantia, prontidão (EXIT 18),
   datas de prova, autoavaliações NBME e simulados do próprio participante.
   Regras em plataforma/js/desempenho.js; textos em plataforma/js/acompanhamento.js. */
import { avaliarParticipante, validarNbme } from "../../../plataforma/js/desempenho.js";
import { desempenhoPorArea, SIMULADO_30 } from "../../../plataforma/js/simulado.js";
import { checklistGarantia, leituraProntidao, nomeArea, NOME_STEP, ROTULO_PRONTIDAO, dataBR, pct, plural } from "../../../plataforma/js/acompanhamento.js";
import { $, e, icon, toast, confirmar } from "../ui.js";
import { pageHead } from "./shared.js";

const ROTULO_MODO = { standard: "standard-paced", self: "self-paced", desconhecido: "não sei" };
const CLASSE_PR = { pronto: "ok", aprovado: "ok", nao_pronto: "risco", insuficiente: "neutro" };

export default {
  titulo: "Meu progresso",
  async render(ctx, el, args = {}) {
    const agora = new Date();
    const [linha, config, nbme, simulados] = await Promise.all([
      ctx.store.getMeuResumo({ agora }),
      ctx.store.getConfigPlataforma(),
      ctx.store.listNbme(),
      ctx.store.listSimulados()
    ]);
    const av = avaliarParticipante(linha, { config, agora });
    const check = checklistGarantia(linha, av, { config, participante: true });
    const plano = linha.plano || {};
    const stepsPend = ["step1", "step2ck"].filter((s) => !plano[s + "_aprovado"]);
    const editando = args.editar ? nbme.find((x) => x.id === args.editar && !x.verificada) : null;
    const hoje = agora.toISOString().slice(0, 10);

    el.innerHTML = '<div class="wrap section-sm prog" data-prog>' +
      pageHead({
        eyebrow: "Área do aluno",
        titulo: "Meu progresso",
        lead: "O caminho até as condições da garantia, o critério da Road to America para manter a data da prova e o registro das suas autoavaliações e simulados.",
        acoes: '<a class="btn btn--sm" href="../simulado/">' + icon("clock") + "Fazer um simulado de 30 minutos</a>"
      }) +

      '<div class="grid2 grid2--top">' +
        '<section class="panel" aria-labelledby="g-t"><div class="panel__head"><h2 class="h-sm" id="g-t">Checklist da garantia</h2>' +
          '<p class="hint">Condições do <a href="../garantia.html">Termo da Garantia</a>. Elas são conferidas ao fim do prazo; aqui você acompanha o caminho até lá.</p></div>' +
          '<ul class="prog-check">' + check.map((i) => '<li class="prog-check__i prog-check__i--' + (i.ok === true ? "ok" : i.ok === false ? "pend" : "nd") + '">' +
            icon(i.ok === true ? "check-circle" : i.ok === false ? "x-circle" : "hourglass-medium") +
            "<div><b>" + e(i.titulo) + '</b><span class="sr-only"> (' + (i.ok === true ? "cumprido" : i.ok === false ? "pendente" : "sem dado") + ")</span><p>" + e(i.detalhe) + "</p></div></li>").join("") + "</ul>" +
        "</section>" +
        '<section class="panel" aria-labelledby="p-t"><div class="panel__head"><h2 class="h-sm" id="p-t">Prontidão para manter a data (EXIT 18)</h2>' +
          '<p class="hint">Recomendação da Road to America. A decisão sobre a data continua sendo sua.</p></div>' +
          (stepsPend.length ? stepsPend.map((s) => {
            const p = leituraProntidao(av.prontidao[s], linha, s, { config, agora });
            return '<div class="prog-pr"><p class="prog-pr__t"><b>' + NOME_STEP[s] + '</b> <span class="prog-chip prog-chip--' + CLASSE_PR[p.status] + '">' + e(ROTULO_PRONTIDAO[p.status]) + "</span></p>" +
              (p.motivo ? "<p>" + e(p.motivo) + "</p>" : "") +
              p.avisos.map((a) => '<p class="prog-pr__aviso">' + icon("warning") + "<span>" + e(a) + "</span></p>").join("") + "</div>";
          }).join("") + '<p class="hint">' + e(leituraProntidao(av.prontidao[stepsPend[0]], linha, stepsPend[0], { config, agora }).criterio) + "</p>"
            : '<p class="body">Os dois Steps estão marcados como aprovados.</p>') +
        "</section>" +
      "</div>" +

      '<section class="panel" aria-labelledby="d-t"><div class="panel__head"><h2 class="h-sm" id="d-t">Datas das provas</h2>' +
        '<p class="hint">Quando faltar menos de ' + config.nbme_antecedencia_dias + " dias para uma prova, o painel passa a cobrar as autoavaliações daquele Step. Aprovação e data de matrícula são lançadas pela equipe" + (plano.data_matricula ? " (matrícula em " + e(dataBR(plano.data_matricula)) + ")" : "") + ".</p></div>" +
        '<form class="prog-datas" data-datas novalidate>' +
          (plano.step1_aprovado ? '<p class="body">' + icon("seal-check") + " Step 1 aprovado.</p>" : '<div class="field"><label for="d-s1">Prova do Step 1</label><input id="d-s1" name="data_prova_step1" type="date" class="input" value="' + e(plano.data_prova_step1 || "") + '"></div>') +
          (plano.step2ck_aprovado ? '<p class="body">' + icon("seal-check") + " Step 2 CK aprovado.</p>" : '<div class="field"><label for="d-s2">Prova do Step 2 CK</label><input id="d-s2" name="data_prova_step2ck" type="date" class="input" value="' + e(plano.data_prova_step2ck || "") + '"></div>') +
          '<button class="btn btn--sm" type="submit">' + icon("check") + "Salvar datas</button>" +
        "</form>" +
      "</section>" +

      '<section class="panel" aria-labelledby="n-t"><div class="panel__head"><h2 class="h-sm" id="n-t">Autoavaliações NBME</h2>' +
        '<p class="hint">Lance cada autoavaliação oficial (CBSSA ou CCSSA) logo depois de fazer. Copie do relatório o escore, a probabilidade de aprovação e se a faixa provável de escore ficou inteira acima da faixa de aprovação baixa. Você pode corrigir ou excluir até a equipe verificar; depois disso o lançamento fica travado. Não é preciso enviar o relatório.</p></div>' +
        listaNbme(nbme) +
        '<form class="prog-nbme" data-nbme novalidate>' +
          '<h3 class="h-xs" id="nf-t">' + (editando ? "Corrigir autoavaliação" : "Lançar autoavaliação") + "</h3>" +
          '<div class="prog-nbme__grid">' +
            '<div class="field"><label for="nb-step">Step</label><select id="nb-step" name="step" class="input">' +
              ["step1", "step2ck"].map((s) => '<option value="' + s + '"' + ((editando?.step || stepsPend[0] || "step1") === s ? " selected" : "") + ">" + NOME_STEP[s] + "</option>").join("") + "</select></div>" +
            '<div class="field"><label for="nb-form">Formulário</label><input id="nb-form" name="formulario" class="input" maxlength="80" placeholder="CBSSA Form 31" value="' + e(editando?.formulario || "") + '" required></div>' +
            '<div class="field"><label for="nb-data">Data em que fez</label><input id="nb-data" name="data" type="date" class="input" max="' + hoje + '" value="' + e(editando?.data || "") + '" required></div>' +
            '<div class="field"><label for="nb-modo">Modo</label><select id="nb-modo" name="modo" class="input">' +
              Object.entries(ROTULO_MODO).map(([v, r]) => '<option value="' + v + '"' + ((editando?.modo || "standard") === v ? " selected" : "") + ">" + e(r) + "</option>").join("") + "</select></div>" +
            '<div class="field"><label for="nb-esc">Escore (três dígitos)</label><input id="nb-esc" name="escore" type="number" min="1" max="999" step="1" inputmode="numeric" class="input" value="' + e(editando?.escore ?? "") + '"></div>' +
            '<div class="field"><label for="nb-esct">Ou o equivalente do relatório</label><input id="nb-esct" name="escore_texto" class="input" maxlength="40" value="' + e(editando?.escore_texto || "") + '"></div>' +
            '<div class="field"><label for="nb-prob">Probabilidade de aprovação (%)</label><input id="nb-prob" name="probabilidade" type="number" min="0" max="100" step="0.1" inputmode="decimal" class="input" value="' + e(editando?.probabilidade ?? "") + '"></div>' +
            '<fieldset class="field"><legend>A faixa provável ficou inteira acima da faixa de aprovação baixa?</legend><div class="radios radios--row">' +
              [["sim", "Sim"], ["nao", "Não"], ["", "Não sei"]].map(([v, r]) => {
                const atual = editando ? (editando.faixa_acima_aprovacao_baixa === true ? "sim" : editando.faixa_acima_aprovacao_baixa === false ? "nao" : "") : "";
                return '<label class="radio"><input type="radio" name="faixa" value="' + v + '"' + (atual === v ? " checked" : "") + "> " + r + "</label>";
              }).join("") + "</div></fieldset>" +
            '<div class="field prog-nbme__obs"><label for="nb-obs">Observação (opcional)</label><textarea id="nb-obs" name="observacao" class="input input--area" rows="2" maxlength="1000">' + e(editando?.observacao || "") + "</textarea></div>" +
          "</div>" +
          '<div class="prog-erros" data-erros role="alert" hidden></div>' +
          '<div class="settings__acts">' + (editando ? '<input type="hidden" name="id" value="' + e(editando.id) + '">' : "") +
            '<button class="btn btn--sm" type="submit">' + icon(editando ? "check" : "plus") + (editando ? "Salvar correção" : "Lançar autoavaliação") + "</button>" +
            (editando ? '<a class="btn btn--ghost btn--sm" href="#/progresso">Cancelar</a>' : "") + "</div>" +
        "</form>" +
      "</section>" +

      '<section class="panel" aria-labelledby="s-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="s-t">Meus simulados</h2><a class="link-btn" href="../simulado/">' + icon("clock") + "Novo simulado</a></div>" +
        '<p class="hint">Cada simulado reproduz um bloco oficial: ' + SIMULADO_30.questoes + " questões em " + Math.round(SIMULADO_30.duracao_ms / 60000) + " minutos. Eles servem para treinar e não contam para a garantia.</p>" +
        blocoSimulados(simulados, config, ctx) +
      "</section>" +

      '<p class="prog-lgpd">' + icon("lock-simple") + '<span>A equipe da Road to America vê estes dados (estudo nos flashcards, simulados, autoavaliações e presença) para o acompanhamento pedagógico e para conferir as condições da garantia, conforme a <a href="../privacidade.html">Política de Privacidade</a>.</span></p>' +
    "</div>";

    /* ---------- eventos ---------- */
    const root = $("[data-prog]", el);
    const redesenhar = async (foco, novoArgs = {}) => {
      const y = window.scrollY;
      await this.render(ctx, el, novoArgs);
      window.scrollTo({ top: y });
      if (foco) $(foco, el)?.focus();
    };

    $("[data-datas]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.currentTarget;
      const dados = {};
      if (f.data_prova_step1) dados.data_prova_step1 = f.data_prova_step1.value || null;
      if (f.data_prova_step2ck) dados.data_prova_step2ck = f.data_prova_step2ck.value || null;
      try {
        await ctx.store.savePlano(dados);
        /* a data do Step 1 também alimenta a contagem regressiva do painel de estudo */
        if ("data_prova_step1" in dados && dados.data_prova_step1 && ctx.settings.dataProva !== dados.data_prova_step1) {
          await ctx.saveSettings({ ...ctx.settings, dataProva: dados.data_prova_step1 });
        }
        toast("Datas salvas.", "ok");
        await redesenhar("#d-t");
      } catch (err) { toast(err.message, "erro"); }
    });

    $("[data-nbme]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.currentTarget;
      const fd = Object.fromEntries(new FormData(f).entries());
      const x = {
        step: fd.step, formulario: fd.formulario, data: fd.data, modo: fd.modo,
        escore: fd.escore === "" ? null : fd.escore, escore_texto: fd.escore_texto,
        probabilidade: fd.probabilidade === "" ? null : fd.probabilidade,
        faixa_acima_aprovacao_baixa: fd.faixa === "sim" ? true : fd.faixa === "nao" ? false : null,
        observacao: fd.observacao
      };
      if (fd.id) x.id = fd.id;
      const box = $("[data-erros]", el);
      const erros = validarNbme(x);
      if (erros.length) {
        box.hidden = false;
        box.innerHTML = "<p><b>Confira antes de salvar:</b></p><ul>" + erros.map((m) => "<li>" + e(m) + "</li>").join("") + "</ul>";
        box.setAttribute("tabindex", "-1");
        box.focus();
        return;
      }
      try {
        await ctx.store.saveNbme(x);
        toast(x.id ? "Autoavaliação corrigida." : "Autoavaliação lançada. A equipe vai conferir.", "ok");
        await redesenhar("#n-t");
      } catch (err) {
        box.hidden = false;
        box.textContent = err.message;
      }
    });

    root.addEventListener("click", async (ev) => {
      const ed = ev.target.closest("[data-editar]");
      if (ed) { await redesenhar("#nb-form", { editar: ed.dataset.editar }); return; }
      const del = ev.target.closest("[data-excluir]");
      if (del) {
        if (!(await confirmar("Excluir autoavaliação", "Excluir este lançamento? Você pode lançar de novo depois.", "Excluir", true))) return;
        try { await ctx.store.deleteNbme(del.dataset.excluir); toast("Autoavaliação excluída.", "ok"); await redesenhar("#n-t"); }
        catch (err) { toast(err.message, "erro"); }
      }
    });
  }
};

function listaNbme(lista) {
  if (!lista.length) return '<p class="body">Nenhuma autoavaliação lançada ainda.</p>';
  return '<ul class="prog-nb">' + lista.map((x) =>
    '<li class="prog-nb__i"><div class="prog-nb__main"><p class="prog-nb__t"><b>' + e(NOME_STEP[x.step]) + "</b> " + e(x.formulario) + " <small>" + e(dataBR(x.data)) + " · " + e(ROTULO_MODO[x.modo] || x.modo) + "</small></p>" +
      '<p class="prog-nb__d">Escore ' + e(x.escore ?? x.escore_texto ?? "") + " · probabilidade " + (x.probabilidade === null || x.probabilidade === undefined ? "não informada" : String(x.probabilidade).replace(".", ",") + "%") +
      " · faixa acima da aprovação baixa: " + (x.faixa_acima_aprovacao_baixa === true ? "sim" : x.faixa_acima_aprovacao_baixa === false ? "não" : "não informada") + "</p></div>" +
      '<div class="prog-nb__acts">' + (x.verificada
        ? '<span class="prog-chip prog-chip--ok">' + icon("seal-check") + "Verificada pela equipe</span>"
        : '<span class="prog-chip prog-chip--neutro">Aguardando verificação</span><button type="button" class="link-btn" data-editar="' + e(x.id) + '">' + icon("pencil-simple") + 'Corrigir</button><button type="button" class="link-btn link-btn--perigo" data-excluir="' + e(x.id) + '">' + icon("trash") + "Excluir</button>") +
      "</div></li>").join("") + "</ul>";
}

function blocoSimulados(simulados, config, ctx) {
  if (!simulados.length) return '<p class="body">Você ainda não fez nenhum simulado.</p>';
  const lista = '<ul class="prog-sim">' + simulados.slice(0, 10).map((s) =>
    '<li><span class="prog-sim__d">' + e(dataBR(s.fim)) + "</span><b>" + e(NOME_STEP[s.step]) + '</b><span class="prog-sim__n' + (s.acertos / s.total < config.simulado_minimo ? " is-baixo" : "") + '">' + s.acertos + "/" + s.total + " (" + pct(s.acertos / s.total) + ")</span>" +
      '<span class="muted">' + Math.round((s.duracao_ms || 0) / 60000) + " min" + (s.encerramento === "tempo" ? ", tempo esgotado" : "") + "</span></li>").join("") + "</ul>" +
    (simulados.length > 10 ? '<p class="hint">Mostrando os 10 mais recentes de ' + simulados.length + ".</p>" : "");
  const porStep = ["step1", "step2ck"].filter((st) => simulados.some((s) => s.step === st)).map((st) => {
    const areas = desempenhoPorArea(simulados.filter((s) => s.step === st), "por_sistema");
    return '<div><h3 class="h-xs">' + NOME_STEP[st] + (st === "step2ck" ? " por área" : " por sistema") + ', da mais fraca para a mais forte</h3><dl class="mat">' + areas.map((a) =>
      "<div><dt>" + e(nomeArea(a.chave, { step: st, tax: ctx.tax })) + "</dt><dd><b>" + pct(a.taxa) + '</b><span class="mat__bar" role="img" aria-label="' + e(a.acertos + " de " + a.total + " certas") + '"><span style="width:' + Math.round((a.taxa || 0) * 100) + '%"' + (a.taxa < config.simulado_minimo ? ' class="is-baixo"' : "") + "></span></span></dd></div>").join("") + "</dl>" +
      '<p class="hint">' + plural(areas.reduce((n, a) => n + a.total, 0), "questão somada", "questões somadas") + ". Com poucas questões por área, use como pista, não como diagnóstico.</p></div>";
  }).join("");
  return lista + '<div class="grid2 grid2--top prog-areas">' + porStep + "</div>";
}
