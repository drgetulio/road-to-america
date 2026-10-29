/* Road to America | área administrativa: gráficos em SVG (sem biblioteca).
   Regras: poucos elementos, rótulo direto no lugar de legenda, uma cor por
   significado. Azul do site (--chart-1) = medida; vermelho = abaixo da meta;
   linha tracejada vermelha = meta ou mínimo; verde = dentro da meta.
   Todo gráfico traz aria-label com a leitura principal e uma tabela opcional. */
import { escapeHtml as e } from "../../anki/js/util.js";

const fmtPct = (x, casas = 0) => (x === null || x === undefined ? "sem dado" : (x * 100).toFixed(casas).replace(".", ",") + "%");
const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function passoBonito(max) {
  const bruto = Math.max(1, max) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const m = bruto / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
function barra(x, y, w, h) {
  const r = Math.min(3, w / 2, h);
  return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
}

export function tabela(titulo, colunas, linhas) {
  return '<details class="table-view"><summary>Ver como tabela</summary><table><caption class="sr-only">' + e(titulo) + "</caption><thead><tr>" +
    colunas.map((c) => '<th scope="col">' + e(c) + "</th>").join("") + "</tr></thead><tbody>" +
    linhas.map((l) => "<tr>" + l.map((c) => "<td>" + e(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></details>";
}

/* Barras verticais por dia ou semana.
   valores: números; rotulos: texto de cada barra; parcial: índice da barra em curso (hoje). */
export function barrasVerticais(valores, { rotulos = [], titulo = "", parcial = -1, linhaMedia = null, rotuloMedia = "", cadaRotulo = 5, altura = 200, largura = 720 } = {}) {
  const W = largura, H = altura;
  const temMedia = linhaMedia !== null && linhaMedia > 0;
  const pad = { l: 46, r: 10, t: temMedia ? 30 : 16, b: 28 };
  const max = Math.max(5, ...valores, linhaMedia || 0);
  const passo = passoBonito(max);
  const topo = Math.ceil(max / passo) * passo;
  const bw = (W - pad.l - pad.r) / Math.max(1, valores.length);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / topo);
  const maxV = Math.max(...valores);
  let s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + e(titulo + ". Máximo de " + fmtNum(maxV) + (linhaMedia !== null ? "; " + rotuloMedia + " " + fmtNum(linhaMedia) : "") + ".") + '">';
  for (let v = 0; v <= topo; v += passo) {
    s += '<line class="chart__grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
      '<text class="chart__lbl" x="' + (pad.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmtNum(v) + "</text>";
  }
  valores.forEach((n, i) => {
    const x = pad.l + i * bw + 1.5;
    const h = Math.max(0, y(0) - y(n));
    s += '<g class="chart__bar' + (i === parcial ? " is-parcial" : "") + '"><title>' + e((rotulos[i] || "") + ": " + fmtNum(n) + (i === parcial ? " (dia em curso)" : "")) + "</title>" +
      '<rect class="chart__hit" x="' + (pad.l + i * bw) + '" y="' + pad.t + '" width="' + bw + '" height="' + (H - pad.t - pad.b) + '"/>' +
      (n ? '<path d="' + barra(x, y(n), Math.max(1, bw - 3), h) + '"/>' : "") + "</g>";
    /* rótulos contados a partir da última barra, para a mais recente sempre ter o seu */
    if (cadaRotulo && (valores.length - 1 - i) % cadaRotulo === 0 && rotulos[i]) {
      s += '<text class="chart__lbl" x="' + (x + (bw - 3) / 2) + '" y="' + (H - 9) + '" text-anchor="middle">' + e(rotulos[i]) + "</text>";
    }
  });
  if (temMedia) {
    /* a legenda da linha fica acima da área do gráfico, sem cobrir barras */
    const txt = rotuloMedia + " " + fmtNum(linhaMedia);
    s += '<line class="chart__ref" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(linhaMedia) + '" y2="' + y(linhaMedia) + '"/>' +
      '<line class="chart__ref" x1="' + (W - pad.r - 8 * txt.length - 34) + '" x2="' + (W - pad.r - 8 * txt.length - 10) + '" y1="11" y2="11"/>' +
      '<text class="chart__lbl chart__lbl--ref" x="' + (W - pad.r) + '" y="15" text-anchor="end">' + e(txt) + "</text>";
  }
  return s + "</svg>";
}

/* Linha de proporções (0 a 1) com faixa de referência.
   pontos: [{ rotulo, valor | null, n }]; meta: linha tracejada; minimo, maximo: escala. */
export function linhaProporcao(pontos, { titulo = "", meta = null, rotuloMeta = "meta", minimo = 0, maximo = 1, altura = 220, largura = 480, sufixoN = "" } = {}) {
  const W = largura, H = altura;
  const pad = { l: 40, r: 12, t: 18, b: 26 };
  const x = (i) => pad.l + (pontos.length <= 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (pontos.length - 1));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (Math.max(minimo, Math.min(maximo, v)) - minimo) / (maximo - minimo));
  const validos = pontos.map((p, i) => ({ ...p, i })).filter((p) => p.valor !== null && p.valor !== undefined);
  const ultimo = validos[validos.length - 1];
  const desc = validos.length ? "Último valor " + fmtPct(ultimo.valor) + (meta !== null ? ", " + rotuloMeta + " " + fmtPct(meta) : "") : "Sem dados no período";
  let s = '<svg class="chart chart--linha" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + e(titulo + ". " + desc + ".") + '">';
  const passo = (maximo - minimo) / 4;
  for (let k = 0; k <= 4; k++) {
    const v = minimo + k * passo;
    s += '<line class="chart__grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
      '<text class="chart__lbl" x="' + (pad.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v * 100) + "%</text>";
  }
  if (meta !== null) {
    s += '<line class="chart__ref" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(meta) + '" y2="' + y(meta) + '"/>' +
      '<text class="chart__lbl chart__lbl--ref" x="' + (pad.l + 4) + '" y="' + (y(meta) - 5) + '">' + e(rotuloMeta + " " + fmtPct(meta)) + "</text>";
  }
  /* segmentos só entre pontos consecutivos com dado */
  let d = "";
  validos.forEach((p, k) => { d += (k && validos[k - 1].i === p.i - 1 ? "L" : "M") + x(p.i).toFixed(1) + "," + y(p.valor).toFixed(1); });
  if (d) s += '<path class="chart__line" d="' + d + '"/>';
  for (const p of validos) {
    s += '<circle class="chart__dot' + (meta !== null && p.valor < meta ? " is-abaixo" : "") + '" cx="' + x(p.i).toFixed(1) + '" cy="' + y(p.valor).toFixed(1) + '" r="4"><title>' + e(p.rotulo + ": " + fmtPct(p.valor) + (p.n !== undefined ? " (" + p.n + sufixoN + ")" : "")) + "</title></circle>";
  }
  if (ultimo) s += '<text class="chart__lbl chart__lbl--val" x="' + Math.min(W - pad.r, x(ultimo.i) + 2) + '" y="' + (y(ultimo.valor) - 9) + '" text-anchor="end">' + fmtPct(ultimo.valor) + "</text>";
  [0, pontos.length - 1].forEach((i) => {
    if (pontos[i]) s += '<text class="chart__lbl" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="' + (i ? "end" : "start") + '">' + e(pontos[i].rotulo) + "</text>";
  });
  return s + "</svg>";
}

/* Barras horizontais de acerto por área, da pior para a melhor, com a meta.
   areas: [{ nome, taxa, acertos, total }] */
/* minQuestoes: áreas com menos questões ficam em cinza, no fim da lista e sem o
   vermelho de "abaixo da meta", porque a taxa ainda não diz muita coisa. */
export function barrasAcerto(areas, { meta = 0.6, titulo = "Acerto por área", minQuestoes = 0 } = {}) {
  if (!areas.length) return '<p class="hint">Ainda não há questões suficientes por área para comparar.</p>';
  const x = (v) => Math.max(0, Math.min(100, v * 100));
  const ordenadas = areas.filter((a) => a.total >= minQuestoes).concat(areas.filter((a) => a.total < minQuestoes));
  return '<ul class="acerto" aria-label="' + e(titulo) + '">' + ordenadas.map((a) => {
    const pouco = a.total < minQuestoes;
    const abaixo = !pouco && a.taxa < meta;
    return '<li class="acerto__row' + (abaixo ? " is-abaixo" : "") + (pouco ? " is-pouco" : "") + '">' +
      '<span class="acerto__nome">' + e(a.nome) + "</span>" +
      '<span class="acerto__track" role="img" aria-label="' + e(a.nome + ": " + fmtPct(a.taxa) + " de acerto em " + a.total + " questões" + (abaixo ? ", abaixo da meta de " + fmtPct(meta) : "") + (pouco ? ", amostra pequena" : "")) + '">' +
        '<span class="acerto__fill" style="width:' + x(a.taxa).toFixed(1) + '%"></span>' +
        '<span class="acerto__meta" style="left:' + x(meta) + '%"></span>' +
      "</span>" +
      '<span class="acerto__val"><b>' + fmtPct(a.taxa) + "</b> " + a.acertos + "/" + a.total + "</span>" +
    "</li>";
  }).join("") + "</ul>";
}

/* Distribuição da retenção real: um ponto por participante sobre uma régua,
   com o mínimo e a meta marcados e contagens escritas nas faixas. */
export function tiraRetencao(dist, { minimo = 0.8, meta = 0.9, escalaMin = 0.6 } = {}) {
  const W = 720, H = 92;
  const pad = { l: 12, r: 12 };
  const x = (v) => pad.l + (W - pad.l - pad.r) * ((Math.max(escalaMin, Math.min(1, v)) - escalaMin) / (1 - escalaMin));
  let s = '<svg class="chart chart--tira" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + e("Retenção real dos últimos 30 dias por participante. " + dist.abaixo_minimo + " abaixo de " + fmtPct(minimo) + ", " + dist.entre + " entre " + fmtPct(minimo) + " e " + fmtPct(meta) + ", " + dist.na_meta + " com " + fmtPct(meta) + " ou mais.") + '">';
  s += '<rect class="tira__faixa" x="' + x(escalaMin) + '" y="30" width="' + (x(minimo) - x(escalaMin)) + '" height="30"/>';
  s += '<line class="chart__grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="45" y2="45"/>';
  for (const v of [0.6, 0.7, 0.8, 0.9, 1]) s += '<text class="chart__lbl" x="' + x(v) + '" y="84" text-anchor="middle">' + Math.round(v * 100) + "%</text>";
  s += '<line class="chart__ref" x1="' + x(minimo) + '" x2="' + x(minimo) + '" y1="22" y2="66"/>' +
    '<text class="chart__lbl chart__lbl--ref" x="' + (x(minimo) - 4) + '" y="16" text-anchor="end">mínimo ' + fmtPct(minimo) + "</text>";
  s += '<line class="chart__meta-ok" x1="' + x(meta) + '" x2="' + x(meta) + '" y1="22" y2="66"/>' +
    '<text class="chart__lbl chart__lbl--ok" x="' + (x(meta) + 4) + '" y="16">meta ' + fmtPct(meta) + "</text>";
  /* pontos empilhados quando muito próximos */
  const usados = [];
  for (const p of dist.pontos) {
    const cx = x(p.taxa);
    let nivel = 0;
    while (usados.some((u) => u.nivel === nivel && Math.abs(u.cx - cx) < 9)) nivel++;
    usados.push({ cx, nivel });
    const cy = 45 + (nivel % 2 ? 1 : -1) * Math.ceil(nivel / 2) * 9;
    s += '<circle class="chart__dot' + (p.taxa < minimo ? " is-abaixo" : "") + '" cx="' + cx.toFixed(1) + '" cy="' + cy + '" r="4.5"><title>' + e(p.nome + ": " + fmtPct(p.taxa, 1) + " em " + fmtNum(p.n) + " revisões") + "</title></circle>";
  }
  return s + "</svg>";
}

/* Mapa de calor de dias de estudo (colunas = semanas, linhas = dias da semana) */
export function mapaCalor(grade, nivel, { titulo = "Mapa de calor dos dias de estudo" } = {}) {
  const cel = 13, gap = 3;
  const W = grade.length * (cel + gap) + 30;
  const H = 7 * (cel + gap) + 22;
  const diasEstudo = grade.flat().filter((c) => c.n > 0).length;
  let s = '<div class="heat"><svg class="chart heat__svg" style="max-width:' + Math.round(W * 1.5) + 'px" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + e(titulo + ": " + diasEstudo + " dias com estudo no período.") + '">';
  const dias = ["D", "S", "T", "Q", "Q", "S", "S"];
  [1, 3, 5].forEach((i) => { s += '<text class="chart__lbl" x="0" y="' + (20 + i * (cel + gap) + 10) + '">' + dias[i] + "</text>"; });
  let mesAnt = -1;
  let colAnt = -9;
  grade.forEach((col, w) => {
    const m = col[0].data.getMonth();
    if (m !== mesAnt) {
      /* sem rótulo quando o mês anterior foi escrito há menos de 3 colunas */
      if (w < grade.length - 2 && w - colAnt >= 3 && (colAnt = w) >= 0) s += '<text class="chart__lbl" x="' + (30 + w * (cel + gap)) + '" y="11">' + e(col[0].data.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")) + "</text>";
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

/* Barra de contagem simples (lista de categorias com número) */
export function barrasContagem(itens, { total = null } = {}) {
  const max = Math.max(1, ...itens.map((i) => i.n));
  return '<dl class="mat">' + itens.map((i) =>
    "<div><dt>" + e(i.rotulo) + "</dt><dd><b>" + fmtNum(i.n) + '</b><span class="mat__bar" aria-hidden="true"><span class="' + (i.classe || "") + '" style="width:' + Math.round((i.n / (total || max)) * 100) + '%"></span></span></dd></div>').join("") + "</dl>";
}

/* ---------- Banco de questões ---------- */

/* Probabilidade de aprovação da turma num Step: um ponto por participante sobre a
   régua de 0 a 100%. Ponto cheio = alta confiança; anel = estimativa preliminar.
   As faixas de 0 a 10% e de 90 a 100% são as da regra de confiança. */
export function tiraProbabilidade(dist, { titulo = "", baixa = 0.1, alta = 0.9 } = {}) {
  const W = 720, H = 104;
  const pad = { l: 14, r: 14 };
  const x = (v) => pad.l + (W - pad.l - pad.r) * Math.max(0, Math.min(1, v));
  const desc = dist.pontos.length
    ? dist.pontos.length + " participantes com respostas; " + dist.alta_abaixo + " com probabilidade de até " + fmtPct(baixa) + " e alta confiança, " + dist.alta_acima + " com " + fmtPct(alta) + " ou mais e alta confiança, " + dist.preliminar + " com estimativa preliminar."
    : "Nenhum participante com respostas no banco.";
  let s = '<svg class="chart chart--tira" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + e(titulo + ". " + desc) + '">';
  s += '<rect class="tira__faixa" x="' + x(0) + '" y="32" width="' + (x(baixa) - x(0)) + '" height="34"/>';
  s += '<rect class="tira__faixa--ok" x="' + x(alta) + '" y="32" width="' + (x(1) - x(alta)) + '" height="34"/>';
  s += '<line class="chart__grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="49" y2="49"/>';
  for (const v of [0, 0.25, 0.5, 0.75, 1]) s += '<text class="chart__lbl" x="' + x(v) + '" y="96" text-anchor="' + (v === 0 ? "start" : v === 1 ? "end" : "middle") + '">' + Math.round(v * 100) + "%</text>";
  s += '<text class="chart__lbl chart__lbl--ref" x="' + (x(baixa) + 4) + '" y="22">até ' + fmtPct(baixa) + "</text>";
  s += '<text class="chart__lbl chart__lbl--ok" x="' + (x(alta) - 4) + '" y="22" text-anchor="end">' + fmtPct(alta) + " ou mais</text>";
  const usados = [];
  for (const p of dist.pontos) {
    const cx = x(p.p);
    let nivel = 0;
    while (usados.some((u) => u.nivel === nivel && Math.abs(u.cx - cx) < 10)) nivel++;
    usados.push({ cx, nivel });
    const cy = 49 + (nivel % 2 ? 1 : -1) * Math.ceil(nivel / 2) * 10;
    const cls = "chart__dot" + (p.alta ? (p.p <= baixa ? " is-abaixo" : "") : " is-oco");
    s += '<circle class="' + cls + '" cx="' + cx.toFixed(1) + '" cy="' + cy + '" r="5"><title>' + e(p.nome + ": " + fmtPct(p.p) + (p.alta ? ", alta confiança" : ", estimativa preliminar") + " (" + fmtNum(p.n) + " itens)") + "</title></circle>";
  }
  return s + "</svg>";
}

/* Faixa oficial contra a proporção do banco, uma linha por chave do outline.
   linhas: [{ nome, n, pct, faixa: [lo, hi] | null, situacao }] */
export function faixasBlueprint(linhas, { titulo = "" } = {}) {
  const max = Math.max(0.05, ...linhas.map((l) => Math.max(l.pct, l.faixa ? l.faixa[1] / 100 : 0))) * 1.12;
  const x = (v) => Math.max(0, Math.min(100, (v / max) * 100));
  const rot = { dentro: "dentro da faixa", abaixo: "abaixo da faixa", acima: "acima da faixa", sem_faixa: "sem faixa oficial" };
  return '<ul class="bp" aria-label="' + e(titulo) + '">' + linhas.map((l) => {
    const faixa = l.faixa ? fmtPct(l.faixa[0] / 100) + " a " + fmtPct(l.faixa[1] / 100) : "sem faixa";
    return '<li class="bp__row bp__row--' + e(l.situacao) + '">' +
      '<span class="bp__nome">' + e(l.nome) + "</span>" +
      '<span class="bp__track" role="img" aria-label="' + e(l.nome + ": " + fmtPct(l.pct, 1) + " do banco (" + l.n + " itens); faixa oficial " + faixa + "; " + rot[l.situacao]) + '">' +
        (l.faixa ? '<span class="bp__faixa" style="left:' + x(l.faixa[0] / 100).toFixed(1) + "%;width:" + Math.max(0.8, x(l.faixa[1] / 100) - x(l.faixa[0] / 100)).toFixed(1) + '%"></span>' : "") +
        '<span class="bp__fill" style="width:' + x(l.pct).toFixed(1) + '%"></span>' +
      "</span>" +
      '<span class="bp__val"><b>' + fmtPct(l.pct, 1) + "</b> " + l.n + " · faixa " + e(faixa) + "</span>" +
    "</li>";
  }).join("") + "</ul>";
}

/* Curva de cada alternativa por quartil de habilidade (Q1 = 25% mais baixos).
   A correta deve subir da esquerda para a direita; um distrator que sobe é sinal
   de gabarito ou de ambiguidade. dq: saída de distratoresPorQuartil. */
export function curvasOpcao(dq, { titulo = "" } = {}) {
  const W = 480, H = 240;
  const pad = { l: 44, r: 40, t: 14, b: 30 };
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / 3;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v);
  const correta = dq.opcoes.find((o) => o.correta);
  const q4 = (o) => o.q[3].prop ?? 0;
  const ruins = new Set(dq.opcoes.filter((o) => !o.correta && correta && q4(o) > q4(correta)).map((o) => o.letra));
  const desc = correta ? "Alternativa correta " + correta.letra + ": " + correta.q.map((q, i) => "Q" + (i + 1) + " " + fmtPct(q.prop)).join(", ") + (ruins.size ? ". No quartil mais alto, " + [...ruins].join(", ") + " foi mais escolhida que a correta" : "") + "." : "";
  let s = '<svg class="chart chart--linha" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + e(titulo + ". " + desc) + '">';
  for (const v of [0, 0.25, 0.5, 0.75, 1]) s += '<line class="chart__grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="chart__lbl" x="' + (pad.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v * 100) + "%</text>";
  for (let i = 0; i < 4; i++) s += '<text class="chart__lbl" x="' + x(i) + '" y="' + (H - 9) + '" text-anchor="middle">Q' + (i + 1) + "</text>";
  const ordem = dq.opcoes.slice().sort((a, b) => (a.correta ? 1 : 0) - (b.correta ? 1 : 0) || (ruins.has(a.letra) ? 1 : 0) - (ruins.has(b.letra) ? 1 : 0));
  const rotulos = [];
  for (const o of ordem) {
    const pts = o.q.map((q, i) => [x(i), y(q.prop ?? 0)]);
    const cls = o.correta ? "opc opc--correta" : ruins.has(o.letra) ? "opc opc--ruim" : "opc";
    s += '<g class="' + cls + '"><title>' + e("Alternativa " + o.letra + (o.correta ? " (correta)" : "") + ": " + o.q.map((q, i) => "Q" + (i + 1) + " " + fmtPct(q.prop)).join(", ")) + "</title>" +
      '<path d="' + pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("") + '"/>' +
      pts.map((p) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (o.correta ? 4 : 3) + '"/>').join("") + "</g>";
    rotulos.push({ letra: o.letra, y: pts[3][1], tipo: o.correta ? "correta" : ruins.has(o.letra) ? "ruim" : "" });
  }
  /* rótulos à direita, afastados quando se sobrepõem */
  rotulos.sort((a, b) => a.y - b.y);
  for (let i = 1; i < rotulos.length; i++) if (rotulos[i].y - rotulos[i - 1].y < 13) rotulos[i].y = rotulos[i - 1].y + 13;
  const fundo = y(0) + 4;
  if (rotulos.length && rotulos[rotulos.length - 1].y > fundo) {
    rotulos[rotulos.length - 1].y = fundo;
    for (let i = rotulos.length - 2; i >= 0; i--) if (rotulos[i + 1].y - rotulos[i].y < 13) rotulos[i].y = rotulos[i + 1].y - 13;
  }
  for (const r of rotulos) s += '<text class="chart__lbl opc__lbl' + (r.tipo ? " opc__lbl--" + r.tipo : "") + '" x="' + (W - pad.r + 8) + '" y="' + (r.y + 4).toFixed(1) + '">' + e(r.letra) + (r.tipo === "correta" ? " ✓" : "") + "</text>";
  return s + "</svg>";
}

/* Dispersão da recalibração: b de Angoff (x) contra b recalibrado (y), com a
   diagonal. Pontos cheios recebem o b novo; anéis têm respostas de menos. */
export function dispersaoCalibracao(itens, { titulo = "" } = {}) {
  const W = 480, H = 320;
  const pad = { l: 44, r: 14, t: 14, b: 40 };
  const vals = itens.flatMap((i) => [i.b_angoff, i.b]).filter(Number.isFinite);
  const lo = Math.floor(Math.min(-2, ...vals)), hi = Math.ceil(Math.max(2, ...vals));
  const x = (v) => pad.l + ((v - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const n = itens.filter((i) => i.aplicar).length;
  let s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + e(titulo + ". " + itens.length + " itens; " + n + " com respostas suficientes para receber o b novo.") + '">';
  for (let v = lo; v <= hi; v++) {
    s += '<line class="chart__grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="chart__lbl" x="' + (pad.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + String(v).replace("-", "−") + "</text>";
    s += '<text class="chart__lbl" x="' + x(v) + '" y="' + (H - 22) + '" text-anchor="middle">' + String(v).replace("-", "−") + "</text>";
  }
  s += '<text class="chart__lbl" x="' + ((pad.l + W - pad.r) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">b de Angoff (logit)</text>';
  s += '<line class="chart__diag" x1="' + x(lo) + '" y1="' + y(lo) + '" x2="' + x(hi) + '" y2="' + y(hi) + '"/>';
  for (const i of itens) {
    if (!Number.isFinite(i.b) || !Number.isFinite(i.b_angoff)) continue;
    s += '<circle class="chart__dot' + (i.aplicar ? "" : " is-oco") + '" cx="' + x(i.b_angoff).toFixed(1) + '" cy="' + y(i.b).toFixed(1) + '" r="4"><title>' + e(i.id + ": Angoff " + i.b_angoff.toFixed(2) + ", novo " + i.b.toFixed(2) + " (" + i.n + " respostas)") + "</title></circle>";
  }
  return s + "</svg>";
}

/* Regressão logística do resultado oficial sobre theta: curva ajustada, desfechos
   (Pass em cima, Fail embaixo), o limiar do banco (theta = 0) e o theta em que a
   probabilidade ajustada passa de 50%. */
export function curvaLogistica(dados, modelo, { titulo = "" } = {}) {
  const W = 560, H = 280;
  const pad = { l: 44, r: 14, t: 18, b: 40 };
  const lo = -3, hi = 3;
  const x = (v) => pad.l + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const P = (t) => 1 / (1 + Math.exp(-(modelo.beta0 + modelo.beta1 * t)));
  const t50 = modelo.beta1 ? -modelo.beta0 / modelo.beta1 : null;
  let s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + e(titulo + ". " + dados.length + " desfechos; a probabilidade ajustada passa de 50% em θ = " + (t50 === null ? "sem dado" : t50.toFixed(2).replace(".", ",")) + "; o limiar do banco é θ = 0.") + '">';
  for (const v of [0, 0.25, 0.5, 0.75, 1]) s += '<line class="chart__grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="chart__lbl" x="' + (pad.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v * 100) + "%</text>";
  for (let v = lo; v <= hi; v++) s += '<text class="chart__lbl" x="' + x(v) + '" y="' + (H - 22) + '" text-anchor="middle">' + String(v).replace("-", "−") + "</text>";
  s += '<text class="chart__lbl" x="' + ((pad.l + W - pad.r) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">θ do banco (logit; 0 = limiar de Angoff)</text>';
  s += '<line class="chart__ref" x1="' + x(0) + '" x2="' + x(0) + '" y1="' + pad.t + '" y2="' + y(0) + '"/>';
  if (t50 !== null && t50 > lo && t50 < hi) s += '<line class="chart__meta-ok" x1="' + x(t50) + '" x2="' + x(t50) + '" y1="' + pad.t + '" y2="' + y(0) + '"/>';
  let d = "";
  for (let k = 0; k <= 120; k++) { const t = lo + (k / 120) * (hi - lo); d += (k ? "L" : "M") + x(t).toFixed(1) + "," + y(P(t)).toFixed(1); }
  s += '<path class="chart__line" d="' + d + '"/>';
  dados.forEach((r, i) => {
    const pass = r.resultado === "pass";
    const jit = ((i * 37) % 11) / 11 * 0.06;
    s += '<circle class="chart__dot ' + (pass ? "is-ok" : "is-abaixo") + '" cx="' + x(r.theta).toFixed(1) + '" cy="' + y(pass ? 0.97 - jit : 0.03 + jit).toFixed(1) + '" r="3.5"><title>' + e((pass ? "Pass" : "Fail") + " com θ " + r.theta.toFixed(2)) + "</title></circle>";
  });
  return s + "</svg>";
}
