/* Road to America | banco de questões: peças de tela compartilhadas pelas views
   (nomes das áreas, formatação, seletor de Step, gráficos em SVG). */
import { nomeChave } from "../../plataforma/js/banco.js";
import { NOME_STEP } from "../../plataforma/js/simulado.js";
import { e, icon } from "../../anki/js/ui.js";

export { NOME_STEP };

const DIM_TAX = { disciplinas: "disciplina", disciplinas_oficiais: "disciplina_oficial" };
export const nome = (step, dim, chave) => nomeChave(step, DIM_TAX[dim] || dim, chave);

export const ROTULO_DIM = {
  step1: { sistema: "Sistema", disciplinas: "Disciplina", disciplina: "Disciplina", competencia: "Competência" },
  step2ck: { sistema: "Sistema", disciplinas_oficiais: "Disciplina clínica", disciplina_oficial: "Disciplina clínica", competencia: "Tarefa do médico", area: "Área", tarefa: "Tarefa" }
};

export function pct(x, casas = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "sem dado";
  return (x * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
}
/* Probabilidade para exibição: nunca mostra 0% nem 100% (a estimativa é probabilística) */
export function pctProb(p) {
  if (!Number.isFinite(p)) return "sem dado";
  if (p > 0.995) return "> 99%";
  if (p < 0.005) return "< 1%";
  return Math.round(p * 100) + "%";
}
export function num(x, casas = 1) {
  return Number(x).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
export function plural(n, um, varios) { return n + " " + (n === 1 ? um : varios); }
export function minSeg(ms) {
  const s = Math.round((ms || 0) / 1000);
  return Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s";
}
export function segundos(ms) { return Math.round((ms || 0) / 1000) + " s"; }
export function dataBR(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "");
}
export function dataHoraBR(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "");
}

/* Cabeçalho de página, no padrão do app de flashcards */
export function cabecalho({ eyebrow = "Banco de questões", titulo, lead = "", acoes = "" }) {
  return '<header class="page-head"><div><p class="eyebrow"><span class="fita" aria-hidden="true"></span>' + e(eyebrow) + "</p>" +
    '<h1 class="display h2">' + titulo + "</h1>" + (lead ? '<p class="lead">' + lead + "</p>" : "") + "</div>" +
    (acoes ? '<div class="page-head__acts">' + acoes + "</div>" : "") + "</header>";
}

/* Abas internas do banco */
export function abas(atual) {
  const lista = [["", "Início", "house-line"], ["criar", "Criar bloco", "plus-circle"], ["blocos", "Meus blocos", "list-numbers"], ["desempenho", "Desempenho", "chart-line-up"], ["aprovacao", "Probabilidade de aprovação", "gauge"]];
  return '<nav class="q-abas" aria-label="Seções do banco de questões"><ul>' + lista.map(([r, t, ic]) =>
    '<li><a href="#/' + r + '"' + (r === atual ? ' aria-current="page"' : "") + ">" + icon(ic) + "<span>" + e(t) + "</span></a></li>").join("") + "</ul></nav>";
}

/* Seletor de Step (rádios com aparência de controle segmentado) */
export function seletorStep(step, nomeCampo = "step-tela") {
  return '<fieldset class="q-step"><legend class="sr-only">Step</legend><div class="seg">' +
    ["step1", "step2ck"].map((s) => '<label class="seg__opt"><input type="radio" name="' + nomeCampo + '" value="' + s + '"' + (s === step ? " checked" : "") + "><span>" + NOME_STEP[s] + "</span></label>").join("") +
    "</div></fieldset>";
}

export const CLASSE_PERFIL = {
  mais_baixo: { rotulo: "Mais baixo que o limiar", css: "risco", icone: "arrow-down" },
  igual: { rotulo: "Igual ao limiar", css: "neutro", icone: "equals" },
  mais_alto: { rotulo: "Mais alto que o limiar", css: "ok", icone: "arrow-up" },
  insuficiente: { rotulo: "Poucos itens", css: "neutro", icone: "hourglass-medium" }
};

/* ---------- gráficos (SVG desenhado na mão, cores pelos tokens do tema) ---------- */

/* Densidade posterior de theta, com o limiar (theta = 0) e a área acima dele */
export function svgPosterior(curva, { largura = 640, altura = 170, titulo = "" } = {}) {
  const pts = curva.pontos;
  if (!pts.length) return "";
  const xmin = pts[0][0], xmax = pts[pts.length - 1][0];
  const ymax = Math.max(...pts.map((p) => p[1])) || 1;
  const m = { l: 10, r: 10, t: 12, b: 34 };
  const X = (x) => m.l + ((x - xmin) / (xmax - xmin)) * (largura - m.l - m.r);
  const Y = (y) => altura - m.b - (y / ymax) * (altura - m.t - m.b);
  const linha = pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
  const acima = pts.filter((p) => p[0] >= 0);
  const area = acima.length ? "M" + X(0).toFixed(1) + " " + Y(0).toFixed(1) + " " + acima.map((p) => "L" + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ") + " L" + X(acima[acima.length - 1][0]).toFixed(1) + " " + Y(0).toFixed(1) + " Z" : "";
  const [lo, hi] = curva.ic90;
  const ticks = [-3, -2, -1, 0, 1, 2, 3].filter((t) => t >= xmin && t <= xmax);
  return '<figure class="q-fig"><svg class="q-post" viewBox="0 0 ' + largura + " " + altura + '" role="img" aria-labelledby="post-t post-d">' +
    '<title id="post-t">' + e(titulo || "Distribuição da habilidade estimada") + "</title>" +
    '<desc id="post-d">' + e("Curva da distribuição posterior da habilidade. O limiar de aprovação do banco é o zero. A área à direita do zero é a probabilidade de aprovação, " + pctProb(curva.p) + ". Intervalo de 90%: " + num(lo, 2) + " a " + num(hi, 2) + " logits.") + "</desc>" +
    '<rect class="q-post__ic" x="' + X(Math.max(xmin, lo)).toFixed(1) + '" y="' + m.t + '" width="' + Math.max(1, X(Math.min(xmax, hi)) - X(Math.max(xmin, lo))).toFixed(1) + '" height="' + (altura - m.t - m.b) + '"></rect>' +
    (area ? '<path class="q-post__area" d="' + area + '"></path>' : "") +
    '<path class="q-post__linha" d="' + linha + '"></path>' +
    '<line class="q-post__base" x1="' + m.l + '" x2="' + (largura - m.r) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"></line>' +
    '<line class="q-post__limiar" x1="' + X(0) + '" x2="' + X(0) + '" y1="' + (m.t - 4) + '" y2="' + (altura - m.b + 4) + '"></line>' +
    ticks.map((t) => '<text class="q-post__tick" x="' + X(t).toFixed(1) + '" y="' + (altura - m.b + 18) + '" text-anchor="middle">' + (t === 0 ? "limiar" : (t > 0 ? "+" : "−") + Math.abs(t)) + "</text>").join("") +
    "</svg>" +
    '<figcaption class="q-fig__leg"><span><i class="q-leg q-leg--area" aria-hidden="true"></i>Probabilidade de estar acima do limiar</span><span><i class="q-leg q-leg--ic" aria-hidden="true"></i>Intervalo de 90% da habilidade</span><span><i class="q-leg q-leg--limiar" aria-hidden="true"></i>Limiar do banco (Angoff)</span></figcaption></figure>';
}

/* Curva de evolução: P(aprovação) depois de cada sessão, com as faixas de decisão
   (10% e 90%). Um ponto por sessão, com dica ao passar o mouse ou focar. */
export function svgEvolucao(pontos, { largura = 720, altura = 240 } = {}) {
  if (!pontos.length) return "";
  const m = { l: 44, r: 14, t: 14, b: 30 };
  const W = largura - m.l - m.r, H = altura - m.t - m.b;
  const X = (i) => m.l + (pontos.length === 1 ? W / 2 : (i / (pontos.length - 1)) * W);
  const Y = (p) => m.t + (1 - p) * H;
  const linha = pontos.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.p_aprovacao).toFixed(1)).join(" ");
  const grade = [0, 0.1, 0.5, 0.9, 1];
  return '<figure class="q-fig"><svg class="q-evo" viewBox="0 0 ' + largura + " " + altura + '" role="img" aria-labelledby="evo-t evo-d">' +
    '<title id="evo-t">Probabilidade de aprovação depois de cada sessão</title>' +
    '<desc id="evo-d">' + e(pontos.length + " sessões. Primeira: " + pctProb(pontos[0].p_aprovacao) + "; última: " + pctProb(pontos[pontos.length - 1].p_aprovacao) + ". A tabela abaixo do gráfico tem todos os valores.") + "</desc>" +
    grade.map((g) => '<line class="q-evo__grade' + (g === 0.1 || g === 0.9 ? " q-evo__grade--decisao" : "") + '" x1="' + m.l + '" x2="' + (largura - m.r) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"></line>' +
      '<text class="q-evo__eixo" x="' + (m.l - 8) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + Math.round(g * 100) + "%</text>").join("") +
    '<path class="q-evo__linha" d="' + linha + '"></path>' +
    pontos.map((p, i) => '<g class="q-evo__pt" tabindex="0" role="img" aria-label="' + e("Sessão " + (i + 1) + ", " + dataBR(p.ate) + ": " + pctProb(p.p_aprovacao) + " com " + p.n + " itens") + '">' +
      '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.p_aprovacao).toFixed(1) + '" r="12" class="q-evo__alvo"></circle>' +
      '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.p_aprovacao).toFixed(1) + '" r="4.5" class="q-evo__marca"></circle>' +
      '<title>' + e(dataBR(p.ate) + ": " + pctProb(p.p_aprovacao) + " (" + p.n + " itens; sessão com " + p.sessao_acertos + " de " + p.sessao_total + ")") + "</title></g>").join("") +
    '<text class="q-evo__eixo" x="' + m.l + '" y="' + (altura - 8) + '">' + e(dataBR(pontos[0].ate)) + "</text>" +
    (pontos.length > 1 ? '<text class="q-evo__eixo" x="' + (largura - m.r) + '" y="' + (altura - 8) + '" text-anchor="end">' + e(dataBR(pontos[pontos.length - 1].ate)) + "</text>" : "") +
    "</svg>" +
    '<figcaption class="q-fig__leg"><span><i class="q-leg q-leg--linha" aria-hidden="true"></i>Probabilidade de aprovação, com todas as respostas até a sessão</span><span><i class="q-leg q-leg--decisao" aria-hidden="true"></i>10% e 90%: faixas em que a estimativa decide</span></figcaption></figure>';
}

/* Barra horizontal com marca do limiar (taxa do aluno e taxa esperada no limiar) */
export function barraLimiar(taxa, limiar, rotulo) {
  const w = Math.max(0, Math.min(100, Math.round((taxa || 0) * 100)));
  const l = Math.max(0, Math.min(100, Math.round((limiar || 0) * 100)));
  const baixo = Number.isFinite(limiar) && taxa < limiar;
  return '<span class="q-barra' + (baixo ? " q-barra--baixa" : "") + '" role="img" aria-label="' + e(rotulo) + '"><span style="width:' + w + '%"></span><i style="left:' + l + '%"></i></span>';
}

export function chipConfianca(conf) {
  return conf?.alta
    ? '<span class="prog-chip prog-chip--ok">' + icon("seal-check") + "Alta confiança</span>"
    : '<span class="prog-chip prog-chip--aviso">' + icon("hourglass-medium") + "Estimativa preliminar</span>";
}

export function linksHtml(links) {
  return '<ul class="q-links">' + links.map((l) => '<li><a href="' + e(l.href) + '" class="q-link q-link--' + l.tipo + '">' + icon(l.tipo === "conteudo" ? "signpost" : l.tipo === "flashcards" ? "cards" : "list-checks") + "<span>" + e(l.rotulo) + "</span></a></li>").join("") + "</ul>";
}
