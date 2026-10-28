/* Road to America | regras de permissão dos cards.
   Espelham as políticas RLS e o gatilho de supabase/schema.sql, para que o modo
   demonstração (localStorage) se comporte como o banco. */
import { contentSignature } from "./cards.js";

export class PermissionError extends Error {
  constructor(msg) { super(msg); this.name = "PermissionError"; }
}

export const isAdmin = (u) => !!u && u.papel === "admin";

export function canView(card, u) {
  if (!u) return false;
  if (isAdmin(u)) return true;
  if (card.autor_id === u.id) return true;
  return card.status === "aprovado" && (card.baralho === "oficial" || card.baralho === "comunidade");
}

export function canEdit(card, u) {
  if (!u) return false;
  if (isAdmin(u)) return true;
  return card.autor_id === u.id && card.baralho !== "oficial";
}

export function canDelete(card, u) {
  if (!u) return false;
  if (isAdmin(u)) return true;
  if (card.autor_id !== u.id || card.baralho === "oficial") return false;
  return card.baralho === "pessoal" || card.status !== "aprovado";
}

export const canReview = isAdmin;
export const canPromote = isAdmin;
export const canImport = isAdmin;

/* Inserção por participante: autor é sempre ele; pessoal fica como rascunho
   privado (estudável só pelo autor); comunidade entra em revisão. */
export function applyInsertRules(card, u) {
  if (!u) throw new PermissionError("Entre para criar cards.");
  const c = { ...card };
  if (isAdmin(u)) {
    c.autor_id = c.autor_id || u.id;
    return c;
  }
  c.autor_id = u.id;
  if (c.baralho === "oficial") throw new PermissionError("Só administradores criam cards no baralho oficial.");
  if (c.baralho !== "comunidade") c.baralho = "pessoal";
  if (c.status === "aprovado" || c.status === "rejeitado") throw new PermissionError("Participantes não podem aprovar nem rejeitar cards.");
  c.status = c.baralho === "pessoal" ? "rascunho" : (c.status === "rascunho" ? "rascunho" : "em_revisao");
  c.revisor_id = null;
  c.comentario_revisao = "";
  c.versao = 1;
  return c;
}

/* Atualização. Devolve o card final (com versão incrementada se o conteúdo mudou). */
export function applyUpdateRules(old, next, u) {
  if (!u) throw new PermissionError("Entre para editar cards.");
  const c = { ...old, ...next, id: old.id, criado_em: old.criado_em };
  const mudouConteudo = contentSignature(old) !== contentSignature(c);
  if (!isAdmin(u)) {
    if (old.autor_id !== u.id) throw new PermissionError("Você só pode editar os seus próprios cards.");
    if (old.baralho === "oficial" || c.baralho === "oficial") throw new PermissionError("Cards oficiais só são editados pela curadoria.");
    if (c.status === "aprovado" && old.status !== "aprovado") throw new PermissionError("Participantes não podem aprovar cards.");
    if (c.status === "rejeitado" && old.status !== "rejeitado") throw new PermissionError("Participantes não podem rejeitar cards.");
    if (old.baralho === "comunidade" && old.status === "aprovado" && c.baralho !== "comunidade") {
      throw new PermissionError("Um card já aprovado na comunidade não pode voltar a ser pessoal.");
    }
    c.autor_id = old.autor_id;
    c.revisor_id = old.revisor_id;
    c.comentario_revisao = old.comentario_revisao;
    if (c.baralho === "pessoal") c.status = "rascunho";
    else if (c.baralho === "comunidade") {
      const entrou = old.baralho !== "comunidade";
      if (entrou || mudouConteudo || old.status === "rejeitado") c.status = c.status === "rascunho" && !entrou ? "rascunho" : "em_revisao";
      else c.status = old.status;
    }
  }
  if (mudouConteudo) c.versao = (Number(old.versao) || 1) + 1;
  else c.versao = Number(old.versao) || 1;
  c.atualizado_em = new Date().toISOString();
  return { card: c, mudouConteudo };
}
