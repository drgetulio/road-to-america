/* Road to America | área administrativa: visão da turma */
import { e, icon, num } from "../../../anki/js/ui.js";
import { addDays, dayStart } from "../../../anki/js/util.js";
import { CODIGOS_RISCO } from "../../../plataforma/js/desempenho.js";
import { ROTULO_SITUACAO_GARANTIA, NOME_STEP, dataBR } from "../../../plataforma/js/acompanhamento.js";
import {
  indicadoresTurma, tendenciaSimulados, areasFracas, distribuicaoRetencao, contagemCriterios,
  prioridadeAtencao, sugestoesAcao, textoUltimaAtividade, pct, plural, RETENCAO_DESEJADA, MIN_QUESTOES_AREA
} from "../calculos.js";
import { barrasVerticais, linhaProporcao, barrasAcerto, tiraRetencao, barrasContagem, tabela } from "../graficos.js";
import { pageHead, tile, chipStatus, seloDemo, variacao, avisoLgpd } from "./comum.js";

const ddmm = (d) => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");

export default {
  titulo: "Turma",
  async render(ctx, el) {
    el.innerHTML = '<div class="wrap section-sm"><p class="boot__msg" role="status">Calculando os indicadores da turma...</p></div>';
    const { rows, simulados, agora } = await ctx.dados();
    const cfg = ctx.config;
    const ind = indicadoresTurma(rows, simulados, { config: cfg, agora });
    const nFict = rows.filter((r) => r.sintetico).length;
    const hoje = dayStart(agora);

    if (!rows.length) {
      el.innerHTML = '<div class="wrap section-sm">' + pageHead({ eyebrow: "Área administrativa", titulo: "Rendimento da turma" }) +
        '<div class="empty"><p class="body">Nenhum participante cadastrado ainda. Quando os alunos entrarem pela área do aluno, eles aparecem aqui.</p></div>' + avisoLgpd() + "</div>";
      return;
    }

    const s1 = ind.simulados.step1, s2 = ind.simulados.step2ck;
    const retEstado = ind.retencao_turma === null ? "" : ind.retencao_turma < cfg.retencao_minima ? "abaixo" : ind.retencao_turma >= RETENCAO_DESEJADA - 0.02 ? "ok" : "";
    const simTile = (st, step) => tile({
      rotulo: "Simulados " + NOME_STEP[step] + ", 14 dias",
      valor: st.media === null ? "Sem dados" : pct(st.media, 1),
      sub: st.n ? plural(st.n, "tentativa", "tentativas") + " de " + plural(st.participantes, "participante", "participantes") + ". " + variacao(st.variacao) : "Nenhuma tentativa nas últimas 2 semanas.",
      estado: st.media === null ? "" : st.media < cfg.simulado_minimo ? "abaixo" : "ok"
    });

    const atencao = prioridadeAtencao(rows, 6);
    const crit = contagemCriterios(rows);
    const dist = distribuicaoRetencao(rows, { config: cfg });
    const serie = ind.serie_revisoes;
    const rotDias = serie.map((_, i) => ddmm(addDays(hoje, i - 29)));
    /* só tentativas de participantes: as de administradores (testes da equipe) ficam de fora */
    const ids = new Set(rows.map((r) => r.id));
    const simTurma = simulados.filter((s) => ids.has(s.user_id));
    const trend = (step) => tendenciaSimulados(simTurma, step, { agora, semanas: 8 })
      .map((w) => ({ rotulo: ddmm(w.inicio), valor: w.media, n: w.n }));
    const fr1 = areasFracas(simTurma, "step1", { agora, tax: ctx.tax });
    const fr2 = areasFracas(simTurma, "step2ck", { agora, tax: ctx.tax });
    const fr1d = areasFracas(simTurma, "step1", { agora, tax: ctx.tax, campo: "por_disciplina" });
    const fr2d = areasFracas(simTurma, "step2ck", { agora, tax: ctx.tax, campo: "por_disciplina" });

    el.innerHTML = '<div class="wrap section-sm">' +
      pageHead({
        eyebrow: "Área administrativa",
        titulo: "Rendimento da turma",
        lead: "Situação em " + e(dataBR(agora.toISOString())) + ": " + plural(rows.length, "participante", "participantes") + (nFict ? ", " + nFict + " deles fictícios (dados de demonstração)" : "") + ". Clique num indicador para ver quem está por trás dele.",
        acoes: '<a class="btn btn--sm" href="#/participantes">' + icon("users-three") + "Lista de participantes</a>"
      }) +

      '<section class="tiles tiles--adm" aria-label="Indicadores principais">' +
        tile({ rotulo: "Ativos nos últimos 7 dias", valor: ind.ativos_7d + ' <small>de ' + ind.participantes + "</small>",
          sub: plural(ind.inativos, "sem estudo há 7 dias ou mais", "sem estudo há 7 dias ou mais") + (ind.nunca_estudaram ? ", " + plural(ind.nunca_estudaram, "nunca estudou", "nunca estudaram") : "") + ".",
          estado: ind.inativos ? "abaixo" : "ok", href: "#/participantes?inatividade=7" }) +
        tile({ rotulo: "Revisões por dia", valor: num(Math.round(ind.revisoes_dia_7d)),
          sub: "Média da turma nos últimos 7 dias completos" + (ind.revisoes_dia_mediana_ativo !== null ? "; mediana de " + num(Math.round(ind.revisoes_dia_mediana_ativo)) + " por participante ativo." : ".") }) +
        tile({ rotulo: "Retenção real, 30 dias", valor: ind.retencao_turma === null ? "Sem dados" : pct(ind.retencao_turma, 1),
          sub: "Desejada " + pct(RETENCAO_DESEJADA) + " (EXIT 04), mínimo " + pct(cfg.retencao_minima) + ". Mediana por participante: " + (ind.retencao_mediana === null ? "sem dados" : pct(ind.retencao_mediana, 1)) + ".",
          estado: retEstado, href: "#/participantes?ordem=retencao&dir=asc" }) +
        tile({ rotulo: "Em risco", valor: String(ind.status.risco), sub: plural(ind.status.atencao, "em atenção", "em atenção") + ", " + plural(ind.status.em_dia, "em dia", "em dia") + ".", estado: ind.status.risco ? "abaixo" : "ok", href: "#/participantes?status=risco" }) +
        simTile(s1, "step1") + simTile(s2, "step2ck") +
        tile({ rotulo: "Garantia em dia", valor: ind.garantia_em_dia === null ? "Sem dados" : pct(ind.garantia_em_dia),
          sub: plural(ind.garantia.atrasada, "atrasado", "atrasados") + ", " + plural(ind.garantia.sem_presenca, "sem presença lançada", "sem presença lançada") + ". Presença de " + pct(cfg.presenca_minima) + " e NBMEs no ritmo da prova.",
          estado: ind.garantia.atrasada ? "abaixo" : "ok", href: "#/participantes?garantia=atrasada" }) +
        tile({ rotulo: "Prontos pela EXIT 18", valor: String(ind.prontos),
          sub: (ind.prontos_sem_faixa ? plural(ind.prontos_sem_faixa, "atinge", "atingem") + " a probabilidade, mas falta confirmar a faixa. " : "") + plural(ind.nbme_nao_verificadas, "autoavaliação espera", "autoavaliações esperam") + " verificação da equipe.",
          href: "#/participantes?ordem=prova&dir=asc" }) +
      "</section>" +

      '<div class="grid2 grid2--top">' +
        '<section class="panel" aria-labelledby="at-t"><div class="panel__head panel__head--row"><h2 class="h-sm" id="at-t">Quem precisa de atenção agora</h2><a class="link-btn" href="#/participantes?status=risco">Ver todos em risco' + icon("arrow-right") + "</a></div>" +
          (atencao.length ? '<ol class="fila">' + atencao.map((r) => {
            const sug = sugestoesAcao(r, { simulados, config: cfg, agora, tax: ctx.tax })[0];
            return '<li class="fila__item"><div class="fila__top"><a class="fila__nome" href="#/p/' + encodeURIComponent(r.id) + '">' + e(r.nome) + "</a>" + chipStatus(r.status) + seloDemo(r.sintetico) + "</div>" +
              '<p class="fila__motivo">' + e(r.riscos.map((x) => x.detalhe).join(" ")) + "</p>" +
              (sug ? '<p class="fila__acao">' + icon("lightbulb") + "<span><b>" + e(sug.titulo) + ".</b> " + (r.ultima_atividade ? "Última atividade: " + e(textoUltimaAtividade(r).toLowerCase()) + "." : "Nenhuma atividade registrada.") + "</span></p>" : "") + "</li>";
          }).join("") + "</ol>" : '<p class="body">' + icon("check-circle") + " Ninguém em risco ou em atenção hoje.</p>") +
        "</section>" +
        '<section class="panel" aria-labelledby="cr-t"><div class="panel__head"><h2 class="h-sm" id="cr-t">Critérios de risco na turma</h2>' +
          '<p class="hint">Participantes em cada critério. Uma pessoa pode estar em mais de um. Os limites estão em <a href="#/metas">Metas e critérios</a>.</p></div>' +
          barrasContagem(Object.entries(CODIGOS_RISCO).map(([k, rot]) => ({ rotulo: rot, n: crit[k] || 0, classe: "is-risco" })), { total: rows.length }) +
          '<h3 class="h-xs">Situação da garantia</h3>' +
          barrasContagem(["em_dia", "verificar", "cumprida", "atrasada", "sem_presenca"].map((k) => ({ rotulo: ROTULO_SITUACAO_GARANTIA[k], n: ind.garantia[k], classe: k === "atrasada" ? "is-risco" : k === "sem_presenca" ? "is-neutro" : "" })), { total: rows.length }) +
          '<p class="hint">A garantia só é pedida ao fim do prazo de 3 anos (Termo da Garantia). "Em dia" quer dizer presença de pelo menos ' + pct(cfg.presenca_minima) + " e autoavaliações no ritmo da data de prova.</p>" +
        "</section>" +
      "</div>" +

      '<section class="panel" aria-labelledby="rv-t"><div class="panel__head"><h2 class="h-sm" id="rv-t">Revisões da turma por dia, últimos 30 dias</h2>' +
        '<p class="hint">Soma das respostas no app de flashcards. A última barra é o dia de hoje, ainda em curso. Quedas em fins de semana são esperadas; uma queda que dura dias seguidos merece olhar a lista de inativos.</p></div>' +
        barrasVerticais(serie, { rotulos: rotDias, titulo: "Revisões da turma por dia nos últimos 30 dias", parcial: 29, linhaMedia: ind.revisoes_dia_7d, rotuloMedia: "média 7 dias", cadaRotulo: 7 }) +
        tabela("Revisões da turma por dia", ["Dia", "Revisões"], serie.map((n, i) => [rotDias[i] + (i === 29 ? " (hoje)" : ""), num(n)])) +
      "</section>" +

      '<section class="panel" aria-labelledby="rt-t"><div class="panel__head"><h2 class="h-sm" id="rt-t">Retenção real por participante, 30 dias</h2>' +
        '<p class="hint">Cada ponto é um participante. Retenção real é a proporção de revisões lembradas entre cards que já estavam em revisão. Ficam de fora ' + plural(dist.sem_volume, "participante", "participantes") + " com menos de " + cfg.retencao_min_revisoes + " revisões no período, porque a taxa ainda oscila demais.</p></div>" +
        '<p class="tira__resumo"><span class="is-risco"><b>' + dist.abaixo_minimo + "</b> abaixo de " + pct(cfg.retencao_minima) + "</span><span><b>" + dist.entre + "</b> entre " + pct(cfg.retencao_minima) + " e " + pct(RETENCAO_DESEJADA) + '</span><span class="is-ok"><b>' + dist.na_meta + "</b> com " + pct(RETENCAO_DESEJADA) + " ou mais</span></p>" +
        tiraRetencao(dist, { minimo: cfg.retencao_minima, meta: RETENCAO_DESEJADA }) +
        tabela("Retenção real por participante", ["Participante", "Retenção", "Revisões"], dist.pontos.map((p) => [p.nome, pct(p.taxa, 1), num(p.n)])) +
      "</section>" +

      '<section class="panel" aria-labelledby="sm-t"><div class="panel__head"><h2 class="h-sm" id="sm-t">Simulados de 30 minutos: média semanal</h2>' +
        '<p class="hint">Acerto médio das tentativas de cada semana (7 dias até hoje). A linha tracejada é a meta interna de ' + pct(cfg.simulado_minimo) + ". Cada simulado reproduz um bloco oficial: 20 questões em 30 minutos.</p></div>" +
        '<div class="grid2 grid2--mult">' +
          ["step1", "step2ck"].map((step) => {
            const pts = trend(step);
            return '<figure class="mult"><figcaption class="mult__t">' + NOME_STEP[step] + "</figcaption>" +
              linhaProporcao(pts, { titulo: "Acerto médio semanal nos simulados do " + NOME_STEP[step], meta: cfg.simulado_minimo, rotuloMeta: "meta", minimo: 0.2, maximo: 1, sufixoN: " tentativas" }) +
              tabela("Acerto semanal " + NOME_STEP[step], ["Semana de", "Acerto", "Tentativas"], pts.map((p) => [p.rotulo, p.valor === null ? "sem tentativas" : pct(p.valor, 1), String(p.n)])) +
              "</figure>";
          }).join("") +
        "</div>" +
      "</section>" +

      '<section class="panel" aria-labelledby="af-t"><div class="panel__head"><h2 class="h-sm" id="af-t">Áreas mais fracas da turma nos simulados, 60 dias</h2>' +
        '<p class="hint">Todas as questões respondidas pela turma, somadas por sistema (Step 1) e por área (Step 2 CK), da pior para a melhor. Só entram áreas com pelo menos ' + MIN_QUESTOES_AREA + ' questões. Vermelho indica abaixo da meta de ' + pct(cfg.simulado_minimo) + ".</p></div>" +
        '<div class="grid2">' +
          '<div><h3 class="h-xs">Step 1 por sistema</h3>' + barrasAcerto(fr1.slice(0, 6), { meta: cfg.simulado_minimo, titulo: "Acerto por sistema no Step 1" }) +
            (fr1d.length ? '<details class="table-view"><summary>Ver por disciplina</summary>' + barrasAcerto(fr1d, { meta: cfg.simulado_minimo, titulo: "Acerto por disciplina no Step 1" }) + "</details>" : "") + "</div>" +
          '<div><h3 class="h-xs">Step 2 CK por área</h3>' + barrasAcerto(fr2.slice(0, 6), { meta: cfg.simulado_minimo, titulo: "Acerto por área no Step 2 CK" }) +
            (fr2d.length ? '<details class="table-view"><summary>Ver por tarefa</summary>' + barrasAcerto(fr2d, { meta: cfg.simulado_minimo, titulo: "Acerto por tarefa no Step 2 CK" }) + "</details>" : "") + "</div>" +
        "</div>" +
        '<p class="hint">Os bancos ainda são pequenos e cada área aparece poucas vezes por tentativa. Use a lista para escolher temas de aula e de dissecção de questões (EXIT 08), não para avaliar uma pessoa.</p>' +
      "</section>" +
      avisoLgpd() +
    "</div>";
  }
};
