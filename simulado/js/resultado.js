/* Road to America | simulado: agregados da tela de resultado e do histórico.
   Funções puras sobre o registro de tentativa (corrigirTentativa em
   plataforma/js/simulado.js) e os objetos do banco de questões. */

import { SIMULADO_30, ROTULO_CAMPOS, desempenhoPorArea, ritmo } from "../../plataforma/js/simulado.js";
import { rotulo, linkFlashcards } from "./rotulos.js";

/* mm:ss (ou h:mm:ss) a partir de milissegundos */
export function relogio(ms) {
  const t = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, "0");
  return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}

/* Segundos inteiros, para "72 s" */
export const segundos = (ms) => (ms === null || ms === undefined ? null : Math.round(ms / 1000));

export function pct(x, casas = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "sem dados";
  return (x * 100).toFixed(casas).replace(".", ",") + "%";
}

/* Linhas de desempenho por campo ("por_sistema" | "por_disciplina" | "por_dificuldade"),
   com rótulo em português, da pior para a melhor taxa */
export function linhasPorCampo(tentativas, step, campo) {
  const chaveCampo = campo === "por_sistema" ? "sistema" : campo === "por_disciplina" ? "disciplina" : "dificuldade";
  return desempenhoPorArea(Array.isArray(tentativas) ? tentativas : [tentativas], campo)
    .map((l) => ({ ...l, rotulo: rotulo(step, chaveCampo, l.chave) }));
}

/* Títulos das duas tabelas de área do resultado */
export function titulosAreas(step) {
  const r = ROTULO_CAMPOS[step] || ROTULO_CAMPOS.step1;
  return { sistema: r.sistema, disciplina: r.disciplina };
}

/* Resumo do cabeçalho do resultado */
export function resumo(t) {
  const r = ritmo(t);
  const respondidas = t.total - t.em_branco;
  const acimaN = (t.tempos_ms || []).filter((x) => x > SIMULADO_30.ritmo_ms).length;
  return {
    acertos: t.acertos,
    total: t.total,
    percentual: t.percentual,
    erros: respondidas - t.acertos,
    em_branco: t.em_branco,
    marcadas: (t.marcadas || []).filter(Boolean).length,
    duracao_ms: t.duracao_ms,
    limite_ms: t.limite_ms,
    medio_ms: r.medio_ms,
    ritmo_ms: SIMULADO_30.ritmo_ms,
    /* tempo médio por questão do bloco inteiro (duração / total): é o número que se compara aos 90 s */
    medio_bloco_ms: t.total ? t.duracao_ms / t.total : null,
    acima_do_ritmo: acimaN,
    dentro_do_ritmo: t.total ? t.duracao_ms / t.total <= SIMULADO_30.ritmo_ms : true,
    encerramento: t.encerramento
  };
}

/* Itens da revisão questão por questão.
   questoesPorId: Map ou objeto id -> questão. Questão que saiu do banco vem com faltando: true. */
export function itensRevisao(t, questoesPorId) {
  const get = (id) => (questoesPorId instanceof Map ? questoesPorId.get(id) : questoesPorId?.[id]);
  return (t.questoes || []).map((id, i) => {
    const q = get(id);
    const resposta = t.respostas?.[i] ?? null;
    const situacao = resposta === null ? "em_branco" : q && resposta === String(q.correta).toUpperCase() ? "certa" : "errada";
    return {
      i, numero: i + 1, id, questao: q || null, faltando: !q,
      resposta, correta: q ? q.correta : null, situacao,
      marcada: !!t.marcadas?.[i],
      tempo_ms: t.tempos_ms?.[i] || 0,
      acima_do_ritmo: (t.tempos_ms?.[i] || 0) > SIMULADO_30.ritmo_ms,
      sistema: q ? rotulo(t.step, "sistema", q.sistema) : "",
      disciplina: q ? rotulo(t.step, "disciplina", q.disciplina) : "",
      flashcards: q && situacao !== "certa" ? linkFlashcards(q) : null
    };
  });
}

/* Filtro da revisão: "todas" | "erradas" (inclui em branco) | "marcadas" | "certas" */
export function filtrarRevisao(itens, filtro = "todas") {
  if (filtro === "erradas") return itens.filter((x) => x.situacao !== "certa");
  if (filtro === "marcadas") return itens.filter((x) => x.marcada);
  if (filtro === "certas") return itens.filter((x) => x.situacao === "certa");
  return itens;
}

/* Sistemas (ou áreas) com erro, agrupados, para a lista "o que revisar" com link
   para os flashcards. Ordena pelo número de erros. */
export function sistemasParaRevisar(itens) {
  const m = new Map();
  for (const x of itens) {
    if (x.situacao === "certa" || !x.questao) continue;
    const k = x.questao.sistema;
    const o = m.get(k) || { chave: k, rotulo: x.sistema, erros: 0, numeros: [], flashcards: x.flashcards };
    o.erros++;
    o.numeros.push(x.numero);
    m.set(k, o);
  }
  return [...m.values()].sort((a, b) => b.erros - a.erros || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/* Histórico de um Step: tentativas mais recentes primeiro, com tendência */
export function resumoHistorico(tentativas, step = null) {
  const lista = (tentativas || []).filter((t) => !step || t.step === step)
    .slice().sort((a, b) => String(b.fim).localeCompare(String(a.fim)));
  const n = lista.length;
  if (!n) return { n: 0, lista, media: null, melhor: null, ultima: null, variacao: null };
  const ps = lista.map((t) => t.percentual);
  const media = ps.reduce((a, b) => a + b, 0) / n;
  const melhor = Math.max(...ps);
  /* variação: última menos a anterior do mesmo Step, em pontos percentuais */
  const variacao = n >= 2 ? ps[0] - ps[1] : null;
  return { n, lista, media, melhor, ultima: lista[0], variacao };
}

/* Ids da tentativa anterior do mesmo Step: o sorteio evita repeti-los */
export function idsDaUltima(tentativas, step) {
  const r = resumoHistorico(tentativas, step);
  return r.ultima ? [...(r.ultima.questoes || [])] : [];
}
