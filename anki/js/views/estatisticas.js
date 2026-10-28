/* Road to America | estatísticas: retenção, previsão, sequência, maturidade e cobertura */
import { retention, forecast, activity, heatmapGrid, maturity, coverage } from "../stats.js";
import { itemsOf, isStudyable } from "../cards.js";
import { State } from "../scheduler.js";
import { pct, addDays, dayStart } from "../util.js";
import { e, icon, num } from "../ui.js";
import { pageHead } from "./shared.js";

export default {
  titulo: "Estatísticas",
  async render(ctx, el) {
    const now = new Date();
    const cards = ctx.cards.filter((c) => isStudyable(c, ctx.user.id));
    const itens = cards.flatMap(itemsOf);
    const ret = retention(ctx.revlog, { dias: 30, now });
    const retMad = retention(ctx.revlog, { dias: 30, now, maduros: true });
    const prev = forecast([...ctx.states.values()], { dias: 30, now });
    const ativ = activity(ctx.revlog, { now });
    const grid = heatmapGrid(ativ.porDia, { semanas: 26, now });
    const mat = maturity(itens, ctx.states);
    const vistos = new Set([...ctx.states.values()].filter((s) => s.state !== State.New).map((s) => s.card_id));
    const covSis = coverage(cards, ctx.tax.sistemas, "sistema", { vistos });
    const covDis = coverage(cards, ctx.tax.disciplinas, "disciplina", { vistos });
    const hoje = ctx.revlogHoje(now).length;
    const meta = ctx.settings.retencao;

    el.innerHTML = '<div class="wrap section-sm">' +
      pageHead({ eyebrow: "Desempenho", titulo: "Estatísticas", lead: "Retenção medida nas suas respostas, carga dos próximos dias e cobertura do baralho frente ao outline oficial do Step 1." }) +

      '<section class="tiles" aria-label="Indicadores">' +
        tile("Retenção real, 30 dias", ret.taxa == null ? "Sem dados" : pct(ret.taxa, 1), ret.total ? num(ret.total) + (ret.total === 1 ? " revisão" : " revisões") + " · meta " + pct(meta) : "Aparece depois das primeiras revisões", ret.taxa != null && ret.total >= 30 ? (ret.taxa < meta - 0.03 ? "abaixo" : ret.taxa > meta + 0.04 ? "acima" : "ok") : "") +
        tile("Respostas hoje", num(hoje), "Revisões vencidas amanhã: " + num(prev[1] || 0)) +
        tile("Sequência", num(ativ.atual) + (ativ.atual === 1 ? " dia" : " dias"), "Maior sequência: " + num(ativ.maior) + (ativ.maior === 1 ? " dia" : " dias") + " · " + num(ativ.diasEstudados) + (ativ.diasEstudados === 1 ? " dia com estudo" : " dias com estudo")) +
        tile("Maduros", num(mat.maduros), "de " + num(mat.total) + " itens de estudo (intervalo de 21 dias ou mais)") +
      "</section>" +

      '<div class="grid2 grid2--top">' +
      '<section class="panel" aria-labelledby="ret-t"><div class="panel__head"><h2 class="h-sm" id="ret-t">Retenção real e desejada</h2>' +
        '<p class="hint">Proporção de revisões lembradas (Difícil, Bom ou Fácil) entre cards que já estavam em revisão. Com o FSRS calibrado, a real fica perto da desejada.</p></div>' +
        retBar("Todos os cards em revisão", ret, meta) + retBar("Cards maduros", retMad, meta) +
        '<p class="hint">' + (ret.total < 100 ? "Com menos de 100 revisões, a medida ainda oscila bastante." : ret.taxa < meta - 0.03 ? "Real abaixo da meta: confira se você aperta Errei quando esquece (Difícil conta como acerto) e otimize os parâmetros no Anki desktop depois de algumas centenas de revisões." : "Real perto da meta: o agendamento está calibrado para você.") + "</p>" +
      "</section>" +

      '<section class="panel" aria-labelledby="mat-t"><div class="panel__head"><h2 class="h-sm" id="mat-t">Situação dos cards</h2>' +
        '<p class="hint">Conta itens de estudo: cada lacuna de um cloze é agendada à parte, então o total (' + num(mat.total) + ') pode passar do número de cards (' + num(cards.length) + ').</p></div>' +
        '<dl class="mat">' +
          matItem("Nunca estudados", mat.novos, mat.total) + matItem("Em aprendizagem", mat.aprendendo, mat.total) +
          matItem("Jovens (menos de 21 dias)", mat.jovens, mat.total) + matItem("Maduros (21 dias ou mais)", mat.maduros, mat.total) +
          matItem("Suspensos", mat.suspensos, mat.total) + matItem("Leeches", mat.leeches, mat.total) +
        "</dl></section>" +
      "</div>" +

      '<section class="panel" aria-labelledby="prev-t"><div class="panel__head"><h2 class="h-sm" id="prev-t">Previsão de revisões, próximos 30 dias</h2>' +
        '<p class="hint">Cards que vencem a cada dia, sem contar os novos que você ainda vai liberar. O primeiro dia inclui o que está atrasado.</p></div>' +
        forecastChart(prev, now) +
        '<details class="table-view"><summary>Ver como tabela</summary><table><caption class="sr-only">Revisões previstas por dia</caption><thead><tr><th scope="col">Dia</th><th scope="col">Revisões</th></tr></thead><tbody>' +
          prev.map((n, i) => "<tr><td>" + e(rotDia(addDays(dayStart(now), i), i)) + "</td><td>" + num(n) + "</td></tr>").join("") + "</tbody></table></details>" +
      "</section>" +

      '<section class="panel" aria-labelledby="heat-t"><div class="panel__head"><h2 class="h-sm" id="heat-t">Dias de estudo, últimos 6 meses</h2>' +
        '<p class="hint">Revisar todos os dias, mesmo sem cards novos, é o que mantém a carga estável.</p></div>' +
        heatmap(grid) +
      "</section>" +

      '<section class="panel" aria-labelledby="cov-t"><div class="panel__head"><h2 class="h-sm" id="cov-t">Cobertura por sistema</h2>' +
        '<p class="hint">Proporção dos seus cards em cada sistema comparada à faixa do outline oficial do Step 1 (faixa sombreada). Sistemas abaixo da faixa merecem mais cards. Conceitos transversais ficam fora da conta.</p></div>' +
        coverageChart(covSis, 20) +
      "</section>" +
      '<section class="panel" aria-labelledby="covd-t"><div class="panel__head"><h2 class="h-sm" id="covd-t">Cobertura por disciplina</h2>' +
        '<p class="hint">Na prova, um item pode valer para mais de uma disciplina e as faixas somam mais de 100%. Aqui cada card tem uma disciplina, então compare a tendência, não o número exato.</p></div>' +
        coverageChart(covDis, 60) +
      "</section>" +
      '<p class="fine">Faixas: USMLE Step 1 Content Outline and Specifications, conferido em outubro de 2026. O USMLE avisa que as faixas podem mudar.</p>' +
      "</div>";
  }
};

function tile(rot, valor, sub, estado = "") {
  return '<div class="tile' + (estado ? " tile--" + estado : "") + '"><p class="tile__k">' + e(rot) + '</p><p class="tile__v">' + e(valor) + '</p><p class="tile__s">' + e(sub) + "</p></div>";
}

function retBar(rot, r, meta) {
  const v = r.taxa == null ? 0 : r.taxa;
  const escala = (x) => Math.max(0, Math.min(100, ((x - 0.5) / 0.5) * 100));
  return '<div class="retbar">' +
    '<p class="retbar__k"><span>' + e(rot) + "</span><span><b>" + (r.taxa == null ? "sem dados" : pct(v, 1)) + '</b> <small class="retbar__m">meta ' + pct(meta) + "</small></span></p>" +
    '<div class="retbar__track" role="img" aria-label="' + e(rot + ": " + (r.taxa == null ? "sem dados" : pct(v, 1)) + ", meta " + pct(meta)) + '">' +
      (r.taxa == null ? "" : '<span class="retbar__fill" style="width:' + escala(v) + '%"></span>') +
      '<span class="retbar__meta" style="left:' + escala(meta) + '%"></span>' +
    "</div>" +
    '<p class="retbar__scale" aria-hidden="true"><span>50%</span><span>75%</span><span>100%</span></p>' +
  "</div>";
}

function matItem(rot, n, total) {
  return "<div><dt>" + e(rot) + "</dt><dd><b>" + num(n) + '</b><span class="mat__bar" aria-hidden="true"><span style="width:' + (total ? Math.round((n / total) * 100) : 0) + '%"></span></span></dd></div>';
}

function rotDia(d, i) {
  if (i === 0) return "Hoje";
  if (i === 1) return "Amanhã";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
}

function forecastChart(prev, now) {
  const W = 720;
  const H = 220;
  const pad = { l: 40, r: 8, t: 14, b: 30 };
  const max = Math.max(5, ...prev);
  const passo = niceStep(max);
  const topo = Math.ceil(max / passo) * passo;
  const bw = (W - pad.l - pad.r) / prev.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / topo);
  let s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Gráfico de barras: revisões previstas por dia nos próximos 30 dias. Máximo de ' + Math.max(...prev) + ' em um dia.">';
  for (let v = 0; v <= topo; v += passo) {
    s += '<line class="chart__grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
      '<text class="chart__lbl" x="' + (pad.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>";
  }
  prev.forEach((n, i) => {
    const x = pad.l + i * bw + 2;
    const h = Math.max(0, y(0) - y(n));
    const d = addDays(dayStart(now), i);
    s += '<g class="chart__bar' + (i === 0 ? " is-today" : "") + '"><title>' + e(rotDia(d, i) + ": " + n + " revisões") + "</title>" +
      '<rect class="chart__hit" x="' + (pad.l + i * bw) + '" y="' + pad.t + '" width="' + bw + '" height="' + (H - pad.t - pad.b) + '"/>' +
      (n ? '<path d="' + barPath(x, y(n), bw - 4, h) + '"/>' : "") + "</g>";
    if (i % 5 === 0) s += '<text class="chart__lbl" x="' + (x + (bw - 4) / 2) + '" y="' + (H - 10) + '" text-anchor="middle">' + e(i === 0 ? "hoje" : d.getDate() + "/" + (d.getMonth() + 1)) + "</text>";
  });
  return s + "</svg>";
}

/* barra com cantos de 4px só no topo, presa à linha de base */
function barPath(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
}

function niceStep(max) {
  const bruto = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const m = bruto / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function heatmap(grid) {
  const valores = grid.flat().map((c) => c.n).filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p) => valores[Math.floor(p * (valores.length - 1))] || 1;
  const limites = [q(0.25), q(0.5), q(0.75)];
  const nivel = (n) => (n == null ? -1 : n === 0 ? 0 : n <= limites[0] ? 1 : n <= limites[1] ? 2 : n <= limites[2] ? 3 : 4);
  const cel = 13;
  const gap = 3;
  const W = grid.length * (cel + gap) + 30;
  const H = 7 * (cel + gap) + 22;
  let s = '<div class="heat"><svg class="chart heat__svg" style="max-width:' + Math.round(W * 1.5) + 'px" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Mapa de calor dos dias de estudo nas últimas 26 semanas">';
  const dias = ["D", "S", "T", "Q", "Q", "S", "S"];
  [1, 3, 5].forEach((i) => { s += '<text class="chart__lbl" x="0" y="' + (20 + i * (cel + gap) + 10) + '">' + dias[i] + "</text>"; });
  let mesAnt = -1;
  grid.forEach((col, w) => {
    const m = col[0].data.getMonth();
    if (m !== mesAnt) {
      s += '<text class="chart__lbl" x="' + (30 + w * (cel + gap)) + '" y="11">' + e(col[0].data.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")) + "</text>";
      mesAnt = m;
    }
    col.forEach((c, i) => {
      const nv = nivel(c.n);
      if (nv < 0) return;
      s += '<rect class="heat__c heat__c--' + nv + '" x="' + (30 + w * (cel + gap)) + '" y="' + (18 + i * (cel + gap)) + '" width="' + cel + '" height="' + cel + '" rx="3"><title>' +
        e(c.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") + ": " + (c.n ? c.n + " respostas" : "sem estudo")) + "</title></rect>";
    });
  });
  s += "</svg>";
  s += '<p class="heat__legend" aria-hidden="true"><span>menos</span>' + [0, 1, 2, 3, 4].map((n) => '<i class="heat__k heat__c--' + n + '"></i>').join("") + "<span>mais</span></p></div>";
  return s;
}

function coverageChart(linhas, escalaMax) {
  const comFaixa = linhas.filter((l) => l.faixa_min != null);
  const sem = linhas.filter((l) => l.faixa_min == null);
  const maxV = Math.max(escalaMax, ...comFaixa.map((l) => Math.max(l.faixa_max, l.share || 0)));
  const x = (v) => Math.min(100, (v / maxV) * 100);
  const sit = { abaixo: ["Abaixo da faixa", "arrow-down"], dentro: ["Dentro da faixa", "check"], acima: ["Acima da faixa", "arrow-up"] };
  return '<ul class="cov">' + comFaixa.map((l) =>
    '<li class="cov__row cov__row--' + l.situacao + '">' +
      '<p class="cov__name">' + e(l.nome_curto || l.nome_pt) + "</p>" +
      '<div class="cov__track" role="img" aria-label="' + e((l.nome_curto || l.nome_pt) + ": " + (l.share == null ? "sem cards" : l.share.toFixed(1).replace(".", ",") + "% dos cards") + "; faixa do outline " + l.faixa_min + "-" + l.faixa_max + "%; " + sit[l.situacao][0].toLowerCase()) + '">' +
        '<span class="cov__band" style="left:' + x(l.faixa_min) + "%;width:" + (x(l.faixa_max) - x(l.faixa_min)) + '%"></span>' +
        '<span class="cov__bar" style="width:' + x(l.share || 0) + '%"></span>' +
      "</div>" +
      '<p class="cov__val"><b>' + (l.share == null ? "0%" : l.share.toFixed(1).replace(".", ",") + "%") + "</b> <span>faixa " + l.faixa_min + "-" + l.faixa_max + "%</span></p>" +
      '<p class="cov__sit">' + icon(sit[l.situacao][1]) + e(sit[l.situacao][0]) + " · " + num(l.n) + (l.n === 1 ? " card" : " cards") + (l.n ? ", " + Math.round((l.vistos / l.n) * 100) + "% já estudados" : "") + "</p>" +
    "</li>").join("") + "</ul>" +
    (sem.length ? '<p class="hint">' + sem.map((l) => e(l.nome_curto || l.nome_pt) + ": " + num(l.n) + " cards").join(" · ") + " (sem faixa no outline)</p>" : "");
}
