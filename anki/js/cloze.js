/* Road to America | cloze no formato do Anki: {{c1::resposta}} ou {{c1::resposta::dica}} */
import { sanitizeCardHtml } from "./util.js";

const RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/* Lista as lacunas na ordem em que aparecem */
export function parseCloze(texto) {
  const out = [];
  const s = String(texto || "");
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(s))) {
    out.push({ ord: Number(m[1]), resposta: m[2], dica: m[3] ?? "", inicio: m.index, fim: m.index + m[0].length });
  }
  return out;
}

/* Números de lacuna distintos, em ordem crescente (cada um vira um card) */
export function clozeOrds(texto) {
  return [...new Set(parseCloze(texto).map((d) => d.ord))].filter((n) => n > 0).sort((a, b) => a - b);
}

/* Problemas de sintaxe que impedem o card de funcionar */
export function clozeErrors(texto) {
  const s = String(texto || "");
  const erros = [];
  const abre = (s.match(/\{\{/g) || []).length;
  const fecha = (s.match(/\}\}/g) || []).length;
  if (abre !== fecha) erros.push("Chaves desbalanceadas: confira se cada {{ tem o seu }}.");
  const semLacuna = s.replace(RE, "");
  if (abre === fecha && /\{\{|\}\}/.test(semLacuna)) erros.push("Há uma lacuna mal escrita. O formato é {{c1::resposta}}.");
  if (/\{\{c0::/.test(s)) erros.push("A numeração das lacunas começa em c1.");
  for (const d of parseCloze(s)) {
    if (!d.resposta.trim()) erros.push("A lacuna c" + d.ord + " está vazia.");
    if (/\{\{c\d+::/.test(d.resposta)) erros.push("Lacunas aninhadas não são aceitas.");
  }
  if (!erros.length && !clozeOrds(s).length) erros.push("O card cloze precisa de pelo menos uma lacuna, como {{c1::resposta}}.");
  return [...new Set(erros)];
}

/* Monta frente e verso de uma lacuna. Os demais clozes aparecem como texto. */
export function renderCloze(texto, ord, lado = "frente") {
  const s = String(texto || "");
  let out = "";
  let pos = 0;
  for (const d of parseCloze(s)) {
    out += sanitizeCardHtml(s.slice(pos, d.inicio));
    if (d.ord === ord) {
      if (lado === "frente") {
        const dica = d.dica ? sanitizeCardHtml(d.dica) : "...";
        out += '<span class="cloze cloze--gap" aria-label="lacuna">[' + dica + "]</span>";
      } else {
        out += '<span class="cloze cloze--ans">' + sanitizeCardHtml(d.resposta) + "</span>";
      }
    } else {
      out += sanitizeCardHtml(d.resposta);
    }
    pos = d.fim;
  }
  out += sanitizeCardHtml(s.slice(pos));
  return out;
}

/* Insere a próxima lacuna em volta da seleção (para o botão do editor) */
export function wrapCloze(texto, inicio, fim, mesmoNumero = false) {
  const ords = clozeOrds(texto);
  const max = ords.length ? Math.max(...ords) : 0;
  const n = mesmoNumero && max ? max : max + 1;
  const sel = texto.slice(inicio, fim);
  const novo = "{{c" + n + "::" + sel + "}}";
  return { texto: texto.slice(0, inicio) + novo + texto.slice(fim), cursor: inicio + novo.length - (sel ? 0 : 2), n };
}
