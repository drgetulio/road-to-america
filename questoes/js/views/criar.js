/* Road to America | banco de questões: criar bloco personalizado.
   Step; sistemas, disciplinas, áreas, tarefas e competências (dentro de cada grupo
   vale "ou", entre grupos vale "e"); situação dos itens (não vistas, erradas,
   marcadas, todas); de 1 a 20 itens (até 40 no modo livre); modo tutor ou
   cronometrado (90 s por item). As contagens mudam a cada escolha. */
import { FILTROS_STEP, SITUACOES, ROTULO_SITUACAO, LIMITES_BLOCO, contagemFacetas, chavesDaDimensao, limiteItens } from "../../../plataforma/js/banco-aluno.js";
import { PESOS_MODO } from "../../../plataforma/js/psicometria.js";
import { $, $$, e, icon, toast } from "../../../anki/js/ui.js";
import { cabecalho, abas, seletorStep, nome, NOME_STEP, plural, num } from "../comum.js";
import { lerPrefs } from "../local.js";
import { comecarBloco } from "../iniciar.js";

function pedidoInicial(ctx, params) {
  const pref = lerPrefs().pedido || {};
  const step = ["step1", "step2ck"].includes(params.get("step")) ? params.get("step") : pref.step || ctx.step;
  const selecao = {};
  let veioDaUrl = false;
  for (const f of FILTROS_STEP[step]) {
    const v = params.get(f.dim);
    if (v) { selecao[f.dim] = v.split(",").filter(Boolean); veioDaUrl = true; }
  }
  const usarPref = !veioDaUrl && !params.get("situacao") && pref.step === step;
  return {
    step,
    selecao: usarPref ? pref.selecao || {} : selecao,
    situacao: SITUACOES.includes(params.get("situacao")) ? params.get("situacao") : usarPref && SITUACOES.includes(pref.situacao) ? pref.situacao : "nao_vistas",
    modo: ["tutor", "cronometrado"].includes(params.get("modo")) ? params.get("modo") : pref.modo || "cronometrado",
    n: Number(params.get("n")) || pref.n || LIMITES_BLOCO.max,
    livre: params.get("livre") === "1" || (usarPref && !!pref.livre)
  };
}

export default {
  titulo: "Criar bloco",
  async render(ctx, el, { params }) {
    let p = pedidoInicial(ctx, params);
    /* os ouvintes ficam numa raiz própria: o contêiner da view é reaproveitado entre rotas */
    el.innerHTML = "<div data-raiz></div>";
    const raiz = $("[data-raiz]", el);
    const desenhar = () => {
      const step = p.step;
      const c = contagemFacetas(ctx.banco, { step, selecao: p.selecao, situacao: p.situacao, historico: ctx.historico });
      const andamento = ctx.andamento();
      raiz.innerHTML = '<div class="wrap section-sm q-pag">' +
        cabecalho({ titulo: "Criar bloco", lead: "Monte um bloco no formato da prova ou para estudar com explicação logo depois de cada resposta. Sem nada marcado num grupo, o grupo inteiro entra." }) +
        abas("criar") +
        (andamento ? '<p class="alert alert--aviso">' + icon("warning") + '<span>Há um bloco em andamento. <a href="#/bloco">Volte a ele</a> e encerre antes de começar outro.</span></p>' : "") +
        (!ctx.banco.contagem[step] ? '<p class="alert alert--aviso">' + icon("warning") + "<span>Nenhum item do " + NOME_STEP[step] + " está disponível para a sua conta. Se a matrícula é recente, a equipe ainda precisa ativá-la.</span></p>" : "") +
        '<form class="q-criar" data-criar novalidate>' +
          '<section class="panel" aria-labelledby="cr-step"><div class="panel__head"><h2 class="h-sm" id="cr-step">Step e modo</h2></div>' +
            seletorStep(step, "step") +
            '<fieldset class="field q-modos"><legend>Modo</legend><div class="q-modos__grid">' +
              [["cronometrado", "Cronometrado", "90 s por item, como o bloco oficial (30 minutos para 20 itens). O relógio corre e o bloco encerra sozinho. Conta peso " + num(PESOS_MODO.cronometrado, 0) + " na estimativa de aprovação.", "timer"],
               ["tutor", "Tutor", "Sem relógio de prova (o bloco fecha sozinho 24 horas depois de começar). Depois de confirmar cada resposta, a explicação aparece na hora. Conta peso " + num(PESOS_MODO.tutor, 1) + " na estimativa, porque sem relógio o acerto tende a ser maior que na prova.", "chalkboard-teacher"]]
                .map(([v, t, d, ic]) => '<label class="radio radio--card q-modo"><input type="radio" name="modo" value="' + v + '"' + (p.modo === v ? " checked" : "") + "><span><b>" + icon(ic) + e(t) + "</b><small>" + e(d) + "</small></span></label>").join("") +
            "</div></fieldset>" +
          "</section>" +

          '<section class="panel" aria-labelledby="cr-sit"><div class="panel__head"><h2 class="h-sm" id="cr-sit">Quais itens</h2>' +
            '<p class="hint">Erradas: a tentativa mais recente foi errada ou ficou em branco. Marcadas: você marcou na tentativa mais recente.</p></div>' +
            '<fieldset class="field"><legend class="sr-only">Situação dos itens</legend><div class="q-sit">' +
              SITUACOES.map((s) => '<label class="q-sit__op"><input type="radio" name="situacao" value="' + s + '"' + (p.situacao === s ? " checked" : "") + "><span>" + e(ROTULO_SITUACAO[s]) + ' <b data-cont-sit="' + s + '">' + c.situacoes[s] + "</b></span></label>").join("") +
            "</div></fieldset>" +
          "</section>" +

          FILTROS_STEP[step].map((f) => {
            const chaves = chavesDaDimensao(step, f.dim, Object.keys(c.dims[f.dim] || {}));
            const marc = new Set(p.selecao[f.dim] || []);
            return '<section class="panel q-dim" aria-labelledby="cr-' + f.dim + '"><div class="panel__head panel__head--row"><h2 class="h-sm" id="cr-' + f.dim + '">' + e(f.rotulo) + '</h2><span class="q-dim__acts">' +
              '<button type="button" class="link-btn" data-todos="' + f.dim + '">Marcar todos</button><button type="button" class="link-btn" data-limpar="' + f.dim + '">Limpar</button></span></div>' +
              '<fieldset class="field"><legend class="sr-only">' + e(f.rotulo) + '</legend><div class="checks checks--cols q-checks">' +
              chaves.map((k) => {
                const nItens = c.dims[f.dim]?.[k] || 0;
                return '<label class="check q-check"><input type="checkbox" name="' + f.dim + '" value="' + e(k) + '"' + (marc.has(k) ? " checked" : "") + (!nItens && !marc.has(k) ? " disabled" : "") + "><span>" + e(nome(step, f.dim, k)) + ' <b data-cont="' + f.dim + ":" + e(k) + '">' + nItens + "</b></span></label>";
              }).join("") + "</div></fieldset></section>";
          }).join("") +

          '<section class="panel q-fim" aria-labelledby="cr-n"><div class="panel__head"><h2 class="h-sm" id="cr-n">Tamanho do bloco</h2></div>' +
            '<div class="q-fim__linha">' +
              '<div class="field"><label for="cr-qtd">Número de itens</label><input id="cr-qtd" name="n" type="number" class="input input--short" min="1" max="' + limiteItens(p.livre) + '" step="1" inputmode="numeric" value="' + Math.min(p.n, limiteItens(p.livre)) + '" aria-describedby="cr-qtd-d"><p class="hint" id="cr-qtd-d">De 1 a ' + LIMITES_BLOCO.max + ", como o bloco oficial; até " + LIMITES_BLOCO.max_livre + " no modo livre.</p></div>" +
              '<label class="check q-livre"><input type="checkbox" name="livre" value="1"' + (p.livre ? " checked" : "") + "><span>Modo livre (até " + LIMITES_BLOCO.max_livre + " itens num bloco)</span></label>" +
            "</div>" +
            '<p class="q-resumo" role="status" aria-live="polite" data-resumo></p>' +
            '<p class="prog-erros" data-erro role="alert" hidden></p>' +
            '<button class="btn" type="submit"' + (andamento ? " disabled" : "") + ">" + icon("play") + "Começar bloco</button>" +
          "</section>" +
        "</form></div>";
      atualizar();
    };

    const lerForm = () => {
      const f = $("[data-criar]", el);
      const step = f.step.value || p.step;
      const selecao = {};
      for (const d of FILTROS_STEP[step]) {
        const v = $$('input[name="' + d.dim + '"]:checked', f).map((i) => i.value);
        if (v.length) selecao[d.dim] = v;
      }
      return { step, selecao, situacao: f.situacao.value, modo: f.modo.value, n: Math.round(Number(f.n.value)), livre: f.livre.checked };
    };

    function atualizar() {
      const c = contagemFacetas(ctx.banco, { step: p.step, selecao: p.selecao, situacao: p.situacao, historico: ctx.historico });
      for (const s of SITUACOES) { const b = $('[data-cont-sit="' + s + '"]', el); if (b) b.textContent = c.situacoes[s]; }
      $$("[data-cont]", el).forEach((b) => {
        const [dim, k] = b.dataset.cont.split(":");
        const nItens = c.dims[dim]?.[k] || 0;
        b.textContent = nItens;
        const inp = b.closest("label").querySelector("input");
        inp.disabled = !nItens && !inp.checked;
      });
      const max = limiteItens(p.livre);
      const qtd = $("#cr-qtd", el);
      qtd.max = String(max);
      const n = Math.min(Math.max(1, Math.round(Number(qtd.value) || 1)), max, Math.max(1, c.disponiveis));
      const tempo = p.modo === "cronometrado" ? " Tempo do bloco: " + Math.floor((n * LIMITES_BLOCO.ritmo_ms) / 60000) + " min" + ((n * LIMITES_BLOCO.ritmo_ms) % 60000 ? " 30 s" : "") + "." : " Sem relógio de prova; o bloco fecha sozinho depois de 24 horas.";
      $("[data-resumo]", el).innerHTML = c.disponiveis
        ? "<b>" + plural(c.disponiveis, "item atende", "itens atendem") + "</b> aos filtros. O bloco terá " + plural(n, "item", "itens") + "." + tempo
        : "<b>Nenhum item atende aos filtros.</b> Tire um filtro ou escolha outra situação.";
    }

    desenhar();

    raiz.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!t.closest("[data-criar]")) return;
      const novo = lerForm();
      if (t.name === "step") { p = { ...p, step: novo.step, selecao: {} }; ctx.step = novo.step; desenhar(); $('input[name="step"]:checked', el)?.focus(); return; }
      p = novo;
      if (t.name === "livre") { const q = $("#cr-qtd", el); if (!p.livre && Number(q.value) > LIMITES_BLOCO.max) q.value = String(LIMITES_BLOCO.max); if (p.livre && Number(q.value) === LIMITES_BLOCO.max) q.value = String(LIMITES_BLOCO.max_livre); p = lerForm(); }
      atualizar();
    });
    raiz.addEventListener("input", (ev) => { if (ev.target.id === "cr-qtd") { p = lerForm(); atualizar(); } });
    raiz.addEventListener("click", (ev) => {
      const todos = ev.target.closest("[data-todos]");
      const limpar = ev.target.closest("[data-limpar]");
      if (!todos && !limpar) return;
      const dim = (todos || limpar).dataset.todos || (todos || limpar).dataset.limpar;
      $$('input[name="' + dim + '"]', el).forEach((i) => { if (limpar) i.checked = false; else if (!i.disabled) i.checked = true; });
      p = lerForm();
      atualizar();
    });
    raiz.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const box = $("[data-erro]", el);
      box.hidden = true;
      p = lerForm();
      try { await comecarBloco(ctx, p); }
      catch (err) { box.hidden = false; box.textContent = err.message; box.setAttribute("tabindex", "-1"); box.focus(); toast(err.message, "erro"); }
    });
  }
};
