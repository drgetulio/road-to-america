/* Road to America | editor de cards com modelos, prévia ao vivo e verificador */
import { normalizeCard, validateCard } from "../cards.js";
import { checkQuality, qualitySummary } from "../quality.js";
import { wrapCloze, clozeOrds } from "../cloze.js";
import { canEdit, isAdmin } from "../permissions.js";
import { parseTags } from "../util.js";
import { $, $$, e, icon, toast, dialog, confirmar, optionList } from "../ui.js";
import { cardPass, pageHead, emptyState } from "./shared.js";

export const MODELOS = [
  {
    id: "mecanismo", nome: "Mecanismo → achado", tipo: "basico",
    frente: "[Mechanism] leads to which characteristic finding?", verso: "[Finding]", extra: "[Why the mechanism produces the finding, in 1-2 sentences.]",
    exemplo: { frente: "Loss of collecting-duct response to ADH (nephrogenic diabetes insipidus) produces which urine finding after water deprivation?", verso: "Urine stays dilute (low osmolality)", extra: "Without V2-receptor signaling, aquaporin-2 is not inserted into the apical membrane, so water cannot be reabsorbed even when plasma osmolality rises. Desmopressin does not correct it.", sistema: "respiratorio_renal", disciplina: "fisiologia", tags: "diabetes_insipidus adh", fonte: "Guyton and Hall Textbook of Medical Physiology, 14th ed." }
  },
  {
    id: "farmaco_mec", nome: "Fármaco → mecanismo", tipo: "cloze",
    frente: "{{c1::[Drug]}} acts by {{c2::[mechanism of action]}}.", extra: "[Downstream effect that explains the clinical use.]",
    exemplo: { frente: "{{c1::Omeprazole}} irreversibly inhibits the {{c2::H<sup>+</sup>/K<sup>+</sup> ATPase}} of gastric parietal cells.", extra: "The proton pump is the final step of acid secretion, so blocking it suppresses acid regardless of the stimulus (histamine, gastrin or acetylcholine).", nota_pt: "No Brasil, omeprazol e pantoprazol são os mais usados.", sistema: "gastrointestinal", disciplina: "farmacologia", tags: "ibp acido_gastrico", fonte: "Katzung Basic & Clinical Pharmacology, 15th ed." }
  },
  {
    id: "farmaco_ea", nome: "Fármaco → efeito adverso", tipo: "basico",
    frente: "Which adverse effect of [drug] is explained by [mechanism]?", verso: "[Adverse effect]", extra: "[How the mechanism causes the adverse effect.]",
    exemplo: { frente: "Which classic adverse effect of ACE inhibitors results from bradykinin accumulation?", verso: "Dry cough", extra: "ACE (kininase II) also degrades bradykinin. Higher bradykinin sensitizes airway sensory nerves; ARBs do not raise bradykinin, so switching usually resolves the cough.", nota_pt: "Exemplos no Brasil: captopril, enalapril.", sistema: "cardiovascular", disciplina: "farmacologia", tags: "ieca efeitos_adversos", fonte: "Katzung Basic & Clinical Pharmacology, 15th ed." }
  },
  {
    id: "virulencia", nome: "Agente → fator de virulência", tipo: "cloze",
    frente: "[Virulence factor] of <i>[organism]</i> {{c1::[what it does]}}.", extra: "[Why this matters clinically.]",
    exemplo: { frente: "Protein A of <i>Staphylococcus aureus</i> binds the {{c1::Fc portion of IgG}}, blocking opsonization.", extra: "With the Fc region occupied, phagocytes cannot recognize antibody-coated bacteria, and complement activation is reduced.", sistema: "sangue_imune", disciplina: "microbiologia", tags: "estafilococo virulencia", fonte: "Sherris Medical Microbiology, 7th ed." }
  },
  {
    id: "gene", nome: "Doença → gene e herança", tipo: "cloze",
    frente: "[Disease] is caused by mutations in {{c1::[gene]}} and has {{c2::[inheritance pattern]}} inheritance.", extra: "[How the gene defect produces the phenotype.]",
    exemplo: { frente: "Cystic fibrosis is caused by mutations in {{c1::CFTR}} and has {{c2::autosomal recessive}} inheritance.", extra: "Defective CFTR chloride channels dehydrate secretions in airways, pancreatic ducts and vas deferens; the most common variant (F508del) misfolds and is degraded before reaching the membrane.", sistema: "respiratorio_renal", disciplina: "genetica", tags: "fibrose_cistica", fonte: "Thompson & Thompson Genetics in Medicine, 8th ed." }
  },
  {
    id: "imagem", nome: "Imagem ou histologia → diagnóstico", tipo: "basico",
    frente: "[Image or histologic finding]. Most likely diagnosis?", verso: "[Diagnosis]", extra: "[What produces the finding.]",
    exemplo: { frente: "A tissue deposit shows apple-green birefringence under polarized light after Congo red staining. What is the deposit?", verso: "Amyloid", extra: "Congo red binds the cross-beta-pleated sheet structure shared by all amyloid fibrils, whatever the precursor protein.", sistema: "multissistemico", disciplina: "patologia", tags: "amiloidose histologia", fonte: "Robbins & Cotran Pathologic Basis of Disease, 10th ed." }
  },
  {
    id: "discriminar", nome: "Discriminar parecidos", tipo: "basico",
    frente: "Which of the two, [A] or [B], shows [distinguishing finding]?", verso: "[A or B]", extra: "[Why the finding separates them.]",
    exemplo: { frente: "Which of the two, Crohn disease or ulcerative colitis, typically shows noncaseating granulomas on biopsy?", verso: "Crohn disease", extra: "Crohn disease is a transmural, granulomatous inflammation that can affect any segment; ulcerative colitis is mucosal, continuous from the rectum and without granulomas.", sistema: "gastrointestinal", disciplina: "patologia", tags: "doenca_inflamatoria_intestinal", fonte: "Robbins & Cotran Pathologic Basis of Disease, 10th ed." }
  }
];

const FONTES = [
  "Robbins & Cotran Pathologic Basis of Disease, 10th ed.",
  "Katzung Basic & Clinical Pharmacology, 15th ed.",
  "Guyton and Hall Textbook of Medical Physiology, 14th ed.",
  "Costanzo Physiology, 7th ed.",
  "Lehninger Principles of Biochemistry, 8th ed.",
  "Abbas Cellular and Molecular Immunology, 10th ed.",
  "Sherris Medical Microbiology, 7th ed.",
  "Moore Clinically Oriented Anatomy, 9th ed.",
  "Langman's Medical Embryology, 15th ed.",
  "Kandel Principles of Neural Science, 6th ed.",
  "Thompson & Thompson Genetics in Medicine, 8th ed.",
  "Gordis Epidemiology, 6th ed.",
  "Williams Textbook of Endocrinology, 14th ed.",
  "Junqueira's Basic Histology, 16th ed."
];

let limpar = null;

export default {
  titulo: "Criar card",
  destroy() { if (limpar) limpar(); limpar = null; },
  async render(ctx, el, { params }) {
    const id = params.get("id");
    const copiar = params.get("copiar");
    const revisar = params.get("revisar") === "1" && ctx.admin;
    const voltar = params.get("voltar");
    let original = null;
    if (id) {
      original = ctx.cardMap.get(id) || (await ctx.store.getCard(id));
      if (!original) {
        el.innerHTML = '<div class="wrap section-sm">' + emptyState({ titulo: "Card não encontrado.", texto: "Ele pode ter sido excluído ou não estar visível para você.", acoes: '<a class="btn" href="#/cards">Ir para os cards</a>' }) + "</div>";
        return;
      }
      if (!canEdit(original, ctx.user)) {
        el.innerHTML = '<div class="wrap section-sm">' + emptyState({ titulo: "Este card não pode ser editado por você.", texto: "Cards oficiais e de outros participantes passam pela curadoria. Você pode sinalizar um erro ou criar a sua versão pessoal.", acoes: '<a class="btn" href="#/criar?copiar=' + e(encodeURIComponent(id)) + '">Criar minha versão</a><a class="btn btn--ghost" href="#/cards">Voltar</a>', icone: "lock-simple" }) + "</div>";
        return;
      }
    }
    const pre = original || copiar ? null : preenchimento(params);
    const retorno = retornoSeguro(params.get("retorno"));
    const base = original ? { ...original } : copiar && ctx.cardMap.get(copiar)
      ? { ...ctx.cardMap.get(copiar), id: "", baralho: "pessoal", status: "rascunho", autor_id: ctx.user.id, tags: [...ctx.cardMap.get(copiar).tags, "minha_versao"] }
      : normalizeCard({ tipo: "basico", baralho: "pessoal", ...(pre || lembrar() || {}) });
    const admin = isAdmin(ctx.user);
    const aprovadoComunidade = original && original.baralho === "comunidade" && original.status === "aprovado" && !admin;

    const titulo = revisar ? "Editar e aprovar" : original ? "Editar card" : copiar ? "Minha versão do card" : "Novo card";
    el.innerHTML =
      '<div class="wrap section-sm">' +
      pageHead({
        eyebrow: original ? "Card " + original.id + " · versão " + original.versao : "Editor",
        titulo: e(titulo),
        lead: original ? "" : "Um fato por card, resposta curta e o mecanismo no campo de explicação. O verificador ao lado aponta o que costuma atrapalhar a memória."
      }) +
      (pre ? '<p class="alert alert--info">' + icon("cards") + "<span><b>Card preenchido a partir do item " + e(pre.de_questao || "") + " do simulado.</b> Reescreva a frente como uma pergunta curta, com um fato só, e confira o verso antes de salvar.</span></p>" : "") +
      (original && original.comentario_revisao && original.status === "rejeitado" ? '<p class="alert alert--aviso">' + icon("chat-text") + "<span><b>Comentário da curadoria:</b> " + e(original.comentario_revisao) + "</span></p>" : "") +
      '<div class="editor">' +
      '<form class="editor__form panel" novalidate data-form>' +
        '<details class="field tpls" data-tpls' + (typeof matchMedia !== "undefined" && matchMedia("(min-width: 1021px)").matches ? " open" : "") + '><summary class="tpls__sum">Modelos de especialista ' + icon("caret-down") + "</summary>" +
          '<p class="hint">Escolha um formato. O app preenche a estrutura; marque "Ver exemplo preenchido" para um card pronto.</p>' +
          '<div class="templates">' + MODELOS.map((m) => '<button type="button" class="tpl" data-tpl="' + m.id + '">' + icon(m.tipo === "cloze" ? "brackets-curly" : "cards") + "<span>" + e(m.nome) + "</span></button>").join("") + "</div>" +
          '<label class="check check--inline"><input type="checkbox" data-exemplo> <span>Ver exemplo preenchido</span></label>' +
        "</details>" +
        '<fieldset class="field"><legend>Tipo</legend><div class="seg">' +
          '<label class="seg__opt"><input type="radio" name="tipo" value="basico"' + (base.tipo === "basico" ? " checked" : "") + "><span>" + icon("cards") + "Básico</span></label>" +
          '<label class="seg__opt"><input type="radio" name="tipo" value="cloze"' + (base.tipo === "cloze" ? " checked" : "") + "><span>" + icon("brackets-curly") + "Cloze</span></label>" +
        "</div></fieldset>" +
        '<div class="field">' +
          '<label for="f-frente" data-lbl-frente>Frente (em inglês)</label>' +
          '<div class="toolbar" role="toolbar" aria-label="Formatação da frente" aria-controls="f-frente">' +
            '<button type="button" class="tb" data-wrap="b" aria-label="Negrito">' + icon("text-b") + "</button>" +
            '<button type="button" class="tb" data-wrap="i" aria-label="Itálico">' + icon("text-italic") + "</button>" +
            '<button type="button" class="tb" data-wrap="sub" aria-label="Subscrito">x<sub>2</sub></button>' +
            '<button type="button" class="tb" data-wrap="sup" aria-label="Sobrescrito">x<sup>2</sup></button>' +
            '<button type="button" class="tb tb--cloze" data-cloze aria-keyshortcuts="Control+Shift+L">' + icon("brackets-curly") + "<span>Lacuna {{c1::}}</span></button>" +
            '<button type="button" class="tb" data-cloze-mesma aria-keyshortcuts="Control+Shift+Alt+L"><span>Mesma lacuna</span></button>' +
          "</div>" +
          '<textarea id="f-frente" name="frente" class="input input--area" rows="4" spellcheck="true" lang="en" aria-describedby="h-frente e-frente">' + e(base.frente) + "</textarea>" +
          '<p class="hint" id="h-frente" data-hint-frente></p>' +
          '<p class="error" id="e-frente" data-err="frente"></p>' +
        "</div>" +
        '<div class="field" data-campo-verso>' +
          '<label for="f-verso" data-lbl-verso>Verso: resposta curta</label>' +
          '<textarea id="f-verso" name="verso" class="input input--area" rows="2" lang="en" aria-describedby="e-verso">' + e(base.verso) + "</textarea>" +
          '<p class="error" id="e-verso" data-err="verso"></p>' +
        "</div>" +
        '<div class="field"><label for="f-extra">Mecanismo (por quê), 1 a 3 frases</label>' +
          '<textarea id="f-extra" name="extra" class="input input--area" rows="3" lang="en">' + e(base.extra) + "</textarea></div>" +
        '<div class="field"><label for="f-nota">Nota em português (opcional)</label>' +
          '<textarea id="f-nota" name="nota_pt" class="input input--area" rows="2" aria-describedby="h-nota">' + e(base.nota_pt) + "</textarea>" +
          '<p class="hint" id="h-nota">Termo usado no Brasil, falso cognato, nome comercial do fármaco no Brasil.</p></div>' +
        '<div class="grid2">' +
          '<div class="field"><label for="f-sis">Sistema do outline</label><select id="f-sis" name="sistema" class="input" required aria-describedby="e-sistema">' +
            optionList(ctx.tax.sistemas, base.sistema, { vazio: "Escolha...", rotulo: (s) => (s.nome_curto || s.nome_pt) + (s.faixa_min != null ? " · " + s.faixa_min + "-" + s.faixa_max + "%" : "") }) + "</select>" +
            '<p class="error" id="e-sistema" data-err="sistema"></p></div>' +
          '<div class="field"><label for="f-dis">Disciplina do outline</label><select id="f-dis" name="disciplina" class="input" required aria-describedby="e-disciplina">' +
            optionList(ctx.tax.disciplinas, base.disciplina, { vazio: "Escolha...", rotulo: (d) => (d.nome_curto || d.nome_pt) + (d.faixa_min != null ? " · " + d.faixa_min + "-" + d.faixa_max + "%" : "") }) + "</select>" +
            '<p class="error" id="e-disciplina" data-err="disciplina"></p></div>' +
        "</div>" +
        '<div class="grid2">' +
          '<div class="field"><label for="f-tags">Tags (separe por espaço)</label><input id="f-tags" name="tags" class="input" value="' + e(base.tags.join(" ")) + '" placeholder="diureticos nefron" autocomplete="off"></div>' +
          '<fieldset class="field"><legend>Rendimento</legend><div class="seg seg--sm">' +
            '<label class="seg__opt"><input type="radio" name="rendimento" value="alto"' + (base.rendimento !== "medio" ? " checked" : "") + "><span>Alto</span></label>" +
            '<label class="seg__opt"><input type="radio" name="rendimento" value="medio"' + (base.rendimento === "medio" ? " checked" : "") + "><span>Médio</span></label>" +
          "</div></fieldset>" +
        "</div>" +
        '<div class="field"><label for="f-fonte">Fonte (referência-padrão)</label><input id="f-fonte" name="fonte" class="input" list="fontes" value="' + e(base.fonte) + '" placeholder="Robbins & Cotran Pathologic Basis of Disease, 10th ed." autocomplete="off">' +
          '<datalist id="fontes">' + FONTES.map((f) => '<option value="' + e(f) + '">').join("") + "</datalist>" +
          '<p class="hint">Cite o livro ou a diretriz, sem copiar texto de First Aid ou de outros livros.</p></div>' +
        destinoHtml(base, admin, original, aprovadoComunidade, revisar) +
        '<div class="editor__acts">' +
          '<button class="btn" type="submit" data-salvar>' + icon(revisar ? "seal-check" : "check") + (revisar ? "Salvar e aprovar" : original ? "Salvar alterações" : "Salvar card") + "</button>" +
          '<a class="btn btn--ghost" href="' + e(retorno || (voltar === "estudar" ? "#/estudar" : voltar === "curadoria" || revisar ? "#/curadoria" : "#/cards")) + '">' + (retorno ? "Voltar ao relatório" : "Cancelar") + "</a>" +
          '<p class="hint editor__kbd"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> salva</p>' +
        "</div>" +
      "</form>" +
      '<div class="editor__side">' +
        '<section class="panel" aria-labelledby="prev-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="prev-t">Prévia</h2>' +
          '<div class="seg seg--sm" data-lado role="radiogroup" aria-label="Lado da prévia">' +
            '<label class="seg__opt"><input type="radio" name="lado" value="frente" checked><span>Frente</span></label>' +
            '<label class="seg__opt"><input type="radio" name="lado" value="verso"><span>Verso</span></label>' +
          "</div></div>" +
          '<div class="ords" data-ords></div>' +
          '<div data-previa aria-live="off"></div>' +
        "</section>" +
        '<section class="panel inspecao" aria-labelledby="qa-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="qa-t">Inspeção do card</h2><div data-selo></div></div>' +
          '<ul class="qa" data-qa aria-live="polite"></ul>' +
          '<p class="hint">Baseada no princípio da informação mínima (Wozniak, 1999): um fato por card, pergunta curta, resposta única.</p>' +
        "</section>" +
      "</div>" +
      "</div></div>";

    const form = $("[data-form]", el);
    const fr = $("#f-frente", el);
    let ordPrevia = 1;
    let t = null;

    function ler() {
      const d = new FormData(form);
      return normalizeCard({
        ...(original || {}),
        id: original ? original.id : "",
        tipo: d.get("tipo"),
        frente: d.get("frente"),
        verso: d.get("verso"),
        extra: d.get("extra"),
        nota_pt: d.get("nota_pt"),
        sistema: d.get("sistema"),
        disciplina: d.get("disciplina"),
        tags: parseTags(d.get("tags")),
        rendimento: d.get("rendimento"),
        fonte: d.get("fonte"),
        baralho: d.get("baralho") || (original ? original.baralho : "pessoal")
      });
    }

    function atualizarTipo() {
      const cloze = form.tipo.value === "cloze";
      $("[data-lbl-frente]", el).textContent = cloze ? "Texto com lacunas (em inglês)" : "Frente: pergunta (em inglês)";
      $("[data-lbl-verso]", el).textContent = cloze ? "Complemento do verso (opcional)" : "Verso: resposta curta";
      $("[data-cloze]", el).hidden = !cloze;
      $("[data-cloze-mesma]", el).hidden = !cloze;
      $("[data-hint-frente]", el).innerHTML = cloze
        ? "Selecione o termo-chave e clique em Lacuna (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>). Cada número vira um card; números iguais ficam no mesmo card."
        : "Pergunte pelo conceito, não por sim ou não. Vinheta curta é bem-vinda.";
    }

    function atualizar() {
      const c = ler();
      const ords = c.tipo === "cloze" ? clozeOrds(c.frente) : [1];
      if (!ords.includes(ordPrevia)) ordPrevia = ords[0] || 1;
      $("[data-ords]", el).innerHTML = c.tipo === "cloze" && ords.length > 1
        ? '<span class="hint">' + ords.length + " cards nesta nota:</span>" + ords.map((o) => '<button type="button" class="ord' + (o === ordPrevia ? " is-on" : "") + '" data-ord="' + o + '" aria-pressed="' + (o === ordPrevia) + '">c' + o + "</button>").join("")
        : "";
      $$("[data-ord]", el).forEach((b) => b.addEventListener("click", () => { ordPrevia = Number(b.dataset.ord); atualizar(); }));
      const lado = el.querySelector("input[name=lado]:checked").value;
      $("[data-previa]", el).innerHTML = cardPass(ctx, { ...c, sistema: c.sistema || "geral", disciplina: c.disciplina || "patologia" }, ordPrevia, { lado, previa: true });
      const existentes = ctx.cards.filter((x) => x.id !== c.id);
      const lista = checkQuality(c, existentes);
      const sum = qualitySummary(lista);
      const selo = { pronto: ["Pronto", "seal-check"], revisar: ["Revisar", "warning"], bloqueado: ["Incompleto", "x-circle"] }[sum.selo];
      $("[data-selo]", el).innerHTML = '<span class="selo selo--' + sum.selo + '">' + icon(selo[1]) + e(selo[0]) + "</span>";
      $("[data-qa]", el).innerHTML = lista.length
        ? lista.map((x) => '<li class="qa__item qa__item--' + x.nivel + '">' + icon(x.nivel === "erro" ? "x-circle" : x.nivel === "aviso" ? "warning" : "lightbulb") +
            '<div><p class="qa__t"><span class="sr-only">' + (x.nivel === "erro" ? "Erro: " : x.nivel === "aviso" ? "Aviso: " : "Dica: ") + "</span>" + e(x.titulo) + "</p>" + (x.detalhe ? '<p class="qa__d">' + e(x.detalhe) + "</p>" : "") + "</div></li>").join("")
        : '<li class="qa__item qa__item--ok">' + icon("check-circle") + '<div><p class="qa__t">Nenhum problema encontrado.</p><p class="qa__d">Pergunta objetiva, resposta curta e mecanismo explicado.</p></div></li>';
      return { c, lista, sum };
    }
    const agendar = () => { clearTimeout(t); t = setTimeout(atualizar, 160); };

    function inserirTag(tag) {
      const ini = fr.selectionStart;
      const fim = fr.selectionEnd;
      const sel = fr.value.slice(ini, fim);
      fr.setRangeText("<" + tag + ">" + sel + "</" + tag + ">", ini, fim, sel ? "end" : "start");
      if (!sel) fr.selectionStart = fr.selectionEnd = ini + tag.length + 2;
      fr.focus();
      agendar();
    }
    function inserirCloze(mesmo) {
      if (form.tipo.value !== "cloze") { form.tipo.value = "cloze"; atualizarTipo(); }
      const r = wrapCloze(fr.value, fr.selectionStart, fr.selectionEnd, mesmo);
      fr.value = r.texto;
      fr.focus();
      fr.selectionStart = fr.selectionEnd = r.cursor;
      agendar();
    }

    async function aplicarModelo(m) {
      const exemplo = $("[data-exemplo]", el).checked;
      const atual = ler();
      if ((atual.frente || atual.verso || atual.extra) && !(await confirmar("Substituir o conteúdo?", "O modelo vai trocar o texto da frente, do verso e da explicação.", "Usar modelo"))) return;
      const src = exemplo ? { ...m, ...m.exemplo } : m;
      form.tipo.value = m.tipo;
      fr.value = src.frente || "";
      $("#f-verso", el).value = src.verso || "";
      $("#f-extra", el).value = src.extra || "";
      if (exemplo) {
        $("#f-nota", el).value = src.nota_pt || "";
        if (src.sistema) $("#f-sis", el).value = src.sistema;
        if (src.disciplina) $("#f-dis", el).value = src.disciplina;
        if (src.tags) $("#f-tags", el).value = src.tags;
        if (src.fonte) $("#f-fonte", el).value = src.fonte;
      }
      atualizarTipo();
      atualizar();
      fr.focus();
      const ph = fr.value.indexOf("[");
      if (ph >= 0 && !exemplo) fr.setSelectionRange(ph, fr.value.indexOf("]", ph) + 1);
    }

    function mostrarErros(erros) {
      $$("[data-err]", el).forEach((p) => {
        const k = p.dataset.err;
        p.textContent = erros[k] || "";
        const campo = form.elements[k];
        if (campo && campo.setAttribute) { if (erros[k]) campo.setAttribute("aria-invalid", "true"); else campo.removeAttribute("aria-invalid"); }
      });
      const primeiro = Object.keys(erros)[0];
      if (primeiro && form.elements[primeiro]) form.elements[primeiro].focus();
    }

    async function salvar(ev) {
      ev?.preventDefault();
      const { c, sum } = atualizar();
      const erros = validateCard(c, ctx.tax.validacao);
      mostrarErros(erros);
      if (Object.keys(erros).length) { toast("Corrija os campos marcados antes de salvar.", "erro"); return; }
      if (sum.avisos && c.baralho === "comunidade" && !admin) {
        const ok = await confirmar("Enviar com avisos?", "A inspeção encontrou " + sum.avisos + (sum.avisos === 1 ? " aviso" : " avisos") + ". Cards claros passam mais rápido pela curadoria. Enviar mesmo assim?", "Enviar para revisão");
        if (!ok) return;
      }
      const btn = $("[data-salvar]", el);
      btn.disabled = true;
      try {
        let salvo;
        if (revisar) {
          salvo = await ctx.store.reviewCard(original.id, { decisao: "aprovar", comentario: "Editado e aprovado pela curadoria.", alteracoes: c });
        } else {
          const destino = { ...c };
          if (!original) destino.status = admin && c.baralho !== "pessoal" ? "aprovado" : c.baralho === "comunidade" ? "em_revisao" : "rascunho";
          salvo = await ctx.store.saveCard(destino);
        }
        guardar({ sistema: c.sistema, disciplina: c.disciplina, fonte: c.fonte, tags: c.tags, tipo: c.tipo, rendimento: c.rendimento });
        await ctx.reloadCards();
        ctx.atualizarBadge?.();
        const msg = revisar ? "Card editado e aprovado." :
          salvo.baralho === "pessoal" ? "Card salvo no seu baralho pessoal. Ele já entra nos novos de hoje." :
          salvo.status === "em_revisao" ? "Card enviado para a revisão da comunidade. Enquanto isso, ele não aparece para os outros." :
          "Card salvo.";
        toast(msg, "ok");
        if (retorno) { location.href = retorno; return; }
        if (revisar || voltar === "curadoria") ctx.go("#/curadoria");
        else if (voltar === "estudar") ctx.go("#/estudar");
        else if (original) ctx.go("#/cards");
        else {
          fr.value = "";
          $("#f-verso", el).value = "";
          $("#f-extra", el).value = "";
          $("#f-nota", el).value = "";
          atualizar();
          fr.focus();
        }
      } catch (err) {
        toast(err.message, "erro");
      } finally {
        btn.disabled = false;
      }
    }

    form.addEventListener("input", agendar);
    $("[data-lado]", el).addEventListener("change", atualizar);
    form.addEventListener("change", (ev) => { if (ev.target.name === "tipo") atualizarTipo(); agendar(); });
    form.addEventListener("submit", salvar);
    $$("[data-wrap]", el).forEach((b) => b.addEventListener("click", () => inserirTag(b.dataset.wrap)));
    $("[data-cloze]", el).addEventListener("click", () => inserirCloze(false));
    $("[data-cloze-mesma]", el).addEventListener("click", () => inserirCloze(true));
    $$("[data-tpl]", el).forEach((b) => b.addEventListener("click", () => aplicarModelo(MODELOS.find((m) => m.id === b.dataset.tpl))));
    const onKey = (ev) => {
      if (document.querySelector("dialog[open]")) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); salvar(); }
      else if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.code === "KeyL" && ev.target === fr) { ev.preventDefault(); inserirCloze(ev.altKey); }
    };
    document.addEventListener("keydown", onKey);
    limpar = () => { document.removeEventListener("keydown", onKey); clearTimeout(t); };
    atualizarTipo();
    atualizar();
  }
};

function destinoHtml(base, admin, original, travado, revisar) {
  if (revisar) return '<input type="hidden" name="baralho" value="' + e(base.baralho) + '">';
  if (travado) return '<input type="hidden" name="baralho" value="comunidade"><p class="alert alert--info">' + icon("info") + "<span>Este card já foi aprovado na comunidade. Se você mudar o conteúdo, ele volta para a revisão.</span></p>";
  const opcoes = admin
    ? [["oficial", "Oficial R2A", "Publicado na hora para todos os participantes."], ["comunidade", "Comunidade", "Publicado na hora, com o selo da comunidade."], ["pessoal", "Só para mim", "Fica no seu baralho pessoal."]]
    : [["pessoal", "Só para mim", "Entra no seu baralho na hora. Ninguém mais vê."], ["comunidade", "Enviar para a comunidade", "Passa pela curadoria antes de aparecer para os outros participantes."]];
  const atual = base.baralho && opcoes.some((o) => o[0] === base.baralho) ? base.baralho : opcoes[admin ? 0 : 0][0];
  return '<fieldset class="field"><legend>Onde salvar</legend><div class="radios">' +
    opcoes.map(([v, r, d]) => '<label class="radio radio--card"><input type="radio" name="baralho" value="' + v + '"' + (v === atual ? " checked" : "") + "><span><b>" + e(r) + "</b><small>" + e(d) + "</small></span></label>").join("") +
    "</div></fieldset>";
}

/* Card pré-preenchido por outra página (relatório do simulado completo):
   #/criar?frente=...&verso=...&extra=...&nota_pt=...&sistema=...&disciplina=...&tags=...&fonte=...&de_questao=...
   O aluno revisa tudo no editor; nada é salvo sem ele tocar em Salvar. */
export function preenchimento(params) {
  if (!params || !params.get("frente")) return null;
  const campo = (k, max) => String(params.get(k) || "").slice(0, max);
  return {
    tipo: "basico",
    frente: campo("frente", 1000),
    verso: campo("verso", 500),
    extra: campo("extra", 1500),
    nota_pt: campo("nota_pt", 1000),
    sistema: campo("sistema", 60),
    disciplina: campo("disciplina", 60),
    tags: parseTags(campo("tags", 300)),
    fonte: campo("fonte", 300),
    de_questao: campo("de_questao", 40)
  };
}
/* Só aceita voltar para uma página do próprio site (caminho relativo) */
export function retornoSeguro(r) {
  return typeof r === "string" && /^\.\.\/(simulado|questoes)\/[^\s"'<>]*$/.test(r) && !r.includes("//", 3) ? r : "";
}

function lembrar() {
  try { return JSON.parse(sessionStorage.getItem("r2a-editor-ultimo") || "null"); } catch { return null; }
}
function guardar(o) {
  try { sessionStorage.setItem("r2a-editor-ultimo", JSON.stringify(o)); } catch { /* sem armazenamento */ }
}
