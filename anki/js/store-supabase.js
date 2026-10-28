/* Road to America | camada de dados com Supabase (login por link mágico).
   Mesma interface de store-local.js. As regras de permissão valem no banco
   (RLS e gatilhos de supabase/schema.sql); aqui só repetimos as checagens
   para dar mensagens melhores antes de chamar a API.

   Plataforma (simulados, NBME, presença, plano e painel; detalhes em
   plataforma/INTERFACE.md): mesmos métodos de store-local.js. O painel do admin
   e o resumo do participante vêm das funções r2a_admin_resumo_participantes() e
   r2a_meu_resumo(), que devolvem a mesma linha de resumirParticipante().
   Numa página fora de anki/, passe vendorUrl apontando para
   anki/vendor/supabase.umd.js (por exemplo "../anki/vendor/supabase.umd.js").
   A sessão do Supabase fica no localStorage da origem e vale para todas as
   páginas do site. */
import { normalizeCard } from "./cards.js";
import { isAdmin, PermissionError } from "./permissions.js";
import { validarTentativa } from "../../plataforma/js/simulado.js";
import { validarNbme, normalizarNbme, parsePresencaCsv, mergeConfig } from "../../plataforma/js/desempenho.js";

const CAMPOS_SIMULADO = ["step", "modo", "questoes", "respostas", "marcadas", "tempos_ms", "inicio", "fim", "duracao_ms", "limite_ms", "total", "acertos", "em_branco", "por_sistema", "por_disciplina", "por_dificuldade", "encerramento", "versao_banco"];
const CAMPOS_PLANO = ["data_prova_step1", "data_prova_step2ck", "step1_aprovado", "step2ck_aprovado", "data_matricula", "ciclo_basico_concluido_em"];
function fusoHorario() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo"; } catch { return "America/Sao_Paulo"; }
}
function vazioPlano(userId) {
  return { user_id: userId, data_prova_step1: null, data_prova_step2ck: null, step1_aprovado: false, step2ck_aprovado: false, data_matricula: null, ciclo_basico_concluido_em: null };
}
function normalizarCampoPlano(k, v) {
  if (k.endsWith("_aprovado")) return !!v;
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Data inválida em " + k + " (use AAAA-MM-DD).");
  return s;
}
function linhaSimulado(r) {
  return { ...r, percentual: Number(r.percentual) };
}

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

  /* =====================================================================
     Plataforma: simulados, autoavaliações NBME, presença, plano e painel
     ===================================================================== */
  _exigeAdmin(msg = "Só administradores fazem isso.") {
    const u = this._exigeLogin();
    if (!isAdmin(u)) throw new PermissionError(msg);
    return u;
  }
  _filtroDono(q, { todos, userId }) {
    const u = this._exigeLogin();
    if (userId) return q.eq("user_id", userId);
    if (todos && isAdmin(u)) return q;
    return q.eq("user_id", u.id);
  }

  /* ---------- Simulados ---------- */
  async saveSimulado(t) {
    const u = this._exigeLogin();
    const erros = validarTentativa(t);
    if (erros.length) throw new Error(erros.join(" "));
    const row = { user_id: u.id };
    for (const k of CAMPOS_SIMULADO) if (t[k] !== undefined) row[k] = t[k];
    return linhaSimulado(ok(await this.client.from("simulados").insert(row).select("*").single()));
  }
  async listSimulados({ todos = false, userId = null, step = null } = {}) {
    const rows = await this._todas(() => {
      let q = this._filtroDono(this.client.from("simulados").select("*"), { todos, userId });
      if (step) q = q.eq("step", step);
      return q.order("fim", { ascending: false }).order("id");
    });
    return rows.map(linhaSimulado);
  }
  async deleteSimulado(id) {
    this._exigeAdmin("Só administradores excluem simulados.");
    const r = ok(await this.client.from("simulados").delete().eq("id", id).select("id"));
    if (!r.length) throw new PermissionError("Tentativa não encontrada ou sem permissão.");
  }

  /* ---------- Autoavaliações NBME ---------- */
  async saveNbme(x) {
    const u = this._exigeLogin();
    const erros = validarNbme(x);
    if (erros.length) throw new Error(erros.join(" "));
    const dados = normalizarNbme(x);
    if (!x.id) return ok(await this.client.from("nbme_autoavaliacoes").insert({ ...dados, user_id: u.id }).select("*").single());
    const r = ok(await this.client.from("nbme_autoavaliacoes").update(dados).eq("id", x.id).select("*").maybeSingle());
    if (!r) throw new PermissionError("Esta autoavaliação não pode ser alterada (já verificada ou de outra pessoa).");
    return r;
  }
  async listNbme({ todos = false, userId = null, step = null } = {}) {
    return this._todas(() => {
      let q = this._filtroDono(this.client.from("nbme_autoavaliacoes").select("*"), { todos, userId });
      if (step) q = q.eq("step", step);
      return q.order("data", { ascending: false }).order("id");
    });
  }
  async deleteNbme(id) {
    this._exigeLogin();
    const r = ok(await this.client.from("nbme_autoavaliacoes").delete().eq("id", id).select("id"));
    if (!r.length) throw new PermissionError("Esta autoavaliação não pode ser excluída (já verificada ou de outra pessoa).");
  }
  async verifyNbme(id, verificada = true) {
    this._exigeAdmin("Só administradores verificam autoavaliações.");
    return ok(await this.client.from("nbme_autoavaliacoes").update({ verificada: !!verificada }).eq("id", id).select("*").single());
  }

  /* ---------- Presença nas aulas ---------- */
  async getPresenca(userId = null) {
    const u = this._exigeLogin();
    return ok(await this.client.from("presenca").select("*").eq("user_id", userId || u.id).maybeSingle());
  }
  async listPresenca() {
    this._exigeAdmin();
    return this._todas(() => this.client.from("presenca").select("*").order("user_id"));
  }
  async setPresenca(userId, { aulas_assistidas, aulas_totais }, { origem = "manual" } = {}) {
    this._exigeAdmin("Só administradores lançam presença.");
    const a = Number(aulas_assistidas), t = Number(aulas_totais);
    if (!Number.isInteger(a) || !Number.isInteger(t) || a < 0 || t < 0) throw new Error("Use números inteiros não negativos.");
    if (a > t) throw new Error("Aulas assistidas não podem passar do total.");
    return ok(await this.client.from("presenca").upsert({ user_id: userId, aulas_assistidas: a, aulas_totais: t, origem }, { onConflict: "user_id" }).select("*").single());
  }
  async importPresencaCsv(texto) {
    this._exigeAdmin("Só administradores importam presença.");
    const { linhas, erros } = parsePresencaCsv(texto);
    if (!linhas.length) return { atualizados: 0, nao_encontrados: [], erros };
    const r = ok(await this.client.rpc("r2a_admin_importar_presenca", { p_linhas: linhas }));
    return { atualizados: r.atualizados, nao_encontrados: r.nao_encontrados || [], erros: erros.concat((r.erros || []).map((e) => ({ linha: null, ...e }))) };
  }

  /* ---------- Plano do participante ---------- */
  async getPlano(userId = null) {
    const u = this._exigeLogin();
    const alvo = userId || u.id;
    const r = ok(await this.client.from("plano_participante").select("*").eq("user_id", alvo).maybeSingle());
    return { ...vazioPlano(alvo), ...(r || {}) };
  }
  async savePlano(dados, userId = null) {
    const u = this._exigeLogin();
    const alvo = userId || u.id;
    if (alvo !== u.id && !isAdmin(u)) throw new PermissionError("Você só pode alterar o seu próprio plano.");
    const permitidos = isAdmin(u) ? CAMPOS_PLANO : ["data_prova_step1", "data_prova_step2ck"];
    const row = { user_id: alvo };
    for (const k of permitidos) if (k in (dados || {})) row[k] = normalizarCampoPlano(k, dados[k]);
    return ok(await this.client.from("plano_participante").upsert(row, { onConflict: "user_id" }).select("*").single());
  }

  /* ---------- Metas da coorte ---------- */
  async getConfigPlataforma() {
    this._exigeLogin();
    const r = ok(await this.client.from("plataforma_config").select("dados").eq("id", 1).maybeSingle());
    return mergeConfig(r?.dados || {});
  }
  async saveConfigPlataforma(c) {
    this._exigeAdmin("Só administradores alteram as metas.");
    const dados = mergeConfig(c);
    ok(await this.client.from("plataforma_config").upsert({ id: 1, dados, atualizado_em: new Date().toISOString() }, { onConflict: "id" }));
    return dados;
  }

  /* ---------- Anotações do mentor (só o admin lê e grava) ---------- */
  async getAnotacao(userId) {
    this._exigeAdmin("Só administradores veem as anotações do mentor.");
    return ok(await this.client.from("anotacoes_mentor").select("*").eq("user_id", userId).maybeSingle());
  }
  async saveAnotacao(userId, texto) {
    this._exigeAdmin("Só administradores escrevem anotações do mentor.");
    const t = String(texto ?? "");
    if (t.length > 5000) throw new Error("A anotação tem no máximo 5000 caracteres.");
    return ok(await this.client.from("anotacoes_mentor").upsert({ user_id: userId, texto: t }, { onConflict: "user_id" }).select("*").single());
  }

  /* ---------- Leitura agregada ---------- */
  async listParticipantes() {
    this._exigeAdmin("Só administradores veem a lista de participantes.");
    const rows = await this._todas(() => this.client.from("profiles").select("id, nome, email, papel, criado_em").eq("papel", "participante").order("nome"));
    return rows.map((r) => ({ ...r, sintetico: false }));
  }
  async getMeuResumo({ agora = new Date() } = {}) {
    this._exigeLogin();
    return ok(await this.client.rpc("r2a_meu_resumo", { p_tz: fusoHorario(), p_agora: new Date(agora).toISOString() }));
  }
  async listResumoParticipantes({ agora = new Date() } = {}) {
    this._exigeAdmin("Só administradores veem o painel de rendimento.");
    return ok(await this.client.rpc("r2a_admin_resumo_participantes", { p_tz: fusoHorario(), p_agora: new Date(agora).toISOString() })) || [];
  }
  async getAtividadeDiaria(userId = null, { dias = 182, agora = new Date() } = {}) {
    const u = this._exigeLogin();
    const alvo = userId || u.id;
    if (alvo !== u.id && !isAdmin(u)) throw new PermissionError("Sem permissão para ver a atividade de outra pessoa.");
    const rows = ok(await this.client.rpc("r2a_atividade_diaria", { p_user: alvo, p_dias: dias, p_tz: fusoHorario(), p_agora: new Date(agora).toISOString() })) || [];
    return rows.map((r) => ({ dia: String(r.dia).slice(0, 10), revisoes: r.revisoes, revisao_total: r.revisao_total, revisao_acertos: r.revisao_acertos }));
  }
}
