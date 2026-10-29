/* Road to America | psicometria do banco de questões.

   Modelo de Rasch ancorado no padrão de Angoff, estimativa EAP em grade,
   probabilidade de aprovação, regra de confiança, percentual esperado num
   formulário completo, perfil por área em relação ao limiar, análise de itens
   (dificuldade, ponto-bisserial corrigida, distratores, infit e outfit),
   recalibração regularizada e regressão com desfechos reais.

   JavaScript puro, sem dependências e determinístico (nenhuma chamada a
   Math.random; as simulações recebem o gerador como parâmetro).
   Fórmulas, fontes e limitações em plataforma/PSICOMETRIA.md. */

/* ---------- parâmetros do método (PSICOMETRIA.md, seção 2) ---------- */
export const PRIORI_PADRAO = Object.freeze({ media: 0, dp: 1.5 });
export const GRADE_PADRAO = Object.freeze({ min: -6, max: 6, passo: 0.01 });
/* Critérios internos da Road to America; a justificativa de cada número está em PSICOMETRIA.md */
export const REGRA_CONFIANCA = Object.freeze({ p_alta: 0.9, p_baixa: 0.1, dp_max: 0.25, cobertura_min: 0.8, min_por_sistema: 1 });
export const PESOS_MODO = Object.freeze({ cronometrado: 1, tutor: 0.5 });

/* Texto único da probabilidade de aprovação, usado no banco, em "Meu progresso", nos
   simulados e na área administrativa, para que o mesmo número apareça igual em todas as
   telas. Inteiro, porque o modelo não tem precisão de décimos; "< 1%" e "> 99%" nas
   pontas, porque a estimativa nunca é certeza; uma casa decimal só quando o
   arredondamento cruzaria um corte da alta confiança (89,7% não pode aparecer como 90%
   ao lado de "estimativa preliminar", nem 10,3% como 10%). */
export function textoProbabilidade(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return "sem dados";
  if (p > 0.995) return "> 99%";
  if (p < 0.005) return "< 1%";
  const { p_alta, p_baixa } = REGRA_CONFIANCA;
  const inteiro = Math.round(p * 100);
  let v = inteiro;
  if (p < p_alta && inteiro >= Math.round(p_alta * 100)) v = Math.floor(p * 1000 + 1e-9) / 10;
  else if (p > p_baixa && inteiro <= Math.round(p_baixa * 100)) v = Math.ceil(p * 1000 - 1e-9) / 10;
  return String(v).replace(".", ",") + "%";
}
export const PERFIL_PADRAO = Object.freeze({ min_itens: 5, prob: 0.9, priori: PRIORI_PADRAO });
export const LIMIARES_ITEM = Object.freeze({ p_min: 0.2, p_max: 0.95, pbis_min: 0.1, ajuste_min: 0.7, ajuste_max: 1.3, n_min: 30, grupo: 0.27, distrator_funcional: 0.05, min_itens_pessoa: 2 });
export const RECALIBRACAO_PADRAO = Object.freeze({ tau: 0.5, priori_theta: PRIORI_PADRAO, max_iter: 300, tol: 1e-5, ancoragem: "tcc" });
export const DESFECHOS_PADRAO = Object.freeze({ min_por_classe: 10, min_escores: 30 });
/* Padrão mínimo de aprovação do Step 2 CK desde 01/07/2025
   (https://usmle.org/scores-transcripts/examination-results-and-scoring) */
export const PADRAO_STEP2CK = 218;
const Z90 = 1.2815515655446004; /* quantil 0,90 da normal padrão */

/* ---------- funções básicas ---------- */
export function expit(x) {
  if (x >= 0) { const e = Math.exp(-x); return 1 / (1 + e); }
  const e = Math.exp(x); return e / (1 + e);
}
export function logit(p) { return Math.log(p / (1 - p)); }
function logExpit(z) { return z > 0 ? -Math.log1p(Math.exp(-z)) : z - Math.log1p(Math.exp(z)); }

/* Função de distribuição da normal padrão (Abramowitz e Stegun 7.1.26, erro < 1,5e-7) */
export function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/* Dificuldade de Rasch ancorada no limiar: b = -logit(angoff).
   O examinando no limiar (theta = 0) acerta o item com probabilidade angoff. */
export function bDeAngoff(angoff) {
  const a = Math.min(0.999, Math.max(0.001, Number(angoff)));
  return -logit(a);
}
/* b de um item normalizado por banco.js: usa o calibrado quando existir e for pedido */
export function bDoItem(item, { usarCalibrado = true } = {}) {
  if (usarCalibrado && item && Number.isFinite(item.b_calibrado)) return item.b_calibrado;
  if (item && Number.isFinite(item.b_angoff)) return item.b_angoff;
  return bDeAngoff(item?.angoff ?? 0.65);
}
export function probAcerto(theta, b) { return expit(theta - b); }

/* ---------- grade e posterior ---------- */
export function pontosGrade(g = GRADE_PADRAO) {
  const n = Math.round((g.max - g.min) / g.passo) + 1;
  const p = new Float64Array(n);
  for (let i = 0; i < n; i++) p[i] = g.min + i * g.passo;
  return p;
}

/* respostas: [{ b, x (0 ou 1), w (peso, padrão 1) }]
   Devolve { pontos, dens } com dens normalizada pela regra do trapézio. */
export function posteriorGrade(respostas, { priori = PRIORI_PADRAO, grade = GRADE_PADRAO } = {}) {
  const pontos = pontosGrade(grade);
  const K = pontos.length;
  const lp = new Float64Array(K);
  const s2 = priori.dp * priori.dp;
  for (let i = 0; i < K; i++) { const d = pontos[i] - priori.media; lp[i] = -0.5 * d * d / s2; }
  /* respostas com o mesmo b somam acertos e erros (pesados) num termo só:
     s1 log expit(t - b) + s0 log expit(b - t), com log expit(b - t) = log expit(t - b) - (t - b) */
  const porB = new Map();
  for (const r of respostas || []) {
    const w = r.w === undefined ? 1 : Number(r.w);
    if (!(w > 0) || !Number.isFinite(r.b)) continue;
    const g = porB.get(r.b) || porB.set(r.b, [0, 0]).get(r.b);
    if (r.x) g[0] += w; else g[1] += w;
  }
  for (const [b, [s1, s0]] of porB) {
    const s = s1 + s0;
    for (let i = 0; i < K; i++) {
      const z = pontos[i] - b;
      lp[i] += s * logExpit(z) - s0 * z;
    }
  }
  let max = -Infinity;
  for (let i = 0; i < K; i++) if (lp[i] > max) max = lp[i];
  const dens = new Float64Array(K);
  for (let i = 0; i < K; i++) dens[i] = Math.exp(lp[i] - max);
  let area = 0;
  for (let i = 1; i < K; i++) area += 0.5 * (dens[i] + dens[i - 1]) * (pontos[i] - pontos[i - 1]);
  for (let i = 0; i < K; i++) dens[i] /= area;
  return { pontos, dens };
}

function acumulada(post) {
  const { pontos, dens } = post;
  const c = new Float64Array(pontos.length);
  for (let i = 1; i < pontos.length; i++) c[i] = c[i - 1] + 0.5 * (dens[i] + dens[i - 1]) * (pontos[i] - pontos[i - 1]);
  return c;
}
/* P(theta <= x | respostas) */
export function cdfPosterior(post, x, cum = acumulada(post)) {
  const { pontos } = post;
  if (x <= pontos[0]) return 0;
  if (x >= pontos[pontos.length - 1]) return 1;
  const passo = pontos[1] - pontos[0];
  const i = Math.min(pontos.length - 2, Math.floor((x - pontos[0]) / passo));
  const f = (x - pontos[i]) / (pontos[i + 1] - pontos[i]);
  return Math.min(1, Math.max(0, cum[i] + f * (cum[i + 1] - cum[i])));
}
export function quantilPosterior(post, q, cum = acumulada(post)) {
  const { pontos } = post;
  const alvo = q * cum[cum.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < alvo) lo = m; else hi = m; }
  const d = cum[hi] - cum[lo];
  const f = d > 0 ? (alvo - cum[lo]) / d : 0;
  return pontos[lo] + f * (pontos[hi] - pontos[lo]);
}
export function resumirPosterior(post, { limiar = 0, intervalo = 0.9 } = {}) {
  const { pontos, dens } = post;
  const cum = acumulada(post);
  let m = 0, m2 = 0;
  for (let i = 1; i < pontos.length; i++) {
    const h = pontos[i] - pontos[i - 1];
    m += 0.5 * h * (dens[i] * pontos[i] + dens[i - 1] * pontos[i - 1]);
    m2 += 0.5 * h * (dens[i] * pontos[i] * pontos[i] + dens[i - 1] * pontos[i - 1] * pontos[i - 1]);
  }
  const a = (1 - intervalo) / 2;
  return {
    theta: m,
    dp: Math.sqrt(Math.max(0, m2 - m * m)),
    ic: [quantilPosterior(post, a, cum), quantilPosterior(post, 1 - a, cum)],
    p_acima: 1 - cdfPosterior(post, limiar, cum)
  };
}

/* EAP: média a posteriori de theta, desvio-padrão posterior, intervalo de
   credibilidade de 90% e P(theta > 0), que é a probabilidade de estar acima do
   limiar de aprovação do banco. */
export function eap(respostas, { priori = PRIORI_PADRAO, grade = GRADE_PADRAO, incluirPosterior = false } = {}) {
  const lista = (respostas || []).filter((r) => Number.isFinite(r.b) && (r.w === undefined || r.w > 0));
  const post = posteriorGrade(lista, { priori, grade });
  const r = resumirPosterior(post, { limiar: 0, intervalo: 0.9 });
  const out = {
    theta: r.theta, dp: r.dp, ic90: r.ic, p_aprovacao: r.p_acima,
    n: lista.length,
    n_efetivo: lista.reduce((s, x) => s + (x.w === undefined ? 1 : x.w), 0),
    acertos: lista.filter((x) => x.x).length
  };
  if (incluirPosterior) out.posterior = post;
  return out;
}

/* Informação de Fisher do item de Rasch em theta: P(1 - P) */
export function informacao(theta, b) { const p = expit(theta - b); return p * (1 - p); }
export function informacaoMedia(theta, bs) {
  if (!bs || !bs.length) return 0.2;
  let s = 0; for (const b of bs) s += informacao(theta, b); return s / bs.length;
}
/* Itens que faltam para o desvio-padrão posterior chegar a dpAlvo, supondo a
   informação média infoMedia por item novo: n = (1/dpAlvo^2 - 1/dp^2) / infoMedia */
export function itensParaPrecisao(dpAtual, dpAlvo, infoMedia) {
  if (!(dpAtual > dpAlvo)) return 0;
  if (!(infoMedia > 0)) return null;
  return Math.ceil((1 / (dpAlvo * dpAlvo) - 1 / (dpAtual * dpAtual)) / infoMedia);
}

/* Percentual esperado de acertos num formulário com as dificuldades bs:
   E[ média_i expit(theta - b_i) | respostas ], com intervalo de 90% (a função é
   crescente em theta, então os quantis de theta dão os quantis do percentual) e o
   percentual do examinando no limiar (theta = 0). */
export function percentualEsperado(post, bs) {
  const lista = (bs || []).filter(Number.isFinite);
  if (!lista.length) return { media: null, ic90: [null, null], limiar: null, itens: 0 };
  const f = (t) => { let s = 0; for (const b of lista) s += expit(t - b); return s / lista.length; };
  const { pontos, dens } = post;
  let m = 0;
  let fa = f(pontos[0]);
  for (let i = 1; i < pontos.length; i++) {
    const fb = f(pontos[i]);
    m += 0.5 * (pontos[i] - pontos[i - 1]) * (dens[i] * fb + dens[i - 1] * fa);
    fa = fb;
  }
  const cum = acumulada(post);
  return { media: m, ic90: [f(quantilPosterior(post, 0.05, cum)), f(quantilPosterior(post, 0.95, cum))], limiar: f(0), itens: lista.length };
}

/* ---------- regra de confiança ----------
   "alta_confianca" só quando: P >= 0,90 ou P <= 0,10; pelo menos N itens
   respondidos, com N definido pela largura do intervalo (o examinando no limiar
   chega a desvio-padrão posterior de 0,25); e itens respondidos em pelo menos 80%
   dos sistemas do outline. */
export function cobertura(sistemasRespondidos, sistemasOutline, { minPorSistema = REGRA_CONFIANCA.min_por_sistema } = {}) {
  const cont = sistemasRespondidos instanceof Map ? sistemasRespondidos : new Map(Object.entries(sistemasRespondidos || {}));
  const todos = [...(sistemasOutline || [])];
  const com = todos.filter((s) => (cont.get(s) || 0) >= minPorSistema);
  return { com_itens: com, faltando: todos.filter((s) => !com.includes(s)), total: todos.length, proporcao: todos.length ? com.length / todos.length : 0 };
}

/* Número mínimo de itens N: quantos itens o examinando no limiar (theta = 0)
   precisa responder para o desvio-padrão posterior chegar a dp_max, com a
   informação média dos itens do banco no limiar. Com Angoff entre 0,45 e 0,80,
   fica perto de 70 a 80 itens (ver o teste e PSICOMETRIA.md). */
export function itensMinimos(bs, { regra = REGRA_CONFIANCA, priori = PRIORI_PADRAO } = {}) {
  return itensParaPrecisao(priori.dp, regra.dp_max, informacaoMedia(0, bs));
}

/* p: P(aprovação); theta e dp: posterior; n_efetivo: soma dos pesos; n_minimo:
   itensMinimos(); cob: cobertura(). infoMedia: informação média dos próximos itens
   em theta (para estimar quantos faltam para decidir). */
export function classificarConfianca({ p, theta, dp, n_efetivo = 0, n_minimo = 0, cob, infoMedia = 0.2, regra = REGRA_CONFIANCA }) {
  const motivos = [];
  const decidida = p >= regra.p_alta || p <= regra.p_baixa;
  const suficiente = n_efetivo >= n_minimo;
  const coberta = (cob?.proporcao ?? 0) >= regra.cobertura_min;
  if (!decidida) motivos.push("A probabilidade está entre " + pct(regra.p_baixa) + " e " + pct(regra.p_alta) + ".");
  if (!suficiente) motivos.push("Foram " + fmt0(n_efetivo) + " itens; o mínimo para a precisão exigida é " + n_minimo + ".");
  if (!coberta) motivos.push("Há itens respondidos em " + (cob?.com_itens?.length ?? 0) + " de " + (cob?.total ?? 0) + " sistemas; o mínimo é " + pct(regra.cobertura_min) + ".");
  const faltam_minimo = suficiente ? 0 : Math.ceil(n_minimo - n_efetivo);
  /* Para a probabilidade sair da faixa intermediária, |theta| precisa passar de
     1,28 desvio-padrão; com theta perto de zero, mais itens quase não mudam a decisão. */
  let faltam_decisao = 0;
  if (!decidida) faltam_decisao = Math.abs(theta) < 0.05 ? null : itensParaPrecisao(dp, Math.abs(theta) / Z90, infoMedia);
  const alta = decidida && suficiente && coberta;
  return {
    alta,
    rotulo: alta ? "alta_confianca" : "estimativa_preliminar",
    texto: alta ? "Alta confiança" : "Estimativa preliminar",
    motivos,
    n_minimo,
    faltam_itens: alta ? 0 : faltam_decisao === null ? null : Math.max(faltam_minimo, faltam_decisao ?? 0),
    faltam_itens_minimo: faltam_minimo,
    faltam_sistemas: cob?.faltando || [],
    perto_do_limiar: !decidida && faltam_decisao === null
  };
}
function pct(x) { return Math.round(x * 100) + "%"; }
function fmt0(x) { return String(Math.round(Number(x) * 10) / 10).replace(".", ","); }

/* ---------- preparação das respostas do aluno ----------
   respostas: registros da camada de dados ({ questao_id, resposta, correta, modo,
   origem, respondida_em, ... }); itens: Map ou objeto id -> item normalizado.
   Regras (PSICOMETRIA.md, seção 3):
   - só a primeira resposta de cada item conta (a repetição mede memória do item);
   - modo cronometrado peso 1; tutor peso pesos.tutor (0,5 por padrão; 0 exclui);
   - em branco: no banco em modo tutor, ignorada; no cronometrado (banco, simulado e
     bloco_30), erro, como na prova;
   - item fora do banco ou de outro Step é ignorado. */
export function prepararRespostas(respostas, itens, { step = null, pesos = PESOS_MODO, usarCalibrado = true, desde = null, ate = null } = {}) {
  const get = itens instanceof Map ? (id) => itens.get(id) : (id) => itens?.[id];
  const ordenadas = (respostas || []).map((r, i) => ({ r, i })).sort((a, b) =>
    String(a.r.respondida_em || "").localeCompare(String(b.r.respondida_em || "")) || a.i - b.i);
  const vistos = new Set();
  const usadas = [];
  let ignoradas = 0;
  const dIni = desde ? Date.parse(desde) : null;
  const dFim = ate ? Date.parse(ate) : null;
  for (const { r } of ordenadas) {
    const q = get(r.questao_id);
    if (!q || (step && q.step !== step)) { ignoradas++; continue; }
    const t = r.respondida_em ? Date.parse(r.respondida_em) : null;
    if (dIni !== null && t !== null && t < dIni) continue;
    if (dFim !== null && t !== null && t > dFim) continue;
    if (vistos.has(r.questao_id)) continue;
    /* resposta a uma versão anterior do item (conteúdo mudou, ou gabarito corrigido
       sem recorreção): não é pontuada contra o item atual, e o item fica visto,
       porque uma nova resposta já não seria a primeira exposição */
    if (Number.isInteger(r.versao_item) && Number.isInteger(q.versao) && r.versao_item !== q.versao) { vistos.add(r.questao_id); ignoradas++; continue; }
    const origem = r.origem || "banco";
    /* em branco: no bloco tutor do banco o aluno pulou e o item não entra; no
       cronometrado (banco, simulado, bloco de 30 minutos) conta como erro, como na
       prova, para que deixar os itens difíceis sem resposta não infle a estimativa */
    if ((r.resposta === null || r.resposta === undefined || r.resposta === "") && origem === "banco" && r.modo === "tutor") continue;
    vistos.add(r.questao_id);
    const w = r.modo === "tutor" ? Number(pesos.tutor ?? 0.5) : Number(pesos.cronometrado ?? 1);
    if (!(w > 0)) continue;
    usadas.push({ questao_id: q.id, item: q, b: bDoItem(q, { usarCalibrado }), x: r.correta ? 1 : 0, w, modo: r.modo, origem });
  }
  return { usadas, ignoradas };
}

/* Perfil por área em relação ao examinando no limiar, como no relatório oficial de
   reprovação: "mais_baixo", "igual" ou "mais_alto". Cada área tem a própria
   estimativa EAP (mesma priori); a classe usa o intervalo central de prob (0,90
   por padrão, isto é, de 5% a 95%): inteiro acima de 0 = mais alto, inteiro abaixo
   = mais baixo, cruzando o 0 = igual (indistinguível do limiar). */
export function perfilPorArea(usadas, dim, { min_itens = PERFIL_PADRAO.min_itens, prob = PERFIL_PADRAO.prob, priori = PERFIL_PADRAO.priori, grade = GRADE_PADRAO } = {}) {
  const grupos = new Map();
  for (const u of usadas || []) {
    const v = u.item?.[dim];
    /* campo com lista (disciplinas, disciplinas_oficiais): o item conta em cada rótulo */
    for (const c of new Set(Array.isArray(v) ? v : [v])) { if (!c) continue; (grupos.get(c) || grupos.set(c, []).get(c)).push(u); }
  }
  const out = [];
  for (const [chave, lista] of grupos) {
    const post = posteriorGrade(lista, { priori, grade });
    const r = resumirPosterior(post, { limiar: 0, intervalo: prob });
    const n = lista.length;
    const acertos = lista.filter((u) => u.x).length;
    let classe = "igual";
    if (n < min_itens) classe = "insuficiente";
    else if (r.ic[0] > 0) classe = "mais_alto";
    else if (r.ic[1] < 0) classe = "mais_baixo";
    out.push({ chave, n, acertos, taxa: n ? acertos / n : null, esperado_limiar: n ? lista.reduce((s, u) => s + expit(-u.b), 0) / n : null, theta: r.theta, dp: r.dp, ic: r.ic, p_acima: r.p_acima, classe });
  }
  return out.sort((a, b) => a.p_acima - b.p_acima || (a.chave < b.chave ? -1 : 1));
}

/* Áreas do perfil, como no relatório oficial (sistema, disciplina e tarefa do
   médico), mais a área clínica do painel no Step 2 CK. As disciplinas contam todos
   os rótulos do item. */
export const DIMENSOES_PERFIL = Object.freeze({ step1: ["sistema", "disciplinas", "competencia"], step2ck: ["sistema", "disciplinas_oficiais", "competencia", "area"] });

/* ---------- estimativa completa do aluno ----------
   step: "step1" | "step2ck"
   respostas: registros de listRespostas()
   itens: Map id -> item normalizado (banco.porId)
   sistemas: chaves do outline (sistemasDoOutline(step) em banco.js); sem elas,
             usa os sistemas presentes nos itens do Step
   bsFormulario: dificuldades do formulário de referência para o percentual
             esperado; sem elas, usa todos os itens do Step no banco
   modeloDesfechos / modeloEscore: saídas de ajustarDesfechos / ajustarEscore,
             opcionais; só entram quando "suficiente" for verdadeiro */
export function estimarAluno({ step, respostas, itens, sistemas = null, bsFormulario = null, pesos = PESOS_MODO, regra = REGRA_CONFIANCA, usarCalibrado = true, modeloDesfechos = null, modeloEscore = null, priori = PRIORI_PADRAO, desde = null, ate = null } = {}) {
  const todos = itens instanceof Map ? [...itens.values()] : Object.values(itens || {});
  const doStep = todos.filter((q) => q.step === step);
  const { usadas, ignoradas } = prepararRespostas(respostas, itens, { step, pesos, usarCalibrado, desde, ate });
  const est = eap(usadas, { priori, incluirPosterior: true });
  const post = est.posterior;
  const bsForm = bsFormulario || doStep.map((q) => bDoItem(q, { usarCalibrado }));
  const pe = percentualEsperado(post, bsForm);
  const vistos = new Set(usadas.map((u) => u.questao_id));
  const restantes = doStep.filter((q) => !vistos.has(q.id)).map((q) => bDoItem(q, { usarCalibrado }));
  const infoMedia = informacaoMedia(est.theta, restantes.length ? restantes : bsForm);
  const contSist = new Map();
  for (const u of usadas) if (u.item.sistema) contSist.set(u.item.sistema, (contSist.get(u.item.sistema) || 0) + 1);
  const outline = sistemas && sistemas.length ? sistemas : [...new Set(doStep.map((q) => q.sistema).filter(Boolean))].sort();
  const cob = cobertura(contSist, outline, { minPorSistema: regra.min_por_sistema });
  const n_minimo = itensMinimos(bsForm, { regra, priori });
  const confianca = classificarConfianca({ p: est.p_aprovacao, theta: est.theta, dp: est.dp, n_efetivo: est.n_efetivo, n_minimo, cob, infoMedia, regra });
  const perfil = {};
  for (const dim of DIMENSOES_PERFIL[step] || []) perfil[dim] = perfilPorArea(usadas, dim, { priori });
  const nCal = usadas.filter((u) => usarCalibrado && Number.isFinite(u.item.b_calibrado)).length;
  const base = nCal === 0 ? "angoff" : nCal === usadas.length ? "calibrado" : "misto";
  const avisos = [
    base === "angoff"
      ? "Estimativa calculada pelo padrão de Angoff do banco (julgamento dos autores sobre o examinando no limiar). Não é resultado oficial do USMLE nem do NBME."
      : "Estimativa com dificuldades recalibradas pelas respostas da turma e ancoradas no padrão de Angoff. Não é resultado oficial do USMLE nem do NBME."
  ];
  if (step === "step2ck") avisos.push("No Step 2 CK, o limiar do banco representa o padrão mínimo de aprovação (" + PADRAO_STEP2CK + " desde 01/07/2025) e foi fixado por Angoff. A nota de três dígitos só será estimada depois da calibração com escores reais.");
  const out = {
    step,
    n: est.n,
    n_efetivo: est.n_efetivo,
    acertos: est.acertos,
    taxa_bruta: est.n ? est.acertos / est.n : null,
    ignoradas,
    theta: est.theta,
    dp: est.dp,
    ic90: est.ic90,
    p_aprovacao: est.p_aprovacao,
    percentual_esperado: pe,
    confianca,
    cobertura: cob,
    perfil,
    base,
    itens_calibrados: nCal,
    oficial: false,
    avisos,
    limiar: step === "step2ck" ? { tipo: "padrao_angoff_equivalente", escore_oficial: PADRAO_STEP2CK } : { tipo: "padrao_angoff_equivalente", resultado_oficial: "Pass/Fail" },
    desfechos: null,
    escore: null
  };
  if (modeloDesfechos?.suficiente) out.desfechos = { p_aprovacao: probAprovacaoDesfechos(modeloDesfechos, { theta: est.theta, dp: est.dp }), modelo: { beta0: modeloDesfechos.beta0, beta1: modeloDesfechos.beta1, n: modeloDesfechos.n } };
  if (step === "step2ck" && modeloEscore?.suficiente) out.escore = preverEscore(modeloEscore, { theta: est.theta, dp: est.dp }, PADRAO_STEP2CK);
  return out;
}

/* ---------- prontidão combinada ----------
   O critério principal continua sendo a EXIT 18 (duas autoavaliações NBME seguidas
   com probabilidade >= 90%, em desempenho.js). A probabilidade do banco é
   complementar: nunca declara "pronto" sozinha; quando discorda com alta
   confiança, a tela pede conversa com o mentor. */
export function prontidaoCombinada({ exit18, banco = null }) {
  const st = exit18?.status || "insuficiente";
  const alta = !!banco?.confianca?.alta;
  const p = banco?.p_aprovacao ?? null;
  const favoravel = alta && p !== null && p >= REGRA_CONFIANCA.p_alta;
  const desfavoravel = alta && p !== null && p <= REGRA_CONFIANCA.p_baixa;
  let divergente = false;
  let mensagem = "";
  if (st === "aprovado") mensagem = "Step já aprovado.";
  else if (st === "pronto") {
    divergente = desfavoravel;
    mensagem = divergente
      ? "As duas últimas autoavaliações NBME atingem a meta, mas o banco indica, com alta confiança, desempenho abaixo do limiar. Converse com o mentor antes de manter a data."
      : "Critério principal atendido (EXIT 18)." + (banco ? " Indicador do banco: " + leituraBanco(banco) + "." : "");
  } else if (st === "nao_pronto") {
    divergente = favoravel;
    mensagem = divergente
      ? "O banco indica, com alta confiança, desempenho acima do limiar, mas o critério principal (NBME) ainda não foi atingido. A decisão segue a NBME."
      : "Critério principal ainda não atendido (EXIT 18)." + (banco ? " Indicador do banco: " + leituraBanco(banco) + "." : "");
  } else {
    mensagem = "Faltam autoavaliações NBME para o critério principal (EXIT 18)." + (banco ? " Indicador do banco, só complementar: " + leituraBanco(banco) + "." : "");
  }
  return {
    status: st,
    principal: "exit18",
    complementar: banco ? { p_aprovacao: p, rotulo: banco.confianca?.rotulo || "estimativa_preliminar", base: banco.base } : null,
    divergente,
    mensagem,
    regra: "A EXIT 18 decide: duas autoavaliações NBME seguidas, em standard-paced, com probabilidade de aprovação de pelo menos 90%. O banco é indicador complementar e não substitui a NBME."
  };
}
function leituraBanco(b) {
  return Math.round((b.p_aprovacao ?? 0) * 100) + "% de probabilidade de estar acima do limiar (" + (b.confianca?.alta ? "alta confiança" : "estimativa preliminar") + ")";
}

/* ---------- análise de itens ----------
   respostas: [{ pessoa, questao_id, resposta (letra ou null), correta (bool) }],
   só a primeira resposta de cada pessoa em cada item (a camada de dados já entrega
   assim em listRespostasCalibracao).
   itens: Map id -> item (para a letra correta, as alternativas e o b).
   Devolve { itens: [...], resumo }, com, por item:
     n, acertos, p (índice de dificuldade), em_branco,
     pbis (ponto-bisserial corrigida: correlação entre acertar o item e a proporção
           de acertos da pessoa nos OUTROS itens),
     d (discriminação: p no grupo superior menos p no inferior, 27% de cada lado),
     opcoes: [{ letra, correta, n, prop, prop_superior, prop_inferior, pbis }],
     infit, outfit (quadrados médios do Rasch, com theta EAP de cada pessoa),
     alertas: [{ codigo, nivel: "revisar" | "informativo", texto }], confiavel (n >= 30) */
export function analisarItens(respostas, itens, { limiares = LIMIARES_ITEM, usarCalibrado = true, thetas = null } = {}) {
  const L = { ...LIMIARES_ITEM, ...limiares };
  const get = itens instanceof Map ? (id) => itens.get(id) : (id) => itens?.[id];
  const porPessoa = new Map();
  const vistos = new Set();
  const lista = [];
  for (const r of respostas || []) {
    const chave = r.pessoa + "\u0000" + r.questao_id;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const x = r.correta ? 1 : 0;
    lista.push({ pessoa: String(r.pessoa), questao_id: r.questao_id, resposta: r.resposta || null, x });
    const p = porPessoa.get(String(r.pessoa)) || { s: 0, n: 0, resp: [] };
    p.s += x; p.n += 1;
    p.resp.push({ questao_id: r.questao_id, x });
    porPessoa.set(String(r.pessoa), p);
  }
  /* theta de cada pessoa (para infit e outfit) */
  const th = new Map();
  for (const [pessoa, p] of porPessoa) {
    if (thetas && thetas.has?.(pessoa)) { th.set(pessoa, thetas.get(pessoa)); continue; }
    const rs = p.resp.map((r) => ({ b: bDoItem(get(r.questao_id) || {}, { usarCalibrado }), x: r.x }));
    th.set(pessoa, eap(rs, { grade: { min: -6, max: 6, passo: 0.05 } }).theta);
  }
  const porItem = new Map();
  for (const r of lista) (porItem.get(r.questao_id) || porItem.set(r.questao_id, []).get(r.questao_id)).push(r);
  const saida = [];
  for (const [id, rs] of porItem) {
    const q = get(id) || {};
    const chaveCorreta = q.correta || null;
    const letras = (q.alternativas || []).map((a) => a.letra);
    for (const r of rs) if (r.resposta && !letras.includes(r.resposta)) letras.push(r.resposta);
    letras.sort();
    const n = rs.length;
    const acertos = rs.reduce((s, r) => s + r.x, 0);
    const p = n ? acertos / n : null;
    const comResto = rs.map((r) => {
      const pp = porPessoa.get(r.pessoa);
      return { ...r, resto: pp.n >= Math.max(2, L.min_itens_pessoa) ? (pp.s - r.x) / (pp.n - 1) : null };
    });
    const validos = comResto.filter((r) => r.resto !== null);
    const pbis = correlacao(validos.map((r) => r.x), validos.map((r) => r.resto));
    const ord = validos.slice().sort((a, b) => a.resto - b.resto || (a.pessoa < b.pessoa ? -1 : a.pessoa > b.pessoa ? 1 : 0));
    const kk = ord.length >= 4 ? Math.max(1, Math.floor(L.grupo * ord.length)) : 0;
    const inferior = ord.slice(0, kk);
    const superior = kk ? ord.slice(ord.length - kk) : [];
    const pg = (g, f) => (g.length ? g.filter(f).length / g.length : null);
    const opcoes = letras.map((l) => ({
      letra: l,
      correta: l === chaveCorreta,
      n: rs.filter((r) => r.resposta === l).length,
      prop: n ? rs.filter((r) => r.resposta === l).length / n : null,
      n_superior: superior.filter((r) => r.resposta === l).length,
      n_inferior: inferior.filter((r) => r.resposta === l).length,
      prop_superior: pg(superior, (r) => r.resposta === l),
      prop_inferior: pg(inferior, (r) => r.resposta === l),
      pbis: correlacao(validos.map((r) => (r.resposta === l ? 1 : 0)), validos.map((r) => r.resto))
    }));
    const em_branco = rs.filter((r) => !r.resposta).length;
    /* ajuste ao Rasch. O infit e o outfit medem a forma da curva (o item separa
       como o modelo prevê?), não a posição: por isso usam a dificuldade estimada
       com as próprias respostas do item (b_ajuste, MAP com os θ fixos e priori
       N(b em uso, tau²), a mesma da recalibração). Com o b de Angoff, um item bem
       construído cujo Angoff errou por meio logit pareceria desajustado. */
    const b = bDoItem(q, { usarCalibrado });
    const thItem = rs.map((r) => th.get(r.pessoa) ?? 0);
    const bAj = bAjuste(thItem, rs.map((r) => r.x), b);
    let somaZ2 = 0, somaR2 = 0, somaW = 0;
    for (const [k, r] of rs.entries()) {
      const P = expit(thItem[k] - bAj);
      const W = P * (1 - P);
      const res = r.x - P;
      somaZ2 += (res * res) / W; somaR2 += res * res; somaW += W;
    }
    const outfit = n ? somaZ2 / n : null;
    const infit = somaW > 0 ? somaR2 / somaW : null;
    const d = superior.length ? pg(superior, (r) => r.x === 1) - pg(inferior, (r) => r.x === 1) : null;
    const confiavel = n >= L.n_min;
    const alertas = [];
    const add = (codigo, nivel, texto) => alertas.push({ codigo, nivel, texto });
    if (p !== null && p < L.p_min) add("p_baixo", "revisar", "Índice de dificuldade abaixo de " + L.p_min + ": confira gabarito, ambiguidade e se o conteúdo está no outline.");
    if (p !== null && p > L.p_max) add("p_alto", "revisar", "Índice de dificuldade acima de " + L.p_max + ": o item quase não separa examinandos.");
    if (pbis !== null && pbis < 0) add("pbis_negativa", "revisar", "Discriminação negativa: os melhores erram mais que os demais. Confira o gabarito.");
    else if (pbis !== null && pbis < L.pbis_min) add("pbis_baixa", "revisar", "Discriminação abaixo de " + L.pbis_min + ".");
    const chaveSup = opcoes.find((o) => o.correta)?.n_superior ?? 0;
    const atrai = opcoes.filter((o) => !o.correta && superior.length && o.n_superior > chaveSup);
    if (atrai.length) add("distrator_atrai_melhores", "revisar", "No grupo superior, a alternativa " + atrai.map((o) => o.letra).join(", ") + " foi mais escolhida que a correta.");
    if (confiavel && ((infit !== null && (infit < L.ajuste_min || infit > L.ajuste_max)) || (outfit !== null && (outfit < L.ajuste_min || outfit > L.ajuste_max))))
      add("desajuste_rasch", "revisar", "Infit ou outfit fora de " + L.ajuste_min + " a " + L.ajuste_max + ".");
    if (confiavel) {
      const naoFunc = opcoes.filter((o) => !o.correta && o.prop !== null && o.prop < L.distrator_funcional && (q.alternativas || []).some((a) => a.letra === o.letra));
      if (naoFunc.length) add("distrator_nao_funcional", "informativo", "Distrator escolhido por menos de " + Math.round(L.distrator_funcional * 100) + "%: " + naoFunc.map((o) => o.letra).join(", ") + ".");
    } else add("amostra_pequena", "informativo", "Menos de " + L.n_min + " respostas: os índices ainda oscilam muito.");
    saida.push({ questao_id: id, step: q.step || null, n, acertos, p, em_branco, pbis, d, n_superior: superior.length, n_inferior: inferior.length, opcoes, b, b_ajuste: bAj, infit, outfit, alertas, confiavel, revisar: alertas.some((a) => a.nivel === "revisar") });
  }
  saida.sort((a, b) => (a.questao_id < b.questao_id ? -1 : 1));
  const por_codigo = {};
  for (const it of saida) for (const a of it.alertas) por_codigo[a.codigo] = (por_codigo[a.codigo] || 0) + 1;
  return { itens: saida, resumo: { itens: saida.length, pessoas: porPessoa.size, respostas: lista.length, a_revisar: saida.filter((i) => i.revisar).length, por_codigo } };
}

/* Dificuldade do item para o cálculo do ajuste: máximo a posteriori de b com os θ
   das pessoas fixos e priori N(b0, tau²) (tau da recalibração), por Newton. A
   priori impede b infinito quando todos acertam ou todos erram. */
export function bAjuste(thetas, xs, b0, { tau = RECALIBRACAO_PADRAO.tau } = {}) {
  const t2 = tau * tau;
  let b = b0;
  for (let k = 0; k < 50; k++) {
    let g = -(b - b0) / t2, h = 1 / t2;
    for (let j = 0; j < xs.length; j++) { const P = expit(thetas[j] - b); g += P - xs[j]; h += P * (1 - P); }
    const d = clamp(g / h, 1);
    b += d;
    if (Math.abs(d) < 1e-8) break;
  }
  return b;
}

/* Correlação de Pearson; null quando uma das variáveis é constante */
export function correlacao(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  if (sxx <= 1e-12 || syy <= 1e-12) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/* ---------- recalibração dos b com as respostas da turma ----------
   Máxima verossimilhança conjunta penalizada (JML com priori): b_i ~ N(b_angoff_i,
   tau^2) e theta_j ~ N(0, 1,5^2). Depois da convergência, a escala é ancorada pela
   curva característica do teste em theta = 0: soma_i expit(-b_i) = soma_i angoff_i
   nos itens com dados (ou só nos de opcoes.ancorarEm), o que mantém o escore de
   corte de Angoff.
   respostas: [{ pessoa, questao_id, correta, peso? }] (primeira resposta).
   Devolve { itens: [{ id, b_angoff, b, ep, n, acertos }], pessoas: [{ pessoa, theta, ep, n }],
             iteracoes, convergiu, deslocamento, parametros }. */
export function recalibrarRasch(respostas, itens, opcoes = {}) {
  const o = { ...RECALIBRACAO_PADRAO, ...opcoes };
  const get = itens instanceof Map ? (id) => itens.get(id) : (id) => itens?.[id];
  const idxItem = new Map(), idxPessoa = new Map();
  const iid = [], pid = [], xs = [], ws = [];
  const vistos = new Set();
  for (const r of respostas || []) {
    const q = get(r.questao_id);
    if (!q) continue;
    const ch = r.pessoa + "\u0000" + r.questao_id;
    if (vistos.has(ch)) continue;
    vistos.add(ch);
    if (!idxItem.has(r.questao_id)) idxItem.set(r.questao_id, idxItem.size);
    if (!idxPessoa.has(String(r.pessoa))) idxPessoa.set(String(r.pessoa), idxPessoa.size);
    iid.push(idxItem.get(r.questao_id)); pid.push(idxPessoa.get(String(r.pessoa)));
    xs.push(r.correta ? 1 : 0); ws.push(r.peso === undefined ? 1 : Number(r.peso));
  }
  const I = idxItem.size, J = idxPessoa.size, R = xs.length;
  const ids = [...idxItem.keys()];
  const b0 = new Float64Array(I), ang = new Float64Array(I);
  ids.forEach((id, i) => { const q = get(id); b0[i] = Number.isFinite(q.b_angoff) ? q.b_angoff : bDeAngoff(q.angoff ?? 0.65); ang[i] = expit(-b0[i]); });
  const b = Float64Array.from(b0);
  const th = new Float64Array(J);
  const tau2 = o.tau * o.tau, s2 = o.priori_theta.dp * o.priori_theta.dp, mu = o.priori_theta.media;
  const gI = new Float64Array(I), hI = new Float64Array(I), gJ = new Float64Array(J), hJ = new Float64Array(J);
  let it = 0, conv = false;
  for (it = 1; it <= o.max_iter; it++) {
    gJ.fill(0); hJ.fill(0);
    for (let r = 0; r < R; r++) { const P = expit(th[pid[r]] - b[iid[r]]); gJ[pid[r]] += ws[r] * (xs[r] - P); hJ[pid[r]] += ws[r] * P * (1 - P); }
    let maxd = 0;
    for (let j = 0; j < J; j++) {
      const d = clamp((gJ[j] - (th[j] - mu) / s2) / (hJ[j] + 1 / s2), 1);
      th[j] += d; if (Math.abs(d) > maxd) maxd = Math.abs(d);
    }
    gI.fill(0); hI.fill(0);
    for (let r = 0; r < R; r++) { const P = expit(th[pid[r]] - b[iid[r]]); gI[iid[r]] += ws[r] * (P - xs[r]); hI[iid[r]] += ws[r] * P * (1 - P); }
    for (let i = 0; i < I; i++) {
      const d = clamp((gI[i] - (b[i] - b0[i]) / tau2) / (hI[i] + 1 / tau2), 1);
      b[i] += d; if (Math.abs(d) > maxd) maxd = Math.abs(d);
    }
    if (maxd < o.tol) { conv = true; break; }
  }
  /* ancoragem pela curva característica do teste em theta = 0 */
  let c = 0;
  const ancora = o.ancorarEm ? new Set(o.ancorarEm) : null;
  const naAncora = ids.map((id) => !ancora || ancora.has(id));
  if (o.ancoragem === "tcc" && naAncora.some(Boolean)) {
    let alvo = 0; for (let i = 0; i < I; i++) if (naAncora[i]) alvo += ang[i];
    for (let k = 0; k < 100; k++) {
      let f = -alvo, fp = 0;
      for (let i = 0; i < I; i++) { if (!naAncora[i]) continue; const P = expit(-(b[i] + c)); f += P; fp -= P * (1 - P); }
      const passo = f / fp;
      c -= clamp(passo, 2);
      if (Math.abs(passo) < 1e-10) break;
    }
  }
  /* erros-padrão pela informação no ponto final (com a priori) */
  const infI = new Float64Array(I), infJ = new Float64Array(J), nI = new Int32Array(I), aI = new Int32Array(I), nJ = new Int32Array(J);
  for (let r = 0; r < R; r++) { const P = expit(th[pid[r]] - b[iid[r]]); infI[iid[r]] += ws[r] * P * (1 - P); infJ[pid[r]] += ws[r] * P * (1 - P); nI[iid[r]]++; aI[iid[r]] += xs[r]; nJ[pid[r]]++; }
  return {
    itens: ids.map((id, i) => ({ id, b_angoff: b0[i], b: b[i] + c, ep: 1 / Math.sqrt(infI[i] + 1 / tau2), n: nI[i], acertos: aI[i] })),
    pessoas: [...idxPessoa.keys()].map((p, j) => ({ pessoa: p, theta: th[j] + c, ep: 1 / Math.sqrt(infJ[j] + 1 / s2), n: nJ[j] })),
    iteracoes: Math.min(it, o.max_iter),
    convergiu: conv,
    deslocamento: c,
    parametros: { tau: o.tau, priori_theta: o.priori_theta, ancoragem: o.ancoragem, metodo: "jml_penalizada" }
  };
}
function clamp(x, m) { return x > m ? m : x < -m ? -m : x; }

/* ---------- regressão logística (IRLS com penalização leve) ----------
   X: linhas de covariáveis sem o intercepto; y: 0 ou 1.
   Devolve { beta: [b0, b1, ...], ep, convergiu, iteracoes, loglik }. */
export function regressaoLogistica(X, y, { l2 = 1e-6, max_iter = 100, tol = 1e-9 } = {}) {
  const n = y.length;
  const p = (X[0]?.length || 0) + 1;
  const Z = X.map((row) => [1, ...row]);
  let beta = new Array(p).fill(0);
  let conv = false, it = 0, H = null;
  for (it = 1; it <= max_iter; it++) {
    const g = new Array(p).fill(0);
    H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      let eta = 0; for (let k = 0; k < p; k++) eta += Z[i][k] * beta[k];
      const mu = expit(eta), w = mu * (1 - mu);
      for (let k = 0; k < p; k++) { g[k] += Z[i][k] * (y[i] - mu); for (let l = 0; l < p; l++) H[k][l] += w * Z[i][k] * Z[i][l]; }
    }
    for (let k = 1; k < p; k++) { g[k] -= l2 * beta[k]; H[k][k] += l2; }
    const d = resolver(H, g);
    if (!d) break;
    let maxd = 0;
    for (let k = 0; k < p; k++) { const s = clamp(d[k], 5); beta[k] += s; maxd = Math.max(maxd, Math.abs(s)); }
    if (maxd < tol) { conv = true; break; }
  }
  const inv = H ? inverter(H) : null;
  let ll = 0;
  for (let i = 0; i < n; i++) { let eta = 0; for (let k = 0; k < p; k++) eta += Z[i][k] * beta[k]; ll += y[i] ? logExpit(eta) : logExpit(-eta); }
  return { beta, ep: inv ? inv.map((r, k) => Math.sqrt(Math.max(0, r[k]))) : beta.map(() => null), convergiu: conv, iteracoes: Math.min(it, max_iter), loglik: ll };
}
function resolver(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function inverter(A) {
  const n = A.length;
  const cols = [];
  for (let j = 0; j < n; j++) { const e = new Array(n).fill(0); e[j] = 1; const c = resolver(A, e); if (!c) return null; cols.push(c); }
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]));
}

/* Área sob a curva ROC (Mann-Whitney), com empates contando meio */
export function auc(prob, y) {
  const pos = [], neg = [];
  prob.forEach((p, i) => (y[i] ? pos : neg).push(p));
  if (!pos.length || !neg.length) return null;
  let s = 0;
  for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

/* Desfechos reais (resultado oficial Pass/Fail) contra o theta do banco:
   P(aprovação) = expit(beta0 + beta1 * theta). registros: [{ theta, resultado: "pass" | "fail" }].
   suficiente = pelo menos min_por_classe aprovados e reprovados (regra de cerca de
   10 eventos por variável; Peduzzi et al., 1996, J Clin Epidemiol 49:1373). */
export function ajustarDesfechos(registros, { min_por_classe = DESFECHOS_PADRAO.min_por_classe, l2 = 1e-6 } = {}) {
  const ok = (registros || []).filter((r) => Number.isFinite(r.theta) && (r.resultado === "pass" || r.resultado === "fail"));
  const y = ok.map((r) => (r.resultado === "pass" ? 1 : 0));
  const aprovados = y.filter(Boolean).length, reprovados = y.length - aprovados;
  const base = { n: ok.length, aprovados, reprovados, suficiente: aprovados >= min_por_classe && reprovados >= min_por_classe };
  if (!ok.length || !aprovados || !reprovados) return { ...base, suficiente: false, beta0: null, beta1: null, ep0: null, ep1: null, auc: null, brier: null, aviso: "Ainda não há aprovados e reprovados suficientes para ajustar o modelo." };
  const m = regressaoLogistica(ok.map((r) => [r.theta]), y, { l2 });
  const prev = ok.map((r) => expit(m.beta[0] + m.beta[1] * r.theta));
  const brier = prev.reduce((s, p, i) => s + (p - y[i]) ** 2, 0) / prev.length;
  /* separação completa: um θ separa todos os aprovados de todos os reprovados. A
     verossimilhança não tem máximo finito (Albert e Anderson, 1984, Biometrika
     71:1), o coeficiente cresce sem limite e a curva vira degrau; o modelo fica
     exploratório até haver sobreposição. */
  const tMinPass = Math.min(...ok.filter((r) => r.resultado === "pass").map((r) => r.theta));
  const tMaxFail = Math.max(...ok.filter((r) => r.resultado === "fail").map((r) => r.theta));
  const tMaxPass = Math.max(...ok.filter((r) => r.resultado === "pass").map((r) => r.theta));
  const tMinFail = Math.min(...ok.filter((r) => r.resultado === "fail").map((r) => r.theta));
  const separacao = tMinPass > tMaxFail || tMaxPass < tMinFail;
  const suficiente = base.suficiente && !separacao && !!m.convergiu;
  return {
    ...base, suficiente, separacao, beta0: m.beta[0], beta1: m.beta[1], ep0: m.ep[0], ep1: m.ep[1], convergiu: m.convergiu,
    auc: auc(prev, y), brier,
    aviso: separacao ? "Separação completa: nenhum aprovado tem θ abaixo de um reprovado (ou o contrário), e os coeficientes não ficam determinados. Use só como exploração até haver sobreposição."
      : !m.convergiu ? "O ajuste não convergiu. Use só como exploração."
      : base.suficiente ? "" : "Modelo com poucos desfechos: use só como exploração até ter pelo menos " + min_por_classe + " aprovados e " + min_por_classe + " reprovados."
  };
}
/* P(aprovação) pelo modelo de desfechos, integrando a incerteza de theta
   (theta ~ N(theta, dp^2), 81 pontos entre -4 e +4 desvios-padrão) */
export function probAprovacaoDesfechos(modelo, { theta, dp = 0 }) {
  if (!modelo || modelo.beta0 === null) return null;
  if (!(dp > 0)) return expit(modelo.beta0 + modelo.beta1 * theta);
  let s = 0, w = 0;
  for (let k = -40; k <= 40; k++) { const z = k / 10, d = Math.exp(-0.5 * z * z); s += d * expit(modelo.beta0 + modelo.beta1 * (theta + z * dp)); w += d; }
  return s / w;
}

/* Escores reais (Step 2 CK oficial ou NBME) contra o theta do banco, por mínimos
   quadrados: escore = a + b * theta + erro (desvio-padrão residual sigma).
   suficiente = pelo menos min_escores registros (critério interno). */
export function ajustarEscore(registros, { min_escores = DESFECHOS_PADRAO.min_escores } = {}) {
  const ok = (registros || []).filter((r) => Number.isFinite(r.theta) && Number.isFinite(r.escore));
  const n = ok.length;
  if (n < 3) return { n, suficiente: false, a: null, b: null, sigma: null, r2: null, aviso: "Ainda não há escores reais para calibrar a nota." };
  const mx = ok.reduce((s, r) => s + r.theta, 0) / n, my = ok.reduce((s, r) => s + r.escore, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const r of ok) { sxy += (r.theta - mx) * (r.escore - my); sxx += (r.theta - mx) ** 2; syy += (r.escore - my) ** 2; }
  const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
  const sse = ok.reduce((s, r) => s + (r.escore - a - b * r.theta) ** 2, 0);
  const sigma = Math.sqrt(sse / Math.max(1, n - 2));
  return { n, suficiente: n >= min_escores, a, b, sigma, r2: syy > 0 ? 1 - sse / syy : null, aviso: n >= min_escores ? "" : "Poucos escores reais (" + n + "); a nota estimada ainda não é mostrada ao aluno." };
}
/* Escore previsto, intervalo preditivo de 90% e P(escore >= limiar) */
export function preverEscore(modelo, { theta, dp = 0 }, limiar = PADRAO_STEP2CK) {
  if (!modelo || modelo.a === null) return null;
  const media = modelo.a + modelo.b * theta;
  const s = Math.sqrt(modelo.sigma * modelo.sigma + modelo.b * modelo.b * dp * dp);
  return { media, ic90: [media - 1.6448536 * s, media + 1.6448536 * s], p_limiar: s > 0 ? 1 - normalCdf((limiar - media) / s) : media >= limiar ? 1 : 0, limiar, suficiente: !!modelo.suficiente };
}

/* Junta desfechos e respostas: para cada desfecho, o theta do aluno com as respostas
   dadas até a data da prova. desfechos: [{ user_id, step, data, resultado?, escore? }];
   respostasPorUsuario: Map user_id -> respostas; itens: Map id -> item. */
export function montarDadosDesfechos(desfechos, respostasPorUsuario, itens, { pesos = PESOS_MODO } = {}) {
  const out = [];
  for (const d of desfechos || []) {
    const rs = respostasPorUsuario instanceof Map ? respostasPorUsuario.get(d.user_id) : respostasPorUsuario?.[d.user_id];
    const ate = d.data ? new Date(String(d.data).slice(0, 10) + "T23:59:59Z").toISOString() : null;
    const { usadas } = prepararRespostas(rs || [], itens, { step: d.step, pesos, ate });
    if (!usadas.length) continue;
    const e = eap(usadas);
    out.push({ user_id: d.user_id, step: d.step, data: d.data, theta: e.theta, dp: e.dp, n: e.n, resultado: d.resultado ?? null, escore: Number.isFinite(Number(d.escore)) && d.escore !== null ? Number(d.escore) : null });
  }
  return out;
}

/* ---------- simulação (testes e demonstração) ----------
   random: função que devolve números em [0, 1) (por exemplo rng(semente) de
   simulado.js). Gera respostas de Rasch para pessoas de habilidade conhecida. */
export function simularRespostas({ thetas, bs, random, itensPorPessoa = null }) {
  const out = [];
  const m = bs.length;
  thetas.forEach((t, j) => {
    let idx = [...Array(m).keys()];
    if (itensPorPessoa && itensPorPessoa < m) {
      for (let i = m - 1; i > 0; i--) { const k = Math.floor(random() * (i + 1)); [idx[i], idx[k]] = [idx[k], idx[i]]; }
      idx = idx.slice(0, itensPorPessoa);
    }
    for (const i of idx) out.push({ pessoa: j, item: i, x: random() < expit(t - bs[i]) ? 1 : 0 });
  });
  return out;
}
/* Normal padrão por Box-Muller a partir de um gerador uniforme */
export function normalAleatoria(random) {
  const u = Math.max(1e-12, random()), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
