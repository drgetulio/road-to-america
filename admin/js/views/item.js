/* Road to America | área administrativa: ficha do item
   Enunciado com o gabarito, índices, distratores por quartil de habilidade,
   reportes dos alunos, ações da equipe (marcar para revisão, retirar do banco,
   corrigir o gabarito com registro de versão) e histórico de versões. */
import { htmlMidiaItem } from "../../../plataforma/js/midia.js";
import { $, e, icon, toast, confirmar, num } from "../../../anki/js/ui.js";
import { nomeChave } from "../../../plataforma/js/banco.js";
import { MOTIVOS_REPORTE, STATUS_REPORTE } from "../../../plataforma/js/registros.js";
import { dataBR, plural } from "../../../plataforma/js/acompanhamento.js";
import { distratoresPorQuartil, ROTULO_ALERTA, pctTxt, numTxt, LIMIARES_ITEM } from "../analise.js";
import { curvasOpcao } from "../graficos.js";
import { avisoDemoBanco, avisoLgpd } from "./comum.js";
import { ROTULO_DEFEITO } from "../../../plataforma/js/respostas-demo.js";
import { analiseDoStep, ROTULO_STATUS_ITEM } from "./itens.js";

const ROTULO_REPORTE = { aberto: "Aberto", em_analise: "Em análise", resolvido: "Resolvido", rejeitado: "Rejeitado" };
const ROTULO_ACAO = { gabarito: "Gabarito corrigido", conteudo: "Conteúdo alterado", status: "Situação no banco", revisao: "Marca de revisão" };
const nomeStep = (s) => (s === "step1" ? "Step 1" : "Step 2 CK");

export default {
  titulo: "Ficha do item",
  async render(ctx, el, args) {
    const id = args.sub[0];
    if (!el.querySelector("[data-item]")) el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Abrindo o item...</p></div>';
    const banco = await ctx.bancoAdmin();
    const q = banco.porId.get(id);
    if (!q) {
      el.innerHTML = '<div class="wrap section-sm"><div class="empty"><h1 class="display h3">Item não encontrado.</h1><p class="body">O identificador pode estar errado ou o item saiu do banco importado.</p><a class="btn btn--ghost" href="#/itens">Voltar à análise de itens</a></div></div>';
      return;
    }
    const step = q.step;
    const [an, historico, reportes] = await Promise.all([analiseDoStep(ctx, step), ctx.store.listHistoricoQuestao(id), ctx.store.listReportes({ todos: true, questaoId: id })]);
    const st = an.porItem.get(id) || null;
    const plantado = ctx.modo === "local" && ctx.store._defeitoDemo ? await ctx.store._defeitoDemo(id) : null;
    const linhas = an.matriz.filter((r) => r.questao_id === id);
    const dq = distratoresPorQuartil(linhas, q, an.quartis);
    const pbisOpc = new Map((st?.opcoes || []).map((o) => [o.letra, o.pbis]));
    const prov = st && !st.confiavel;
    const disc = step === "step1" ? (q.disciplinas || [q.disciplina]) : q.disciplinas_oficiais;
    const nomeDisc = (k) => nomeChave(step, step === "step1" ? "disciplina" : "disciplina_oficial", k);

    el.innerHTML = '<div class="wrap section-sm ficha" data-item>' +
      '<p class="crumbs"><a href="#/itens?step=' + step + '">' + icon("list-checks") + "Análise de itens</a></p>" +
      '<header class="boarding ficha__head">' +
        '<div class="boarding__main">' +
          '<p class="boarding__top"><span>Ficha do item</span><span>' + nomeStep(step) + " · versão " + q.versao + "</span></p>" +
          '<div class="ficha__nome"><h1 class="display h2">' + e(q.id) + "</h1>" +
            '<span class="gar gar--' + (q.status === "ativo" ? "ok" : "risco") + '">' + e(ROTULO_STATUS_ITEM[q.status] || q.status) + "</span>" +
            (q.em_revisao ? '<span class="gar gar--aviso">' + icon("flag") + "Em revisão</span>" : "") + "</div>" +
          (q.em_revisao && q.revisao_nota ? '<p class="hint">Nota da revisão: ' + e(q.revisao_nota) + "</p>" : "") +
          '<dl class="boarding__data ficha__dados">' +
            "<div><dt>Sistema</dt><dd>" + e(nomeChave(step, "sistema", q.sistema) || "sem sistema") + "</dd></div>" +
            "<div><dt>" + (step === "step1" ? "Disciplinas" : "Disciplinas clínicas") + "</dt><dd>" + e(disc.filter(Boolean).map(nomeDisc).join(", ") || "sem disciplina") + "</dd></div>" +
            "<div><dt>" + (step === "step1" ? "Competência" : "Tarefa do médico") + "</dt><dd>" + e(nomeChave(step, "competencia", q.competencia) || "sem competência") + "</dd></div>" +
            "<div><dt>Dificuldade-alvo</dt><dd>" + numTxt(q.angoff, 2) + " <small>" + (q.angoff_origem === "painel" ? "Angoff do painel de juízes" : q.angoff_origem === "item" ? "fixada pelos autores na especificação; não é julgamento de juízes" : "padrão da dificuldade " + e(({ facil: "fácil", media: "média", dificil: "difícil" })[q.dificuldade] || q.dificuldade || "média")) + "</small></dd></div>" +
            "<div><dt>b em uso</dt><dd>" + (Number.isFinite(q.b_calibrado) ? numTxt(q.b_calibrado, 2) + " <small>calibrado com " + plural(q.n_calibracao, "resposta", "respostas") + (Number.isFinite(q.ep_calibrado) ? ", EP " + numTxt(q.ep_calibrado, 2) : "") + "; alvo " + numTxt(q.b_angoff, 2) + "</small>" : numTxt(q.b_angoff, 2) + " <small>da dificuldade-alvo, ainda sem calibração</small>") + "</dd></div>" +
          "</dl>" +
        "</div>" +
        '<div class="boarding__stub ficha__stub" role="img" aria-label="' + e("Gabarito em vigor: alternativa " + q.correta) + '"><span aria-hidden="true">Gabarito</span><b aria-hidden="true">' + e(q.correta) + '</b><span aria-hidden="true">v' + q.versao + "</span></div>" +
      "</header>" +
      avisoDemoBanco(ctx) +
      (plantado ? '<p class="alert alert--info">' + icon("info") + "<span><b>Defeito plantado pela simulação neste item: " + e(ROTULO_DEFEITO[plantado.defeito]) + ".</b> " +
        (plantado.defeito === "gabarito_trocado" ? "Os examinandos fictícios que sabem a resposta foram programados para escolher a alternativa " + e(plantado.chave_simulada) + ". O gabarito do item público não tem erro conhecido: não o corrija por causa destes dados." : "Os números deste item vêm desse defeito simulado, não de um problema conhecido do item público.") + "</span></p>" : "") +

      '<div class="grid2 grid2--top">' +
        '<section class="panel" aria-labelledby="enu-t"><div class="panel__head"><h2 class="h-sm" id="enu-t">Enunciado</h2>' +
          (q.topico || q.conceito_testado ? '<p class="hint">' + e([q.topico, q.conceito_testado].filter(Boolean).join(": ")) + "</p>" : "") + "</div>" +
          '<div class="enu" lang="en"><p class="enu__vin">' + e(q.vinheta) + "</p>" +
            (q.tabela?.linhas?.length ? '<table class="mini-tab enu__tab"><caption>' + e(q.tabela.titulo || "Laboratory studies") + "</caption><tbody>" + q.tabela.linhas.map((l) => "<tr>" + l.map((c) => "<td>" + e(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>" : "") +
            htmlMidiaItem(q.midia) +
            '<p class="enu__perg"><b>' + e(q.pergunta) + "</b></p>" +
            '<ol class="enu__alts">' + q.alternativas.map((a) => '<li class="enu__alt' + (a.letra === q.correta ? " is-correta" : "") + '"><span class="enu__l">' + e(a.letra) + "</span><span>" + e(a.texto) + (a.letra === q.correta ? ' <span class="gar gar--ok" lang="pt-BR">gabarito</span>' : "") + "</span></li>").join("") + "</ol>" +
          "</div>" +
          (q.explicacao_pt ? '<details class="table-view"><summary>Resumo da explicação</summary><p class="body">' + e(q.explicacao_pt) + "</p></details>" : "") +
          (q.explicacao ? '<details class="table-view"><summary>Explicação completa</summary><p class="body" lang="en">' + e(q.explicacao) + "</p></details>" : "") +
        "</section>" +
        '<section class="panel" aria-labelledby="ind-t"><div class="panel__head"><h2 class="h-sm" id="ind-t">Índices do item</h2>' +
          '<p class="hint">Primeira resposta de cada pessoa na versão ' + q.versao + ", sem o modo tutor." + (prov ? " Com menos de " + LIMIARES_ITEM.n_min + " respostas, os índices são provisórios." : "") + "</p></div>" +
          (st ? '<dl class="mini mini--6">' +
            "<div><dt>Respostas</dt><dd>" + num(st.n) + "</dd></div>" +
            "<div><dt>Dificuldade p</dt><dd>" + numTxt(st.p, 2) + " <small>" + pctTxt(st.p) + " de acerto; no limiar, " + pctTxt(q.angoff) + "</small></dd></div>" +
            "<div><dt>Ponto-bisserial</dt><dd>" + numTxt(st.pbis, 2) + " <small>corrigida</small></dd></div>" +
            "<div><dt>D (27%)</dt><dd>" + numTxt(st.d, 2) + " <small>" + st.n_superior + " e " + st.n_inferior + " pessoas</small></dd></div>" +
            "<div><dt>Infit</dt><dd>" + numTxt(st.infit, 2) + " <small>esperado perto de 1</small></dd></div>" +
            "<div><dt>Outfit</dt><dd>" + numTxt(st.outfit, 2) + " <small>esperado perto de 1</small></dd></div>" +
          "</dl>" +
          (st.alertas.length ? '<ul class="sinais">' + st.alertas.map((a) => '<li class="sinal' + (a.nivel === "revisar" && !prov ? " sinal--alto" : "") + '">' + icon(a.nivel === "revisar" ? "warning-circle" : "info") + "<div><b>" + e(ROTULO_ALERTA[a.codigo] || a.codigo) + (a.nivel === "revisar" ? (prov ? " · provisório" : " · pede revisão") : "") + "</b><p>" + e(a.texto) + "</p></div></li>").join("") + "</ul>" : '<p class="body">' + icon("check-circle") + " Nenhum alerta.</p>")
          : '<p class="body">Ainda sem respostas na versão atual.</p>') +
        "</section>" +
      "</div>" +

      '<section class="panel" aria-labelledby="dis-t"><div class="panel__head"><h2 class="h-sm" id="dis-t">Distratores por quartil de habilidade</h2>' +
        '<p class="hint">Quem escolheu cada alternativa, com as pessoas divididas em quatro grupos iguais pela habilidade estimada no Step (Q1, os 25% mais baixos; Q4, os 25% mais altos). Num item que funciona, a correta sobe de Q1 para Q4 e os distratores descem. Um distrator que sobe, ou que supera a correta em Q4, pede conferência do gabarito.</p></div>' +
        (dq.n && dq.por_quartil ? '<div class="grid2 grid2--mult"><figure class="mult"><figcaption class="mult__t">Escolha por quartil</figcaption>' + curvasOpcao(dq, { titulo: "Proporção que escolheu cada alternativa por quartil de habilidade, item " + q.id }) + "</figure>" +
          '<div class="dq-wrap" tabindex="0" role="region" aria-label="Tabela de distratores por quartil">' + tabelaDistratores(dq, pbisOpc) + "</div></div>"
          : dq.n ? '<p class="body">Ainda há poucas pessoas na matriz para dividir em quartis (mínimo de 8).</p>' + tabelaDistratores(dq, pbisOpc) : '<p class="body">Ainda sem respostas.</p>') +
      "</section>" +

      '<section class="panel" aria-labelledby="rp-t"><div class="panel__head"><h2 class="h-sm" id="rp-t">Reportes dos alunos</h2>' +
        '<p class="hint">A resposta da equipe fica gravada no reporte, mas a área do aluno ainda não a mostra: se o aluno precisar saber, avise por outro canal. Resolver ou rejeitar carimba quem tratou e quando.</p></div>' +
        (reportes.length ? '<ul class="reps">' + reportes.map((r) => blocoReporte(r)).join("") + "</ul>" : '<p class="body">Nenhum reporte sobre este item.</p>') +
      "</section>" +

      '<section class="panel" aria-labelledby="ac-t"><div class="panel__head"><h2 class="h-sm" id="ac-t">Ações da equipe</h2>' +
        '<p class="hint">Cada ação fica no histórico do item com o motivo. Marcar para revisão não tira o item do banco; retirar tira dos blocos, dos simulados novos e da estimativa dos alunos; corrigir o gabarito sobe a versão e apaga a calibração do item.</p></div>' +
        '<div class="acoes-item">' +
          '<form class="acao-item" data-revisao novalidate><h3 class="h-xs">Revisão</h3>' +
            '<div class="field"><label for="rv-nota">Nota da revisão</label><textarea id="rv-nota" name="nota" rows="3" class="input input--area" maxlength="1000">' + e(q.revisao_nota || "") + "</textarea></div>" +
            '<button class="btn btn--sm" type="submit" name="acao" value="' + (q.em_revisao ? "tirar" : "marcar") + '">' + icon("flag") + (q.em_revisao ? "Tirar a marca de revisão" : "Marcar para revisão") + "</button>" +
            (q.em_revisao ? ' <button class="btn btn--ghost btn--sm" type="submit" name="acao" value="marcar">' + icon("pencil-simple") + "Atualizar a nota</button>" : "") +
          "</form>" +
          '<form class="acao-item" data-status novalidate><h3 class="h-xs">Situação no banco</h3>' +
            '<div class="field"><label for="st-sel">Situação</label><select id="st-sel" name="status" class="input">' +
              [["ativo", "No banco (ativo)"], ["suspenso", "Retirado do banco (suspenso)"], ["aposentado", "Aposentado"], ["rascunho", "Rascunho"]].map(([v, r]) => '<option value="' + v + '"' + (v === q.status ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div>" +
            '<div class="field"><label for="st-mot">Motivo</label><input id="st-mot" name="motivo" class="input" maxlength="1000" autocomplete="off"></div>' +
            '<button class="btn btn--sm" type="submit">' + icon("check") + "Salvar situação</button>" +
          "</form>" +
          '<form class="acao-item" data-gabarito novalidate><h3 class="h-xs">Corrigir o gabarito</h3>' +
            '<fieldset class="field"><legend>Alternativa correta</legend><div class="radios radios--row">' + q.alternativas.map((a) => '<label class="radio"><input type="radio" name="correta" value="' + e(a.letra) + '"' + (a.letra === q.correta ? " checked" : "") + "> " + e(a.letra) + (a.letra === q.correta ? " (atual)" : "") + "</label>").join("") + "</div></fieldset>" +
            '<div class="field"><label for="gb-mot">Motivo (obrigatório)</label><textarea id="gb-mot" name="motivo" rows="2" class="input input--area" maxlength="1000" aria-describedby="gb-dica"></textarea><p class="hint" id="gb-dica">Por exemplo, a referência consultada. Fica no histórico do item.</p></div>' +
            '<label class="check"><input type="checkbox" name="recorrigir" checked> Recorrigir as respostas já gravadas pela alternativa nova</label>' +
            '<p class="error" data-gb-erro role="alert"></p>' +
            '<button class="btn btn--sm" type="submit">' + icon("pencil-simple") + "Corrigir o gabarito</button>" +
          "</form>" +
        "</div>" +
      "</section>" +

      '<section class="panel" aria-labelledby="hi-t"><div class="panel__head"><h2 class="h-sm" id="hi-t">Histórico de versões</h2>' +
        '<p class="hint">Versão ' + q.versao + " em vigor. As respostas de versões anteriores ficam fora dos índices e da estimativa dos alunos; a correção do gabarito com recorreção leva para a versão nova as respostas da versão em vigor.</p></div>" +
        (historico.length ? '<ol class="hist">' + historico.slice().reverse().map((h) => '<li class="hist__i"><p class="hist__t"><b>' + e(ROTULO_ACAO[h.acao] || h.acao) + "</b> · versão " + h.versao + ' · <span class="muted">' + e(dataBR(h.criado_em)) + "</span></p>" +
          '<p class="hist__d">' + e(textoMudanca(h)) + (h.motivo ? " Motivo: " + e(h.motivo) : "") + "</p></li>").join("") + "</ol>"
          : '<p class="body">Nenhuma mudança registrada desde a importação.</p>') +
      "</section>" +
      avisoLgpd("O nome do aluno aparece só nos reportes que ele mesmo enviou. As estatísticas usam a matriz pseudonimizada.") +
    "</div>";

    const recarregar = async (msg) => {
      ctx.invalidar();
      toast(msg, "ok");
      await this.render(ctx, el, args);
      $("h1", el)?.focus?.();
    };
    $("[data-revisao]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const marcar = ev.submitter?.value !== "tirar";
      try {
        await ctx.store.marcarRevisaoQuestao(id, { revisao: marcar, nota: ev.target.elements.nota.value });
        await recarregar(marcar ? "Item marcado para revisão." : "Marca de revisão retirada.");
      } catch (err) { toast(err.message, "erro"); }
    });
    $("[data-status]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const status = ev.target.elements.status.value;
      if (status === q.status) { toast("A situação escolhida já é a atual.", "info"); return; }
      if (status !== "ativo" && !(await confirmar("Retirar o item do banco?", "O item sai dos blocos do banco, dos simulados montados daqui em diante e da estimativa dos alunos. As respostas continuam guardadas e o item pode voltar depois.", "Retirar do banco", true))) return;
      try {
        await ctx.store.setStatusQuestao(id, status, { motivo: ev.target.elements.motivo.value });
        await recarregar(status === "ativo" ? "Item de volta ao banco." : "Item retirado do banco.");
      } catch (err) { toast(err.message, "erro"); }
    });
    $("[data-gabarito]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fm = ev.target.elements;
      const nova = fm.correta.value;
      const motivo = fm.motivo.value.trim();
      const erro = $("[data-gb-erro]", el);
      erro.textContent = "";
      if (nova === q.correta) { erro.textContent = "Escolha uma alternativa diferente da atual."; return; }
      if (motivo.length < 5) { erro.textContent = "Explique o motivo da mudança (pelo menos 5 caracteres)."; fm.motivo.setAttribute("aria-invalid", "true"); fm.motivo.focus(); return; }
      const rec = fm.recorrigir.checked;
      if (!(await confirmar("Corrigir o gabarito de " + q.correta + " para " + nova + "?", "A versão do item vai de " + q.versao + " para " + (q.versao + 1) + " e a calibração dele é apagada. " + (rec ? "As respostas já gravadas na versão " + q.versao + " passam a valer pela alternativa " + nova + ", o que muda a estimativa dos alunos que fizeram o item." : "As respostas já gravadas ficam na versão antiga e saem dos índices e da estimativa dos alunos."), "Corrigir o gabarito", true))) return;
      try {
        const r = await ctx.store.editarGabarito(id, { correta: nova, motivo, recorrigir: rec });
        await recarregar("Gabarito corrigido: versão " + r.versao + (rec ? ", " + plural(r.recorrigidas, "resposta recorrigida", "respostas recorrigidas") : "") + ".");
      } catch (err) { erro.textContent = err.message; }
    });
    el.querySelectorAll("[data-rep]").forEach((form) => form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fm = ev.target.elements;
      try {
        await ctx.store.resolverReporte(form.dataset.rep, { status: fm.status.value, resposta: fm.resposta.value });
        await recarregar("Reporte atualizado.");
      } catch (err) { toast(err.message, "erro"); }
    }));
  }
};

function tabelaDistratores(dq, pbisOpc) {
  const cel = (x) => (x.prop === null ? '<td class="muted">sem dado</td>' : '<td><span class="dq__v">' + pctTxt(x.prop) + '</span><span class="dq__bar" aria-hidden="true"><span style="width:' + Math.round((x.prop || 0) * 100) + '%"></span></span></td>');
  return '<table class="mini-tab dq"><caption class="sr-only">Escolha de cada alternativa no total e por quartil de habilidade</caption><thead><tr><th scope="col">Alternativa</th><th scope="col">Total</th>' +
    dq.n_quartil.map((n, i) => '<th scope="col">Q' + (i + 1) + (dq.por_quartil ? "<small>" + n + " pessoas</small>" : "") + "</th>").join("") + '<th scope="col">Bisserial</th></tr></thead><tbody>' +
    dq.opcoes.map((o) => '<tr class="' + (o.correta ? "is-correta" : "") + '"><th scope="row">' + e(o.letra) + (o.correta ? " <small>correta</small>" : "") + "</th>" +
      "<td><b>" + pctTxt(o.prop) + "</b><small>" + o.n + "</small></td>" + o.q.map(cel).join("") + "<td>" + numTxt(pbisOpc.get(o.letra) ?? null, 2) + "</td></tr>").join("") +
    (dq.em_branco.n ? '<tr><th scope="row">Em branco</th><td><b>' + pctTxt(dq.em_branco.prop) + "</b><small>" + dq.em_branco.n + "</small></td>" + dq.em_branco.q.map((p) => cel({ prop: p })).join("") + "<td></td></tr>" : "") +
    "</tbody></table>";
}

function blocoReporte(r) {
  const fechado = r.status === "resolvido" || r.status === "rejeitado";
  return '<li class="rep"><div class="rep__top"><b>' + e(MOTIVOS_REPORTE[r.motivo] || r.motivo) + '</b><span class="gar gar--' + (fechado ? "neutro" : r.status === "em_analise" ? "aviso" : "risco") + '">' + e(ROTULO_REPORTE[r.status] || r.status) + "</span>" +
    (r.sintetico ? '<span class="selo-demo">dados de demonstração</span>' : "") + '<small class="muted">' + e((r.autor_nome || "Aluno") + ", " + dataBR(r.criado_em) + (r.versao_item ? ", versão " + r.versao_item : "")) + "</small></div>" +
    (r.texto ? '<p class="rep__txt">' + e(r.texto) + "</p>" : "") +
    '<form class="rep__form" data-rep="' + e(r.id) + '" novalidate>' +
      '<div class="field"><label for="rs-' + e(r.id) + '">Situação</label><select id="rs-' + e(r.id) + '" name="status" class="input">' + STATUS_REPORTE.filter((s) => s !== "aberto" || r.status === "aberto").map((s) => '<option value="' + s + '"' + (s === r.status ? " selected" : "") + ">" + ROTULO_REPORTE[s] + "</option>").join("") + "</select></div>" +
      '<div class="field"><label for="rr-' + e(r.id) + '">Resposta ao aluno</label><input id="rr-' + e(r.id) + '" name="resposta" class="input" maxlength="2000" value="' + e(r.resposta || "") + '"></div>' +
      '<button class="btn btn--ghost btn--sm" type="submit">' + icon("check") + "Salvar</button>" +
    "</form></li>";
}

function textoMudanca(h) {
  if (h.acao === "gabarito") return "De " + h.de + " para " + h.para + "." + (h.recorrigidas !== null && h.recorrigidas !== undefined ? " " + plural(h.recorrigidas, "resposta recorrigida", "respostas recorrigidas") + "." : " Respostas antigas mantidas na versão anterior.");
  if (h.acao === "status") return "De " + (ROTULO_STATUS_ITEM[h.de] || h.de) + " para " + (ROTULO_STATUS_ITEM[h.para] || h.para) + ".";
  if (h.acao === "revisao") return h.para === "sim" ? "Marcado para revisão." : "Marca de revisão retirada.";
  return "Conteúdo novo (versão " + h.de + " para " + h.para + ").";
}
