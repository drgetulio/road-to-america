/* Road to America | Meu progresso: checklist da garantia, prontidão (EXIT 18),
   datas de prova, autoavaliações NBME, simulados de 30 minutos, simulados completos e o
   cartão do banco de questões do próprio participante.
   Regras em plataforma/js/desempenho.js; textos em plataforma/js/acompanhamento.js. */
import { avaliarParticipante, validarNbme } from "../../../plataforma/js/desempenho.js";
import { desempenhoPorArea, SIMULADO_30 } from "../../../plataforma/js/simulado.js";
import { checklistGarantia, leituraProntidao, nomeArea, NOME_STEP, dataBR, pct, plural, MIN_QUESTOES_AREA } from "../../../plataforma/js/acompanhamento.js";
import { $, e, icon, toast, confirmar } from "../ui.js";
import { dayKey } from "../util.js";
import { pageHead } from "./shared.js";
import { resumoAprovacao } from "../../../plataforma/js/banco-aluno.js";
import { carregarBanco, nomeChave } from "../../../plataforma/js/banco.js";
import { linhaHistorico, NOMES_TIPO } from "../../../simulado/js/relatorio.js";
import { textoProbabilidade, nomePadrao, textoPublicosFora } from "../../../plataforma/js/psicometria.js";

const ROTULO_MODO = { standard: "standard-paced", self: "self-paced", desconhecido: "não sei" };
const CLASSE_PR = { pronto: "ok", pronto_sem_faixa: "aviso", aprovado: "ok", nao_pronto: "risco", insuficiente: "neutro" };

export default {
  titulo: "Meu progresso",
  async render(ctx, el, args = {}) {
    const agora = new Date();
    const [linha, config, nbme, simulados, completos] = await Promise.all([
      ctx.store.getMeuResumo({ agora }),
      ctx.store.getConfigPlataforma(),
      ctx.store.listNbme(),
      ctx.store.listSimulados(),
      ctx.store.listSimuladosCompletos ? ctx.store.listSimuladosCompletos({}).catch((err) => { console.error(err); return null; }) : []
    ]);
    const av = avaliarParticipante(linha, { config, agora });
    const cartaoBanco = await cartaoBancoQuestoes(ctx, { nbme, config });
    const check = checklistGarantia(linha, av, { config, participante: true });
    const plano = linha.plano || {};
    const stepsPend = ["step1", "step2ck"].filter((s) => !plano[s + "_aprovado"]);
    const editando = args.editar ? nbme.find((x) => x.id === args.editar && !x.verificada) : null;
    /* data do calendário local (toISOString daria a data em UTC, um dia à frente à noite) */
    const hoje = dayKey(agora, 0);

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
          '<ul class="prog-check">' + check.map((i) => '<li class="prog-check__i prog-check__i--' + ({ cumprido: "ok", pendente: "pend", andamento: "nd", sem_dado: "nd" })[i.estado] + '">' +
            icon(i.estado === "cumprido" ? "check-circle" : i.estado === "pendente" ? "x-circle" : "hourglass-medium") +
            "<div><b>" + e(i.titulo) + '</b><span class="sr-only"> (' + ({ cumprido: "cumprido", pendente: "pendente", andamento: "em andamento", sem_dado: "sem dado" })[i.estado] + ")</span><p>" + e(i.detalhe) + "</p></div></li>").join("") + "</ul>" +
        "</section>" +
        '<section class="panel" aria-labelledby="p-t"><div class="panel__head"><h2 class="h-sm" id="p-t">Prontidão para manter a data (EXIT 18)</h2>' +
          '<p class="hint">Recomendação da Road to America. A decisão sobre a data continua sendo sua.</p></div>' +
          (stepsPend.length ? stepsPend.map((s) => {
            const p = leituraProntidao(av.prontidao[s], linha, s, { config, agora });
            return '<div class="prog-pr"><p class="prog-pr__t"><b>' + NOME_STEP[s] + '</b> <span class="prog-chip prog-chip--' + CLASSE_PR[p.status_tela] + '">' + e(p.rotulo) + "</span></p>" +
              (p.motivo ? "<p>" + e(p.motivo) + "</p>" : "") +
              p.avisos.map((a) => '<p class="prog-pr__aviso">' + icon("warning") + "<span>" + e(a) + "</span></p>").join("") + "</div>";
          }).join("") + '<p class="hint">' + e(leituraProntidao(av.prontidao[stepsPend[0]], linha, stepsPend[0], { config, agora }).criterio) + "</p>"
            : '<p class="body">Os dois Steps estão marcados como aprovados.</p>') +
        "</section>" +
      "</div>" +

      cartaoBanco +

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

      '<section class="panel" aria-labelledby="s-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="s-t">Simulados de 30 minutos</h2><a class="link-btn" href="../simulado/">' + icon("clock") + "Novo simulado de 30 minutos</a></div>" +
        '<p class="hint">Cada simulado reproduz um bloco oficial: ' + SIMULADO_30.questoes + " questões em " + Math.round(SIMULADO_30.duracao_ms / 60000) + " minutos. Eles servem para treinar e não contam para a garantia.</p>" +
        blocoSimulados(simulados, config, ctx) +
      "</section>" +

      '<section class="panel" aria-labelledby="sc-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="sc-t">Simulados completos</h2><a class="link-btn" href="../simulado/#/completos">' + icon("clock") + "Novo simulado completo</a></div>" +
        '<p class="hint">O dia de prova no formato oficial: Step 1 com 14 blocos de 30 minutos e Step 2 CK com 16. A probabilidade é a de estar acima do limiar do banco, calculada no fim de cada dia, com o padrão ainda provisório; não é resultado oficial. O dia em condições de estudo ou com itens já vistos aparece como leitura de estudo.</p>' +
        blocoCompletos(completos) +
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
        /* A data do Step 1 também alimenta a contagem regressiva do painel de estudo.
           Apagar a data aqui apaga a dos Ajustes: o resumo usa a dos Ajustes quando o
           plano está vazio, e sem isso a data apagada voltaria na tela. */
        if ("data_prova_step1" in dados && (ctx.settings.dataProva || "") !== (dados.data_prova_step1 || "")) {
          await ctx.saveSettings({ ...ctx.settings, dataProva: dados.data_prova_step1 || "" });
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

/* Simulados completos do próprio participante: em andamento (com o bloco e o link para
   continuar) e encerrados (acertos e a probabilidade guardada no fim do dia, a mesma do
   histórico do simulado, por linhaHistorico de simulado/js/relatorio.js) */
function blocoCompletos(lista) {
  if (lista === null) return '<p class="body">Não foi possível ler os simulados completos agora.</p>';
  const andamento = lista.filter((r) => r.estado === "em_andamento");
  const feitos = lista.filter((r) => r.estado === "concluido").map(linhaHistorico);
  if (!andamento.length && !feitos.length) return '<p class="body">Nenhum simulado completo ainda.</p>';
  const nome = (l) => e(NOME_STEP[l.step]) + ", " + e((NOMES_TIPO[l.tipo] || l.tipo).toLowerCase());
  return '<ul class="prog-sim" data-completos>' +
    andamento.map((r) => {
      const nb = r.formulario?.blocos?.length || 0;
      return '<li><span class="prog-sim__d">' + e(dataBR(r.atualizado_em || r.inicio)) + "</span><b>" + nome(r) + '</b><span class="prog-chip prog-chip--neutro">' +
        (r.sessao?.suspensa ? "Parado" : "Em andamento") + "</span>" +
        '<span class="muted">bloco ' + Math.min((r.sessao?.bloco_atual || 0) + 1, nb) + " de " + nb + "</span>" +
        '<a href="../simulado/#/dia/' + encodeURIComponent(r.id) + '">Continuar</a></li>';
    }).join("") +
    feitos.slice(0, 10).map((l) =>
      '<li><span class="prog-sim__d">' + e(dataBR(l.data)) + "</span><b>" + nome(l) + "</b>" +
        '<span class="prog-sim__n">' + (l.acertos === null ? "sem dados" : l.acertos + "/" + l.total + " (" + pct(l.percentual) + ")") + "</span>" +
        (l.p_aprovacao === null ? "" : '<span class="muted">acima do limiar do banco ' + pctProb(l.p_aprovacao) + "</span>" +
          '<span class="prog-chip prog-chip--' + (l.alta ? "ok" : "aviso") + '">' + (l.alta ? "Precisão alta" : "Estimativa preliminar") + "</span>" +
          (l.padronizado === false || l.reaplicacao ? '<span class="prog-chip prog-chip--aviso">' + (l.reaplicacao ? "reaplicação" : "estudo") + "</span>" : "")) +
        '<a href="../simulado/#/relatorio/' + encodeURIComponent(l.id) + '">Relatório<span class="sr-only"> do simulado de ' + e(dataBR(l.data)) + "</span></a></li>").join("") +
  "</ul>" + (feitos.length > 10 ? '<p class="hint">Mostrando os 10 mais recentes de ' + feitos.length + ". Todos estão em <a href=\"../simulado/#/completos\">Simulados completos</a>.</p>" : "");
}

function blocoSimulados(simulados, config, ctx) {
  if (!simulados.length) return '<p class="body">Você ainda não fez nenhum simulado.</p>';
  const lista = '<ul class="prog-sim">' + simulados.slice(0, 10).map((s) =>
    '<li><span class="prog-sim__d">' + e(dataBR(s.fim)) + "</span><b>" + e(NOME_STEP[s.step]) + '</b><span class="prog-sim__n' + (s.acertos / s.total < config.simulado_minimo ? " is-baixo" : "") + '">' + s.acertos + "/" + s.total + " (" + pct(s.acertos / s.total) + ")</span>" +
      '<span class="muted">' + Math.round((s.duracao_ms || 0) / 60000) + " min" + (s.encerramento === "tempo" ? ", tempo esgotado" : "") + "</span></li>").join("") + "</ul>" +
    (simulados.length > 10 ? '<p class="hint">Mostrando os 10 mais recentes de ' + simulados.length + ".</p>" : "");
  const porStep = ["step1", "step2ck"].filter((st) => simulados.some((s) => s.step === st)).map((st) => {
    const todas = desempenhoPorArea(simulados.filter((s) => s.step === st), "por_sistema");
    /* áreas com amostra pequena vão para o fim, em cinza, sem o vermelho da meta */
    const areas = todas.filter((a) => a.total >= MIN_QUESTOES_AREA).concat(todas.filter((a) => a.total < MIN_QUESTOES_AREA));
    const poucas = todas.length - todas.filter((a) => a.total >= MIN_QUESTOES_AREA).length;
    return '<div><h3 class="h-xs">' + NOME_STEP[st] + (st === "step2ck" ? " por área" : " por sistema") + ', da mais fraca para a mais forte</h3><dl class="mat">' + areas.map((a) => {
      const pouco = a.total < MIN_QUESTOES_AREA;
      return '<div' + (pouco ? ' class="is-pouco"' : "") + "><dt>" + e(nomeArea(a.chave, { step: st, tax: ctx.tax })) + "</dt><dd><b>" + pct(a.taxa) + '</b><span class="mat__bar" role="img" aria-label="' + e(a.acertos + " de " + a.total + " certas" + (pouco ? ", amostra pequena" : "")) + '"><span style="width:' + Math.round((a.taxa || 0) * 100) + '%"' + (!pouco && a.taxa < config.simulado_minimo ? ' class="is-baixo"' : "") + "></span></span></dd></div>";
    }).join("") + "</dl>" +
      '<p class="hint">' + plural(todas.reduce((n, a) => n + a.total, 0), "questão somada", "questões somadas") + "." + (poucas ? " Em cinza, no fim: " + plural(poucas, "área com", "áreas com") + " menos de " + MIN_QUESTOES_AREA + " questões." : "") + " Com poucas questões por área, use como pista, não como diagnóstico.</p></div>";
  }).join("");
  return lista + '<div class="grid2 grid2--top prog-areas">' + porStep + "</div>";
}

/* Cartão resumido do banco de questões: posição em relação ao limiar do banco em cada Step, pelo
   banco (plataforma/js/banco-aluno.js), rótulo de confiança e a área que mais derruba
   a probabilidade. O painel completo fica em ../questoes/#/aprovacao. */
const pctProb = (p) => textoProbabilidade(p);
async function cartaoBancoQuestoes(ctx, { nbme, config }) {
  let corpo;
  try {
    const [banco, respostas, modelos] = await Promise.all([carregarBanco({ store: ctx.store }), ctx.store.listRespostas(), ctx.store.getModelosPsicometricos().catch(() => ({}))]);
    if (!banco.itens.length) corpo = '<p class="body">O banco de questões ainda não está liberado para a sua conta. A equipe ativa a matrícula depois da confirmação da inscrição.</p>';
    else corpo = ["step1", "step2ck"].map((st) => {
      const r = resumoAprovacao({ banco, respostas, step: st, modelos, nbme, config, base: "../questoes/#/" });
      const est = r.est;
      const conf = est.confianca;
      const top = (r.contribuicao.sistema || []).find((c) => c.ganho >= 0.005);
      return '<div class="prog-pr"><p class="prog-pr__t"><b>' + NOME_STEP[st] + "</b> " +
        (est.n ? '<span class="prog-banco__p">' + pctProb(est.p_aprovacao) + "</span>" : "") +
        '<span class="prog-chip prog-chip--' + (conf.alta ? "ok" : "aviso") + '">' + (conf.alta ? e(conf.texto_curto || "Precisão alta") : "Estimativa preliminar") + "</span></p>" +
        "<p>" + (est.n
          ? "Probabilidade de estar acima do limiar do banco" + (st === "step2ck" ? ", que representa o 218" : "") + " (padrão " + e(nomePadrao(est.corte?.origem)) + "), com " + plural(est.n, "item respondido", "itens respondidos") + "." +
            (conf.alta ? "" : conf.faltam_itens ? " Faltam cerca de " + plural(conf.faltam_itens, "item", "itens") + " para a precisão alta." : conf.faltam_sistemas.length ? " Faltam itens em " + plural(conf.faltam_sistemas.length, "sistema", "sistemas") + "." : "") +
            (top ? " Área que mais derruba: " + e(nomeChave(st, "sistema", top.chave)) + " (+" + String(Math.round(top.ganho * 1000) / 10).replace(".", ",") + " pontos percentuais em jogo)." : "") +
            (textoPublicosFora(est) ? " " + e(textoPublicosFora(est)) : "")
          : "Ainda sem respostas deste Step no banco de questões.") + "</p></div>";
    }).join("") + '<p class="hint">Estimativa do banco, complementar à EXIT 18: enquanto o padrão for provisório, ele vem da dificuldade-alvo dos itens, sem painel de juízes nem ligação com as autoavaliações NBME. Não é probabilidade de aprovação no USMLE nem resultado do NBME.</p>';
  } catch (err) {
    console.error(err);
    corpo = '<p class="body">Não foi possível calcular a estimativa do banco agora.</p>';
  }
  return '<section class="panel" aria-labelledby="bq-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="bq-t">Banco de questões: posição em relação ao limiar</h2>' +
    '<a class="link-btn" href="../questoes/#/aprovacao">' + icon("gauge") + "Abrir o painel</a></div>" + corpo + "</section>";
}
