/* Road to America | área administrativa: metas e critérios de risco da coorte */
import { $, e, icon, toast } from "../../../anki/js/ui.js";
import { CONFIG_PADRAO, mergeConfig } from "../../../plataforma/js/desempenho.js";
import { pageHead, avisoLgpd } from "./comum.js";

/* tipo "pct": guardado de 0 a 1, editado de 0 a 100 */
const CAMPOS = [
  { k: "dias_inatividade", rotulo: "Dias sem estudo para acender inatividade", sufixo: "dias", origem: "Critério interno de acompanhamento. O nível alto começa no dobro.", min: 1, max: 60 },
  { k: "retencao_minima", rotulo: "Retenção real mínima", tipo: "pct", sufixo: "%", origem: "Menor retenção desejada aceita pelo app de flashcards. A meta do preset é 90% (EXIT 04).", min: 50, max: 99 },
  { k: "retencao_min_revisoes", rotulo: "Revisões mínimas para medir a retenção", sufixo: "revisões em 30 dias", origem: "Critério interno: abaixo disso a taxa oscila demais.", min: 1, max: 2000 },
  { k: "simulado_minimo", rotulo: "Acerto mínimo nos simulados", tipo: "pct", sufixo: "%", origem: "Critério interno de acompanhamento.", min: 1, max: 100 },
  { k: "simulado_ultimos", rotulo: "Tentativas na média dos simulados", sufixo: "tentativas do mesmo Step", origem: "Critério interno: uma tentativa de 20 questões varia demais sozinha.", min: 1, max: 10 },
  { k: "presenca_minima", rotulo: "Presença mínima nas aulas", tipo: "pct", sufixo: "%", origem: "Termo da Garantia (garantia.html).", min: 1, max: 100, contrato: true },
  { k: "nbme_minimo_por_step", rotulo: "Autoavaliações NBME por Step pendente", sufixo: "autoavaliações", origem: "Termo da Garantia (garantia.html).", min: 1, max: 10, contrato: true },
  { k: "nbme_antecedencia_dias", rotulo: "Antecedência para cobrar as NBMEs", sufixo: "dias antes da prova", origem: "Critério interno. O nível alto começa a 30 dias da prova.", min: 1, max: 365 },
  { k: "meta_probabilidade", rotulo: "Probabilidade de aprovação para a prontidão", sufixo: "%", origem: "Critério escrito da EXIT 18 (PDF de overdeliveries).", min: 1, max: 100 },
  { k: "prontidao_seguidas", rotulo: "Autoavaliações seguidas para a prontidão", sufixo: "em standard-paced", origem: "Critério escrito da EXIT 18.", min: 1, max: 5 },
  { k: "garantia_anos", rotulo: "Prazo da garantia", sufixo: "anos", origem: "Termo da Garantia (garantia.html).", min: 1, max: 10, contrato: true }
];

const paraTela = (c, v) => (c.tipo === "pct" ? Math.round(v * 1000) / 10 : v);

export default {
  titulo: "Metas e critérios",
  async render(ctx, el) {
    const cfg = mergeConfig(await ctx.store.getConfigPlataforma());
    el.innerHTML = '<div class="wrap section-sm">' +
      pageHead({ eyebrow: "Área administrativa", titulo: "Metas e critérios", lead: "Limites que acendem os sinais de risco e definem a prontidão. Cada um diz de onde vem. Os marcados como contratuais repetem o Termo da Garantia: mude só se o termo mudar." }) +
      '<form class="panel metas" data-metas novalidate>' +
        CAMPOS.map((c) => '<div class="field meta-campo"><label for="m-' + c.k + '">' + e(c.rotulo) + (c.contrato ? ' <span class="badge badge--st-em_revisao">contratual</span>' : "") + "</label>" +
          '<div class="meta-campo__in"><input id="m-' + c.k + '" name="' + c.k + '" class="input input--num" type="number" inputmode="decimal" step="any" min="' + c.min + '" max="' + c.max + '" value="' + e(paraTela(c, cfg[c.k])) + '" aria-describedby="m-' + c.k + '-o"><span class="muted">' + e(c.sufixo) + "</span></div>" +
          '<p class="hint" id="m-' + c.k + '-o">' + e(c.origem) + " Padrão: " + e(paraTela(c, CONFIG_PADRAO[c.k])) + (c.tipo === "pct" ? "%" : "") + ".</p></div>").join("") +
        '<p class="error" data-erro role="alert"></p>' +
        '<div class="settings__acts"><button class="btn" type="submit">' + icon("check") + 'Salvar metas</button><button class="btn btn--ghost" type="button" data-padrao>' + icon("arrow-counter-clockwise") + "Voltar aos padrões</button></div>" +
      "</form>" +
      avisoLgpd() +
    "</div>";

    const form = $("[data-metas]", el);
    const salvar = async (valores) => {
      try {
        await ctx.store.saveConfigPlataforma(valores);
        ctx.invalidar();
        toast("Metas salvas. Os sinais de risco foram recalculados.", "ok");
        await this.render(ctx, el);
      } catch (err) { $("[data-erro]", el).textContent = err.message; }
    };
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const valores = {};
      for (const c of CAMPOS) {
        const inp = form.elements[c.k];
        const v = Number(String(inp.value).replace(",", "."));
        inp.removeAttribute("aria-invalid");
        if (!Number.isFinite(v) || v < c.min || v > c.max) {
          inp.setAttribute("aria-invalid", "true");
          $("[data-erro]", el).textContent = c.rotulo + ": use um valor entre " + c.min + " e " + c.max + ".";
          inp.focus();
          return;
        }
        valores[c.k] = c.tipo === "pct" ? v / 100 : v;
      }
      await salvar(valores);
    });
    $("[data-padrao]", el).addEventListener("click", () => salvar({ ...CONFIG_PADRAO }));
  }
};
