/* Road to America | painel Angoff de juízes: regras e cálculos puros (sem DOM).
   Usado pela tela do admin (admin/js/views/angoff.js) e pelas duas camadas de dados.

   Método (Angoff modificado, com rodadas):
   - cada juiz estima, de 0 a 100, a porcentagem de examinandos no limiar de aprovação
     (o examinando "minimamente competente") que acertariam o item; o juiz vê o item
     completo e só vê o gabarito e a explicação depois de dar a estimativa;
   - rodada 1 independente; entre rodadas, o painel vê a distribuição das estimativas
     de cada item (sem identificar quem deu qual) e o p observado na turma (proporção
     de acerto na primeira resposta de cada pessoa, sem modo tutor), discute e refaz;
   - corte do formulário = média, entre os itens, da média das estimativas dos juízes
     na última rodada (em proporção); erro-padrão = desvio-padrão dos cortes individuais
     dividido pela raiz do número de juízes;
   - o valor do painel substitui a dificuldade-alvo provisória do item quando pelo menos
     10 juízes avaliaram o item na rodada final (MIN_JUIZES; a literatura recomenda de
     10 a 15) e o erro-padrão do corte do painel fica abaixo de 0,02 em proporção
     (CORTE_EP_MAX), isto é, 2 pontos percentuais;
   Verificação por Hofstee: cada juiz informa o corte mínimo e máximo aceitáveis (em %
   de acerto) e a reprovação mínima e máxima aceitáveis (em % de examinandos). Com as
   médias, a reta que liga (k_min, f_max) a (k_max, f_min) cruza a curva de reprovação
   F(c), a fração de examinandos com escore abaixo de c; o cruzamento é o corte de
   Hofstee. Como no banco cada pessoa responde um subconjunto diferente dos itens, o
   escore de cada pessoa é o escore esperado no formulário do painel pelo theta EAP de
   todas as respostas dela (distribuicaoEscores com porId), e não a porcentagem bruta
   dos itens do painel que ela viu. O corte do Angoff passa na verificação quando fica entre k_min e k_max e a
   reprovação que ele produz fica entre f_min e f_max.
   Referências: Angoff WH (1971), Educational Measurement, 2ª ed.; Hambleton RK, Pitoniak
   MJ, Educational Measurement, 4ª ed. (2006), cap. 13; Hofstee WKB (1983), em On
   Educational Testing; De Gruijter DNM (1985), Applied Psychological Measurement 9:85. */

export const MIN_JUIZES = 10;
/* Publicar com o Hofstee ausente ou fora das janelas exige justificativa registrada,
   com pelo menos este número de caracteres (PSICOMETRIA.md, seção 2). */
export const JUSTIFICATIVA_MIN = 30;
export const CORTE_EP_MAX = 0.02;
export const ESTADOS_PAINEL = Object.freeze(["avaliacao", "discussao", "encerrado"]);
export const RODADAS_MAX = 5;

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const dp = (xs) => { if (xs.length < 2) return 0; const m = media(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };

/* ---------- validação ---------- */
export function validarEstimativa(v) {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isInteger(n) || n < 0 || n > 100) return ["A estimativa é um número inteiro de 0 a 100."];
  return [];
}
export function validarHofstee(h) {
  const e = [];
  const num = (k) => Number(h?.[k]);
  for (const k of ["k_min", "k_max", "f_min", "f_max"]) if (!(Number.isFinite(num(k)) && num(k) >= 0 && num(k) <= 100)) e.push("Os quatro valores do Hofstee vão de 0 a 100.");
  if (!e.length && !(num("k_min") < num("k_max"))) e.push("O corte mínimo aceitável precisa ser menor que o máximo.");
  if (!e.length && !(num("f_min") < num("f_max"))) e.push("A reprovação mínima aceitável precisa ser menor que a máxima.");
  return [...new Set(e)];
}
export function validarPainel(p) {
  const e = [];
  if (!["step1", "step2ck"].includes(p?.step)) e.push("Step inválido.");
  const nome = String(p?.nome || "").trim();
  if (nome.length < 3 || nome.length > 120) e.push("Dê ao painel um nome de 3 a 120 caracteres.");
  const itens = Array.isArray(p?.itens) ? p.itens : [];
  if (!itens.length || itens.length > 400) e.push("O painel avalia de 1 a 400 itens.");
  if (new Set(itens).size !== itens.length) e.push("Há itens repetidos no painel.");
  const r = Number(p?.rodadas_max ?? 3);
  if (!Number.isInteger(r) || r < 1 || r > RODADAS_MAX) e.push("O painel tem de 1 a " + RODADAS_MAX + " rodadas.");
  return e;
}

/* ---------- transições ----------
   avaliacao (rodada r) --fechar_rodada--> discussao (rodada r)
   discussao (rodada r) --abrir_rodada--> avaliacao (rodada r + 1), até rodadas_max
   avaliacao ou discussao --encerrar--> encerrado (a rodada final é a atual) */
export function proximoEstado(painel, acao) {
  const { estado, rodada, rodadas_max: max = 3 } = painel || {};
  if (estado === "encerrado") throw new Error("O painel está encerrado.");
  if (acao === "fechar_rodada") { if (estado !== "avaliacao") throw new Error("Não há rodada de avaliação aberta."); return { estado: "discussao", rodada }; }
  if (acao === "abrir_rodada") {
    if (estado !== "discussao") throw new Error("Feche a rodada atual antes de abrir a próxima.");
    if (rodada >= max) throw new Error("O painel já está na última rodada prevista (" + max + ").");
    return { estado: "avaliacao", rodada: rodada + 1 };
  }
  if (acao === "encerrar") return { estado: "encerrado", rodada };
  throw new Error("Ação desconhecida.");
}
/* Rodadas com resultado visível para o painel (feedback): as já fechadas */
export function rodadasFechadas(painel) {
  if (!painel) return [];
  const ult = painel.estado === "avaliacao" ? painel.rodada - 1 : painel.rodada;
  return Array.from({ length: Math.max(0, ult) }, (_, i) => i + 1);
}

/* ---------- estatísticas ----------
   avaliacoes: [{ juiz_id, questao_id, rodada, valor }] */
export function estatisticaItem(valores) {
  const v = valores.filter((x) => Number.isFinite(x));
  const hist = Array(10).fill(0);
  for (const x of v) hist[Math.min(9, Math.floor(x / 10))]++;
  return { n: v.length, media: media(v), dp: v.length ? dp(v) : null, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null, histograma: hist };
}
export function resumoRodada(itens, avaliacoes, rodada) {
  const daRodada = (avaliacoes || []).filter((a) => a.rodada === rodada && (itens || []).includes(a.questao_id));
  const porItem = {};
  for (const id of itens || []) porItem[id] = estatisticaItem(daRodada.filter((a) => a.questao_id === id).map((a) => Number(a.valor)));
  /* corte de cada juiz: média das suas estimativas na rodada (só quem avaliou todos os itens) */
  const juizes = [...new Set(daRodada.map((a) => a.juiz_id))];
  const cortesJuiz = {};
  for (const j of juizes) {
    const vs = daRodada.filter((a) => a.juiz_id === j);
    cortesJuiz[j] = { n: vs.length, completo: vs.length === (itens || []).length, corte: media(vs.map((a) => Number(a.valor))) / 100 };
  }
  const mediasItens = Object.values(porItem).filter((x) => x.n > 0).map((x) => x.media / 100);
  const completos = Object.values(cortesJuiz).filter((c) => c.completo).map((c) => c.corte);
  return {
    rodada,
    itens: porItem,
    juizes: cortesJuiz,
    n_juizes: juizes.length,
    n_juizes_completos: completos.length,
    itens_avaliados: mediasItens.length,
    corte: mediasItens.length ? media(mediasItens) : null,
    corte_ep: completos.length >= 2 ? dp(completos) / Math.sqrt(completos.length) : null,
    corte_bruto: mediasItens.length ? mediasItens.reduce((a, b) => a + b, 0) : null
  };
}

/* p observado: primeira resposta de cada pessoa em cada item, sem modo tutor */
export function pObservado(respostas, itens) {
  const set = new Set(itens || []);
  const ord = (respostas || []).filter((r) => set.has(r.questao_id) && r.modo !== "tutor")
    .map((r, i) => ({ r, i })).sort((a, b) => String(a.r.respondida_em || "").localeCompare(String(b.r.respondida_em || "")) || a.i - b.i);
  const vistos = new Set();
  const out = {};
  for (const id of set) out[id] = { n: 0, acertos: 0, p: null };
  for (const { r } of ord) {
    const k = r.user_id + "|" + r.questao_id;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const o = out[r.questao_id];
    o.n++; if (r.correta) o.acertos++;
  }
  for (const o of Object.values(out)) o.p = o.n ? o.acertos / o.n : null;
  return out;
}

/* Escores (% de acerto) de cada pessoa no formulário do painel, pela primeira resposta
   de cada item e sem modo tutor.
   Com porId (Map id -> item com b_angoff ou b_calibrado): escore esperado no
   formulário do painel, 100 x média de expit(theta - b_i) nos itens do painel, com o
   theta EAP de todas as respostas da pessoa nos itens de porId (o mesmo Step); entra
   quem respondeu pelo menos minItens itens no total. Assim os escores ficam na mesma
   escala para todos, mesmo com subconjuntos diferentes.
   Sem porId (compatibilidade): porcentagem bruta nos itens do painel que a pessoa
   respondeu, para quem respondeu pelo menos minItens deles. */
export function distribuicaoEscores(respostas, itens, { minItens = 10, porId = null } = {}) {
  const set = new Set(itens || []);
  const usar = porId ? (id) => porId.has(id) : (id) => set.has(id);
  const vistos = new Set();
  const por = new Map();
  const ord = (respostas || []).filter((r) => usar(r.questao_id) && r.modo !== "tutor").map((r, i) => ({ r, i }))
    .sort((a, b) => String(a.r.respondida_em || "").localeCompare(String(b.r.respondida_em || "")) || a.i - b.i);
  for (const { r } of ord) {
    const k = r.user_id + "|" + r.questao_id;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const o = por.get(r.user_id) || { n: 0, a: 0, rs: [] };
    o.n++; if (r.correta) o.a++;
    o.rs.push({ id: r.questao_id, x: r.correta ? 1 : 0 });
    por.set(r.user_id, o);
  }
  if (!porId) return [...por.values()].filter((o) => o.n >= minItens).map((o) => (100 * o.a) / o.n).sort((a, b) => a - b);
  const bDe = (q) => (Number.isFinite(q?.b_calibrado) ? q.b_calibrado : Number.isFinite(q?.b_angoff) ? q.b_angoff : -Math.log(q.angoff / (1 - q.angoff)));
  const bsPainel = [...set].map((id) => porId.get(id)).filter(Boolean).map(bDe);
  if (!bsPainel.length) return [];
  const sig = (z) => 1 / (1 + Math.exp(-z));
  const out = [];
  for (const o of por.values()) {
    if (o.n < minItens) continue;
    const th = thetaEap(o.rs.map((r) => ({ b: bDe(porId.get(r.id)), x: r.x })));
    out.push((100 * bsPainel.reduce((s, b) => s + sig(th - b), 0)) / bsPainel.length);
  }
  return out.sort((a, b) => a - b);
}
/* EAP simples (priori N(0; 1,5²), grade de 0,05), para o escore esperado; a mesma conta
   de psicometria.js, repetida aqui para o módulo continuar sem dependências */
function thetaEap(rs) {
  let num = 0, den = 0;
  for (let t = -6; t <= 6 + 1e-9; t += 0.05) {
    let lp = (-t * t) / (2 * 2.25);
    for (const r of rs) { const z = t - r.b; lp += r.x ? -Math.log1p(Math.exp(-z)) : -Math.log1p(Math.exp(z)); }
    const d = Math.exp(lp);
    num += t * d; den += d;
  }
  return den > 0 ? num / den : 0;
}

/* Fração (0 a 100) de examinandos com escore abaixo de c */
export function reprovacaoNoCorte(escores, c) {
  if (!escores?.length) return null;
  return (100 * escores.filter((x) => x < c - 1e-9).length) / escores.length;
}

/* Hofstee: médias das quatro respostas dos juízes e cruzamento com a curva observada.
   respostas: [{ k_min, k_max, f_min, f_max }]; escores: distribuicaoEscores(...) */
export function hofstee(respostas, escores) {
  const val = (respostas || []).filter((h) => !validarHofstee(h).length);
  if (!val.length) return { n_juizes: 0, corte: null, motivo: "Nenhum juiz respondeu as quatro perguntas do Hofstee." };
  const m = (k) => media(val.map((h) => Number(h[k])));
  const k_min = m("k_min"), k_max = m("k_max"), f_min = m("f_min"), f_max = m("f_max");
  const base = { n_juizes: val.length, k_min, k_max, f_min, f_max };
  if (!(k_min < k_max) || !(f_min < f_max)) return { ...base, corte: null, motivo: "As médias dos juízes não formam uma janela válida." };
  if (!escores?.length) return { ...base, corte: null, motivo: "Sem escores observados para traçar a curva de reprovação." };
  const reta = (c) => f_max + ((c - k_min) * (f_min - f_max)) / (k_max - k_min);
  let corte = null, cruzou = false;
  const passo = 0.1;
  let ant = reprovacaoNoCorte(escores, k_min) - reta(k_min);
  if (ant >= 0) { corte = k_min; cruzou = ant === 0; }
  else {
    for (let c = k_min + passo; c <= k_max + 1e-9; c += passo) {
      const d = reprovacaoNoCorte(escores, c) - reta(c);
      if (d >= 0) { corte = c; cruzou = true; break; }
      ant = d;
    }
    if (corte === null) corte = k_max;
  }
  corte = Math.round(corte * 10) / 10;
  return { ...base, corte, reprovacao: reprovacaoNoCorte(escores, corte), cruzou, motivo: cruzou ? "" : corte === k_min ? "A curva fica acima da reta em toda a janela; o corte vai para o mínimo aceitável." : "A curva fica abaixo da reta em toda a janela; o corte vai para o máximo aceitável." };
}

/* O corte do Angoff (proporção) passa na verificação de Hofstee? */
export function verificarHofstee(corteAngoff, h, escores) {
  if (corteAngoff === null || corteAngoff === undefined || !h || h.corte === null || h.corte === undefined) return { ok: null, motivo: h?.motivo || "Sem dados para verificar." };
  const c = 100 * corteAngoff;
  const reprov = reprovacaoNoCorte(escores, c);
  const noCorte = c >= h.k_min - 1e-9 && c <= h.k_max + 1e-9;
  const naReprov = reprov === null ? null : reprov >= h.f_min - 1e-9 && reprov <= h.f_max + 1e-9;
  return {
    ok: noCorte && naReprov !== false,
    corte_angoff_pct: c,
    reprovacao_angoff: reprov,
    dentro_janela_corte: noCorte,
    dentro_janela_reprovacao: naReprov,
    diferenca_para_hofstee: c - h.corte,
    motivo: !noCorte ? "O corte do Angoff fica fora da janela de corte aceitável dos juízes." : naReprov === false ? "A reprovação que o corte do Angoff produz fica fora da janela aceitável." : ""
  };
}

/* Regra de Hofstee que o servidor confere na publicação (a mesma em
   r2a_admin_publicar_angoff e no LocalStore): pelo menos uma resposta válida de
   Hofstee e o corte do Angoff (proporção) dentro da janela média de corte dos juízes,
   [k_min, k_max]. A janela de reprovação depende da curva de escores pelo theta, que
   só a tela do admin calcula (verificarHofstee); a tela exige a justificativa também
   quando só essa janela falha. Fora da regra, a publicação só sai com justificativa
   de pelo menos JUSTIFICATIVA_MIN caracteres, que fica gravada no painel. */
export function regraHofsteePublicacao(corte, respostasHofstee, justificativa = "") {
  const val = (respostasHofstee || []).filter((h) => !validarHofstee(h).length);
  const just = String(justificativa || "").trim();
  const justificada = just.length >= JUSTIFICATIVA_MIN;
  if (!val.length) return { ok: false, bloqueado: !justificada, justificada, motivo: "Nenhum juiz respondeu o Hofstee." + (justificada ? "" : " Registre uma justificativa de pelo menos " + JUSTIFICATIVA_MIN + " caracteres para publicar assim.") };
  const k_min = media(val.map((h) => Number(h.k_min))), k_max = media(val.map((h) => Number(h.k_max)));
  const c = corte === null || corte === undefined ? null : 100 * corte;
  const dentro = c !== null && c >= k_min - 1e-9 && c <= k_max + 1e-9;
  if (dentro) return { ok: true, bloqueado: false, justificada: false, motivo: "", k_min, k_max };
  return { ok: false, bloqueado: !justificada, justificada, k_min, k_max, motivo: "O corte do Angoff (" + (c === null ? "sem dado" : String(Math.round(c * 10) / 10).replace(".", ",") + "%") + ") fica fora da janela de corte dos juízes (" + String(Math.round(k_min * 10) / 10).replace(".", ",") + " a " + String(Math.round(k_max * 10) / 10).replace(".", ",") + "%)." + (justificada ? "" : " Registre uma justificativa de pelo menos " + JUSTIFICATIVA_MIN + " caracteres para publicar assim.") };
}

/* Valores a publicar: itens com pelo menos MIN_JUIZES estimativas na rodada final,
   desde que o erro-padrão do corte do painel na rodada final seja menor que
   CORTE_EP_MAX e que a verificação de Hofstee passe (verificacao: saída de
   verificarHofstee, com ok === true). Sem verificação, ou com ela falhando, só com
   justificativa de pelo menos JUSTIFICATIVA_MIN caracteres. Cada item leva o
   erro-padrão da média dos juízes (ep, em proporção), usado na incerteza do corte
   (PSICOMETRIA.md, seção 6.1).
   Devolve { publicar: [{ questao_id, angoff, juizes, ep }], insuficientes: [{ questao_id, juizes }],
             corte, corte_ep, bloqueado, motivo, hofstee_ok, exige_justificativa } */
export function valoresParaPublicar(painel, avaliacoes, { minJuizes = MIN_JUIZES, corteEpMax = CORTE_EP_MAX, verificacao = null, justificativa = "" } = {}) {
  const r = resumoRodada(painel.itens, avaliacoes, painel.rodada);
  const publicar = [], insuficientes = [];
  for (const id of painel.itens) {
    const x = r.itens[id];
    if (x.n >= minJuizes) publicar.push({ questao_id: id, angoff: Math.min(0.99, Math.max(0.01, Math.round((x.media / 100) * 10000) / 10000)), juizes: x.n, ep: x.n >= 2 ? Math.round((x.dp / 100 / Math.sqrt(x.n)) * 10000) / 10000 : null });
    else insuficientes.push({ questao_id: id, juizes: x.n });
  }
  const bloqueadoEp = r.corte_ep === null || !(r.corte_ep < corteEpMax);
  const hofstee_ok = verificacao?.ok === true;
  const just = String(justificativa || "").trim();
  const exige_justificativa = !hofstee_ok;
  const bloqueadoHof = !bloqueadoEp && exige_justificativa && just.length < JUSTIFICATIVA_MIN;
  const bloqueado = bloqueadoEp || bloqueadoHof;
  const motivo = r.corte_ep === null ? "Sem juízes que avaliaram todos os itens da rodada final: o erro-padrão do corte não pode ser calculado."
    : bloqueadoEp ? "Erro-padrão do corte de " + (Math.round(r.corte_ep * 1000) / 10).toString().replace(".", ",") + " pontos percentuais, acima do máximo de " + Math.round(corteEpMax * 100) + ". Mais juízes ou mais uma rodada de discussão."
    : bloqueadoHof ? (verificacao?.ok === false ? "O corte não passa na verificação de Hofstee" + (verificacao.motivo ? " (" + verificacao.motivo.replace(/\.$/, "") + ")" : "") : "Sem verificação de Hofstee" + (verificacao?.motivo ? " (" + verificacao.motivo.replace(/\.$/, "") + ")" : "")) + ". Para publicar assim, registre uma justificativa de pelo menos " + JUSTIFICATIVA_MIN + " caracteres." : "";
  return { publicar: bloqueado ? [] : publicar, insuficientes: bloqueado ? painel.itens.map((id) => ({ questao_id: id, juizes: r.itens[id].n })) : insuficientes, corte: r.corte, corte_ep: r.corte_ep, bloqueado, bloqueado_ep: bloqueadoEp, motivo, hofstee_ok, exige_justificativa };
}

/* Estimativas fictícias de juízes para a demonstração: perto do Angoff do item, com
   viés próprio de cada juiz e ruído, e convergência nas rodadas seguintes (o feedback
   aproxima as estimativas da média do painel e do p observado). Determinística. */
export function estimativasFicticias({ juizes, itens, porId, rodada, anteriores = [], pObs = {} }) {
  const out = [];
  const h = (s) => { let x = 2166136261; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x / 4294967296; };
  for (const [ji, j] of juizes.entries()) {
    const vies = (h(j + "v") - 0.5) * 16;
    for (const id of itens) {
      const q = porId.get(id);
      if (!q) continue;
      const base = 100 * (Number.isFinite(q.angoff_item) ? q.angoff_item : q.angoff);
      let v = base + vies + (h(j + id + rodada) - 0.5) * 22;
      if (rodada > 1) {
        const prev = anteriores.filter((a) => a.questao_id === id && a.rodada === rodada - 1);
        const mPainel = prev.length ? media(prev.map((a) => a.valor)) : base;
        const meu = prev.find((a) => a.juiz_id === j)?.valor ?? v;
        const alvo = pObs[id]?.p !== null && pObs[id]?.n >= 20 ? 0.75 * mPainel + 0.25 * (100 * pObs[id].p) : mPainel;
        v = meu + 0.55 * (alvo - meu) + (h(j + id + rodada + "r") - 0.5) * 6;
      }
      out.push({ juiz_id: j, questao_id: id, rodada, valor: Math.max(5, Math.min(98, Math.round(v))), sintetico: true, ordem: ji });
    }
  }
  return out;
}
