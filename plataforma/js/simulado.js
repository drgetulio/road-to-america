/* Road to America | simulado de 30 minutos: formato, sorteio estratificado e correção.
   Funções puras (sem DOM e sem banco), usadas pela tela do simulado, pelas duas
   camadas de dados e pelos testes. Interface completa em plataforma/INTERFACE.md.

   Formato oficial vigente (consulta em usmle.org em 28/10/2026):
   - Step 1, provas a partir de 14/05/2026: 14 blocos de 30 minutos, até 20 itens
     por bloco, até 280 itens, sessão de 8 horas.
     https://www.usmle.org/step-exams/step-1
   - Step 2 CK, provas a partir de 07/05/2026: 16 blocos de 30 minutos, até 20 itens
     por bloco, até 318 itens, sessão de 9 horas.
     https://www.usmle.org/step-exams/step-2-ck
   Um bloco não reabre depois de encerrado; a revisão só acontece dentro do bloco
   (https://www.usmle.org/bulletin-information/examination-day-testing).
   Por isso o simulado de 30 minutos reproduz um bloco: 20 questões nos dois Steps,
   90 segundos por questão em média. */

export const STEPS = Object.freeze(["step1", "step2ck"]);

export const NOME_STEP = Object.freeze({ step1: "Step 1", step2ck: "Step 2 CK" });

export const FORMATO_OFICIAL = Object.freeze({
  step1: Object.freeze({
    blocos: 14, minutos_por_bloco: 30, questoes_por_bloco: 20, questoes_max: 280, horas_sessao: 8,
    vigente_desde: "2026-05-14", fonte: "https://www.usmle.org/step-exams/step-1"
  }),
  step2ck: Object.freeze({
    blocos: 16, minutos_por_bloco: 30, questoes_por_bloco: 20, questoes_max: 318, horas_sessao: 9,
    vigente_desde: "2026-05-07", fonte: "https://www.usmle.org/step-exams/step-2-ck"
  })
});

/* Um bloco oficial: 20 questões em 30 minutos (1.800.000 ms), 90 s por questão */
export const SIMULADO_30 = Object.freeze({
  questoes: 20,
  duracao_ms: 30 * 60 * 1000,
  ritmo_ms: 90 * 1000,
  modo: "bloco_30min"
});

/* Rótulos dos campos de estratificação. No banco do Step 2 CK, "sistema" guarda a
   área clínica (medicina interna, pediatria...) e "disciplina" guarda a tarefa
   (diagnóstico, manejo, prevenção...). */
export const ROTULO_CAMPOS = Object.freeze({
  step1: { sistema: "Sistema", disciplina: "Disciplina" },
  step2ck: { sistema: "Área", disciplina: "Tarefa" }
});

/* Mulberry32: gerador com semente, para sorteios reprodutíveis */
export function rng(seed) {
  let a = (Number(seed) || 0) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function embaralhar(arr, random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Cotas pelo maior resto: distribui n vagas entre grupos proporcionalmente ao
   peso, sem passar do número de questões disponíveis em cada grupo. */
export function cotasProporcionais(pesos, disponiveis, n) {
  const chaves = Object.keys(pesos).filter((k) => (disponiveis[k] || 0) > 0 && pesos[k] > 0);
  const totalDisp = chaves.reduce((s, k) => s + disponiveis[k], 0);
  const alvo = Math.min(n, totalDisp);
  const cotas = Object.fromEntries(chaves.map((k) => [k, 0]));
  let restante = alvo;
  /* repete a divisão enquanto sobrarem vagas (um grupo pequeno pode esgotar) */
  while (restante > 0) {
    const abertos = chaves.filter((k) => cotas[k] < disponiveis[k]);
    if (!abertos.length) break;
    const somaPesos = abertos.reduce((s, k) => s + pesos[k], 0);
    const ideal = abertos.map((k) => ({ k, v: (pesos[k] / somaPesos) * restante }));
    let distribuido = 0;
    for (const { k, v } of ideal) {
      const add = Math.min(Math.floor(v), disponiveis[k] - cotas[k]);
      cotas[k] += add;
      distribuido += add;
    }
    if (distribuido === 0) {
      /* maior resto, com desempate pela chave para ser determinístico */
      const ord = ideal
        .map(({ k, v }) => ({ k, r: v - Math.floor(v) }))
        .sort((a, b) => b.r - a.r || (a.k < b.k ? -1 : 1));
      for (const { k } of ord) {
        if (restante - distribuido <= 0) break;
        if (cotas[k] < disponiveis[k]) { cotas[k]++; distribuido++; }
      }
      if (distribuido === 0) break;
    }
    restante -= distribuido;
  }
  return cotas;
}

/*
  Sorteio estratificado de questões.
  - banco: array de questões ({ id, sistema, disciplina, dificuldade, ... })
  - n: quantas questões (padrão 20)
  - campo: campo de estratificação (padrão "sistema"; no Step 2 CK é a área)
  - pesos: { chave: peso } opcional; sem ele, o peso é a composição do próprio banco.
    Chaves sem peso ficam de fora da estratificação, mas podem entrar para completar n
  - vistas: ids já respondidos pelo participante; ficam por último dentro do estrato
  - semente: número para reproduzir o sorteio
  Dentro de cada estrato a escolha prefere questões não vistas e alterna
  dificuldade e disciplina; a ordem final é embaralhada, para intercalar áreas.
  Devolve as questões (objetos do banco) na ordem de aplicação.
*/
export function sortearQuestoes(banco, { n = SIMULADO_30.questoes, campo = "sistema", pesos = null, vistas = [], semente = Date.now() } = {}) {
  const random = rng(semente);
  const lista = (Array.isArray(banco) ? banco : []).filter((q) => q && q.id);
  const vistasSet = new Set(vistas);
  const grupos = {};
  for (const q of lista) (grupos[q[campo] || "_sem_area"] ||= []).push(q);
  const disponiveis = Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, v.length]));
  const p = {};
  for (const k of Object.keys(grupos)) p[k] = pesos ? Number(pesos[k]) || 0 : grupos[k].length;
  /* se os pesos informados zerarem todos os grupos, volta à composição do banco */
  if (!Object.values(p).some((v) => v > 0)) for (const k of Object.keys(grupos)) p[k] = grupos[k].length;
  const cotas = cotasProporcionais(p, disponiveis, n);
  const escolhidas = [];
  for (const k of Object.keys(cotas).sort()) {
    const cand = embaralhar(grupos[k], random);
    /* não vistas primeiro; entre elas, alterna dificuldade e disciplina */
    cand.sort((a, b) => (vistasSet.has(a.id) ? 1 : 0) - (vistasSet.has(b.id) ? 1 : 0));
    const pegas = [];
    const usadosDif = new Map();
    const usadosDisc = new Map();
    while (pegas.length < cotas[k] && cand.length) {
      const naoVistas = cand.filter((q) => !vistasSet.has(q.id));
      const pool = naoVistas.length ? naoVistas : cand;
      pool.sort((a, b) =>
        ((usadosDisc.get(a.disciplina) || 0) + (usadosDif.get(a.dificuldade) || 0)) -
        ((usadosDisc.get(b.disciplina) || 0) + (usadosDif.get(b.dificuldade) || 0)));
      const q = pool[0];
      pegas.push(q);
      cand.splice(cand.indexOf(q), 1);
      usadosDif.set(q.dificuldade, (usadosDif.get(q.dificuldade) || 0) + 1);
      usadosDisc.set(q.disciplina, (usadosDisc.get(q.disciplina) || 0) + 1);
    }
    escolhidas.push(...pegas);
  }
  /* completa com quaisquer questões, caso os estratos não bastem */
  if (escolhidas.length < Math.min(n, lista.length)) {
    const ids = new Set(escolhidas.map((q) => q.id));
    const resto = embaralhar(lista.filter((q) => !ids.has(q.id)), random)
      .sort((a, b) => (vistasSet.has(a.id) ? 1 : 0) - (vistasSet.has(b.id) ? 1 : 0));
    escolhidas.push(...resto.slice(0, Math.min(n, lista.length) - escolhidas.length));
  }
  return embaralhar(escolhidas, random);
}

/* Soma acertos por chave de um campo: { chave: { total, acertos } } */
function porCampo(questoes, corretas, campo) {
  const out = {};
  questoes.forEach((q, i) => {
    const k = (q && q[campo]) || "_sem_area";
    const o = (out[k] ||= { total: 0, acertos: 0 });
    o.total++;
    if (corretas[i]) o.acertos++;
  });
  return out;
}

/*
  Correção de uma tentativa. Recebe as questões aplicadas (objetos do banco, na
  ordem em que apareceram) e o que o participante fez; devolve o registro pronto
  para store.saveSimulado().
  respostas[i]: letra marcada ("A".."J") ou null se ficou em branco.
  marcadas[i]: questão marcada para revisão.
  tempos_ms[i]: tempo total gasto na questão (somando idas e voltas dentro do bloco).
*/
export function corrigirTentativa({ step, questoes, respostas = [], marcadas = [], tempos_ms = [], inicio, fim, encerramento = "participante", limite_ms = SIMULADO_30.duracao_ms, modo = SIMULADO_30.modo, versao_banco = "" }) {
  const qs = Array.isArray(questoes) ? questoes : [];
  const total = qs.length;
  const resp = Array.from({ length: total }, (_, i) => (respostas[i] ? String(respostas[i]).toUpperCase() : null));
  const corretas = qs.map((q, i) => resp[i] !== null && resp[i] === String(q.correta).toUpperCase());
  const acertos = corretas.filter(Boolean).length;
  const ini = new Date(inicio);
  const fi = new Date(fim);
  const duracao_ms = Math.max(0, Math.min(fi - ini, 24 * 3600 * 1000));
  return {
    step,
    modo,
    questoes: qs.map((q) => q.id),
    respostas: resp,
    marcadas: Array.from({ length: total }, (_, i) => !!marcadas[i]),
    tempos_ms: Array.from({ length: total }, (_, i) => Math.max(0, Math.round(Number(tempos_ms[i]) || 0))),
    inicio: ini.toISOString(),
    fim: fi.toISOString(),
    duracao_ms,
    limite_ms,
    total,
    acertos,
    percentual: total ? acertos / total : 0,
    em_branco: resp.filter((r) => r === null).length,
    por_sistema: porCampo(qs, corretas, "sistema"),
    por_disciplina: porCampo(qs, corretas, "disciplina"),
    por_dificuldade: porCampo(qs, corretas, "dificuldade"),
    encerramento: encerramento === "tempo" ? "tempo" : "participante",
    versao_banco: String(versao_banco || "")
  };
}

/* Validação do registro antes de gravar (as duas camadas de dados chamam).
   Devolve uma lista de mensagens; vazia significa válido. */
export function validarTentativa(t) {
  const erros = [];
  if (!t || typeof t !== "object") return ["Tentativa vazia."];
  if (!STEPS.includes(t.step)) erros.push("Step inválido.");
  const n = Array.isArray(t.questoes) ? t.questoes.length : 0;
  if (n < 1 || n > 40) erros.push("A tentativa precisa ter de 1 a 40 questões.");
  if (t.total !== n) erros.push("O total não confere com o número de questões.");
  for (const k of ["respostas", "marcadas", "tempos_ms"]) {
    if (!Array.isArray(t[k]) || t[k].length !== n) erros.push("O campo " + k + " precisa ter uma posição por questão.");
  }
  if (!Number.isInteger(t.acertos) || t.acertos < 0 || t.acertos > n) erros.push("Número de acertos inválido.");
  const ini = Date.parse(t.inicio);
  const fim = Date.parse(t.fim);
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) erros.push("Início e fim inválidos.");
  if (!Number.isFinite(t.duracao_ms) || t.duracao_ms < 0 || t.duracao_ms > 86400000) erros.push("Duração inválida.");
  return erros;
}

/* Acerto por área somando várias tentativas (para o painel do participante e do
   admin). campo: "por_sistema" | "por_disciplina" | "por_dificuldade".
   Devolve [{ chave, total, acertos, taxa }] em ordem crescente de taxa. */
export function desempenhoPorArea(tentativas, campo = "por_sistema") {
  const soma = {};
  for (const t of tentativas || []) {
    for (const [k, v] of Object.entries((t && t[campo]) || {})) {
      const o = (soma[k] ||= { chave: k, total: 0, acertos: 0 });
      o.total += Number(v.total) || 0;
      o.acertos += Number(v.acertos) || 0;
    }
  }
  return Object.values(soma)
    .map((o) => ({ ...o, taxa: o.total ? o.acertos / o.total : null }))
    .sort((a, b) => (a.taxa ?? 2) - (b.taxa ?? 2) || b.total - a.total);
}

/* Tempo médio por questão respondida (ms) e proporção acima do ritmo de 90 s */
export function ritmo(tentativa, ritmoMs = SIMULADO_30.ritmo_ms) {
  const t = (tentativa?.tempos_ms || []).filter((x) => x > 0);
  if (!t.length) return { medio_ms: null, acima_do_ritmo: 0 };
  return { medio_ms: t.reduce((a, b) => a + b, 0) / t.length, acima_do_ritmo: t.filter((x) => x > ritmoMs).length / t.length };
}
