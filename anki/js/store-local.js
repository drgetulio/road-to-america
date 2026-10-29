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
   Banco de questões (plataforma/INTERFACE.md, seção "Banco de questões"):
     listQuestoes({ step, incluirInativas }), setStatusQuestao(id, status, { motivo }), salvarCalibracao(itens),
     setAtivo(userId, ativo), editarGabarito(id, { correta, motivo, recorrigir }),
     marcarRevisaoQuestao(id, { revisao, nota }), listHistoricoQuestao(id)
     saveRespostas(lista), saveResposta(r), listRespostas({ step, origem, desde, userId, todos })
     criarSimuladoCompleto({ formulario, sessao }), salvarProgressoSimulado(id, sessao),
     concluirSimuladoCompleto(id, { sessao, resultado }), abandonarSimuladoCompleto(id),
     getSimuladoCompleto(id), listSimuladosCompletos({ todos, userId, step, estado }), deleteSimuladoCompleto(id)
     getAnotacaoItem(questaoId), saveAnotacaoItem(questaoId, texto), listAnotacoesItem()
     reportarItem({ questao_id, motivo, texto }), listReportes({ todos, status, questaoId }), resolverReporte(id, { status, resposta })
     saveResultadoOficial(x), listResultadosOficiais({ todos, userId, step }), deleteResultadoOficial(id)
     listRespostasCalibracao({ step, incluirTutor, todasVersoes }), getEstatisticasItens({ step, incluirTutor, todasVersoes })
     getModelosPsicometricos(), saveModeloPsicometrico(step, dados)
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
import { lerBancoDemo, normalizarItem } from "../../plataforma/js/banco.js";
import { analisarItens } from "../../plataforma/js/psicometria.js";
import { gerarRespostasDemo, gerarDesfechosDemo, gerarReportesDemo, modeloVerdadeiro } from "../../plataforma/js/respostas-demo.js";
import {
  normalizarResposta, validarResposta, validarFormularioGravado, validarSessao, validarProgresso,
  validarAnotacaoItem, validarReporte, validarResultadoOficial, normalizarResultadoOficial, validarCalibracao,
  STATUS_REPORTE, ESTADOS_SIMULADO
} from "../../plataforma/js/registros.js";

const CHAVE = "r2a-anki-demo-v1";
export const CHAVE_COORTE = "r2a-plataforma-coorte-v1";

export const DEMO_USERS = {
  admin: { id: "demo-admin", nome: "Administrador (demonstração)", email: "admin@demo.local", papel: "admin", ativo: true },
  participante: { id: "demo-participante", nome: "Participante (demonstração)", email: "participante@demo.local", papel: "participante", ativo: true }
};

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function vazio() {
  return {
    versao: 1, papel: "participante", cards: {}, historico: [], estados: {}, revlog: {}, sinalizacoes: [], configuracoes: {}, seeds: {},
    simulados: [], nbme: [], presenca: {}, planos: {}, plataforma: {}, anotacoes: {},
    respostas: [], simuladosCompletos: [], anotacoesItem: {}, reportes: [], resultadosOficiais: [],
    calibracao: {}, statusQuestoes: {}, ativos: {}, modelos: {},
    questoesEdicoes: {}, historicoQuestoes: [], reportesDemo: {}
  };
}
function edicoesVazias() {
  return { nbme: {}, nbmeExcluidas: [], simuladosExcluidos: [], presenca: {}, planos: {}, anotacoes: {} };
}

export class LocalStore {
  constructor({ storage, bancosSimulado = null, questoes = null } = {}) {
    this.mode = "local";
    this.bancosSimulado = bancosSimulado;
    this.questoesInjetadas = questoes;
    this.ultimaLeituraQuestoes = null;
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

  get user() {
    const u = DEMO_USERS[this.db.papel] || DEMO_USERS.participante;
    return { ...u, ativo: this._ativo(u.id) };
  }
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
    const reais = [{ id: p.id, nome: p.nome, email: p.email, papel: "participante", criado_em: this.db.criado_em || null, sintetico: false, ativo: this._ativo(p.id) }];
    if (!incluirSinteticos) return reais;
    const c = await this._coorte();
    return reais.concat(c.participantes.map((x) => ({ id: x.id, nome: x.nome, email: x.email, papel: x.papel, criado_em: x.criado_em, sintetico: true, perfil_demo: x.perfil_demo, ativo: true })));
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
      respostas: (this.db.respostas || []).filter((r) => r.user_id === id),
      simuladosCompletos: (this.db.simuladosCompletos || []).filter((s) => s.user_id === id),
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

  /* =====================================================================
     Banco de questões: itens, respostas por item, simulados completos,
     anotações do aluno, reportes de erro, resultados oficiais e leituras
     agregadas do admin (plataforma/INTERFACE.md)
     ===================================================================== */
  /* No modo demonstração, todo participante tem matrícula ativa, salvo se o admin
     desativar (a chave fica em db.ativos) */
  _ativo(userId) { return this.db?.ativos?.[userId] !== false; }

  async _questoesBrutas() {
    if (this.questoesInjetadas) { this.ultimaLeituraQuestoes = { fontes: [], privado: false }; return this.questoesInjetadas; }
    if (!this._questoesPromessa) {
      this._questoesPromessa = lerBancoDemo().then((r) => { this.ultimaLeituraQuestoes = { fontes: r.fontes, privado: r.privado }; return r.itens; })
        .catch((e) => { this._questoesPromessa = null; throw e; });
    }
    return this._questoesPromessa;
  }
  /* Itens com as correções de gabarito do admin aplicadas (o arquivo original não muda;
     a correção sobe a versão do item, como o gatilho questoes_guard do banco) */
  async _questoesVigentes() {
    const brutas = await this._questoesBrutas();
    const ed = this.db.questoesEdicoes || {};
    const chave = JSON.stringify(ed);
    if (this._vigentesCache?.fonte === brutas && this._vigentesCache.chave === chave) return this._vigentesCache.itens;
    const itens = brutas.map((q) => { const x = ed[q.id]; return x && x.correta ? { ...q, correta: x.correta, versao: x.versao } : q; });
    this._vigentesCache = { fonte: brutas, chave, itens };
    return itens;
  }
  async _gabarito() {
    const brutas = await this._questoesVigentes();
    if (this._gabaritoCache?.fonte === brutas) return this._gabaritoCache.mapa;
    const mapa = new Map();
    for (const b of brutas) { const q = normalizarItem(b); if (q.id) mapa.set(q.id, q); }
    this._gabaritoCache = { fonte: brutas, mapa };
    return mapa;
  }

  async listQuestoes({ step = null, incluirInativas = false } = {}) {
    const u = this.user;
    const admin = isAdmin(u);
    if (!admin && !this._ativo(u.id)) return [];
    const out = [];
    const ed = this.db.questoesEdicoes || {};
    for (const q of await this._questoesVigentes()) {
      const norm = normalizarItem(q);
      if (step && norm.step !== step) continue;
      const status = this.db.statusQuestoes[q.id] || q.status || "ativo";
      if (status !== "ativo" && !(admin && incluirInativas)) continue;
      const cal = this.db.calibracao[q.id];
      const rev = admin ? { em_revisao: !!ed[q.id]?.em_revisao, revisao_nota: ed[q.id]?.revisao_nota || "" } : {};
      out.push({ ...structuredClone(q), status, ...rev, ...(cal ? { b_calibrado: cal.b, ep_calibrado: cal.ep, n_calibracao: cal.n, calibrado_em: cal.em } : {}) });
    }
    return out;
  }
  async _itemVigente(id) {
    const q = (await this._gabarito()).get(id);
    if (!q) throw new Error("Questão não encontrada.");
    return q;
  }
  _historicoQuestao(questao_id, versao, acao, de, para, motivo, extra = {}) {
    const reg = { id: uid("qh"), questao_id, versao, acao, de: de ?? null, para: para ?? null, motivo: String(motivo || "").trim(), recorrigidas: null, editor_id: this.user.id, criado_em: new Date().toISOString(), ...extra };
    this.db.historicoQuestoes.push(reg);
    return reg;
  }
  async setStatusQuestao(id, status, { motivo = "" } = {}) {
    this._exigeAdmin("Só administradores mudam o status de uma questão.");
    if (!["ativo", "rascunho", "suspenso", "aposentado"].includes(status)) throw new Error("Status inválido.");
    if (String(motivo).length > 1000) throw new Error("O motivo tem no máximo 1000 caracteres.");
    const q = await this._itemVigente(id);
    const antes = this.db.statusQuestoes[id] || "ativo";
    this.db.statusQuestoes[id] = status;
    if (antes !== status) this._historicoQuestao(id, q.versao, "status", antes, status, motivo);
    this._gravar();
    return { id, status };
  }
  /* Correção de gabarito com registro de versão: a versão do item sobe, a calibração
     dele é apagada e, com recorrigir, as respostas já gravadas são corrigidas de novo
     pela alternativa nova (no Supabase: r2a_admin_editar_gabarito). */
  async editarGabarito(id, { correta, motivo = "", recorrigir = true } = {}) {
    this._exigeAdmin("Só administradores editam o gabarito.");
    const q = await this._itemVigente(id);
    const letra = String(correta || "").trim().toUpperCase();
    const m = String(motivo || "").trim();
    if (m.length < 5 || m.length > 1000) throw new Error("Explique o motivo da mudança (de 5 a 1000 caracteres).");
    if (!q.alternativas.some((a) => a.letra === letra)) throw new Error("A resposta correta não está entre as alternativas.");
    if (letra === q.correta) throw new Error("A alternativa escolhida já é o gabarito.");
    const versao = (q.versao || 1) + 1;
    const ed = (this.db.questoesEdicoes[id] ||= {});
    Object.assign(ed, { correta: letra, versao });
    delete this.db.calibracao[id];
    let recorrigidas = 0;
    if (recorrigir) {
      for (const r of this.db.respostas) {
        if (r.questao_id !== id) continue;
        /* só as respostas da versão em vigor (o mesmo conteúdo): respostas de uma
           versão de conteúdo anterior continuam fora */
        if (r.versao_item !== null && r.versao_item !== undefined && r.versao_item !== (q.versao || 1)) continue;
        r.correta = r.resposta !== null && r.resposta === letra;
        r.versao_item = versao;
        recorrigidas++;
      }
    }
    this._historicoQuestao(id, versao, "gabarito", q.correta, letra, m, { recorrigidas: recorrigir ? recorrigidas : null });
    this._gravar();
    return { id, versao, de: q.correta, para: letra, recorrigidas };
  }
  /* Marca para revisão: o item continua no banco (e na estimativa dos alunos) até
     a equipe decidir; retirar do banco é setStatusQuestao(id, "suspenso"). */
  async marcarRevisaoQuestao(id, { revisao = true, nota = "" } = {}) {
    this._exigeAdmin("Só administradores marcam itens para revisão.");
    const q = await this._itemVigente(id);
    const n = String(nota || "").trim();
    if (n.length > 1000) throw new Error("A nota tem no máximo 1000 caracteres.");
    const ed = (this.db.questoesEdicoes[id] ||= {});
    const antes = !!ed.em_revisao;
    ed.em_revisao = !!revisao;
    ed.revisao_nota = revisao ? n : "";
    if (antes !== !!revisao || revisao) this._historicoQuestao(id, q.versao, "revisao", antes ? "sim" : "nao", revisao ? "sim" : "nao", n);
    this._gravar();
    return { id, em_revisao: !!revisao, revisao_nota: ed.revisao_nota };
  }
  async listHistoricoQuestao(id = null) {
    this._exigeAdmin("Só administradores leem o histórico das questões.");
    return this.db.historicoQuestoes.filter((h) => !id || h.questao_id === id).sort((a, b) => a.criado_em.localeCompare(b.criado_em) || (a.id < b.id ? -1 : 1)).map((h) => ({ ...h }));
  }
  /* itens: [{ id, b, ep, n }]; b = null apaga a calibração do item */
  async salvarCalibracao(itens) {
    this._exigeAdmin("Só administradores gravam a calibração.");
    const lista = (itens || []).filter((x) => x && x.b !== null);
    const erros = lista.length ? validarCalibracao(lista) : [];
    if (erros.length) throw new Error(erros.join(" "));
    const em = new Date().toISOString();
    for (const it of itens || []) {
      if (it.b === null) delete this.db.calibracao[it.id];
      else this.db.calibracao[it.id] = { b: Number(it.b), ep: Number.isFinite(it.ep) ? Number(it.ep) : null, n: Number.isInteger(it.n) ? it.n : 0, em };
    }
    this._gravar();
    return { gravados: (itens || []).length };
  }
  async setAtivo(userId, ativo) {
    this._exigeAdmin("Só administradores ativam matrículas.");
    if (ehSintetico(userId)) throw new Error("Participantes fictícios ficam sempre ativos.");
    this.db.ativos[userId] = !!ativo;
    this._gravar();
    return { id: userId, ativo: !!ativo };
  }

  /* ---------- respostas por item ---------- */
  async saveRespostas(lista) {
    const u = this.user;
    const gab = await this._gabarito();
    const agora = new Date().toISOString();
    const regs = [];
    for (const r of Array.isArray(lista) ? lista : [lista]) {
      const n = normalizarResposta(r);
      const g = gab.get(n.questao_id);
      /* como no banco: com o item no banco, o gabarito, o Step e a versão vêm de lá */
      if (g) { n.step = g.step; n.correta = n.resposta !== null && n.resposta === g.correta; n.versao_item = g.versao; }
      const e = validarResposta(n);
      if (e.length) throw new Error(e.join(" "));
      regs.push({ ...n, id: uid("ri"), user_id: u.id, criado_em: agora });
    }
    this.db.respostas.push(...regs);
    this._gravar();
    return structuredClone(regs);
  }
  async saveResposta(r) { return (await this.saveRespostas([r]))[0]; }
  /* Dados fictícios da demonstração (respostas, desfechos e reportes), gerados na
     memória a cada dia por respostas-demo.js. As respostas seguem o gabarito em
     vigor (uma correção do admin vale também para elas). */
  async _demo(agora = new Date()) {
    const brutas = await this._questoesBrutas();
    const corr = Object.entries(this.db.questoesEdicoes || {}).filter(([, x]) => x.correta);
    const chave = dayKey(agora) + "|" + brutas.length + "|" + JSON.stringify(corr.map(([id, x]) => [id, x.correta, x.versao]));
    if (this._demoCache?.chave === chave && this._demoCache.fonte === brutas) return this._demoCache.dados;
    const modelo = this._modeloDemo?.fonte === brutas ? this._modeloDemo.modelo : (this._modeloDemo = { fonte: brutas, modelo: modeloVerdadeiro(brutas) }).modelo;
    const gabaritos = new Map(corr.map(([id, x]) => [id, { correta: x.correta, versao: x.versao }]));
    const respostas = gerarRespostasDemo({ itens: brutas, agora, gabaritos, modelo });
    const dados = { respostas, desfechos: gerarDesfechosDemo({ itens: brutas, respostas, agora }), reportes: gerarReportesDemo({ itens: brutas, agora, modelo }) };
    this._demoCache = { chave, fonte: brutas, dados };
    return dados;
  }
  async _respostasSinteticas(agora = new Date()) { return (await this._demo(agora)).respostas; }
  /* Defeito plantado no item pela simulação da demonstração (ou null), para a ficha
     do item avisar que o problema é da simulação e não do item público */
  async _defeitoDemo(id) {
    const brutas = await this._questoesBrutas();
    if (this._modeloDemo?.fonte !== brutas) this._modeloDemo = { fonte: brutas, modelo: modeloVerdadeiro(brutas) };
    const m = this._modeloDemo.modelo.get(id);
    return m?.defeito ? { defeito: m.defeito, chave_simulada: m.chave_verdadeira } : null;
  }
  async listRespostas({ step = null, origem = null, desde = null, userId = null, todos = false } = {}) {
    const u = this.user;
    let lista = this.db.respostas.slice();
    if (isAdmin(u) && (todos || (userId && ehSintetico(userId)))) lista = lista.concat(await this._respostasSinteticas());
    if (!isAdmin(u)) lista = lista.filter((r) => r.user_id === u.id);
    else if (userId) lista = lista.filter((r) => r.user_id === userId);
    else if (!todos) lista = lista.filter((r) => r.user_id === u.id);
    if (step) lista = lista.filter((r) => r.step === step);
    if (origem) lista = lista.filter((r) => r.origem === origem);
    if (desde) { const d = Date.parse(desde); lista = lista.filter((r) => Date.parse(r.respondida_em) >= d); }
    return lista.sort((a, b) => String(a.respondida_em).localeCompare(String(b.respondida_em))).map((r) => ({ ...r }));
  }

  /* ---------- simulados completos ---------- */
  _simCompleto(id) {
    const s = this.db.simuladosCompletos.find((x) => x.id === id);
    if (!s) throw new Error("Simulado não encontrado.");
    const u = this.user;
    if (s.user_id !== u.id && !isAdmin(u)) throw new PermissionError("Você só acessa os seus simulados.");
    return s;
  }
  async criarSimuladoCompleto({ formulario, sessao }) {
    const u = this.user;
    const e = validarFormularioGravado(formulario).concat(formulario ? validarSessao(formulario, sessao) : []);
    if (e.length) throw new Error(e.join(" "));
    const agora = new Date().toISOString();
    const reg = {
      id: uid("sc"), user_id: u.id, step: formulario.step, tipo: formulario.tipo, montagem: formulario.modo === "personalizado" ? "personalizado" : "fixo",
      formulario_id: String(formulario.id), nome: String(formulario.nome || "").slice(0, 120), reduzido: !!formulario.reduzido,
      formulario: structuredClone(formulario), sessao: structuredClone(sessao), estado: "em_andamento", bloco_atual: sessao.bloco_atual,
      resultado: null, inicio: agora, atualizado_em: agora, fim: null, criado_em: agora
    };
    this.db.simuladosCompletos.push(reg);
    this._gravar();
    return structuredClone(reg);
  }
  _atualizarSimCompleto(id, sessao, patch = {}) {
    const s = this._simCompleto(id);
    const admin = isAdmin(this.user);
    if (s.estado !== "em_andamento" && !admin) throw new PermissionError("Simulado encerrado não pode ser alterado.");
    if (sessao) {
      const e = validarSessao(s.formulario, sessao).concat(admin ? [] : validarProgresso(s.sessao, sessao));
      if (e.length) throw new Error(e.join(" "));
      s.sessao = structuredClone(sessao);
      s.bloco_atual = sessao.bloco_atual;
    }
    Object.assign(s, patch, { atualizado_em: new Date().toISOString() });
    this._gravar();
    return structuredClone(s);
  }
  async salvarProgressoSimulado(id, sessao) { return this._atualizarSimCompleto(id, sessao); }
  async concluirSimuladoCompleto(id, { sessao = null, resultado = null } = {}) {
    return this._atualizarSimCompleto(id, sessao, { estado: "concluido", resultado: resultado ? structuredClone(resultado) : null, fim: new Date().toISOString() });
  }
  async abandonarSimuladoCompleto(id) { return this._atualizarSimCompleto(id, null, { estado: "abandonado", fim: new Date().toISOString() }); }
  async getSimuladoCompleto(id) {
    try { return structuredClone(this._simCompleto(id)); } catch (e) { if (e instanceof PermissionError) return null; if (/não encontrado/.test(e.message)) return null; throw e; }
  }
  async listSimuladosCompletos({ todos = false, userId = null, step = null, estado = null } = {}) {
    const u = this.user;
    let lista = this.db.simuladosCompletos.slice();
    if (!isAdmin(u)) lista = lista.filter((s) => s.user_id === u.id);
    else if (userId) lista = lista.filter((s) => s.user_id === userId);
    else if (!todos) lista = lista.filter((s) => s.user_id === u.id);
    if (step) lista = lista.filter((s) => s.step === step);
    if (estado) {
      if (!ESTADOS_SIMULADO.includes(estado)) throw new Error("Estado inválido.");
      lista = lista.filter((s) => s.estado === estado);
    }
    return lista.sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em))).map((s) => structuredClone(s));
  }
  async deleteSimuladoCompleto(id) {
    this._exigeAdmin("Só administradores excluem simulados.");
    const i = this.db.simuladosCompletos.findIndex((s) => s.id === id);
    if (i >= 0) { this.db.simuladosCompletos.splice(i, 1); this._gravar(); }
  }

  /* ---------- anotações do aluno por item (só o próprio aluno lê e grava) ---------- */
  async getAnotacaoItem(questaoId) {
    const a = this.db.anotacoesItem[this.user.id]?.[questaoId];
    return a ? { ...a } : null;
  }
  async saveAnotacaoItem(questaoId, texto) {
    const e = validarAnotacaoItem(questaoId, texto);
    if (e.length) throw new Error(e.join(" "));
    const u = this.user;
    const m = (this.db.anotacoesItem[u.id] ||= {});
    const t = String(texto ?? "");
    if (!t.trim()) { delete m[questaoId]; this._gravar(); return null; }
    m[questaoId] = { user_id: u.id, questao_id: questaoId, texto: t, atualizado_em: new Date().toISOString() };
    this._gravar();
    return { ...m[questaoId] };
  }
  async listAnotacoesItem() {
    return Object.values(this.db.anotacoesItem[this.user.id] || {}).map((a) => ({ ...a })).sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  }

  /* ---------- reportes de erro em item (fila do admin) ---------- */
  async reportarItem({ questao_id, motivo, texto = "" }) {
    const e = validarReporte({ questao_id, motivo, texto });
    if (e.length) throw new Error(e.join(" "));
    const u = this.user;
    const g = (await this._gabarito()).get(questao_id);
    const reg = { id: uid("rep"), user_id: u.id, autor_nome: u.nome, questao_id, versao_item: g?.versao ?? null, motivo, texto: String(texto).trim(), status: "aberto", resposta: "", resolvido_por: null, resolvido_em: null, criado_em: new Date().toISOString() };
    this.db.reportes.push(reg);
    this._gravar();
    return { ...reg };
  }
  async listReportes({ todos = false, status = null, questaoId = null } = {}) {
    const u = this.user;
    let lista = this.db.reportes.slice();
    if (!isAdmin(u) || !todos) lista = lista.filter((r) => r.user_id === u.id);
    else lista = lista.concat((await this._demo()).reportes.map((r) => ({ ...r, ...(this.db.reportesDemo[r.id] || {}) })));
    if (status) lista = lista.filter((r) => r.status === status);
    if (questaoId) lista = lista.filter((r) => r.questao_id === questaoId);
    return lista.sort((a, b) => b.criado_em.localeCompare(a.criado_em)).map((r) => ({ ...r }));
  }
  async resolverReporte(id, { status = "resolvido", resposta = "" } = {}) {
    this._exigeAdmin("Só administradores tratam reportes.");
    if (!STATUS_REPORTE.includes(status)) throw new Error("Status inválido.");
    if (String(resposta).length > 2000) throw new Error("A resposta tem no máximo 2000 caracteres.");
    const fecha = status === "resolvido" || status === "rejeitado";
    const fict = (await this._demo()).reportes.find((x) => x.id === id);
    if (fict) {
      this.db.reportesDemo[id] = { status, resposta: String(resposta), resolvido_por: fecha ? this.user.id : null, resolvido_em: fecha ? new Date().toISOString() : null };
      this._gravar();
      return { ...fict, ...this.db.reportesDemo[id] };
    }
    const r = this.db.reportes.find((x) => x.id === id);
    if (!r) throw new Error("Reporte não encontrado.");
    Object.assign(r, { status, resposta: String(resposta), resolvido_por: fecha ? this.user.id : null, resolvido_em: fecha ? new Date().toISOString() : null });
    this._gravar();
    return { ...r };
  }

  /* ---------- resultados oficiais (desfechos para a calibração) ---------- */
  async saveResultadoOficial(x) {
    this._exigeAdmin("Só administradores lançam resultados oficiais.");
    const e = validarResultadoOficial(x);
    if (e.length) throw new Error(e.join(" "));
    const dados = normalizarResultadoOficial(x);
    const agora = new Date().toISOString();
    if (x.id) {
      if (String(x.id).startsWith("demo-res-")) throw new Error("Desfecho fictício da demonstração não pode ser alterado.");
      const old = this.db.resultadosOficiais.find((r) => r.id === x.id);
      if (!old) throw new Error("Resultado não encontrado.");
      Object.assign(old, dados, { atualizado_em: agora });
      this._gravar();
      return { ...old };
    }
    const reg = { ...dados, id: uid("res"), registrado_por: this.user.id, criado_em: agora, atualizado_em: agora };
    this.db.resultadosOficiais.push(reg);
    this._gravar();
    return { ...reg };
  }
  async listResultadosOficiais({ todos = false, userId = null, step = null } = {}) {
    const u = this.user;
    let lista = this.db.resultadosOficiais.slice();
    if (isAdmin(u) && (todos || (userId && ehSintetico(userId)))) lista = lista.concat((await this._demo()).desfechos);
    if (!isAdmin(u)) lista = lista.filter((r) => r.user_id === u.id);
    else if (userId) lista = lista.filter((r) => r.user_id === userId);
    else if (!todos) lista = lista.filter((r) => r.user_id === u.id);
    if (step) lista = lista.filter((r) => r.step === step);
    return lista.sort((a, b) => String(b.data).localeCompare(String(a.data))).map((r) => ({ ...r }));
  }
  async deleteResultadoOficial(id) {
    this._exigeAdmin("Só administradores excluem resultados oficiais.");
    if (String(id).startsWith("demo-res-")) throw new Error("Desfecho fictício da demonstração não pode ser excluído.");
    const i = this.db.resultadosOficiais.findIndex((r) => r.id === id);
    if (i >= 0) { this.db.resultadosOficiais.splice(i, 1); this._gravar(); }
  }

  /* ---------- modelos psicométricos (desfechos reais; todos leem, admin grava) ---------- */
  async getModelosPsicometricos() {
    return { step1: this.db.modelos.step1 ? structuredClone(this.db.modelos.step1) : null, step2ck: this.db.modelos.step2ck ? structuredClone(this.db.modelos.step2ck) : null };
  }
  async saveModeloPsicometrico(step, dados) {
    this._exigeAdmin("Só administradores gravam modelos psicométricos.");
    if (!["step1", "step2ck"].includes(step)) throw new Error("Step inválido.");
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) throw new Error("Modelo inválido.");
    this.db.modelos[step] = { ...structuredClone(dados), atualizado_em: new Date().toISOString(), atualizado_por: this.user.id };
    this._gravar();
    return structuredClone(this.db.modelos[step]);
  }

  /* ---------- leituras agregadas (só admin) ----------
     Mesma regra das funções r2a_admin_* do banco: primeira resposta de cada pessoa
     em cada item; modo tutor fora, salvo incluirTutor; só a versão atual do item,
     salvo todasVersoes; pessoa pseudonimizada (1, 2, 3... pela ordem do user_id). */
  async listRespostasCalibracao({ step = null, incluirTutor = false, todasVersoes = false, _comUsuario = false } = {}) {
    this._exigeAdmin("Só administradores leem as respostas da turma.");
    const gab = await this._gabarito();
    const todas = this.db.respostas.concat(await this._respostasSinteticas())
      .filter((r) => !step || r.step === step)
      .filter((r) => { const g = gab.get(r.questao_id); return todasVersoes || !g || r.versao_item === null || r.versao_item === undefined || r.versao_item === g.versao; })
      .sort((a, b) => String(a.respondida_em).localeCompare(String(b.respondida_em)) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    /* primeira resposta de cada pessoa no item; se ela foi no modo tutor, o item sai
       para essa pessoa (a segunda exposição já não é independente) */
    const vistos = new Set();
    const primeiras = [];
    for (const r of todas) { const k = r.user_id + "\u0000" + r.questao_id; if (vistos.has(k)) continue; vistos.add(k); if (incluirTutor || r.modo !== "tutor") primeiras.push(r); }
    const users = [...new Set(primeiras.map((r) => r.user_id))].sort();
    const pseud = new Map(users.map((x, i) => [x, i + 1]));
    return primeiras.map((r) => ({ pessoa: pseud.get(r.user_id), ...(_comUsuario ? { user_id: r.user_id } : {}), questao_id: r.questao_id, step: r.step, resposta: r.resposta, correta: !!r.correta, modo: r.modo, origem: r.origem, tempo_ms: r.tempo_ms }))
      .sort((a, b) => a.pessoa - b.pessoa || (a.questao_id < b.questao_id ? -1 : 1));
  }
  async getEstatisticasItens({ step = null, incluirTutor = false, todasVersoes = false } = {}) {
    const linhas = await this.listRespostasCalibracao({ step, incluirTutor, todasVersoes, _comUsuario: true });
    const gab = await this._gabarito();
    const a = analisarItens(linhas.map((r) => ({ ...r, pessoa: r.user_id })), gab, { usarCalibrado: false });
    const tempos = new Map();
    for (const r of linhas) (tempos.get(r.questao_id) || tempos.set(r.questao_id, []).get(r.questao_id)).push(r.tempo_ms || 0);
    return a.itens.map((it) => estatisticaNoFormatoDoBanco(it, tempos.get(it.questao_id), gab.get(it.questao_id)));
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

/* Converte a saída de analisarItens() para a linha de r2a_admin_estatisticas_itens() */
export function estatisticaNoFormatoDoBanco(it, tempos = [], item = null) {
  const so = (campo) => Object.fromEntries(it.opcoes.filter((o) => o[campo] > 0).map((o) => [o.letra, o[campo]]));
  const t = (tempos || []).slice().sort((x, y) => x - y);
  const mediana = t.length ? (t.length % 2 ? t[(t.length - 1) / 2] : (t[t.length / 2 - 1] + t[t.length / 2]) / 2) : null;
  return {
    questao_id: it.questao_id, step: item?.step || it.step, n: it.n, acertos: it.acertos, p: it.p, em_branco: it.em_branco,
    opcoes: so("n"), tempo_mediano_ms: mediana === null ? null : Math.round(mediana), pbis: it.pbis,
    n_superior: it.n_superior, n_inferior: it.n_inferior, opcoes_superior: so("n_superior"), opcoes_inferior: so("n_inferior")
  };
}
