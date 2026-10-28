/* Road to America | área administrativa: ficha do participante */
import { $, e, icon, toast, confirmar, num } from "../../../anki/js/ui.js";
import { desempenhoPorArea, ritmo, SIMULADO_30 } from "../../../plataforma/js/simulado.js";
import { checklistGarantia, leituraProntidao, NOME_STEP, nomeArea, dataBR, ROTULO_PRONTIDAO } from "../../../plataforma/js/acompanhamento.js";
import { sugestoesAcao, semanasAtividade, gradeCalor, nivelCalor, textoUltimaAtividade, rotuloTurma, pct, plural, RETENCAO_DESEJADA, MIN_QUESTOES_AREA } from "../calculos.js";
import { barrasVerticais, linhaProporcao, barrasAcerto, mapaCalor, tabela } from "../graficos.js";
import { chipStatus, chipGarantia, chipProntidao, seloDemo, avisoLgpd } from "./comum.js";
import { importarPresenca, botaoImportar } from "./acoes.js";

const ROTULO_MODO = { standard: "standard-paced", self: "self-paced", desconhecido: "modo não informado" };
const PRIORIDADE = { 1: "Agora", 2: "Esta semana", 3: "Acompanhar" };
const ddmm = (k) => k.slice(8, 10) + "/" + k.slice(5, 7);
const min = (ms) => (ms === null || ms === undefined ? "" : Math.round(ms / 60000) + " min");
const seg = (ms) => (ms === null || ms === undefined ? "" : Math.round(ms / 1000) + " s");

export default {
  titulo: "Ficha do participante",
  async render(ctx, el, args) {
    const id = args.sub[0];
    const { rows, agora } = await ctx.dados();
    const r = rows.find((x) => x.id === id);
    if (!r) {
      el.innerHTML = '<div class="wrap section-sm"><div class="empty"><h1 class="display h3">Participante não encontrado.</h1><p class="body">A conta pode ter sido removida ou o endereço está incompleto.</p><a class="btn btn--ghost" href="#/participantes">Voltar à lista</a></div></div>';
      return;
    }
    if (!el.querySelector("[data-ficha]")) el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Abrindo a ficha de ' + e(r.nome) + "...</p></div>";
    const cfg = ctx.config;
    const [atividade, simulados, nbme, presenca, plano, nota, perfis] = await Promise.all([
      ctx.store.getAtividadeDiaria(id, { dias: 182, agora }),
      ctx.store.listSimulados({ userId: id }),
      ctx.store.listNbme({ userId: id }),
      ctx.store.getPresenca(id),
      ctx.store.getPlano(id),
      ctx.store.getAnotacao(id).catch(() => null),
      r.sintetico ? ctx.store.listParticipantes().catch(() => []) : Promise.resolve([])
    ]);
    const perfilDemo = perfis.find?.((p) => p.id === id)?.perfil_demo || "";
    const l = r.linha;
    const av = r.avaliacao;
    const fc = l.flashcards;
    const sugs = sugestoesAcao(r, { simulados, config: cfg, agora, tax: ctx.tax });
    const check = checklistGarantia(l, av, { config: cfg });
    /* prontidão do Step em preparo e de outro Step pendente que já tenha data ou NBME */
    const stepsPend = ["step1", "step2ck"].filter((s) => !l.plano?.[s + "_aprovado"] && (s === r.step || l.plano?.["data_prova_" + s] || (l.nbme || []).some((x) => x.step === s)));
    const semanas = semanasAtividade(atividade, { semanas: 12 });
    const grade = gradeCalor(atividade, { agora });
    const stepRef = r.step === "concluido" ? "step2ck" : r.step;

    el.innerHTML = '<div class="wrap section-sm ficha" data-ficha>' +
      '<p class="crumbs"><a href="#/participantes">' + icon("users-three") + "Participantes</a></p>" +

      '<header class="boarding ficha__head">' +
        '<div class="boarding__main">' +
          '<p class="boarding__top"><span>Ficha do participante</span><span>' + e(r.step === "concluido" ? "Steps concluídos" : NOME_STEP[r.step]) + "</span></p>" +
          '<div class="ficha__nome"><h1 class="display h2">' + e(r.nome) + "</h1>" + chipStatus(r.status) + seloDemo(r.sintetico) + "</div>" +
          (perfilDemo ? '<p class="hint">Perfil fictício da demonstração: ' + e(perfilDemo) + ".</p>" : "") +
          '<dl class="boarding__data ficha__dados">' +
            "<div><dt>Contato</dt><dd>" + (r.email ? '<a href="mailto:' + e(r.email) + '">' + e(r.email).replace("@", "<wbr>@") + "</a>" : "sem e-mail") + "</dd></div>" +
            "<div><dt>Última atividade</dt><dd>" + e(textoUltimaAtividade(r)) + (r.ultima_atividade ? " <small>" + e(dataBR(r.ultima_atividade)) + "</small>" : "") + "</dd></div>" +
            "<div><dt>Prova</dt><dd>" + (r.prova ? e(dataBR(r.prova)) + " <small>" + (r.dias_prova >= 0 ? "em " + plural(r.dias_prova, "dia", "dias") : "há " + plural(-r.dias_prova, "dia", "dias")) + "</small>" : "sem data") + "</dd></div>" +
            "<div><dt>Turma</dt><dd>" + e(rotuloTurma(r.turma)) + "</dd></div>" +
            "<div><dt>Garantia</dt><dd>" + chipGarantia(r.garantia) + "</dd></div>" +
          "</dl>" +
        "</div>" +
        '<div class="boarding__stub ficha__stub" role="img" aria-label="' + e("Prontidão pela EXIT 18: " + (ROTULO_PRONTIDAO[r.prontidao] || "dados insuficientes")) + '"><span aria-hidden="true">Prontidão</span><b aria-hidden="true">' + e(r.prontidao === "pronto" ? "OK" : r.prontidao === "pronto_sem_faixa" ? "OK?" : r.prontidao === "aprovado" ? "PASS" : r.prontidao === "nao_pronto" ? "NÃO" : "N/D") + '</b><span aria-hidden="true">' + (r.prontidao === "pronto_sem_faixa" ? "Faixa?" : "EXIT 18") + "</span></div>" +
      "</header>" +
      '<p class="ficha__acts"><button type="button" class="btn btn--ghost btn--sm" data-imprimir>' + icon("download-simple") + "Imprimir relatório</button>" +
        (r.email ? '<a class="btn btn--ghost btn--sm" href="mailto:' + e(r.email) + '?subject=' + encodeURIComponent("Road to America: acompanhamento") + '">' + icon("envelope-simple") + "Escrever e-mail</a>" : "") + "</p>" +

      '<div class="grid2 grid2--top">' +
        '<section class="panel" aria-labelledby="mot-t"><div class="panel__head"><h2 class="h-sm" id="mot-t">Sinais de risco</h2>' +
          '<p class="hint">Critérios automáticos, com os limites definidos em <a href="#/metas">Metas e critérios</a>.</p></div>' +
          (av.riscos.length ? '<ul class="sinais">' + av.riscos.map((x) => '<li class="sinal' + (x.nivel === "alto" ? " sinal--alto" : "") + '">' + icon(x.nivel === "alto" ? "warning-circle" : "warning") +
            "<div><b>" + e(x.titulo) + (x.nivel === "alto" ? " · nível alto" : "") + "</b><p>" + e(x.detalhe) + "</p></div></li>").join("") + "</ul>"
            : '<p class="body">' + icon("check-circle") + " Nenhum critério de risco aceso.</p>") +
        "</section>" +
        '<section class="panel" aria-labelledby="sug-t"><div class="panel__head"><h2 class="h-sm" id="sug-t">Sugestões de ação</h2>' +
          '<p class="hint">Geradas a partir dos dados, cada uma com o motivo. Servem de pauta para o mentor; a decisão é da equipe e do aluno.</p></div>' +
          (sugs.length ? '<ol class="sugs">' + sugs.map((s) => '<li class="sug sug--p' + s.prioridade + '"><span class="sug__p">' + e(PRIORIDADE[s.prioridade]) + "</span><div><b>" + e(s.titulo) + "</b><p>" + e(s.motivo) + "</p></div></li>").join("") + "</ol>"
            : '<p class="body">Nada a sugerir agora. Siga o acompanhamento de rotina.</p>') +
        "</section>" +
      "</div>" +

      '<div class="grid2 grid2--top">' +
        '<section class="panel" aria-labelledby="gar-t"><div class="panel__head"><h2 class="h-sm" id="gar-t">Checklist da garantia</h2>' +
          '<p class="hint">Condições do <a href="../garantia.html">Termo da Garantia</a>. Elas são conferidas ao fim do prazo; aqui se vê o caminho até lá.</p></div>' +
          listaChecklist(check) +
        "</section>" +
        '<section class="panel" aria-labelledby="pr-t"><div class="panel__head"><h2 class="h-sm" id="pr-t">Prontidão para manter a data (EXIT 18)</h2>' +
          '<p class="hint">Critério escrito da Road to America. A decisão sobre a data continua sendo do aluno; a conversa individual de 20 minutos fecha a recomendação a 2 semanas da prova.</p></div>' +
          (r.step === "concluido" ? '<p class="body">Os dois Steps estão marcados como aprovados.</p>' :
            stepsPend.map((step) => blocoProntidao(leituraProntidao(av.prontidao[step], l, step, { config: cfg, agora }), step)).join("")) +
        "</section>" +
      "</div>" +

      '<section class="panel" aria-labelledby="tl-t"><div class="panel__head"><h2 class="h-sm" id="tl-t">Linha do tempo de estudo, 26 semanas</h2>' +
        '<p class="hint">Respostas no app de flashcards por dia. O dia vira às 4h, como no app.</p></div>' +
        '<dl class="mini">' +
          "<div><dt>Sequência atual</dt><dd>" + plural(fc.sequencia_atual, "dia", "dias") + "</dd></div>" +
          "<div><dt>Maior sequência</dt><dd>" + plural(fc.maior_sequencia, "dia", "dias") + "</dd></div>" +
          "<div><dt>Dias com estudo, 30 dias</dt><dd>" + fc.dias_estudados_30d + " de 30</dd></div>" +
          "<div><dt>Revisões, 7 dias</dt><dd>" + num(fc.revisoes_7d) + "</dd></div>" +
        "</dl>" +
        mapaCalor(grade, nivelCalor(atividade.map((d) => d.revisoes)), { titulo: "Dias de estudo de " + r.nome + " nas últimas 26 semanas" }) +
      "</section>" +

      '<section class="panel" aria-labelledby="rc-t"><div class="panel__head"><h2 class="h-sm" id="rc-t">Retenção e carga de revisões, 12 semanas</h2>' +
        '<p class="hint">Dois gráficos separados para não misturar escalas. Semanas com menos de 20 revisões de cards maduros ou jovens ficam sem ponto de retenção.</p></div>' +
        '<div class="grid2 grid2--mult">' +
          '<figure class="mult"><figcaption class="mult__t">Revisões por semana</figcaption>' +
            barrasVerticais(semanas.map((s) => s.revisoes), { rotulos: semanas.map((s) => ddmm(s.inicio)), titulo: "Revisões por semana nas últimas 12 semanas", parcial: semanas.length - 1, cadaRotulo: 3, altura: 220, largura: 480 }) + "</figure>" +
          '<figure class="mult"><figcaption class="mult__t">Retenção real por semana</figcaption>' +
            linhaProporcao(semanas.map((s) => ({ rotulo: ddmm(s.inicio), valor: s.retencao, n: s.n_retencao })), { titulo: "Retenção real semanal", meta: cfg.retencao_minima, rotuloMeta: "mínimo", minimo: 0.6, maximo: 1, sufixoN: " revisões" }) + "</figure>" +
        "</div>" +
        tabela("Semanas de estudo", ["Semana de", "Revisões", "Retenção real"], semanas.map((s) => [ddmm(s.inicio), num(s.revisoes), s.retencao === null ? "poucas revisões" : pct(s.retencao, 1)])) +
        '<dl class="mini mini--6">' +
          "<div><dt>Retenção, 30 dias</dt><dd>" + (fc.retencao_30d.taxa === null ? "sem dados" : pct(fc.retencao_30d.taxa, 1)) + " <small>" + num(fc.retencao_30d.total) + " rev.; desejada " + pct(RETENCAO_DESEJADA) + "</small></dd></div>" +
          "<div><dt>Maduros</dt><dd>" + num(fc.maduros) + "</dd></div>" +
          "<div><dt>Jovens</dt><dd>" + num(fc.jovens) + "</dd></div>" +
          "<div><dt>Aprendendo</dt><dd>" + num(fc.aprendendo) + "</dd></div>" +
          "<div><dt>Leeches</dt><dd>" + num(fc.leeches) + " <small>" + num(fc.suspensos) + " suspensos</small></dd></div>" +
          "<div><dt>Cobertura do baralho oficial</dt><dd>" + (fc.cobertura === null ? "sem dados" : pct(fc.cobertura)) + " <small>" + num(fc.vistos) + " de " + num(fc.total_oficial) + " cards</small></dd></div>" +
        "</dl>" +
      "</section>" +

      '<section class="panel" aria-labelledby="sim-t"><div class="panel__head"><h2 class="h-sm" id="sim-t">Simulados de 30 minutos</h2>' +
        '<p class="hint">Cada tentativa é um bloco de ' + SIMULADO_30.questoes + " questões em " + Math.round(SIMULADO_30.duracao_ms / 60000) + " minutos. Ritmo de prova: " + Math.round(SIMULADO_30.ritmo_ms / 1000) + " s por questão. Simulados são formativos e não contam para a garantia.</p></div>" +
        blocoSimulados(simulados, cfg, ctx) +
      "</section>" +

      '<section class="panel" aria-labelledby="nb-t"><div class="panel__head"><h2 class="h-sm" id="nb-t">Autoavaliações NBME lançadas</h2>' +
        '<p class="hint">O participante lança pela área do aluno. Confira com o relatório do NBME e marque como verificada: a verificação trava a edição pelo participante e vale para a garantia.</p></div>' +
        blocoNbme(nbme) +
      "</section>" +

      '<div class="grid2 grid2--top">' +
        '<section class="panel" aria-labelledby="pres-t"><div class="panel__head"><h2 class="h-sm" id="pres-t">Presença nas aulas</h2>' +
          '<p class="hint">Aulas ao vivo ou gravadas. Enquanto o curso não tiver plataforma de vídeo, a equipe lança à mão ou por CSV.</p></div>' +
          '<form class="form-inline" data-presenca novalidate>' +
            '<div class="field"><label for="p-a">Aulas assistidas</label><input id="p-a" name="aulas_assistidas" class="input input--num" type="number" min="0" step="1" inputmode="numeric" required value="' + (presenca?.aulas_assistidas ?? "") + '"></div>' +
            '<div class="field"><label for="p-t">Aulas totais</label><input id="p-t" name="aulas_totais" class="input input--num" type="number" min="0" step="1" inputmode="numeric" required value="' + (presenca?.aulas_totais ?? "") + '"></div>' +
            '<button class="btn btn--sm" type="submit">' + icon("check") + "Salvar presença</button>" +
          "</form>" +
          '<p class="error" data-pres-erro role="alert"></p>' +
          '<p class="hint" data-pres-info>' + (presenca ? "Última atualização: " + e(dataBR(presenca.atualizado_em)) + " (" + (presenca.origem === "csv" ? "importação CSV" : "lançamento manual") + ")." : "Ainda sem lançamento.") + "</p>" +
          '<p class="ficha__imp">' + botaoImportar() + "</p>" +
        "</section>" +
        '<section class="panel" aria-labelledby="pl-t"><div class="panel__head"><h2 class="h-sm" id="pl-t">Plano e datas</h2>' +
          '<p class="hint">As datas de prova o participante também altera. Aprovação, matrícula e ciclo básico só a equipe lança; definem os Steps que faltam e o prazo da garantia.</p></div>' +
          '<form class="form-grid" data-plano novalidate>' +
            campoData("data_prova_step1", "Prova do Step 1", plano.data_prova_step1) +
            campoData("data_prova_step2ck", "Prova do Step 2 CK", plano.data_prova_step2ck) +
            campoData("data_matricula", "Matrícula", plano.data_matricula) +
            campoData("ciclo_basico_concluido_em", "Conclusão do ciclo básico (se depois da matrícula)", plano.ciclo_basico_concluido_em) +
            '<label class="check"><input type="checkbox" name="step1_aprovado"' + (plano.step1_aprovado ? " checked" : "") + "> Step 1 aprovado (Pass)</label>" +
            '<label class="check"><input type="checkbox" name="step2ck_aprovado"' + (plano.step2ck_aprovado ? " checked" : "") + "> Step 2 CK aprovado (nota mínima em vigor)</label>" +
            '<div class="form-grid__acts"><button class="btn btn--sm" type="submit">' + icon("check") + "Salvar plano</button></div>" +
          "</form>" +
          (!plano.data_prova_step1 && l.plano.data_prova_step1 ? '<p class="hint">Data do Step 1 em uso no resumo: ' + e(dataBR(l.plano.data_prova_step1)) + " (vem dos Ajustes do app de flashcards).</p>" : "") +
        "</section>" +
      "</div>" +

      '<section class="panel" aria-labelledby="an-t"><div class="panel__head"><h2 class="h-sm" id="an-t">Anotações do mentor</h2>' +
        '<p class="hint">Uso interno da equipe: o participante não vê este campo na tela, mas pode pedir cópia dele pela LGPD (art. 18). Registre combinados e conversas, não diagnósticos de saúde nem dados que não sirvam ao acompanhamento.</p></div>' +
        '<form data-nota novalidate>' +
          '<div class="field"><label for="n-txt" class="sr-only">Anotações</label><textarea id="n-txt" name="texto" class="input input--area" rows="5" maxlength="5000">' + e(nota?.texto || "") + "</textarea></div>" +
          '<div class="nota__foot"><p class="hint" data-nota-info aria-live="polite">' + (nota?.atualizado_em ? "Salva em " + e(dataBR(nota.atualizado_em)) + "." : "Nenhuma anotação ainda.") + "</p>" +
          '<button class="btn btn--sm" type="submit">' + icon("pencil-simple") + "Salvar anotação</button></div>" +
        "</form>" +
      "</section>" +
      avisoLgpd() +
    "</div>";

    /* ---------- eventos ---------- */
    const recarregar = async (foco) => {
      const y = window.scrollY;
      ctx.invalidar();
      await this.render(ctx, el, args);
      window.scrollTo({ top: y });
      if (foco) $(foco, el)?.focus();
    };

    $("[data-imprimir]", el).addEventListener("click", () => window.print());

    /* o ouvinte fica no elemento da ficha, recriado a cada desenho (sem duplicar) */
    $("[data-ficha]", el).addEventListener("click", async (ev) => {
      const v = ev.target.closest("[data-verificar]");
      if (v) {
        const marcar = v.dataset.verificar === "1";
        try {
          await ctx.store.verifyNbme(v.dataset.id, marcar);
          toast(marcar ? "Autoavaliação marcada como verificada." : "Verificação desfeita.", "ok");
          await recarregar('[data-id="' + CSS.escape(v.dataset.id) + '"][data-verificar]');
        } catch (err) { toast(err.message, "erro"); }
        return;
      }
      const dn = ev.target.closest("[data-del-nbme]");
      if (dn) {
        if (!(await confirmar("Excluir autoavaliação", "Excluir este lançamento? Use só para registro duplicado ou errado; o participante pode lançar de novo.", "Excluir", true))) return;
        try { await ctx.store.deleteNbme(dn.dataset.delNbme); toast("Autoavaliação excluída.", "ok"); await recarregar("#nb-t"); } catch (err) { toast(err.message, "erro"); }
        return;
      }
      const ds = ev.target.closest("[data-del-sim]");
      if (ds) {
        if (!(await confirmar("Excluir tentativa", "Excluir esta tentativa de simulado? Ela sai do histórico do participante e das médias da turma.", "Excluir", true))) return;
        try { await ctx.store.deleteSimulado(ds.dataset.delSim); toast("Tentativa excluída.", "ok"); await recarregar("#sim-t"); } catch (err) { toast(err.message, "erro"); }
        return;
      }
      if (ev.target.closest("[data-importar]")) {
        if (await importarPresenca(ctx)) await recarregar("#pres-t");
      }
    });

    $("[data-presenca]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.currentTarget;
      const erro = $("[data-pres-erro]", el);
      const a = f.aulas_assistidas.value.trim(), t = f.aulas_totais.value.trim();
      erro.textContent = "";
      f.aulas_assistidas.removeAttribute("aria-invalid");
      f.aulas_totais.removeAttribute("aria-invalid");
      if (a === "" || t === "" || !/^\d+$/.test(a) || !/^\d+$/.test(t)) {
        erro.textContent = "Informe números inteiros não negativos nos dois campos.";
        (a === "" || !/^\d+$/.test(a) ? f.aulas_assistidas : f.aulas_totais).setAttribute("aria-invalid", "true");
        return;
      }
      if (Number(a) > Number(t)) { erro.textContent = "Aulas assistidas não podem passar do total."; f.aulas_assistidas.setAttribute("aria-invalid", "true"); f.aulas_assistidas.focus(); return; }
      try {
        await ctx.store.setPresenca(id, { aulas_assistidas: Number(a), aulas_totais: Number(t) });
        toast("Presença salva: " + a + " de " + t + " aulas.", "ok");
        await recarregar("#p-a");
      } catch (err) { erro.textContent = err.message; }
    });

    $("[data-plano]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.currentTarget;
      const dados = {
        data_prova_step1: f.data_prova_step1.value || null,
        data_prova_step2ck: f.data_prova_step2ck.value || null,
        data_matricula: f.data_matricula.value || null,
        ciclo_basico_concluido_em: f.ciclo_basico_concluido_em.value || null,
        step1_aprovado: f.step1_aprovado.checked,
        step2ck_aprovado: f.step2ck_aprovado.checked
      };
      try {
        await ctx.store.savePlano(dados, id);
        toast("Plano salvo.", "ok");
        await recarregar("#pl-t");
      } catch (err) { toast(err.message, "erro"); }
    });

    $("[data-nota]", el).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const n = await ctx.store.saveAnotacao(id, ev.currentTarget.texto.value);
        $("[data-nota-info]", el).textContent = "Salva em " + dataBR(n.atualizado_em) + ".";
        toast("Anotação salva.", "ok");
      } catch (err) { toast(err.message, "erro"); }
    });
  }
};

const ICONE_CHECK = { cumprido: "check-circle", pendente: "x-circle", andamento: "hourglass-medium", sem_dado: "hourglass-medium" };
const ROTULO_CHECK = { cumprido: "cumprido", pendente: "pendente", andamento: "em andamento", sem_dado: "sem dado" };
function listaChecklist(itens) {
  return '<ul class="checks-gar">' + itens.map((i) => '<li class="cg cg--' + (i.estado === "sem_dado" ? "sem-dado" : i.estado) + '">' + icon(ICONE_CHECK[i.estado]) +
    '<div><b>' + e(i.titulo) + '</b> <span class="sr-only">(' + ROTULO_CHECK[i.estado] + ")</span><p>" + e(i.detalhe) + "</p></div></li>").join("") + "</ul>";
}

function blocoProntidao(p, step) {
  const linhas = p.consideradas.map((x) => [x.formulario, dataBR(x.data), ROTULO_MODO[x.modo] || x.modo,
    x.probabilidade === null ? "não informada" : String(x.probabilidade).replace(".", ",") + "%",
    x.faixa_acima_aprovacao_baixa === true ? "acima" : x.faixa_acima_aprovacao_baixa === false ? "não está acima" : "não informada"]);
  return '<div class="pront"><p class="pront__t"><b>' + NOME_STEP[step] + "</b> " + chipProntidao(p.status_tela) + "</p>" +
    (p.motivo ? '<p class="pront__m">' + e(p.motivo) + "</p>" : "") +
    (linhas.length ? '<table class="mini-tab"><caption class="sr-only">Autoavaliações consideradas no ' + NOME_STEP[step] + '</caption><thead><tr><th scope="col">Formulário</th><th scope="col">Data</th><th scope="col">Modo</th><th scope="col">Probabilidade</th><th scope="col">Faixa</th></tr></thead><tbody>' +
      linhas.map((l) => "<tr>" + l.map((c) => "<td>" + e(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>" : "") +
    p.avisos.map((a) => '<p class="pront__aviso">' + icon("warning") + "<span>" + e(a) + "</span></p>").join("") +
    '<p class="hint">' + e(p.criterio) + "</p></div>";
}

function blocoSimulados(simulados, cfg, ctx) {
  if (!simulados.length) return '<p class="body">Nenhuma tentativa ainda. O simulado fica em <a href="../simulado/">../simulado/</a>.</p>';
  const tab = '<div class="ptab-wrap"><table class="mini-tab mini-tab--sim"><caption class="sr-only">Tentativas de simulado, mais recente primeiro</caption><thead><tr><th scope="col">Data</th><th scope="col">Step</th><th scope="col">Acerto</th><th scope="col">Em branco</th><th scope="col">Tempo</th><th scope="col">Média por questão</th><th scope="col">Encerrado por</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>' +
    simulados.map((s) => {
      const rt = ritmo(s);
      return "<tr>" + td("Data", e(dataBR(s.fim))) + td("Step", e(NOME_STEP[s.step])) +
        td("Acerto", '<b class="' + (s.acertos / s.total < cfg.simulado_minimo ? "is-risco" : "") + '">' + s.acertos + "/" + s.total + "</b> " + pct(s.acertos / s.total)) +
        td("Em branco", String(s.em_branco || 0)) + td("Tempo", min(s.duracao_ms)) +
        td("Média por questão", rt.medio_ms ? seg(rt.medio_ms) + (rt.acima_do_ritmo ? " <small>" + pct(rt.acima_do_ritmo) + " acima de " + Math.round(SIMULADO_30.ritmo_ms / 1000) + " s</small>" : "") : "") +
        td("Encerrado por", s.encerramento === "tempo" ? "tempo esgotado" : "participante") +
        td("", '<button type="button" class="icon-btn icon-btn--perigo" data-del-sim="' + e(s.id) + '" aria-label="Excluir tentativa de ' + e(dataBR(s.fim)) + '">' + icon("trash") + "</button>") + "</tr>";
    }).join("") + "</tbody></table></div>";
  const porStep = ["step1", "step2ck"].filter((st) => simulados.some((s) => s.step === st)).map((st) => {
    const areas = desempenhoPorArea(simulados.filter((s) => s.step === st), "por_sistema").map((a) => ({ ...a, nome: nomeArea(a.chave, { step: st, tax: ctx.tax }) }));
    const poucas = areas.filter((a) => a.total < MIN_QUESTOES_AREA).length;
    return '<div><h3 class="h-xs">' + NOME_STEP[st] + (st === "step2ck" ? " por área" : " por sistema") + "</h3>" + barrasAcerto(areas, { meta: cfg.simulado_minimo, titulo: "Acerto por " + (st === "step2ck" ? "área" : "sistema") + " no " + NOME_STEP[st], minQuestoes: MIN_QUESTOES_AREA }) +
      (poucas ? '<p class="hint">Em cinza, no fim da lista: ' + plural(poucas, "área com", "áreas com") + " menos de " + MIN_QUESTOES_AREA + " questões somadas, amostra pequena demais para comparar com a meta.</p>" : "") + "</div>";
  }).join("");
  return tab + '<div class="grid2 grid2--top ficha__areas">' + porStep + "</div>";
}

function blocoNbme(lista) {
  if (!lista.length) return '<p class="body">Nenhuma autoavaliação lançada.</p>';
  return '<div class="ptab-wrap"><table class="mini-tab mini-tab--nbme"><caption class="sr-only">Autoavaliações NBME, mais recente primeiro</caption><thead><tr><th scope="col">Data</th><th scope="col">Step e formulário</th><th scope="col">Modo</th><th scope="col">Escore</th><th scope="col">Probabilidade</th><th scope="col">Faixa acima da aprovação baixa</th><th scope="col">Verificação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>' +
    lista.map((x) => "<tr>" + td("Data", e(dataBR(x.data))) +
      td("Step e formulário", "<b>" + e(NOME_STEP[x.step]) + "</b> " + e(x.formulario) + (x.observacao ? '<small class="nb-obs">' + e(x.observacao) + "</small>" : "")) +
      td("Modo", e(ROTULO_MODO[x.modo] || x.modo)) + td("Escore", e(x.escore ?? x.escore_texto ?? "")) +
      td("Probabilidade", x.probabilidade === null || x.probabilidade === undefined ? "não informada" : String(x.probabilidade).replace(".", ",") + "%") +
      td("Faixa acima da aprovação baixa", x.faixa_acima_aprovacao_baixa === true ? "sim" : x.faixa_acima_aprovacao_baixa === false ? "não" : "não informada") +
      td("Verificação", x.verificada
        ? '<span class="gar gar--ok">' + icon("seal-check") + "Verificada</span>" + (x.verificada_em ? "<small>em " + e(dataBR(x.verificada_em)) + "</small>" : "") + ' <button type="button" class="link-btn" data-verificar="0" data-id="' + e(x.id) + '">Desfazer verificação</button>'
        : '<button type="button" class="btn btn--sm" data-verificar="1" data-id="' + e(x.id) + '">' + icon("seal-check") + "Marcar como verificada</button>") +
      td("", '<button type="button" class="icon-btn icon-btn--perigo" data-del-nbme="' + e(x.id) + '" aria-label="Excluir autoavaliação ' + e(x.formulario + " de " + dataBR(x.data)) + '">' + icon("trash") + "</button>") + "</tr>").join("") +
    "</tbody></table></div>";
}

function td(rotulo, html) {
  return '<td data-label="' + e(rotulo) + '">' + html + "</td>";
}

function campoData(nome, rotulo, valor) {
  return '<div class="field"><label for="pl-' + nome + '">' + e(rotulo) + '</label><input id="pl-' + nome + '" name="' + nome + '" type="date" class="input" value="' + e(valor || "") + '"></div>';
}
