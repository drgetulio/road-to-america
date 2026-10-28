/* Road to America | exportação para o Anki desktop (texto separado por tabulação)
   e importação de TSV/CSV */
import { normalizeCard } from "./cards.js";
import { parseTags, normTag } from "./util.js";

const DECK_RAIZ = "Road to America::Step 1";

/* Campo de texto no formato aceito pelo importador do Anki: com HTML ativo,
   quebras de linha viram <br>; aspas, tabulação ou quebra pedem aspas duplas */
export function tsvField(v) {
  let s = String(v ?? "").replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
  if (/[\t"]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function versoBasico(c) {
  const partes = [c.verso];
  if (c.extra) partes.push('<div class="r2a-extra">' + c.extra + "</div>");
  if (c.nota_pt) partes.push('<div class="r2a-nota" lang="pt-BR">' + c.nota_pt + "</div>");
  return partes.filter(Boolean).join("<hr>");
}
function extraCloze(c) {
  const partes = [];
  if (c.verso) partes.push(c.verso);
  if (c.extra) partes.push('<div class="r2a-extra">' + c.extra + "</div>");
  if (c.nota_pt) partes.push('<div class="r2a-nota" lang="pt-BR">' + c.nota_pt + "</div>");
  return partes.join("<hr>");
}

export function ankiTags(c, nomesSistema = {}) {
  const t = new Set((c.tags || []).map(normTag).filter(Boolean));
  t.add("R2A");
  if (c.sistema) t.add("R2A::sistema::" + c.sistema);
  if (c.disciplina) t.add("R2A::disciplina::" + c.disciplina);
  if (c.rendimento === "alto") t.add("R2A::alto_rendimento");
  if (c.baralho) t.add("R2A::baralho::" + c.baralho);
  return [...t].join(" ");
}

/*
  Gera o arquivo .txt para Arquivo > Importar do Anki (2.1.55 ou mais novo).
  Colunas: 1 tipo de nota, 2 baralho, 3 Front/Text, 4 Back/Back Extra, 5 tags, 6 GUID.
  O GUID estável faz uma nova importação atualizar as notas em vez de duplicar.
*/
export function toAnkiTsv(cards, { nomesSistema = {} } = {}) {
  const linhas = [
    "#separator:tab",
    "#html:true",
    "#notetype column:1",
    "#deck column:2",
    "#tags column:5",
    "#guid column:6"
  ];
  for (const c of cards) {
    const tipoNota = c.tipo === "cloze" ? "Cloze" : "Basic";
    const sub = nomesSistema[c.sistema] ? nomesSistema[c.sistema].replace(/::/g, ":") : (c.sistema || "geral");
    const deck = DECK_RAIZ + "::" + sub;
    const f1 = c.frente;
    const f2 = c.tipo === "cloze" ? extraCloze(c) : versoBasico(c);
    linhas.push([tipoNota, deck, f1, f2, ankiTags(c), "r2a:" + c.id].map(tsvField).join("\t"));
  }
  return linhas.join("\n") + "\n";
}

/* ---------- Leitura de TSV/CSV ---------- */
export function detectSeparator(texto) {
  const hdr = /^#separator:(\w+)/m.exec(texto);
  if (hdr) {
    const v = hdr[1].toLowerCase();
    return { tab: "\t", comma: ",", semicolon: ";", pipe: "|", space: " " }[v] || "\t";
  }
  const linha = texto.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#")) || "";
  const conta = (ch) => linha.split(ch).length - 1;
  const cand = [["\t", conta("\t")], [";", conta(";")], [",", conta(",")]].sort((a, b) => b[1] - a[1]);
  return cand[0][1] > 0 ? cand[0][0] : "\t";
}

/* Parser com aspas no estilo RFC 4180 */
export function parseDelimited(texto, sep) {
  const linhas = [];
  let campo = "";
  let linha = [];
  let aspas = false;
  const s = String(texto).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (aspas) {
      if (ch === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"' && campo === "") { aspas = true; continue; }
    if (ch === sep) { linha.push(campo); campo = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      linhas.push(linha); linha = [];
      continue;
    }
    campo += ch;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => !(l.length === 1 && l[0].trim() === ""));
}

const COLUNAS = ["id", "tipo", "frente", "verso", "extra", "nota_pt", "sistema", "disciplina", "tags", "rendimento", "fonte"];
const SINONIMOS = {
  front: "frente", text: "frente", pergunta: "frente", question: "frente",
  back: "verso", resposta: "verso", answer: "verso", "back extra": "verso",
  explicacao: "extra", explicação: "extra", mecanismo: "extra", nota: "nota_pt",
  system: "sistema", discipline: "disciplina", type: "tipo", source: "fonte", yield: "rendimento"
};

/*
  Importa cards. Aceita (a) o modelo da Road to America, com cabeçalho de
  colunas (id, tipo, frente, verso, extra, nota_pt, sistema, disciplina, tags,
  rendimento, fonte) ou (b) o arquivo exportado por toAnkiTsv.
  Devolve { cards, erros: [{ linha, msg }] }.
*/
export function importDelimited(texto, { taxonomia = null } = {}) {
  const sep = detectSeparator(texto);
  const brutas = String(texto).split(/\r?\n/);
  const temCabecalhoAnki = brutas.some((l) => /^#(separator|notetype column|guid column)/.test(l));
  const corpo = brutas.filter((l) => !l.startsWith("#")).join("\n");
  const linhas = parseDelimited(corpo, sep);
  const cards = [];
  const erros = [];
  if (!linhas.length) return { cards, erros: [{ linha: 0, msg: "Arquivo vazio." }] };

  if (temCabecalhoAnki) {
    linhas.forEach((l, i) => {
      const [tipoNota, , f1, f2, tags, guid] = l;
      const tipo = /cloze/i.test(tipoNota || "") ? "cloze" : "basico";
      const tg = parseTags(tags || "");
      const pega = (pref) => (tg.find((t) => t.startsWith(pref)) || "").slice(pref.length);
      const partes = String(f2 || "").split("<hr>");
      const extra = (partes.find((p) => p.includes('class="r2a-extra"')) || "").replace(/<\/?div[^>]*>/g, "");
      const nota = (partes.find((p) => p.includes('class="r2a-nota"')) || "").replace(/<\/?div[^>]*>/g, "");
      const verso = partes.filter((p) => !p.includes("r2a-extra") && !p.includes("r2a-nota")).join("<hr>");
      const c = normalizeCard({
        id: guid && guid.startsWith("r2a:") ? guid.slice(4) : "",
        tipo, frente: f1, verso, extra, nota_pt: nota,
        sistema: pega("r2a::sistema::"), disciplina: pega("r2a::disciplina::"),
        tags: tg.filter((t) => !t.startsWith("r2a")),
        rendimento: tg.includes("r2a::alto_rendimento") ? "alto" : "medio"
      });
      validarLinha(c, i + 1, taxonomia, erros) && cards.push(c);
    });
    return { cards, erros };
  }

  const cab = linhas[0].map((h) => {
    const k = h.trim().toLowerCase();
    return SINONIMOS[k] || k;
  });
  const temCab = cab.includes("frente");
  const mapa = temCab ? cab : COLUNAS;
  const dados = temCab ? linhas.slice(1) : linhas;
  dados.forEach((l, i) => {
    const o = {};
    mapa.forEach((k, j) => { if (COLUNAS.includes(k)) o[k] = l[j] ?? ""; });
    const c = normalizeCard({ ...o, tipo: o.tipo === "cloze" || /\{\{c\d+::/.test(o.frente || "") ? "cloze" : "basico" });
    validarLinha(c, i + (temCab ? 2 : 1), taxonomia, erros) && cards.push(c);
  });
  return { cards, erros };
}

function validarLinha(c, n, tax, erros) {
  if (!c.frente) { erros.push({ linha: n, msg: "Sem frente." }); return false; }
  if (c.tipo === "basico" && !c.verso) { erros.push({ linha: n, msg: "Card básico sem verso." }); return false; }
  if (tax && !tax.sistemas.has(c.sistema)) { erros.push({ linha: n, msg: "Sistema ausente ou desconhecido: “" + c.sistema + "”." }); return false; }
  if (tax && !tax.disciplinas.has(c.disciplina)) { erros.push({ linha: n, msg: "Disciplina ausente ou desconhecida: “" + c.disciplina + "”." }); return false; }
  return true;
}

/* Modelo de planilha para quem prefere escrever fora do app */
export function templateTsv() {
  return COLUNAS.join("\t") + "\n" +
    ["", "basico", "Which enzyme is deficient in classic galactosemia?", "Galactose-1-phosphate uridyltransferase",
      "Galactose-1-phosphate accumulates in liver, lens and kidney, causing hepatomegaly, cataracts and renal tubular dysfunction.",
      "", "gastrointestinal", "bioquimica", "metabolismo galactose", "alto", "Lehninger Principles of Biochemistry, 8th ed."].join("\t") + "\n";
}

/* Backup completo em JSON */
export function toBackup({ cards, estados, revlog, configuracoes, usuario }) {
  return JSON.stringify({
    formato: "r2a-anki-backup",
    versao: 1,
    gerado_em: new Date().toISOString(),
    usuario: usuario ? { id: usuario.id, nome: usuario.nome || "" } : null,
    configuracoes,
    cards,
    estados,
    revlog
  }, null, 2);
}

export function parseBackup(texto) {
  const o = JSON.parse(texto);
  if (!o || o.formato !== "r2a-anki-backup") throw new Error("Este arquivo não é um backup da Road to America.");
  return o;
}
