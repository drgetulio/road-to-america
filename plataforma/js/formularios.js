/* Road to America | montagem de formulários no formato oficial e relógio do
   simulado completo.

   Formato vigente (usmle.org, consulta em 28/10/2026):
   - Step 1, desde 14/05/2026: 14 blocos de 30 minutos, até 20 itens por bloco, até
     280 itens, dia de 8 horas, pausa mínima de 55 minutos e tutorial opcional de
     5 minutos (https://www.usmle.org/step-exams/step-1).
   - Step 2 CK, desde 07/05/2026: 16 blocos de 30 minutos, até 20 itens por bloco,
     até 318 itens, dia de 9 horas, mesma pausa e mesmo tutorial
     (https://www.usmle.org/step-exams/step-2-ck).
   - O tempo que sobra de um bloco ou do tutorial vai para a pausa; bloco encerrado
     não reabre; a revisão vale só dentro do bloco
     (https://www.usmle.org/bulletin-information/examination-day-testing).
   Conta do dia: Step 1, 14 x 30 + 55 + 5 = 480 minutos (8 h); Step 2 CK,
   16 x 30 + 55 + 5 = 540 minutos (9 h).

   Funções puras e determinísticas (a mesma semente e o mesmo banco dão o mesmo
   formulário). Interface em plataforma/INTERFACE.md. */
import { TAXONOMIA, DIMENSOES, CAMPO_MULTIRROTULO, assinaturaBanco, hashTexto } from "./banco.js";
import { rng } from "./simulado.js";

const MIN = 60 * 1000;
export const TEMPOS_OFICIAIS = Object.freeze({
  bloco_ms: 30 * MIN,
  pausa_minima_ms: 55 * MIN,
  tutorial_ms: 5 * MIN,
  itens_por_bloco_max: 20,
  dia_ms: Object.freeze({ step1: 8 * 60 * MIN, step2ck: 9 * 60 * MIN }),
  fontes: Object.freeze(["https://www.usmle.org/step-exams/step-1", "https://www.usmle.org/step-exams/step-2-ck", "https://www.usmle.org/bulletin-information/examination-day-testing"])
});

/* Tipos de formulário. "completo" é o dia oficial. "meio" e "prontidao" não
   existem no USMLE: são recortes da Road to America (critério interno), com pausa
   proporcional arredondada e o mesmo ritmo de 90 s por item. */
export const TIPOS_FORMULARIO = Object.freeze({
  completo: Object.freeze({ nome: "Simulado completo", step1: { blocos: 14, itens: 280 }, step2ck: { blocos: 16, itens: 318 }, pausa_ms: 55 * MIN, tutorial_ms: 5 * MIN, oficial: true }),
  meio: Object.freeze({ nome: "Meio formulário", step1: { blocos: 7, itens: 140 }, step2ck: { blocos: 8, itens: 159 }, pausa_ms: 30 * MIN, tutorial_ms: 5 * MIN, oficial: false }),
  prontidao: Object.freeze({ nome: "Avaliação de prontidão", step1: { blocos: 4, itens: 80 }, step2ck: { blocos: 4, itens: 80 }, pausa_ms: 15 * MIN, tutorial_ms: 0, oficial: false })
});

/* Formulários fixos: mesma semente para todos os alunos, para comparar resultados.
   O formulário B evita os itens do A, e o C evita os do A e do B, até onde o banco
   permitir. */
export const FORMULARIOS_FIXOS = Object.freeze({
  step1: Object.freeze([
    Object.freeze({ codigo: "S1-A", nome: "Formulário A", semente: 20261101 }),
    Object.freeze({ codigo: "S1-B", nome: "Formulário B", semente: 20261102 }),
    Object.freeze({ codigo: "S1-C", nome: "Formulário C", semente: 20261103 })
  ]),
  step2ck: Object.freeze([
    Object.freeze({ codigo: "CK-A", nome: "Formulário A", semente: 20261201 }),
    Object.freeze({ codigo: "CK-B", nome: "Formulário B", semente: 20261202 }),
    Object.freeze({ codigo: "CK-C", nome: "Formulário C", semente: 20261203 })
  ])
});

/* Tamanhos dos blocos: os primeiros ficam com um item a mais quando a divisão não
   é exata (318 em 16 blocos: 14 de 20 e 2 de 19). */
export function tamanhosBlocos(total, blocos, max = TEMPOS_OFICIAIS.itens_por_bloco_max) {
  const b = Math.max(1, blocos);
  const base = Math.floor(total / b), resto = total % b;
  const t = Array.from({ length: b }, (_, i) => base + (i < resto ? 1 : 0));
  if (t.some((x) => x > max)) throw new Error("Mais de " + max + " itens por bloco.");
  return t;
}

/* Tamanho efetivo: o oficial quando o banco basta; senão, versão reduzida com
   blocos de 20 (pelo menos um bloco) e o aviso correspondente. */
export function dimensionar(step, tipo, disponiveis) {
  const t = TIPOS_FORMULARIO[tipo];
  if (!t || !t[step]) throw new Error("Tipo de formulário ou Step inválido.");
  const of = t[step];
  if (disponiveis >= of.itens) return { blocos: of.blocos, itens: of.itens, reduzido: false, motivo: "" };
  const max = TEMPOS_OFICIAIS.itens_por_bloco_max;
  const blocos = Math.max(1, Math.min(of.blocos, Math.floor(disponiveis / max)));
  const itens = Math.min(disponiveis, blocos * max);
  return {
    blocos, itens, reduzido: true,
    motivo: "Versão reduzida: o banco disponível tem " + disponiveis + " itens deste Step e o formulário " + (t.oficial ? "oficial" : "da Road to America") + " pede " + of.itens + " em " + of.blocos + " blocos."
  };
}

/* Dimensões equilibradas dentro de cada sistema: no Step 1, disciplina principal,
   competência e dificuldade; no Step 2 CK, tarefa do médico (competência),
   disciplina clínica principal e dificuldade */
export const SECUNDARIAS = Object.freeze({ step1: Object.freeze(["disciplina", "competencia", "dificuldade"]), step2ck: Object.freeze(["competencia", "disciplina_oficial", "dificuldade"]) });

/* Alvos de composição de uma dimensão: { chave: proporção }. Dimensões de rótulo
   único com faixa oficial (sistema, competência) usam os pontos médios das faixas
   normalizados; dimensões multirrótulo (disciplinas) e sem faixa usam a composição
   do próprio banco, que o blueprint montou para caber nas faixas contando todos os
   rótulos. */
export function alvosDimensao(step, dim, pool) {
  const tax = TAXONOMIA[step]?.[dim];
  const out = {};
  if (tax && !tax.multirrotulo && tax.chaves.some((c) => c.faixa)) {
    for (const c of tax.chaves) {
      const w = c.faixa ? (c.faixa[0] + c.faixa[1]) / 2 : Number(c.alvo) || 0;
      if (w > 0) out[c.chave] = w;
    }
  } else {
    for (const q of pool) if (q[dim]) out[q[dim]] = (out[q[dim]] || 0) + 1;
  }
  const s = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const kk of Object.keys(out)) out[kk] /= s;
  return out;
}

/* Cotas por chave da dimensão principal, dentro das faixas oficiais sempre que o
   banco tiver itens suficientes. Devolve { cotas, fora: [chaves fora da faixa] }. */
export function cotasNasFaixas(step, dim, n, disponiveis) {
  const tax = TAXONOMIA[step]?.[dim];
  const chaves = Object.keys(disponiveis).filter((kk) => disponiveis[kk] > 0);
  const faixa = {}, ideal = {};
  const alvo = tax ? alvosDimensao(step, dim, []) : {};
  const somaDisp = chaves.reduce((s, kk) => s + disponiveis[kk], 0) || 1;
  for (const kk of chaves) {
    const c = tax?.chaves.find((x) => x.chave === kk);
    faixa[kk] = c?.faixa || null;
    ideal[kk] = n * (tax ? alvo[kk] || 0 : disponiveis[kk] / somaDisp);
  }
  const lo = {}, hi = {}, cotas = {};
  for (const kk of chaves) {
    const f = faixa[kk];
    const l = f ? Math.ceil((f[0] / 100) * n - 1e-9) : 0;
    const h = f ? Math.floor((f[1] / 100) * n + 1e-9) : 0;
    lo[kk] = Math.min(l, disponiveis[kk]);
    hi[kk] = Math.min(Math.max(h, lo[kk]), disponiveis[kk]);
    cotas[kk] = Math.min(hi[kk], Math.max(lo[kk], Math.round(ideal[kk])));
  }
  const ordem = chaves.slice().sort();
  const soma = () => ordem.reduce((s, kk) => s + cotas[kk], 0);
  const escolher = (pode, chave) => { let m = null; for (const kk of ordem) if (pode(kk) && (m === null || chave(kk) > chave(m))) m = kk; return m; };
  let guarda = 0;
  while (soma() < n && guarda++ < 100000) {
    let kk = escolher((x) => cotas[x] < hi[x], (x) => ideal[x] - cotas[x]);
    if (kk === null) kk = escolher((x) => cotas[x] < disponiveis[x], (x) => ideal[x] - cotas[x]);
    if (kk === null) break;
    cotas[kk]++;
  }
  while (soma() > n && guarda++ < 200000) {
    let kk = escolher((x) => cotas[x] > lo[x], (x) => cotas[x] - ideal[x]);
    if (kk === null) kk = escolher((x) => cotas[x] > 0, (x) => cotas[x] - ideal[x]);
    if (kk === null) break;
    cotas[kk]--;
  }
  const fora = ordem.filter((kk) => faixa[kk] && (cotas[kk] < Math.ceil((faixa[kk][0] / 100) * n - 1e-9) || cotas[kk] > Math.floor((faixa[kk][1] / 100) * n + 1e-9)));
  /* chaves do outline sem nenhum item no banco também ficam fora da faixa */
  for (const c of tax?.chaves || []) if (c.faixa && c.faixa[0] > 0 && !(disponiveis[c.chave] > 0)) fora.push(c.chave);
  return { cotas, fora: [...new Set(fora)].sort() };
}

/*
  Monta um formulário.
  banco: saída de montarBanco (banco.js) ou { steps: { step1: [...], step2ck: [...] } }
  opções:
    step: "step1" | "step2ck"
    tipo: "completo" | "meio" | "prontidao"
    modo: "fixo" (mesma semente para todos) | "personalizado" (prioriza não vistos)
    semente: número (no modo fixo, use FORMULARIOS_FIXOS ou montarFormularioFixo)
    vistas: ids já respondidos pelo aluno (personalizado: ficam por último)
    evitar: ids a evitar quando houver alternativa (formulários fixos B e C)
    codigo, nome: identificação do formulário
  Montagem:
    1. cotas da dimensão principal (sistema) dentro das faixas oficiais;
    2. escolha gulosa dentro de cada sistema, equilibrando as dimensões secundárias
       (disciplina e competência no Step 1; área e tarefa no Step 2 CK) e a
       dificuldade, com desempate pela semente;
    3. distribuição em blocos em serpentina pela ordem do Angoff, para que todos os
       blocos tenham média de Angoff parecida; trocas entre itens de Angoff próximo
       espalham os sistemas entre os blocos; dentro do bloco, a ordem evita dois
       itens seguidos do mesmo sistema.
*/
export function montarFormulario(banco, { step, tipo = "completo", modo = "fixo", semente = 1, vistas = [], evitar = [], codigo = "", nome = "" } = {}) {
  const pool = (banco?.steps?.[step] || []).filter((q) => q && q.id && (q.status === undefined || q.status === "ativo"));
  const dim = dimensionar(step, tipo, pool.length);
  const random = rng(semente);
  const chaveAleatoria = new Map(pool.map((q) => [q.id, random()]));
  const vistasSet = new Set(vistas || []);
  const evitarSet = new Set(evitar || []);
  const principal = DIMENSOES[step][0];
  const secundarias = SECUNDARIAS[step];
  const alvos = {};
  for (const d of secundarias) alvos[d] = alvosDimensao(step, d, pool);
  const N = dim.itens;
  /* teto das dimensões secundárias com faixa exigida (tarefa, competência) */
  const teto = {};
  for (const d of secundarias) {
    const tax = TAXONOMIA[step]?.[d];
    if (!tax?.exigir_faixa) continue;
    teto[d] = {};
    for (const c of tax.chaves) if (c.faixa) teto[d][c.chave] = Math.floor((c.faixa[1] / 100) * N + 1e-9);
  }

  const grupos = {};
  for (const q of pool) (grupos[q[principal] || "_sem"] ||= []).push(q);
  const disponiveis = Object.fromEntries(Object.entries(grupos).map(([kk, v]) => [kk, v.length]));
  const { cotas, fora } = cotasNasFaixas(step, principal, N, disponiveis);

  /* dimensões multirrótulo com faixa oficial (disciplinas): conta todos os rótulos
     do item e puxa cada rótulo para o ponto médio da faixa, sem passar do teto */
  const multi = [];
  for (const [d, campo] of Object.entries(CAMPO_MULTIRROTULO[step] || {})) {
    const tax = TAXONOMIA[step]?.[d];
    const faixas = Object.fromEntries((tax?.chaves || []).filter((c) => c.faixa).map((c) => [c.chave, c.faixa]));
    if (Object.keys(faixas).length) multi.push({ d, campo, faixas, cont: {} });
  }
  const rotulos = (q, m) => [...new Set([q[m.d], ...(q[m.campo] || [])].filter(Boolean))];
  const contagem = Object.fromEntries(secundarias.map((d) => [d, {}]));
  const restantes = Object.fromEntries(Object.entries(grupos).map(([kk, v]) => [kk, v.slice()]));
  const pegos = Object.fromEntries(Object.keys(cotas).map((kk) => [kk, 0]));
  const escolhidos = [];
  const penalidade = (q) => {
    let p = 0;
    for (const d of secundarias) {
      const v = q[d] || "_sem";
      const t = (alvos[d][v] || 0) * N;
      p += ((contagem[d][v] || 0) + 1) / Math.max(t, 0.5);
      if (teto[d] && v in teto[d] && (contagem[d][v] || 0) + 1 > teto[d][v]) p += 1e7;
    }
    /* multirrótulo: variação do desvio quadrático em relação ao alvo proporcional ao
       número de itens já escolhidos (rótulo abaixo do alvo dá bônus; acima, custo) */
    for (const m of multi) {
      for (const r of rotulos(q, m)) {
        const f = m.faixas[r];
        if (!f) continue;
        const c = m.cont[r] || 0;
        const alvo = ((f[0] + f[1]) / 200) * (escolhidos.length + 1);
        p += 0.5 * (2 * (c - alvo) + 1) / Math.max(alvo, 1);
        if (c + 1 > Math.floor((f[1] / 100) * N + 1e-9)) p += 1e5;
      }
    }
    if (modo === "personalizado" && vistasSet.has(q.id)) p += 1e6;
    if (evitarSet.has(q.id)) p += 1e4;
    return p;
  };
  const totalCotas = Object.values(cotas).reduce((a, b) => a + b, 0);
  for (let passo = 0; passo < totalCotas; passo++) {
    let estrato = null, menor = Infinity;
    for (const kk of Object.keys(cotas).sort()) {
      if (pegos[kk] >= cotas[kk] || !restantes[kk]?.length) continue;
      const f = pegos[kk] / cotas[kk];
      if (f < menor) { menor = f; estrato = kk; }
    }
    if (estrato === null) break;
    const cand = restantes[estrato];
    let melhor = 0, pm = Infinity;
    for (let i = 0; i < cand.length; i++) {
      const p = penalidade(cand[i]) + chaveAleatoria.get(cand[i].id) * 1e-6;
      if (p < pm) { pm = p; melhor = i; }
    }
    const q = cand.splice(melhor, 1)[0];
    escolhidos.push(q);
    pegos[estrato]++;
    for (const d of secundarias) { const v = q[d] || "_sem"; contagem[d][v] = (contagem[d][v] || 0) + 1; }
    for (const m of multi) for (const r of rotulos(q, m)) m.cont[r] = (m.cont[r] || 0) + 1;
  }
  /* completa com o que sobrou se as cotas não fecharam (banco desequilibrado) */
  if (escolhidos.length < N) {
    const usados = new Set(escolhidos.map((q) => q.id));
    const resto = pool.filter((q) => !usados.has(q.id)).sort((a, b) => penalidade(a) - penalidade(b) || chaveAleatoria.get(a.id) - chaveAleatoria.get(b.id));
    escolhidos.push(...resto.slice(0, N - escolhidos.length));
  }

  const reparo = repararFaixas(escolhidos, pool, { step, principal, N, prioridade: (q) => (modo === "personalizado" && vistasSet.has(q.id) ? 2 : 0) + (evitarSet.has(q.id) ? 1 : 0) + chaveAleatoria.get(q.id) * 1e-3 });
  const blocos = distribuirEmBlocos(escolhidos, tamanhosBlocos(escolhidos.length, dim.blocos), { random, principal, chaveAleatoria });
  const t = TIPOS_FORMULARIO[tipo];
  const assinatura = assinaturaBanco(pool);
  const cod = codigo || (step === "step1" ? "S1" : "CK") + "-" + (modo === "fixo" ? "F" : "P") + semente;
  const form = {
    id: [step, tipo, modo, cod, assinatura].join(":"),
    codigo: cod,
    nome: nome || t.nome,
    step, tipo, modo, semente,
    reduzido: dim.reduzido,
    motivo_reducao: dim.motivo,
    oficial: { blocos: t[step].blocos, itens: t[step].itens, formato_oficial: !!t.oficial },
    blocos: blocos.map((b) => b.map((q) => q.id)),
    total: escolhidos.length,
    tempo: {
      bloco_ms: TEMPOS_OFICIAIS.bloco_ms,
      pausa_ms: t.pausa_ms,
      tutorial_ms: t.tutorial_ms,
      dia_ms: blocos.length * TEMPOS_OFICIAIS.bloco_ms + t.pausa_ms + t.tutorial_ms
    },
    assinatura_banco: assinatura,
    fora_da_faixa: [...new Set([...fora, ...reparo.pendentes])].sort(),
    trocas_de_reparo: reparo.trocas
  };
  form.hash = hashTexto(form.blocos.map((b) => b.join(",")).join("|"));
  return form;
}

/* Reparo das faixas depois da escolha: troca um item escolhido por outro do mesmo
   sistema (as cotas de sistema não mudam) até cada chave caber na faixa, sem tirar
   outra chave da faixa nem piorar uma que já esteja fora. Vale para as dimensões de
   rótulo único com faixa exigida (competência) e para as disciplinas contadas com
   todos os rótulos (multirrótulo). Altera "escolhidos" no lugar.
   Devolve { trocas, pendentes: [chaves que continuaram fora] }. */
function repararFaixas(escolhidos, pool, { step, principal, N, prioridade }) {
  const limites = (d) => Object.fromEntries(TAXONOMIA[step][d].chaves.filter((c) => c.faixa).map((c) => [c.chave, [Math.ceil((c.faixa[0] / 100) * N - 1e-9), Math.floor((c.faixa[1] / 100) * N + 1e-9)]]));
  const restricoes = [];
  for (const d of SECUNDARIAS[step]) if (TAXONOMIA[step]?.[d]?.exigir_faixa) restricoes.push({ d, rot: (q) => [q[d]], lim: limites(d), cont: {} });
  for (const [d, campo] of Object.entries(CAMPO_MULTIRROTULO[step] || {})) restricoes.push({ d, rot: (q) => [...new Set([q[d], ...(q[campo] || [])].filter(Boolean))], lim: limites(d), cont: {} });
  for (const r of restricoes) for (const q of escolhidos) for (const k of r.rot(q)) r.cont[k] = (r.cont[k] || 0) + 1;
  const fora = (r, k, n) => { const l = r.lim[k]; return l ? (n < l[0] ? l[0] - n : n > l[1] ? n - l[1] : 0) : 0; };
  const aceita = (sai, entra) => restricoes.every((r) => {
    const delta = {};
    for (const k of r.rot(sai)) delta[k] = (delta[k] || 0) - 1;
    for (const k of r.rot(entra)) delta[k] = (delta[k] || 0) + 1;
    return Object.entries(delta).every(([k, dd]) => { const c = r.cont[k] || 0; const antes = fora(r, k, c), depois = fora(r, k, c + dd); return depois === 0 || depois < antes; });
  });
  const usados = new Set(escolhidos.map((q) => q.id));
  const desistidos = new Set();
  let trocas = 0;
  for (let it = 0; it < 1000; it++) {
    let alvo = null;
    for (const r of restricoes) {
      for (const [k, [lo, hi]] of Object.entries(r.lim)) {
        if (desistidos.has(r.d + ":" + k)) continue;
        const c = r.cont[k] || 0;
        if (c < lo || c > hi) { alvo = { r, k, falta: c < lo }; break; }
      }
      if (alvo) break;
    }
    if (!alvo) break;
    const { r, k, falta } = alvo;
    const tem = (q) => r.rot(q).includes(k);
    const candEntra = pool.filter((q) => !usados.has(q.id) && (falta ? tem(q) : !tem(q))).sort((a, b) => prioridade(a) - prioridade(b));
    let feito = false;
    for (const entra of candEntra) {
      const i = escolhidos.findIndex((sai) => sai[principal] === entra[principal] && (falta ? !tem(sai) : tem(sai)) && aceita(sai, entra));
      if (i < 0) continue;
      const sai = escolhidos[i];
      for (const rr of restricoes) { for (const kk of rr.rot(sai)) rr.cont[kk]--; for (const kk of rr.rot(entra)) rr.cont[kk] = (rr.cont[kk] || 0) + 1; }
      usados.delete(sai.id); usados.add(entra.id);
      escolhidos[i] = entra;
      trocas++; feito = true;
      break;
    }
    if (!feito) desistidos.add(r.d + ":" + k);
  }
  const pendentes = [];
  for (const r of restricoes) for (const k of Object.keys(r.lim)) if (fora(r, k, r.cont[k] || 0)) pendentes.push(k);
  return { trocas, pendentes };
}

/* Formulário fixo pelo código (S1-A, S1-B, CK-A...): B evita A, C evita A e B */
export function montarFormularioFixo(banco, step, codigo, tipo = "completo") {
  const lista = FORMULARIOS_FIXOS[step] || [];
  const i = lista.findIndex((f) => f.codigo === codigo);
  if (i < 0) throw new Error("Formulário fixo desconhecido: " + codigo);
  const evitar = [];
  for (let k = 0; k < i; k++) evitar.push(...montarFormulario(banco, { step, tipo, modo: "fixo", semente: lista[k].semente, codigo: lista[k].codigo, evitar: [...evitar] }).blocos.flat());
  return montarFormulario(banco, { step, tipo, modo: "fixo", semente: lista[i].semente, codigo, nome: lista[i].nome + " (" + TIPOS_FORMULARIO[tipo].nome.toLowerCase() + ")", evitar });
}

/* Formulário personalizado do aluno: prioriza itens não vistos */
export function montarFormularioPersonalizado(banco, { step, tipo = "completo", vistas = [], semente }) {
  const s = Number.isFinite(semente) ? semente : Number.parseInt(hashTexto(step + tipo + vistas.length + (vistas[vistas.length - 1] || "")), 16);
  return montarFormulario(banco, { step, tipo, modo: "personalizado", semente: s, vistas });
}

function distribuirEmBlocos(itens, tamanhos, { random, principal, chaveAleatoria }) {
  const B = tamanhos.length;
  const ord = itens.slice().sort((a, b) => b.angoff - a.angoff || chaveAleatoria.get(a.id) - chaveAleatoria.get(b.id));
  const blocos = Array.from({ length: B }, () => []);
  let dir = 1, bIdx = 0;
  for (const q of ord) {
    let tentativas = 0;
    while (blocos[bIdx].length >= tamanhos[bIdx] && tentativas++ < 2 * B) { bIdx += dir; if (bIdx >= B) { bIdx = B - 1; dir = -1; } else if (bIdx < 0) { bIdx = 0; dir = 1; } }
    blocos[bIdx].push(q);
    bIdx += dir;
    if (bIdx >= B) { bIdx = B - 1; dir = -1; } else if (bIdx < 0) { bIdx = 0; dir = 1; }
  }
  /* trocas entre blocos para espalhar os sistemas, só entre itens de Angoff próximo */
  if (B > 1) {
    const cont = blocos.map((b) => { const m = new Map(); for (const q of b) m.set(q[principal], (m.get(q[principal]) || 0) + 1); return m; });
    const tentativas = Math.min(20000, itens.length * 40);
    for (let t = 0; t < tentativas; t++) {
      const b1 = Math.floor(random() * B), b2 = Math.floor(random() * B);
      if (b1 === b2 || !blocos[b1].length || !blocos[b2].length) continue;
      const i1 = Math.floor(random() * blocos[b1].length), i2 = Math.floor(random() * blocos[b2].length);
      const q1 = blocos[b1][i1], q2 = blocos[b2][i2];
      const s1 = q1[principal], s2 = q2[principal];
      if (s1 === s2 || Math.abs(q1.angoff - q2.angoff) > 0.03) continue;
      const c = (m, s) => m.get(s) || 0;
      const antes = c(cont[b1], s1) ** 2 + c(cont[b1], s2) ** 2 + c(cont[b2], s1) ** 2 + c(cont[b2], s2) ** 2;
      const depois = (c(cont[b1], s1) - 1) ** 2 + (c(cont[b1], s2) + 1) ** 2 + (c(cont[b2], s1) + 1) ** 2 + (c(cont[b2], s2) - 1) ** 2;
      if (depois < antes) {
        blocos[b1][i1] = q2; blocos[b2][i2] = q1;
        cont[b1].set(s1, c(cont[b1], s1) - 1); cont[b1].set(s2, c(cont[b1], s2) + 1);
        cont[b2].set(s1, c(cont[b2], s1) + 1); cont[b2].set(s2, c(cont[b2], s2) - 1);
      }
    }
  }
  /* ordem dentro do bloco: embaralhada pela semente, evitando o mesmo sistema em seguida */
  return blocos.map((b) => {
    const a = b.slice().sort((x, y) => chaveAleatoria.get(x.id) - chaveAleatoria.get(y.id));
    for (let k = 1; k < a.length; k++) {
      if (a[k][principal] !== a[k - 1][principal]) continue;
      const j = a.findIndex((q, idx) => idx > k && q[principal] !== a[k - 1][principal]);
      if (j > 0) [a[k], a[j]] = [a[j], a[k]];
    }
    return a;
  });
}

/* Conferência de um formulário contra as faixas oficiais e o equilíbrio entre blocos.
   porId: Map id -> item (banco.porId). Devolve:
   { ok, total, blocos: [{ indice, n, angoff_medio, por_dificuldade, sistemas }],
     equilibrio: { angoff_medio, dp_entre_blocos, amplitude },
     dimensoes: { sistema: [{ chave, n, pct, faixa, dentro, exigida }], ... },
     problemas: [texto],   // faixas exigidas (sistema, competência), tamanho, repetição
     avisos: [texto] }     // disciplinas contadas com todos os rótulos fora da faixa */
export function verificarFormulario(form, porId) {
  const get = porId instanceof Map ? (id) => porId.get(id) : (id) => porId?.[id];
  const problemas = [];
  const avisos = [];
  const ids = form.blocos.flat();
  if (new Set(ids).size !== ids.length) problemas.push("Há itens repetidos no formulário.");
  const itens = ids.map(get);
  if (itens.some((q) => !q)) problemas.push("Há itens que não estão no banco.");
  const total = ids.length;
  if (form.blocos.some((b) => b.length > TEMPOS_OFICIAIS.itens_por_bloco_max)) problemas.push("Bloco com mais de 20 itens.");
  if (!form.reduzido && total !== form.oficial.itens) problemas.push("Total diferente do formato: " + total + " de " + form.oficial.itens + ".");
  if (!form.reduzido && form.blocos.length !== form.oficial.blocos) problemas.push("Número de blocos diferente do formato.");
  const blocos = form.blocos.map((b, i) => {
    const qs = b.map(get).filter(Boolean);
    const pd = { facil: 0, media: 0, dificil: 0 };
    for (const q of qs) pd[q.dificuldade] = (pd[q.dificuldade] || 0) + 1;
    return { indice: i, n: b.length, angoff_medio: qs.length ? qs.reduce((s, q) => s + q.angoff, 0) / qs.length : null, por_dificuldade: pd, sistemas: new Set(qs.map((q) => q.sistema)).size };
  });
  const medias = blocos.map((b) => b.angoff_medio).filter((x) => x !== null);
  const mg = itens.filter(Boolean).reduce((s, q) => s + q.angoff, 0) / Math.max(1, itens.filter(Boolean).length);
  const dpb = medias.length > 1 ? Math.sqrt(medias.reduce((s, m) => s + (m - mg) ** 2, 0) / (medias.length - 1)) : 0;
  const dimensoes = {};
  for (const d of DIMENSOES[form.step]) {
    const tax = TAXONOMIA[form.step]?.[d];
    const cont = {};
    const contMulti = {};
    const campoMulti = CAMPO_MULTIRROTULO[form.step]?.[d];
    for (const q of itens) {
      if (!q) continue;
      cont[q[d] || "_sem"] = (cont[q[d] || "_sem"] || 0) + 1;
      if (campoMulti) for (const x of new Set([q[d], ...(q[campoMulti] || [])].filter(Boolean))) contMulti[x] = (contMulti[x] || 0) + 1;
    }
    const chaves = new Set([...Object.keys(cont), ...(tax ? tax.chaves.map((c) => c.chave) : [])]);
    dimensoes[d] = [...chaves].sort().map((kk) => {
      const c = tax?.chaves.find((x) => x.chave === kk);
      const n = cont[kk] || 0;
      const pctv = total ? n / total : 0;
      const faixa = c?.faixa || null;
      const dentro = faixa ? pctv >= faixa[0] / 100 - 1e-9 && pctv <= faixa[1] / 100 + 1e-9 : null;
      const out = { chave: kk, n, pct: pctv, faixa, dentro, exigida: !!(tax?.exigir_faixa && faixa) };
      /* disciplinas: conta também os rótulos secundários, como o outline (a soma passa de 100%) */
      if (campoMulti) {
        out.n_multirrotulo = contMulti[kk] || 0;
        out.pct_multirrotulo = total ? out.n_multirrotulo / total : 0;
        out.dentro_multirrotulo = faixa ? out.pct_multirrotulo >= faixa[0] / 100 - 1e-9 && out.pct_multirrotulo <= faixa[1] / 100 + 1e-9 : null;
      }
      return out;
    });
    for (const x of dimensoes[d]) if (x.exigida && x.dentro === false && !form.reduzido) problemas.push(d + " " + x.chave + " fora da faixa oficial (" + (x.pct * 100).toFixed(1) + "% para " + x.faixa[0] + " a " + x.faixa[1] + "%).");
    for (const x of dimensoes[d]) if (x.dentro_multirrotulo === false && !form.reduzido) avisos.push(d + " " + x.chave + " (todos os rótulos) fora da faixa oficial (" + (x.pct_multirrotulo * 100).toFixed(1) + "% para " + x.faixa[0] + " a " + x.faixa[1] + "%).");
  }
  return { ok: problemas.length === 0, total, blocos, equilibrio: { angoff_medio: mg, dp_entre_blocos: dpb, amplitude: medias.length ? Math.max(...medias) - Math.min(...medias) : 0 }, dimensoes, problemas, avisos };
}

/* =====================================================================
   Relógio do simulado completo (estado serializável, retomada após recarregar)
   Fases: "inicio" -> ("tutorial") -> "bloco" -> "intervalo" -> "bloco" ... -> "concluido".
   Regras:
   - o tempo do tutorial (até 5 min) não usado vai para a pausa; pular o tutorial
     dá os 5 minutos inteiros à pausa;
   - o tempo que sobra de um bloco encerrado antes de 30 min vai para a pausa;
   - todo o tempo fora de blocos e do tutorial conta como pausa (assim o dia fecha
     em 8 h ou 9 h);
   - pausa além do saldo vira débito, descontado do bloco seguinte (e dos próximos,
     se preciso), porque o dia não se estende;
   - bloco encerrado não reabre; resposta só no bloco atual.
   agora: Date, número (ms) ou ISO. Todas as funções devolvem um estado novo.
   ===================================================================== */
const ms = (agora) => (agora instanceof Date ? agora.getTime() : typeof agora === "number" ? agora : Date.parse(agora));
const iso = (t) => new Date(t).toISOString();
const clone = (s) => JSON.parse(JSON.stringify(s));

export function novaSessao(form) {
  return {
    versao: 1,
    formulario_id: form.id,
    step: form.step,
    tipo: form.tipo,
    fase: "inicio",
    bloco_atual: 0,
    blocos_encerrados: 0,
    total_blocos: form.blocos.length,
    relogio: {
      bloco_ms: form.tempo.bloco_ms,
      tutorial_ms: form.tempo.tutorial_ms,
      pausa_inicial_ms: form.tempo.pausa_ms,
      fase_desde: null,
      bloco_inicio: null,
      bloco_limite_ms: null,
      tutorial_usado_ms: 0,
      pausa_saldo_ms: form.tempo.pausa_ms,
      pausa_usada_ms: 0,
      debito_ms: 0,
      sobra_blocos_ms: 0
    },
    respostas: form.blocos.map((b) => b.map(() => ({ resposta: null, marcada: false, tempo_ms: 0 }))),
    encerramentos: [],
    inicio: null,
    fim: null
  };
}

function fecharIntervalo(s, t) {
  const r = s.relogio;
  if (s.fase !== "intervalo" || r.fase_desde === null) return;
  const usado = Math.max(0, t - Date.parse(r.fase_desde));
  r.pausa_usada_ms += usado;
  r.pausa_saldo_ms -= usado;
  if (r.pausa_saldo_ms < 0) { r.debito_ms += -r.pausa_saldo_ms; r.pausa_saldo_ms = 0; }
}
function fecharTutorial(s, t) {
  const r = s.relogio;
  const usado = s.fase === "tutorial" ? Math.max(0, t - Date.parse(r.fase_desde)) : 0;
  r.tutorial_usado_ms = Math.min(usado, r.tutorial_ms);
  r.pausa_saldo_ms += r.tutorial_ms - r.tutorial_usado_ms;
  const excesso = usado - r.tutorial_usado_ms;
  if (excesso > 0) { r.pausa_usada_ms += excesso; r.pausa_saldo_ms -= excesso; if (r.pausa_saldo_ms < 0) { r.debito_ms += -r.pausa_saldo_ms; r.pausa_saldo_ms = 0; } }
}

export function iniciarTutorial(sessao, agora) {
  const s = clone(sessao), t = ms(agora);
  if (s.fase !== "inicio") throw new Error("O tutorial só pode ser aberto antes do primeiro bloco.");
  if (!(s.relogio.tutorial_ms > 0)) throw new Error("Este formulário não tem tutorial.");
  s.fase = "tutorial"; s.relogio.fase_desde = iso(t); s.inicio = iso(t);
  return s;
}

export function iniciarBloco(sessao, agora) {
  let s = clone(sessao); const t = ms(agora);
  if (s.fase === "bloco") throw new Error("Já há um bloco em andamento.");
  if (s.fase === "concluido") throw new Error("O simulado já terminou.");
  if (s.fase === "inicio" || s.fase === "tutorial") { if (s.fase === "inicio") s.inicio = iso(t); fecharTutorial(s, t); }
  else fecharIntervalo(s, t);
  const r = s.relogio;
  const desconto = Math.min(r.debito_ms, r.bloco_ms);
  r.debito_ms -= desconto;
  r.bloco_limite_ms = r.bloco_ms - desconto;
  r.bloco_inicio = iso(t);
  r.fase_desde = iso(t);
  s.fase = "bloco";
  return s;
}

export function encerrarBloco(sessao, agora, motivo = "participante") {
  const s = clone(sessao); const t = ms(agora);
  if (s.fase !== "bloco") throw new Error("Não há bloco em andamento.");
  const r = s.relogio;
  const decorrido = Math.max(0, t - Date.parse(r.bloco_inicio));
  const usado = Math.min(decorrido, r.bloco_limite_ms);
  const sobra = r.bloco_limite_ms - usado;
  r.pausa_saldo_ms += sobra;
  r.sobra_blocos_ms += sobra;
  const fimBloco = Date.parse(r.bloco_inicio) + usado;
  s.encerramentos.push({ bloco: s.bloco_atual, motivo: motivo === "tempo" ? "tempo" : "participante", usado_ms: usado, sobra_ms: sobra, limite_ms: r.bloco_limite_ms, fim: iso(fimBloco) });
  s.blocos_encerrados++;
  s.bloco_atual++;
  r.bloco_inicio = null; r.bloco_limite_ms = null;
  if (s.bloco_atual >= s.total_blocos) { s.fase = "concluido"; s.fim = iso(fimBloco); r.fase_desde = null; }
  else { s.fase = "intervalo"; r.fase_desde = iso(fimBloco); }
  return s;
}

/* Fecha sozinho o bloco cujo tempo acabou (por exemplo, depois de recarregar a página) */
export function atualizarSessao(sessao, agora) {
  const t = ms(agora);
  if (sessao.fase !== "bloco") return sessao;
  const r = sessao.relogio;
  if (t - Date.parse(r.bloco_inicio) >= r.bloco_limite_ms) return encerrarBloco(sessao, Date.parse(r.bloco_inicio) + r.bloco_limite_ms, "tempo");
  return sessao;
}

/* Grava resposta, marcação ou tempo de uma questão do bloco atual.
   mudanca: { resposta?: "A".."J" | null, marcada?: boolean, tempo_ms_add?: número } */
export function responder(sessao, posicao, mudanca, agora) {
  const atual = atualizarSessao(sessao, agora);
  if (atual.fase !== "bloco") throw new Error(atual !== sessao && sessao.fase === "bloco" ? "O tempo do bloco acabou." : "Não há bloco em andamento.");
  const s = clone(atual);
  const linha = s.respostas[s.bloco_atual]?.[posicao];
  if (!linha) throw new Error("Questão fora do bloco atual.");
  if ("resposta" in mudanca) {
    const v = mudanca.resposta;
    if (v !== null && !/^[A-J]$/.test(String(v))) throw new Error("Alternativa inválida.");
    linha.resposta = v === null ? null : String(v);
  }
  if ("marcada" in mudanca) linha.marcada = !!mudanca.marcada;
  if (mudanca.tempo_ms_add) linha.tempo_ms = Math.max(0, Math.round(linha.tempo_ms + Number(mudanca.tempo_ms_add)));
  return s;
}

/* Leitura do relógio para a tela */
export function estadoRelogio(sessao, agora) {
  const t = ms(agora); const r = sessao.relogio;
  let restante_bloco_ms = null, saldo = r.pausa_saldo_ms, excedente = 0, tutorial_restante_ms = null;
  if (sessao.fase === "bloco") restante_bloco_ms = Math.max(0, r.bloco_limite_ms - (t - Date.parse(r.bloco_inicio)));
  if (sessao.fase === "intervalo" && r.fase_desde) {
    const usado = Math.max(0, t - Date.parse(r.fase_desde));
    saldo = r.pausa_saldo_ms - usado;
    if (saldo < 0) { excedente = -saldo; saldo = 0; }
  }
  if (sessao.fase === "tutorial") tutorial_restante_ms = Math.max(0, r.tutorial_ms - (t - Date.parse(r.fase_desde)));
  return {
    fase: sessao.fase,
    bloco_atual: sessao.bloco_atual,
    total_blocos: sessao.total_blocos,
    restante_bloco_ms,
    tutorial_restante_ms,
    pausa_saldo_ms: saldo,
    pausa_excedente_ms: excedente + r.debito_ms,
    proximo_bloco_ms: Math.max(0, r.bloco_ms - Math.min(r.bloco_ms, r.debito_ms + excedente)),
    pausa_usada_ms: r.pausa_usada_ms
  };
}

/* Correção do simulado completo. Devolve o resultado e as linhas de respostas_item
   (origem "simulado", modo "cronometrado") prontas para store.saveRespostas(). */
export function corrigirSessao(form, sessao, porId, { sessaoId = null } = {}) {
  const get = porId instanceof Map ? (id) => porId.get(id) : (id) => porId?.[id];
  const linhas = [];
  const porBloco = [];
  const dimsConta = DIMENSOES[form.step];
  const por = Object.fromEntries(dimsConta.map((d) => [d, {}]));
  let acertos = 0, total = 0, emBranco = 0, tempo = 0;
  const fimBloco = (i) => sessao.encerramentos.find((e) => e.bloco === i)?.fim || sessao.fim || null;
  form.blocos.forEach((ids, bi) => {
    let ab = 0;
    ids.forEach((id, pi) => {
      const q = get(id);
      const r = sessao.respostas?.[bi]?.[pi] || { resposta: null, marcada: false, tempo_ms: 0 };
      const ok = !!q && r.resposta !== null && r.resposta === q.correta;
      total++; if (ok) { acertos++; ab++; } if (r.resposta === null) emBranco++; tempo += r.tempo_ms || 0;
      for (const d of dimsConta) { const kk = q?.[d] || "_sem"; const o = (por[d][kk] ||= { total: 0, acertos: 0 }); o.total++; if (ok) o.acertos++; }
      linhas.push({ questao_id: id, step: form.step, resposta: r.resposta, correta: ok, tempo_ms: Math.round(r.tempo_ms || 0), marcada: !!r.marcada, modo: "cronometrado", origem: "simulado", sessao_id: sessaoId, bloco: bi, posicao: pi, versao_item: q?.versao ?? null, respondida_em: fimBloco(bi) });
    });
    porBloco.push({ bloco: bi, total: ids.length, acertos: ab });
  });
  return {
    resultado: { formulario_id: form.id, step: form.step, tipo: form.tipo, total, acertos, percentual: total ? acertos / total : 0, em_branco: emBranco, tempo_medio_ms: total ? tempo / total : 0, por_bloco: porBloco, por, encerramentos: sessao.encerramentos, reduzido: !!form.reduzido },
    respostas: linhas
  };
}
