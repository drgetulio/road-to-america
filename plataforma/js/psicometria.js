/* Road to America | psicometria do banco de questões.

   Modelo de Rasch ancorado na dificuldade-alvo do banco, estimativa EAP em grade,
   probabilidade de estar acima do limiar do banco com a incerteza do próprio padrão,
   regra de precisão, percentual esperado num formulário completo, perfil por área em
   relação ao limiar, análise de itens (dificuldade, ponto-bisserial corrigida,
   distratores, infit e outfit), recalibração regularizada, efeito do modo tutor e
   regressão com desfechos reais.

   Sobre o nome "angoff": o campo angoff dos itens do banco é a dificuldade-alvo
   fixada pelos autores na especificação, com pequeno ajuste depois da redação; não é
   o julgamento de um painel de juízes. Só o valor publicado pelo painel
   (plataforma/js/angoff.js, angoff_origem "painel") é Angoff de fato. O código mantém
   o nome do campo por compatibilidade com o contrato do item, e as telas dizem
   "dificuldade-alvo" e "padrão provisório" enquanto o painel não substituir o valor.

   JavaScript puro, sem dependências e determinístico (nenhuma chamada a
   Math.random; as simulações recebem o gerador como parâmetro).
   Fórmulas, fontes e limitações em plataforma/PSICOMETRIA.md. */

/* ---------- parâmetros do método (PSICOMETRIA.md, seção 2) ---------- */
export const PRIORI_PADRAO = Object.freeze({ media: 0, dp: 1.5 });
export const GRADE_PADRAO = Object.freeze({ min: -6, max: 6, passo: 0.01 });
/* Critérios internos da Road to America; a justificativa de cada número está em PSICOMETRIA.md.
   min_por_sistema e fracao_peso_sistema: um sistema só conta como coberto com pelo
   menos 5 itens e pelo menos metade do número que um formulário com o mesmo total de
   itens teria pelo peso do sistema no outline (seção 7). */
export const REGRA_CONFIANCA = Object.freeze({ p_alta: 0.9, p_baixa: 0.1, dp_max: 0.25, cobertura_min: 0.8, min_por_sistema: 5, fracao_peso_sistema: 0.5 });
export const PESOS_MODO = Object.freeze({ cronometrado: 1, tutor: 0.5 });
/* Incerteza do padrão, em logit (PSICOMETRIA.md, seção 6.1). O limiar do banco vem da
   dificuldade-alvo dos autores (provisório) até o painel de juízes publicar o Angoff
   de cada item ou até a ligação com as autoavaliações NBME da turma ficar suficiente
   (corteLigadoNbme). provisorio: 0,7 logit. Não há dado empírico para esse número; ele
   foi escolhido pela simulação da seção 6.1, para que a classificação decidida erre
   menos de 4% com o banco inteiro até 0,75 logit (cerca de 15 pontos percentuais no
   item de 0,65) mais fácil ou mais difícil do que a dificuldade-alvo supõe. Com 1,0
   logit o erro volta a cerca de 5%: é o limite documentado do método. painel_padrao:
   valor usado para item do painel sem erro-padrão gravado; minimo: piso para o item do
   painel e para a ligação com a NBME (a variação entre painéis, métodos e coortes não
   cabe no erro-padrão de um ajuste só). */
export const INCERTEZA_CORTE = Object.freeze({ provisorio: 0.7, painel_padrao: 0.25, minimo: 0.1 });
/* Análise de sensibilidade mostrada ao aluno enquanto o padrão for provisório: a
   probabilidade se os itens forem 0,75 logit mais fáceis (ou mais difíceis) do que a
   dificuldade-alvo supõe, cerca de 15 pontos percentuais no item de 0,65. */
export const SENSIBILIDADE_PADRAO = Object.freeze({ deslocamento: 0.75, pontos: 15 });
/* Ligação com as autoavaliações NBME (seção 6.2). Padrão de aprovação na escala de três
   dígitos usada nos relatórios da CBSSA e da CCSSA: Step 1, 196 (padrão do Step 1 desde
   26/01/2022, antes do Pass/Fail); Step 2 CK, 218 (desde 01/07/2025). Conferir em
   usmle.org antes de cada ciclo: o USMLE pode mudar o padrão. min_t: o coeficiente
   angular precisa ser pelo menos 4 vezes o seu erro-padrão; ep_max: erro-padrão do
   corte ligado de no máximo 0,35 logit (acima disso o corte provisório, com 0,7, ainda
   é a escolha mais honesta). */
export const LIGACAO_NBME = Object.freeze({ limiar: Object.freeze({ step1: 196, step2ck: 218 }), min_alunos: 30, min_t: 4, ep_max: 0.35 });
/* Nome do padrão em uso, para todas as telas */
export function nomePadrao(origem) {
  return origem === "painel" ? "do painel de juízes" : origem === "nbme" ? "ligado às autoavaliações NBME da turma" : "provisório";
}
/* Padrão definitivo (painel ou ligação com a NBME) ou provisório */
export function padraoProvisorio(origem) { return origem !== "painel" && origem !== "nbme"; }
/* Rótulos da regra de precisão. "alta_confianca" fica reservado para a probabilidade
   que vem de desfechos reais (resultados oficiais da turma) com modelo suficiente. */
export const ROTULOS_CONFIANCA = Object.freeze({
  precisao_alta: "Precisão alta em relação ao padrão do banco",
  estimativa_preliminar: "Estimativa preliminar",
  alta_confianca: "Alta confiança de aprovação"
});
/* Mistura de sistemas: o theta do banco é estimado com as respostas repesadas para a
   composição do outline (seção 5.1); fator de cada sistema limitado a [1/3, 3]. */
export const PONDERACAO_OUTLINE = Object.freeze({ fator_min: 1 / 3, fator_max: 3 });

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
/* Desfechos reais: o modelo só é mostrado ao aluno com pelo menos 30 aprovados e 30
   reprovados e taxa de resposta de pelo menos 50% (seção 13); com 10 de cada, fica
   exploratório, só na área administrativa. */
export const DESFECHOS_PADRAO = Object.freeze({ min_por_classe: 30, min_exploratorio: 10, min_alunos: 30, taxa_resposta_min: 0.5, peso_ipw_max: 10 });
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
   O examinando no limiar (theta = 0) acerta o item com probabilidade angoff, que é a
   dificuldade-alvo do banco (ou o Angoff do painel, quando publicado). */
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

/* Incerteza do corte (seção 6.1): média, pesada pelo peso de cada resposta, do
   desvio-padrão do padrão em logit de cada item usado. Item com Angoff do painel usa
   o erro-padrão do painel convertido em logit (ep / (a (1 - a))), com piso; item com
   a dificuldade-alvo provisória usa INCERTEZA_CORTE.provisorio. Resposta sem item
   (listas de teste { b, x }) conta como provisória. */
export function incertezaCorte(usadas, { incerteza = INCERTEZA_CORTE } = {}) {
  let sw = 0, s = 0, n = 0, nPainel = 0;
  for (const u of usadas || []) {
    const w = u.w === undefined ? 1 : Number(u.w);
    if (!(w > 0)) continue;
    const q = u.item || null;
    let sig = incerteza.provisorio;
    if (q && q.angoff_origem === "painel") {
      nPainel++;
      const a = Number(q.angoff), ep = Number(q.angoff_painel_ep);
      sig = Number.isFinite(ep) && ep > 0 && a > 0 && a < 1 ? Math.max(incerteza.minimo, ep / (a * (1 - a))) : incerteza.painel_padrao;
    }
    s += w * sig; sw += w; n++;
  }
  return { sigma: sw > 0 ? s / sw : incerteza.provisorio, origem: n && nPainel === n ? "painel" : nPainel ? "misto" : "provisorio", itens_painel: nPainel, itens: n };
}

/* P(theta > c | respostas) com o corte incerto, c ~ N(mu, sigma²):
   integral de pi(theta) Phi((theta - mu) / sigma). Com sigma = 0, P(theta > mu).
   mu = 0 no padrão do banco; mu = corte ligado à NBME quando houver (seção 6.2). */
export function pAcimaDoCorte(post, sigma = 0, cum = null, mu = 0) {
  if (!(sigma > 0)) return 1 - cdfPosterior(post, mu, cum || acumulada(post));
  const { pontos, dens } = post;
  let s = 0, fa = dens[0] * normalCdf((pontos[0] - mu) / sigma);
  for (let i = 1; i < pontos.length; i++) {
    const fb = dens[i] * normalCdf((pontos[i] - mu) / sigma);
    s += 0.5 * (fa + fb) * (pontos[i] - pontos[i - 1]);
    fa = fb;
  }
  return Math.min(1, Math.max(0, s));
}

/* Intervalo de 90% da distância ao limiar, theta - c, somando a incerteza da medida
   (posterior de theta) e a do padrão (c ~ N(mu, sigma²)). F(x) = integral de
   pi(theta) (1 - Phi((theta - mu - x) / sigma)); quantis por bisseção. */
export function intervaloRelativo(post, sigma = 0, intervalo = 0.9, mu = 0) {
  const a = (1 - intervalo) / 2;
  if (mu) { const r = intervaloRelativo(post, sigma, intervalo, 0); return [r[0] - mu, r[1] - mu]; }
  if (!(sigma > 0)) { const cum = acumulada(post); return [quantilPosterior(post, a, cum), quantilPosterior(post, 1 - a, cum)]; }
  const { pontos, dens } = post;
  const F = (x) => {
    let s = 0, fa = dens[0] * (1 - normalCdf((pontos[0] - x) / sigma));
    for (let i = 1; i < pontos.length; i++) { const fb = dens[i] * (1 - normalCdf((pontos[i] - x) / sigma)); s += 0.5 * (fa + fb) * (pontos[i] - pontos[i - 1]); fa = fb; }
    return s;
  };
  const q = (alvo) => { let lo = -10, hi = 10; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (F(m) < alvo) lo = m; else hi = m; } return (lo + hi) / 2; };
  return [q(a), q(1 - a)];
}

/* EAP: média a posteriori de theta, desvio-padrão posterior, intervalo de
   credibilidade de 90% e a probabilidade de estar acima do limiar do banco.
   p_aprovacao = P(theta > c | respostas) com a incerteza do corte (sigmaCorte; sem
   ele, incertezaCorte das respostas); p_medida = P(theta > centroCorte | respostas),
   só com a incerteza da medida. centroCorte: posição do limiar na escala (0 no padrão
   do banco; o corte ligado à NBME quando houver). */
export function eap(respostas, { priori = PRIORI_PADRAO, grade = GRADE_PADRAO, incluirPosterior = false, sigmaCorte = undefined, centroCorte = 0 } = {}) {
  const lista = (respostas || []).filter((r) => Number.isFinite(r.b) && (r.w === undefined || r.w > 0));
  const post = posteriorGrade(lista, { priori, grade });
  const mu = Number.isFinite(centroCorte) ? centroCorte : 0;
  const r = resumirPosterior(post, { limiar: mu, intervalo: 0.9 });
  const inc = Number.isFinite(sigmaCorte) ? { sigma: Math.max(0, sigmaCorte), origem: "informada" } : incertezaCorte(lista);
  const out = {
    theta: r.theta, dp: r.dp, ic90: r.ic,
    p_aprovacao: pAcimaDoCorte(post, inc.sigma, null, mu),
    p_medida: r.p_acima,
    sigma_corte: inc.sigma,
    origem_corte: inc.origem,
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
export function percentualEsperado(post, bs, { limiar = 0 } = {}) {
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
  return { media: m, ic90: [f(quantilPosterior(post, 0.05, cum)), f(quantilPosterior(post, 0.95, cum))], limiar: f(Number.isFinite(limiar) ? limiar : 0), itens: lista.length };
}

/* ---------- regra de precisão ----------
   "precisao_alta" só quando: P >= 0,90 ou P <= 0,10 (P já com a incerteza do
   padrão); pelo menos N itens respondidos, com N definido pela largura do intervalo
   (o examinando no limiar chega a desvio-padrão posterior de 0,25); e itens
   suficientes em pelo menos 80% dos sistemas do outline. Sistema coberto: pelo menos
   minPorSistema itens (5) e pelo menos fracaoPeso (metade) do número que um
   formulário com o mesmo total de itens teria pelo peso do sistema (pesos: chave ->
   proporção do outline; nTotal: itens respondidos). */
export function cobertura(sistemasRespondidos, sistemasOutline, { minPorSistema = REGRA_CONFIANCA.min_por_sistema, pesos = null, nTotal = null, fracaoPeso = REGRA_CONFIANCA.fracao_peso_sistema } = {}) {
  const cont = sistemasRespondidos instanceof Map ? sistemasRespondidos : new Map(Object.entries(sistemasRespondidos || {}));
  const todos = [...(sistemasOutline || [])];
  let n = Number(nTotal);
  if (!Number.isFinite(n)) { n = 0; for (const v of cont.values()) n += Number(v) || 0; }
  const minimos = {};
  for (const s of todos) { const p = Number(pesos?.[s]); minimos[s] = Math.max(minPorSistema, p > 0 ? Math.ceil(fracaoPeso * p * n - 1e-9) : 0); }
  const com = todos.filter((s) => (cont.get(s) || 0) >= minimos[s]);
  const itens = {};
  for (const s of todos) itens[s] = cont.get(s) || 0;
  return { com_itens: com, faltando: todos.filter((s) => !com.includes(s)), total: todos.length, proporcao: todos.length ? com.length / todos.length : 0, minimos, itens, min_por_sistema: minPorSistema };
}

/* Repesagem pela composição do outline (seção 5.1). pesos: chave do sistema ->
   proporção na prova. Cada resposta do sistema s recebe o fator
   (pi_s / soma de pi nos sistemas respondidos) / (fração das respostas em s),
   limitado a [fator_min, fator_max]; depois os pesos são reescalados para que a soma
   continue a mesma (n_efetivo não muda). Resposta sem sistema do outline fica com
   fator 1. distancia: variação total entre a mistura respondida e o outline (0 =
   igual; 1 = nada em comum), contando os sistemas sem resposta. */
export function ponderarPeloOutline(usadas, pesos, { fator_min = PONDERACAO_OUTLINE.fator_min, fator_max = PONDERACAO_OUTLINE.fator_max } = {}) {
  const lista = usadas || [];
  if (!pesos || !lista.length) return { usadas: lista, fatores: {}, distancia: null, mistura: {} };
  const somaS = new Map();
  let totPres = 0;
  for (const u of lista) {
    const s = u.item?.sistema, w = u.w === undefined ? 1 : u.w;
    if (s && Number(pesos[s]) > 0) { somaS.set(s, (somaS.get(s) || 0) + w); totPres += w; }
  }
  const somaPesos = Object.values(pesos).reduce((a, b) => a + (Number(b) > 0 ? Number(b) : 0), 0);
  const mistura = {};
  let distancia = 0;
  for (const [s, p] of Object.entries(pesos)) {
    const obs = totPres > 0 ? (somaS.get(s) || 0) / totPres : 0;
    mistura[s] = { observado: obs, outline: somaPesos > 0 ? Number(p) / somaPesos : 0 };
    distancia += Math.abs(mistura[s].observado - mistura[s].outline);
  }
  distancia /= 2;
  if (!(totPres > 0)) return { usadas: lista, fatores: {}, distancia, mistura };
  const piPres = [...somaS.keys()].reduce((a, s) => a + Number(pesos[s]), 0);
  const fatores = {};
  for (const [s, w] of somaS) fatores[s] = Math.min(fator_max, Math.max(fator_min, (Number(pesos[s]) / piPres) / (w / totPres)));
  let somaNova = 0;
  for (const [s, w] of somaS) somaNova += w * fatores[s];
  const k = somaNova > 0 ? totPres / somaNova : 1;
  for (const s of Object.keys(fatores)) fatores[s] *= k;
  const novas = lista.map((u) => {
    const s = u.item?.sistema;
    if (!s || !(s in fatores)) return u;
    const w = u.w === undefined ? 1 : u.w;
    return { ...u, w: w * fatores[s], w_original: w };
  });
  return { usadas: novas, fatores, distancia, mistura };
}

/* Número mínimo de itens N: quantos itens o examinando no limiar (theta = 0)
   precisa responder para o desvio-padrão posterior chegar a dp_max, com a
   informação média dos itens do banco no limiar. Com Angoff entre 0,45 e 0,80,
   fica perto de 70 a 80 itens (ver o teste e PSICOMETRIA.md). */
export function itensMinimos(bs, { regra = REGRA_CONFIANCA, priori = PRIORI_PADRAO } = {}) {
  return itensParaPrecisao(priori.dp, regra.dp_max, informacaoMedia(0, bs));
}

/* p: P(acima do limiar), já com a incerteza do padrão; theta e dp: posterior;
   sigmaCorte: desvio-padrão do padrão em logit; origemCorte: "provisorio", "misto",
   "painel" ou "nbme" (theta já relativo ao centro do corte); n_efetivo: soma dos pesos; n_minimo: itensMinimos(); cob: cobertura().
   infoMedia: informação média dos próximos itens em theta (para estimar quantos
   faltam para decidir). O rótulo nunca é "alta_confianca": esse fica para a
   probabilidade pelos desfechos reais (estimarAluno, campo desfechos). */
export function classificarConfianca({ p, theta, dp, n_efetivo = 0, n_minimo = 0, cob, infoMedia = 0.2, regra = REGRA_CONFIANCA, sigmaCorte = 0, origemCorte = "provisorio" }) {
  const motivos = [];
  const decidida = p >= regra.p_alta || p <= regra.p_baixa;
  const suficiente = n_efetivo >= n_minimo;
  const coberta = (cob?.proporcao ?? 0) >= regra.cobertura_min;
  if (!decidida) motivos.push("A probabilidade está entre " + pct(regra.p_baixa) + " e " + pct(regra.p_alta) + ".");
  if (!suficiente) motivos.push("Foram " + fmt0(n_efetivo) + " itens; o mínimo para a precisão exigida é " + n_minimo + ".");
  if (!coberta) motivos.push("Há itens suficientes em " + (cob?.com_itens?.length ?? 0) + " de " + (cob?.total ?? 0) + " sistemas; o mínimo é " + pct(regra.cobertura_min) + ". Um sistema conta com pelo menos " + (cob?.min_por_sistema ?? regra.min_por_sistema) + " itens e metade do que pede o peso dele no outline.");
  const faltam_minimo = suficiente ? 0 : Math.ceil(n_minimo - n_efetivo);
  /* Para a probabilidade sair da faixa intermediária, |theta| precisa passar de 1,28
     vezes a raiz de (dp² + sigmaCorte²). A parte do padrão não diminui com mais itens:
     se |theta| < 1,28 sigmaCorte, nenhum número de itens decide enquanto o padrão
     for o mesmo. */
  let faltam_decisao = 0;
  let padrao_limita = false;
  if (!decidida) {
    const alvo2 = (theta / Z90) ** 2 - sigmaCorte * sigmaCorte;
    if (Math.abs(theta) < 0.05 || !(alvo2 > 0)) { faltam_decisao = null; padrao_limita = sigmaCorte > 0 && Math.abs(theta) >= 0.05; }
    else faltam_decisao = itensParaPrecisao(dp, Math.sqrt(alvo2), infoMedia);
  }
  const alta = decidida && suficiente && coberta;
  const provisorio = padraoProvisorio(origemCorte);
  const sufixo = provisorio ? " (padrão provisório)" : origemCorte === "nbme" ? " (limiar ligado à NBME)" : "";
  const texto = alta ? ROTULOS_CONFIANCA.precisao_alta + sufixo : ROTULOS_CONFIANCA.estimativa_preliminar;
  return {
    alta,
    rotulo: alta ? "precisao_alta" : "estimativa_preliminar",
    texto,
    texto_curto: alta ? "Precisão alta" + sufixo : "Estimativa preliminar",
    motivos,
    n_minimo,
    faltam_itens: alta ? 0 : faltam_decisao === null ? null : Math.max(faltam_minimo, faltam_decisao ?? 0),
    faltam_itens_minimo: faltam_minimo,
    faltam_sistemas: cob?.faltando || [],
    perto_do_limiar: !decidida && faltam_decisao === null,
    padrao_limita,
    sigma_corte: sigmaCorte,
    origem_corte: origemCorte
  };
}
function pct(x) { return Math.round(x * 100) + "%"; }
/* Faixa da probabilidade: acima (>= p_alta), abaixo (<= p_baixa) ou indefinida */
export function faixaP(p, regra = REGRA_CONFIANCA) { return p >= regra.p_alta ? "acima" : p <= regra.p_baixa ? "abaixo" : "indefinida"; }
function fmt0(x) { return String(Math.round(Number(x) * 10) / 10).replace(".", ","); }

/* ---------- preparação das respostas do aluno ----------
   respostas: registros da camada de dados ({ questao_id, resposta, correta, modo,
   origem, respondida_em, ... }); itens: Map ou objeto id -> item normalizado.
   Regras (PSICOMETRIA.md, seção 3):
   - só a primeira resposta de cada item conta (a repetição mede memória do item);
   - modo cronometrado peso 1; tutor peso pesos.tutor (0,5 por padrão; 0 exclui);
   - em branco: no banco em modo tutor, ignorada; no cronometrado (banco, simulado e
     bloco_30), erro, como na prova;
   - item fora do banco ou de outro Step é ignorado;
   - efeitoModo ({ delta } de estimarEfeitoModo, gravado no modelo do Step): no modo
     tutor, o item entra com b - delta, porque a resposta sem relógio acerta mais que
     a cronometrada; o peso do tutor continua valendo. */
export function prepararRespostas(respostas, itens, { step = null, pesos = PESOS_MODO, usarCalibrado = true, desde = null, ate = null, efeitoModo = null } = {}) {
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
    const delta = r.modo === "tutor" && Number.isFinite(efeitoModo?.delta) ? efeitoModo.delta : 0;
    usadas.push({ questao_id: q.id, item: q, b: bDoItem(q, { usarCalibrado }) - delta, x: r.correta ? 1 : 0, w, modo: r.modo, origem });
  }
  return { usadas, ignoradas };
}

/* Perfil por área em relação ao examinando no limiar, como no relatório oficial de
   reprovação: "mais_baixo", "igual" ou "mais_alto". Cada área tem a própria
   estimativa EAP (mesma priori); a classe usa o intervalo central de prob (0,90
   por padrão, isto é, de 5% a 95%): inteiro acima de 0 = mais alto, inteiro abaixo
   = mais baixo, cruzando o 0 = igual (indistinguível do limiar). */
export function perfilPorArea(usadas, dim, { min_itens = PERFIL_PADRAO.min_itens, prob = PERFIL_PADRAO.prob, priori = PERFIL_PADRAO.priori, grade = GRADE_PADRAO, limiar = 0 } = {}) {
  const grupos = new Map();
  for (const u of usadas || []) {
    const v = u.item?.[dim];
    /* campo com lista (disciplinas, disciplinas_oficiais): o item conta em cada rótulo */
    for (const c of new Set(Array.isArray(v) ? v : [v])) { if (!c) continue; (grupos.get(c) || grupos.set(c, []).get(c)).push(u); }
  }
  const out = [];
  for (const [chave, lista] of grupos) {
    const post = posteriorGrade(lista, { priori, grade });
    const r = resumirPosterior(post, { limiar, intervalo: prob });
    const n = lista.length;
    const acertos = lista.filter((u) => u.x).length;
    let classe = "igual";
    if (n < min_itens) classe = "insuficiente";
    else if (r.ic[0] > limiar) classe = "mais_alto";
    else if (r.ic[1] < limiar) classe = "mais_baixo";
    out.push({ chave, n, acertos, taxa: n ? acertos / n : null, esperado_limiar: n ? lista.reduce((s, u) => s + expit(limiar - u.b), 0) / n : null, theta: r.theta, dp: r.dp, ic: r.ic, p_acima: r.p_acima, classe });
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
   pesosSistemas: chave -> proporção do sistema na prova (pesosDoOutline(step) em
             banco.js). Com eles, a cobertura exige o mínimo proporcional ao peso e o
             theta é estimado com as respostas repesadas para a composição do outline
             (ponderarPeloOutline); sem eles, mínimo fixo e sem repesagem
   bsFormulario: dificuldades do formulário de referência para o percentual
             esperado; sem elas, usa todos os itens do Step no banco
   modeloDesfechos / modeloEscore: saídas de ajustarDesfechos / ajustarEscore,
             opcionais; só entram quando "suficiente" for verdadeiro
   efeitoModo: { delta } do modo tutor (estimarEfeitoModo), opcional
   sigmaCorte: desvio-padrão do padrão em logit; sem ele, incertezaCorte() dos
             itens respondidos
   ligacaoNbme: saída de corteLigadoNbme (gravada no modelo do Step como
             ligacao_nbme). Com ela suficiente, e sem padrão do painel, o limiar passa a
             ser o theta em que o escore NBME previsto atinge o padrão de aprovação,
             c ~ N(mu, ep²), no lugar do provisório (seção 6.2) */
export function estimarAluno({ step, respostas, itens, sistemas = null, pesosSistemas = null, bsFormulario = null, pesos = PESOS_MODO, regra = REGRA_CONFIANCA, usarCalibrado = true, modeloDesfechos = null, modeloEscore = null, ligacaoNbme = null, priori = PRIORI_PADRAO, desde = null, ate = null, efeitoModo = null, sigmaCorte = undefined, ponderar = true } = {}) {
  const todos = itens instanceof Map ? [...itens.values()] : Object.values(itens || {});
  const doStep = todos.filter((q) => q.step === step);
  const { usadas: brutas, ignoradas } = prepararRespostas(respostas, itens, { step, pesos, usarCalibrado, desde, ate, efeitoModo });
  const pond = ponderar && pesosSistemas ? ponderarPeloOutline(brutas, pesosSistemas) : { usadas: brutas, fatores: {}, distancia: null, mistura: {} };
  const usadas = pond.usadas;
  let inc = Number.isFinite(sigmaCorte) ? { sigma: sigmaCorte, origem: sigmaCorte > 0 ? "informada" : "sem_incerteza" } : incertezaCorte(brutas);
  let mu = 0;
  const usarNbme = !!(ligacaoNbme?.suficiente && Number.isFinite(ligacaoNbme.mu) && Number.isFinite(ligacaoNbme.sigma) && !Number.isFinite(sigmaCorte) && inc.origem !== "painel");
  if (usarNbme) { mu = ligacaoNbme.mu; inc = { sigma: ligacaoNbme.sigma, origem: "nbme", itens_painel: inc.itens_painel ?? 0 }; }
  const est = eap(usadas, { priori, incluirPosterior: true, sigmaCorte: inc.sigma, centroCorte: mu });
  const post = est.posterior;
  const bsForm = bsFormulario || doStep.map((q) => bDoItem(q, { usarCalibrado }));
  const pe = percentualEsperado(post, bsForm, { limiar: mu });
  const vistos = new Set(usadas.map((u) => u.questao_id));
  const restantes = doStep.filter((q) => !vistos.has(q.id)).map((q) => bDoItem(q, { usarCalibrado }));
  const infoMedia = informacaoMedia(est.theta, restantes.length ? restantes : bsForm);
  const contSist = new Map();
  for (const u of brutas) if (u.item.sistema) contSist.set(u.item.sistema, (contSist.get(u.item.sistema) || 0) + 1);
  const outline = sistemas && sistemas.length ? sistemas : [...new Set(doStep.map((q) => q.sistema).filter(Boolean))].sort();
  const cob = cobertura(contSist, outline, { minPorSistema: regra.min_por_sistema, pesos: pesosSistemas, nTotal: brutas.length, fracaoPeso: regra.fracao_peso_sistema ?? REGRA_CONFIANCA.fracao_peso_sistema });
  const n_minimo = itensMinimos(bsForm, { regra, priori });
  const origemCorte = inc.origem === "painel" ? "painel" : inc.origem === "nbme" ? "nbme" : inc.origem === "misto" ? "misto" : "provisorio";
  const confianca = classificarConfianca({ p: est.p_aprovacao, theta: est.theta - mu, dp: est.dp, n_efetivo: est.n_efetivo, n_minimo, cob, infoMedia, regra, sigmaCorte: inc.sigma, origemCorte });
  /* perfil por área com os pesos originais: a repesagem é para a estimativa global;
     numa área, ela só daria precisão que os dados não têm */
  const perfil = {};
  for (const dim of DIMENSOES_PERFIL[step] || []) perfil[dim] = perfilPorArea(brutas, dim, { priori, limiar: mu });
  /* Sensibilidade ao padrão provisório: P(theta > c) se o banco inteiro for
     SENSIBILIDADE_PADRAO.deslocamento logit mais fácil (o theta estimado está inflado
     nessa quantidade, então o limiar verdadeiro fica em +d) ou mais difícil (-d), só
     com a incerteza da medida em cada cenário. */
  const dS = SENSIBILIDADE_PADRAO.deslocamento;
  const sensibilidade = padraoProvisorio(origemCorte) ? {
    deslocamento: dS, pontos: SENSIBILIDADE_PADRAO.pontos,
    itens_mais_faceis: pAcimaDoCorte(post, 0, null, dS),
    itens_mais_dificeis: pAcimaDoCorte(post, 0, null, -dS),
    muda_leitura: [dS, -dS].some((d) => faixaP(pAcimaDoCorte(post, 0, null, d), regra) !== faixaP(est.p_aprovacao, regra))
  } : null;
  const nCal = usadas.filter((u) => usarCalibrado && Number.isFinite(u.item.b_calibrado)).length;
  const base = nCal === 0 ? "angoff" : nCal === usadas.length ? "calibrado" : "misto";
  const avisos = [
    origemCorte === "painel"
      ? "O limiar do banco vem do Angoff publicado pelo painel de juízes. A probabilidade inclui a incerteza do painel. Não é resultado oficial do USMLE nem do NBME."
      : origemCorte === "nbme"
      ? "O limiar está ligado às autoavaliações NBME da turma: é a habilidade em que o escore NBME previsto atinge " + ligacaoNbme.limiar + ", estimada com " + ligacaoNbme.n + " escores reais. A probabilidade inclui a incerteza dessa ligação (desvio-padrão de " + String(Math.round(inc.sigma * 100) / 100).replace(".", ",") + " logit). Não é resultado oficial do USMLE nem do NBME."
      : "O limiar do banco é provisório: vem da dificuldade-alvo que os autores deram a cada item, e não de um painel de juízes. A probabilidade inclui essa incerteza (desvio-padrão de " + String(Math.round(inc.sigma * 100) / 100).replace(".", ",") + " logit no padrão) e mede a posição em relação ao padrão do banco. Não é probabilidade de aprovação no USMLE nem resultado do NBME.",
    base === "angoff" ? "Dificuldades dos itens: as do banco, ainda sem recalibração pelas respostas da turma." : "Dificuldades recalibradas pelas respostas da turma e ancoradas no mesmo limiar."
  ];
  if (step === "step2ck") avisos.push("No Step 2 CK, o limiar do banco foi fixado para representar o padrão mínimo de aprovação (" + PADRAO_STEP2CK + " desde 01/07/2025). A nota de três dígitos só será estimada depois da calibração com escores reais.");
  if (pond.distancia !== null && pond.distancia > 0.15) avisos.push("A mistura de sistemas que você respondeu está longe da prova (distância de " + Math.round(pond.distancia * 100) + "%); a estimativa repesa as respostas para a composição do outline, com limite, e fica menos precisa.");
  const ic90_relativo = intervaloRelativo(post, inc.sigma, 0.9, mu);
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
    ic90_relativo,
    p_aprovacao: est.p_aprovacao,
    p_medida: est.p_medida,
    corte: { sigma: inc.sigma, origem: origemCorte, centro: mu, itens_painel: inc.itens_painel ?? 0, ligacao_nbme: usarNbme ? { limiar: ligacaoNbme.limiar, n: ligacaoNbme.n, ep: ligacaoNbme.ep } : null },
    sensibilidade,
    percentual_esperado: pe,
    confianca,
    cobertura: cob,
    mistura: { distancia: pond.distancia, fatores: pond.fatores, sistemas: pond.mistura },
    perfil,
    base,
    itens_calibrados: nCal,
    efeito_modo: Number.isFinite(efeitoModo?.delta) ? efeitoModo.delta : null,
    oficial: false,
    avisos,
    limiar: step === "step2ck" ? { tipo: "padrao_do_banco", origem: origemCorte, escore_oficial: PADRAO_STEP2CK } : { tipo: "padrao_do_banco", origem: origemCorte, resultado_oficial: "Pass/Fail" },
    desfechos: null,
    escore: null
  };
  /* respostas usadas (com a repesagem), para que outras contas (contribuição por área)
     partam exatamente da mesma estimativa; fora da serialização */
  Object.defineProperty(out, "usadas", { value: usadas, enumerable: false });
  Object.defineProperty(out, "usadas_brutas", { value: brutas, enumerable: false });
  if (modeloDesfechos?.suficiente) {
    const d = intervaloDesfechos(modeloDesfechos, { theta: est.theta, dp: est.dp });
    const decidida = d.p >= regra.p_alta || d.p <= regra.p_baixa;
    const ok = decidida && d.ic90[0] !== null && (d.ic90[0] >= regra.p_alta || d.ic90[1] <= regra.p_baixa) && confianca.alta;
    out.desfechos = {
      p_aprovacao: d.p, ic90: d.ic90,
      rotulo: ok ? "alta_confianca" : "estimativa_preliminar",
      texto: ok ? ROTULOS_CONFIANCA.alta_confianca + " (pelos resultados oficiais da turma)" : "Estimativa pelos resultados oficiais da turma, ainda sem decisão",
      modelo: { beta0: modeloDesfechos.beta0, beta1: modeloDesfechos.beta1, n: modeloDesfechos.n, aprovados: modeloDesfechos.aprovados ?? null, reprovados: modeloDesfechos.reprovados ?? null, taxa_resposta: modeloDesfechos.taxa_resposta ?? null }
    };
  }
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
      ? "As duas últimas autoavaliações NBME atingem a meta, mas o banco indica, com precisão alta, desempenho abaixo do limiar do banco. Converse com o mentor antes de manter a data."
      : "Critério principal atendido (EXIT 18)." + (banco ? " Indicador do banco: " + leituraBanco(banco) + "." : "");
  } else if (st === "nao_pronto") {
    divergente = favoravel;
    mensagem = divergente
      ? "O banco indica, com precisão alta, desempenho acima do limiar do banco, mas o critério principal (NBME) ainda não foi atingido. A decisão segue a NBME."
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
  return textoProbabilidade(b.p_aprovacao) + " de probabilidade de estar acima do limiar do banco, padrão " + (b.corte?.origem === "painel" ? "do painel" : "provisório") + " (" + (b.confianca?.alta ? "precisão alta" : "estimativa preliminar") + ")";
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
   X: linhas de covariáveis sem o intercepto; y: 0 ou 1; pesos: peso de cada linha
   (opcional; ponderação pelo inverso da probabilidade de resposta, por exemplo).
   Devolve { beta: [b0, b1, ...], ep, cov (inversa da informação), convergiu,
   iteracoes, loglik }. Com pesos, cov é a inversa da informação pesada (aproximação
   que não inclui a variância extra da estimação dos pesos). */
export function regressaoLogistica(X, y, { l2 = 1e-6, max_iter = 100, tol = 1e-9, pesos = null } = {}) {
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
      const pi = pesos ? Number(pesos[i]) : 1;
      const mu = expit(eta), w = pi * mu * (1 - mu);
      for (let k = 0; k < p; k++) { g[k] += pi * Z[i][k] * (y[i] - mu); for (let l = 0; l < p; l++) H[k][l] += w * Z[i][k] * Z[i][l]; }
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
  for (let i = 0; i < n; i++) { let eta = 0; for (let k = 0; k < p; k++) eta += Z[i][k] * beta[k]; ll += (pesos ? Number(pesos[i]) : 1) * (y[i] ? logExpit(eta) : logExpit(-eta)); }
  return { beta, ep: inv ? inv.map((r, k) => Math.sqrt(Math.max(0, r[k]))) : beta.map(() => null), cov: inv, convergiu: conv, iteracoes: Math.min(it, max_iter), loglik: ll };
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
   naoRespondentes: [{ theta }] dos participantes elegíveis que não informaram o
   resultado (calibrarDesfechos). Com eles, a taxa de resposta é registrada e o
   ajuste é ponderado pelo inverso da probabilidade de informar o resultado, estimada
   por uma regressão logística de "informou" sobre theta (peso limitado a
   peso_ipw_max), o que corrige o viés de seleção quando quem informa difere de quem
   não informa só pelo theta.
   suficiente (o modelo pode aparecer para o aluno): pelo menos min_por_classe (30)
   aprovados e reprovados, ajuste convergido, sem separação completa e taxa de
   resposta de pelo menos taxa_resposta_min (50%) quando conhecida. exploratorio:
   pelo menos min_exploratorio (10) de cada classe, para a área administrativa. */
export function ajustarDesfechos(registros, { min_por_classe = DESFECHOS_PADRAO.min_por_classe, min_exploratorio = DESFECHOS_PADRAO.min_exploratorio, taxa_resposta_min = DESFECHOS_PADRAO.taxa_resposta_min, naoRespondentes = null, l2 = 1e-6 } = {}) {
  const ok = (registros || []).filter((r) => Number.isFinite(r.theta) && (r.resultado === "pass" || r.resultado === "fail"));
  const y = ok.map((r) => (r.resultado === "pass" ? 1 : 0));
  const aprovados = y.filter(Boolean).length, reprovados = y.length - aprovados;
  const semResp = Array.isArray(naoRespondentes) ? naoRespondentes.filter((r) => Number.isFinite(r.theta)) : null;
  const taxa_resposta = semResp ? (ok.length + semResp.length ? ok.length / (ok.length + semResp.length) : null) : null;
  const exploratorio = aprovados >= min_exploratorio && reprovados >= min_exploratorio;
  const base = { n: ok.length, aprovados, reprovados, taxa_resposta, nao_respondentes: semResp ? semResp.length : null, exploratorio, suficiente: false };
  if (!ok.length || !aprovados || !reprovados) return { ...base, exploratorio: false, beta0: null, beta1: null, ep0: null, ep1: null, cov: null, auc: null, brier: null, ponderado: false, aviso: "Ainda não há aprovados e reprovados suficientes para ajustar o modelo." };
  /* ponderação pelo inverso da probabilidade de resposta */
  let pesosIpw = null;
  if (semResp && semResp.length >= 5 && ok.length >= 5) {
    const Xr = [...ok.map((r) => [r.theta]), ...semResp.map((r) => [r.theta])];
    const yr = [...ok.map(() => 1), ...semResp.map(() => 0)];
    const mr = regressaoLogistica(Xr, yr, { l2: 1e-3 });
    if (mr.convergiu) {
      const w = ok.map((r) => Math.min(DESFECHOS_PADRAO.peso_ipw_max, 1 / Math.max(1e-6, expit(mr.beta[0] + mr.beta[1] * r.theta))));
      const media = w.reduce((a, b) => a + b, 0) / w.length;
      pesosIpw = w.map((x) => x / media);
    }
  }
  const m = regressaoLogistica(ok.map((r) => [r.theta]), y, { l2, pesos: pesosIpw });
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
  const eventos = aprovados >= min_por_classe && reprovados >= min_por_classe;
  const respostaOk = taxa_resposta === null || taxa_resposta >= taxa_resposta_min;
  const suficiente = eventos && respostaOk && !separacao && !!m.convergiu;
  return {
    ...base, exploratorio: exploratorio && !separacao && !!m.convergiu, suficiente, separacao, ponderado: !!pesosIpw,
    beta0: m.beta[0], beta1: m.beta[1], ep0: m.ep[0], ep1: m.ep[1], cov: m.cov ? m.cov.map((r) => r.slice()) : null, convergiu: m.convergiu,
    auc: auc(prev, y), brier,
    aviso: separacao ? "Separação completa: nenhum aprovado tem θ abaixo de um reprovado (ou o contrário), e os coeficientes não ficam determinados. Use só como exploração até haver sobreposição."
      : !m.convergiu ? "O ajuste não convergiu. Use só como exploração."
      : !eventos ? "Modelo com poucos desfechos: fica só na área administrativa até ter pelo menos " + min_por_classe + " aprovados e " + min_por_classe + " reprovados."
      : !respostaOk ? "Taxa de resposta dos desfechos de " + Math.round(taxa_resposta * 100) + "%, abaixo de " + Math.round(taxa_resposta_min * 100) + "%: quem informa o resultado pode ser diferente de quem não informa. O modelo fica só na área administrativa."
      : ""
  };
}

/* Probabilidade pelos desfechos e o seu intervalo. Abordagem escolhida (seção 13):
   regressão calibrada sobre o theta EAP. O modelo é ajustado com o EAP de cada aluno
   na data da prova, e o EAP já carrega o encolhimento e o erro de medida; a curva
   ajustada é P(Pass | EAP), que é exatamente o que se quer prever para um aluno novo
   com o seu EAP. Integrar de novo a incerteza de theta (dp) contaria o erro de medida
   duas vezes e puxaria P para 0,5; por isso dp é aceito e ignorado. O que entra é a
   incerteza dos coeficientes, eta = beta0 + beta1 * theta com beta ~ N(beta, cov):
     m = beta0 + beta1 theta;  v_b = cov00 + 2 theta cov01 + theta² cov11
     p = E[expit(eta)], eta ~ N(m, v_b) (quadratura de 81 pontos)
     ic90 = [expit(m - 1,645 raiz(v_b)), expit(m + 1,645 raiz(v_b))]
   Validação: teste "desfechos sobre o EAP: calibração e cobertura do intervalo de P".
   Supõe que o aluno novo tenha EAP com precisão parecida com a dos alunos do ajuste.
   Sem cov (modelo antigo), p = expit(m) e ic90 = [null, null]. */
export function intervaloDesfechos(modelo, { theta } = {}) {
  if (!modelo || modelo.beta0 === null || modelo.beta0 === undefined) return { p: null, ic90: [null, null] };
  const b0 = modelo.beta0, b1 = modelo.beta1;
  const C = Array.isArray(modelo.cov) && modelo.cov.length >= 2 ? modelo.cov : null;
  const m = b0 + b1 * theta;
  const vb = C ? Math.max(0, C[0][0] + 2 * theta * C[0][1] + theta * theta * C[1][1]) : 0;
  const sd = Math.sqrt(vb);
  let p;
  if (!(sd > 0)) p = expit(m);
  else { let s = 0, w = 0; for (let k = -40; k <= 40; k++) { const z = k / 10, d = Math.exp(-0.5 * z * z); s += d * expit(m + z * sd); w += d; } p = s / w; }
  if (!C) return { p, ic90: [null, null] };
  const h = 1.6448536 * sd;
  return { p, ic90: [expit(m - h), expit(m + h)] };
}
/* P(aprovação) pelo modelo de desfechos (regressão sobre o EAP; dp ignorado, ver acima) */
export function probAprovacaoDesfechos(modelo, { theta, dp = 0 }) {
  if (!modelo || modelo.beta0 === null) return null;
  return intervaloDesfechos(modelo, { theta, dp }).p;
}

/* ---------- efeito do modo tutor ----------
   Deslocamento médio do modo tutor em relação ao cronometrado, como efeito fixo no
   Rasch: P(acerto no tutor) = expit(theta_j - b_i + delta). theta_j de cada pessoa
   vem só das respostas cronometradas (EAP, b em uso); delta é o máximo a posteriori
   com priori N(0, 1²), por Newton, com os theta fixos. respostas: matriz de primeiras
   respostas com { pessoa, questao_id, correta, modo } (listRespostasCalibracao com
   incluirTutor). Só entram pessoas com pelo menos minCronometradas respostas
   cronometradas. Devolve { delta, ep, n_tutor, pessoas, suficiente } (suficiente com
   pelo menos minTutor respostas no tutor). */
export function estimarEfeitoModo(respostas, itens, { minCronometradas = 10, minTutor = 200, usarCalibrado = true } = {}) {
  const get = itens instanceof Map ? (id) => itens.get(id) : (id) => itens?.[id];
  const porPessoa = new Map();
  for (const r of respostas || []) {
    const q = get(r.questao_id);
    if (!q) continue;
    const p = porPessoa.get(String(r.pessoa)) || porPessoa.set(String(r.pessoa), { cron: [], tutor: [] }).get(String(r.pessoa));
    (r.modo === "tutor" ? p.tutor : p.cron).push({ b: bDoItem(q, { usarCalibrado }), x: r.correta ? 1 : 0 });
  }
  const linhas = [];
  let pessoas = 0;
  for (const p of porPessoa.values()) {
    if (p.cron.length < minCronometradas || !p.tutor.length) continue;
    pessoas++;
    const th = eap(p.cron, { grade: { min: -6, max: 6, passo: 0.05 }, sigmaCorte: 0 }).theta;
    for (const t of p.tutor) linhas.push({ z: th - t.b, x: t.x });
  }
  if (!linhas.length) return { delta: null, ep: null, n_tutor: 0, pessoas: 0, suficiente: false };
  let d = 0, h = 1;
  for (let k = 0; k < 50; k++) {
    let g = -d; h = 1;
    for (const l of linhas) { const P = expit(l.z + d); g += l.x - P; h += P * (1 - P); }
    const passo = clamp(g / h, 1);
    d += passo;
    if (Math.abs(passo) < 1e-8) break;
  }
  return { delta: d, ep: 1 / Math.sqrt(h), n_tutor: linhas.length, pessoas, suficiente: linhas.length >= minTutor };
}

/* Escores reais (Step 2 CK oficial ou NBME) contra o theta do banco:
   escore = a + b * theta + erro. O mesmo aluno costuma fazer várias autoavaliações NBME, e
   os escores dele são correlacionados (efeito do aluno). Tratar cada escore como
   independente conta escores em vez de alunos e encolhe o erro-padrão dos coeficientes.
   Por isso:
   - cada aluno pesa 1 no ajuste (mínimos quadrados ponderados, peso 1/n_i em cada um dos
     n_i escores do aluno i), o que equivale a um escore por aluno quando ninguém repete;
   - a covariância dos coeficientes (var_a, var_b, cov_ab) é a robusta por aluno
     (sanduíche agrupado, com a correção G/(G-1) x (N-1)/(N-2) para poucos grupos), que
     vale com qualquer correlação entre os escores do mesmo aluno;
   - suficiente exige pelo menos min_alunos ALUNOS distintos (critério interno); o número
     de escores não conta para esse mínimo.
   Os pontos são os da regressão marginal: o regressor é o EAP de cada data, e como
   E[theta | respostas] = EAP, a reta sobre o EAP estima a relação com o theta verdadeiro
   sem a atenuação de um regressor com erro clássico (seção 6.2), desde que a priori
   represente a população. Um modelo de efeito aleatório (GLS) usaria também a variação do
   EAP dentro do aluno entre uma data e outra, que é em boa parte erro de medida, e
   puxaria b para baixo; por isso ficou de fora (PSICOMETRIA.md, seção 6.2).
   sigma: desvio de um escore novo de um aluno novo (média, por aluno, do quadrado do
   resíduo, com G - 2 graus de liberdade); tau e icc: parte desse desvio que é do aluno
   (estimativa por momentos, só com repetição). Registros sem user_id contam cada um como
   um aluno. */
export function ajustarEscore(registros, { min_alunos = DESFECHOS_PADRAO.min_alunos } = {}) {
  const ok = (registros || []).filter((r) => Number.isFinite(r.theta) && Number.isFinite(r.escore));
  const n = ok.length;
  const grupos = new Map();
  ok.forEach((r, i) => { const k = r.user_id !== undefined && r.user_id !== null && r.user_id !== "" ? "u:" + r.user_id : "r:" + i; (grupos.get(k) || grupos.set(k, []).get(k)).push(r); });
  const G = [...grupos.values()];
  const nAlunos = G.length;
  const base = { n, n_alunos: nAlunos, min_alunos, suficiente: false, a: null, b: null, sigma: null, r2: null };
  if (n < 3 || nAlunos < 3) return { ...base, aviso: "Ainda não há escores reais de alunos suficientes para calibrar a nota." };
  /* mínimos quadrados ponderados, cada aluno com peso total 1 */
  let sw = 0, sx = 0, sy = 0;
  for (const g of G) for (const r of g) { const w = 1 / g.length; sw += w; sx += w * r.theta; sy += w * r.escore; }
  const mx = sx / sw, my = sy / sw;
  let sxx = 0, sxy = 0, syy = 0;
  for (const g of G) for (const r of g) { const w = 1 / g.length; sxx += w * (r.theta - mx) ** 2; sxy += w * (r.theta - mx) * (r.escore - my); syy += w * (r.escore - my) ** 2; }
  if (!(sxx > 1e-12)) return { ...base, aviso: "Os escores não variam em theta; não há como ajustar a regressão." };
  const b = sxy / sxx, a = my - b * mx;
  /* (X'WX)^-1 e o "meio" do sanduíche, somado por aluno */
  const m00 = sw, m01 = sx, m11 = sxx + sw * mx * mx;
  const det = m00 * m11 - m01 * m01;
  const i00 = m11 / det, i01 = -m01 / det, i11 = m00 / det;
  let c00 = 0, c01 = 0, c11 = 0, sseAluno = 0, sse = 0, ssw = 0, glw = 0;
  for (const g of G) {
    let u0 = 0, u1 = 0, se = 0, s1 = 0;
    for (const r of g) { const e = r.escore - a - b * r.theta, w = 1 / g.length; u0 += w * e; u1 += w * r.theta * e; se += e * e; s1 += e; sse += w * e * e; }
    c00 += u0 * u0; c01 += u0 * u1; c11 += u1 * u1;
    sseAluno += se / g.length;
    if (g.length > 1) { const mE = s1 / g.length; for (const r of g) ssw += (r.escore - a - b * r.theta - mE) ** 2; glw += g.length - 1; }
  }
  const corr = nAlunos > 1 ? (nAlunos / (nAlunos - 1)) * ((n - 1) / Math.max(1, n - 2)) : 1;
  const sand = (p, q) => {
    const A = [[i00, i01], [i01, i11]], C = [[c00, c01], [c01, c11]];
    let v = 0;
    for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++) v += A[p][k] * C[k][l] * A[l][q];
    return corr * v;
  };
  const var_a = sand(0, 0), var_b = sand(1, 1), cov_ab = sand(0, 1);
  const s2 = sseAluno / Math.max(1, nAlunos - 2);
  const s2w = glw > 0 ? ssw / glw : null;
  const tau2 = s2w === null ? null : Math.max(0, s2 - s2w);
  /* erro-padrão de b se cada escore contasse como um aluno (só para comparar) */
  let oxx = 0, ox = 0, oy = 0, oxy = 0;
  for (const r of ok) { ox += r.theta; oy += r.escore; }
  ox /= n; oy /= n;
  for (const r of ok) { oxx += (r.theta - ox) ** 2; oxy += (r.theta - ox) * (r.escore - oy); }
  const ob = oxx > 0 ? oxy / oxx : 0, oa = oy - ob * ox;
  const osse = ok.reduce((t, r) => t + (r.escore - oa - ob * r.theta) ** 2, 0);
  const repetido = nAlunos < n;
  const suficiente = nAlunos >= min_alunos;
  return {
    n, n_alunos: nAlunos, escores_por_aluno: Math.round((n / nAlunos) * 100) / 100, min_alunos, suficiente,
    metodo: repetido ? "mqp_peso_por_aluno_ep_robusto_agrupado" : "minimos_quadrados_um_escore_por_aluno",
    a, b, sigma: Math.sqrt(s2), tau: tau2 === null ? null : Math.sqrt(tau2), icc: tau2 === null || !(s2 > 0) ? null : tau2 / s2,
    r2: syy > 0 ? 1 - sse / syy : null, var_a, var_b, cov_ab, media_theta: mx,
    ep_b_sem_agrupar: oxx > 0 && n > 2 ? Math.sqrt(osse / (n - 2) / oxx) : null,
    aviso: suficiente ? "" : "Poucos alunos com escore real (" + nAlunos + " alunos, " + n + " escores; mínimo de " + min_alunos + " alunos); a nota estimada ainda não é mostrada ao aluno."
  };
}
/* Escore previsto, intervalo preditivo de 90% e P(escore >= limiar). Mesma abordagem
   dos desfechos: a regressão é sobre o EAP e o resíduo sigma já contém o erro de
   medida de theta, então dp não entra de novo; entra a incerteza dos coeficientes
   (var_a + 2 theta cov_ab + theta² var_b), quando o modelo a traz. */
export function preverEscore(modelo, { theta } = {}, limiar = PADRAO_STEP2CK) {
  if (!modelo || modelo.a === null) return null;
  const media = modelo.a + modelo.b * theta;
  const vCoef = Number.isFinite(modelo.var_a) && Number.isFinite(modelo.var_b) && Number.isFinite(modelo.cov_ab) ? Math.max(0, modelo.var_a + 2 * theta * modelo.cov_ab + theta * theta * modelo.var_b) : 0;
  const s = Math.sqrt(modelo.sigma * modelo.sigma + vCoef);
  return { media, ic90: [media - 1.6448536 * s, media + 1.6448536 * s], p_limiar: s > 0 ? 1 - normalCdf((limiar - media) / s) : media >= limiar ? 1 : 0, limiar, suficiente: !!modelo.suficiente };
}

/* ---------- ligação com as autoavaliações NBME (seção 6.2) ----------
   Com a regressão escore NBME = a + b theta (ajustarEscore sobre o EAP de cada aluno
   na data da autoavaliação, só standard-paced), o corte ligado é o theta em que o
   escore previsto atinge o padrão de aprovação: mu = (limiar - a) / b. Erro-padrão pelo
   método delta, com gradiente (-1/b, -(limiar - a)/b²):
     ep² = var_a / b² + (limiar - a)² var_b / b⁴ + 2 (limiar - a) cov_ab / b³
   suficiente: pelo menos min_alunos ALUNOS distintos (escores repetidos do mesmo aluno
   entram no ajuste com o efeito do aluno, mas não contam para o mínimo), b > 0 com
   b / ep(b) >= min_t e ep <= ep_max. sigma = max(ep, INCERTEZA_CORTE.minimo) vai no lugar do provisório. É
   uma ligação linear (regressão), não equipercentil: com 30 a 100 escores a ligação
   equipercentil fica instável nas caudas, e o que interessa é um ponto só, o corte. */
export function corteLigadoNbme(modelo, { step = "step1", limiar = LIGACAO_NBME.limiar[step], min_alunos = LIGACAO_NBME.min_alunos, min_t = LIGACAO_NBME.min_t, ep_max = LIGACAO_NBME.ep_max } = {}) {
  const base = { metodo: "linear_regressao_sobre_eap_agrupada_por_aluno", limiar, n: modelo?.n ?? 0, n_alunos: modelo?.n_alunos ?? null, min_alunos, mu: null, ep: null, sigma: null, suficiente: false };
  if (!modelo || !Number.isFinite(modelo.a) || !Number.isFinite(modelo.b)) return { ...base, motivo: "Ainda não há escores NBME suficientes para a ligação." };
  const { a, b } = modelo;
  if (!Number.isFinite(modelo.var_b) || !Number.isFinite(modelo.var_a) || !Number.isFinite(modelo.cov_ab)) return { ...base, motivo: "Modelo sem a covariância dos coeficientes; recalcule a calibração." };
  if (!(b > 0)) return { ...base, motivo: "O escore NBME não cresce com a habilidade do banco nos dados da turma (coeficiente angular " + String(Math.round(b * 10) / 10).replace(".", ",") + ")." };
  const t = b / Math.sqrt(modelo.var_b);
  const d = limiar - a;
  const ep2 = modelo.var_a / (b * b) + (d * d * modelo.var_b) / b ** 4 + (2 * d * modelo.cov_ab) / b ** 3;
  const mu = d / b, ep = Math.sqrt(Math.max(0, ep2));
  const motivos = [];
  /* o mínimo é de alunos: modelo antigo, sem a contagem de alunos, não serve */
  if (!Number.isFinite(modelo.n_alunos)) motivos.push("Modelo sem a contagem de alunos (escores repetidos do mesmo aluno contados como independentes); recalcule a calibração.");
  else if (modelo.n_alunos < min_alunos) motivos.push("Faltam alunos: " + modelo.n_alunos + " de " + min_alunos + " (" + (modelo.n ?? 0) + " escores; escores repetidos do mesmo aluno não contam para o mínimo).");
  if (t < min_t) motivos.push("Relação fraca entre o escore NBME e a habilidade do banco (b / ep = " + String(Math.round(t * 10) / 10).replace(".", ",") + "; mínimo " + min_t + ").");
  if (ep > ep_max) motivos.push("Erro-padrão do corte ligado de " + String(Math.round(ep * 100) / 100).replace(".", ",") + " logit, acima de " + String(ep_max).replace(".", ",") + ".");
  return { ...base, mu, ep, sigma: Math.max(ep, INCERTEZA_CORTE.minimo), t, suficiente: motivos.length === 0, motivo: motivos.join(" ") };
}

/* Junta desfechos e respostas: para cada desfecho, o theta do aluno com as respostas
   dadas até a data da prova. desfechos: [{ user_id, step, data, resultado?, escore? }];
   respostasPorUsuario: Map user_id -> respostas; itens: Map id -> item. */
export function montarDadosDesfechos(desfechos, respostasPorUsuario, itens, { pesos = PESOS_MODO, efeitoModo = null } = {}) {
  const out = [];
  for (const d of desfechos || []) {
    const rs = respostasPorUsuario instanceof Map ? respostasPorUsuario.get(d.user_id) : respostasPorUsuario?.[d.user_id];
    const ate = d.data ? new Date(String(d.data).slice(0, 10) + "T23:59:59Z").toISOString() : null;
    const { usadas } = prepararRespostas(rs || [], itens, { step: d.step, pesos, ate, efeitoModo });
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
