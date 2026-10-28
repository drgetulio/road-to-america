/* Road to America | utilidades puras (sem DOM), usadas no app e nos testes */

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Etiquetas aceitas no conteúdo dos cards. Todo o resto é escapado. */
const TAGS_PERMITIDAS = ["b", "i", "u", "sub", "sup", "br", "em", "strong"];

/* Converte o HTML simples do card em HTML seguro: escapa tudo e devolve só as
   etiquetas permitidas, sem atributos. Funciona sem DOM (Node e navegador). */
export function sanitizeCardHtml(s) {
  const esc = escapeHtml(s);
  const re = new RegExp("&lt;(\\/?)(" + TAGS_PERMITIDAS.join("|") + ")\\s*\\/?&gt;", "gi");
  let out = esc.replace(re, (_, slash, tag) => {
    tag = tag.toLowerCase();
    if (tag === "br") return "<br>";
    return "<" + slash + tag + ">";
  });
  return fecharTags(out);
}

/* Fecha etiquetas abertas e remove fechamentos sem abertura, para que um card
   malformado não quebre o layout da página. */
function fecharTags(html) {
  const pilha = [];
  const res = html.replace(/<(\/?)(b|i|u|sub|sup|em|strong)>/g, (m, slash, tag) => {
    if (!slash) { pilha.push(tag); return m; }
    const idx = pilha.lastIndexOf(tag);
    if (idx === -1) return "";
    let fech = "";
    while (pilha.length > idx + 1) fech += "</" + pilha.pop() + ">";
    pilha.pop();
    return fech + m;
  });
  return res + pilha.reverse().map((t) => "</" + t + ">").join("");
}

/* Texto puro: tira HTML e marcação de cloze (mantendo a resposta). */
export function plainText(s) {
  return String(s ?? "")
    .replace(/\{\{c\d+::(.*?)(?:::[^}]*?)?\}\}/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function uid(prefix = "u") {
  const rnd = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return prefix + "-" + rnd;
}

export function normTag(t) {
  return String(t || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_:\-.]/g, "");
}

export function parseTags(s) {
  if (Array.isArray(s)) return [...new Set(s.map(normTag).filter(Boolean))];
  return [...new Set(String(s || "").split(/[\s,;]+/).map(normTag).filter(Boolean))];
}

/* ---------- Dias de estudo ----------
   Como no Anki, o "dia" vira às 4h da manhã (hora local), para que quem estuda
   depois da meia-noite não perca a sequência. */
export const HORA_VIRADA = 4;

export function dayStart(date = new Date(), hora = HORA_VIRADA) {
  const d = new Date(date);
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hora, 0, 0, 0);
  if (d < s) s.setDate(s.getDate() - 1);
  return s;
}
export function dayEnd(date = new Date(), hora = HORA_VIRADA) {
  const s = dayStart(date, hora);
  const e = new Date(s);
  e.setDate(e.getDate() + 1);
  return e;
}
/* Chave AAAA-MM-DD do dia de estudo */
export function dayKey(date = new Date(), hora = HORA_VIRADA) {
  const s = dayStart(date, hora);
  return s.getFullYear() + "-" + String(s.getMonth() + 1).padStart(2, "0") + "-" + String(s.getDate()).padStart(2, "0");
}
export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/* Intervalo legível em português: 1 min, 10 min, 3 h, 4 d, 1,5 mês, 2,1 anos */
export function formatInterval(ms) {
  const min = ms / 60000;
  if (min < 1) return "< 1 min";
  if (min < 60) return Math.round(min) + " min";
  const h = min / 60;
  if (h < 24) return Math.round(h) + " h";
  const d = h / 24;
  if (d < 30) return Math.round(d) + " d";
  const mes = d / 30.4;
  if (mes < 12) return fmt1(mes) + (fmt1(mes) === "1" ? " mês" : " meses");
  const a = d / 365;
  return fmt1(a) + (fmt1(a) === "1" ? " ano" : " anos");
}
function fmt1(n) {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace(".", ",");
}

export function pct(n, digits = 0) {
  return (n * 100).toFixed(digits).replace(".", ",") + "%";
}

/* Embaralhamento com semente opcional (Mulberry32), para testes reprodutíveis */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
