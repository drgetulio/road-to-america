/* Road to America | área administrativa: painel Angoff de juízes.
   Rotas: #/angoff (painéis e criação), #/angoff/<id> (condução, resultados, Hofstee,
   discussão e publicação), #/angoff/<id>/avaliar (avaliação do juiz, item a item).
   O juiz vê o item completo sem o gabarito; o gabarito e a explicação aparecem depois
   de registrar a estimativa (no Supabase, r2a_angoff_avaliar devolve só então). Entre
   as rodadas, cada item mostra a distribuição das estimativas do painel (sem nomes) e o
   p observado na turma. Cálculos em plataforma/js/angoff.js. */
import { htmlMidiaItem } from "../../../plataforma/js/midia.js";
import { $, $$, e, icon, toast, confirmar, num } from "../../../anki/js/ui.js";
import { FORMULARIOS_FIXOS, montarFormularioFixo } from "../../../plataforma/js/formularios.js";
import { nomeChave } from "../../../plataforma/js/banco.js";
import { plural } from "../../../plataforma/js/acompanhamento.js";
import {
  resumoRodada, hofstee, verificarHofstee, distribuicaoEscores, valoresParaPublicar, rodadasFechadas, MIN_JUIZES, CORTE_EP_MAX, RODADAS_MAX, JUSTIFICATIVA_MIN
} from "../../../plataforma/js/angoff.js";
import { pageHead, tile, avisoLgpd } from "./comum.js";
/* tabela visível (o resultado do painel é o conteúdo principal da tela) */
function tabela(titulo, colunas, linhas, { cabecalhoLinha = true } = {}) {
  return '<div class="tab-scroll"><table class="mini-tab angoff__tab"><caption class="sr-only">' + e(titulo) + "</caption><thead><tr>" + colunas.map((c) => '<th scope="col">' + e(c) + "</th>").join("") + "</tr></thead><tbody>" +
    linhas.map((l) => "<tr>" + l.map((c, k) => (k === 0 && cabecalhoLinha ? '<th scope="row">' + e(c) + "</th>" : "<td>" + e(c) + "</td>")).join("") + "</tr>").join("") + "</tbody></table></div>";
}

const ROTULO_ESTADO = { avaliacao: "Rodada de avaliação aberta", discussao: "Rodada fechada, em discussão", encerrado: "Painel encerrado" };
const CLASSE_ESTADO = { avaliacao: "aviso", discussao: "neutro", encerrado: "ok" };
const NOME_STEP = { step1: "Step 1", step2ck: "Step 2 CK" };
const pct = (p, d = 1) => (p === null || p === undefined || !Number.isFinite(p) ? "sem dado" : (100 * p).toFixed(d).replace(".", ",") + "%");
const n1 = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? "" : Number(x).toFixed(d).replace(".", ","));
const chipEstado = (p) => '<span class="gar gar--' + CLASSE_ESTADO[p.estado] + '">' + e(ROTULO_ESTADO[p.estado]) + (p.estado !== "encerrado" ? ", rodada " + p.rodada + " de " + p.rodadas_max : "") + "</span>";

export default {
  titulo: "Painel Angoff",
  async render(ctx, el, { sub, params }) {
    if (!sub[0]) return lista(ctx, el);
    if (sub[1] === "avaliar") return avaliar(ctx, el, sub[0], params);
    return detalhe(ctx, el, sub[0]);
  }
};

/* ---------------- lista e criação ---------------- */
async function lista(ctx, el) {
  el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Lendo os painéis...</p></div>';
  const paineis = await ctx.store.listPaineisAngoff();
  const admin = ctx.admin;
  const juizesPossiveis = admin ? await ctx.store.listJuizesPossiveis() : [];
  el.innerHTML = '<div class="wrap section-sm angoff">' +
    pageHead({
      eyebrow: "Padrão de aprovação",
      titulo: "Painel Angoff",
      lead: "Mentores estimam, item a item, a porcentagem de examinandos no limiar de aprovação que acertariam a questão. O item aparece completo e o gabarito só depois da estimativa. Entre as rodadas, o painel vê a distribuição das estimativas e o acerto real da turma, discute e refaz. O corte é a média das estimativas (Angoff modificado), conferido pelo método de Hofstee. Com pelo menos " + MIN_JUIZES + " juízes por item e erro-padrão do corte abaixo de " + Math.round(CORTE_EP_MAX * 100) + " pontos percentuais, o valor do painel substitui a dificuldade-alvo provisória do item."
    }) +
    '<section class="panel" aria-labelledby="pa-t"><div class="panel__head"><h2 class="h-sm" id="pa-t">' + (admin ? "Painéis" : "Painéis em que você é juiz") + "</h2></div>" +
      (paineis.length ? '<ul class="angoff__lista">' + paineis.map((p) => '<li class="angoff__card"><a href="#/angoff/' + encodeURIComponent(p.id) + '"><b>' + e(p.nome) + "</b></a>" +
        "<span>" + e(NOME_STEP[p.step]) + ", " + plural(p.itens.length, "item", "itens") + "</span>" + chipEstado(p) + (p.publicado_em ? '<span class="gar gar--ok">' + icon("seal-check") + "Angoff publicado</span>" : "") + "</li>").join("") + "</ul>"
        : '<p class="hint">Nenhum painel ainda.' + (admin ? " Crie o primeiro abaixo." : "") + "</p>") +
    "</section>" +
    (admin ? formCriar(juizesPossiveis) : "") +
    avisoLgpd("O painel usa os itens do banco e, entre as rodadas, o acerto agregado da turma. Nenhum aluno é identificado.") +
  "</div>";
  if (!admin) return;
  const f = $("[data-criar-painel]", el);
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = new FormData(f);
    const step = d.get("step");
    const codigo = d.get("formulario");
    const n = Number(d.get("quantidade"));
    const juizes = d.getAll("juiz");
    try {
      const banco = await ctx.bancoAdmin();
      const form = montarFormularioFixo(banco, step, codigo, "completo");
      const itens = form.blocos.flat().slice(0, Math.max(1, Math.min(400, n || 20)));
      const p = await ctx.store.criarPainelAngoff({ step, nome: d.get("nome"), descricao: d.get("descricao") || "", itens, rodadas_max: Number(d.get("rodadas")), juizes });
      toast("Painel criado com " + plural(itens.length, "item", "itens") + " e " + plural(juizes.length, "juiz", "juízes") + ".", "ok");
      ctx.go("#/angoff/" + encodeURIComponent(p.id));
    } catch (err) { toast(err.message, "erro", 8000); }
  });
  const sel = $("[name=step]", f);
  const atualizar = () => { $("[name=formulario]", f).innerHTML = FORMULARIOS_FIXOS[sel.value].map((x) => '<option value="' + e(x.codigo) + '">' + e(x.nome + " (" + x.codigo + ")") + "</option>").join(""); };
  sel.addEventListener("change", atualizar);
  atualizar();
}

function formCriar(juizes) {
  return '<section class="panel" aria-labelledby="pn-t"><div class="panel__head"><h2 class="h-sm" id="pn-t">Novo painel</h2>' +
    '<p class="hint">Os itens vêm de um formulário fixo, na ordem da prova (os primeiros N itens). Juízes: mentores e equipe; aluno com matrícula ativa não pode ser juiz, porque veria gabaritos. Recomenda-se de 10 a 15 juízes que conheçam o examinando no limiar do USMLE, com treino antes da primeira rodada; abaixo de ' + MIN_JUIZES + " por item o valor não substitui a dificuldade-alvo provisória.</p></div>" +
    '<form class="form-grid" data-criar-painel novalidate>' +
      '<div class="field"><label for="pn-nome">Nome do painel</label><input id="pn-nome" name="nome" class="input" required minlength="3" maxlength="120" value="Painel Angoff do formulário A" autocomplete="off"></div>' +
      '<div class="field"><label for="pn-step">Step</label><select id="pn-step" name="step" class="input"><option value="step1">Step 1</option><option value="step2ck">Step 2 CK</option></select></div>' +
      '<div class="field"><label for="pn-form">Formulário de origem</label><select id="pn-form" name="formulario" class="input"></select></div>' +
      '<div class="field"><label for="pn-n">Quantidade de itens</label><input id="pn-n" name="quantidade" type="number" class="input" min="1" max="400" value="20" inputmode="numeric"></div>' +
      '<div class="field"><label for="pn-r">Rodadas previstas</label><input id="pn-r" name="rodadas" type="number" class="input" min="1" max="' + RODADAS_MAX + '" value="2" inputmode="numeric"></div>' +
      '<div class="field field--largo"><label for="pn-desc">Orientação aos juízes (opcional)</label><textarea id="pn-desc" name="descricao" class="input input--area" rows="2" maxlength="2000">Pense no examinando que passa por pouco: domina o essencial, erra o detalhe fino. Estime quantos em cada 100 desses acertariam o item.</textarea></div>' +
      '<fieldset class="field field--largo"><legend>Juízes</legend><div class="checks">' + juizes.map((j, i) => '<label class="check"><input type="checkbox" name="juiz" value="' + e(j.id) + '"' + (i <= MIN_JUIZES ? " checked" : "") + "> " + e(j.nome) + (j.sintetico ? ' <span class="selo-demo">fictício</span>' : "") + "</label>").join("") + "</div></fieldset>" +
      '<p class="acts-row field--largo"><button class="btn" type="submit">' + icon("users-three") + "Criar o painel</button></p>" +
    "</form></section>";
}

/* ---------------- detalhe ---------------- */
async function detalhe(ctx, el, id) {
  el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Abrindo o painel...</p></div>';
  const { painel: p, juizes, sou_juiz } = await ctx.store.getPainelAngoff(id);
  const admin = ctx.admin;
  const [itens, minhas, feedback, discussao, hofs] = await Promise.all([
    ctx.store.listItensPainelAngoff(id),
    ctx.store.listAvaliacoesAngoff(id),
    ctx.store.feedbackPainelAngoff(id),
    ctx.store.listDiscussaoAngoff(id),
    ctx.store.listHofsteeAngoff(id)
  ]);
  const porId = new Map(itens.map((q) => [q.id, q]));
  const fechadas = rodadasFechadas(p);
  const meuId = ctx.user.id;
  const minhasRodada = minhas.filter((a) => a.juiz_id === meuId && a.rodada === p.rodada).length;

  /* resultados: o admin calcula das estimativas; o juiz vê o agregado das rodadas fechadas */
  let resultados = "";
  let exigeJust = false, bloqueioEp = false;
  if (admin) {
    const rodadas = Array.from({ length: p.rodada }, (_, i) => i + 1);
    const resumos = rodadas.map((r) => resumoRodada(p.itens, minhas, r));
    const final = resumos[resumos.length - 1];
    const respostas = await ctx.store.listRespostas({ todos: true, step: p.step }).catch(() => []);
    /* escore esperado no formulário do painel pelo theta de cada pessoa em todas as
       respostas do Step: cada pessoa viu itens diferentes, e a porcentagem bruta nos
       itens do painel que ela viu não é comparável */
    const bancoAdm = await ctx.bancoAdmin().catch(() => null);
    const porIdStep = bancoAdm ? new Map((bancoAdm.steps?.[p.step] || []).map((q) => [q.id, q])) : null;
    const escores = distribuicaoEscores(respostas, p.itens, porIdStep && porIdStep.size ? { porId: porIdStep, minItens: 20 } : { minItens: Math.min(10, Math.ceil(p.itens.length / 2)) });
    const h = hofstee(hofs, escores);
    const ver = verificarHofstee(final.corte, h, escores);
    const pub = valoresParaPublicar(p, minhas, { verificacao: ver });
    exigeJust = pub.exige_justificativa;
    bloqueioEp = pub.bloqueado_ep;
    const progresso = juizes.map((j) => { const n = minhas.filter((a) => a.juiz_id === j.juiz_id && a.rodada === p.rodada).length; return [j.nome, n + " de " + p.itens.length, hofs.some((x) => x.juiz_id === j.juiz_id) ? "respondido" : "pendente"]; });
    resultados =
      '<section class="tiles tiles--adm" aria-label="Corte do painel">' +
        tile({ rotulo: "Corte (Angoff modificado), rodada " + p.rodada, valor: pct(final.corte), sub: final.corte === null ? "Ainda sem estimativas nesta rodada." : "Média das estimativas dos " + final.n_juizes + " juízes; erro-padrão " + (final.corte_ep === null ? "sem dado" : pct(final.corte_ep)) + ". Escore de corte esperado: " + n1(final.corte_bruto) + " de " + p.itens.length + " itens." }) +
        tile({ rotulo: "Dificuldade-alvo provisória dos mesmos itens", valor: pct(media(p.itens.map((x) => porId.get(x)?.angoff_item ?? porId.get(x)?.angoff))), sub: "Alvo fixado pelos autores na especificação do item; em uso até a publicação do painel. Não é julgamento de juízes." }) +
        tile({ rotulo: "Hofstee", valor: h.corte === null ? "sem dado" : n1(h.corte) + "%", sub: h.corte === null ? e(h.motivo) : "Janela dos juízes: corte de " + n1(h.k_min) + " a " + n1(h.k_max) + "%, reprovação de " + n1(h.f_min) + " a " + n1(h.f_max) + "% (" + plural(h.n_juizes, "juiz", "juízes") + ", " + plural(escores.length, "examinando", "examinandos") + " na curva).", estado: ver.ok === true ? "ok" : ver.ok === false ? "abaixo" : "" }) +
        tile({ rotulo: "Verificação do corte", valor: ver.ok === null ? "sem dado" : ver.ok ? "Passa" : "Não passa", sub: ver.ok === null ? e(ver.motivo) : "Reprovação no corte do Angoff: " + n1(ver.reprovacao_angoff) + "%. " + e(ver.motivo || "O corte do Angoff fica dentro das duas janelas de Hofstee."), estado: ver.ok === true ? "ok" : ver.ok === false ? "abaixo" : "" }) +
        tile({ rotulo: "Prontos para publicar", valor: num(pub.publicar.length) + " <small>de " + p.itens.length + "</small>", sub: pub.bloqueado ? e(pub.motivo) : "Itens com pelo menos " + MIN_JUIZES + " juízes na rodada " + p.rodada + "; erro-padrão do corte abaixo de " + Math.round(CORTE_EP_MAX * 100) + " pontos." + (pub.insuficientes.length ? " Faltam juízes em " + plural(pub.insuficientes.length, "item", "itens") + "." : ""), estado: pub.bloqueado || pub.insuficientes.length ? "abaixo" : "ok" }) +
      "</section>" +
      '<section class="panel" aria-labelledby="pr-t"><div class="panel__head"><h2 class="h-sm" id="pr-t">Progresso dos juízes na rodada ' + p.rodada + "</h2></div>" +
        tabela("Progresso dos juízes", ["Juiz", "Itens avaliados", "Hofstee"], progresso, { cabecalhoLinha: false }) + "</section>" +
      '<section class="panel" aria-labelledby="ri-t"><div class="panel__head"><h2 class="h-sm" id="ri-t">Estimativas por item</h2><p class="hint">Média das estimativas (0 a 100) por rodada, desvio-padrão e número de juízes, ao lado da dificuldade-alvo provisória do item e do p observado na turma (primeira resposta de cada pessoa, sem modo tutor).</p></div>' +
        tabela("Estimativas por item", ["Item", "Sistema", ...rodadas.map((r) => "Rodada " + r), "Dificuldade-alvo provisória", "p observado"], p.itens.map((qid) => {
          const q = porId.get(qid);
          const pobs = feedback?.p_observado?.[qid];
          return [qid, q?.sistema ? nomeChave(p.step, "sistema", q.sistema) : "", ...resumos.map((r) => { const x = r.itens[qid]; return x.n ? n1(x.media) + " (dp " + n1(x.dp) + ", n " + x.n + ")" : "sem estimativa"; }),
            pct(q?.angoff_item ?? q?.angoff, 0), pobs && pobs.n ? pct(pobs.p, 0) + " (n " + pobs.n + ")" : "sem dado"];
        })) +
      "</section>";
  } else if (fechadas.length) {
    const est = feedback?.estimativas || [];
    resultados = '<section class="panel" aria-labelledby="fb-t"><div class="panel__head"><h2 class="h-sm" id="fb-t">Retorno das rodadas fechadas</h2><p class="hint">Distribuição das estimativas do painel, sem identificar quem deu qual, e o acerto real da turma.</p></div>' +
      tabela("Retorno por item", ["Item", "Rodada", "Média do painel", "Mín. a máx.", "Sua estimativa", "p observado"], est.map((x) => {
        const minha = minhas.find((a) => a.questao_id === x.questao_id && a.rodada === x.rodada && a.juiz_id === meuId);
        const pobs = feedback?.p_observado?.[x.questao_id];
        return [x.questao_id, String(x.rodada), n1(x.media), x.min + " a " + x.max, minha ? String(minha.valor) : "", pobs && pobs.n ? pct(pobs.p, 0) + " (n " + pobs.n + ")" : "sem dado"];
      })) + "</section>";
  }

  const acoesAdmin = admin ? '<section class="panel" aria-labelledby="ac-t"><div class="panel__head"><h2 class="h-sm" id="ac-t">Conduzir o painel</h2>' +
      '<p class="hint">Feche a rodada quando os juízes terminarem; o painel passa a ver o retorno e pode discutir. Abra a próxima rodada para as estimativas revistas, ou encerre. A publicação grava a média da rodada final nos itens com pelo menos ' + MIN_JUIZES + " juízes.</p></div>" +
      '<p class="acts-row">' +
        (p.estado === "avaliacao" ? '<button class="btn btn--sm" type="button" data-acao="fechar_rodada">' + icon("lock-simple") + "Fechar a rodada " + p.rodada + "</button>" : "") +
        (p.estado === "discussao" && p.rodada < p.rodadas_max ? '<button class="btn btn--sm" type="button" data-acao="abrir_rodada">' + icon("arrow-right") + "Abrir a rodada " + (p.rodada + 1) + "</button>" : "") +
        (p.estado !== "encerrado" ? '<button class="btn btn--sm btn--ghost" type="button" data-acao="encerrar">' + icon("check") + "Encerrar o painel</button>" : "") +
        (p.estado === "encerrado" ? '<button class="btn btn--sm" type="button" data-publicar' + (bloqueioEp ? " disabled" : "") + ">" + icon("seal-check") + (p.publicado_em ? "Publicar de novo" : "Publicar o Angoff do painel") + "</button>" : "") +
      "</p>" +
      (p.estado === "encerrado" && exigeJust && !bloqueioEp ? '<div class="field field--largo"><label for="pub-just">Justificativa para publicar sem a verificação de Hofstee passar (pelo menos ' + JUSTIFICATIVA_MIN + ' caracteres; fica registrada no painel)</label><textarea id="pub-just" class="input input--area" rows="2" maxlength="2000" data-justificativa></textarea></div>' : "") +
      (p.publicacao_justificativa ? '<p class="hint">Última publicação feita com justificativa: ' + e(p.publicacao_justificativa) + "</p>" : "") +
      "<div data-acao-out aria-live=\"polite\"></div></section>" : "";

  const meuHof = hofs.find((x) => x.juiz_id === meuId);
  const blocoJuiz = sou_juiz ? '<section class="panel" aria-labelledby="jz-t"><div class="panel__head"><h2 class="h-sm" id="jz-t">Sua avaliação</h2>' +
      '<p class="hint">' + (p.estado === "avaliacao" ? "Rodada " + p.rodada + ": " + minhasRodada + " de " + p.itens.length + " itens avaliados." : p.estado === "discussao" ? "A rodada " + p.rodada + " está fechada. Veja o retorno e a discussão; a próxima rodada abre quando o admin decidir." : "O painel está encerrado.") + "</p></div>" +
      (p.estado === "avaliacao" ? '<p class="acts-row"><a class="btn" href="#/angoff/' + encodeURIComponent(id) + '/avaliar">' + icon("pencil-simple") + (minhasRodada ? "Continuar a avaliação" : "Começar a avaliação") + "</a></p>" : "") +
      (p.estado !== "encerrado" ? '<form class="form-grid form-grid--4" data-hofstee novalidate><p class="hint field--largo">Hofstee, respondido uma vez: o corte (em % de acerto neste conjunto de itens) e a reprovação (em % dos examinandos) que você aceitaria no mínimo e no máximo.</p>' +
        campoHof("k_min", "Corte mínimo aceitável (%)", meuHof?.k_min ?? 55) + campoHof("k_max", "Corte máximo aceitável (%)", meuHof?.k_max ?? 70) +
        campoHof("f_min", "Reprovação mínima aceitável (%)", meuHof?.f_min ?? 5) + campoHof("f_max", "Reprovação máxima aceitável (%)", meuHof?.f_max ?? 20) +
        '<p class="acts-row field--largo"><button class="btn btn--sm" type="submit">' + icon("check") + (meuHof ? "Atualizar o Hofstee" : "Salvar o Hofstee") + "</button></p></form>" : "") +
    "</section>" : "";

  const disc = '<section class="panel" aria-labelledby="ds-t"><div class="panel__head"><h2 class="h-sm" id="ds-t">Discussão do painel</h2><p class="hint">Comentários gerais ou sobre um item, visíveis para o admin e os juízes deste painel.</p></div>' +
    (discussao.length ? '<ul class="angoff__disc">' + discussao.map((c) => "<li><p><b>" + e(c.autor_nome || "Juiz") + "</b>, rodada " + c.rodada + (c.questao_id ? ", item " + e(c.questao_id) : "") + "</p><p>" + e(c.texto) + "</p></li>").join("") + "</ul>" : '<p class="hint">Sem comentários ainda.</p>') +
    (p.estado !== "encerrado" && (admin || sou_juiz) ? '<form class="form-grid" data-comentar novalidate>' +
      '<div class="field"><label for="ds-item">Sobre</label><select id="ds-item" name="questao_id" class="input"><option value="">o painel em geral</option>' + p.itens.map((x, i) => '<option value="' + e(x) + '">item ' + (i + 1) + " (" + e(x) + ")</option>").join("") + "</select></div>" +
      '<div class="field field--largo"><label for="ds-txt">Comentário</label><textarea id="ds-txt" name="texto" class="input input--area" rows="2" maxlength="2000" required></textarea></div>' +
      '<p class="acts-row field--largo"><button class="btn btn--sm" type="submit">' + icon("chat-text") + "Comentar</button></p></form>" : "") +
    "</section>";

  el.innerHTML = '<div class="wrap section-sm angoff">' +
    pageHead({ eyebrow: "Painel Angoff", titulo: e(p.nome), lead: e(NOME_STEP[p.step]) + ", " + plural(p.itens.length, "item", "itens") + ", " + plural(juizes.length || 0, "juiz designado", "juízes designados") + ". " + chipEstado(p) + (p.descricao ? '</p><p class="lead">' + e(p.descricao) : ""), acoes: '<a class="btn btn--ghost btn--sm" href="#/angoff">' + icon("list-checks") + "Todos os painéis</a>" }) +
    acoesAdmin + blocoJuiz + resultados + disc +
    avisoLgpd("O retorno mostra o acerto agregado da turma; nenhum aluno é identificado.") +
  "</div>";

  $$("[data-acao]", el).forEach((b) => b.addEventListener("click", async () => {
    const acao = b.dataset.acao;
    if (acao === "encerrar" && !(await confirmar("Encerrar o painel?", "Depois de encerrado, ninguém avalia nem comenta; a rodada " + p.rodada + " fica como a final.", "Encerrar"))) return;
    try { await ctx.store.avancarPainelAngoff(id, acao); toast(acao === "fechar_rodada" ? "Rodada fechada. O retorno já aparece para o painel." : acao === "abrir_rodada" ? "Rodada " + (p.rodada + 1) + " aberta." : "Painel encerrado.", "ok"); detalhe(ctx, el, id); }
    catch (err) { toast(err.message, "erro", 8000); }
  }));
  $("[data-publicar]", el)?.addEventListener("click", async () => {
    try {
      const just = $("[data-justificativa]", el)?.value || "";
      if (exigeJust && just.trim().length < JUSTIFICATIVA_MIN) { toast("A verificação de Hofstee não passou ou não tem respostas. Escreva a justificativa (pelo menos " + JUSTIFICATIVA_MIN + " caracteres) para publicar assim.", "erro", 8000); $("[data-justificativa]", el)?.focus(); return; }
      const r = await ctx.store.publicarAngoff(id, { justificativa: exigeJust ? just : "" });
      ctx.invalidar();
      $("[data-acao-out]", el).innerHTML = '<p class="alert alert--ok">' + icon("seal-check") + "<span>Angoff do painel publicado em " + plural(r.publicados, "item", "itens") + "." + (r.insuficientes?.length ? " Ficaram com a dificuldade-alvo provisória, por terem menos de " + MIN_JUIZES + " juízes: " + e(r.insuficientes.map((x) => x.questao_id).join(", ")) + "." : "") + "</span></p>";
    } catch (err) { toast(err.message, "erro", 8000); }
  });
  $("[data-hofstee]", el)?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    try { await ctx.store.salvarHofsteeAngoff(id, Object.fromEntries(["k_min", "k_max", "f_min", "f_max"].map((k) => [k, Number(d.get(k))]))); toast("Hofstee salvo.", "ok"); detalhe(ctx, el, id); }
    catch (err) { toast(err.message, "erro", 8000); }
  });
  $("[data-comentar]", el)?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    try { await ctx.store.comentarAngoff(id, { questao_id: d.get("questao_id") || null, texto: d.get("texto") }); toast("Comentário publicado.", "ok"); detalhe(ctx, el, id); }
    catch (err) { toast(err.message, "erro", 8000); }
  });
}

const media = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
function campoHof(nome, rotulo, valor) {
  return '<div class="field"><label for="hf-' + nome + '">' + e(rotulo) + '</label><input id="hf-' + nome + '" name="' + nome + '" type="number" min="0" max="100" step="1" class="input" value="' + e(String(valor)) + '" inputmode="numeric"></div>';
}

/* ---------------- avaliação do juiz ---------------- */
async function avaliar(ctx, el, id, params) {
  el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Abrindo os itens do painel...</p></div>';
  const { painel: p, sou_juiz } = await ctx.store.getPainelAngoff(id);
  if (!sou_juiz) { el.innerHTML = '<div class="wrap section-sm"><div class="empty"><h1 class="display h3">Você não é juiz deste painel.</h1><a class="btn btn--ghost" href="#/angoff/' + encodeURIComponent(id) + '">Voltar ao painel</a></div></div>'; return; }
  if (p.estado !== "avaliacao") { ctx.go("#/angoff/" + encodeURIComponent(id)); return; }
  const [itens, avs, feedback, revelados, discussao] = await Promise.all([
    ctx.store.listItensPainelAngoff(id), ctx.store.listAvaliacoesAngoff(id), ctx.store.feedbackPainelAngoff(id), ctx.store.revelarPainelAngoff(id), ctx.store.listDiscussaoAngoff(id)
  ]);
  const meuId = ctx.user.id;
  const minhas = avs.filter((a) => a.juiz_id === meuId);
  const rev = { ...revelados };
  const ordem = p.itens.filter((x) => itens.some((q) => q.id === x));
  const porId = new Map(itens.map((q) => [q.id, q]));
  let i = Math.max(0, Math.min(ordem.length - 1, Number(params.get("i") || 0) || (ordem.findIndex((x) => !minhas.some((a) => a.questao_id === x && a.rodada === p.rodada)) + 1 || 1) - 1));

  const desenhar = () => {
    const qid = ordem[i];
    const q = porId.get(qid);
    const atual = minhas.find((a) => a.questao_id === qid && a.rodada === p.rodada);
    const anterior = minhas.find((a) => a.questao_id === qid && a.rodada === p.rodada - 1);
    const fb = (feedback?.estimativas || []).find((x) => x.questao_id === qid && x.rodada === p.rodada - 1);
    const pobs = feedback?.p_observado?.[qid];
    const r = atual ? rev[qid] : null;
    const feitos = ordem.filter((x) => minhas.some((a) => a.questao_id === x && a.rodada === p.rodada)).length;
    el.innerHTML = '<div class="wrap section-sm angoff angoff--avaliar">' +
      pageHead({ eyebrow: e(p.nome) + ", rodada " + p.rodada, titulo: "Item " + (i + 1) + " de " + ordem.length, lead: feitos + " de " + ordem.length + " itens avaliados nesta rodada. A estimativa é de 0 a 100: quantos em cada 100 examinandos no limiar de aprovação acertariam o item.", acoes: '<a class="btn btn--ghost btn--sm" href="#/angoff/' + encodeURIComponent(id) + '">' + icon("arrow-counter-clockwise") + "Voltar ao painel</a>" }) +
      '<nav class="angoff__nav" aria-label="Itens do painel"><ol>' + ordem.map((x, k) => { const feito = minhas.some((a) => a.questao_id === x && a.rodada === p.rodada); return '<li><button type="button" class="angoff__num' + (feito ? " is-feito" : "") + (k === i ? " is-atual" : "") + '" data-ir="' + k + '"' + (k === i ? ' aria-current="true"' : "") + ' aria-label="Item ' + (k + 1) + (feito ? ", avaliado" : ", sem estimativa") + '">' + (k + 1) + "</button></li>"; }).join("") + "</ol></nav>" +
      '<article class="panel enu-painel" aria-labelledby="it-t"><h2 class="h-sm" id="it-t">Item ' + (i + 1) + " <small>" + e(qid) + (q.sistema ? ", " + e(nomeChave(p.step, "sistema", q.sistema)) : "") + "</small></h2>" +
        '<div class="enu" lang="en"><p class="enu__vin">' + e(q.vinheta) + "</p>" + tabelaItem(q.tabela) + htmlMidiaItem(q.midia) + '<p class="enu__perg"><b>' + e(q.pergunta) + "</b></p>" +
        '<ol class="enu__alts">' + q.alternativas.map((a) => '<li class="enu__alt' + (r && a.letra === r.correta ? " is-correta" : "") + '"><span class="enu__l">' + e(a.letra) + "</span><span>" + e(a.texto) + (r && a.letra === r.correta ? ' <span class="gar gar--ok" lang="pt-BR">gabarito</span>' : "") + "</span></li>").join("") + "</ol></div>" +
        (p.rodada > 1 ? '<div class="angoff__fb"><h3 class="h-xs">Retorno da rodada ' + (p.rodada - 1) + "</h3><p>" +
          (fb ? "Média do painel: <b>" + n1(fb.media) + "</b> (de " + fb.min + " a " + fb.max + ", " + plural(fb.n, "juiz", "juízes") + "). " + histo(fb.histograma) : "Sem estimativas do painel na rodada anterior. ") +
          (anterior ? " Sua estimativa: <b>" + anterior.valor + "</b>." : "") + " Acerto real na turma: <b>" + (pobs && pobs.n ? pct(pobs.p, 0) + "</b> (" + plural(pobs.n, "examinando", "examinandos") + ")" : "sem dado</b>") + ".</p>" +
          discussao.filter((c) => c.questao_id === qid).map((c) => '<p class="hint">' + icon("chat-text") + " " + e(c.autor_nome || "Juiz") + ": " + e(c.texto) + "</p>").join("") + "</div>" : "") +
        '<form class="form-grid angoff__form" data-estimar novalidate>' +
          '<div class="field"><label for="es-v">Sua estimativa (0 a 100)</label><input id="es-v" name="valor" type="number" min="0" max="100" step="1" required class="input" inputmode="numeric" value="' + (atual ? atual.valor : anterior ? anterior.valor : "") + '" aria-describedby="es-dica"><p class="hint" id="es-dica">Porcentagem de examinandos no limiar de aprovação que acertariam este item.</p></div>' +
          '<div class="field field--largo"><label for="es-c">Comentário (opcional)</label><input id="es-c" name="comentario" class="input" maxlength="1000" autocomplete="off" value="' + e(atual?.comentario || "") + '"></div>' +
          '<p class="acts-row field--largo"><button class="btn" type="submit">' + icon("check") + (atual ? "Atualizar a estimativa" : "Registrar e ver o gabarito") + "</button>" +
          (i < ordem.length - 1 ? '<button class="btn btn--ghost" type="button" data-ir="' + (i + 1) + '">' + icon("arrow-right") + "Próximo item</button>" : "") + "</p>" +
        "</form>" +
        (r ? '<div class="angoff__rev" aria-live="polite"><h3 class="h-xs">' + icon("seal-check") + "Gabarito: " + e(r.correta) + "</h3>" + (r.explicacao ? '<p lang="en">' + e(r.explicacao) + "</p>" : "") + (r.explicacao_pt ? "<p>" + e(r.explicacao_pt) + "</p>" : "") + "</div>"
           : '<p class="hint">' + icon("lock-simple") + " O gabarito e a explicação aparecem depois que você registrar a estimativa.</p>") +
      "</article></div>";
    $$("[data-ir]", el).forEach((b) => b.addEventListener("click", () => { i = Number(b.dataset.ir); desenhar(); $("#it-t", el)?.focus?.(); }));
    $("[data-estimar]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const d = new FormData(ev.currentTarget);
      const valor = d.get("valor") === "" ? "" : Number(d.get("valor"));
      try {
        const res = await ctx.store.avaliarItemAngoff(id, qid, valor, d.get("comentario") || "");
        rev[qid] = res.revelado;
        const k = minhas.findIndex((a) => a.questao_id === qid && a.rodada === p.rodada);
        const reg = { juiz_id: meuId, questao_id: qid, rodada: p.rodada, valor: Number(valor), comentario: d.get("comentario") || "" };
        if (k >= 0) minhas[k] = reg; else minhas.push(reg);
        toast("Estimativa registrada.", "ok");
        desenhar();
        $(".angoff__rev", el)?.scrollIntoView({ block: "nearest" });
      } catch (err) { toast(err.message, "erro", 8000); }
    });
  };
  desenhar();
}

/* tabela laboratorial do item, no mesmo formato da ficha do item */
function tabelaItem(t) {
  if (!t?.linhas?.length) return "";
  return '<table class="mini-tab enu__tab"><caption>' + e(t.titulo || "Laboratory studies") + "</caption><tbody>" + t.linhas.map((l) => "<tr>" + (Array.isArray(l) ? l : [l]).map((c) => "<td>" + e(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
}

/* histograma em texto (faixas de 10 em 10) */
function histo(h) {
  if (!Array.isArray(h)) return "";
  const partes = h.map((c, k) => (c ? k * 10 + " a " + (k === 9 ? 100 : k * 10 + 9) + ": " + c : null)).filter(Boolean);
  return partes.length ? "Distribuição: " + e(partes.join("; ")) + "." : "";
}
