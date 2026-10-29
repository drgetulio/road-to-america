/* Road to America | simulado: o que fica só neste navegador.
   - Histórico do visitante sem login (as tentativas de quem entrou vão para a
     camada de dados: store.saveSimulado).
   - Bloco em andamento, para sobreviver a um recarregamento da página.
   - Anotações e preferências da tela.
   Toda leitura e escrita passa por try/catch: em janela privada ou com o
   armazenamento bloqueado, a página funciona sem guardar nada. */

import { validarTentativa } from "../../plataforma/js/simulado.js";

export const CHAVE_VISITANTE = "r2a-simulado-visitante-v1";
export const CHAVE_ANDAMENTO = "r2a-simulado-andamento-v1";
export const CHAVE_NOTAS = "r2a-simulado-notas-v1";
export const CHAVE_PREFS = "r2a-simulado-prefs-v1";
export const MAX_VISITANTE = 60;

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

export function abrirArmazenamento(storage) {
  if (storage) return storage;
  try {
    const ls = globalThis.localStorage;
    ls.setItem("__r2a_t", "1");
    ls.removeItem("__r2a_t");
    return ls;
  } catch { return memoria(); }
}

function lerJson(st, k, padrao) {
  try { const raw = st.getItem(k); return raw ? JSON.parse(raw) : padrao; } catch { return padrao; }
}
function gravarJson(st, k, v) {
  try { st.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
}

function idLocal() {
  const r = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return "loc-" + r;
}

/* Histórico do visitante: mesma forma do registro da camada de dados */
export class HistoricoLocal {
  constructor(storage) { this.st = abrirArmazenamento(storage); }
  listar(step = null) {
    const l = lerJson(this.st, CHAVE_VISITANTE, []);
    return (Array.isArray(l) ? l : []).filter((t) => t && (!step || t.step === step))
      .sort((a, b) => String(b.fim).localeCompare(String(a.fim)));
  }
  salvar(t) {
    const erros = validarTentativa(t);
    if (erros.length) throw new Error(erros.join(" "));
    const reg = { ...structuredClone(t), id: idLocal(), user_id: null, criado_em: new Date().toISOString() };
    const lista = this.listar();
    lista.unshift(reg);
    const ok = gravarJson(this.st, CHAVE_VISITANTE, lista.slice(0, MAX_VISITANTE));
    return { ...reg, _gravado: ok };
  }
  obter(id) { return this.listar().find((t) => t.id === id) || null; }
  remover(id) { gravarJson(this.st, CHAVE_VISITANTE, this.listar().filter((t) => t.id !== id)); }
  limpar() { try { this.st.removeItem(CHAVE_VISITANTE); } catch { /* sem armazenamento */ } }
}

export function lerAndamento(storage) { return lerJson(abrirArmazenamento(storage), CHAVE_ANDAMENTO, null); }
export function gravarAndamento(s, storage) { return gravarJson(abrirArmazenamento(storage), CHAVE_ANDAMENTO, s); }
export function apagarAndamento(storage) { try { abrirArmazenamento(storage).removeItem(CHAVE_ANDAMENTO); } catch { /* sem armazenamento */ } }

/* Anotações de uma tentativa encerrada, guardadas pelo id da tentativa (não vão para o banco) */
export function gravarNotas(idTentativa, notas, storage) {
  if (!notas || !notas.some(Boolean)) return;
  const st = abrirArmazenamento(storage);
  const tudo = lerJson(st, CHAVE_NOTAS, {});
  tudo[idTentativa] = notas;
  const ids = Object.keys(tudo);
  if (ids.length > MAX_VISITANTE) for (const k of ids.slice(0, ids.length - MAX_VISITANTE)) delete tudo[k];
  gravarJson(st, CHAVE_NOTAS, tudo);
}
export function lerNotas(idTentativa, storage) {
  const tudo = lerJson(abrirArmazenamento(storage), CHAVE_NOTAS, {});
  return Array.isArray(tudo[idTentativa]) ? tudo[idTentativa] : null;
}

export function lerPrefs(storage) {
  const p = lerJson(abrirArmazenamento(storage), CHAVE_PREFS, {});
  return { fonte: ["normal", "grande", "maior"].includes(p.fonte) ? p.fonte : "normal", step: ["step1", "step2ck"].includes(p.step) ? p.step : "step1" };
}
export function gravarPrefs(p, storage) { gravarJson(abrirArmazenamento(storage), CHAVE_PREFS, p); }

/* Cópia do dia de prova do simulado completo, gravada a cada mudança. A camada de
   dados recebe a mesma sessão com intervalo (store.salvarProgressoSimulado); esta
   cópia cobre a queda de rede e o recarregamento entre duas gravações. */
export const CHAVE_ESPELHO = "r2a-simulado-completo-espelho-v1";
export function gravarEspelho(id, sessao, storage) {
  const st = abrirArmazenamento(storage);
  const tudo = lerJson(st, CHAVE_ESPELHO, {});
  tudo[id] = { sessao, salvo_em: new Date().toISOString() };
  const ids = Object.keys(tudo);
  if (ids.length > 5) for (const k of ids.sort((a, b) => String(tudo[a].salvo_em).localeCompare(String(tudo[b].salvo_em))).slice(0, ids.length - 5)) delete tudo[k];
  return gravarJson(st, CHAVE_ESPELHO, tudo);
}
export function lerEspelho(id, storage) {
  const tudo = lerJson(abrirArmazenamento(storage), CHAVE_ESPELHO, {});
  return tudo?.[id]?.sessao || null;
}
export function apagarEspelho(id, storage) {
  const st = abrirArmazenamento(storage);
  const tudo = lerJson(st, CHAVE_ESPELHO, {});
  if (tudo[id]) { delete tudo[id]; gravarJson(st, CHAVE_ESPELHO, tudo); }
}
