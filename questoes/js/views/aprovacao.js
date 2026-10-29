/* Road to America | banco de questões: painel da probabilidade de estar acima do
   limiar do banco (padrão provisório até o painel de juízes).
   Para o Step escolhido: probabilidade (com a incerteza do padrão), intervalo de 90%,
   rótulo de precisão, quantos itens e quais sistemas faltam para a precisão alta, áreas que mais derrubam
   a probabilidade (contribuição de cada área), recomendações de estudo ligadas ao
   Conteúdo do Step 1, aos flashcards e ao banco, e a prontidão combinada com a
   EXIT 18. Método em plataforma/PSICOMETRIA.md. */
import { resumoAprovacao, curvaPosterior } from "../../../plataforma/js/banco-aluno.js";
import { REGRA_CONFIANCA, PESOS_MODO, PRIORI_PADRAO, PADRAO_STEP2CK, INCERTEZA_CORTE, nomePadrao, padraoProvisorio, textoPublicosFora } from "../../../plataforma/js/psicometria.js";
import { resumoRevisao, resumoMidia } from "../../../plataforma/js/banco.js";
import { $, e, icon } from "../../../anki/js/ui.js";
import { cabecalho, abas, seletorStep, NOME_STEP, pct, pctProb, num, plural, nome, ROTULO_DIM, svgPosterior, chipConfianca, linksHtml, barraLimiar } from "../comum.js";

const ROTULO_PR = { pronto: ["Pronto pela EXIT 18", "ok"], nao_pronto: ["Ainda não pela EXIT 18", "risco"], insuficiente: ["Faltam autoavaliações NBME", "neutro"], aprovado: ["Step aprovado", "ok"] };

function criterio(ok, titulo, detalhe) {
  return '<li class="prog-check__i prog-check__i--' + (ok ? "ok" : "pend") + '">' + icon(ok ? "check-circle" : "x-circle") +
    "<div><b>" + e(titulo) + '</b><span class="sr-only"> (' + (ok ? "atendido" : "falta") + ")</span><p>" + detalhe + "</p></div></li>";
}

export default {
  titulo: "Acima do limiar do banco",
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
      const post = curvaPosterior(ctx.respostas, ctx.banco.porId, step, { centro: est.corte.centro || 0, efeitoModo: modelos?.[step]?.efeito_modo || null });
      const pe = est.percentual_esperado;
      const decidida = est.p_aprovacao >= REGRA_CONFIANCA.p_alta || est.p_aprovacao <= REGRA_CONFIANCA.p_baixa;
      const derrubam = (r.contribuicao.sistema || []).filter((c) => c.ganho !== null && c.ganho >= 0.005).slice(0, 5);
      const sustentam = (r.contribuicao.sistema || []).filter((c) => c.ganho !== null && c.ganho <= -0.005).slice(-3).reverse();
      const poucos = (r.contribuicao.sistema || []).filter((c) => c.poucos_itens);
      const provisorio = padraoProvisorio(est.corte.origem);
      const centro = est.corte.centro || 0;
      const sens = est.sensibilidade;
      const revisao = resumoRevisao(ctx.banco.steps?.[step] || []);
      const pr = r.prontidao;
      const prRot = ROTULO_PR[pr.status] || ROTULO_PR.insuficiente;
      const textoFalta = conf.alta ? "Os três critérios da precisão alta estão atendidos. A leitura é em relação ao padrão do banco" + (provisorio ? ", que ainda é provisório." : ".")
        : !est.n ? "Comece por blocos cronometrados mistos: o mínimo é de " + conf.n_minimo + " itens, espalhados pelos sistemas do outline."
        : conf.padrao_limita ? "Você está perto demais do limiar para a incerteza do padrão " + nomePadrao(est.corte.origem) + ": mais itens não decidem a classificação enquanto o padrão não for fixado (painel de juízes ou ligação com as autoavaliações NBME da turma). O que muda a leitura é estudar as áreas abaixo."
        : conf.perto_do_limiar ? "Seu desempenho está praticamente no limiar: mais itens deixam o intervalo mais estreito, mas quase não mudam a probabilidade. O que muda a classificação é estudar as áreas abaixo."
        : conf.faltam_itens ? "Faltam cerca de " + plural(conf.faltam_itens, "item cronometrado", "itens cronometrados") + " no seu nível atual" + (conf.faltam_sistemas.length ? " e itens em " + plural(conf.faltam_sistemas.length, "sistema", "sistemas") : "") + " para a estimativa poder ser rotulada como de precisão alta."
        : conf.faltam_sistemas.length ? "Faltam itens em " + plural(conf.faltam_sistemas.length, "sistema", "sistemas") + "." : "";

      const curto = !conf.alta && conf.faltam_itens && conf.faltam_itens > r.nao_vistos
        ? " Hoje restam " + plural(r.nao_vistos, "item não visto", "itens não vistos") + " do " + NOME_STEP[step] + " para a sua conta" + (ctx.banco.origem === "demonstracao" ? " (o modo demonstração tem só os itens públicos)" : "") + (r.reservados ? ", fora os " + r.reservados + " do formulário reservado para o seu simulado completo" : "") + "; os simulados completos também contam."
        : "";
      raiz.innerHTML = '<div class="wrap section-sm q-pag q-aprov">' +
        cabecalho({ titulo: "Acima do limiar do banco", lead: e(r.limiar_texto) + " Estimativa do banco, complementar à EXIT 18. Não é probabilidade de aprovação no USMLE nem resultado oficial." }) +
        abas("aprovacao") +
        seletorStep(step) +

        '<div class="q-aprov__topo">' +
          '<article class="q-placa q-placa--grande" aria-labelledby="ap-t">' +
            '<div class="q-placa__topo"><span class="exit-tab"><small>Step</small><b>' + (step === "step1" ? "1" : "CK") + '</b></span><h2 class="q-placa__step" id="ap-t">' + NOME_STEP[step] + "</h2>" + chipConfianca(conf) + "</div>" +
            (est.n
              ? '<p class="q-placa__p"><b>' + pctProb(est.p_aprovacao) + "</b><span>de estar acima do limiar do banco" + (step === "step2ck" ? ", que representa o " + PADRAO_STEP2CK : "") + " (padrão " + e(nomePadrao(est.corte.origem)) + ", com a incerteza dele)</span></p>"
              : '<p class="q-placa__p q-placa__p--vazio"><b>Sem estimativa</b><span>Ainda não há respostas do ' + NOME_STEP[step] + ". Com a priori do método, a probabilidade inicial é de 50%.</span></p>") +
            (!est.n ? "" : '<dl class="q-placa__dados">' +
              "<div><dt>Habilidade (θ)</dt><dd>" + num(est.theta, 2) + " <small>90%: " + num(est.ic90[0], 2) + " a " + num(est.ic90[1], 2) + "</small></dd></div>" +
              "<div><dt>Num formulário completo</dt><dd>" + (pe.media === null ? "sem dado" : pct(pe.media)) + " <small>90%: " + (pe.media === null ? "sem dado" : pct(pe.ic90[0]) + " a " + pct(pe.ic90[1])) + "</small></dd></div>" +
              "<div><dt>Limiar no mesmo formulário</dt><dd>" + (pe.limiar === null ? "sem dado" : pct(pe.limiar)) + " <small>" + (provisorio ? "média da dificuldade-alvo" : est.corte.origem === "nbme" ? "pela ligação com a NBME" : "média do Angoff do painel") + "</small></dd></div>" +
              "<div><dt>Distância ao limiar</dt><dd>" + num(est.theta - centro, 2) + " <small>90% com a incerteza do padrão: " + num(est.ic90_relativo[0], 2) + " a " + num(est.ic90_relativo[1], 2) + "</small></dd></div>" +
            "</dl>") +
            (est.desfechos ? '<p class="q-placa__falta">Pelos resultados oficiais da turma (regressão logística com ' + est.desfechos.modelo.n + " alunos, " + est.desfechos.modelo.reprovados + " reprovações" + (est.desfechos.modelo.taxa_resposta !== null && est.desfechos.modelo.taxa_resposta !== undefined ? ", taxa de resposta de " + pct(est.desfechos.modelo.taxa_resposta) : "") + (r.modelo_demonstracao ? ", dados de demonstração" : "") + "): " + pctProb(est.desfechos.p_aprovacao) + (est.desfechos.ic90?.[0] !== null && est.desfechos.ic90?.[0] !== undefined ? " (90% pela incerteza do modelo: " + pctProb(est.desfechos.ic90[0]) + " a " + pctProb(est.desfechos.ic90[1]) + ")" : "") + ". " + e(est.desfechos.texto) + ".</p>" : "") +
            (est.escore ? '<p class="q-placa__falta">Nota estimada pelas notas reais: ' + Math.round(est.escore.media) + " (90%: " + Math.round(est.escore.ic90[0]) + " a " + Math.round(est.escore.ic90[1]) + "); probabilidade de " + PADRAO_STEP2CK + " ou mais: " + pctProb(est.escore.p_limiar) + ".</p>" : "") +
          "</article>" +
          '<section class="panel q-aprov__post" aria-labelledby="po-t"><div class="panel__head"><h2 class="h-sm" id="po-t">Onde a sua habilidade provavelmente está</h2>' +
            '<p class="hint">Escala de Rasch ancorada no padrão do banco: o zero é o examinando no limiar. A curva mostra só a incerteza da medida; a probabilidade ao lado soma a incerteza do padrão provisório, por isso fica mais perto de 50% do que a área à direita do zero.</p></div>' +
            svgPosterior(post, { titulo: "Distribuição da habilidade estimada no " + NOME_STEP[step] }) +
            '<p class="hint">Com ' + plural(est.n, "item respondido", "itens respondidos") + " (" + num(est.n_efetivo, 1) + " pelo peso do modo), desvio-padrão posterior de " + num(est.dp, 2) + " logit.</p>" +
          "</section>" +
        "</div>" +

        '<ul class="q-avisos">' + est.avisos.map((a) => "<li>" + icon("info") + "<span>" + e(a) + "</span></li>").join("") +
          (textoPublicosFora(est) ? '<li data-publicos-fora>' + icon("info") + "<span>" + e(textoPublicosFora(est)) + "</span></li>" : "") +
          (sens && est.n ? '<li data-sensibilidade>' + icon("info") + "<span><strong>Se o padrão provisório estiver errado.</strong> Se o banco inteiro for cerca de " + sens.pontos + " pontos percentuais mais fácil do que a dificuldade-alvo supõe (" + num(sens.deslocamento, 2) + " logit, o que é plausível porque não há imagem clínica real licenciada e os achados de imagem vêm descritos no texto), a sua probabilidade seria " + pctProb(sens.itens_mais_faceis) + "; se for mais difícil na mesma medida, " + pctProb(sens.itens_mais_dificeis) + ". " + (sens.muda_leitura ? "Num desses cenários a sua leitura mudaria de faixa." : "Nos dois cenários a leitura fica na mesma faixa.") + "</span></li>" : "") +
          (revisao.aviso ? '<li data-aviso-revisao>' + icon("warning") + "<span>" + e(revisao.aviso) + "</span></li>" : "") +
        "</ul>" +

        '<div class="grid2 grid2--top">' +
          '<section class="panel" aria-labelledby="cf-t"><div class="panel__head"><h2 class="h-sm" id="cf-t">Para chegar à precisão alta</h2>' +
            '<p class="hint">O rótulo só aparece quando as três condições valem ao mesmo tempo.</p></div>' +
            '<ul class="prog-check">' +
              criterio(decidida, "Probabilidade decidida", "Precisa estar em " + pct(REGRA_CONFIANCA.p_alta) + " ou mais, ou em " + pct(REGRA_CONFIANCA.p_baixa) + " ou menos, já com a incerteza do padrão (" + num(est.corte.sigma, 2) + " logit). Agora: " + pctProb(est.p_aprovacao) + ".") +
              criterio(conf.faltam_itens_minimo === 0, "Itens suficientes", "Mínimo de " + conf.n_minimo + " itens, o número com que o examinando no limiar chega a desvio-padrão posterior de " + num(REGRA_CONFIANCA.dp_max, 2) + ". Você tem " + num(est.n_efetivo, 1) + (conf.faltam_itens_minimo ? "; faltam " + conf.faltam_itens_minimo + "." : ".") + " Cronometrado vale " + num(PESOS_MODO.cronometrado, 0) + "; tutor, " + num(PESOS_MODO.tutor, 1) + ".") +
              criterio(cob.proporcao >= REGRA_CONFIANCA.cobertura_min, "Sistemas cobertos", "Itens suficientes em pelo menos " + pct(REGRA_CONFIANCA.cobertura_min) + " dos " + cob.total + " sistemas do outline: pelo menos " + REGRA_CONFIANCA.min_por_sistema + " itens em cada um e metade do que o peso do sistema pede para o seu total de itens. Você tem " + cob.com_itens.length + "." +
                (cob.faltando.length ? " Com poucos itens: " + cob.faltando.map((k) => '<a href="#/criar?step=' + step + "&sistema=" + encodeURIComponent(k) + '&situacao=nao_vistas">' + e(nome(step, "sistema", k)) + "</a> (" + (cob.itens?.[k] ?? 0) + " de " + (cob.minimos?.[k] ?? REGRA_CONFIANCA.min_por_sistema) + ")").join("; ") + "." : "")) +
            "</ul>" +
            (textoFalta ? '<p class="q-falta">' + icon("path") + "<span>" + e(textoFalta + curto) + "</span></p>" : "") +
          "</section>" +
          '<section class="panel" aria-labelledby="pr-t"><div class="panel__head"><h2 class="h-sm" id="pr-t">Prontidão para manter a data</h2></div>' +
            '<p class="prog-pr__t"><span class="prog-chip prog-chip--' + prRot[1] + '">' + e(prRot[0]) + "</span>" + (pr.divergente ? '<span class="prog-chip prog-chip--aviso">' + icon("warning") + "Banco e NBME divergem</span>" : "") + "</p>" +
            '<p class="body">' + e(pr.mensagem) + "</p>" +
            '<p class="hint">' + e(pr.regra) + ' Lance as autoavaliações em <a href="../anki/#/progresso">Meu progresso</a>.</p>' +
          "</section>" +
        "</div>" +

        '<section class="panel" aria-labelledby="dr-t"><div class="panel__head"><h2 class="h-sm" id="dr-t">Áreas que mais derrubam a probabilidade</h2>' +
          '<p class="hint">Para cada sistema com pelo menos 5 itens respondidos, quanto a probabilidade subiria se, só nele, você acertasse o que o examinando no limiar acerta nos mesmos itens. As contribuições não se somam.</p></div>' +
          (derrubam.length
            ? '<div class="q-tab-wrap"><table class="q-tab"><thead><tr><th scope="col">Sistema</th><th scope="col" class="num">Certas</th><th scope="col">Você e o limiar</th><th scope="col" class="num">Em jogo</th><th scope="col" class="num">Peso na prova</th></tr></thead><tbody>' +
              derrubam.map((c) => '<tr><th scope="row">' + e(nome(step, "sistema", c.chave)) + '</th><td class="num">' + c.acertos + "/" + c.n + "</td><td>" + barraLimiar(c.taxa, c.taxa_limiar, "Você " + pct(c.taxa) + "; limiar " + pct(c.taxa_limiar)) + '<span class="q-tab__sub">' + pct(c.taxa) + " contra " + pct(c.taxa_limiar) + '</span></td><td class="num" data-rot="Em jogo"><b>+' + num(c.ganho * 100, 1) + " pontos</b></td>" +
                '<td class="num" data-rot="Peso na prova">' + (c.peso_prova === null ? "sem faixa" : pct(c.peso_prova)) + "</td></tr>").join("") + "</tbody></table></div>"
            : '<p class="body">' + (est.n ? "Nenhum sistema tira mais de meio ponto percentual da probabilidade agora." : "Sem respostas ainda.") + "</p>") +
          (sustentam.length ? '<p class="hint">Sustentam a probabilidade (se nestes sistemas você ficasse no nível do limiar, ela cairia): ' + sustentam.map((c) => e(nome(step, "sistema", c.chave)) + ", cairia " + num(-c.ganho * 100, 1) + " pontos").join("; ") + ".</p>" : "") +
          (poucos.length ? '<p class="hint">Poucos itens para calcular (menos de 5): ' + poucos.map((c) => e(nome(step, "sistema", c.chave)) + " (" + c.n + ")").join("; ") + ".</p>" : "") +
          '<p class="hint">Peso na prova: ponto médio da faixa oficial do outline (usmle.org, consulta em 28/10/2026).</p>' +
        "</section>" +

        '<section class="panel" aria-labelledby="rc-t"><div class="panel__head"><h2 class="h-sm" id="rc-t">O que estudar agora</h2>' +
          '<p class="hint">Sistemas, disciplinas e competências juntos, na ordem em que mais mexem na probabilidade; depois, o que falta de cobertura e de volume. ' + (step === "step2ck" ? "Os flashcards e o Conteúdo do Step 1 trazem a ciência básica do sistema; os itens do banco são de Step 2 CK." : "Cada sistema leva ao trecho do Conteúdo do Step 1, aos flashcards em modo treino e a um bloco já filtrado.") + "</p></div>" +
          (r.recomendacoes.length
            ? '<ol class="q-recs">' + r.recomendacoes.map((x) => '<li class="q-rec"><h3 class="q-rec__t">' + e(x.nome) + (x.ganho ? ' <span class="prog-chip prog-chip--risco">+' + num(x.ganho * 100, 1) + " pontos</span>" : "") + '</h3><p class="body">' + e(x.texto) + "</p>" + linksHtml(x.links) + "</li>").join("") + "</ol>"
            : '<p class="body">Sem recomendação pendente: a estimativa tem precisão alta e nenhuma área com itens suficientes tira probabilidade de forma mensurável. Mantenha blocos cronometrados mistos e siga a EXIT 18.</p>') +
        "</section>" +

        '<details class="panel q-metodo"><summary class="h-sm">Como a estimativa é calculada</summary><div class="q-metodo__corpo">' +
          "<p>Cada item tem uma dificuldade-alvo: a probabilidade, fixada pelos autores na especificação do item, de o examinando no limiar acertá-lo. Ela não é o julgamento de um painel de juízes (o método de Angoff, 1971); o painel ainda não foi feito, e por isso o limiar do banco é provisório. No modelo de Rasch, a dificuldade do item é b = −logit(dificuldade-alvo), e o examinando com habilidade θ = 0 acerta cada item com essa probabilidade. A habilidade é estimada pela média posterior (EAP) numa grade de −6 a 6, com priori normal de média " + num(PRIORI_PADRAO.media, 0) + " e desvio-padrão " + num(PRIORI_PADRAO.dp, 1) + ".</p>" +
          "<p>A probabilidade mostrada é P(θ > c | respostas), com o corte c incerto: c segue uma normal de média 0 e desvio-padrão de " + num(INCERTEZA_CORTE.provisorio, 1) + " logit enquanto o padrão for provisório (cerca de 15 pontos percentuais no item médio). Esse número não vem de dados: foi escolhido por simulação para que a precisão alta erre menos de 4% mesmo com o banco inteiro 0,75 logit mais fácil ou mais difícil do que a dificuldade-alvo supõe; com 1,0 logit de erro, a taxa volta a cerca de 5%. Quando a turma tiver pelo menos 30 autoavaliações NBME em standard-paced, o limiar passa a ser ligado a elas: é a habilidade em que o escore NBME previsto atinge o padrão de aprovação (196 no Step 1, 218 no Step 2 CK), e a incerteza passa a ser o erro-padrão dessa ligação. Se o painel de juízes publicar o Angoff de cada item, vale o erro-padrão do painel.</p>" +
          "<p>Entram a primeira resposta a cada item do banco, dos simulados completos e dos blocos de 30 minutos. As respostas são repesadas para a composição de sistemas da prova (fator de 1/3 a 3 por sistema), para que estudar só os sistemas fortes não infle a estimativa. O modo tutor pesa " + num(PESOS_MODO.tutor, 1) + " (critério interno); quando houver dados da turma, a dificuldade dos itens no tutor também é corrigida pelo deslocamento médio entre tutor e cronometrado. Item deixado em branco conta como erro no modo cronometrado e nos simulados, como na prova; no modo tutor, não entra.</p>" +
          "<p>A contribuição de cada área troca, só naquela área, as suas respostas pelo acerto esperado do examinando no limiar e recalcula a probabilidade. Áreas com menos de 5 itens ficam sem número. Numa validação com 300 alunos simulados com um sistema fraco sorteado (cerca de 200 itens cada), o sistema fraco foi o primeiro da lista em 82% dos casos e um dos dois primeiros em 92%.</p>" +
          "<p>Limitações: o padrão provisório vem do projeto do banco, e não de juízes; " + (() => { const md = resumoMidia(ctx.banco?.steps?.[step] || []); return md.com_imagem_real ? "só " + md.com_imagem_real + " dos " + md.total + " itens do " + NOME_STEP[step] + " trazem imagem clínica real licenciada" : "não há imagem clínica real licenciada no banco (" + md.com_figura + " dos " + md.total + " itens do " + NOME_STEP[step] + " têm figura gerada por programa, e os achados de radiologia, pele e lâmina vêm descritos no texto)"; })() + ", o que tende a deixar os itens mais fáceis que os da prova; itens de banco respondidos em casa diferem da prova. A probabilidade de aprovação propriamente dita só aparece quando houver pelo menos 30 reprovações e 30 aprovações informadas pela turma, com taxa de resposta de pelo menos 50%; até lá, a tela mostra a posição em relação ao limiar do banco" + (step === "step2ck" ? "; só então a nota de três dígitos poderá ser estimada" : "") + ". O documento completo, com fórmulas e referências, está em plataforma/PSICOMETRIA.md.</p>" +
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
