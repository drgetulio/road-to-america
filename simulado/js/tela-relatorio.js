/* Road to America | relatório de desempenho do simulado completo e revisão item a
   item. Cálculos em relatorio.js e plataforma/js/psicometria.js; método em
   plataforma/PSICOMETRIA.md.
   Ícones usados: ph-seal-check ph-hourglass-medium ph-trend-up ph-trend-down ph-equals
   ph-cards ph-flag ph-warning ph-chat-text ph-target ph-printer */
import { NOME_STEP } from "../../plataforma/js/simulado.js";
import { prontidaoCombinada, PADRAO_STEP2CK } from "../../plataforma/js/psicometria.js";
import { prontidao } from "../../plataforma/js/desempenho.js";
import { nomeChave } from "../../plataforma/js/banco.js";
import { MOTIVOS_REPORTE, LIMITE_REPORTE } from "../../plataforma/js/registros.js";
import {
  corrigirRegistro, estimativaDoSimulado, estimativaGeral, resultadoEstimado, perfilRelatorio, prioridades, resumoBlocos,
  itensRevisao, filtrarItens, ritmoDoDia, linkCriarFlashcard, textoRegraConfianca, posicaoEscala, NOMES_TIPO, ESCALA_PERFIL, CK_PARA_STEP1
} from "./relatorio.js";
import { resumoDoDia } from "./dia-prova.js";
import { htmlTabelaItem } from "./interface-bloco.js";
import { linkFlashcards } from "./rotulos.js";
import { relogio } from "./resultado.js";
import { pct, prob, num, duracao, plural } from "./formato.js";
import { $, $$, e, icon, toast, dialogo, dataHora } from "./dom.js";

const ICONE_CLASSE = { mais_baixo: "trend-down", igual: "equals", mais_alto: "trend-up", insuficiente: "hourglass-medium" };

function chipClasse(a) {
  return '<span class="classe classe--' + a.classe + '">' + icon(ICONE_CLASSE[a.classe]) + e(a.rotulo_classe) + "</span>";
}

/* Faixa de 90% da área na escala, com o limiar no meio */
function faixa(a) {
  const larg = Math.max(1.2, a.x_hi - a.x_lo);
  return '<div class="faixa" role="img" aria-label="Estimativa da área ' + e(num(a.theta)) + " logit, intervalo de 90% de " + e(num(a.ic[0])) + " a " + e(num(a.ic[1])) + ', em relação ao limiar 0">' +
    '<span class="faixa__lim" aria-hidden="true"></span>' +
    '<span class="faixa__ic faixa__ic--' + a.classe + '" style="left:' + a.x_lo.toFixed(1) + "%;width:" + larg.toFixed(1) + '%"></span>' +
    '<span class="faixa__pt faixa__pt--' + a.classe + '" style="left:' + a.x_theta.toFixed(1) + '%"></span>' +
  "</div>";
}

function tabelaPerfil(p, id) {
  return '<section class="cartao perfil" aria-labelledby="' + id + '">' +
    '<div class="perfil__topo"><h3 class="h-sm" id="' + id + '">' + e(p.titulo) + "</h3>" +
      '<p class="fine">' + plural(p.contagem.mais_baixo, "área mais baixa", "áreas mais baixas") + ", " + plural(p.contagem.igual, "igual", "iguais") + ", " + plural(p.contagem.mais_alto, "mais alta", "mais altas") + (p.contagem.insuficiente ? ", " + plural(p.contagem.insuficiente, "com poucos itens", "com poucos itens") : "") + ".</p></div>" +
    (p.areas.length ? '<div class="perfil__wrap"><table class="perfil__tab"><caption class="sr-only">' + e(p.titulo) + ": desempenho em relação ao examinando no limiar de aprovação</caption>" +
      '<thead><tr><th scope="col">Área</th><th scope="col" class="num">Itens</th><th scope="col" class="num">Você</th><th scope="col" class="num">Limiar</th><th scope="col" class="perfil__esc"><span class="perfil__escala" aria-hidden="true"><span>mais baixo</span><span>limiar</span><span>mais alto</span></span><span class="sr-only">Faixa de 90%</span></th><th scope="col">Em relação ao limiar</th></tr></thead><tbody>' +
      p.areas.map((a) => "<tr>" +
        '<th scope="row">' + e(a.nome) + "</th>" +
        '<td class="num" data-rot="Itens">' + a.n + "</td>" +
        '<td class="num" data-rot="Você">' + pct(a.taxa) + "</td>" +
        '<td class="num" data-rot="Limiar">' + pct(a.esperado_limiar) + "</td>" +
        '<td class="perfil__esc">' + faixa(a) + "</td>" +
        "<td>" + chipClasse(a) + "</td>" +
      "</tr>").join("") + "</tbody></table></div>" : '<div class="vazio"><p>Sem itens desta dimensão no simulado.</p></div>') +
  "</section>";
}

function htmlItem(x, retorno) {
  const q = x.questao;
  if (!q) return '<div class="qrev__corpo"><p class="muted">Este item saiu do banco depois do simulado.</p></div>';
  const linkCard = linkCriarFlashcard(q, { retorno });
  return '<div class="qrev__corpo">' +
    '<p lang="en" class="qrev__texto">' + e(q.vinheta) + "</p>" +
    htmlTabelaItem(q.tabela) +
    '<p lang="en" class="qrev__texto" style="font-weight:600">' + e(q.pergunta) + "</p>" +
    '<ul class="alts-rev alts-rev--explic">' + q.alternativas.map((a) => {
      const sua = x.resposta === a.letra;
      const cor = a.letra === q.correta;
      const tag = cor && sua ? '<span class="chip chip--ok">' + icon("check") + "Sua resposta, correta</span>" : cor ? '<span class="chip chip--ok">' + icon("check") + "Correta</span>" : sua ? '<span class="chip chip--erro">' + icon("x") + "Sua resposta</span>" : "";
      const ex = q.explicacoes_alternativas?.[a.letra];
      return '<li class="' + (cor ? "is-correta " : "") + (sua ? "is-sua" : "") + '"><span class="letra">' + a.letra + '.</span><span lang="en">' + e(a.texto) + "</span>" + tag +
        (ex ? '<p class="alts-rev__ex" lang="en">' + e(ex) + "</p>" : "") + "</li>";
    }).join("") + "</ul>" +
    (x.resposta === null ? '<p class="fine">Item em branco. A correta é a ' + e(q.correta) + ".</p>" : "") +
    (q.objetivo_educacional ? '<div class="explic explic--obj"><h4>' + icon("target") + "Objetivo educacional</h4><p lang=\"en\">" + e(q.objetivo_educacional) + "</p></div>" : "") +
    (q.explicacao ? '<div class="explic"><h4>Explanation</h4><p lang="en">' + e(q.explicacao) + "</p></div>" : "") +
    (q.explicacao_pt ? '<div class="explic"><h4>Resumo em português</h4><p>' + e(q.explicacao_pt) + "</p></div>" : "") +
    (x.nota ? '<div class="explic"><h4>Sua anotação na prova</h4><p>' + e(x.nota) + "</p></div>" : "") +
    '<p class="fine">Tempo neste item: ' + relogio(x.tempo_ms) + (x.tempo_ms > 90000 ? ", acima dos 90 s de referência" : "") + ". Bloco " + (x.bloco + 1) + ", item " + (x.posicao + 1) + "." + (q.fonte ? " Fonte: " + e(q.fonte) : "") + "</p>" +
    '<p class="acoes">' + (linkCard ? '<a class="btn btn--ghost btn--sm" href="' + e(linkCard) + '">' + icon("cards") + "Criar flashcard</a>" : "") +
      '<button type="button" class="btn btn--ghost btn--sm" data-reportar="' + e(q.id) + '">' + icon("warning") + "Reportar erro no item</button></p>" +
  "</div>";
}

async function reportar(ctx, qid) {
  const corpo = '<form class="reporte" data-form-reporte novalidate><fieldset><legend>O que está errado no item ' + e(qid) + "?</legend>" +
    Object.entries(MOTIVOS_REPORTE).map(([k, r], i) => '<label class="opcao opcao--linha"><input type="radio" name="motivo" value="' + k + '"' + (i === 0 ? " checked" : "") + "><span>" + e(r) + "</span></label>").join("") +
    '</fieldset><label for="rep-txt">Descreva (obrigatório em "Outro")</label><textarea id="rep-txt" maxlength="' + LIMITE_REPORTE + '" rows="4" data-rep-txt></textarea>' +
    '<p class="fine">A equipe revisa cada reporte. Itens com problema confirmado saem do banco até a correção.</p></form>';
  const ok = await dialogo({ titulo: "Reportar erro no item", corpo, acoes: [{ rotulo: "Cancelar", valor: false, estilo: "ghost" }, { rotulo: "Enviar reporte", valor: true, icone: "flag" }], largura: "largo" });
  if (!ok) return;
  const f = $("[data-form-reporte]");
  const motivo = f ? new FormData(f).get("motivo") : "outro";
  const texto = $("[data-rep-txt]")?.value || "";
  try { await ctx.store.reportarItem({ questao_id: qid, motivo, texto }); toast("Reporte enviado. Obrigado por ajudar a revisar o banco.", "ok"); }
  catch (err) { toast(err.message || String(err), "erro", 7000); }
}

export default {
  titulo: "Relatório de desempenho",
  async render(ctx, el, { sub }) {
    document.body.classList.remove("em-prova");
    const id = decodeURIComponent(sub[0] || "");
    el.innerHTML = '<div class="wrap section-sm"><p class="muted" role="status">Montando o relatório...</p></div>';
    const voltar = '<p style="margin-top:12px"><a class="btn btn--ghost btn--sm" href="#/completos">Simulados completos</a></p>';
    if (ctx.conta === "visitante") { location.replace("#/completos"); return; }
    let banco, reg, modelos, todas, nbme;
    try {
      banco = await ctx.obterBanco();
      reg = await ctx.store.getSimuladoCompleto(id);
    } catch (err) {
      el.innerHTML = '<div class="wrap section-sm"><div class="vazio"><h1 class="h-sm">Não foi possível abrir o relatório.</h1><p>' + e(err.message || err) + "</p>" + voltar + "</div></div>";
      return;
    }
    if (!reg) { el.innerHTML = '<div class="wrap section-sm"><div class="vazio"><h1 class="h-sm">Relatório não encontrado.</h1><p>Este simulado não está na sua conta.</p>' + voltar + "</div></div>"; return; }
    if (reg.estado !== "concluido") { location.replace("#/dia/" + encodeURIComponent(id)); return; }
    const step = reg.step;
    [modelos, todas, nbme] = await Promise.all([
      ctx.store.getModelosPsicometricos().catch(() => null),
      ctx.store.listRespostas({ step }).catch(() => []),
      ctx.store.listNbme ? ctx.store.listNbme({ step }).catch(() => []) : []
    ]);
    const form = reg.formulario;
    const { resultado, respostas } = corrigirRegistro(reg, banco.porId);
    const est = estimativaDoSimulado({ form, linhas: respostas, porId: banco.porId, modelos });
    const geral = estimativaGeral({ step, respostas: todas, porId: banco.porId, modelos });
    const res = resultadoEstimado(est, step);
    const perfil = perfilRelatorio(est, step);
    const prio = prioridades(perfil);
    const blocos = resumoBlocos(reg, banco.porId);
    const itens = itensRevisao(reg, banco.porId);
    const ritmo = ritmoDoDia(itens);
    const dia = resumoDoDia(reg.sessao, form);
    const pr = prontidaoCombinada({ exit18: prontidao(nbme, step), banco: geral.n ? geral : null });
    const pe = est.percentual_esperado;
    const retorno = "../simulado/#/relatorio/" + encodeURIComponent(id);
    const conf = est.confianca;
    const faltam = conf.faltam_itens ?? conf.faltam_itens_minimo;
    const xT = posicaoEscala(est.theta), xLo = posicaoEscala(est.ic90[0]), xHi = posicaoEscala(est.ic90[1]);
    const ck = step === "step2ck";

    el.innerHTML =
      '<div class="wrap section-sm res rel">' +
        "<div>" +
          '<p class="eyebrow"><span class="fita" aria-hidden="true"></span>Relatório de desempenho</p>' +
          '<h1 class="display h2">' + NOME_STEP[step] + ", " + e((NOMES_TIPO[reg.tipo] || reg.tipo).toLowerCase()) + "</h1>" +
          '<p class="fine">' + e(form.nome) + ". Encerrado em " + e(dataHora(reg.fim)) + "." + (form.reduzido ? " " + e(form.motivo_reducao) : "") + "</p>" +
        "</div>" +
        '<p class="rel__oficial">' + icon("info") + "<span>Relatório da Road to America, calculado pelo método de PSICOMETRIA.md. Não é documento do USMLE nem do NBME e não substitui as autoavaliações oficiais.</span></p>" +

        '<article class="embarque rel__res rel__res--' + res.codigo + '" aria-labelledby="t-resultado">' +
          '<div class="embarque__main">' +
            '<p class="embarque__top"><span>' + (ck ? "Padrão de aprovação" : "Resultado estimado") + "</span><span>" + (res.alta ? icon("seal-check") + " Alta confiança" : icon("hourglass-medium") + " Estimativa preliminar") + "</span></p>" +
            '<h2 class="rel__titulo" id="t-resultado">' + e(res.titulo) + "</h2>" +
            '<dl class="embarque__dados">' +
              "<div><dt>" + (ck ? "Probabilidade de atingir o padrão" : "Probabilidade de aprovação") + "</dt><dd>" + prob(est.p_aprovacao) + "<small>P(θ acima do limiar), " + plural(est.n, "item", "itens") + "</small></dd></div>" +
              "<div><dt>Habilidade estimada</dt><dd>" + num(est.theta) + "<small>logit; intervalo de 90%: " + num(est.ic90[0]) + " a " + num(est.ic90[1]) + "</small></dd></div>" +
              "<div><dt>Acertos</dt><dd>" + resultado.acertos + "<small>de " + resultado.total + " (" + pct(resultado.percentual) + "), " + resultado.em_branco + " em branco</small></dd></div>" +
              "<div><dt>Percentual esperado</dt><dd>" + pct(pe.media) + "<small>num formulário como este; intervalo de 90%: " + pct(pe.ic90[0]) + " a " + pct(pe.ic90[1]) + "</small></dd></div>" +
              "<div><dt>No limiar</dt><dd>" + pct(pe.limiar) + "<small>de acerto esperado do examinando no limiar, neste formulário</small></dd></div>" +
              "<div><dt>Ritmo</dt><dd>" + Math.round(ritmo.medio_ms / 1000) + " s<small>por item; " + plural(ritmo.acima_90, "item passou", "itens passaram") + " de 90 s</small></dd></div>" +
            "</dl>" +
          "</div>" +
          '<div class="embarque__stub rel__stub" aria-hidden="true"><span>' + (ck ? "Padrão " + PADRAO_STEP2CK : "Estimativa") + "</span><b>" + e(res.selo) + "</b><em>" + prob(est.p_aprovacao) + "</em></div>" +
        "</article>" +

        '<section class="cartao" aria-labelledby="t-escala"><h2 class="h-sm" id="t-escala">Onde você ficou em relação ao limiar</h2>' +
          '<div class="escala" role="img" aria-label="Habilidade estimada ' + e(num(est.theta)) + " logit, intervalo de 90% de " + e(num(est.ic90[0])) + " a " + e(num(est.ic90[1])) + '; o limiar de aprovação é 0">' +
            '<span class="escala__zona escala__zona--baixa" aria-hidden="true">abaixo do limiar</span><span class="escala__zona escala__zona--alta" aria-hidden="true">acima do limiar</span>' +
            '<span class="escala__lim" aria-hidden="true"><span>limiar</span></span>' +
            '<span class="escala__ic" style="left:' + xLo.toFixed(1) + "%;width:" + Math.max(1, xHi - xLo).toFixed(1) + '%" aria-hidden="true"></span>' +
            '<span class="escala__pt" style="left:' + xT.toFixed(1) + '%" aria-hidden="true"><span>você</span></span>' +
          "</div>" +
          '<p class="fine">Escala do modelo de Rasch ancorado no Angoff, de ' + ESCALA_PERFIL.min + " a +" + ESCALA_PERFIL.max + " logit. O 0 é o examinando no limiar de aprovação: ele acerta cada item com a probabilidade que os autores atribuíram no Angoff. A barra é o intervalo de 90% da sua habilidade.</p>" +
          "<p><strong>" + e(res.confianca) + ".</strong> " + e(conf.texto) + (!conf.alta && faltam ? " Faltam cerca de " + plural(faltam, "item respondido", "itens respondidos") + " para a regra de alta confiança." : "") + "</p>" +
          (conf.motivos?.length ? '<ul class="lista-check">' + conf.motivos.map((m) => "<li>" + icon("info") + "<span>" + e(m) + "</span></li>").join("") + "</ul>" : "") +
          '<p class="fine">' + e(textoRegraConfianca(est)) + "</p>" +
          (est.desfechos ? '<p class="aviso-conta aviso-conta--ok">' + icon("seal-check") + "<span>Pelo modelo calibrado com os resultados oficiais da turma (" + est.desfechos.modelo.n + " participantes), a probabilidade de aprovação é " + prob(est.desfechos.p_aprovacao) + ".</span></p>" : "") +
          (ck ? (est.escore ? '<p class="aviso-conta aviso-conta--ok">' + icon("seal-check") + "<span>Nota esperada pelo modelo calibrado com notas reais: " + Math.round(est.escore.media) + " (intervalo de 90%: " + Math.round(est.escore.ic90[0]) + " a " + Math.round(est.escore.ic90[1]) + "); probabilidade de nota de pelo menos " + PADRAO_STEP2CK + ": " + prob(est.escore.p_limiar) + ".</span></p>"
            : '<p class="aviso-conta">' + icon("info") + "<span><strong>Sem nota de três dígitos.</strong> O limiar do banco foi fixado por Angoff para representar o padrão mínimo de " + PADRAO_STEP2CK + ". A nota só será estimada depois da calibração com escores reais da turma.</span></p>") : "") +
          '<p class="fine">' + est.avisos.map(e).join(" ") + "</p>" +
        "</section>" +

        '<section class="historico" aria-labelledby="t-perfil">' +
          '<div class="historico__topo"><h2 class="display h3" id="t-perfil">Perfil de desempenho por área</h2>' +
          '<p class="fine">Cada área tem uma estimativa própria e o intervalo de 90%. Mais baixo: o intervalo inteiro abaixo do limiar. Mais alto: inteiro acima. Igual: cruza o limiar. Com menos de 5 itens, a área fica sem classificação.</p></div>' +
          '<ul class="legenda" aria-label="Legenda do perfil"><li>' + chipClasse({ classe: "mais_baixo", rotulo_classe: "Mais baixo" }) + "</li><li>" + chipClasse({ classe: "igual", rotulo_classe: "Igual" }) + "</li><li>" + chipClasse({ classe: "mais_alto", rotulo_classe: "Mais alto" }) + "</li><li><span class=\"legenda__lim\" aria-hidden=\"true\"></span>limiar de aprovação</li></ul>" +
          perfil.map((p, i) => tabelaPerfil(p, "t-perfil-" + i)).join("") +
          '<p class="fine">"Você" é o seu acerto bruto na área; "Limiar" é o acerto esperado do examinando no limiar nos mesmos itens (média do Angoff). O relatório oficial do USMLE mostra um perfil parecido a quem é reprovado; aqui ele aparece sempre, para orientar o estudo.</p>' +
        "</section>" +

        (prio.length ? '<section class="cartao" aria-labelledby="t-prio"><h2 class="h-sm" id="t-prio">Por onde começar a revisar</h2><ul class="revisar">' +
          prio.map((a) => {
            const sis = a.dim === "sistema" ? (step === "step1" ? a.chave : CK_PARA_STEP1[a.chave]) : null;
            const fc = sis ? linkFlashcards({ step: "step1", sistema: sis }) : null;
            return "<li><div><b>" + e(a.nome) + "</b><br><span class=\"fine\">" + e(a.dimensao) + ": " + a.acertos + " de " + a.n + " (" + pct(a.taxa) + "), limiar " + pct(a.esperado_limiar) + ". " + e(a.rotulo_classe) + ".</span></div>" +
              (fc ? '<a class="btn btn--ghost btn--sm" href="' + e(fc.href) + '">' + icon("cards") + (step === "step1" ? "Flashcards do sistema" : "Flashcards do Step 1 sobre o tema") + "</a>" : "") + "</li>";
          }).join("") + "</ul></section>" : "") +

        '<section class="cartao" aria-labelledby="t-dia"><h2 class="h-sm" id="t-dia">O dia, bloco a bloco</h2>' +
          '<div class="tabela-wrap"><table class="tabela tabela--cartoes"><caption class="sr-only">Acertos e tempo por bloco</caption><thead><tr><th scope="col">Bloco</th><th scope="col">Acertos</th><th scope="col">Tempo usado</th><th scope="col">Para a pausa</th><th scope="col">Encerramento</th></tr></thead><tbody>' +
          blocos.map((b) => '<tr><th scope="row" data-rot="Bloco">' + b.numero + '</th><td class="num" data-rot="Acertos">' + b.acertos + "/" + b.total + " (" + pct(b.percentual) + ')</td><td class="num" data-rot="Tempo usado">' + (b.usado_ms === null ? "sem dados" : relogio(b.usado_ms) + (b.limite_ms < 1800000 ? " de " + relogio(b.limite_ms) : "")) + '</td><td class="num" data-rot="Para a pausa">' + (b.sobra_ms === null ? "sem dados" : relogio(b.sobra_ms)) + '</td><td data-rot="Encerramento">' + (b.motivo === "tempo" ? "tempo esgotado" : "por você") + "</td></tr>").join("") +
          "</tbody></table></div>" +
          "<p>Pausa usada: " + duracao(dia.pausa_usada_ms) + " de " + duracao(dia.pausa_disponivel_ms) + " disponíveis (" + duracao(dia.pausa_inicial_ms) + " do formato, " + duracao(dia.sobra_blocos_ms) + " de sobras de blocos" + (dia.tutorial_ms ? " e " + duracao(Math.max(0, dia.tutorial_ms - dia.tutorial_usado_ms)) + " do tutorial" : "") + ")." +
            (dia.debito_ms ? " A pausa passou do saldo e " + duracao(dia.debito_ms) + " saíram de blocos seguintes." : "") +
            (dia.suspensoes ? " O dia foi parado " + plural(dia.suspensoes, "vez", "vezes") + " (" + duracao(dia.tempo_suspenso_ms) + " fora do relógio); na prova, isso não é possível." : " O dia correu sem paradas, como na prova.") + "</p>" +
        "</section>" +

        '<section class="cartao" aria-labelledby="t-geral"><h2 class="h-sm" id="t-geral">Indicador do banco e prontidão</h2>' +
          (geral.n ? "<p>Com todas as suas respostas do " + NOME_STEP[step] + " no banco (" + plural(geral.n, "item", "itens") + "), a probabilidade " + (ck ? "de atingir o padrão" : "de aprovação") + " é <strong>" + prob(geral.p_aprovacao) + "</strong>, " + (geral.confianca.alta ? "com alta confiança" : "como estimativa preliminar") + ".</p>" : "") +
          '<div class="aviso-conta' + (pr.status === "pronto" ? " aviso-conta--ok" : "") + '">' + icon("flag-banner") + "<p><strong>EXIT 18.</strong> " + e(pr.mensagem) + "</p></div>" +
          '<p class="fine">' + e(pr.regra) + "</p>" +
        "</section>" +

        '<section class="historico" aria-labelledby="t-itens">' +
          '<div class="historico__topo"><h2 class="display h3" id="t-itens">Revisão item a item</h2>' +
          '<div class="filtros" role="group" aria-label="Filtrar os itens">' +
            [["todas", "Todos"], ["erradas", "Errados e em branco"], ["marcadas", "Marcados"], ["certas", "Certos"]].map(([v, l], k) =>
              '<button type="button" class="filtro" data-filtro="' + v + '" aria-pressed="' + (k === 0) + '">' + l + " (" + filtrarItens(itens, { situacao: v }).length + ")</button>").join("") +
          "</div></div>" +
          '<p><label for="f-bloco" class="fine">Bloco </label><select id="f-bloco" class="input input--sel" data-f-bloco><option value="">Todos os blocos</option>' + form.blocos.map((_, i) => '<option value="' + i + '">Bloco ' + (i + 1) + "</option>").join("") + "</select></p>" +
          '<p class="sr-only" role="status" data-qrev-conta></p>' +
          '<ul class="qrev" data-qrev></ul>' +
          '<p class="fine">Os itens estão em inglês, como na prova; cada um traz a explicação de cada alternativa, o objetivo educacional e o resumo em português.</p>' +
        "</section>" +

        '<div class="acoes"><a class="btn" href="#/completos">' + icon("play") + "Simulados completos</a>" +
          '<button type="button" class="btn btn--ghost" data-imprimir>' + icon("printer") + "Imprimir o relatório</button>" +
          '<a class="btn btn--ghost" href="../anki/#/progresso">' + icon("path") + "Meu progresso</a></div>" +
      "</div>";

    const box = $("[data-qrev]", el);
    let filtro = "todas", bloco = null;
    const situ = { certa: ["chip--ok", "check-circle", "Acertou"], errada: ["chip--erro", "x-circle", "Errou"], em_branco: ["chip--aviso", "minus-circle", "Em branco"] };
    const desenhar = () => {
      const lista = filtrarItens(itens, { situacao: filtro, bloco });
      $("[data-qrev-conta]", el).textContent = plural(lista.length, "item na lista", "itens na lista") + ".";
      box.innerHTML = lista.length ? lista.map((x) => {
        const sx = situ[x.situacao];
        const meta = x.questao ? [x.questao.sistema ? nomeChave(step, "sistema", x.questao.sistema) : "", x.questao.topico].filter(Boolean).join(" | ") : "Item fora do banco";
        return '<li><details data-i="' + (x.numero - 1) + '"><summary>' +
          '<span class="qrev__n qrev__n--' + x.situacao + '" aria-hidden="true">' + x.numero + "</span>" +
          '<span class="qrev__meta"><b>Item ' + x.numero + ', bloco ' + (x.bloco + 1) + '<span class="sr-only">, ' + sx[2].toLowerCase() + "</span></b><span>" + e(meta) + "</span></span>" +
          '<span class="qrev__chips"><span class="chip ' + sx[0] + '">' + icon(sx[1]) + sx[2] + "</span>" +
          '<span class="chip' + (x.tempo_ms > 90000 ? " chip--aviso" : "") + '">' + icon("clock") + relogio(x.tempo_ms) + "</span>" +
          (x.marcada ? '<span class="chip">' + icon("flag") + "Marcado</span>" : "") + (x.nota ? '<span class="chip">' + icon("note-pencil") + "Anotação</span>" : "") + "</span>" +
          "</summary></details></li>";
      }).join("") : '<li class="vazio"><p>Nenhum item neste filtro.</p></li>';
    };
    box.addEventListener("toggle", (ev) => {
      const d = ev.target;
      if (!d.matches?.("details") || !d.open || d.dataset.pronto) return;
      d.dataset.pronto = "1";
      d.insertAdjacentHTML("beforeend", htmlItem(itens[Number(d.dataset.i)], retorno));
    }, true);
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-reportar]");
      if (b) reportar(ctx, b.dataset.reportar);
    });
    $$("[data-filtro]", el).forEach((b) => b.addEventListener("click", () => {
      filtro = b.dataset.filtro;
      $$("[data-filtro]", el).forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      desenhar();
    }));
    $("[data-f-bloco]", el).addEventListener("change", (ev) => { bloco = ev.target.value === "" ? null : Number(ev.target.value); desenhar(); });
    $("[data-imprimir]", el).addEventListener("click", () => window.print());
    desenhar();
  }
};
