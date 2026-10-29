/* Road to America | área administrativa: recalibração e desfechos reais
   1. Recalibra os b de Rasch com as respostas da turma (prévia, gravação e desfazer).
   2. Lança desfechos reais: resultado oficial (Pass/Fail; nota no Step 2 CK).
   3. Ajusta a regressão logística do Pass/Fail e as regressões lineares das notas
      sobre o theta do banco e grava o modelo para as telas dos alunos.
   Rotinas em plataforma/js/calibracao.js; método em PSICOMETRIA.md, seções 12 e 13. */
import { $, e, icon, toast, confirmar, num } from "../../../anki/js/ui.js";
import { prepararRecalibracao, aplicarRecalibracao, desfazerCalibracao, calibrarDesfechos, salvarModelo, MIN_RESPOSTAS_CALIBRACAO } from "../../../plataforma/js/calibracao.js";
import { RECALIBRACAO_PADRAO, DESFECHOS_PADRAO, correlacao } from "../../../plataforma/js/psicometria.js";
import { dataBR, plural } from "../../../plataforma/js/acompanhamento.js";
import { numTxt, pctTxt, PADRAO_STEP2CK } from "../analise.js";
import { dispersaoCalibracao, curvaLogistica, tabela } from "../graficos.js";
import { pageHead, abasStep, avisoDemoBanco, avisoLgpd, seloDemo } from "./comum.js";

const nomeStep = (s) => (s === "step1" ? "Step 1" : "Step 2 CK");

export default {
  titulo: "Calibração",
  async render(ctx, el, { params }) {
    const step = params.get("step") === "step2ck" ? "step2ck" : "step1";
    el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Abrindo a calibração...</p></div>';
    const [banco, { rows }, oficiais, modelos] = await Promise.all([
      ctx.bancoAdmin(), ctx.dados(), ctx.store.listResultadosOficiais({ todos: true, step }), ctx.store.getModelosPsicometricos()
    ]);
    const doStep = banco.steps[step] || [];
    const calibrados = doStep.filter((q) => Number.isFinite(q.b_calibrado));
    const reais = oficiais.filter((o) => !o.sintetico);
    const fict = oficiais.length - reais.length;
    const nomes = new Map(rows.map((r) => [r.id, r.nome]));
    const modelo = modelos[step];
    const hoje = new Date().toISOString().slice(0, 10);

    el.innerHTML = '<div class="wrap section-sm">' +
      pageHead({
        eyebrow: "Banco de questões",
        titulo: "Recalibração e desfechos",
        lead: "Enquanto não houver dados reais suficientes, a probabilidade vem do padrão provisório do banco (dificuldade-alvo dos itens) e não é oficial. Esta tela ajusta as dificuldades com as respostas da turma e liga o banco aos resultados reais do USMLE e às autoavaliações NBME."
      }) +
      avisoDemoBanco(ctx) +
      abasStep("calibracao", step) +

      '<section class="panel" aria-labelledby="rc-t"><div class="panel__head"><h2 class="h-sm" id="rc-t">1. Recalibrar as dificuldades com a turma</h2>' +
        '<p class="hint">Rasch por máxima verossimilhança conjunta com priori na dificuldade-alvo (τ = ' + numTxt(RECALIBRACAO_PADRAO.tau, 1) + " logit): com poucas respostas o item fica perto da dificuldade-alvo; com muitas, os dados mandam. A escala é ancorada para que o examinando no limiar mantenha o escore de corte do padrão do banco. Só recebem o b novo os itens com pelo menos " + MIN_RESPOSTAS_CALIBRACAO + " respostas (primeira resposta de cada pessoa, sem o modo tutor).</p></div>" +
        '<dl class="mini"><div><dt>Itens do ' + nomeStep(step) + "</dt><dd>" + num(doStep.length) + "</dd></div>" +
          "<div><dt>Calibrados hoje</dt><dd>" + num(calibrados.length) + "</dd></div>" +
          "<div><dt>Modelo em uso</dt><dd>" + (!calibrados.length ? "Dificuldade-alvo" : calibrados.length === doStep.length ? "Calibrado" : "Misto") + "<small>" + (!calibrados.length ? "sem calibração" : calibrados.length === doStep.length ? "todos os itens com b da turma" : "calibrado onde há dados") + "</small></dd></div>" +
          "<div><dt>Mínimo por item</dt><dd>" + MIN_RESPOSTAS_CALIBRACAO + "<small>respostas</small></dd></div></dl>" +
        '<p class="acts-row"><button class="btn btn--sm" type="button" data-previa>' + icon("gauge") + "Calcular a prévia com os dados da turma</button>" +
          (calibrados.length ? '<button class="btn btn--ghost btn--sm" type="button" data-desfazer>' + icon("arrow-counter-clockwise") + "Voltar todos à dificuldade-alvo</button>" : "") + "</p>" +
        '<div data-previa-out aria-live="polite"></div>' +
      "</section>" +

      '<section class="panel" aria-labelledby="df-t"><div class="panel__head"><h2 class="h-sm" id="df-t">2. Desfechos reais</h2>' +
        '<p class="hint">Lance o resultado oficial de quem já fez a prova: Pass ou Fail no Step 1; nota de três dígitos no Step 2 CK (a partir de 01/07/2025, a nota define o Pass pelo padrão de ' + PADRAO_STEP2CK + "). Os escores NBME entram sozinhos: são as autoavaliações em standard-paced que os alunos lançam em \"Meu progresso\".</p></div>" +
        '<form class="form-grid form-grid--3" data-desfecho novalidate>' +
          '<div class="field"><label for="df-u">Participante</label><select id="df-u" name="user_id" class="input" required><option value="">Escolha</option>' + rows.map((r) => '<option value="' + e(r.id) + '">' + e(r.nome) + (r.sintetico ? " (fictício)" : "") + "</option>").join("") + "</select></div>" +
          '<div class="field"><label for="df-d">Data da prova</label><input id="df-d" name="data" type="date" class="input" max="' + hoje + '" required></div>' +
          '<div class="field"><label for="df-r">Resultado</label><select id="df-r" name="resultado" class="input"><option value="">' + (step === "step2ck" ? "Pela nota" : "Escolha") + '</option><option value="pass">Pass</option><option value="fail">Fail</option></select></div>' +
          (step === "step2ck" ? '<div class="field"><label for="df-n">Nota (três dígitos)</label><input id="df-n" name="escore" type="number" min="1" max="999" step="1" inputmode="numeric" class="input input--num"></div>' : "") +
          '<div class="field form-grid__wide"><label for="df-o">Observação</label><input id="df-o" name="observacao" class="input" maxlength="1000" autocomplete="off"></div>' +
          '<p class="error form-grid__wide" data-df-erro role="alert"></p>' +
          '<div class="form-grid__acts"><button class="btn btn--sm" type="submit">' + icon("check") + "Lançar desfecho</button></div>" +
        "</form>" +
        (reais.length ? '<table class="mini-tab"><caption class="sr-only">Desfechos lançados no ' + nomeStep(step) + '</caption><thead><tr><th scope="col">Participante</th><th scope="col">Data</th><th scope="col">Resultado</th>' + (step === "step2ck" ? '<th scope="col">Nota</th>' : "") + '<th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>' +
          reais.map((o) => "<tr><td>" + e(nomes.get(o.user_id) || "participante") + "</td><td>" + e(dataBR(o.data)) + "</td><td><b>" + e(o.resultado === "pass" ? "Pass" : o.resultado === "fail" ? "Fail" : "sem resultado") + "</b></td>" + (step === "step2ck" ? "<td>" + (o.escore ?? "") + "</td>" : "") +
            '<td><button class="link-btn" type="button" data-del-res="' + e(o.id) + '">' + icon("trash") + "Excluir</button></td></tr>").join("") + "</tbody></table>"
          : '<p class="body">Nenhum desfecho real lançado no ' + nomeStep(step) + ".</p>") +
        (fict ? '<p class="hint">' + seloDemo(true) + " Além destes, " + plural(fict, "desfecho fictício", "desfechos fictícios") + " de turmas anteriores simuladas entram na regressão da demonstração (só Pass ou Fail, sem nota de três dígitos).</p>" : "") +
      "</section>" +

      '<section class="panel" aria-labelledby="rg-t"><div class="panel__head"><h2 class="h-sm" id="rg-t">3. Regressão sobre o θ do banco</h2>' +
        '<p class="hint">Para cada desfecho, o θ do aluno é calculado só com as respostas dadas até a data da prova. Pass/Fail: regressão logística, considerada suficiente com pelo menos ' + DESFECHOS_PADRAO.min_por_classe + " aprovados e " + DESFECHOS_PADRAO.min_por_classe + " reprovados (cerca de 10 eventos por variável; Peduzzi e colaboradores, 1996). Notas: regressão linear com efeito do aluno (várias autoavaliações do mesmo aluno não contam como alunos diferentes), suficiente com pelo menos " + DESFECHOS_PADRAO.min_alunos + " alunos distintos (critério interno).</p></div>" +
        '<p class="acts-row"><button class="btn btn--sm" type="button" data-ajustar>' + icon("chart-bar") + "Ajustar os modelos</button></p>" +
        '<div data-reg-out aria-live="polite"></div>' +
        '<h3 class="h-xs">Modelo em uso nas telas dos alunos</h3>' + resumoModelo(modelo, step) +
      "</section>" +
      avisoLgpd() +
    "</div>";

    let preparo = null;
    /* o botão vai numa constante: depois de um await, ev.currentTarget já é null */
    $("[data-previa]", el).addEventListener("click", async (ev) => {
      const out = $("[data-previa-out]", el);
      const botao = ev.currentTarget;
      botao.disabled = true;
      out.innerHTML = '<p class="boot__msg" role="status">Recalibrando...</p>';
      try {
        preparo = await prepararRecalibracao({ store: ctx.store, step });
        out.innerHTML = htmlPrevia(preparo);
        $("[data-aplicar]", out)?.addEventListener("click", async () => {
          if (!(await confirmar("Gravar os b novos?", "Os " + preparo.a_aplicar + " itens com respostas suficientes passam a usar a dificuldade recalibrada na estimativa dos alunos. Dá para voltar à dificuldade-alvo depois.", "Gravar"))) return;
          try {
            const g = await aplicarRecalibracao({ store: ctx.store, preparo });
            ctx.invalidar();
            toast(plural(g.gravados, "item recalibrado", "itens recalibrados") + ".", "ok");
            await this.render(ctx, el, { params });
          } catch (err) { toast(err.message, "erro"); }
        });
      } catch (err) { out.innerHTML = '<p class="error" role="alert">' + e(err.message) + "</p>"; }
      botao.disabled = false;
    });
    $("[data-desfazer]", el)?.addEventListener("click", async () => {
      if (!(await confirmar("Voltar todos à dificuldade-alvo?", "Os " + calibrados.length + " itens calibrados do " + nomeStep(step) + " voltam a usar o b da dificuldade-alvo.", "Voltar à dificuldade-alvo", true))) return;
      await desfazerCalibracao({ store: ctx.store, ids: calibrados.map((q) => q.id) });
      ctx.invalidar();
      toast("Calibração desfeita.", "ok");
      await this.render(ctx, el, { params });
    });
    $("[data-desfecho]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target).entries());
      const erro = $("[data-df-erro]", el);
      erro.textContent = "";
      if (!d.user_id) { erro.textContent = "Escolha o participante."; return; }
      try {
        await ctx.store.saveResultadoOficial({ user_id: d.user_id, step, data: d.data, resultado: d.resultado || null, escore: d.escore ? Number(d.escore) : null, observacao: d.observacao || "" });
        toast("Desfecho lançado.", "ok");
        await this.render(ctx, el, { params });
      } catch (err) { erro.textContent = err.message; }
    });
    el.querySelectorAll("[data-del-res]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmar("Excluir este desfecho?", "O resultado sai da regressão. O modelo já gravado só muda quando for ajustado e salvo de novo.", "Excluir", true))) return;
      try { await ctx.store.deleteResultadoOficial(b.dataset.delRes); toast("Desfecho excluído.", "ok"); await this.render(ctx, el, { params }); }
      catch (err) { toast(err.message, "erro"); }
    }));
    $("[data-ajustar]", el).addEventListener("click", async (ev) => {
      const out = $("[data-reg-out]", el);
      const botao = ev.currentTarget;
      botao.disabled = true;
      out.innerHTML = '<p class="boot__msg" role="status">Ajustando...</p>';
      try {
        const d = await calibrarDesfechos({ store: ctx.store, step });
        out.innerHTML = htmlRegressao(d, step);
        $("[data-salvar-modelo]", out)?.addEventListener("click", async () => {
          if (!(await confirmar("Salvar o modelo?", (d.demonstracao ? "Modo demonstração: o modelo usa desfechos fictícios e fica marcado como demonstração. " : "") + "As telas dos alunos passam a mostrar também a probabilidade pelos desfechos reais quando o modelo for suficiente.", "Salvar o modelo"))) return;
          try { await salvarModelo({ store: ctx.store, step, desfechos: d }); ctx.invalidar(); toast("Modelo salvo.", "ok"); await this.render(ctx, el, { params }); }
          catch (err) { toast(err.message, "erro"); }
        });
      } catch (err) { out.innerHTML = '<p class="error" role="alert">' + e(err.message) + "</p>"; }
      botao.disabled = false;
    });
  }
};

function htmlPrevia(p) {
  const apl = p.itens.filter((i) => i.aplicar);
  const r = apl.length > 2 ? correlacao(apl.map((i) => i.b_angoff), apl.map((i) => i.b)) : null;
  const mad = apl.length ? apl.reduce((s, i) => s + Math.abs(i.delta), 0) / apl.length : null;
  const maiores = apl.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
  return '<div class="previa">' +
    '<dl class="mini"><div><dt>Convergência</dt><dd>' + (p.convergiu ? "Sim" : "Não") + "<small>" + plural(p.iteracoes, "iteração", "iterações") + "</small></dd></div>" +
      "<div><dt>Matriz</dt><dd>" + num(p.respostas) + "<small>respostas de " + plural(p.pessoas, "pessoa", "pessoas") + "</small></dd></div>" +
      "<div><dt>Recebem o b novo</dt><dd>" + num(p.a_aplicar) + "<small>de " + num(p.itens.length) + " com respostas</small></dd></div>" +
      "<div><dt>Mudança média</dt><dd>" + (mad === null ? "sem dado" : numTxt(mad, 2)) + "<small>logit, em módulo" + (r === null ? "" : "; correlação com a dificuldade-alvo " + numTxt(r, 2)) + "</small></dd></div></dl>" +
    '<div class="grid2 grid2--mult"><figure class="mult"><figcaption class="mult__t">b da dificuldade-alvo contra b recalibrado</figcaption>' + dispersaoCalibracao(p.itens, { titulo: "Dificuldade-alvo contra a recalibrada" }) +
      '<p class="hint">Pontos acima da diagonal: itens mais difíceis do que os autores estimaram. Anéis: menos de ' + p.parametros.min_respostas + " respostas, ficam na dificuldade-alvo. Deslocamento da ancoragem: " + numTxt(p.deslocamento, 2) + " logit.</p></figure>" +
      '<div><h3 class="h-xs">Maiores mudanças</h3>' + (maiores.length ? '<table class="mini-tab"><caption class="sr-only">Itens com maior mudança de dificuldade</caption><thead><tr><th scope="col">Item</th><th scope="col">Alvo</th><th scope="col">Novo</th><th scope="col">Respostas</th></tr></thead><tbody>' +
        maiores.map((i) => '<tr><td><a href="#/item/' + encodeURIComponent(i.id) + '">' + e(i.id) + "</a></td><td>" + numTxt(i.b_angoff, 2) + "</td><td><b>" + numTxt(i.b, 2) + "</b><small>EP " + numTxt(i.ep, 2) + "</small></td><td>" + i.n + "</td></tr>").join("") + "</tbody></table>" : '<p class="body">Nenhum item com respostas suficientes.</p>') + "</div></div>" +
    tabela("Prévia da recalibração", ["Item", "b da dificuldade-alvo", "b novo", "Erro-padrão", "Respostas", "Recebe o b novo"], p.itens.map((i) => [i.id, numTxt(i.b_angoff, 2), numTxt(i.b, 2), numTxt(i.ep, 2), String(i.n), i.aplicar ? "sim" : "não"])) +
    (p.a_aplicar ? '<p class="acts-row"><button class="btn btn--sm" type="button" data-aplicar>' + icon("check") + "Gravar os b novos (" + p.a_aplicar + " itens)</button></p>" : '<p class="hint">Nenhum item tem ' + p.parametros.min_respostas + " respostas ainda. Nada a gravar.</p>") +
  "</div>";
}

function htmlRegressao(d, step) {
  const pf = d.pass_fail;
  const t50 = pf.beta1 ? -pf.beta0 / pf.beta1 : null;
  const linear = (m, rotulo) => !m || m.a === null ? '<p class="body">' + e(rotulo) + ": " + e(m?.aviso || "sem dados.") + "</p>"
    : '<p class="body"><b>' + e(rotulo) + "</b>: nota = " + numTxt(m.a, 1) + " + " + numTxt(m.b, 1) + " × θ (desvio para um aluno novo " + numTxt(m.sigma, 1) + (Number.isFinite(m.tau) && m.tau > 0 ? ", dos quais " + numTxt(m.tau, 1) + " do efeito do aluno" : "") + ", R² " + numTxt(m.r2, 2) + ", " + plural(m.n, "nota", "notas") + (Number.isFinite(m.n_alunos) ? " de " + plural(m.n_alunos, "aluno", "alunos") : "") + "). " + (m.suficiente ? "Suficiente." : e(m.aviso)) + "</p>";
  const algum = pf.suficiente || d.escore_nbme?.suficiente || d.escore_oficial?.suficiente || d.efeito_modo?.suficiente || d.ligacao_nbme?.suficiente;
  const lg = d.ligacao_nbme;
  const ligacao = !lg ? "" : '<h3 class="h-xs">Limiar ligado às autoavaliações NBME</h3>' +
    (lg.mu === null ? '<p class="body">' + e(lg.motivo) + "</p>"
      : '<p class="body" data-ligacao-nbme>θ em que o escore NBME previsto atinge ' + lg.limiar + ": <b>" + numTxt(lg.mu, 2) + "</b> logit (erro-padrão " + numTxt(lg.ep, 2) + ", método delta; " + plural(lg.n, "escore", "escores") + (Number.isFinite(lg.n_alunos) ? " de " + plural(lg.n_alunos, "aluno", "alunos") : "") + "). O limiar provisório do banco está em 0; a diferença mede o viés do padrão provisório. " +
        (lg.suficiente ? "Suficiente: ao salvar, as telas trocam o limiar provisório por este, com a incerteza dele." : "Ainda não vai para as telas: " + e(lg.motivo)) + "</p>");
  return '<div class="reg">' +
    '<h3 class="h-xs">Pass/Fail oficial</h3>' +
    (pf.beta0 === null ? '<p class="body">' + e(pf.aviso) + " (" + plural(pf.aprovados, "aprovado", "aprovados") + ", " + plural(pf.reprovados, "reprovado", "reprovados") + ".)</p>" :
      '<div class="grid2 grid2--mult"><figure class="mult"><figcaption class="mult__t">Probabilidade de Pass pelo θ</figcaption>' + curvaLogistica(d.dados.oficiais.filter((x) => x.resultado), pf, { titulo: "Regressão logística do resultado oficial sobre o θ do banco, " + nomeStep(step) }) +
        '<p class="hint">Linha vermelha: limiar do banco (θ = 0, padrão provisório). Linha verde: onde a probabilidade ajustada passa de 50%. Se as duas estão longe, o padrão provisório está mais rígido ou mais frouxo que a prova real.</p></figure>' +
      '<dl class="mini mini--2"><div><dt>Desfechos</dt><dd>' + num(pf.n) + "<small>" + plural(pf.aprovados, "Pass", "Pass") + ", " + plural(pf.reprovados, "Fail", "Fail") + "</small></dd></div>" +
        "<div><dt>Coeficientes</dt><dd>" + numTxt(pf.beta0, 2) + " e " + numTxt(pf.beta1, 2) + "<small>β0 (EP " + numTxt(pf.ep0, 2) + ") e β1 (EP " + numTxt(pf.ep1, 2) + ")</small></dd></div>" +
        "<div><dt>Discriminação</dt><dd>" + numTxt(pf.auc, 2) + "<small>área sob a curva ROC</small></dd></div>" +
        "<div><dt>Escore de Brier</dt><dd>" + numTxt(pf.brier, 3) + "<small>menor é melhor</small></dd></div>" +
        "<div><dt>θ com 50% de Pass</dt><dd>" + (t50 === null ? "sem dado" : numTxt(t50, 2)) + "<small>limiar do banco em 0</small></dd></div>" +
        "<div><dt>Taxa de resposta</dt><dd>" + (pf.taxa_resposta === null || pf.taxa_resposta === undefined ? "sem dado" : pctTxt(pf.taxa_resposta)) + "<small>" + (pf.nao_respondentes ? plural(pf.nao_respondentes, "elegível sem resultado", "elegíveis sem resultado") + (pf.ponderado ? "; ajuste ponderado pelo inverso da probabilidade de informar" : "") : "sem não respondentes identificados") + "</small></dd></div>" +
        "<div><dt>Situação</dt><dd>" + (pf.suficiente ? "Suficiente" : pf.exploratorio ? "Exploratório" : "Insuficiente") + "<small>" + e(pf.aviso || "pode ir para as telas dos alunos, com o intervalo pela incerteza dos coeficientes") + "</small></dd></div></dl></div>") +
    (d.efeito_modo && d.efeito_modo.delta !== null ? '<h3 class="h-xs">Efeito do modo tutor</h3><p class="body">No tutor, o acerto fica ' + numTxt(d.efeito_modo.delta, 2) + " logit acima do cronometrado (erro-padrão " + numTxt(d.efeito_modo.ep, 2) + ", " + plural(d.efeito_modo.n_tutor, "resposta", "respostas") + " no tutor de " + plural(d.efeito_modo.pessoas, "pessoa", "pessoas") + "). " + (d.efeito_modo.suficiente ? "Ao salvar, as telas passam a corrigir o b dos itens respondidos no tutor." : "Poucas respostas no tutor: não vai para as telas.") + "</p>" : "") +
    '<h3 class="h-xs">Notas</h3>' +
    (step === "step2ck" ? linear(d.escore_oficial, "Nota oficial do Step 2 CK") : "") +
    linear(d.escore_nbme, "Escore NBME em standard-paced") +
    ligacao +
    (step === "step2ck" ? '<p class="hint">A nota de três dígitos só aparece para o aluno quando o modelo da nota oficial for suficiente. Até lá, a tela mostra só a probabilidade de atingir o limiar do banco, fixado para representar o ' + PADRAO_STEP2CK + ".</p>" : "") +
    (algum ? '<p class="acts-row"><button class="btn btn--sm" type="button" data-salvar-modelo>' + icon("check") + "Salvar o modelo para as telas dos alunos</button></p>" : '<p class="hint">Nenhum modelo suficiente ainda: nada muda nas telas dos alunos, que continuam com a estimativa pelo padrão provisório do banco.</p>') +
  "</div>";
}

function resumoModelo(m, step) {
  if (!m) return '<p class="body">Nenhum modelo gravado no ' + nomeStep(step) + ". As telas dos alunos usam só o padrão provisório do banco.</p>";
  const pf = m.desfechos;
  return '<p class="body">' + (m.demonstracao ? '<span class="selo-demo">dados de demonstração</span> ' : "") + "Gravado em " + e(dataBR(m.atualizado_em)) + ". " +
    (pf ? "Pass/Fail com " + plural(pf.n, "desfecho", "desfechos") + ", β0 " + numTxt(pf.beta0, 2) + " e β1 " + numTxt(pf.beta1, 2) + ", área sob a curva " + numTxt(pf.auc, 2) + (pf.suficiente ? "." : ", ainda exploratório.") : "Sem modelo de Pass/Fail.") +
    (m.escore_nbme ? " Escore NBME: " + plural(m.escore_nbme.n, "nota", "notas") + (Number.isFinite(m.escore_nbme.n_alunos) ? " de " + plural(m.escore_nbme.n_alunos, "aluno", "alunos") : "") + (m.escore_nbme.suficiente ? "." : ", insuficiente.") : "") +
    (m.ligacao_nbme?.suficiente ? " Limiar ligado à NBME em " + numTxt(m.ligacao_nbme.mu, 2) + " logit (erro-padrão " + numTxt(m.ligacao_nbme.ep, 2) + "), em uso nas telas." : m.ligacao_nbme ? " Ligação com a NBME ainda insuficiente." : "") +
    (step === "step2ck" && m.escore_oficial ? " Nota oficial: " + plural(m.escore_oficial.n, "nota", "notas") + (m.escore_oficial.suficiente ? "." : ", insuficiente para mostrar a nota ao aluno.") : "") + "</p>";
}
export { pctTxt };
