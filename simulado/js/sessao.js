/* Road to America | simulado: estado de um bloco em andamento.
   Funções puras sobre um objeto simples (serializável em JSON), sem DOM e sem
   relógio próprio: quem chama informa "agora" em milissegundos. Isso deixa o
   cronômetro imune ao atraso de abas em segundo plano (o tempo é sempre a
   diferença entre o relógio de parede e o início) e permite testar tudo no Node.

   Regras do bloco (iguais às do bloco oficial):
   - o relógio do bloco não pausa; ao chegar a zero, o bloco se encerra;
   - dentro do bloco, o participante vai e volta entre as questões, marca para
     revisão, risca alternativas e muda a resposta;
   - encerrado, o bloco não reabre. */

import { SIMULADO_30, corrigirTentativa, sortearQuestoes, rng } from "../../plataforma/js/simulado.js";

/* Sorteia as 20 questões de um bloco: estratificado por sistema (Step 1) ou por
   área (Step 2 CK, que guarda a área no mesmo campo), evitando as questões da
   tentativa anterior do mesmo Step quando o banco permite.

   sortearQuestoes (plataforma/js/simulado.js) já prefere questões não vistas
   dentro de cada estrato, mas desempata as cotas pelo nome do estrato: com um
   banco de 40 e blocos de 20, os mesmos estratos ganham a vaga extra toda vez e
   algumas questões se repetiriam. Aqui, depois do sorteio, cada questão já vista
   é trocada por uma não vista de outro estrato, desde que todos os estratos
   continuem a menos de 1 questão da proporção exata do banco (a mesma folga da
   cota pelo maior resto). */
export function sortearBloco({ banco, vistas = [], semente = Date.now(), n = SIMULADO_30.questoes }) {
  const escolhidas = sortearQuestoes(banco, { n, campo: "sistema", vistas, semente });
  const vistasSet = new Set(vistas);
  if (!vistasSet.size || !escolhidas.some((q) => vistasSet.has(q.id))) return escolhidas;
  const lista = banco.filter((q) => q && q.id);
  const N = lista.length;
  const k = (q) => q.sistema || "_sem_area";
  const noBanco = {};
  for (const q of lista) noBanco[k(q)] = (noBanco[k(q)] || 0) + 1;
  const ideal = (g) => ((noBanco[g] || 0) / N) * escolhidas.length;
  const atual = {};
  for (const q of escolhidas) atual[k(q)] = (atual[k(q)] || 0) + 1;
  const ids = new Set(escolhidas.map((q) => q.id));
  const random = rng((Number(semente) || 0) + 7919);
  const livres = lista.filter((q) => !ids.has(q.id) && !vistasSet.has(q.id))
    .map((q) => ({ q, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.q);
  const out = escolhidas.slice();
  for (let i = 0; i < out.length; i++) {
    const velha = out[i];
    if (!vistasSet.has(velha.id)) continue;
    const gv = k(velha);
    if (atual[gv] - 1 <= ideal(gv) - 1) continue; /* tirar deixaria o estrato longe demais */
    let melhor = -1;
    let deficit = -Infinity;
    livres.forEach((q, j) => {
      const g = k(q);
      if (g === gv) { if (deficit < Infinity) { melhor = j; deficit = Infinity; } return; }
      if ((atual[g] || 0) + 1 >= ideal(g) + 1) return;
      const d = ideal(g) - (atual[g] || 0);
      if (d > deficit) { deficit = d; melhor = j; }
    });
    if (melhor < 0) continue;
    const nova = livres.splice(melhor, 1)[0];
    atual[gv]--;
    atual[k(nova)] = (atual[k(nova)] || 0) + 1;
    out[i] = nova;
  }
  return out;
}

export const VERSAO_SESSAO = 1;

export function criarSessao({ step, questoes, agora = Date.now(), limite_ms = SIMULADO_30.duracao_ms, semente = null, versao_banco = "" }) {
  const n = questoes.length;
  return {
    v: VERSAO_SESSAO,
    step,
    ids: questoes.map((q) => q.id),
    semente,
    versao_banco,
    inicio: agora,
    limite_ms,
    atual: 0,
    entrou_em: agora,
    respostas: Array(n).fill(null),
    marcadas: Array(n).fill(false),
    riscadas: Array.from({ length: n }, () => []),
    realces: Array.from({ length: n }, () => ({ vinheta: [], pergunta: [] })),
    notas: Array(n).fill(""),
    tempos_ms: Array(n).fill(0),
    visitadas: Array.from({ length: n }, (_, i) => i === 0),
    avisos: [],
    encerrada: false,
    fim: null,
    encerramento: null
  };
}

export const fimPrevisto = (s) => s.inicio + s.limite_ms;
export const tempoRestante = (s, agora = Date.now()) => Math.max(0, fimPrevisto(s) - (s.encerrada ? s.fim : agora));
export const expirou = (s, agora = Date.now()) => agora >= fimPrevisto(s);

/* Soma o tempo da questão atual até "agora" (sem passar do fim do bloco) */
function acumular(s, agora) {
  const ate = Math.min(agora, fimPrevisto(s));
  const delta = Math.max(0, ate - s.entrou_em);
  s.tempos_ms[s.atual] += delta;
  s.entrou_em = Math.max(s.entrou_em, ate);
}

function exigeAberta(s) {
  if (s.encerrada) throw new Error("O bloco já foi encerrado e não pode ser alterado.");
}

export function irPara(s, i, agora = Date.now()) {
  exigeAberta(s);
  const alvo = Math.max(0, Math.min(s.ids.length - 1, Number(i) || 0));
  acumular(s, agora);
  s.atual = alvo;
  s.visitadas[alvo] = true;
  return s;
}
export const proxima = (s, agora) => irPara(s, Math.min(s.atual + 1, s.ids.length - 1), agora);
export const anterior = (s, agora) => irPara(s, Math.max(s.atual - 1, 0), agora);

export function responder(s, i, letra) {
  exigeAberta(s);
  s.respostas[i] = letra ? String(letra).toUpperCase() : null;
  return s;
}

export function alternarMarca(s, i = s.atual) {
  exigeAberta(s);
  s.marcadas[i] = !s.marcadas[i];
  return s;
}

/* Riscar não apaga a resposta: no software oficial o risco é só visual */
export function alternarRiscada(s, i, letra) {
  exigeAberta(s);
  const L = String(letra).toUpperCase();
  const lista = s.riscadas[i];
  const k = lista.indexOf(L);
  if (k >= 0) lista.splice(k, 1); else lista.push(L);
  lista.sort();
  return s;
}

export function definirNota(s, i, texto) {
  exigeAberta(s);
  s.notas[i] = String(texto || "").slice(0, 2000);
  return s;
}

/* Avisos discretos do cronômetro: devolve o aviso que acabou de vencer (uma vez só) */
export const AVISOS_MS = [60 * 1000, 5 * 60 * 1000]; /* do menor para o maior */
export function avisoPendente(s, agora = Date.now()) {
  const resta = tempoRestante(s, agora);
  for (const marco of AVISOS_MS) {
    if (resta <= marco && resta > 0 && !s.avisos.includes(marco)) {
      /* registra também os marcos maiores já vencidos, para não avisar em cascata */
      for (const m of AVISOS_MS) if (m >= marco && !s.avisos.includes(m)) s.avisos.push(m);
      return marco;
    }
  }
  return null;
}

export function contagem(s) {
  const respondidas = s.respostas.filter((r) => r !== null).length;
  return {
    total: s.ids.length,
    respondidas,
    sem_resposta: s.ids.length - respondidas,
    marcadas: s.marcadas.filter(Boolean).length
  };
}

/* Lista para a tela de revisão do bloco. filtro: "todas" | "marcadas" | "sem_resposta" */
export function listaRevisao(s, filtro = "todas") {
  return s.ids.map((id, i) => ({
    i, numero: i + 1, id,
    respondida: s.respostas[i] !== null,
    marcada: s.marcadas[i],
    visitada: s.visitadas[i],
    tem_nota: !!s.notas[i]
  })).filter((x) => filtro === "marcadas" ? x.marcada : filtro === "sem_resposta" ? !x.respondida : true);
}

/* Encerra o bloco. motivo: "participante" | "tempo". Devolve a sessão encerrada. */
export function encerrar(s, agora = Date.now(), motivo = "participante") {
  if (s.encerrada) return s;
  const porTempo = motivo === "tempo" || expirou(s, agora);
  const fim = porTempo ? fimPrevisto(s) : agora;
  acumular(s, fim);
  s.encerrada = true;
  s.fim = fim;
  s.encerramento = porTempo ? "tempo" : "participante";
  return s;
}

/* Registro pronto para store.saveSimulado (via corrigirTentativa).
   questoesPorId: Map ou objeto id -> questão do banco. */
export function paraTentativa(s, questoesPorId) {
  if (!s.encerrada) throw new Error("Encerre o bloco antes de corrigir.");
  const get = (id) => (questoesPorId instanceof Map ? questoesPorId.get(id) : questoesPorId[id]);
  const questoes = s.ids.map(get);
  if (questoes.some((q) => !q)) throw new Error("Uma das questões do bloco não está mais no banco.");
  return corrigirTentativa({
    step: s.step,
    questoes,
    respostas: s.respostas,
    marcadas: s.marcadas,
    tempos_ms: s.tempos_ms,
    inicio: new Date(s.inicio).toISOString(),
    fim: new Date(s.fim).toISOString(),
    encerramento: s.encerramento,
    limite_ms: s.limite_ms,
    versao_banco: s.versao_banco
  });
}

/* Leitura defensiva de uma sessão salva (recarregar a página no meio do bloco).
   Devolve null se o formato não confere. Ao restaurar, o tempo em que a página
   ficou fechada continua contando no relógio do bloco (como na prova), mas não
   é atribuído a nenhuma questão. */
export function restaurarSessao(obj, agora = Date.now()) {
  if (!obj || typeof obj !== "object" || obj.v !== VERSAO_SESSAO) return null;
  const n = Array.isArray(obj.ids) ? obj.ids.length : 0;
  if (!n || !["step1", "step2ck"].includes(obj.step)) return null;
  for (const k of ["respostas", "marcadas", "riscadas", "realces", "notas", "tempos_ms", "visitadas"]) {
    if (!Array.isArray(obj[k]) || obj[k].length !== n) return null;
  }
  if (!Number.isFinite(obj.inicio) || !Number.isFinite(obj.limite_ms)) return null;
  const s = structuredClone(obj);
  s.atual = Math.max(0, Math.min(n - 1, Number(s.atual) || 0));
  if (!Array.isArray(s.avisos)) s.avisos = [];
  if (!s.encerrada) s.entrou_em = Math.min(Math.max(agora, s.inicio), fimPrevisto(s));
  return s;
}
