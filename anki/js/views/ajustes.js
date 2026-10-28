/* Road to America | ajustes de estudo, backup e exportação */
import { DEFAULTS, mergeSettings, simulateWorkload, stepsFromText, parseParams, RETENCAO_MIN, RETENCAO_MAX } from "../scheduler.js";
import { toAnkiTsv, toBackup, parseBackup } from "../tsv.js";
import { isStudyable } from "../cards.js";
import { $, $$, e, icon, toast, confirmar, download, readFile, num } from "../ui.js";
import { pageHead } from "./shared.js";

const cacheSim = new Map();
function simular(ret, novos, parametros) {
  const k = ret.toFixed(2) + "|" + novos + "|" + parametros;
  if (!cacheSim.has(k)) cacheSim.set(k, simulateWorkload({ retencao: ret, novosPorDia: novos, parametros }).revisoesPorDia);
  return cacheSim.get(k);
}

export default {
  titulo: "Ajustes",
  async render(ctx, el) {
    const s = ctx.settings;
    const liberados = Array.isArray(s.sistemasLiberados) ? new Set(s.sistemasLiberados) : null;
    el.innerHTML = '<div class="wrap section-sm">' +
      pageHead({ eyebrow: "Configurações", titulo: "Ajustes de estudo", lead: "Os padrões seguem o Anki atual com FSRS. Mude um item de cada vez e acompanhe a retenção real nas Estatísticas." }) +
      '<form class="settings" data-form novalidate>' +
      '<section class="panel" aria-labelledby="ret-t"><div class="panel__head"><h2 class="h-sm" id="ret-t">Retenção desejada</h2>' +
        '<p class="hint">É a probabilidade de lembrar o card no dia da revisão, e a configuração que mais pesa na carga diária.</p></div>' +
        '<div class="range">' +
          '<label for="s-ret" class="range__lbl">Retenção desejada: <output id="s-ret-out" for="s-ret" data-ret-out>' + Math.round(s.retencao * 100) + "%</output></label>" +
          '<input id="s-ret" name="retencao" type="range" min="' + RETENCAO_MIN * 100 + '" max="' + RETENCAO_MAX * 100 + '" step="1" value="' + Math.round(s.retencao * 100) + '" aria-describedby="s-ret-custo">' +
          '<p class="range__scale" aria-hidden="true"><span>80%</span><span>90% (padrão)</span><span>97%</span></p>' +
        "</div>" +
        '<div class="cost" id="s-ret-custo" data-custo aria-live="polite"></div>' +
      "</section>" +

      '<section class="panel" aria-labelledby="lim-t"><div class="panel__head"><h2 class="h-sm" id="lim-t">Limites diários</h2></div>' +
        '<div class="grid2">' +
          '<div class="field"><label for="s-novos">Cards novos por dia</label><input id="s-novos" name="novosPorDia" type="number" min="0" max="999" class="input input--short" value="' + s.novosPorDia + '" aria-describedby="s-novos-h"><p class="hint" id="s-novos-h">Defina pelo tempo que você tem. Cada novo diário gera, com o tempo, perto de dez revisões diárias.</p></div>' +
          '<div class="field"><label for="s-rev">Revisões por dia (limite)</label><input id="s-rev" name="revisoesPorDia" type="number" min="0" max="99999" class="input input--short" value="' + s.revisoesPorDia + '" aria-describedby="s-rev-h"><p class="hint" id="s-rev-h" data-rev-hint>Mantenha alto para não acumular atraso. Acima do limite, o app pausa os novos.</p></div>' +
        "</div>" +
        '<div class="grid2">' +
          '<div class="field" id="prova"><label for="s-prova">Data da prova (opcional)</label><input id="s-prova" name="dataProva" type="date" class="input input--short" value="' + e(s.dataProva || "") + '"><p class="hint">Mostra a contagem regressiva no painel.</p></div>' +
          '<div class="field"><label for="s-ord">Ordem dos cards novos</label><select id="s-ord" name="ordemNovos" class="input">' +
            '<option value="rendimento"' + (s.ordemNovos !== "aleatoria" ? " selected" : "") + ">Alto rendimento primeiro, alternando sistemas</option>" +
            '<option value="aleatoria"' + (s.ordemNovos === "aleatoria" ? " selected" : "") + ">Aleatória</option></select></div>" +
        "</div>" +
      "</section>" +

      '<section class="panel" aria-labelledby="lib-t" id="liberados"><div class="panel__head"><h2 class="h-sm" id="lib-t">Sistemas liberados para cards novos</h2>' +
        '<p class="hint">Entenda antes de memorizar: libere um sistema depois da aula ou da leitura da apostila. As revisões dos cards já iniciados continuam em todos os sistemas.</p></div>' +
        '<label class="check"><input type="checkbox" data-todos' + (!liberados ? " checked" : "") + "><span><b>Todos os sistemas</b></span></label>" +
        '<div class="checks checks--cols" data-lista-sis>' + ctx.tax.sistemas.map((x) => '<label class="check"><input type="checkbox" name="sis" value="' + e(x.chave) + '"' + (!liberados || liberados.has(x.chave) ? " checked" : "") + "><span>" + e(x.nome_curto || x.nome_pt) + "</span></label>").join("") + "</div>" +
      "</section>" +

      '<section class="panel" aria-labelledby="av-t"><div class="panel__head"><h2 class="h-sm" id="av-t">Agendamento (avançado)</h2></div>' +
        '<div class="grid2">' +
          '<div class="field"><label for="s-pa">Passos de aprendizagem</label><input id="s-pa" name="passosAprendizagem" class="input" value="' + e(s.passosAprendizagem.join(" ")) + '" aria-describedby="s-pa-h e-pa"><p class="hint" id="s-pa-h">Padrão: 1m 10m. Use m ou h, sempre abaixo de 1 dia.</p><p class="error" id="e-pa" data-err="passosAprendizagem"></p></div>' +
          '<div class="field"><label for="s-pr">Passos de reaprendizagem</label><input id="s-pr" name="passosReaprendizagem" class="input" value="' + e(s.passosReaprendizagem.join(" ")) + '" aria-describedby="s-pr-h e-pr"><p class="hint" id="s-pr-h">Padrão: 10m.</p><p class="error" id="e-pr" data-err="passosReaprendizagem"></p></div>' +
        "</div>" +
        '<div class="grid2">' +
          '<div class="field"><label for="s-max">Intervalo máximo (dias)</label><input id="s-max" name="intervaloMaximo" type="number" min="1" max="36500" class="input input--short" value="' + s.intervaloMaximo + '"><p class="hint">Padrão do Anki: 36.500 dias. Se você também vai usar o baralho no Step 2 CK, não há motivo para reduzir.</p></div>' +
          '<div class="field"><label for="s-leech">Limiar de leech (erros)</label><input id="s-leech" name="limiarLeech" type="number" min="3" max="30" class="input input--short" value="' + s.limiarLeech + '"><p class="hint">Padrão: 8. O card é suspenso e marcado para reescrita.</p></div>' +
        "</div>" +
        '<label class="check"><input type="checkbox" name="ocultarIrmaos"' + (s.ocultarIrmaos ? " checked" : "") + '><span><b>Ocultar irmãos</b> · as lacunas de uma mesma nota ficam para dias diferentes</span></label>' +
        '<label class="check"><input type="checkbox" name="fuzz"' + (s.fuzz ? " checked" : "") + '><span><b>Variação aleatória dos intervalos</b> · evita que cards criados juntos vençam sempre juntos</span></label>' +
        '<div class="field"><label for="s-w">Parâmetros FSRS otimizados (opcional)</label><textarea id="s-w" name="parametros" class="input input--area mono" rows="3" placeholder="Cole aqui os 21 números do Anki desktop (Opções do baralho > FSRS > Otimizar)" aria-describedby="s-w-h e-w">' + e(s.parametros || "") + "</textarea>" +
          '<p class="hint" id="s-w-h">Vazio usa os parâmetros padrão do FSRS-6. Otimizar uma vez por mês basta.</p><p class="error" id="e-w" data-err="parametros"></p></div>' +
      "</section>" +

      '<div class="settings__acts"><button class="btn" type="submit">' + icon("check") + 'Salvar ajustes</button><button class="btn btn--ghost" type="button" data-padrao>Restaurar padrões</button></div>' +
      "</form>" +

      '<section class="panel" aria-labelledby="bk-t"><div class="panel__head"><h2 class="h-sm" id="bk-t">Backup e exportação</h2>' +
        '<p class="hint">O arquivo do Anki leva os cards que você estuda, com baralho por sistema e tags hierárquicas (R2A::sistema::...). O backup JSON guarda progresso, histórico de respostas, configurações e seus cards.</p></div>' +
        '<div class="stack-acts">' +
          '<button type="button" class="btn btn--sm" data-anki>' + icon("download-simple") + "Exportar para o Anki (.txt)</button>" +
          '<button type="button" class="btn btn--sm btn--ghost" data-backup>' + icon("download-simple") + "Baixar backup (JSON)</button>" +
          '<label class="btn btn--sm btn--ghost file-btn">' + icon("upload-simple") + 'Restaurar backup<input type="file" accept="application/json,.json" data-restaurar class="sr-only"></label>' +
        "</div>" +
        '<details class="howto"><summary>Como importar no Anki desktop</summary><ol>' +
          "<li>No Anki (versão 2.1.55 ou mais nova), abra Arquivo &gt; Importar e escolha o arquivo .txt.</li>" +
          "<li>Confira que o separador é Tabulação e que “Permitir HTML” está marcado; o arquivo já informa o tipo de nota, o baralho, as tags e o identificador de cada card.</li>" +
          "<li>Importe. Para atualizar depois, exporte de novo e importe por cima: o identificador evita duplicatas.</li>" +
        "</ol></details>" +
        (ctx.modo === "local" ? '<p class="hint">Modo demonstração: os dados ficam neste navegador. <button type="button" class="link-btn link-btn--perigo" data-reset>Apagar os dados da demonstração</button></p>' : "") +
      "</section></div>";

    const form = $("[data-form]", el);
    const out = $("[data-ret-out]", el);
    const custo = $("[data-custo]", el);
    let t = null;

    function atualizarCusto() {
      const ret = Number(form.retencao.value) / 100;
      const novos = Math.max(0, Number(form.novosPorDia.value) || 0);
      out.textContent = Math.round(ret * 100) + "%";
      custo.innerHTML = '<p class="cost__calc">' + icon("hourglass-medium") + "Calculando a carga...</p>";
      clearTimeout(t);
      t = setTimeout(() => {
        const params = parseParams(form.parametros.value) ? form.parametros.value : "";
        const r = simular(ret, novos || 20, params);
        const base = simular(0.9, novos || 20, params);
        const dif = base ? Math.round(((r - base) / base) * 100) : 0;
        const nivel = ret > 0.95 ? "alto" : ret > 0.9 ? "medio" : ret < 0.85 ? "baixo" : "ok";
        custo.innerHTML =
          '<dl class="cost__grid">' +
            "<div><dt>Revisões por dia, depois de 1 ano</dt><dd>" + num(r) + "</dd></div>" +
            "<div><dt>Em relação a 90%</dt><dd>" + (dif === 0 ? "igual" : (dif > 0 ? "+" : "") + dif + "%") + "</dd></div>" +
          "</dl>" +
          '<p class="cost__txt cost__txt--' + nivel + '">' + icon(nivel === "alto" ? "warning" : "info") +
          "<span>" + e(textoCusto(ret, novos || 20)) + "</span></p>" +
          '<p class="hint">Simulação com o próprio FSRS: ' + (novos || 20) + " novos por dia durante um ano, lembrando cada card com a probabilidade prevista. É uma estimativa da tendência, não uma promessa.</p>";
      }, 220);
    }

    function textoCusto(ret, novos) {
      if (ret > 0.95) return "Acima de 95% a carga sobe muito rápido, e acima de 97% tende a ficar insustentável (manual do Anki). Reserve para as últimas semanas e só se o tempo diário permitir.";
      if (ret > 0.9) return "Um pouco acima do padrão: mais revisões em troca de lembrar um pouco mais no dia da revisão.";
      if (ret < 0.85) return "Abaixo de 85% você revisa menos, mas esquece mais e reaprende com mais frequência. Para uma prova de memória ampla como o Step 1, raramente compensa.";
      if (ret < 0.9) return "Um pouco abaixo do padrão: menos revisões, à custa de mais esquecimentos.";
      return "O padrão equilibra retenção e carga e é o ponto de partida recomendado pelo manual do Anki.";
    }

    function avisoRev() {
      const n = Number(form.novosPorDia.value) || 0;
      const r = Number(form.revisoesPorDia.value) || 0;
      $("[data-rev-hint]", el).textContent = r < n * 10 ? "Limite baixo para " + n + " novos por dia: o atraso tende a crescer. Considere pelo menos " + n * 10 + "." : "Mantenha alto para não acumular atraso. Acima do limite, o app pausa os novos.";
    }

    const todos = $("[data-todos]", el);
    todos.addEventListener("change", () => { $$("input[name=sis]", el).forEach((c) => { c.checked = todos.checked; }); });
    $("[data-lista-sis]", el).addEventListener("change", () => { todos.checked = $$("input[name=sis]", el).every((c) => c.checked); });

    form.retencao.addEventListener("input", atualizarCusto);
    form.novosPorDia.addEventListener("input", () => { atualizarCusto(); avisoRev(); });
    form.revisoesPorDia.addEventListener("input", avisoRev);

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const erros = {};
      const pa = stepsFromText(form.passosAprendizagem.value);
      const pr = stepsFromText(form.passosReaprendizagem.value);
      if (!pa) erros.passosAprendizagem = "Use valores como 1m 10m, todos abaixo de 1 dia.";
      if (!pr) erros.passosReaprendizagem = "Use valores como 10m, abaixo de 1 dia.";
      if (form.parametros.value.trim() && !parseParams(form.parametros.value)) erros.parametros = "Cole 17, 19 ou 21 números separados por vírgula.";
      $$("[data-err]", el).forEach((p) => { p.textContent = erros[p.dataset.err] || ""; const c = form.elements[p.dataset.err]; if (erros[p.dataset.err]) c.setAttribute("aria-invalid", "true"); else c.removeAttribute("aria-invalid"); });
      if (Object.keys(erros).length) { form.elements[Object.keys(erros)[0]].focus(); return; }
      const sis = $$("input[name=sis]:checked", el).map((c) => c.value);
      const novo = mergeSettings({
        ...ctx.settings,
        retencao: Number(form.retencao.value) / 100,
        novosPorDia: Number(form.novosPorDia.value),
        revisoesPorDia: Number(form.revisoesPorDia.value),
        intervaloMaximo: Number(form.intervaloMaximo.value),
        limiarLeech: Number(form.limiarLeech.value),
        dataProva: form.dataProva.value,
        ordemNovos: form.ordemNovos.value,
        ocultarIrmaos: form.ocultarIrmaos.checked,
        fuzz: form.fuzz.checked,
        passosAprendizagem: pa,
        passosReaprendizagem: pr,
        parametros: form.parametros.value.trim(),
        sistemasLiberados: sis.length === ctx.tax.sistemas.length ? null : sis
      });
      try {
        await ctx.saveSettings(novo);
        toast("Ajustes salvos. Valem a partir da próxima sessão.", "ok");
      } catch (err) { toast(err.message, "erro"); }
    });

    $("[data-padrao]", el).addEventListener("click", async () => {
      if (!(await confirmar("Restaurar os padrões?", "Retenção de 90%, 20 novos e 200 revisões por dia, passos de 1m 10m e 10m. A data da prova é mantida.", "Restaurar"))) return;
      await ctx.saveSettings({ ...DEFAULTS, dataProva: ctx.settings.dataProva });
      toast("Padrões restaurados.", "ok");
      ctx.render();
    });

    $("[data-anki]", el).addEventListener("click", () => {
      const lista = ctx.cards.filter((c) => isStudyable(c, ctx.user.id));
      download("road-to-america-step1-" + new Date().toISOString().slice(0, 10) + ".txt", toAnkiTsv(lista, { nomesSistema: ctx.tax.nomeSistema }));
      toast(num(lista.length) + " cards exportados.", "ok");
    });
    $("[data-backup]", el).addEventListener("click", () => {
      const txt = toBackup({ cards: ctx.cards.filter((c) => c.autor_id === ctx.user.id), estados: [...ctx.states.values()], revlog: ctx.revlog, configuracoes: ctx.settings, usuario: ctx.user });
      download("backup-flashcards-r2a-" + new Date().toISOString().slice(0, 10) + ".json", txt, "application/json");
    });
    $("[data-restaurar]", el).addEventListener("change", async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      try {
        const o = parseBackup(await readFile(f));
        if (!(await confirmar("Restaurar este backup?", "Progresso, histórico de respostas e configurações do arquivo serão mesclados aos atuais.", "Restaurar"))) return;
        await ctx.store.restoreBackup(o);
        await ctx.reloadAll();
        toast("Backup restaurado.", "ok");
        ctx.render();
      } catch (err) { toast(err.message, "erro"); }
      ev.target.value = "";
    });
    $("[data-reset]", el)?.addEventListener("click", async () => {
      if (!(await confirmar("Apagar a demonstração?", "Cards criados, progresso, sinalizações e configurações deste navegador serão apagados. Os cards oficiais voltam na próxima abertura.", "Apagar", true))) return;
      await ctx.store.resetDemo();
      location.reload();
    });

    atualizarCusto();
    avisoRev();
  }
};
