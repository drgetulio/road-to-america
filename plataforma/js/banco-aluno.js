/* Road to America | banco de questões no espaço do aluno: lógica pura (sem DOM).
   Usada por questoes/ (blocos personalizados, desempenho, curva de evolução e painel
   de probabilidade de aprovação) e pelo cartão resumido de "Meu progresso" (anki/).

   - histórico do aluno por item (vista, errada, marcada) a partir de listRespostas();
   - filtros do bloco personalizado (Step; sistema, disciplina, área, tarefa,
     competência; não vistas, erradas, marcadas, todas) com contagem por faceta;
   - montagem do bloco (sorteio estratificado por sistema, não vistas primeiro) e
     sessão no mesmo formato do bloco do simulado (simulado/js/sessao.js), para a
     interface de item compartilhada (plataforma/js/ui-item.js);
   - conversão da sessão encerrada em respostas por item (saveRespostas);
   - histórico de blocos, resultado de um bloco e curva de evolução;
   - contribuição de cada área para a probabilidade de aprovação e recomendações
     de estudo ligadas ao Conteúdo do Step 1, aos flashcards e ao próprio banco.
   O método psicométrico está em PSICOMETRIA.md (a seção 18 trata do que este
   arquivo acrescenta). */

import { sortearQuestoes, rng } from "./simulado.js";
import {
  estimarAluno, prepararRespostas, eap, expit, prontidaoCombinada, pontosGrade, ponderarPeloOutline, incertezaCorte, pAcimaDoCorte, nomePadrao, padraoProvisorio,
  PRIORI_PADRAO, GRADE_PADRAO, PESOS_MODO, REGRA_CONFIANCA, PADRAO_STEP2CK, PERFIL_PADRAO
} from "./psicometria.js";
import { TAXONOMIA, sistemasDoOutline, pesosDoOutline, nomeChave } from "./banco.js";
import { prontidao, CONFIG_PADRAO } from "./desempenho.js";
import { criarSessao } from "../../simulado/js/sessao.js";

/* Tamanho do bloco: até 20 itens, como o bloco oficial (usmle.org, páginas do Step 1
   e do Step 2 CK); no modo livre, até 40 (critério interno, para revisão rápida).
   Ritmo do modo cronometrado: 90 s por item, a média do bloco oficial (30 min / 20). */
export const LIMITES_BLOCO = Object.freeze({ min: 1, max: 20, max_livre: 40, ritmo_ms: 90000, tutor_limite_ms: 24 * 3600 * 1000 });
export const MODOS_BLOCO = Object.freeze(["tutor", "cronometrado"]);
export const SITUACOES = Object.freeze(["nao_vistas", "erradas", "marcadas", "todas"]);
export const ROTULO_SITUACAO = Object.freeze({ nao_vistas: "Não vistas", erradas: "Erradas", marcadas: "Marcadas", todas: "Todas" });
export const ROTULO_MODO = Object.freeze({ tutor: "Tutor", cronometrado: "Cronometrado" });

/* Filtros do bloco personalizado por Step. "campo" é onde o item guarda o rótulo
   (nas disciplinas, a lista com todos os rótulos do item). */
export const FILTROS_STEP = Object.freeze({
  step1: Object.freeze([
    { dim: "sistema", campo: "sistema", rotulo: "Sistemas" },
    { dim: "disciplina", campo: "disciplinas", rotulo: "Disciplinas" },
    { dim: "competencia", campo: "competencia", rotulo: "Competências" }
  ]),
  step2ck: Object.freeze([
    { dim: "sistema", campo: "sistema", rotulo: "Sistemas" },
    { dim: "disciplina_oficial", campo: "disciplinas_oficiais", rotulo: "Disciplinas clínicas" },
    { dim: "competencia", campo: "competencia", rotulo: "Tarefas do médico (competências)" },
    { dim: "area", campo: "area", rotulo: "Áreas" },
    { dim: "tarefa", campo: "tarefa", rotulo: "Tarefas" }
  ])
});

const tempoDe = (r) => Date.parse(r?.respondida_em || "") || 0;
const dentro = (v, set) => (Array.isArray(v) ? v.some((x) => set.has(x)) : set.has(v));

/* ---------- histórico por item ----------
   respostas: listRespostas() (qualquer origem). Devolve Map id -> {
     n, respondidas, primeira_correta, ultima_resposta, ultima_correta (null sem
     resposta dada), ultima_em, marcada (marca da tentativa mais recente), em_branco_ultima } */
export function historicoItens(respostas) {
  const ord = (respostas || []).map((r, i) => ({ r, i })).sort((a, b) => tempoDe(a.r) - tempoDe(b.r) || a.i - b.i);
  const h = new Map();
  for (const { r } of ord) {
    const id = r.questao_id;
    if (!id) continue;
    const x = h.get(id) || { n: 0, respondidas: 0, primeira_correta: null, ultima_resposta: null, ultima_correta: null, ultima_em: null, marcada: false, em_branco_ultima: false };
    x.n++;
    const dada = r.resposta !== null && r.resposta !== undefined && r.resposta !== "";
    if (dada) {
      x.respondidas++;
      if (x.primeira_correta === null) x.primeira_correta = !!r.correta;
      x.ultima_resposta = r.resposta;
      x.ultima_correta = !!r.correta;
    }
    x.em_branco_ultima = !dada;
    x.marcada = !!r.marcada;
    x.ultima_em = r.respondida_em || x.ultima_em;
    h.set(id, x);
  }
  return h;
}

/* Situação de um item para o filtro do bloco. "erradas": a tentativa mais recente
   foi errada ou ficou em branco (na prova, em branco conta como erro). */
export function situacaoItem(id, historico) {
  const x = historico?.get(id);
  return {
    nao_vistas: !x,
    erradas: !!x && (x.em_branco_ultima || x.ultima_correta === false),
    marcadas: !!x && x.marcada,
    todas: true
  };
}

function normalizarSelecao(step, selecao) {
  const out = [];
  for (const f of FILTROS_STEP[step] || []) {
    const v = selecao?.[f.dim];
    const lista = (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
    if (lista.length) out.push({ ...f, set: new Set(lista) });
  }
  return out;
}

/* Itens do Step que passam nos filtros. Dentro de uma dimensão vale "ou"; entre
   dimensões vale "e". Sem nada marcado numa dimensão, ela não filtra. Itens de
   formulário reservado ainda não feito pelo aluno (banco.reservados, Set de ids, ver
   itensReservados em formularios.js) ficam fora. */
export function filtrarPool(banco, { step, selecao = {}, situacao = "todas", historico = new Map(), ignorarDim = null, reservados = banco?.reservados || null } = {}) {
  const conds = normalizarSelecao(step, selecao).filter((c) => c.dim !== ignorarDim);
  const sit = SITUACOES.includes(situacao) ? situacao : "todas";
  return (banco?.steps?.[step] || []).filter((q) => !(reservados && reservados.has(q.id)) && conds.every((c) => dentro(q[c.campo], c.set)) && situacaoItem(q.id, historico)[sit]);
}

/* Contagens para a tela: por situação (com os filtros de área aplicados) e, para
   cada dimensão, por chave (com a situação e os filtros das OUTRAS dimensões). */
export function contagemFacetas(banco, { step, selecao = {}, situacao = "todas", historico = new Map() } = {}) {
  const situacoes = {};
  const baseAreas = filtrarPool(banco, { step, selecao, situacao: "todas", historico });
  for (const s of SITUACOES) situacoes[s] = baseAreas.filter((q) => situacaoItem(q.id, historico)[s]).length;
  const dims = {};
  for (const f of FILTROS_STEP[step] || []) {
    const pool = filtrarPool(banco, { step, selecao, situacao, historico, ignorarDim: f.dim });
    const cont = {};
    for (const q of pool) for (const c of new Set(Array.isArray(q[f.campo]) ? q[f.campo] : [q[f.campo]])) if (c) cont[c] = (cont[c] || 0) + 1;
    dims[f.dim] = cont;
  }
  const pool = filtrarPool(banco, { step, selecao, situacao, historico });
  const maxBloco = maximoSemInimigos(pool);
  return { situacoes, dims, disponiveis: pool.length, max_bloco: maxBloco, fora_por_inimigos: pool.length - maxBloco };
}

/* Quantos itens do pool cabem num mesmo bloco sem pares inimigos (as mesmas exclusões
   de semInimigos, em ordem gulosa): é o tamanho máximo que a montagem consegue
   entregar com estes filtros. */
export function maximoSemInimigos(pool) {
  const ids = new Set((pool || []).map((q) => q.id));
  const inimigos = new Map();
  const liga = (a, b) => { if (!ids.has(a) || !ids.has(b) || a === b) return; (inimigos.get(a) || inimigos.set(a, new Set()).get(a)).add(b); (inimigos.get(b) || inimigos.set(b, new Set()).get(b)).add(a); };
  for (const q of pool || []) for (const x of q.inimigos || []) liga(q.id, x);
  const dentro = new Set();
  for (const q of pool || []) if (![...(inimigos.get(q.id) || [])].some((x) => dentro.has(x))) dentro.add(q.id);
  return dentro.size;
}

/* Chaves de uma dimensão na ordem do outline (as que o banco tem e não estão no
   outline vão para o fim) */
export function chavesDaDimensao(step, dim, presentes = []) {
  const oficiais = (TAXONOMIA[step]?.[dim]?.chaves || []).map((k) => k.chave);
  const extras = [...new Set(presentes)].filter((c) => c && !oficiais.includes(c)).sort();
  return [...oficiais, ...extras];
}

export function limiteItens(livre) { return livre ? LIMITES_BLOCO.max_livre : LIMITES_BLOCO.max; }

/* Valida o pedido de bloco; devolve mensagens (vazia = válido) */
export function validarPedidoBloco({ step, n, modo, livre = false, disponiveis = Infinity }) {
  const e = [];
  if (!["step1", "step2ck"].includes(step)) e.push("Escolha o Step.");
  if (!MODOS_BLOCO.includes(modo)) e.push("Escolha o modo: tutor ou cronometrado.");
  const max = limiteItens(livre);
  if (!Number.isInteger(n) || n < LIMITES_BLOCO.min || n > max) e.push("O bloco tem de " + LIMITES_BLOCO.min + " a " + max + " itens" + (livre ? " no modo livre." : ". Para até " + LIMITES_BLOCO.max_livre + ", ligue o modo livre."));
  if (disponiveis === 0) e.push("Nenhum item atende aos filtros escolhidos.");
  return e;
}

/* Sorteio do bloco a partir do pool filtrado: estratificado por sistema, com as não
   vistas primeiro e dificuldade alternada (sortearQuestoes, de simulado.js). Mesma
   semente, mesmo bloco. */
/* Pares inimigos (item.inimigos, CONTRATO-ITEM.md): itens que se entregam um ao
   outro (mesma vinheta, um responde o outro) nunca saem no mesmo bloco. Depois do
   sorteio, cada item cujo inimigo já está no bloco é trocado pelo próximo do pool que
   não conflita. */
export function semInimigos(escolhidos, pool) {
  const ids = new Set();
  const conflita = (q) => (q.inimigos || []).some((x) => ids.has(x)) || [...ids].some((id) => (pool.find((p) => p.id === id)?.inimigos || []).includes(q.id));
  const usados = new Set(escolhidos.map((q) => q.id));
  const out = [];
  for (const q of escolhidos) {
    if (!conflita(q)) { out.push(q); ids.add(q.id); continue; }
    const troca = pool.find((p) => !usados.has(p.id) && !conflita(p));
    if (troca) { usados.add(troca.id); out.push(troca); ids.add(troca.id); }
  }
  return out;
}
export function sortearBlocoBanco(pool, { n, semente = Date.now(), historico = new Map() } = {}) {
  const vistas = (pool || []).filter((q) => historico.has(q.id)).map((q) => q.id);
  return semInimigos(sortearQuestoes(pool, { n, campo: "sistema", vistas, semente }), pool || []);
}

function idSessao(semente) {
  const r = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20) : Math.floor(rng(semente)() * 1e15).toString(36);
  return "bq-" + r;
}

/* Sessão do bloco do banco: mesmo formato de criarSessao (simulado/js/sessao.js),
   com os campos do banco. Cronometrado: 90 s por item, relógio regressivo do bloco.
   Tutor: sem limite de prova; a sessão fecha sozinha depois de 24 h (o relógio da
   tela conta para a frente). */
export function criarBlocoBanco({ step, itens, modo, livre = false, agora = Date.now(), semente = null, criterios = null, dono = null, notas = null }) {
  const n = (itens || []).length;
  const erros = validarPedidoBloco({ step, n, modo, livre, disponiveis: n });
  if (erros.length) throw new Error(erros.join(" "));
  const limite = modo === "cronometrado" ? n * LIMITES_BLOCO.ritmo_ms : LIMITES_BLOCO.tutor_limite_ms;
  const s = criarSessao({ step, questoes: itens, agora, limite_ms: limite, semente });
  s.origem = "banco";
  s.id = idSessao(agora + (semente || 0));
  s.modo = modo;
  s.livre = !!livre;
  s.confirmadas = Array(n).fill(false);
  s.criterios = criterios || null;
  s.dono = dono;
  if (Array.isArray(notas) && notas.length === n) s.notas = notas.map((t) => String(t || "").slice(0, 2000));
  return s;
}

/* Tutor: confirmar a resposta trava a alternativa e mostra a explicação */
export function confirmarResposta(s, i) {
  if (s.encerrada) throw new Error("O bloco já foi encerrado e não pode ser alterado.");
  if (s.modo !== "tutor") return s;
  if (s.respostas[i] === null) throw new Error("Escolha uma alternativa antes de confirmar.");
  if (!Array.isArray(s.confirmadas)) s.confirmadas = Array(s.ids.length).fill(false);
  s.confirmadas[i] = true;
  return s;
}
export const travada = (s, i) => s?.modo === "tutor" && !!s.confirmadas?.[i];

/* Respostas por item de uma sessão encerrada, prontas para store.saveRespostas.
   O acerto é calculado aqui e recalculado pela camada de dados quando o item está
   no banco. Todas levam a data do fim do bloco. */
export function paraRespostasBanco(s, porId) {
  if (!s?.encerrada) throw new Error("Encerre o bloco antes de gravar.");
  const get = (id) => (porId instanceof Map ? porId.get(id) : porId?.[id]);
  const fim = new Date(s.fim).toISOString();
  return s.ids.map((id, i) => {
    const q = get(id);
    const resposta = s.respostas[i] || null;
    return {
      questao_id: id,
      step: q?.step || s.step,
      resposta,
      correta: !!q && resposta !== null && resposta === q.correta,
      tempo_ms: Math.min(86400000, Math.max(0, Math.round(s.tempos_ms[i] || 0))),
      marcada: !!s.marcadas[i],
      modo: s.modo === "tutor" ? "tutor" : "cronometrado",
      origem: "banco",
      sessao_id: s.id,
      bloco: null,
      posicao: i,
      versao_item: q?.versao ?? null,
      respondida_em: fim
    };
  });
}

/* ---------- histórico de blocos ----------
   Agrupa as respostas de origem "banco" por sessao_id. Devolve do mais recente para
   o mais antigo: { id, step, modo, fim, n, respondidas, acertos, em_branco, marcadas,
   tempo_ms, percentual, esperado_limiar, itens: [{ posicao, questao_id, resposta,
   correta, marcada, tempo_ms }] }. */
export function resumoBlocos(respostas, itens = null) {
  const get = itens instanceof Map ? (id) => itens.get(id) : (id) => itens?.[id];
  const grupos = new Map();
  const ja = new Set();
  for (const r of respostas || []) {
    if ((r.origem || "banco") !== "banco" || !r.sessao_id) continue;
    /* a mesma linha duas vezes (reenvio depois de falha de rede, ou a cópia pendente
       do navegador somada à da conta) conta uma vez só */
    const k = r.sessao_id + "|" + (r.posicao ?? "") + "|" + r.questao_id;
    if (ja.has(k)) continue;
    ja.add(k);
    (grupos.get(r.sessao_id) || grupos.set(r.sessao_id, []).get(r.sessao_id)).push(r);
  }
  const out = [];
  for (const [id, lista] of grupos) {
    lista.sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0));
    const resp = lista.filter((r) => r.resposta !== null && r.resposta !== undefined && r.resposta !== "");
    const acertos = lista.filter((r) => r.correta).length;
    const angs = lista.map((r) => get(r.questao_id)?.angoff).filter(Number.isFinite);
    out.push({
      id,
      step: lista[0].step,
      modo: lista.some((r) => r.modo === "tutor") ? "tutor" : "cronometrado",
      fim: lista.reduce((m, r) => (String(r.respondida_em) > m ? String(r.respondida_em) : m), ""),
      n: lista.length,
      respondidas: resp.length,
      acertos,
      em_branco: lista.length - resp.length,
      marcadas: lista.filter((r) => r.marcada).length,
      tempo_ms: lista.reduce((t, r) => t + (r.tempo_ms || 0), 0),
      percentual: lista.length ? acertos / lista.length : 0,
      esperado_limiar: angs.length ? angs.reduce((a, b) => a + b, 0) / angs.length : null,
      itens: lista.map((r) => ({ posicao: r.posicao ?? 0, questao_id: r.questao_id, resposta: r.resposta ?? null, correta: !!r.correta, marcada: !!r.marcada, tempo_ms: r.tempo_ms || 0 }))
    });
  }
  return out.sort((a, b) => b.fim.localeCompare(a.fim) || (a.id < b.id ? 1 : -1));
}

/* Acerto de um bloco por chave de uma dimensão: [{ chave, total, acertos, taxa, esperado_limiar }] */
export function blocoPorArea(bloco, itens, campo) {
  const get = itens instanceof Map ? (id) => itens.get(id) : (id) => itens?.[id];
  const m = new Map();
  for (const it of bloco?.itens || []) {
    const q = get(it.questao_id);
    if (!q) continue;
    const v = q[campo];
    for (const c of new Set(Array.isArray(v) ? v : [v])) {
      if (!c) continue;
      const o = m.get(c) || m.set(c, { chave: c, total: 0, acertos: 0, soma_angoff: 0 }).get(c);
      o.total++; if (it.correta) o.acertos++; o.soma_angoff += q.angoff;
    }
  }
  return [...m.values()].map((o) => ({ chave: o.chave, total: o.total, acertos: o.acertos, taxa: o.acertos / o.total, esperado_limiar: o.soma_angoff / o.total }))
    .sort((a, b) => (a.taxa - a.esperado_limiar) - (b.taxa - b.esperado_limiar) || (a.chave < b.chave ? -1 : 1));
}

/* ---------- curva de evolução ----------
   Um ponto por sessão (bloco do banco, simulado completo ou bloco de 30 minutos),
   na data em que ela terminou: P(aprovação) e theta com todas as respostas até ali
   (mesmas regras de prepararRespostas: primeira resposta, pesos do modo), mais o
   acerto da própria sessão e o acerto esperado do examinando no limiar nos mesmos
   itens. maxPontos: se houver mais sessões, ficam as mais recentes. */
export function curvaEvolucao({ respostas, itens, step, pesos = PESOS_MODO, priori = PRIORI_PADRAO, maxPontos = 40, efeitoModo = null }) {
  const get = itens instanceof Map ? (id) => itens.get(id) : (id) => itens?.[id];
  const sessoes = new Map();
  for (const r of respostas || []) {
    const q = get(r.questao_id);
    if (!q || q.step !== step) continue;
    const chave = r.sessao_id || (r.origem || "banco") + ":" + String(r.respondida_em || "").slice(0, 10);
    const s = sessoes.get(chave) || sessoes.set(chave, { chave, origem: r.origem || "banco", fim: "", total: 0, acertos: 0, soma_angoff: 0 }).get(chave);
    if (String(r.respondida_em) > s.fim) s.fim = String(r.respondida_em);
    s.total++; if (r.correta) s.acertos++; s.soma_angoff += q.angoff;
  }
  const lista = [...sessoes.values()].sort((a, b) => a.fim.localeCompare(b.fim)).slice(-maxPontos);
  return lista.map((s) => {
    /* mesmas contas do painel: repesagem pelo outline e incerteza do padrão */
    const { usadas: brutas } = prepararRespostas(respostas, itens, { step, pesos, ate: s.fim, efeitoModo });
    const usadas = ponderarPeloOutline(brutas, pesosDoOutline(step)).usadas;
    const est = eap(usadas, { priori, sigmaCorte: incertezaCorte(brutas).sigma });
    return {
      sessao: s.chave, origem: s.origem, ate: s.fim,
      n: est.n, n_efetivo: est.n_efetivo, p_aprovacao: est.p_aprovacao, theta: est.theta, ic90: est.ic90,
      sessao_total: s.total, sessao_acertos: s.acertos, sessao_taxa: s.total ? s.acertos / s.total : null,
      sessao_limiar: s.total ? s.soma_angoff / s.total : null
    };
  });
}

/* ---------- contribuição de cada área ----------
   Pergunta: quanto a probabilidade de aprovação subiria se, só nesta área, o aluno
   tivesse acertado exatamente o que o examinando no limiar acerta? Para cada item
   da área, a resposta observada x_i é trocada pela resposta esperada no limiar,
   a_i = expit(-b_i) (o Angoff, ou o b calibrado), como pseudo-resposta fracionária:
   w [a_i ln P_i(θ) + (1 - a_i) ln(1 - P_i(θ))], escrita como duas respostas
   pesadas (acerto com peso w a_i e erro com peso w (1 - a_i)). As demais áreas
   ficam como estão.
     ganho = P(aprovação | área no limiar) - P(aprovação | respostas)
   ganho > 0: a área derruba a probabilidade; ganho < 0: a área a sustenta.
   deficit = soma de (a_i - x_i) na área: acertos que faltaram para o limiar.
   As contribuições não se somam (P não é linear e, nas disciplinas, um item
   conta em mais de um rótulo). */
/* Log-posterior na grade, aditivo por item: a priori mais, para cada b, o termo
   s1 ln expit(t - b) + s0 ln expit(b - t) = (s1 + s0) ln expit(t - b) - s0 (t - b),
   a mesma conta de posteriorGrade (psicometria.js). Ser aditivo permite calcular a
   base uma vez e, em cada área, somar só a diferença entre as pseudo-respostas do
   limiar e as respostas observadas (com pesos que podem ser negativos). Assim o custo
   cai de (áreas x itens) para (itens x rótulos por item), o que importa quando os b
   calibrados deixam de se repetir e o aluno tem centenas de respostas. */
function logExpit(z) { return z > 0 ? -Math.log1p(Math.exp(-z)) : z - Math.log1p(Math.exp(z)); }
function somarTermos(lp, pontos, porB) {
  for (const [b, [s1, s0]] of porB) {
    if (!s1 && !s0) continue;
    const s = s1 + s0;
    for (let k = 0; k < pontos.length; k++) { const z = pontos[k] - b; lp[k] += s * logExpit(z) - s0 * z; }
  }
}
function acumularB(porB, b, s1, s0) {
  const g = porB.get(b) || porB.set(b, [0, 0]).get(b);
  g[0] += s1; g[1] += s0;
}
function pAcimaDeLp(lp, pontos, sigma = 0, mu = 0) {
  let max = -Infinity;
  for (let k = 0; k < lp.length; k++) if (lp[k] > max) max = lp[k];
  const dens = new Float64Array(lp.length);
  let area = 0;
  for (let k = 0; k < lp.length; k++) dens[k] = Math.exp(lp[k] - max);
  for (let k = 1; k < lp.length; k++) area += 0.5 * (dens[k] + dens[k - 1]) * (pontos[k] - pontos[k - 1]);
  for (let k = 0; k < lp.length; k++) dens[k] /= area;
  return pAcimaDoCorte({ pontos, dens }, sigma, null, mu);
}

/* minItens: área com menos itens fica com ganho null e poucos_itens: true (o mesmo
   mínimo de 5 do perfil por área); sigmaCorte: incerteza do padrão, a mesma do painel;
   centroCorte: posição do limiar (0 no padrão do banco; o corte ligado à NBME quando
   estiver em uso). "Área no limiar" troca as respostas pelas do examinando nesse ponto. */
export function contribuicaoPorArea(usadas, dim, { step = null, priori = PRIORI_PADRAO, grade = GRADE_PADRAO, sigmaCorte = undefined, centroCorte = 0, minItens = PERFIL_PADRAO.min_itens } = {}) {
  const validas = (usadas || []).filter((u) => Number.isFinite(u.b) && (u.w === undefined || u.w > 0));
  const sig = Number.isFinite(sigmaCorte) ? sigmaCorte : incertezaCorte(validas).sigma;
  const mu = Number.isFinite(centroCorte) ? centroCorte : 0;
  const base = eap(validas, { priori, grade, sigmaCorte: sig, centroCorte: mu }).p_aprovacao;
  const grupos = new Map();
  for (const u of validas) {
    const v = u.item?.[dim];
    for (const c of new Set(Array.isArray(v) ? v : [v])) if (c) (grupos.get(c) || grupos.set(c, []).get(c)).push(u);
  }
  const taxDim = dim === "disciplinas" ? "disciplina" : dim === "disciplinas_oficiais" ? "disciplina_oficial" : dim;
  const faixas = new Map((TAXONOMIA[step]?.[taxDim]?.chaves || []).map((k) => [k.chave, k.faixa]));
  const pontos = pontosGrade(grade);
  const lpBase = new Float64Array(pontos.length);
  const s2 = priori.dp * priori.dp;
  for (let k = 0; k < pontos.length; k++) { const d = pontos[k] - priori.media; lpBase[k] = -0.5 * d * d / s2; }
  const porBBase = new Map();
  for (const u of validas) { const w = u.w === undefined ? 1 : u.w; acumularB(porBBase, u.b, u.x ? w : 0, u.x ? 0 : w); }
  somarTermos(lpBase, pontos, porBBase);
  const out = [];
  for (const [chave, lista] of grupos) {
    let n = 0, acertos = 0, esperado = 0;
    const delta = new Map();
    for (const u of lista) {
      const a = expit(mu - u.b);
      const w = u.w === undefined ? 1 : u.w;
      n++; acertos += u.x; esperado += a;
      /* troca a resposta observada (peso w em x) pela esperada no limiar (w a acerto, w (1 - a) erro) */
      acumularB(delta, u.b, w * a - (u.x ? w : 0), w * (1 - a) - (u.x ? 0 : w));
    }
    const lp = Float64Array.from(lpBase);
    somarTermos(lp, pontos, delta);
    const pLim = pAcimaDeLp(lp, pontos, sig, mu);
    const fx = faixas.get(chave);
    const poucos = n < minItens;
    out.push({
      chave, n, acertos, esperado_limiar: esperado, deficit: esperado - acertos,
      taxa: n ? acertos / n : null, taxa_limiar: n ? esperado / n : null,
      p_atual: base, p_area_no_limiar: pLim, ganho: poucos ? null : pLim - base, ganho_bruto: pLim - base, poucos_itens: poucos,
      peso_prova: fx ? (fx[0] + fx[1]) / 200 : null
    });
  }
  /* ganho arredondado em 1e-9: empates de ruído numérico caem no déficit e no nome;
     as áreas com poucos itens vão para o fim */
  const g = (x) => (x.ganho === null ? -Infinity : Math.round(x.ganho * 1e9));
  return out.sort((a, b) => g(b) - g(a) || b.deficit - a.deficit || (a.chave < b.chave ? -1 : 1));
}

/* ---------- recomendações de estudo ----------
   Ligações (caminhos relativos a uma página um nível abaixo da raiz, como questoes/
   e anki/):
   - Conteúdo do Step 1 (conteudo-step1.html): âncora da seção do sistema;
   - flashcards (anki/#/estudar com o filtro, em modo treino);
   - banco: bloco já filtrado (questoes/#/criar?...). */
export const ANCORAS_CONTEUDO_S1 = Object.freeze({
  desenvolvimento_humano: ["s-dev"], sangue_imune: ["s-imune", "s-sangue"], comportamento_nervoso: ["s-comportamento", "s-neuro"],
  musculoesqueletico_pele: ["s-pele", "s-msk"], cardiovascular: ["s-cardio"], respiratorio_renal: ["s-resp", "s-renal"],
  gastrointestinal: ["s-gi"], reprodutor_endocrino: ["s-endocrino", "s-feminino", "s-masculino", "s-gestacao"],
  multissistemico: ["s-multi"], bioestatistica: ["s-bioest"], ciencias_sociais: ["s-social"]
});
/* Sistema do Step 2 CK -> sistema do Step 1 com a ciência básica correspondente
   (os flashcards e o Conteúdo do Step 1 seguem o outline do Step 1) */
export const BASE_S1_DO_CK = Object.freeze({
  ciencias_sociais_etica_seguranca: "ciencias_sociais", renal_urinario_reprodutor: "respiratorio_renal", cardiovascular: "cardiovascular",
  musculoesqueletico_pele: "musculoesqueletico_pele", saude_comportamental: "comportamento_nervoso", sangue_imune: "sangue_imune",
  gastrointestinal: "gastrointestinal", nervoso_sentidos: "comportamento_nervoso", respiratorio: "respiratorio_renal",
  multissistemico: "multissistemico", endocrino: "reprodutor_endocrino", gestacao_parto_puerperio: "reprodutor_endocrino",
  bioestatistica_epidemiologia: "bioestatistica", desenvolvimento_humano: "desenvolvimento_humano"
});
const ANCORA_CK_ESPECIFICA = Object.freeze({ renal_urinario_reprodutor: "s-renal", respiratorio: "s-resp", nervoso_sentidos: "s-neuro", saude_comportamental: "s-comportamento", endocrino: "s-endocrino", gestacao_parto_puerperio: "s-gestacao" });

export function linkBloco({ step, dim, chave, situacao = "nao_vistas", base = "#/" }) {
  const p = new URLSearchParams({ step, situacao });
  if (dim && chave) p.set(dim, chave);
  return base + "criar?" + p.toString();
}

/* Links de estudo de uma chave. base: prefixo das rotas do banco ("#/" dentro de
   questoes/, "../questoes/#/" a partir de anki/). */
export function linksDeEstudo(step, dim, chave, { base = "#/", situacao = "nao_vistas" } = {}) {
  const links = [];
  const sisS1 = step === "step1" ? (dim === "sistema" ? chave : null) : dim === "sistema" ? BASE_S1_DO_CK[chave] : null;
  if (sisS1) {
    const anc = step === "step2ck" && ANCORA_CK_ESPECIFICA[chave] ? ANCORA_CK_ESPECIFICA[chave] : (ANCORAS_CONTEUDO_S1[sisS1] || [])[0];
    if (anc) links.push({ tipo: "conteudo", rotulo: step === "step1" ? "Conteúdo do Step 1" : "Base no Conteúdo do Step 1", href: "../conteudo-step1.html#" + anc });
    links.push({ tipo: "flashcards", rotulo: step === "step1" ? "Flashcards do sistema" : "Flashcards da ciência básica", href: "../anki/#/estudar?" + new URLSearchParams({ sistema: sisS1, modo: "treino" }).toString() });
  }
  if (step === "step1" && dim === "disciplinas") {
    links.push({ tipo: "flashcards", rotulo: "Flashcards da disciplina", href: "../anki/#/estudar?" + new URLSearchParams({ disciplina: chave, modo: "treino" }).toString() });
  }
  const dimFiltro = dim === "disciplinas" ? "disciplina" : dim === "disciplinas_oficiais" ? "disciplina_oficial" : dim;
  links.push({ tipo: "banco", rotulo: "Bloco de itens " + (situacao === "erradas" ? "errados" : "não vistos"), href: linkBloco({ step, dim: dimFiltro, chave, situacao, base }) });
  return links;
}

const fmtPp = (x) => (Math.round(x * 1000) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nomeDim = (step, dim, chave) => nomeChave(step, dim === "disciplinas" ? "disciplina" : dim === "disciplinas_oficiais" ? "disciplina_oficial" : dim, chave);

/* Lista de recomendações, da mais urgente para a menos:
   1. áreas que mais derrubam a probabilidade (ganho >= 0,5 ponto percentual);
   2. sistemas do outline sem item respondido (cobertura da regra de confiança);
   3. quantos itens faltam para a contagem mínima N, com o lembrete do peso do tutor. */
export function recomendacoes({ step, est, contribuicao, historico = new Map(), banco = null, base = "#/", maxAreas = 5, ganhoMin = 0.005 }) {
  const out = [];
  /* só áreas com pelo menos 5 itens (o mesmo mínimo do perfil): com 1 ou 2 itens o
     ganho é ruído */
  const vistasRec = new Set();
  for (const c of (contribuicao?.sistema || []).filter((x) => x.ganho !== null && x.ganho >= ganhoMin).slice(0, maxAreas)) {
    const erradas = c.n - c.acertos > 0;
    vistasRec.add(c.chave);
    out.push({
      tipo: "area", dim: "sistema", chave: c.chave, nome: nomeDim(step, "sistema", c.chave), ganho: c.ganho,
      texto: "Você acertou " + c.acertos + " de " + c.n + "; o examinando no limiar acertaria " + fmtPp(c.taxa_limiar).replace(",0", "") + "% destes itens. Se aqui você ficasse no nível do limiar, a probabilidade subiria " + fmtPp(c.ganho) + " pontos.",
      links: linksDeEstudo(step, "sistema", c.chave, { base, situacao: erradas ? "erradas" : "nao_vistas" })
    });
  }
  /* No Step 1, a competência de aprendizado baseado na prática e a de comunicação
     coincidem item a item com os sistemas de bioestatística e de ciências sociais; a
     recomendação da competência sai quando os mesmos itens já foram recomendados pelo
     sistema. */
  const MESMOS_ITENS_S1 = { aprendizagem_pratica: "bioestatistica", comunicacao_interpessoal: "ciencias_sociais" };
  for (const d of ["disciplinas", "disciplinas_oficiais", "competencia"]) {
    const top = (contribuicao?.[d] || []).find((x) => x.ganho !== null && x.ganho >= ganhoMin && !(step === "step1" && d === "competencia" && vistasRec.has(MESMOS_ITENS_S1[x.chave])));
    if (top) out.push({
      tipo: "area", dim: d, chave: top.chave, nome: nomeDim(step, d, top.chave), ganho: top.ganho,
      texto: (d === "competencia" ? "Competência" : "Disciplina") + " que mais pesa: " + top.acertos + " de " + top.n + " certas, contra " + fmtPp(top.taxa_limiar).replace(",0", "") + "% esperados no limiar. No nível do limiar aqui, a probabilidade subiria " + fmtPp(top.ganho) + " pontos.",
      links: linksDeEstudo(step, d, top.chave, { base })
    });
  }
  const faltam = est?.confianca?.faltam_sistemas || [];
  if (faltam.length) {
    out.push({
      tipo: "cobertura", dim: "sistema", chaves: faltam,
      nome: faltam.length === 1 ? "1 sistema com poucos itens respondidos" : faltam.length + " sistemas com poucos itens respondidos",
      texto: "A regra de precisão pede itens suficientes em pelo menos " + Math.round(REGRA_CONFIANCA.cobertura_min * 100) + "% dos sistemas do outline: pelo menos " + REGRA_CONFIANCA.min_por_sistema + " em cada um e metade do que o peso do sistema pede. Faltam: " + faltam.map((k) => nomeDim(step, "sistema", k) + (est?.cobertura?.minimos ? " (" + (est.cobertura.itens?.[k] ?? 0) + " de " + est.cobertura.minimos[k] + ")" : "")).join("; ") + ".",
      links: faltam.slice(0, 4).map((k) => ({ tipo: "banco", rotulo: nomeDim(step, "sistema", k), href: linkBloco({ step, dim: "sistema", chave: k, base }) }))
    });
  }
  const fm = est?.confianca?.faltam_itens_minimo || 0;
  if (fm > 0) {
    out.push({
      tipo: "volume", nome: "Mais " + fm + (fm === 1 ? " item" : " itens") + " para a contagem mínima",
      texto: "A contagem mínima para a precisão exigida é de " + est.confianca.n_minimo + " itens. No modo cronometrado cada item vale 1; no tutor, 0,5. Blocos cronometrados de 20 itens chegam lá mais rápido e se parecem mais com a prova.",
      links: [{ tipo: "banco", rotulo: "Bloco cronometrado de 20 itens", href: base + "criar?" + new URLSearchParams({ step, situacao: "nao_vistas", modo: "cronometrado", n: "20" }).toString() }]
    });
  }
  /* áreas (sistema, disciplina, competência) juntas, da que mais mexe na
     probabilidade para a que menos; depois cobertura e volume */
  const areas = out.filter((x) => x.tipo === "area").sort((a, b) => b.ganho - a.ganho);
  return [...areas, ...out.filter((x) => x.tipo !== "area")];
}

/* ---------- painel de probabilidade ----------
   Junta tudo o que a tela precisa para um Step. banco: carregarBanco(); respostas:
   listRespostas(); modelos: getModelosPsicometricos(); nbme: listNbme(); config:
   getConfigPlataforma(). */
export function resumoAprovacao({ banco, respostas, step, modelos = null, nbme = [], config = CONFIG_PADRAO, base = "#/" }) {
  const itens = banco.porId;
  const modelo = modelos?.[step] || null;
  const est = estimarAluno({
    step, respostas, itens, sistemas: sistemasDoOutline(step), pesosSistemas: pesosDoOutline(step),
    modeloDesfechos: modelo?.desfechos || null,
    modeloEscore: step === "step2ck" ? modelo?.escore_oficial || null : null,
    ligacaoNbme: modelo?.ligacao_nbme || null,
    efeitoModo: modelo?.efeito_modo || null
  });
  /* a contribuição parte das mesmas respostas (com a repesagem) e do mesmo padrão */
  const usadas = est.usadas;
  const dims = step === "step1" ? ["sistema", "disciplinas", "competencia"] : ["sistema", "disciplinas_oficiais", "competencia", "area"];
  const contribuicao = {};
  for (const d of dims) contribuicao[d] = contribuicaoPorArea(usadas, d, { step, sigmaCorte: est.corte.sigma, centroCorte: est.corte.centro || 0 });
  const historico = historicoItens(respostas);
  const recs = recomendacoes({ step, est, contribuicao, historico, banco, base });
  const pr = prontidaoCombinada({ exit18: prontidao((nbme || []).filter((x) => x.step === step), step, config), banco: est.n ? est : null });
  return {
    step, est, contribuicao, recomendacoes: recs, prontidao: pr,
    modelo_demonstracao: !!modelo?.demonstracao,
    limiar_texto: step === "step2ck"
      ? "Probabilidade de estar acima do limiar do banco, fixado para representar o padrão de aprovação do Step 2 CK (" + PADRAO_STEP2CK + " desde 01/07/2025). Padrão " + (padraoProvisorio(est.corte.origem) ? "provisório, pela dificuldade-alvo dos itens" : nomePadrao(est.corte.origem)) + "."
      : "Probabilidade de estar acima do limiar do banco, fixado para representar o padrão de aprovação do Step 1 (Pass/Fail). Padrão " + (padraoProvisorio(est.corte.origem) ? "provisório, pela dificuldade-alvo dos itens" : nomePadrao(est.corte.origem)) + ".",
    itens_no_banco: banco.contagem?.[step] || 0,
    nao_vistos: (banco.steps?.[step] || []).filter((q) => !historico.has(q.id) && !(banco.reservados && banco.reservados.has(q.id))).length,
    reservados: (banco.steps?.[step] || []).filter((q) => banco.reservados && banco.reservados.has(q.id) && !historico.has(q.id)).length,
    formularios_reservados: (banco.reservados_info || []).filter((f) => f.step === step)
  };
}

/* Densidade posterior de theta para desenhar (pontos a cada passo, entre min e max) */
/* centro: posição do limiar em uso; a curva sai em distância ao limiar (theta - centro) */
export function curvaPosterior(respostas, itens, step, { min = -4, max = 4, passo = 0.05, priori = PRIORI_PADRAO, efeitoModo = null, centro = 0 } = {}) {
  const { usadas: brutas } = prepararRespostas(respostas, itens, { step, efeitoModo });
  const usadas = ponderarPeloOutline(brutas, pesosDoOutline(step)).usadas;
  const r = eap(usadas, { priori, incluirPosterior: true, sigmaCorte: incertezaCorte(brutas).sigma });
  const { pontos, dens } = r.posterior;
  const out = [];
  const k = Math.max(1, Math.round(passo / (pontos[1] - pontos[0])));
  for (let i = 0; i < pontos.length; i += k) { const x = pontos[i] - centro; if (x >= min - 1e-9 && x <= max + 1e-9) out.push([Math.round(x * 1000) / 1000, dens[i]]); }
  return { pontos: out, theta: r.theta - centro, ic90: [r.ic90[0] - centro, r.ic90[1] - centro], p: r.p_aprovacao };
}

/* Estatística rápida do aluno no Step: itens no banco, vistos, não vistos, certos
   na primeira tentativa, marcados */
export function estatisticasAluno(banco, historico, step) {
  const reserv = banco?.reservados || null;
  const todosIds = (banco?.steps?.[step] || []).map((q) => q.id);
  const ids = reserv ? todosIds.filter((id) => !reserv.has(id) || historico.has(id)) : todosIds;
  let vistos = 0, certos1 = 0, resp1 = 0, marcados = 0, erradas = 0;
  for (const id of ids) {
    const h = historico.get(id);
    if (!h) continue;
    vistos++;
    if (h.primeira_correta !== null) { resp1++; if (h.primeira_correta) certos1++; }
    if (h.marcada) marcados++;
    if (h.em_branco_ultima || h.ultima_correta === false) erradas++;
  }
  return { total: ids.length, vistos, nao_vistos: ids.length - vistos, marcados, erradas, primeira_respondidas: resp1, primeira_certas: certos1, taxa_primeira: resp1 ? certos1 / resp1 : null, reservados: todosIds.length - ids.length };
}
