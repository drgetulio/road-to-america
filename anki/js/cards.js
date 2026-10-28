/* Road to America | modelo de card, validação e expansão em itens de estudo */
import { clozeOrds, clozeErrors, renderCloze } from "./cloze.js";
import { sanitizeCardHtml, parseTags } from "./util.js";

export const TIPOS = ["basico", "cloze"];
export const STATUS = ["rascunho", "em_revisao", "aprovado", "rejeitado"];
export const BARALHOS = ["oficial", "comunidade", "pessoal"];
export const RENDIMENTOS = ["alto", "medio"];

export const ROTULO_STATUS = { rascunho: "Rascunho", em_revisao: "Em revisão", aprovado: "Aprovado", rejeitado: "Rejeitado" };
export const ROTULO_BARALHO = { oficial: "Oficial R2A", comunidade: "Comunidade", pessoal: "Pessoal" };

const CAMPOS_CONTEUDO = ["tipo", "frente", "verso", "extra", "nota_pt", "sistema", "disciplina", "tags", "rendimento", "fonte"];
export { CAMPOS_CONTEUDO };

/* Normaliza um card vindo de seed, banco, importação ou editor */
export function normalizeCard(c = {}) {
  const tipo = c.tipo === "cloze" ? "cloze" : "basico";
  return {
    id: String(c.id || ""),
    tipo,
    frente: String(c.frente ?? "").trim(),
    verso: String(c.verso ?? "").trim(),
    extra: String(c.extra ?? "").trim(),
    nota_pt: String(c.nota_pt ?? "").trim(),
    sistema: String(c.sistema || ""),
    disciplina: String(c.disciplina || ""),
    tags: parseTags(c.tags || []),
    rendimento: c.rendimento === "medio" ? "medio" : "alto",
    fonte: String(c.fonte ?? "").trim(),
    status: STATUS.includes(c.status) ? c.status : "rascunho",
    baralho: BARALHOS.includes(c.baralho) ? c.baralho : "pessoal",
    autor_id: c.autor_id ?? null,
    autor_nome: c.autor_nome ?? "",
    revisor_id: c.revisor_id ?? null,
    comentario_revisao: c.comentario_revisao ?? "",
    versao: Number(c.versao) || 1,
    origem: c.origem || "",
    criado_em: c.criado_em || new Date().toISOString(),
    atualizado_em: c.atualizado_em || c.criado_em || new Date().toISOString()
  };
}

/* Erros que impedem salvar. taxonomia = { sistemas: Set, disciplinas: Set } */
export function validateCard(c, taxonomia) {
  const erros = {};
  if (!c.frente) erros.frente = c.tipo === "cloze" ? "Escreva o texto com pelo menos uma lacuna." : "Escreva a pergunta.";
  if (c.tipo === "basico" && !c.verso) erros.verso = "Escreva a resposta.";
  if (c.tipo === "cloze" && c.frente) {
    const e = clozeErrors(c.frente);
    if (e.length) erros.frente = e[0];
  }
  if (!c.sistema) erros.sistema = "Escolha o sistema do outline.";
  else if (taxonomia && !taxonomia.sistemas.has(c.sistema)) erros.sistema = "Sistema desconhecido: " + c.sistema;
  if (!c.disciplina) erros.disciplina = "Escolha a disciplina do outline.";
  else if (taxonomia && !taxonomia.disciplinas.has(c.disciplina)) erros.disciplina = "Disciplina desconhecida: " + c.disciplina;
  return erros;
}

/* Cada card básico gera 1 item; cada número de cloze gera 1 item (irmãos) */
export function itemsOf(card) {
  if (card.tipo === "cloze") {
    const ords = clozeOrds(card.frente);
    return ords.map((ord) => ({ key: card.id + "#" + ord, card_id: card.id, ord }));
  }
  return [{ key: card.id + "#1", card_id: card.id, ord: 1 }];
}

export function splitKey(key) {
  const i = key.lastIndexOf("#");
  return { card_id: key.slice(0, i), ord: Number(key.slice(i + 1)) || 1 };
}

export function renderFront(card, ord = 1) {
  return card.tipo === "cloze" ? renderCloze(card.frente, ord, "frente") : sanitizeCardHtml(card.frente);
}
export function renderBack(card, ord = 1) {
  if (card.tipo === "cloze") return renderCloze(card.frente, ord, "verso");
  return sanitizeCardHtml(card.verso);
}

/* Assinatura do conteúdo, para saber se uma edição mudou o card */
export function contentSignature(c) {
  return JSON.stringify(CAMPOS_CONTEUDO.map((k) => (k === "tags" ? [...(c.tags || [])].sort() : c[k] ?? "")));
}

/* O card entra na fila de estudo deste usuário? */
export function isStudyable(card, userId) {
  if (card.baralho === "pessoal") return card.autor_id === userId && card.status !== "rejeitado";
  return card.status === "aprovado";
}
