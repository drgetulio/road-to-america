/* Road to America | camada de dados do MODO DEMONSTRAÇÃO (localStorage).
   Mesma interface de store-supabase.js. Os dados ficam só neste navegador.

   Flashcards: listCards, getCard, saveCard, deleteCard, reviewCard, promoteCard,
   listHistory, importCards, listStates, saveState(s), deleteState, addRevlog,
   deleteRevlog, listRevlog, addFlag, listFlags, resolveFlag, getSettings,
   saveSettings, restoreBackup, resetDemo.

   Plataforma (simulados, NBME, presença, plano e painel do admin; detalhes em
   plataforma/INTERFACE.md):
     saveSimulado(t), listSimulados({ todos, userId, step }), deleteSimulado(id)
     saveNbme(x), listNbme({ todos, userId, step }), deleteNbme(id), verifyNbme(id, verificada)
     getPresenca(userId?), listPresenca(), setPresenca(userId, { aulas_assistidas, aulas_totais }),
     importPresencaCsv(texto)
     getPlano(userId?), savePlano(dados, userId?)
     getConfigPlataforma(), saveConfigPlataforma(c)
     listParticipantes(), getMeuResumo({ agora }), listResumoParticipantes({ agora, incluirSinteticos }),
     getAtividadeDiaria(userId, { dias, agora })
   No painel do admin, este modo junta o participante de demonstração (dados reais
   deste navegador) a uma COORTE SINTÉTICA gerada na memória por
   plataforma/js/coorte-demo.js (linhas com sintetico: true). A coorte não é
   gravada; só as edições do admin sobre ela ficam na chave CHAVE_COORTE. */
import { normalizeCard, contentSignature } from "./cards.js";
import { applyInsertRules, applyUpdateRules, canView, canDelete, canEdit, isAdmin, PermissionError } from "./permissions.js";
import { uid, dayKey } from "./util.js";
import { validarTentativa } from "../../plataforma/js/simulado.js";
import { resumirParticipante, validarNbme, normalizarNbme, parsePresencaCsv, mergeConfig, atividadeDiaria } from "../../plataforma/js/desempenho.js";
import { gerarCoorte, ehSintetico } from "../../plataforma/js/coorte-demo.js";

const CHAVE = "r2a-anki-demo-v1";
export const CHAVE_COORTE = "r2a-plataforma-coorte-v1";

export const DEMO_USERS = {
  admin: { id: "demo-admin", nome: "Administrador (demonstração)", email: "admin@demo.local", papel: "admin" },
  participante: { id: "demo-participante", nome: "Participante (demonstração)", email: "participante@demo.local", papel: "participante" }
};

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function vazio() {
  return {
    versao: 1, papel: "participante", cards: {}, historico: [], estados: {}, revlog: {}, sinalizacoes: [], configuracoes: {}, seeds: {},
    simulados: [], nbme: [], presenca: {}, planos: {}, plataforma: {}, anotacoes: {}
  };
}
function edicoesVazias() {
  return { nbme: {}, nbmeExcluidas: [], simuladosExcluidos: [], presenca: {}, planos: {}, anotacoes: {} };
}

export class LocalStore {
  constructor({ storage, bancosSimulado = null } = {}) {
    this.mode = "local";
    this.bancosSimulado = bancosSimulado;
    this._coorteCache = null;
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
    try { this.storage.removeItem(CHAVE_COORTE); } catch { /* sem armazenamento */ }
    this._coorteCache = null;
  }

  /* =====================================================================
     Plataforma: simulados, autoavaliações NBME, presença, plano e painel
     ===================================================================== */
  _exigeAdmin(msg = "Só administradores fazem isso.") { if (!isAdmin(this.user)) throw new PermissionError(msg); }

  _edicoes() {
    try { const raw = this.storage.getItem(CHAVE_COORTE); return raw ? { ...edicoesVazias(), ...JSON.parse(raw) } : edicoesVazias(); }
    catch { return edicoesVazias(); }
  }
  _gravarEdicoes(e) {
    try { this.storage.setItem(CHAVE_COORTE, JSON.stringify(e)); }
    catch { throw new Error("O navegador não deixou salvar (armazenamento cheio ou bloqueado)."); }
  }
  _oficiais() {
    return Object.values(this.db.cards).filter((c) => c.baralho === "oficial" && c.status === "aprovado").map((c) => c.id);
  }
  async _bancos() {
    if (this.bancosSimulado) return this.bancosSimulado;
    if (this._bancosPromessa) return this._bancosPromessa;
    this._bancosPromessa = (async () => {
      try {
        const ler = async (arq) => { const r = await fetch(new URL("../../simulado/data/" + arq, import.meta.url)); return r.ok ? r.json() : null; };
        const [step1, step2ck] = await Promise.all([ler("step1-questoes.json"), ler("step2ck-questoes.json")]);
        return step1 && step2ck ? { step1, step2ck } : null;
      } catch { return null; }
    })();
    return this._bancosPromessa;
  }
  /* Coorte sintética base (sem as edições do admin), cacheada por dia */
  async _coorteBase(agora = new Date()) {
    const oficiais = this._oficiais();
    const chave = dayKey(agora) + "|" + oficiais.length;
    if (this._coorteCache?.chave === chave) return this._coorteCache.dados;
    const dados = gerarCoorte({ agora, oficiais, bancos: await this._bancos() });
    this._coorteCache = { chave, dados };
    return dados;
  }
  /* Coorte com as edições do admin aplicadas */
  async _coorte(agora = new Date()) {
    const base = await this._coorteBase(agora);
    const ed = this._edicoes();
    const excl = new Set(ed.nbmeExcluidas);
    const simExcl = new Set(ed.simuladosExcluidos);
    return {
      ...base,
      nbme: base.nbme.filter((x) => !excl.has(x.id)).map((x) => (ed.nbme[x.id] ? { ...x, ...ed.nbme[x.id] } : { ...x })),
      simulados: base.simulados.filter((x) => !simExcl.has(x.id)),
      presenca: { ...base.presenca, ...ed.presenca },
      planos: Object.fromEntries(Object.entries(base.planos).map(([k, v]) => [k, { ...v, ...(ed.planos[k] || {}) }]))
    };
  }

  /* ---------- Simulados ---------- */
  async saveSimulado(t) {
    const u = this.user;
    const erros = validarTentativa(t);
    if (erros.length) throw new Error(erros.join(" "));
    const reg = {
      ...t, id: uid("sim"), user_id: u.id, criado_em: new Date().toISOString(),
      questoes: [...t.questoes], respostas: [...t.respostas], marcadas: [...t.marcadas], tempos_ms: [...t.tempos_ms],
      percentual: t.total ? t.acertos / t.total : 0
    };
    this.db.simulados.push(reg);
    this._gravar();
    return structuredClone(reg);
  }
  async listSimulados({ todos = false, userId = null, step = null } = {}) {
    const u = this.user;
    let lista = this.db.simulados.slice();
    if (isAdmin(u) && (todos || (userId && ehSintetico(userId)))) lista = lista.concat((await this._coorte()).simulados);
    if (!isAdmin(u)) lista = lista.filter((s) => s.user_id === u.id);
    else if (userId) lista = lista.filter((s) => s.user_id === userId);
    else if (!todos) lista = lista.filter((s) => s.user_id === u.id);
    if (step) lista = lista.filter((s) => s.step === step);
    return lista.sort((a, b) => String(b.fim).localeCompare(String(a.fim))).map((s) => structuredClone(s));
  }
  async deleteSimulado(id) {
    this._exigeAdmin("Só administradores excluem simulados.");
    if (ehSintetico(id)) { const ed = this._edicoes(); if (!ed.simuladosExcluidos.includes(id)) ed.simuladosExcluidos.push(id); this._gravarEdicoes(ed); return; }
    const i = this.db.simulados.findIndex((s) => s.id === id);
    if (i >= 0) { this.db.simulados.splice(i, 1); this._gravar(); }
  }

  /* ---------- Autoavaliações NBME ---------- */
  async saveNbme(x) {
    const u = this.user;
    const erros = validarNbme(x);
    if (erros.length) throw new Error(erros.join(" "));
    const dados = normalizarNbme(x);
    const agora = new Date().toISOString();
    if (!x.id) {
      const reg = { ...dados, id: uid("nbme"), user_id: u.id, verificada: false, verificada_por: null, verificada_em: null, criado_em: agora, atualizado_em: agora };
      this.db.nbme.push(reg);
      this._gravar();
      return { ...reg };
    }
    if (ehSintetico(x.id)) {
      this._exigeAdmin("Você só pode editar as suas autoavaliações.");
      const ed = this._edicoes();
      ed.nbme[x.id] = { ...(ed.nbme[x.id] || {}), ...dados, atualizado_em: agora };
      this._gravarEdicoes(ed);
      return (await this.listNbme({ userId: x.id.split("-nbme")[0] })).find((n) => n.id === x.id);
    }
    const old = this.db.nbme.find((n) => n.id === x.id);
    if (!old) throw new Error("Autoavaliação não encontrada.");
    if (!isAdmin(u)) {
      if (old.user_id !== u.id) throw new PermissionError("Você só pode editar as suas autoavaliações.");
      if (old.verificada) throw new PermissionError("Esta autoavaliação já foi verificada pela equipe e não pode mais ser alterada.");
    }
    Object.assign(old, dados, { atualizado_em: agora });
    this._gravar();
    return { ...old };
  }
  async listNbme({ todos = false, userId = null, step = null } = {}) {
    const u = this.user;
    let lista = this.db.nbme.slice();
    if (isAdmin(u) && (todos || (userId && ehSintetico(userId)))) lista = lista.concat((await this._coorte()).nbme);
    if (!isAdmin(u)) lista = lista.filter((n) => n.user_id === u.id);
    else if (userId) lista = lista.filter((n) => n.user_id === userId);
    else if (!todos) lista = lista.filter((n) => n.user_id === u.id);
    if (step) lista = lista.filter((n) => n.step === step);
    return lista.sort((a, b) => String(b.data).localeCompare(String(a.data))).map((n) => ({ ...n }));
  }
  async deleteNbme(id) {
    const u = this.user;
    if (ehSintetico(id)) {
      this._exigeAdmin("Você só pode excluir as suas autoavaliações.");
      const ed = this._edicoes(); if (!ed.nbmeExcluidas.includes(id)) ed.nbmeExcluidas.push(id); this._gravarEdicoes(ed); return;
    }
    const i = this.db.nbme.findIndex((n) => n.id === id);
    if (i < 0) return;
    const n = this.db.nbme[i];
    if (!isAdmin(u)) {
      if (n.user_id !== u.id) throw new PermissionError("Você só pode excluir as suas autoavaliações.");
      if (n.verificada) throw new PermissionError("Uma autoavaliação verificada só é excluída pela equipe.");
    }
    this.db.nbme.splice(i, 1);
    this._gravar();
  }
  async verifyNbme(id, verificada = true) {
    this._exigeAdmin("Só administradores verificam autoavaliações.");
    const patch = { verificada: !!verificada, verificada_por: verificada ? this.user.id : null, verificada_em: verificada ? new Date().toISOString() : null };
    if (ehSintetico(id)) {
      const ed = this._edicoes(); ed.nbme[id] = { ...(ed.nbme[id] || {}), ...patch }; this._gravarEdicoes(ed); return { id, ...patch };
    }
    const n = this.db.nbme.find((x) => x.id === id);
    if (!n) throw new Error("Autoavaliação não encontrada.");
    Object.assign(n, patch);
    this._gravar();
    return { ...n };
  }

  /* ---------- Presença nas aulas (só o admin lança) ---------- */
  async getPresenca(userId = null) {
    const u = this.user;
    const alvo = userId || u.id;
    if (alvo !== u.id && !isAdmin(u)) return null;
    if (ehSintetico(alvo)) return (await this._coorte()).presenca[alvo] || null;
    const p = this.db.presenca[alvo];
    return p ? { ...p } : null;
  }
  async listPresenca() {
    this._exigeAdmin();
    const c = await this._coorte();
    return [...Object.values(this.db.presenca), ...Object.values(c.presenca)].map((p) => ({ ...p }));
  }
  _validarPresenca({ aulas_assistidas, aulas_totais }) {
    const a = Number(aulas_assistidas), t = Number(aulas_totais);
    if (!Number.isInteger(a) || !Number.isInteger(t) || a < 0 || t < 0) throw new Error("Use números inteiros não negativos.");
    if (a > t) throw new Error("Aulas assistidas não podem passar do total.");
    return { a, t };
  }
  async setPresenca(userId, dados, { origem = "manual" } = {}) {
    this._exigeAdmin("Só administradores lançam presença.");
    const { a, t } = this._validarPresenca(dados);
    const reg = { user_id: userId, aulas_assistidas: a, aulas_totais: t, origem, atualizado_por: this.user.id, atualizado_em: new Date().toISOString() };
    if (ehSintetico(userId)) { const ed = this._edicoes(); ed.presenca[userId] = reg; this._gravarEdicoes(ed); }
    else { this.db.presenca[userId] = reg; this._gravar(); }
    return { ...reg };
  }
  async importPresencaCsv(texto) {
    this._exigeAdmin("Só administradores importam presença.");
    const { linhas, erros } = parsePresencaCsv(texto);
    const participantes = await this.listParticipantes();
    const porEmail = new Map(participantes.map((p) => [String(p.email).toLowerCase(), p]));
    let atualizados = 0;
    const nao_encontrados = [];
    for (const l of linhas) {
      const p = porEmail.get(l.email);
      if (!p) { nao_encontrados.push(l.email); continue; }
      await this.setPresenca(p.id, l, { origem: "csv" });
      atualizados++;
    }
    return { atualizados, nao_encontrados, erros };
  }

  /* ---------- Plano do participante (datas de prova, aprovação, matrícula) ---------- */
  async getPlano(userId = null) {
    const u = this.user;
    const alvo = userId || u.id;
    if (alvo !== u.id && !isAdmin(u)) return null;
    if (ehSintetico(alvo)) return { ...((await this._coorte()).planos[alvo] || {}) };
    return { ...vazioPlano(alvo), ...(this.db.planos[alvo] || {}) };
  }
  async savePlano(dados, userId = null) {
    const u = this.user;
    const alvo = userId || u.id;
    if (alvo !== u.id && !isAdmin(u)) throw new PermissionError("Você só pode alterar o seu próprio plano.");
    const permitidos = isAdmin(u) ? CAMPOS_PLANO : ["data_prova_step1", "data_prova_step2ck"];
    const patch = {};
    for (const k of permitidos) if (k in (dados || {})) patch[k] = normalizarCampoPlano(k, dados[k]);
    if (ehSintetico(alvo)) {
      const ed = this._edicoes(); ed.planos[alvo] = { ...(ed.planos[alvo] || {}), ...patch }; this._gravarEdicoes(ed);
      return this.getPlano(alvo);
    }
    this.db.planos[alvo] = { ...vazioPlano(alvo), ...(this.db.planos[alvo] || {}), ...patch, atualizado_em: new Date().toISOString() };
    this._gravar();
    return { ...this.db.planos[alvo] };
  }

  /* ---------- Parâmetros da coorte (metas e critérios de risco) ---------- */
  async getConfigPlataforma() { return mergeConfig(this.db.plataforma || {}); }
  async saveConfigPlataforma(c) {
    this._exigeAdmin("Só administradores alteram as metas.");
    this.db.plataforma = mergeConfig(c);
    this._gravar();
    return { ...this.db.plataforma };
  }

  /* ---------- Anotações do mentor (só o admin lê e grava) ----------
     Acréscimo da área administrativa (admin/): um texto livre por participante,
     de uso interno da equipe. */
  async getAnotacao(userId) {
    this._exigeAdmin("Só administradores veem as anotações do mentor.");
    const a = ehSintetico(userId) ? this._edicoes().anotacoes[userId] : this.db.anotacoes[userId];
    return a ? { ...a } : null;
  }
  async saveAnotacao(userId, texto) {
    this._exigeAdmin("Só administradores escrevem anotações do mentor.");
    const t = String(texto ?? "");
    if (t.length > LIMITE_ANOTACAO) throw new Error("A anotação tem no máximo " + LIMITE_ANOTACAO + " caracteres.");
    const reg = { user_id: userId, texto: t, atualizado_por: this.user.id, atualizado_em: new Date().toISOString() };
    if (ehSintetico(userId)) { const ed = this._edicoes(); ed.anotacoes[userId] = reg; this._gravarEdicoes(ed); }
    else { this.db.anotacoes[userId] = reg; this._gravar(); }
    return { ...reg };
  }

  /* ---------- Leitura agregada ---------- */
  async listParticipantes({ incluirSinteticos = true } = {}) {
    this._exigeAdmin("Só administradores veem a lista de participantes.");
    const p = DEMO_USERS.participante;
    const reais = [{ id: p.id, nome: p.nome, email: p.email, papel: "participante", criado_em: this.db.criado_em || null, sintetico: false }];
    if (!incluirSinteticos) return reais;
    const c = await this._coorte();
    return reais.concat(c.participantes.map((x) => ({ id: x.id, nome: x.nome, email: x.email, papel: x.papel, criado_em: x.criado_em, sintetico: true, perfil_demo: x.perfil_demo })));
  }
  _resumoReal(perfil, agora) {
    const id = perfil.id;
    return resumirParticipante({
      perfil,
      revlog: this.db.revlog[id] || [],
      estados: Object.values(this.db.estados[id] || {}),
      oficiais: this._oficiais(),
      simulados: this.db.simulados.filter((s) => s.user_id === id),
      nbme: this.db.nbme.filter((n) => n.user_id === id),
      presenca: this.db.presenca[id] || null,
      plano: this.db.planos[id] || null,
      configuracoes: this.db.configuracoes[id] || null,
      agora
    });
  }
  async getMeuResumo({ agora = new Date() } = {}) {
    const u = this.user;
    return this._resumoReal({ id: u.id, nome: u.nome, email: u.email, criado_em: this.db.criado_em || null }, agora);
  }
  async listResumoParticipantes({ agora = new Date(), incluirSinteticos = true } = {}) {
    this._exigeAdmin("Só administradores veem o painel de rendimento.");
    const p = DEMO_USERS.participante;
    const linhas = [this._resumoReal({ id: p.id, nome: p.nome, email: p.email, criado_em: this.db.criado_em || null }, agora)];
    if (!incluirSinteticos) return linhas;
    const c = await this._coorte(agora);
    for (const x of c.participantes) {
      linhas.push(resumirParticipante({
        perfil: x, revlog: c.revlog[x.id], estados: c.estados[x.id], oficiais: c.oficiais,
        simulados: c.simulados.filter((s) => s.user_id === x.id), nbme: c.nbme.filter((n) => n.user_id === x.id),
        presenca: c.presenca[x.id], plano: c.planos[x.id], sintetico: true, agora
      }));
    }
    return linhas;
  }
  /* Revisões por dia (admin: qualquer participante; participante: só ele) */
  async getAtividadeDiaria(userId = null, { dias = 182, agora = new Date() } = {}) {
    const u = this.user;
    const alvo = userId || u.id;
    if (alvo !== u.id && !isAdmin(u)) throw new PermissionError("Sem permissão para ver a atividade de outra pessoa.");
    const revlog = ehSintetico(alvo) ? ((await this._coorte(agora)).revlog[alvo] || []) : (this.db.revlog[alvo] || []);
    return atividadeDiaria(revlog, { dias, agora });
  }
}

export const LIMITE_ANOTACAO = 5000;
const CAMPOS_PLANO = ["data_prova_step1", "data_prova_step2ck", "step1_aprovado", "step2ck_aprovado", "data_matricula", "ciclo_basico_concluido_em"];
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
