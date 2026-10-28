/* Road to America | navegador de cards: busca, filtros, edição, suspensão e exportação */
import { itemsOf, ROTULO_STATUS, BARALHOS, STATUS, normalizeCard } from "../cards.js";
import { canEdit, canDelete } from "../permissions.js";
import { newState, State } from "../scheduler.js";
import { toAnkiTsv, importDelimited, templateTsv } from "../tsv.js";
import { plainText, formatInterval } from "../util.js";
import { $, $$, e, icon, toast, dialog, confirmar, optionList, download, readFile, dataHora, num } from "../ui.js";
import { pageHead, badgeBaralho, badgeStatus, cardPass, emptyState, sinalizar, MOTIVOS_SINALIZACAO } from "./shared.js";

const PASSO = 60;

export default {
  titulo: "Cards",
  async render(ctx, el, { params }) {
    const f = {
      q: params.get("q") || "",
      baralho: params.get("baralho") || "",
      sistema: params.get("sistema") || "",
      disciplina: params.get("disciplina") || "",
      status: params.get("status") || "",
      tag: params.get("tag") || "",
      estado: params.get("filtro") || params.get("estado") || "",
      meus: params.get("meus") === "1"
    };
    const aba = params.get("aba") === "sinalizacoes" ? "sinalizacoes" : "cards";
    let limite = PASSO;

    el.innerHTML =
      '<div class="wrap section-sm">' +
      pageHead({
        eyebrow: "Navegador",
        titulo: "Cards",
        acoes: '<a class="btn btn--sm" href="#/criar">' + icon("plus") + "Novo card</a>"
      }) +
      '<nav class="tabs" aria-label="Seções do navegador">' +
        '<a href="#/cards" class="tab"' + (aba === "cards" ? ' aria-current="page"' : "") + ">" + icon("cards") + "Todos os cards</a>" +
        '<a href="#/cards?aba=sinalizacoes" class="tab"' + (aba === "sinalizacoes" ? ' aria-current="page"' : "") + ">" + icon("flag") + "Minhas sinalizações</a>" +
      "</nav>" +
      '<div data-aba></div></div>';

    const box = $("[data-aba]", el);
    if (aba === "sinalizacoes") return renderSinalizacoes(ctx, box);

    const tags = [...new Set(ctx.cards.flatMap((c) => c.tags))].sort();
    box.innerHTML =
      '<form class="filters panel" data-filtros role="search" aria-label="Filtrar cards">' +
        '<div class="field filters__q"><label for="b-q">Buscar no texto</label><div class="input-icon">' + icon("magnifying-glass") + '<input id="b-q" name="q" type="search" class="input" value="' + e(f.q) + '" placeholder="ex.: aldosterone, G6PD, r2a-cardio" autocomplete="off"></div></div>' +
        '<div class="field"><label for="b-bar">Baralho</label><select id="b-bar" name="baralho" class="input">' + optionList(BARALHOS.map((b) => ({ chave: b, nome_pt: { oficial: "Oficial R2A", comunidade: "Comunidade", pessoal: "Pessoal" }[b] })), f.baralho, { vazio: "Todos" }) + "</select></div>" +
        '<div class="field"><label for="b-sis">Sistema</label><select id="b-sis" name="sistema" class="input">' + optionList(ctx.tax.sistemas, f.sistema, { vazio: "Todos", rotulo: (s) => s.nome_curto || s.nome_pt }) + "</select></div>" +
        '<div class="field"><label for="b-dis">Disciplina</label><select id="b-dis" name="disciplina" class="input">' + optionList(ctx.tax.disciplinas, f.disciplina, { vazio: "Todas", rotulo: (s) => s.nome_curto || s.nome_pt }) + "</select></div>" +
        '<div class="field"><label for="b-st">Status</label><select id="b-st" name="status" class="input">' + optionList(STATUS.map((s) => ({ chave: s, nome_pt: ROTULO_STATUS[s] })), f.status, { vazio: "Todos" }) + "</select></div>" +
        '<div class="field"><label for="b-tag">Tag</label><input id="b-tag" name="tag" class="input" list="b-tags" value="' + e(f.tag) + '" autocomplete="off"><datalist id="b-tags">' + tags.map((t) => '<option value="' + e(t) + '">').join("") + "</datalist></div>" +
        '<div class="field"><label for="b-est">Situação no estudo</label><select id="b-est" name="estado" class="input">' +
          optionList([{ chave: "novo", nome_pt: "Nunca estudados" }, { chave: "aprendendo", nome_pt: "Em aprendizagem" }, { chave: "revisao", nome_pt: "Em revisão" }, { chave: "maduro", nome_pt: "Maduros (21 dias ou mais)" }, { chave: "suspenso", nome_pt: "Suspensos" }, { chave: "leech", nome_pt: "Leeches" }], f.estado, { vazio: "Todas" }) + "</select></div>" +
        '<label class="check filters__meus"><input type="checkbox" name="meus" value="1"' + (f.meus ? " checked" : "") + "><span>Só os que eu criei</span></label>" +
      "</form>" +
      '<div class="list-head"><p class="list-head__n" data-n role="status"></p>' +
        '<div class="list-head__acts">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-exportar>' + icon("download-simple") + "Exportar para o Anki</button>" +
          '<button type="button" class="btn btn--ghost btn--sm" data-importar>' + icon("upload-simple") + "Importar TSV</button>" +
        "</div></div>" +
      '<ul class="rows" data-rows></ul>' +
      '<div class="more" data-more></div>';

    const form = $("[data-filtros]", box);

    function filtrar() {
      const q = f.q.trim().toLowerCase();
      return ctx.cards.filter((c) => {
        if (f.baralho && c.baralho !== f.baralho) return false;
        if (f.sistema && c.sistema !== f.sistema) return false;
        if (f.disciplina && c.disciplina !== f.disciplina) return false;
        if (f.status && c.status !== f.status) return false;
        if (f.tag && !c.tags.includes(f.tag)) return false;
        if (f.meus && c.autor_id !== ctx.user.id) return false;
        if (f.estado) {
          const sts = itemsOf(c).map((it) => ctx.states.get(it.key));
          const ok = {
            novo: () => sts.some((s) => !s || s.state === State.New),
            aprendendo: () => sts.some((s) => s && (s.state === State.Learning || s.state === State.Relearning)),
            revisao: () => sts.some((s) => s && s.state === State.Review),
            maduro: () => sts.some((s) => s && s.state === State.Review && s.scheduled_days >= 21),
            suspenso: () => sts.some((s) => s?.suspenso),
            leech: () => sts.some((s) => s?.leech)
          }[f.estado];
          if (ok && !ok()) return false;
        }
        if (q) {
          const txt = (c.id + " " + plainText(c.frente) + " " + plainText(c.verso) + " " + plainText(c.extra) + " " + c.nota_pt + " " + c.tags.join(" ")).toLowerCase();
          if (!txt.includes(q)) return false;
        }
        return true;
      });
    }

    function situacao(c) {
      const its = itemsOf(c);
      const sts = its.map((it) => ctx.states.get(it.key));
      if (sts.some((s) => s?.leech)) return '<span class="chip chip--leech">' + icon("warning-circle") + "Leech</span>";
      if (sts.some((s) => s?.suspenso)) return '<span class="chip chip--susp">' + icon("pause-circle") + "Suspenso</span>";
      const vistos = sts.filter((s) => s && s.state !== State.New);
      if (!vistos.length) return '<span class="chip">Novo</span>';
      const prox = Math.min(...vistos.map((s) => new Date(s.due).getTime()));
      const ms = prox - Date.now();
      return '<span class="chip">' + (ms <= 0 ? "Vence hoje" : "Próxima em " + formatInterval(ms)) + "</span>";
    }

    function linha(c) {
      const meu = c.autor_id === ctx.user.id;
      const n = c.tipo === "cloze" ? itemsOf(c).length : 0;
      const susp = itemsOf(c).some((it) => ctx.states.get(it.key)?.suspenso);
      return '<li class="row" data-id="' + e(c.id) + '">' +
        '<div class="row__main">' +
          '<p class="row__q" lang="en">' + e(plainText(c.frente).slice(0, 220)) + "</p>" +
          (c.tipo === "basico" ? '<p class="row__a" lang="en">' + e(plainText(c.verso).slice(0, 160)) + "</p>" : "") +
          '<p class="row__meta">' + badgeBaralho(c.baralho) + badgeStatus(c) +
            '<span class="tagline">' + e(ctx.tax.nomeSistema[c.sistema] || c.sistema) + " · " + e(ctx.tax.nomeDisciplina[c.disciplina] || c.disciplina) + "</span>" +
            (n ? '<span class="tagline">' + n + (n === 1 ? " lacuna" : " lacunas") + "</span>" : "") +
            situacao(c) + (meu ? '<span class="tagline">' + icon("user-circle") + "Seu</span>" : "") +
          "</p>" +
          (c.status === "rejeitado" && c.comentario_revisao && meu ? '<p class="row__review">' + icon("chat-text") + "<span><b>Curadoria:</b> " + e(c.comentario_revisao) + "</span></p>" : "") +
        "</div>" +
        '<div class="row__acts">' +
          '<button type="button" class="icon-btn" data-ver title="Ver card" aria-label="Ver card ' + e(c.id) + '">' + icon("eye") + "</button>" +
          (canEdit(c, ctx.user) ? '<a class="icon-btn" href="#/criar?id=' + e(encodeURIComponent(c.id)) + '" title="Editar" aria-label="Editar card ' + e(c.id) + '">' + icon("pencil-simple") + "</a>" : "") +
          '<button type="button" class="icon-btn" data-susp title="' + (susp ? "Reativar" : "Suspender") + '" aria-label="' + (susp ? "Reativar" : "Suspender") + " card " + e(c.id) + '">' + icon(susp ? "play-circle" : "pause-circle") + "</button>" +
          '<button type="button" class="icon-btn" data-sin title="Sinalizar erro" aria-label="Sinalizar erro no card ' + e(c.id) + '">' + icon("flag") + "</button>" +
          (canDelete(c, ctx.user) ? '<button type="button" class="icon-btn icon-btn--perigo" data-del title="Excluir" aria-label="Excluir card ' + e(c.id) + '">' + icon("trash") + "</button>" : "") +
        "</div></li>";
    }

    function desenhar() {
      const lista = filtrar();
      $("[data-n]", box).textContent = num(lista.length) + (lista.length === 1 ? " card" : " cards") + (lista.length !== ctx.cards.length ? " de " + num(ctx.cards.length) : "");
      const rows = $("[data-rows]", box);
      if (!lista.length) {
        rows.innerHTML = "<li>" + emptyState({ titulo: ctx.cards.length ? "Nenhum card com estes filtros." : "Ainda não há cards.", texto: ctx.cards.length ? "Limpe algum filtro ou busque por outro termo." : "Crie o primeiro card ou importe um TSV.", acoes: '<a class="btn" href="#/criar">Criar card</a>', icone: "magnifying-glass" }) + "</li>";
        $("[data-more]", box).innerHTML = "";
        return lista;
      }
      rows.innerHTML = lista.slice(0, limite).map(linha).join("");
      $("[data-more]", box).innerHTML = lista.length > limite ? '<button type="button" class="btn btn--ghost" data-mais>Mostrar mais ' + Math.min(PASSO, lista.length - limite) + "</button>" : "";
      $("[data-mais]", box)?.addEventListener("click", () => { limite += PASSO; desenhar(); });
      return lista;
    }

    function sincronizarUrl() {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(f)) if (v && k !== "meus") p.set(k === "estado" ? "estado" : k, v);
      if (f.meus) p.set("meus", "1");
      history.replaceState(null, "", "#/cards" + (p.toString() ? "?" + p : ""));
    }

    let t = null;
    form.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const d = new FormData(form);
        Object.assign(f, { q: d.get("q") || "", baralho: d.get("baralho") || "", sistema: d.get("sistema") || "", disciplina: d.get("disciplina") || "", status: d.get("status") || "", tag: d.get("tag") || "", estado: d.get("estado") || "", meus: !!d.get("meus") });
        limite = PASSO;
        sincronizarUrl();
        desenhar();
      }, 140);
    });
    form.addEventListener("submit", (ev) => ev.preventDefault());

    $("[data-rows]", box).addEventListener("click", async (ev) => {
      const li = ev.target.closest("[data-id]");
      if (!li) return;
      const c = ctx.cardMap.get(li.dataset.id);
      if (!c) return;
      if (ev.target.closest("[data-ver]")) verCard(ctx, c);
      else if (ev.target.closest("[data-sin]")) sinalizar(ctx, c, dialog, toast);
      else if (ev.target.closest("[data-susp]")) {
        const its = itemsOf(c);
        const susp = its.some((it) => ctx.states.get(it.key)?.suspenso);
        const novos = its.map((it) => {
          const st = ctx.states.get(it.key) || newState(it);
          return { ...st, suspenso: !susp, leech: susp ? false : st.leech };
        });
        try {
          await ctx.store.saveStates(novos);
          novos.forEach((s) => ctx.states.set(s.key, s));
          toast(susp ? "Card reativado. Ele volta para a agenda." : "Card suspenso. Ele não aparece mais nas sessões.", "ok");
          desenhar();
        } catch (err) { toast(err.message, "erro"); }
      } else if (ev.target.closest("[data-del]")) {
        if (!(await confirmar("Excluir este card?", "O card e o seu progresso nele serão apagados. Isso não pode ser desfeito.", "Excluir", true))) return;
        try {
          await ctx.store.deleteCard(c.id);
          await ctx.reloadCards();
          toast("Card excluído.", "ok");
          desenhar();
        } catch (err) { toast(err.message, "erro"); }
      }
    });

    $("[data-exportar]", box).addEventListener("click", () => {
      const lista = filtrar();
      if (!lista.length) { toast("Nenhum card para exportar com estes filtros.", "aviso"); return; }
      download("road-to-america-step1-" + new Date().toISOString().slice(0, 10) + ".txt", toAnkiTsv(lista, { nomesSistema: ctx.tax.nomeSistema }));
      toast(num(lista.length) + " cards exportados. No Anki: Arquivo > Importar.", "ok", 6000);
    });
    $("[data-importar]", box).addEventListener("click", () => importarDialog(ctx, { aoConcluir: desenhar }));

    desenhar();
  }
};

export async function verCard(ctx, c) {
  const ords = itemsOf(c).map((i) => i.ord);
  const historico = await ctx.store.listHistory(c.id).catch(() => []);
  await dialog({
    titulo: "Card " + c.id,
    largura: "largo",
    corpo:
      (ords.length > 1 ? '<p class="hint">Mostrando a lacuna c' + ords[0] + " de " + ords.length + ".</p>" : "") +
      cardPass(ctx, c, ords[0] || 1, { lado: "verso", estado: ctx.states.get(c.id + "#" + (ords[0] || 1)) }) +
      '<dl class="meta-grid">' +
        "<div><dt>Baralho</dt><dd>" + badgeBaralho(c.baralho) + "</dd></div>" +
        "<div><dt>Status</dt><dd>" + e(c.baralho === "pessoal" ? "Pessoal" : ROTULO_STATUS[c.status]) + "</dd></div>" +
        "<div><dt>Autor</dt><dd>" + e(c.autor_nome || (c.origem === "seed" ? "Road to America" : "")) + "</dd></div>" +
        "<div><dt>Versão</dt><dd>" + c.versao + "</dd></div>" +
        "<div><dt>Tags</dt><dd>" + e(c.tags.join(", ") || "sem tags") + "</dd></div>" +
      "</dl>" +
      (historico.length ? '<h3 class="h-sm">Histórico de versões</h3><ol class="hist">' + historico.map((h) =>
        "<li><b>v" + h.versao + "</b> · " + e(ACOES[h.acao] || h.acao) + " · " + e(dataHora(h.criado_em)) +
        (h.dados ? '<details><summary>Ver conteúdo desta versão</summary><p lang="en">' + e(plainText(h.dados.frente)) + "</p>" + (h.dados.verso ? '<p lang="en"><b>Verso:</b> ' + e(plainText(h.dados.verso)) + "</p>" : "") + "</details>" : "") + "</li>").join("") + "</ol>" : "")
  });
}

const ACOES = { criado: "criado", editado: "editado", status: "status alterado", aprovado: "aprovado", rejeitado: "rejeitado", em_revisao: "enviado para revisão", rascunho: "voltou a rascunho", promovido: "promovido a oficial", aprovado_oficial: "aprovado como oficial", baralho: "baralho alterado" };

export async function importarDialog(ctx, { aoConcluir, admin = false } = {}) {
  const r = await dialog({
    titulo: admin ? "Importar cards (curadoria)" : "Importar TSV para o meu baralho",
    largura: "largo",
    corpo:
      "<p>Aceita o arquivo exportado por este app ou uma planilha salva como TSV ou CSV com as colunas <code>id, tipo, frente, verso, extra, nota_pt, sistema, disciplina, tags, rendimento, fonte</code>. Sistema e disciplina usam as chaves do outline (por exemplo, <code>cardiovascular</code> e <code>farmacologia</code>).</p>" +
      '<p><button type="button" class="link-btn" data-modelo>' + icon("download-simple") + "Baixar planilha-modelo</button></p>" +
      '<div class="field"><label for="imp-arq">Arquivo</label><input id="imp-arq" name="arquivo" type="file" accept=".tsv,.txt,.csv,text/plain,text/csv,text/tab-separated-values" class="input"></div>' +
      (admin ? '<fieldset class="field"><legend>Baralho de destino</legend><div class="radios radios--row">' +
        '<label class="radio"><input type="radio" name="baralho" value="oficial" checked><span>Oficial R2A</span></label>' +
        '<label class="radio"><input type="radio" name="baralho" value="comunidade"><span>Comunidade</span></label></div></fieldset>' : "") +
      '<div data-imp-prev class="imp-prev" aria-live="polite"></div>' +
      '<p class="error" data-dialog-erro hidden></p>',
    acoes: [{ rotulo: "Cancelar", valor: "cancelar", estilo: "ghost", cancelar: true }, { rotulo: "Importar", valor: "importar", icone: "upload-simple" }],
    aoAbrir: (dlg) => {
      $("[data-modelo]", dlg).addEventListener("click", () => download("modelo-cards-r2a.tsv", templateTsv(), "text/tab-separated-values;charset=utf-8"));
      $("#imp-arq", dlg).addEventListener("change", async (ev) => {
        const arq = ev.target.files[0];
        if (!arq) return;
        const txt = await readFile(arq);
        const res = importDelimited(txt, { taxonomia: ctx.tax.validacao });
        dlg._import = res;
        $("[data-imp-prev]", dlg).innerHTML = '<p><b>' + res.cards.length + "</b> cards prontos para importar" + (res.erros.length ? "; <b>" + res.erros.length + "</b> linhas com problema:" : ".") + "</p>" +
          (res.erros.length ? "<ul>" + res.erros.slice(0, 8).map((x) => "<li>Linha " + x.linha + ": " + e(x.msg) + "</li>").join("") + (res.erros.length > 8 ? "<li>...</li>" : "") + "</ul>" : "");
      });
    },
    validar: () => {
      const dlg = $("[data-modal]");
      if (!dlg._import || !dlg._import.cards.length) return "Escolha um arquivo com pelo menos um card válido.";
      return "";
    }
  });
  if (!r) return;
  const dlg = $("[data-modal]");
  const res = dlg._import;
  dlg._import = null;
  try {
    const n = await ctx.store.importCards(res.cards.map((c) => normalizeCard({ ...c, origem: "importacao" })), { baralho: r.dados.baralho || "pessoal" });
    await ctx.reloadCards();
    toast(num(n) + " cards importados.", "ok");
    aoConcluir?.();
  } catch (err) { toast(err.message, "erro"); }
}

async function renderSinalizacoes(ctx, box) {
  const lista = (await ctx.store.listFlags()).filter((f) => f.autor_id === ctx.user.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  const motivo = Object.fromEntries(MOTIVOS_SINALIZACAO);
  if (!lista.length) {
    box.innerHTML = emptyState({ titulo: "Você ainda não sinalizou nenhum card.", texto: "Durante o estudo, aperte <kbd>S</kbd> ou o botão Sinalizar erro quando um card estiver errado, ambíguo ou desatualizado.", icone: "flag" });
    return;
  }
  box.innerHTML = '<ul class="rows">' + lista.map((f) => {
    const c = ctx.cardMap.get(f.card_id);
    return '<li class="row"><div class="row__main">' +
      '<p class="row__q" lang="en">' + e(c ? plainText(c.frente).slice(0, 200) : "Card " + f.card_id) + "</p>" +
      '<p class="row__meta"><span class="badge badge--st-' + (f.status === "aberta" ? "em_revisao" : f.status === "resolvida" ? "aprovado" : "rejeitado") + '">' + e({ aberta: "Aberta", resolvida: "Resolvida", descartada: "Descartada" }[f.status]) + "</span>" +
      '<span class="tagline">' + e(motivo[f.motivo] || f.motivo) + " · " + e(dataHora(f.criado_em)) + "</span></p>" +
      '<p class="row__a">' + e(f.texto) + "</p>" +
      (f.resposta ? '<p class="row__review">' + icon("chat-text") + "<span><b>Curadoria:</b> " + e(f.resposta) + "</span></p>" : "") +
      "</div></li>";
  }).join("") + "</ul>";
}
