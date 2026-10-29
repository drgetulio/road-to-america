/* Road to America | banco de questões: painel de probabilidade de aprovação.
   Para o Step escolhido: probabilidade, intervalo de 90%, rótulo de confiança,
   quantos itens e quais sistemas faltam para alta confiança, áreas que mais derrubam
   a probabilidade (contribuição de cada área), recomendações de estudo ligadas ao
   Conteúdo do Step 1, aos flashcards e ao banco, e a prontidão combinada com a
   EXIT 18. Método em plataforma/PSICOMETRIA.md. */
import { resumoAprovacao, curvaPosterior } from "../../../plataforma/js/banco-aluno.js";
import { REGRA_CONFIANCA, PESOS_MODO, PRIORI_PADRAO, PADRAO_STEP2CK } from "../../../plataforma/js/psicometria.js";
import { $, e, icon } from "../../../anki/js/ui.js";
import { cabecalho, abas, seletorStep, NOME_STEP, pct, pctProb, num, plural, nome, ROTULO_DIM, svgPosterior, chipConfianca, linksHtml, barraLimiar } from "../comum.js";

const ROTULO_PR = { pronto: ["Pronto pela EXIT 18", "ok"], nao_pronto: ["Ainda não pela EXIT 18", "risco"], insuficiente: ["Faltam autoavaliações NBME", "neutro"], aprovado: ["Step aprovado", "ok"] };

function criterio(ok, titulo, detalhe) {
  return '<li class="prog-check__i prog-check__i--' + (ok ? "ok" : "pend") + '">' + icon(ok ? "check-circle" : "x-circle") +
    "<div><b>" + e(titulo) + '</b><span class="sr-only"> (' + (ok ? "atendido" : "falta") + ")</span><p>" + detalhe + "</p></div></li>";
}

export default {
  titulo: "Probabilidade de aprovação",
  async render(ctx, el, { params }) {
    el.innerHTML = "<div data-raiz></div>";
    const raiz = $("[data-raiz]", el);
    const [modelos, nbme, config] = await Promise.all([
      ctx.store.getModelosPsicometricos().catch(() => ({})),
      ctx.store.listNbme().catch(() => []),
      ctx.store.getConfigPlataforma().catch(() => undefined)
    ]);
    let step = ["step1", "step2ck"].includes(params.get("step")) ? params.get("step") : ctx.step;

    const desenhar = () => {
      const r = resumoAprovacao({ banco: ctx.banco, respostas: ctx.respostas, step, modelos, nbme, config });
      const est = r.est;
      const conf = est.confianca;
      const cob = est.cobertura;
      const post = curvaPosterior(ctx.respostas, ctx.banco.porId, step);
      const pe = est.percentual_esperado;
      const decidida = est.p_aprovacao >= REGRA_CONFIANCA.p_alta || est.p_aprovacao <= REGRA_CONFIANCA.p_baixa;
      const derrubam = (r.contribuicao.sistema || []).filter((c) => c.ganho >= 0.005).slice(0, 5);
      const sustentam = (r.contribuicao.sistema || []).filter((c) => c.ganho <= -0.005).slice(-3).reverse();
      const pr = r.prontidao;
      const prRot = ROTULO_PR[pr.status] || ROTULO_PR.insuficiente;
      const textoFalta = conf.alta ? "Os três critérios da alta confiança estão atendidos."
        : conf.perto_do_limiar ? "Seu desempenho está praticamente no limiar: mais itens deixam o intervalo mais estreito, mas quase não mudam a probabilidade. O que muda a classificação é estudar as áreas abaixo."
        : conf.faltam_itens ? "Faltam cerca de " + plural(conf.faltam_itens, "item cronometrado", "itens cronometrados") + " no seu nível atual" + (conf.faltam_sistemas.length ? " e itens em " + plural(conf.faltam_sistemas.length, "sistema", "sistemas") : "") + " para a estimativa poder ser rotulada como de alta confiança."
        : conf.faltam_sistemas.length ? "Faltam itens em " + plural(conf.faltam_sistemas.length, "sistema", "sistemas") + "." : "";

      raiz.innerHTML = '<div class="wrap section-sm q-pag q-aprov">' +
        cabecalho({ titulo: "Probabilidade de aprovação", lead: e(r.limiar_texto) + " Estimativa do banco, complementar à EXIT 18; não é resultado oficial." }) +
        abas("aprovacao") +
        seletorStep(step) +

        '<div class="q-aprov__topo">' +
          '<article class="q-placa q-placa--grande" aria-labelledby="ap-t">' +
            '<div class="q-placa__topo"><span class="exit-tab"><small>EXIT</small><b>' + (step === "step1" ? "S1" : "CK") + '</b></span><h2 class="q-placa__step" id="ap-t">' + NOME_STEP[step] + "</h2>" + chipConfianca(conf) + "</div>" +
            (est.n
              ? '<p class="q-placa__p"><b>' + pctProb(est.p_aprovacao) + "</b><span>" + (step === "step2ck" ? "de atingir o padrão de aprovação (" + PADRAO_STEP2CK + ") pelo limiar do banco" : "de estar acima do limiar de aprovação do banco") + "</span></p>"
              : '<p class="q-placa__p q-placa__p--vazio"><b>Sem estimativa</b><span>Ainda não há respostas do ' + NOME_STEP[step] + ". Com a priori do método, a probabilidade inicial é de 50%.</span></p>") +
            '<dl class="q-placa__dados">' +
              "<div><dt>Habilidade (θ)</dt><dd>" + num(est.theta, 2) + " <small>90%: " + num(est.ic90[0], 2) + " a " + num(est.ic90[1], 2) + "</small></dd></div>" +
              "<div><dt>Num formulário completo</dt><dd>" + (pe.media === null ? "sem dado" : pct(pe.media)) + " <small>90%: " + (pe.media === null ? "sem dado" : pct(pe.ic90[0]) + " a " + pct(pe.ic90[1])) + "</small></dd></div>" +
              "<div><dt>Limiar no mesmo formulário</dt><dd>" + (pe.limiar === null ? "sem dado" : pct(pe.limiar)) + " <small>média do Angoff</small></dd></div>" +
            "</dl>" +
            (est.desfechos ? '<p class="q-placa__falta">Pelos resultados oficiais da turma (regressão logística com ' + est.desfechos.modelo.n + " alunos" + (r.modelo_demonstracao ? ", dados de demonstração" : "") + "): " + pctProb(est.desfechos.p_aprovacao) + ".</p>" : "") +
            (est.escore ? '<p class="q-placa__falta">Nota estimada pelas notas reais: ' + Math.round(est.escore.media) + " (90%: " + Math.round(est.escore.ic90[0]) + " a " + Math.round(est.escore.ic90[1]) + "); probabilidade de " + PADRAO_STEP2CK + " ou mais: " + pctProb(est.escore.p_limiar) + ".</p>" : "") +
          "</article>" +
          '<section class="panel q-aprov__post" aria-labelledby="po-t"><div class="panel__head"><h2 class="h-sm" id="po-t">Onde a sua habilidade provavelmente está</h2>' +
            '<p class="hint">Escala de Rasch ancorada no padrão do banco: o zero é o examinando no limiar de aprovação. A área sombreada à direita do zero é a probabilidade de aprovação.</p></div>' +
            svgPosterior(post, { titulo: "Distribuição da habilidade estimada no " + NOME_STEP[step] }) +
            '<p class="hint">Com ' + plural(est.n, "item respondido", "itens respondidos") + " (" + num(est.n_efetivo, 1) + " pelo peso do modo), desvio-padrão posterior de " + num(est.dp, 2) + " logit.</p>" +
          "</section>" +
        "</div>" +

        '<ul class="q-avisos">' + est.avisos.map((a) => "<li>" + icon("info") + "<span>" + e(a) + "</span></li>").join("") + "</ul>" +

        '<div class="grid2 grid2--top">' +
          '<section class="panel" aria-labelledby="cf-t"><div class="panel__head"><h2 class="h-sm" id="cf-t">Para chegar à alta confiança</h2>' +
            '<p class="hint">O rótulo só aparece quando as três condições valem ao mesmo tempo.</p></div>' +
            '<ul class="prog-check">' +
              criterio(decidida, "Probabilidade decidida", "Precisa estar em " + pct(REGRA_CONFIANCA.p_alta) + " ou mais, ou em " + pct(REGRA_CONFIANCA.p_baixa) + " ou menos. Agora: " + pctProb(est.p_aprovacao) + ".") +
              criterio(conf.faltam_itens_minimo === 0, "Itens suficientes", "Mínimo de " + conf.n_minimo + " itens, o número com que o examinando no limiar chega a desvio-padrão posterior de " + num(REGRA_CONFIANCA.dp_max, 2) + ". Você tem " + num(est.n_efetivo, 1) + (conf.faltam_itens_minimo ? "; faltam " + conf.faltam_itens_minimo + "." : ".") + " Cronometrado vale " + num(PESOS_MODO.cronometrado, 0) + "; tutor, " + num(PESOS_MODO.tutor, 1) + ".") +
              criterio(cob.proporcao >= REGRA_CONFIANCA.cobertura_min, "Sistemas cobertos", "Itens em pelo menos " + pct(REGRA_CONFIANCA.cobertura_min) + " dos " + cob.total + " sistemas do outline. Você tem " + cob.com_itens.length + "." +
                (cob.faltando.length ? " Sem itens: " + cob.faltando.map((k) => '<a href="#/criar?step=' + step + "&sistema=" + encodeURIComponent(k) + '&situacao=nao_vistas">' + e(nome(step, "sistema", k)) + "</a>").join("; ") + "." : "")) +
            "</ul>" +
            (textoFalta ? '<p class="q-falta">' + icon("path") + "<span>" + e(textoFalta) + "</span></p>" : "") +
          "</section>" +
          '<section class="panel" aria-labelledby="pr-t"><div class="panel__head"><h2 class="h-sm" id="pr-t">Prontidão para manter a data</h2></div>' +
            '<p class="prog-pr__t"><span class="prog-chip prog-chip--' + prRot[1] + '">' + e(prRot[0]) + "</span>" + (pr.divergente ? '<span class="prog-chip prog-chip--aviso">' + icon("warning") + "Banco e NBME divergem</span>" : "") + "</p>" +
            '<p class="body">' + e(pr.mensagem) + "</p>" +
            '<p class="hint">' + e(pr.regra) + ' Lance as autoavaliações em <a href="../anki/#/progresso">Meu progresso</a>.</p>' +
          "</section>" +
        "</div>" +

        '<section class="panel" aria-labelledby="dr-t"><div class="panel__head"><h2 class="h-sm" id="dr-t">Áreas que mais derrubam a probabilidade</h2>' +
          '<p class="hint">Para cada sistema, quanto a probabilidade subiria se, só nele, você acertasse o que o examinando no limiar acerta nos mesmos itens. As contribuições não se somam.</p></div>' +
          (derrubam.length
            ? '<div class="q-tab-wrap"><table class="q-tab"><thead><tr><th scope="col">Sistema</th><th scope="col" class="num">Certas</th><th scope="col">Você e o limiar</th><th scope="col" class="num">Em jogo</th><th scope="col" class="num">Peso na prova</th></tr></thead><tbody>' +
              derrubam.map((c) => '<tr><th scope="row">' + e(nome(step, "sistema", c.chave)) + '</th><td class="num">' + c.acertos + "/" + c.n + "</td><td>" + barraLimiar(c.taxa, c.taxa_limiar, "Você " + pct(c.taxa) + "; limiar " + pct(c.taxa_limiar)) + '<span class="q-tab__sub">' + pct(c.taxa) + " contra " + pct(c.taxa_limiar) + '</span></td><td class="num"><b>+' + num(c.ganho * 100, 1) + " p.p.</b></td>" +
                '<td class="num">' + (c.peso_prova === null ? "sem faixa" : pct(c.peso_prova)) + "</td></tr>").join("") + "</tbody></table></div>"
            : '<p class="body">' + (est.n ? "Nenhum sistema tira mais de meio ponto percentual da probabilidade agora." : "Sem respostas ainda.") + "</p>") +
          (sustentam.length ? '<p class="hint">Sustentam a probabilidade: ' + sustentam.map((c) => e(nome(step, "sistema", c.chave)) + " (" + num(c.ganho * 100, 1) + " p.p.)").join("; ") + ".</p>" : "") +
          '<p class="hint">Peso na prova: ponto médio da faixa oficial do outline (usmle.org, consulta em 28/10/2026).</p>' +
        "</section>" +

        '<section class="panel" aria-labelledby="rc-t"><div class="panel__head"><h2 class="h-sm" id="rc-t">O que estudar agora</h2>' +
          '<p class="hint">Na ordem em que mais mexem na probabilidade. ' + (step === "step2ck" ? "Os flashcards e o Conteúdo do Step 1 trazem a ciência básica do sistema; os itens do banco são de Step 2 CK." : "Cada sistema leva ao trecho do Conteúdo do Step 1, aos flashcards em modo treino e a um bloco já filtrado.") + "</p></div>" +
          (r.recomendacoes.length
            ? '<ol class="q-recs">' + r.recomendacoes.map((x) => '<li class="q-rec"><h3 class="q-rec__t">' + e(x.nome) + (x.ganho ? ' <span class="prog-chip prog-chip--risco">+' + num(x.ganho * 100, 1) + " p.p.</span>" : "") + '</h3><p class="body">' + e(x.texto) + "</p>" + linksHtml(x.links) + "</li>").join("") + "</ol>"
            : '<p class="body">Sem recomendação pendente: a estimativa tem alta confiança e nenhuma área tira probabilidade de forma mensurável. Mantenha blocos cronometrados mistos e siga a EXIT 18.</p>') +
        "</section>" +

        '<details class="panel q-metodo"><summary class="h-sm">Como a estimativa é calculada</summary><div class="q-metodo__corpo">' +
          "<p>Cada item tem um valor de Angoff: a probabilidade, estimada pelo autor, de o examinando minimamente competente acertá-lo (Angoff, 1971). No modelo de Rasch ancorado no limiar, a dificuldade do item é b = −logit(Angoff), e o examinando com habilidade θ = 0 acerta cada item exatamente com essa probabilidade. A habilidade é estimada pela média posterior (EAP) numa grade de −6 a 6, com priori normal de média " + num(PRIORI_PADRAO.media, 0) + " e desvio-padrão " + num(PRIORI_PADRAO.dp, 1) + ". A probabilidade de aprovação é P(θ > 0 | respostas).</p>" +
          "<p>Entram a primeira resposta a cada item do banco, dos simulados completos e dos blocos de 30 minutos. O modo tutor pesa " + num(PESOS_MODO.tutor, 1) + " (critério interno). Item deixado em branco no banco não entra; no simulado, conta como erro, como na prova.</p>" +
          "<p>A contribuição de cada área troca, só naquela área, as suas respostas pelo acerto esperado do examinando no limiar e recalcula a probabilidade. Numa validação com 300 alunos simulados com um sistema fraco sorteado (cerca de 200 itens cada), o sistema fraco foi o primeiro da lista em 82% dos casos e um dos dois primeiros em 92%.</p>" +
          "<p>Limitações: o padrão é tão bom quanto o julgamento de Angoff; a probabilidade considera só a incerteza estatística de θ, não a do padrão; itens de banco respondidos em casa diferem da prova. Quando houver resultados oficiais suficientes da turma, a equipe recalibra os itens e ajusta o modelo aos desfechos reais" + (step === "step2ck" ? "; só então a nota de três dígitos poderá ser estimada" : "") + ". O documento completo, com fórmulas e referências, está em plataforma/PSICOMETRIA.md.</p>" +
        "</div></details>" +
      "</div>";
    };
    desenhar();
    raiz.addEventListener("change", (ev) => {
      if (ev.target.name !== "step-tela") return;
      step = ev.target.value;
      ctx.step = step;
      desenhar();
      $('input[name="step-tela"]:checked', raiz)?.focus();
    });
  }
};
