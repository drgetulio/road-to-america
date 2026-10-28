/* Road to America | curadoria (administradores): fila de revisão, sinalizações,
   promoção a oficial, importação e cards iniciais */
import { checkQuality } from "../quality.js";
import { itemsOf } from "../cards.js";
import { toAnkiTsv } from "../tsv.js";
import { plainText } from "../util.js";
import { $, $$, e, icon, toast, dialog, download, dataHora, num } from "../ui.js";
import { pageHead, cardPass, emptyState, MOTIVOS_SINALIZACAO, badgeBaralho } from "./shared.js";
import { verCard, importarDialog } from "./navegador.js";

export default {
  titulo: "Curadoria",
  async render(ctx, el, { params }) {
    const aba = ["fila", "sinalizacoes", "comunidade", "dados"].includes(params.get("aba")) ? params.get("aba") : "fila";
    const flags = await ctx.store.listFlags();
    const abertas = flags.filter((f) => f.status === "aberta");
    const fila = ctx.cards.filter((c) => c.status === "em_revisao").sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    const comunidade = ctx.cards.filter((c) => c.baralho === "comunidade" && c.status === "aprovado");
    const tab = (id, rot, n, ic) => '<a href="#/curadoria?aba=' + id + '" class="tab"' + (aba === id ? ' aria-current="page"' : "") + ">" + icon(ic) + rot + (n != null ? ' <span class="tab__n">' + n + "</span>" : "") + "</a>";

    el.innerHTML = '<div class="wrap section-sm">' +
      pageHead({ eyebrow: "Administração", titulo: "Curadoria", lead: "Revise os cards da comunidade, responda às sinalizações e mantenha o baralho oficial correto e atualizado." }) +
      '<nav class="tabs" aria-label="Seções da curadoria">' +
        tab("fila", "Fila de revisão", fila.length, "seal-check") +
        tab("sinalizacoes", "Sinalizações", abertas.length, "flag") +
        tab("comunidade", "Comunidade aprovada", comunidade.length, "users-three") +
        tab("dados", "Importar e exportar", null, "upload-simple") +
      "</nav><div data-aba></div></div>";
    const box = $("[data-aba]", el);

    if (aba === "fila") renderFila(ctx, box, fila);
    else if (aba === "sinalizacoes") renderFlags(ctx, box, flags);
    else if (aba === "comunidade") renderComunidade(ctx, box, comunidade);
    else renderDados(ctx, box);
  }
};

function renderFila(ctx, box, fila) {
  if (!fila.length) {
    box.innerHTML = emptyState({ titulo: "A fila está vazia.", texto: "Nenhum card da comunidade espera revisão. Os envios dos participantes aparecem aqui, do mais antigo para o mais novo.", icone: "check-circle" });
    return;
  }
  box.innerHTML = '<ol class="review-list">' + fila.map((c) => {
    const qa = checkQuality(c, ctx.cards.filter((x) => x.id !== c.id)).filter((x) => x.nivel !== "dica");
    const ord = itemsOf(c)[0]?.ord || 1;
    return '<li class="review" data-id="' + e(c.id) + '">' +
      '<div class="review__card">' + cardPass(ctx, c, ord, { lado: "verso", previa: true }) + "</div>" +
      '<div class="review__side">' +
        '<p class="review__who">' + icon("user-circle") + "<span><b>" + e(c.autor_nome || "Participante") + "</b> · enviado em " + e(dataHora(c.atualizado_em)) + " · v" + c.versao + "</span></p>" +
        (qa.length ? '<ul class="qa qa--compact">' + qa.slice(0, 4).map((x) => '<li class="qa__item qa__item--' + x.nivel + '">' + icon(x.nivel === "erro" ? "x-circle" : "warning") + '<div><p class="qa__t">' + e(x.titulo) + "</p></div></li>").join("") + "</ul>" : '<p class="qa__ok">' + icon("check-circle") + "Sem avisos do verificador.</p>") +
        '<div class="review__acts">' +
          '<button type="button" class="btn btn--sm" data-aprovar>' + icon("check") + "Aprovar</button>" +
          '<button type="button" class="btn btn--sm btn--ghost" data-oficial>' + icon("seal-check") + "Aprovar como oficial</button>" +
          '<a class="btn btn--sm btn--ghost" href="#/criar?id=' + e(encodeURIComponent(c.id)) + '&amp;revisar=1">' + icon("pencil-simple") + "Editar e aprovar</a>" +
          '<button type="button" class="btn btn--sm btn--perigo" data-rejeitar>' + icon("x") + "Rejeitar</button>" +
          '<button type="button" class="link-btn" data-hist>' + icon("clock-counter-clockwise") + "Histórico</button>" +
        "</div>" +
      "</div></li>";
  }).join("") + "</ol>";

  box.addEventListener("click", async (ev) => {
    const li = ev.target.closest("[data-id]");
    if (!li) return;
    const c = ctx.cardMap.get(li.dataset.id);
    try {
      if (ev.target.closest("[data-aprovar]")) {
        await ctx.store.reviewCard(c.id, { decisao: "aprovar" });
        toast("Card aprovado e publicado na comunidade.", "ok");
      } else if (ev.target.closest("[data-oficial]")) {
        await ctx.store.reviewCard(c.id, { decisao: "aprovar", promover: true });
        toast("Card aprovado como oficial.", "ok");
      } else if (ev.target.closest("[data-rejeitar]")) {
        const r = await dialog({
          titulo: "Rejeitar card",
          corpo: '<p>O autor vê o comentário e pode corrigir e reenviar.</p><div class="field"><label for="rej-c">Comentário para o autor</label><textarea id="rej-c" name="comentario" class="input" rows="4" required placeholder="Ex.: a resposta junta dois fatos. Separe em dois cards e cite a fonte."></textarea></div><p class="error" data-dialog-erro hidden></p>',
          acoes: [{ rotulo: "Cancelar", valor: "cancelar", estilo: "ghost", cancelar: true }, { rotulo: "Rejeitar", valor: "rejeitar", estilo: "perigo" }],
          validar: (d) => (!d.comentario || d.comentario.trim().length < 5 ? "Escreva um comentário para o autor." : "")
        });
        if (!r) return;
        await ctx.store.reviewCard(c.id, { decisao: "rejeitar", comentario: r.dados.comentario });
        toast("Card rejeitado com comentário.", "ok");
      } else if (ev.target.closest("[data-hist]")) {
        await verCard(ctx, c);
        return;
      } else return;
      await ctx.reloadCards();
      ctx.atualizarBadge?.();
      ctx.render();
    } catch (err) { toast(err.message, "erro"); }
  });
}

function renderFlags(ctx, box, flags) {
  const motivo = Object.fromEntries(MOTIVOS_SINALIZACAO);
  const abertas = flags.filter((f) => f.status === "aberta").sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const fechadas = flags.filter((f) => f.status !== "aberta");
  const item = (f, aberta) => {
    const c = ctx.cardMap.get(f.card_id);
    return '<li class="review" data-flag="' + e(f.id) + '" data-card="' + e(f.card_id) + '">' +
      '<div class="review__card">' + (c ? cardPass(ctx, c, itemsOf(c)[0]?.ord || 1, { lado: "verso", previa: true }) : '<p class="muted">Card ' + e(f.card_id) + " não está mais disponível.</p>") + "</div>" +
      '<div class="review__side">' +
        '<p class="review__who">' + icon("flag") + "<span><b>" + e(motivo[f.motivo] || f.motivo) + "</b> · " + e(f.autor_nome || "Participante") + " · " + e(dataHora(f.criado_em)) + "</span></p>" +
        '<blockquote class="quote">' + e(f.texto || "Sem descrição.") + "</blockquote>" +
        (f.resposta ? '<p class="row__review">' + icon("chat-text") + "<span><b>Resposta:</b> " + e(f.resposta) + "</span></p>" : "") +
        (aberta ? '<div class="review__acts">' +
          (c ? '<a class="btn btn--sm btn--ghost" href="#/criar?id=' + e(encodeURIComponent(c.id)) + '&amp;voltar=curadoria">' + icon("pencil-simple") + "Corrigir card</a>" : "") +
          '<button type="button" class="btn btn--sm" data-resolver>' + icon("check") + "Marcar como resolvida</button>" +
          '<button type="button" class="btn btn--sm btn--ghost" data-descartar>' + icon("x") + "Descartar</button>" +
        "</div>" : "") +
      "</div></li>";
  };
  box.innerHTML = (abertas.length ? '<ol class="review-list">' + abertas.map((f) => item(f, true)).join("") + "</ol>"
      : emptyState({ titulo: "Nenhuma sinalização aberta.", texto: "Quando um participante apontar um erro, ele aparece aqui com o card e a explicação.", icone: "check-circle" })) +
    (fechadas.length ? '<details class="panel closed"><summary>Sinalizações encerradas (' + fechadas.length + ")</summary><ol class=\"review-list\">" + fechadas.map((f) => item(f, false)).join("") + "</ol></details>" : "");

  box.addEventListener("click", async (ev) => {
    const li = ev.target.closest("[data-flag]");
    if (!li) return;
    const resolver = ev.target.closest("[data-resolver]");
    const descartar = ev.target.closest("[data-descartar]");
    if (!resolver && !descartar) return;
    const r = await dialog({
      titulo: resolver ? "Resolver sinalização" : "Descartar sinalização",
      corpo: '<div class="field"><label for="fl-r">Resposta ao participante</label><textarea id="fl-r" name="resposta" class="input" rows="3" placeholder="' + (resolver ? "Ex.: corrigido na versão 3. Obrigado!" : "Ex.: o card está de acordo com a referência citada (Robbins, 10th ed.).") + '"></textarea></div>',
      acoes: [{ rotulo: "Cancelar", valor: "cancelar", estilo: "ghost", cancelar: true }, { rotulo: resolver ? "Resolver" : "Descartar", valor: "ok" }]
    });
    if (!r) return;
    try {
      await ctx.store.resolveFlag(li.dataset.flag, { status: resolver ? "resolvida" : "descartada", resposta: r.dados.resposta || "" });
      toast(resolver ? "Sinalização resolvida." : "Sinalização descartada.", "ok");
      ctx.atualizarBadge?.();
      ctx.render();
    } catch (err) { toast(err.message, "erro"); }
  });
}

function renderComunidade(ctx, box, lista) {
  if (!lista.length) {
    box.innerHTML = emptyState({ titulo: "Nenhum card aprovado na comunidade.", texto: "Cards aprovados aparecem aqui. Os melhores podem ser promovidos ao baralho oficial.", icone: "users-three" });
    return;
  }
  box.innerHTML = '<ul class="rows">' + lista.map((c) => '<li class="row" data-id="' + e(c.id) + '"><div class="row__main">' +
    '<p class="row__q" lang="en">' + e(plainText(c.frente).slice(0, 200)) + "</p>" +
    '<p class="row__meta">' + badgeBaralho(c.baralho) + '<span class="tagline">' + e(c.autor_nome || "") + " · " + e(ctx.tax.nomeSistema[c.sistema] || c.sistema) + "</span></p></div>" +
    '<div class="row__acts"><button type="button" class="btn btn--sm btn--ghost" data-promover>' + icon("seal-check") + "Promover a oficial</button></div></li>").join("") + "</ul>";
  box.addEventListener("click", async (ev) => {
    if (!ev.target.closest("[data-promover]")) return;
    const id = ev.target.closest("[data-id]").dataset.id;
    try {
      await ctx.store.promoteCard(id);
      await ctx.reloadCards();
      toast("Card promovido ao baralho oficial.", "ok");
      ctx.render();
    } catch (err) { toast(err.message, "erro"); }
  });
}

function renderDados(ctx, box) {
  const rel = ctx.seedsRelatorio;
  const noBanco = new Set(ctx.cards.map((c) => c.id));
  const faltando = ctx.seeds.filter((s) => !noBanco.has(s.id));
  box.innerHTML =
    '<div class="grid2 grid2--top">' +
    '<section class="panel"><div class="panel__head"><h2 class="h-sm">Importar e exportar</h2><p class="hint">Importe planilhas TSV ou CSV para o baralho oficial ou da comunidade. A exportação gera o arquivo de importação do Anki desktop, com baralho, tags hierárquicas e identificador estável.</p></div>' +
      '<div class="stack-acts">' +
        '<button type="button" class="btn btn--sm" data-imp>' + icon("upload-simple") + "Importar TSV ou CSV</button>" +
        '<button type="button" class="btn btn--sm btn--ghost" data-exp>' + icon("download-simple") + "Exportar baralho oficial para o Anki</button>" +
        '<button type="button" class="btn btn--sm btn--ghost" data-json>' + icon("download-simple") + "Exportar todos os cards (JSON)</button>" +
      "</div></section>" +
    '<section class="panel"><div class="panel__head"><h2 class="h-sm">Cards iniciais (data/)</h2><p class="hint">Arquivos listados em <code>anki/data/manifest.json</code>. Arquivos ausentes são ignorados.</p></div>' +
      '<ul class="seed-list">' + (rel.length ? rel.map((r) => "<li>" + icon(r.ok ? "check-circle" : "warning-circle") + "<span><code>" + e(r.arquivo) + "</code> · " + (r.ok ? num(r.aceitos) + " cards" + (r.recusados ? ", " + r.recusados + " ignorados" : "") : e(r.motivo === "ausente" ? "ainda não existe" : r.motivo)) + "</span></li>").join("") : "<li>Nenhum manifesto encontrado.</li>") + "</ul>" +
      (ctx.modo === "supabase" ? '<p class="body">' + (faltando.length ? num(faltando.length) + " cards iniciais ainda não estão no banco." : "Todos os cards iniciais já estão no banco.") + "</p>" +
        (faltando.length ? '<button type="button" class="btn btn--sm" data-publicar>' + icon("upload-simple") + "Publicar cards iniciais no banco</button>" : "") : '<p class="hint">No modo demonstração, os cards iniciais entram automaticamente como oficiais.</p>') +
    "</section></div>";

  $("[data-imp]", box).addEventListener("click", () => importarDialog(ctx, { admin: true, aoConcluir: () => ctx.render() }));
  $("[data-exp]", box).addEventListener("click", () => {
    const lista = ctx.cards.filter((c) => c.baralho === "oficial" && c.status === "aprovado");
    download("road-to-america-oficial-" + new Date().toISOString().slice(0, 10) + ".txt", toAnkiTsv(lista, { nomesSistema: ctx.tax.nomeSistema }));
    toast(num(lista.length) + " cards exportados.", "ok");
  });
  $("[data-json]", box).addEventListener("click", () => {
    download("road-to-america-cards-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(ctx.cards, null, 2), "application/json");
  });
  $("[data-publicar]", box)?.addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    try {
      const n = await ctx.store.importCards(faltando, { baralho: "oficial" });
      await ctx.reloadCards();
      toast(num(n) + " cards iniciais publicados.", "ok");
      ctx.render();
    } catch (err) { toast(err.message, "erro"); ev.target.disabled = false; }
  });
}
