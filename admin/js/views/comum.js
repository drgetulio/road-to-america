/* Road to America | área administrativa: peças de interface compartilhadas */
import { e, icon } from "../../../anki/js/ui.js";
import { ROTULO_STATUS } from "../calculos.js";
import { ROTULO_SITUACAO_GARANTIA, ROTULO_PRONTIDAO } from "../../../plataforma/js/acompanhamento.js";

export function pageHead({ eyebrow, titulo, lead = "", acoes = "" }) {
  return '<header class="page-head">' +
    '<div><p class="eyebrow"><span class="fita" aria-hidden="true"></span>' + e(eyebrow) + "</p>" +
    '<h1 class="display h2">' + titulo + "</h1>" +
    (lead ? '<p class="lead">' + lead + "</p>" : "") + "</div>" +
    (acoes ? '<div class="page-head__acts">' + acoes + "</div>" : "") +
  "</header>";
}

const ICONE_STATUS = { risco: "warning-circle", atencao: "warning", em_dia: "check-circle" };
export function chipStatus(status) {
  return '<span class="st st--' + e(status) + '">' + icon(ICONE_STATUS[status] || "info") + e(ROTULO_STATUS[status] || status) + "</span>";
}
const CLASSE_GARANTIA = { cumprida: "ok", verificar: "aviso", em_dia: "ok", atrasada: "risco", sem_presenca: "neutro" };
export function chipGarantia(sit) {
  return '<span class="gar gar--' + (CLASSE_GARANTIA[sit] || "neutro") + '">' + e(ROTULO_SITUACAO_GARANTIA[sit] || sit) + "</span>";
}
const CLASSE_PRONTIDAO = { pronto: "ok", pronto_sem_faixa: "aviso", nao_pronto: "risco", insuficiente: "neutro", aprovado: "ok" };
export function chipProntidao(st) {
  return '<span class="gar gar--' + (CLASSE_PRONTIDAO[st] || "neutro") + '">' + e(ROTULO_PRONTIDAO[st] || st) + "</span>";
}
export function seloDemo(sintetico) {
  return sintetico ? '<span class="selo-demo" title="Participante fictício gerado para a demonstração">dados de demonstração</span>' : "";
}

export function tile({ rotulo, valor, sub = "", estado = "", href = "" }) {
  const corpo = '<p class="tile__k">' + e(rotulo) + '</p><p class="tile__v">' + valor + '</p><p class="tile__s">' + sub + "</p>";
  return href
    ? '<a class="tile tile--link' + (estado ? " tile--" + estado : "") + '" href="' + e(href) + '">' + corpo + "</a>"
    : '<div class="tile' + (estado ? " tile--" + estado : "") + '">' + corpo + "</div>";
}

/* Variação em pontos percentuais com seta (texto legível também sem cor) */
export function variacao(v) {
  if (v === null || v === undefined) return "";
  const pp = Math.round(v * 100);
  if (pp === 0) return '<span class="var var--igual">estável frente às 2 semanas anteriores</span>';
  return '<span class="var var--' + (pp > 0 ? "sobe" : "desce") + '">' + icon(pp > 0 ? "arrow-up" : "arrow-down") + (pp > 0 ? "+" : "") + pp + " pontos frente às 2 semanas anteriores</span>";
}

export function avisoLgpd(texto = "") {
  return '<p class="lgpd">' + icon("lock-simple") + "<span>" + (texto || "Dados usados só para o acompanhamento pedagógico e a verificação das condições da garantia, conforme a <a href=\"../privacidade.html\">Política de Privacidade</a>.") + "</span></p>";
}

/* Abas de Step (Step 1 e Step 2 CK) para as telas do banco; outros parâmetros ficam */
export function abasStep(rota, step, params = null) {
  const q = (s) => { const p = new URLSearchParams(params || ""); p.set("step", s); return "#/" + rota + "?" + p.toString(); };
  return '<nav class="tabs" aria-label="Step"><a class="tab" href="' + e(q("step1")) + '"' + (step === "step1" ? ' aria-current="page"' : "") + ">Step 1</a>" +
    '<a class="tab" href="' + e(q("step2ck")) + '"' + (step === "step2ck" ? ' aria-current="page"' : "") + ">Step 2 CK</a></nav>";
}

/* Aviso fixo das telas do banco no modo demonstração */
export function avisoDemoBanco(ctx) {
  if (ctx.modo !== "local") return "";
  return '<p class="alert alert--aviso demo-banco">' + icon("info") + "<span><span class=\"selo-demo\">dados de demonstração</span> As respostas, os desfechos e os reportes desta tela são fictícios: vêm de examinandos simulados por um modelo de Rasch com habilidades conhecidas (<code>plataforma/js/respostas-demo.js</code>). Alguns itens recebem de propósito um defeito plantado, para os alertas terem o que mostrar; isso não diz nada sobre a qualidade das questões públicas.</span></p>";
}

/* Rótulo de confiança da estimativa do banco */
export function chipConfianca(est) {
  if (!est) return '<span class="gar gar--neutro">sem respostas</span>';
  return est.confianca?.alta ? '<span class="gar gar--ok">' + icon("seal-check") + "Alta confiança</span>" : '<span class="gar gar--aviso">Estimativa preliminar</span>';
}
