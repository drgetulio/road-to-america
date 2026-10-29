/* Road to America | simulado: resultado de um bloco encerrado */
import { htmlMidiaItem } from "../../plataforma/js/midia.js";
import { NOME_STEP } from "../../plataforma/js/simulado.js";
import { resumo, linhasPorCampo, titulosAreas, itensRevisao, filtrarRevisao, sistemasParaRevisar, relogio, pct, segundos, resumoHistorico } from "./resultado.js";
import { lerNotas } from "./armazenamento.js";
import { $, $$, e, icon, dataHora, toast } from "./dom.js";

function tabelaAreas(linhas, titulo, idTitulo) {
  return '<table class="areas" aria-labelledby="' + idTitulo + '"><thead><tr><th scope="col">' + e(titulo) + '</th><th scope="col" class="num">Acertos</th><th scope="col"><span class="sr-only">Proporção de acertos</span></th></tr></thead><tbody>' +
    linhas.map((l) => {
      const p = l.taxa ?? 0;
      return '<tr><th scope="row">' + e(l.rotulo) + '</th><td class="num">' + l.acertos + "/" + l.total + " <span class=\"muted\">(" + pct(l.taxa) + ")</span></td>" +
        '<td class="bar"><div class="barra' + (p < 0.6 ? " barra--baixa" : "") + '" aria-hidden="true"><span style="width:' + Math.round(p * 100) + '%"></span></div></td></tr>';
    }).join("") + "</tbody></table>";
}

function blocoQuestao(x, nota) {
  const q = x.questao;
  const situ = { certa: ["chip--ok", "check-circle", "Acertou"], errada: ["chip--erro", "x-circle", "Errou"], em_branco: ["chip--aviso", "minus-circle", "Em branco"] }[x.situacao];
  const resumoTxt = x.faltando ? "Esta questão saiu do banco depois da tentativa." : x.sistema + " · " + x.disciplina;
  return '<li><details data-q="' + x.i + '"><summary>' +
    '<span class="qrev__n qrev__n--' + x.situacao + '" aria-hidden="true">' + x.numero + "</span>" +
    '<span class="qrev__meta"><b>Questão ' + x.numero + '<span class="sr-only">, ' + situ[2].toLowerCase() + "</span></b><span>" + e(resumoTxt) + "</span></span>" +
    '<span class="qrev__chips"><span class="chip ' + situ[0] + '">' + icon(situ[1]) + situ[2] + "</span>" +
    '<span class="chip' + (x.acima_do_ritmo ? " chip--aviso" : "") + '">' + icon("clock") + relogio(x.tempo_ms) + (x.acima_do_ritmo ? '<span class="sr-only">, acima de 90 segundos</span>' : "") + "</span>" +
    (x.marcada ? '<span class="chip">' + icon("flag") + "Marcada</span>" : "") + "</span>" +
    "</summary>" +
    (x.faltando ? '<div class="qrev__corpo"><p class="muted">Sem o texto da questão.</p></div>' :
    '<div class="qrev__corpo">' +
      '<p lang="en" style="margin:12px 0 0">' + e(q.vinheta) + "</p>" + htmlMidiaItem(q.midia) +
      '<p lang="en" style="margin:0;font-weight:600">' + e(q.pergunta) + "</p>" +
      '<ul class="alts-rev">' + q.alternativas.map((a) => {
        const sua = x.resposta === a.letra;
        const cor = a.letra === q.correta;
        const tag = cor && sua ? '<span class="chip chip--ok">' + icon("check") + "Sua resposta, correta</span>" : cor ? '<span class="chip chip--ok">' + icon("check") + "Correta</span>" : sua ? '<span class="chip chip--erro">' + icon("x") + "Sua resposta</span>" : "";
        return '<li class="' + (cor ? "is-correta " : "") + (sua ? "is-sua" : "") + '"><span class="letra">' + a.letra + '.</span><span lang="en">' + e(a.texto) + "</span>" + tag + "</li>";
      }).join("") + "</ul>" +
      (x.resposta === null ? '<p class="fine">Você deixou esta questão em branco. A correta é a ' + e(q.correta) + ".</p>" : "") +
      '<div class="explic"><h4>Explanation</h4><p lang="en">' + e(q.explicacao) + "</p></div>" +
      '<div class="explic"><h4>Resumo em português</h4><p>' + e(q.explicacao_pt) + "</p></div>" +
      (nota ? '<div class="explic"><h4>Sua anotação</h4><p>' + e(nota) + "</p></div>" : "") +
      '<p class="fine">Tempo nesta questão: ' + relogio(x.tempo_ms) + (x.acima_do_ritmo ? ", acima dos 90 s de referência" : "") + ". Fonte: " + e(q.fonte) + "</p>" +
      (x.flashcards ? '<p><a class="btn btn--ghost btn--sm" href="' + e(x.flashcards.href) + '">' + icon("cards") + "Treinar flashcards de " + e(x.flashcards.rotulo) + "</a>" +
        (x.flashcards.aproximado ? ' <span class="fine">Cards do Step 1 sobre o mesmo sistema.</span>' : "") + "</p>" : "") +
    "</div>") +
  "</details></li>";
}

export default {
  titulo: "Resultado",
  async render(ctx, el, { sub }) {
    document.body.classList.remove("em-prova");
    const id = decodeURIComponent(sub[0] || "");
    el.innerHTML = '<div class="wrap section-sm"><p class="muted" role="status">Carregando o resultado...</p></div>';
    const t = await ctx.obterTentativa(id);
    if (!t) {
      el.innerHTML = '<div class="wrap section-sm"><div class="vazio"><h1 class="h-sm">Resultado não encontrado.</h1><p>Esta tentativa não está no histórico desta conta ou deste navegador.</p><p style="margin-top:12px"><a class="btn btn--ghost btn--sm" href="#/">Voltar ao início</a></p></div></div>';
      return;
    }
    const salvamento = ctx._ultimoSalvamento?.id === id ? ctx._ultimoSalvamento : null;
    ctx._ultimoSalvamento = null;
    const r = resumo(t);
    const rot = titulosAreas(t.step);
    const itens = itensRevisao(t, ctx.porId);
    const notas = lerNotas(id) || [];
    const porSis = linhasPorCampo(t, t.step, "por_sistema");
    const porDis = linhasPorCampo(t, t.step, "por_disciplina");
    const revisar = sistemasParaRevisar(itens);
    const hist = resumoHistorico(await ctx.listarTentativas(t.step), t.step);
    const visitante = ctx.conta !== "participante";
    let onde;
    if (t._pendente_envio || salvamento?.erro) onde = '<p class="salvo salvo--erro">' + icon("warning-circle") + "Não foi possível gravar na sua conta" + (salvamento?.erro ? " (" + e(salvamento.erro) + ")" : "") + ". A tentativa ficou neste navegador e será enviada na próxima visita com conexão.</p>";
    else if (ctx.conta === "participante") onde = '<p class="salvo">' + icon("check-circle") + "Gravado na sua conta. A equipe vê este resultado no painel de acompanhamento.</p>";
    else if (ctx.conta === "demo") onde = '<p class="salvo">' + icon("check-circle") + "Gravado neste navegador (modo demonstração). Aparece no painel do administrador de demonstração.</p>";
    else onde = '<p class="salvo">' + icon("check-circle") + "Gravado só neste navegador. Limpar os dados do site apaga este histórico.</p>";

    const medio = r.medio_bloco_ms;
    const ritmoMax = Math.max(r.ritmo_ms * 1.5, medio || 0, r.medio_ms || 0);
    const posicao = (ms) => Math.min(100, Math.round(((ms || 0) / ritmoMax) * 100));
    const titId = "t-res-" + t.id;

    el.innerHTML =
      '<div class="wrap section-sm res">' +
        "<div>" +
          '<p class="eyebrow"><span class="fita" aria-hidden="true"></span>Resultado do bloco</p>' +
          '<h1 class="display h2" id="' + titId + '">' + NOME_STEP[t.step] + ": " + r.acertos + " de " + r.total + " <em>(" + pct(r.percentual) + ")</em></h1>" +
        "</div>" +
        (salvamento?.porTempo || (!salvamento && t.encerramento === "tempo") ? '<div class="aviso-conta">' + icon("clock-countdown") + "<p>O tempo de 30 minutos acabou e o bloco foi encerrado automaticamente, como acontece na prova.</p></div>" : "") +

        '<article class="embarque" aria-labelledby="' + titId + '">' +
          '<div class="embarque__main">' +
            '<p class="embarque__top"><span>' + NOME_STEP[t.step] + ", bloco de 30 minutos</span><span>" + e(dataHora(t.fim)) + "</span></p>" +
            '<dl class="embarque__dados">' +
              "<div><dt>Acertos</dt><dd>" + r.acertos + "<small>" + r.erros + (r.erros === 1 ? " erro" : " erros") + ", " + r.em_branco + " em branco</small></dd></div>" +
              "<div><dt>Tempo no bloco</dt><dd>" + relogio(r.duracao_ms) + "<small>de " + relogio(r.limite_ms) + (r.encerramento === "tempo" ? ", tempo esgotado" : ", encerrado por você") + "</small></dd></div>" +
              "<div><dt>Média por questão</dt><dd>" + (medio === null ? "sem dados" : segundos(medio) + " s") + "<small>referência: " + segundos(r.ritmo_ms) + " s por questão</small></dd></div>" +
              "<div><dt>Acima de 90 s</dt><dd>" + r.acima_do_ritmo + "<small>" + (r.acima_do_ritmo === 1 ? "questão" : "questões") + "</small></dd></div>" +
              "<div><dt>Marcadas</dt><dd>" + r.marcadas + "<small>para revisão</small></dd></div>" +
              "<div><dt>Histórico</dt><dd>" + hist.n + "<small>" + (hist.n === 1 ? "bloco" : "blocos") + " do " + NOME_STEP[t.step] + (hist.n > 1 ? ", média " + pct(hist.media) : "") + "</small></dd></div>" +
            "</dl>" +
            onde +
          "</div>" +
          '<div class="embarque__stub" aria-hidden="true"><span>Acerto</span><b>' + Math.round(r.percentual * 100) + "%</b><em>" + r.acertos + "/" + r.total + "</em></div>" +
        "</article>" +

        (visitante ? '<aside class="convite" aria-label="Turma fundadora">' +
          "<div><p><strong>Quer treinar com acompanhamento?</strong> Na turma fundadora da Road to America, cada bloco entra no painel de acompanhamento da equipe, ao lado dos flashcards, da presença nas aulas e das autoavaliações do NBME.</p></div>" +
          '<div class="convite__acts"><a class="btn btn--sm" href="../index.html#pre-inscricao">Fazer a pré-inscrição</a><a class="btn btn--ghost btn--sm" href="../verificar.html">Verificar minha faculdade</a></div>' +
        "</aside>" : "") +

        '<section class="cartao" aria-labelledby="t-ritmo"><h2 class="h-sm" id="t-ritmo">Ritmo</h2>' +
          '<div class="ritmo">' +
            '<div class="ritmo__linha"><span>Sua média no bloco</span><div class="barra barra--meta" style="--meta:' + posicao(r.ritmo_ms) + '%" aria-hidden="true"><span style="width:' + posicao(medio) + '%"></span></div><span class="num">' + (medio === null ? "sem dados" : segundos(medio) + " s") + "</span></div>" +
            '<div class="ritmo__linha"><span>Referência da prova</span><div class="barra" aria-hidden="true"><span style="width:' + posicao(r.ritmo_ms) + '%;opacity:.45"></span></div><span class="num">90 s</span></div>' +
          "</div>" +
          "<p>" + (medio === null ? "Sem tempo registrado." : r.dentro_do_ritmo ? "Você terminou dentro do ritmo de 90 segundos por questão." : "A média passou dos 90 segundos por questão: no bloco oficial, as últimas questões ficariam sem tempo.") +
          (r.acima_do_ritmo ? " " + r.acima_do_ritmo + (r.acima_do_ritmo === 1 ? " questão levou" : " questões levaram") + " mais de 90 s; veja quais na revisão abaixo." : "") + "</p>" +
        "</section>" +

        '<div class="res__grid">' +
          '<section class="cartao" aria-labelledby="t-sis"><h2 class="h-sm" id="t-sis">Por ' + e(rot.sistema.toLowerCase()) + "</h2>" + tabelaAreas(porSis, rot.sistema, "t-sis") + "</section>" +
          '<section class="cartao" aria-labelledby="t-dis"><h2 class="h-sm" id="t-dis">Por ' + e(rot.disciplina.toLowerCase()) + "</h2>" + tabelaAreas(porDis, rot.disciplina, "t-dis") + "</section>" +
        "</div>" +
        '<p class="fine" style="margin-top:-18px">Com 20 questões, cada ' + e(rot.sistema.toLowerCase()) + " tem poucas questões no bloco; trate as taxas como pista do que revisar, não como medida da sua nota. Barras em vermelho: abaixo de 60%.</p>" +

        (revisar.length ? '<section class="cartao" aria-labelledby="t-rev"><h2 class="h-sm" id="t-rev">O que revisar</h2><ul class="revisar">' +
          revisar.map((g) => "<li><div><b>" + e(g.rotulo) + "</b><br><span class=\"fine\">" + g.erros + (g.erros === 1 ? " erro ou questão em branco" : " erros ou questões em branco") + ": questão " + g.numeros.join(", ") + "</span></div>" +
            (g.flashcards ? '<a class="btn btn--ghost btn--sm" href="' + e(g.flashcards.href) + '">' + icon("cards") + "Flashcards de " + e(g.flashcards.rotulo) + "</a>" : '<span class="fine">Sem flashcards desta área no app.</span>') + "</li>").join("") +
          '</ul><p class="fine">Os links abrem o treino livre do app de flashcards filtrado pelo sistema; o treino livre não altera a agenda das revisões.</p></section>' : "") +

        '<section class="historico" aria-labelledby="t-qq">' +
          '<div class="historico__topo"><h2 class="display h3" id="t-qq">Questão por questão</h2>' +
          '<div class="filtros" role="group" aria-label="Filtrar a revisão">' +
            [["todas", "Todas"], ["erradas", "Erradas e em branco"], ["marcadas", "Marcadas"], ["certas", "Certas"]].map(([v, l], k) =>
              '<button type="button" class="filtro" data-filtro="' + v + '" aria-pressed="' + (k === 0) + '">' + l + " (" + filtrarRevisao(itens, v).length + ")</button>").join("") +
          "</div></div>" +
          '<ul class="qrev" data-qrev></ul>' +
          '<p class="fine">As questões estão em inglês, como na prova; cada uma traz o resumo em português e a fonte usada na revisão do item.</p>' +
        "</section>" +

        '<div class="acoes"><a class="btn" href="#/">' + icon("play") + "Fazer outro bloco</a>" +
          '<a class="btn btn--ghost" href="../anki/">' + icon("cards") + "Ir para os flashcards</a></div>" +
      "</div>";

    const box = $("[data-qrev]", el);
    const desenhar = (filtro) => {
      const lista = filtrarRevisao(itens, filtro);
      box.innerHTML = lista.length ? lista.map((x) => blocoQuestao(x, notas[x.i])).join("") : '<li class="vazio"><p>Nenhuma questão neste filtro.</p></li>';
    };
    desenhar("todas");
    $$("[data-filtro]", el).forEach((b) => b.addEventListener("click", () => {
      $$("[data-filtro]", el).forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      desenhar(b.dataset.filtro);
    }));
    if (salvamento?.erro) toast("A tentativa ficou guardada neste navegador.", "aviso");
  }
};
