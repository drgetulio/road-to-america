/* Road to America | camada de dados do MODO DEMONSTRAÇÃO (localStorage).
   Mesma interface de store-supabase.js. Os dados ficam só neste navegador. */
import { normalizeCard, contentSignature } from "./cards.js";
import { applyInsertRules, applyUpdateRules, canView, canDelete, canEdit, isAdmin, PermissionError } from "./permissions.js";
import { uid } from "./util.js";

const CHAVE = "r2a-anki-demo-v1";

export const DEMO_USERS = {
  admin: { id: "demo-admin", nome: "Administrador (demonstração)", email: "admin@demo.local", papel: "admin" },
  participante: { id: "demo-participante", nome: "Participante (demonstração)", email: "participante@demo.local", papel: "participante" }
};

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function vazio() {
  return { versao: 1, papel: "participante", cards: {}, historico: [], estados: {}, revlog: {}, sinalizacoes: [], configuracoes: {}, seeds: {} };
}

export class LocalStore {
  constructor({ storage } = {}) {
    this.mode = "local";
    this.storage = storage || (() => { try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return localStorage; } catch { return memoria(); } })();
    this.persistente = !!storage || this.storage !== undefined;
    this.ouvintes = new Set();
    this.db = this._ler();
  }

  _ler() {
    try {
      const raw = this.storage.getItem(CHAVE);
      if (!raw) return vazio();
      const o = JSON.parse(raw);
      return { ...vazio(), ...o };
    } catch { return vazio(); }
  }
  _gravar() {
    try { this.storage.setItem(CHAVE, JSON.stringify(this.db)); }
    catch (e) { throw new Error("O navegador não deixou salvar (armazenamento cheio ou bloqueado). Exporte um backup."); }
  }

  async init({ seeds = [] } = {}) {
    this._mesclarSeeds(seeds);
    return this.user;
  }

  /* Seeds entram como cards oficiais aprovados. Uma seed que mudou só substitui
     a cópia local se a curadoria ainda não a editou. */
  _mesclarSeeds(seeds) {
    let mudou = false;
    for (const s of seeds) {
      const c = normalizeCard({ ...s, baralho: "oficial", status: "aprovado", autor_id: "r2a", autor_nome: "Road to America", origem: "seed" });
      if (!c.id) continue;
      const assinatura = contentSignature(c);
      const atual = this.db.cards[c.id];
      if (!atual) {
        this.db.cards[c.id] = c;
        this.db.seeds[c.id] = assinatura;
        mudou = true;
      } else if (atual.origem === "seed" && this.db.seeds[c.id] !== assinatura && contentSignature(atual) === this.db.seeds[c.id]) {
        this.db.cards[c.id] = { ...c, versao: (atual.versao || 1) + 1, criado_em: atual.criado_em };
        this.db.seeds[c.id] = assinatura;
        mudou = true;
      }
    }
    if (mudou) this._gravar();
  }

  get user() { return DEMO_USERS[this.db.papel] || DEMO_USERS.participante; }
  onAuthChange(cb) { this.ouvintes.add(cb); return () => this.ouvintes.delete(cb); }
  setDemoRole(papel) {
    if (!DEMO_USERS[papel]) return;
    this.db.papel = papel;
    this._gravar();
    this.ouvintes.forEach((cb) => cb(this.user));
  }
  async signIn() { return { ok: true }; }
  async signOut() {}

  /* ---------- Cards ---------- */
  async listCards() {
    const u = this.user;
    return Object.values(this.db.cards).filter((c) => canView(c, u)).map((c) => ({ ...c, tags: [...c.tags] }));
  }

  async getCard(id) {
    const c = this.db.cards[id];
    return c && canView(c, this.user) ? { ...c } : null;
  }

  _historico(c, acao) {
    this.db.historico.push({ id: uid("h"), card_id: c.id, versao: c.versao, acao, editor_id: this.user.id, dados: { ...c, tags: [...c.tags] }, criado_em: new Date().toISOString() });
  }

  async saveCard(input) {
    const u = this.user;
    const dados = normalizeCard(input);
    const old = dados.id ? this.db.cards[dados.id] : null;
    let final;
    if (!old) {
      final = applyInsertRules({ ...dados, id: dados.id || uid("u"), autor_nome: u.nome, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }, u);
      this.db.cards[final.id] = final;
      this._historico(final, "criado");
    } else {
      if (!canEdit(old, u)) throw new PermissionError("Você não pode editar este card.");
      const r = applyUpdateRules(old, dados, u);
      final = r.card;
      this.db.cards[final.id] = final;
      if (r.mudouConteudo || old.status !== final.status || old.baralho !== final.baralho) this._historico(final, r.mudouConteudo ? "editado" : "status");
    }
    this._gravar();
    return { ...final };
  }

  async deleteCard(id) {
    const c = this.db.cards[id];
    if (!c) return;
    if (!canDelete(c, this.user)) throw new PermissionError("Você não pode excluir este card.");
    delete this.db.cards[id];
    for (const est of Object.values(this.db.estados)) for (const k of Object.keys(est)) if (k.startsWith(id + "#")) delete est[k];
    this._gravar();
  }

  /* Curadoria: aprovar (com edição opcional) ou rejeitar com comentário */
  async reviewCard(id, { decisao, comentario = "", alteracoes = null, promover = false }) {
    const u = this.user;
    if (!isAdmin(u)) throw new PermissionError("Só administradores revisam cards.");
    const old = this.db.cards[id];
    if (!old) throw new Error("Card não encontrado.");
    if (decisao === "rejeitar" && !comentario.trim()) throw new Error("Explique o motivo da rejeição para o autor.");
    const base = alteracoes ? normalizeCard({ ...old, ...alteracoes, id }) : old;
    const prox = { ...base, status: decisao === "aprovar" ? "aprovado" : "rejeitado", revisor_id: u.id, comentario_revisao: comentario.trim() };
    if (promover && decisao === "aprovar") prox.baralho = "oficial";
    const r = applyUpdateRules(old, prox, u);
    this.db.cards[id] = r.card;
    this._historico(r.card, decisao === "aprovar" ? (promover ? "aprovado_oficial" : "aprovado") : "rejeitado");
    this._gravar();
    return { ...r.card };
  }

  async promoteCard(id) {
    const u = this.user;
    if (!isAdmin(u)) throw new PermissionError("Só administradores promovem cards.");
    const old = this.db.cards[id];
    if (!old) throw new Error("Card não encontrado.");
    const r = applyUpdateRules(old, { ...old, baralho: "oficial", status: "aprovado", revisor_id: u.id }, u);
    this.db.cards[id] = r.card;
    this._historico(r.card, "promovido");
    this._gravar();
    return { ...r.card };
  }

  async listHistory(cardId) {
    const c = this.db.cards[cardId];
    if (c && !canView(c, this.user)) return [];
    return this.db.historico.filter((h) => h.card_id === cardId).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  }

  /* Importação em lote. Admin escolhe o baralho; participante importa como pessoal. */
  async importCards(lista, { baralho = "pessoal" } = {}) {
    const u = this.user;
    let n = 0;
    for (const item of lista) {
      const dados = normalizeCard({ ...item, baralho: isAdmin(u) ? baralho : "pessoal", status: isAdmin(u) ? "aprovado" : "rascunho" });
      const existe = dados.id && this.db.cards[dados.id];
      if (existe && !canEdit(existe, u)) dados.id = "";
      await this.saveCard(dados);
      n++;
    }
    return n;
  }

  /* ---------- Estado SRS e revlog (sempre do usuário atual) ---------- */
  _estados() { return (this.db.estados[this.user.id] ||= {}); }
  _revlog() { return (this.db.revlog[this.user.id] ||= []); }

  async listStates() { return Object.values(this._estados()).map((s) => ({ ...s })); }
  async saveState(st) { this._estados()[st.key] = { ...st }; this._gravar(); }
  async saveStates(lista) { const e = this._estados(); for (const st of lista) e[st.key] = { ...st }; this._gravar(); }
  async deleteState(key) { delete this._estados()[key]; this._gravar(); }

  async addRevlog(entry) {
    const r = { ...entry, id: uid("r"), user_id: this.user.id };
    this._revlog().push(r);
    this._gravar();
    return r.id;
  }
  async deleteRevlog(id) {
    const l = this._revlog();
    const i = l.findIndex((r) => r.id === id);
    if (i >= 0) { l.splice(i, 1); this._gravar(); }
  }
  async listRevlog() { return this._revlog().map((r) => ({ ...r })); }

  /* ---------- Sinalizações de erro ---------- */
  async addFlag({ card_id, motivo, texto }) {
    if (!this.db.cards[card_id]) throw new Error("Card não encontrado.");
    const f = { id: uid("s"), card_id, motivo, texto: String(texto || "").trim(), autor_id: this.user.id, autor_nome: this.user.nome, status: "aberta", resposta: "", criado_em: new Date().toISOString(), resolvido_em: null };
    this.db.sinalizacoes.push(f);
    this._gravar();
    return { ...f };
  }
  async listFlags() {
    const u = this.user;
    return this.db.sinalizacoes.filter((f) => isAdmin(u) || f.autor_id === u.id).map((f) => ({ ...f }));
  }
  async resolveFlag(id, { status = "resolvida", resposta = "" } = {}) {
    if (!isAdmin(this.user)) throw new PermissionError("Só administradores resolvem sinalizações.");
    const f = this.db.sinalizacoes.find((x) => x.id === id);
    if (!f) return;
    Object.assign(f, { status, resposta, resolvido_em: new Date().toISOString(), revisor_id: this.user.id });
    this._gravar();
  }

  /* ---------- Configurações ---------- */
  async getSettings() { return { ...(this.db.configuracoes[this.user.id] || {}) }; }
  async saveSettings(s) { this.db.configuracoes[this.user.id] = { ...s }; this._gravar(); }

  /* ---------- Backup ---------- */
  async restoreBackup(o) {
    if (Array.isArray(o.estados)) { const e = this._estados(); for (const st of o.estados) if (st && st.key) e[st.key] = st; }
    if (Array.isArray(o.revlog)) { const ids = new Set(this._revlog().map((r) => r.id)); for (const r of o.revlog) if (r && !ids.has(r.id)) this._revlog().push({ ...r, user_id: this.user.id }); }
    if (o.configuracoes) this.db.configuracoes[this.user.id] = o.configuracoes;
    let n = 0;
    for (const c of o.cards || []) {
      if (c.autor_id === this.user.id && !this.db.cards[c.id]) { this.db.cards[c.id] = normalizeCard(c); n++; }
    }
    this._gravar();
    return n;
  }

  async resetDemo() {
    const papel = this.db.papel;
    this.db = { ...vazio(), papel };
    this._gravar();
  }
}
