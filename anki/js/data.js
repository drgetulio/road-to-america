/* Road to America | carga da taxonomia do outline e dos cards iniciais */
import { normalizeCard } from "./cards.js";
import { clozeErrors } from "./cloze.js";

export function buildTaxonomy(json) {
  const sistemas = json.sistemas || [];
  const disciplinas = json.disciplinas || [];
  const nome = (lista) => Object.fromEntries(lista.map((e) => [e.chave, e.nome_curto || e.nome_pt]));
  return {
    raw: json,
    sistemas,
    disciplinas,
    setSistemas: new Set(sistemas.map((s) => s.chave)),
    setDisciplinas: new Set(disciplinas.map((d) => d.chave)),
    nomeSistema: nome(sistemas),
    nomeDisciplina: nome(disciplinas),
    get validacao() { return { sistemas: this.setSistemas, disciplinas: this.setDisciplinas }; }
  };
}

export async function loadTaxonomy(base = "./data/") {
  const r = await fetch(base + "taxonomia.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("Não foi possível carregar a taxonomia do outline.");
  return buildTaxonomy(await r.json());
}

/* Valida um card de seed; devolve null se não puder ser usado */
export function validSeed(c, tax) {
  if (!c || typeof c !== "object" || !c.id || !c.frente) return null;
  const n = normalizeCard(c);
  if (n.tipo === "basico" && !n.verso) return null;
  if (n.tipo === "cloze" && clozeErrors(n.frente).length) return null;
  if (tax && (!tax.setSistemas.has(n.sistema) || !tax.setDisciplinas.has(n.disciplina))) return null;
  return n;
}

/* Lê data/manifest.json e cada arquivo listado. Arquivos ausentes ou
   inválidos são ignorados, com aviso no console. */
export async function loadSeeds(tax, base = "./data/") {
  let lista = [];
  try {
    const r = await fetch(base + "manifest.json", { cache: "no-cache" });
    if (r.ok) lista = await r.json();
  } catch { /* sem manifesto */ }
  const vistos = new Set();
  const cards = [];
  const relatorio = [];
  for (const arq of Array.isArray(lista) ? lista : []) {
    try {
      const r = await fetch(base + arq, { cache: "no-cache" });
      if (!r.ok) { relatorio.push({ arquivo: arq, ok: false, motivo: "ausente" }); continue; }
      const dados = await r.json();
      let aceitos = 0;
      let recusados = 0;
      for (const c of Array.isArray(dados) ? dados : []) {
        const n = validSeed(c, tax);
        if (!n || vistos.has(n.id)) { recusados++; continue; }
        vistos.add(n.id);
        cards.push({ ...n, origem: "seed" });
        aceitos++;
      }
      relatorio.push({ arquivo: arq, ok: true, aceitos, recusados });
      if (recusados) console.warn("[R2A] " + arq + ": " + recusados + " card(s) ignorados por formato inválido ou id repetido.");
    } catch (e) {
      relatorio.push({ arquivo: arq, ok: false, motivo: e.message });
    }
  }
  return { cards, relatorio };
}
