/* Road to America | banco de questões: o que fica só neste navegador.
   - bloco em andamento (para sobreviver a um recarregamento), com o dono;
   - respostas de blocos que não chegaram à conta (falha de rede), reenviadas na
     próxima visita da mesma conta;
   - preferências da tela (Step escolhido, último pedido de bloco).
   Toda leitura e escrita passa por try/catch: sem armazenamento, a página
   funciona e só não guarda. As respostas valem quando chegam à camada de dados. */
const CHAVE_ANDAMENTO = "r2a-questoes-andamento-v1";
const CHAVE_PENDENTES = "r2a-questoes-pendentes-v1";
const CHAVE_PREFS = "r2a-questoes-prefs-v1";

function ler(k, padrao) {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : padrao; } catch { return padrao; }
}
function gravar(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
}
function apagar(k) { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } }

export const lerAndamento = () => ler(CHAVE_ANDAMENTO, null);
export const gravarAndamento = (s) => gravar(CHAVE_ANDAMENTO, s);
export const apagarAndamento = () => apagar(CHAVE_ANDAMENTO);

/* pendentes: { [dono]: [[respostas do bloco], ...] } */
export function guardarPendentes(dono, lista) {
  const tudo = ler(CHAVE_PENDENTES, {});
  (tudo[dono] ||= []).push(lista);
  return gravar(CHAVE_PENDENTES, tudo);
}
export function lerPendentes(dono) { return ler(CHAVE_PENDENTES, {})[dono] || []; }
export function trocarPendentes(dono, restantes) {
  const tudo = ler(CHAVE_PENDENTES, {});
  if (restantes.length) tudo[dono] = restantes; else delete tudo[dono];
  gravar(CHAVE_PENDENTES, tudo);
}

export function lerPrefs() {
  const p = ler(CHAVE_PREFS, {});
  return { step: ["step1", "step2ck"].includes(p.step) ? p.step : "step1", pedido: p.pedido && typeof p.pedido === "object" ? p.pedido : null, banner: !!p.banner };
}
export function gravarPrefs(mud) { gravar(CHAVE_PREFS, { ...lerPrefs(), ...mud }); }
