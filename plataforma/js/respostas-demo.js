/* Road to America | respostas sintéticas da coorte de demonstração.

   Só no modo demonstração: dá à análise de itens do admin dados para mostrar. Cada
   participante fictício de coorte-demo.js com simulados recebe uma habilidade
   (theta) derivada do acerto médio dos seus simulados, pela mesma escala do banco:
   theta = logit(acerto médio) - logit(0,65), em que 0,65 é o Angoff padrão do item
   de dificuldade média. As respostas seguem o modelo de Rasch com o b de Angoff de
   cada item. Nada disso é dado real; as linhas saem com sintetico: true.
   Determinístico: mesma semente, mesmos itens e mesmo dia, mesmas respostas. */
import { PERFIS, PREFIXO_SINTETICO } from "./coorte-demo.js";
import { rng } from "./simulado.js";
import { expit, logit, bDoItem } from "./psicometria.js";
import { normalizarItem } from "./banco.js";

export const SEMENTE_RESPOSTAS = 20261029;
const MAX_POR_PESSOA = 250;

export function thetaDoPerfil(p) {
  const sims = p.sim || [];
  if (!sims.length) return null;
  const media = sims.reduce((s, x) => s + x[2], 0) / (sims.length * 20);
  const m = Math.min(0.97, Math.max(0.05, media));
  return logit(m) - logit(0.65);
}

/* itens: brutos ou normalizados; agora: Date. Devolve linhas no formato de
   listRespostas(), com user_id dos participantes fictícios. */
export function gerarRespostasDemo({ itens, agora = new Date(), semente = SEMENTE_RESPOSTAS } = {}) {
  const norm = (itens || []).map((q) => (q && q.b_angoff !== undefined ? q : normalizarItem(q))).filter((q) => q.id && q.correta);
  const porStep = { step1: norm.filter((q) => q.step === "step1"), step2ck: norm.filter((q) => q.step === "step2ck") };
  const dia = Math.floor(new Date(agora).getTime() / 86400000);
  const out = [];
  PERFIS.forEach((p, idx) => {
    const theta = thetaDoPerfil(p);
    if (theta === null) return;
    const step = p.sim[0][0];
    const pool = porStep[step];
    if (!pool.length) return;
    const random = rng(semente + idx * 7919 + dia);
    const ordem = pool.map((q) => [random(), q]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const n = Math.min(MAX_POR_PESSOA, Math.max(10, Math.round(pool.length * 0.7)));
    const userId = PREFIXO_SINTETICO + p.slug;
    ordem.slice(0, n).forEach((q, k) => {
      const acerto = random() < expit(theta - bDoItem(q, { usarCalibrado: false }));
      const erradas = q.alternativas.map((a) => a.letra).filter((l) => l !== q.correta);
      /* o primeiro distrator atrai mais (erro típico), os outros dividem o resto */
      const resposta = acerto ? q.correta : random() < 0.45 ? erradas[0] : erradas[1 + Math.floor(random() * (erradas.length - 1))];
      const diasAtras = Math.floor(random() * 60);
      out.push({
        id: userId + "-r" + k,
        user_id: userId,
        questao_id: q.id,
        step,
        resposta,
        correta: acerto,
        tempo_ms: Math.round(45000 + random() * 90000),
        marcada: random() < 0.1,
        modo: random() < 0.7 ? "cronometrado" : "tutor",
        origem: "banco",
        sessao_id: null, bloco: null, posicao: null,
        versao_item: q.versao || 1,
        respondida_em: new Date(new Date(agora).getTime() - diasAtras * 86400000 - Math.floor(random() * 36e5)).toISOString(),
        sintetico: true
      });
    });
  });
  return out;
}
