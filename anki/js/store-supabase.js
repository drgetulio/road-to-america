/* Road to America | camada de dados com Supabase (login por link mágico).
   Mesma interface de store-local.js. As regras de permissão valem no banco
   (RLS e gatilhos de supabase/schema.sql); aqui só repetimos as checagens
   para dar mensagens melhores antes de chamar a API. */
import { normalizeCard } from "./cards.js";
import { isAdmin, PermissionError } from "./permissions.js";

const CAMPOS = ["tipo", "frente", "verso", "extra", "nota_pt", "sistema", "disciplina", "tags", "rendimento", "fonte"];
const PAGINA = 1000;

function carregarScript(src) {
  return new Promise((ok, falha) => {
    if (window.supabase?.createClient) return ok();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => falha(new Error("Não foi possível carregar a biblioteca do Supabase."));
    document.head.appendChild(s);
  });
}

function erroAmigavel(error) {
  if (!error) return null;
  const msg = error.message || String(error);
  if (error.code === "42501" || /row-level security|permission denied/i.test(msg)) return new PermissionError(msg.includes("row-level") ? "Sem permissão para esta ação." : msg);
  return new Error(msg);
}
function ok({ data, error }) {
  if (error) throw erroAmigavel(error);
  return data;
}

function linhaParaCard(r) {
  return normalizeCard({ ...r, tags: r.tags || [], comentario_revisao: r.comentario_revisao || "" });
}
function linhaParaEstado(r) {
  return {
    key: r.card_id + "#" + r.ord, card_id: r.card_id, ord: r.ord, due: r.due, stability: r.stability, difficulty: r.difficulty,
    elapsed_days: r.elapsed_days, scheduled_days: r.scheduled_days, reps: r.reps, lapses: r.lapses, learning_steps: r.learning_steps,
    state: r.state, last_review: r.last_review, suspenso: r.suspenso, leech: r.leech
  };
}

export class SupabaseStore {
  constructor({ url, anonKey, vendorUrl = "./vendor/supabase.umd.js" }) {
    this.mode = "supabase";
    this.url = url;
    this.anonKey = anonKey;
    this.vendorUrl = vendorUrl;
    this.client = null;
    this._user = null;
    this.ouvintes = new Set();
  }

  async init() {
    await carregarScript(this.vendorUrl);
    this.client = window.supabase.createClient(this.url, this.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
    });
    const { data } = await this.client.auth.getSession();
    if (data.session) await this._carregarPerfil(data.session.user);
    /* O supabase-js recomenda não aguardar chamadas à API dentro deste
       callback; a leitura do perfil vai para a próxima volta do laço. */
    this.client.auth.onAuthStateChange((evento, sessao) => {
      if (evento === "SIGNED_OUT" || !sessao) { this._user = null; this.ouvintes.forEach((cb) => cb(null)); return; }
      if (evento !== "SIGNED_IN" && evento !== "USER_UPDATED") return;
      if (this._user?.id === sessao.user.id && evento === "SIGNED_IN") return;
      setTimeout(async () => {
        await this._carregarPerfil(sessao.user);
        this.ouvintes.forEach((cb) => cb(this._user));
      }, 0);
    });
    return this._user;
  }

  async _carregarPerfil(authUser) {
    let { data, error } = await this.client.from("profiles").select("id, email, nome, papel").eq("id", authUser.id).maybeSingle();
    if (!error && !data) {
      const ins = await this.client.from("profiles").insert({ id: authUser.id, email: authUser.email, nome: (authUser.email || "").split("@")[0] }).select("id, email, nome, papel").single();
      data = ins.data;
    }
    this._user = { id: authUser.id, email: authUser.email, nome: data?.nome || authUser.email, papel: data?.papel === "admin" ? "admin" : "participante" };
  }

  get user() { return this._user; }
  onAuthChange(cb) { this.ouvintes.add(cb); return () => this.ouvintes.delete(cb); }
  setDemoRole() {}

  async signIn(email) {
    const redirect = location.origin + location.pathname;
    const { error } = await this.client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
    if (error) throw erroAmigavel(error);
    return { ok: true };
  }
  async signOut() { await this.client.auth.signOut(); }

  _exigeLogin() { if (!this._user) throw new PermissionError("Entre com seu e-mail para continuar."); return this._user; }

  /* Lê todas as páginas de uma consulta (o PostgREST limita a 1000 linhas) */
  async _todas(montar) {
    const out = [];
    for (let de = 0; ; de += PAGINA) {
      const rows = ok(await montar().range(de, de + PAGINA - 1));
      out.push(...rows);
      if (rows.length < PAGINA) break;
    }
    return out;
  }

  /* ---------- Cards ---------- */
  async listCards() {
    this._exigeLogin();
    const rows = await this._todas(() => this.client.from("cards").select("*").order("id"));
    return rows.map(linhaParaCard);
  }

  async getCard(id) {
    const r = ok(await this.client.from("cards").select("*").eq("id", id).maybeSingle());
    return r ? linhaParaCard(r) : null;
  }

  _payload(c) {
    const p = {};
    for (const k of CAMPOS) p[k] = c[k];
    return p;
  }

  async saveCard(input) {
    const u = this._exigeLogin();
    const c = normalizeCard(input);
    if (!input.id) {
      const row = { ...this._payload(c), baralho: c.baralho, status: c.baralho === "comunidade" ? (input.status === "rascunho" ? "rascunho" : "em_revisao") : "rascunho", autor_nome: u.nome || "" };
      if (isAdmin(u)) { row.status = input.status || (c.baralho === "pessoal" ? "rascunho" : "aprovado"); row.origem = c.origem || ""; }
      return linhaParaCard(ok(await this.client.from("cards").insert(row).select("*").single()));
    }
    const row = { ...this._payload(c), baralho: c.baralho, status: c.status };
    const r = ok(await this.client.from("cards").update(row).eq("id", c.id).select("*").maybeSingle());
    if (!r) throw new PermissionError("Você não pode editar este card.");
    return linhaParaCard(r);
  }

  async deleteCard(id) {
    this._exigeLogin();
    const r = ok(await this.client.from("cards").delete().eq("id", id).select("id"));
    if (!r.length) throw new PermissionError("Você não pode excluir este card.");
  }

  async reviewCard(id, { decisao, comentario = "", alteracoes = null, promover = false }) {
    const u = this._exigeLogin();
    if (!isAdmin(u)) throw new PermissionError("Só administradores revisam cards.");
    if (decisao === "rejeitar" && !comentario.trim()) throw new Error("Explique o motivo da rejeição para o autor.");
    const row = { status: decisao === "aprovar" ? "aprovado" : "rejeitado", revisor_id: u.id, comentario_revisao: comentario.trim() };
    if (alteracoes) Object.assign(row, this._payload(normalizeCard(alteracoes)));
    if (promover && decisao === "aprovar") row.baralho = "oficial";
    return linhaParaCard(ok(await this.client.from("cards").update(row).eq("id", id).select("*").single()));
  }

  async promoteCard(id) {
    const u = this._exigeLogin();
    if (!isAdmin(u)) throw new PermissionError("Só administradores promovem cards.");
    return linhaParaCard(ok(await this.client.from("cards").update({ baralho: "oficial", status: "aprovado", revisor_id: u.id }).eq("id", id).select("*").single()));
  }

  async listHistory(cardId) {
    const rows = ok(await this.client.from("card_historico").select("*").eq("card_id", cardId).order("criado_em", { ascending: false }));
    return rows.map((h) => ({ ...h, dados: linhaParaCard(h.dados) }));
  }

  async importCards(lista, { baralho = "pessoal" } = {}) {
    const u = this._exigeLogin();
    const admin = isAdmin(u);
    const rows = lista.map((item) => {
      const c = normalizeCard(item);
      const r = { ...this._payload(c), baralho: admin ? baralho : "pessoal", status: admin ? "aprovado" : "rascunho", autor_nome: admin && c.origem === "seed" ? "Road to America" : (u.nome || "") };
      if (admin && c.id) r.id = c.id;
      if (admin) r.origem = c.origem || "importacao";
      return r;
    });
    let n = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const lote = rows.slice(i, i + 200);
      const q = admin ? this.client.from("cards").upsert(lote, { onConflict: "id" }) : this.client.from("cards").insert(lote);
      ok(await q);
      n += lote.length;
    }
    return n;
  }

  /* ---------- Estado SRS e revlog ---------- */
  async listStates() {
    const u = this._exigeLogin();
    const rows = await this._todas(() => this.client.from("srs_estado").select("*").eq("user_id", u.id).order("card_id"));
    return rows.map(linhaParaEstado);
  }
  _linhaEstado(st) {
    const u = this._exigeLogin();
    return {
      user_id: u.id, card_id: st.card_id, ord: st.ord, due: st.due, stability: st.stability, difficulty: st.difficulty,
      elapsed_days: st.elapsed_days, scheduled_days: st.scheduled_days, reps: st.reps, lapses: st.lapses,
      learning_steps: st.learning_steps || 0, state: st.state, last_review: st.last_review, suspenso: !!st.suspenso, leech: !!st.leech,
      atualizado_em: new Date().toISOString()
    };
  }
  async saveState(st) { ok(await this.client.from("srs_estado").upsert(this._linhaEstado(st), { onConflict: "user_id,card_id,ord" })); }
  async saveStates(lista) {
    for (let i = 0; i < lista.length; i += 500) {
      ok(await this.client.from("srs_estado").upsert(lista.slice(i, i + 500).map((s) => this._linhaEstado(s)), { onConflict: "user_id,card_id,ord" }));
    }
  }
  async deleteState(key) {
    const u = this._exigeLogin();
    const i = key.lastIndexOf("#");
    ok(await this.client.from("srs_estado").delete().eq("user_id", u.id).eq("card_id", key.slice(0, i)).eq("ord", Number(key.slice(i + 1))));
  }

  async addRevlog(e) {
    const u = this._exigeLogin();
    const row = { user_id: u.id, card_id: e.card_id, ord: e.ord, rating: e.rating, state: e.state, due: e.due, stability: e.stability, difficulty: e.difficulty, elapsed_days: e.elapsed_days, last_elapsed_days: e.last_elapsed_days, scheduled_days: e.scheduled_days, review: e.review, duracao_ms: e.duracao_ms ?? null };
    return ok(await this.client.from("revlog").insert(row).select("id").single()).id;
  }
  async deleteRevlog(id) { ok(await this.client.from("revlog").delete().eq("id", id)); }
  async listRevlog() {
    const u = this._exigeLogin();
    return this._todas(() => this.client.from("revlog").select("*").eq("user_id", u.id).order("review"));
  }

  /* ---------- Sinalizações ---------- */
  async addFlag({ card_id, motivo, texto }) {
    const u = this._exigeLogin();
    return ok(await this.client.from("sinalizacoes").insert({ card_id, motivo, texto: String(texto || "").trim(), autor_nome: u.nome || "" }).select("*").single());
  }
  async listFlags() {
    this._exigeLogin();
    return ok(await this.client.from("sinalizacoes").select("*").order("criado_em", { ascending: false }));
  }
  async resolveFlag(id, { status = "resolvida", resposta = "" } = {}) {
    const u = this._exigeLogin();
    if (!isAdmin(u)) throw new PermissionError("Só administradores resolvem sinalizações.");
    ok(await this.client.from("sinalizacoes").update({ status, resposta, revisor_id: u.id, resolvido_em: new Date().toISOString() }).eq("id", id));
  }

  /* ---------- Configurações ---------- */
  async getSettings() {
    const u = this._exigeLogin();
    const r = ok(await this.client.from("configuracoes").select("dados").eq("user_id", u.id).maybeSingle());
    return r?.dados || {};
  }
  async saveSettings(s) {
    const u = this._exigeLogin();
    ok(await this.client.from("configuracoes").upsert({ user_id: u.id, dados: s, atualizado_em: new Date().toISOString() }, { onConflict: "user_id" }));
  }

  /* Backup: restaura estados, revlog e configurações do próprio usuário */
  async restoreBackup(o) {
    if (Array.isArray(o.estados)) await this.saveStates(o.estados.filter((s) => s && s.card_id));
    if (o.configuracoes) await this.saveSettings(o.configuracoes);
    let n = 0;
    if (Array.isArray(o.revlog)) for (const r of o.revlog) { try { await this.addRevlog(r); n++; } catch { /* card ausente */ } }
    return n;
  }
}
