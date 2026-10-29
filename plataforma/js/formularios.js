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
import { TAXONOMIA, DIMENSOES, CAMPO_MULTIRROTULO, assinaturaBanco, hashTexto, normalizarFormulariosGravados } from "./banco.js";
export { normalizarFormulariosGravados };
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
   A e B formam uma partição do banco do Step: nenhum item do A volta no B. Quando o
   banco tem itens para dois formulários inteiros (Step 1: 560 itens, 2 x 280), os dois
   saem completos; quando não tem (Step 2 CK: 520 itens, 318 + 202), o B fica com o
   restante e sai sinalizado como parcial (parcial: true), em blocos de até 20 itens.
   A montagem é conjunta (montarParticao): os dois formulários ficam dentro das faixas
   oficiais e com Angoff médio e dificuldade parecidos. */
/* reservado: o formulário completo fica fora do sorteio do banco do aluno até ele
   concluir (ou abandonar depois de começar) aquele formulário, como o NBME faz com as
   autoavaliações (itensReservados). Um formulário completo por Step: S1-B no Step 1 e
   CK-A no Step 2 CK, o único completo. Enquanto o banco tiver só os itens dos dois
   formulários, a reserva tira esses itens da prática até o aluno fazer o simulado. */
export const FORMULARIOS_FIXOS = Object.freeze({
  step1: Object.freeze([
    Object.freeze({ codigo: "S1-A", nome: "Formulário A", semente: 20261101, reservado: false }),
    Object.freeze({ codigo: "S1-B", nome: "Formulário B", semente: 20261102, reservado: true })
  ]),
  step2ck: Object.freeze([
    Object.freeze({ codigo: "CK-A", nome: "Formulário A", semente: 20261201, reservado: true }),
    Object.freeze({ codigo: "CK-B", nome: "Formulário B", semente: 20261202, reservado: false })
  ])
});

/* Fração de itens já vistos acima da qual o simulado é tratado como reaplicação: o
   modal pede confirmação e o relatório sai como "reaplicação, não comparável", fora
   da estimativa de prontidão (critério interno) */
export const LIMITE_JA_VISTOS = 0.25;

/* Pausa do formulário parcial: proporcional aos blocos (55 min x blocos / 16 no Step 2
   CK), arredondada para cima em minutos */
export function pausaProporcional(pausaMs, blocos, blocosOficiais) {
  if (!(blocosOficiais > 0) || blocos >= blocosOficiais) return pausaMs;
  return Math.ceil((pausaMs * blocos) / blocosOficiais / 60000) * 60000;
}

/* Faixas de dificuldade do projeto (não são do outline oficial): 20% fáceis, 55% médias
   e 25% difíceis, com tolerância de 3 pontos, as mesmas do blueprint do banco */
export const FAIXAS_DIFICULDADE = Object.freeze({ facil: Object.freeze([17, 23]), media: Object.freeze([52, 58]), dificil: Object.freeze([22, 28]) });

/* Angoff usado na montagem: o do próprio item (angoff_item), que não muda quando o
   painel de juízes publica estimativas; assim os formulários fixos continuam os
   mesmos. O corte do formulário usa o Angoff em vigor (q.angoff, do painel quando há). */
export const angoffMontagem = (q) => (Number.isFinite(q?.angoff_item) ? q.angoff_item : q?.angoff);

/* ---------- pares inimigos (item.inimigos, CONTRATO-ITEM.md) ----------
   Itens que testam o mesmo ponto ou que entregam a resposta um do outro não saem no
   mesmo formulário, fixo ou personalizado (e, por consequência, nem no mesmo bloco).
   O par vale nos dois sentidos: basta um dos itens listar o outro. Só contam os itens
   presentes no pool. Devolve Map id -> Set(ids inimigos). */
export function mapaInimigos(pool) {
  const ids = new Set((pool || []).map((q) => q?.id).filter(Boolean));
  const m = new Map();
  const liga = (a, b) => { if (a === b || !ids.has(a) || !ids.has(b)) return; (m.get(a) || m.set(a, new Set()).get(a)).add(b); (m.get(b) || m.set(b, new Set()).get(b)).add(a); };
  for (const q of pool || []) for (const x of q?.inimigos || []) liga(q.id, x);
  return m;
}
/* Pares inimigos dentro de uma lista de ids: [[a, b], ...] com a < b */
export function paresInimigosEm(ids, mapa) {
  const dentro = new Set(ids);
  const out = [];
  for (const a of dentro) for (const b of mapa.get(a) || []) if (a < b && dentro.has(b)) out.push([a, b]);
  return out.sort((x, y) => (x[0] + x[1] < y[0] + y[1] ? -1 : 1));
}
/* Menor número de itens por bloco aceito num formulário com o número oficial de blocos:
   o formato oficial é "até 20 itens por bloco" (318 em 16 blocos já tem dois de 19). Um
   formulário fixo pode ficar com menos itens que o máximo quando pares inimigos impedem
   usar todo o banco (por exemplo, três itens que se entregam e só dois formulários). */
export const MIN_ITENS_POR_BLOCO_COMPLETO = 19;

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
export function montarFormulario(banco, { step, tipo = "completo", modo = "fixo", semente = 1, vistas = [], evitar = [], codigo = "", nome = "", apenasItens = false } = {}) {
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
  /* pares inimigos: item com inimigo já escolhido só entra se não houver outro */
  const inim = mapaInimigos(pool);
  const noForm = new Set();
  const conflitos = (q, fora = null) => { let c = 0; for (const x of inim.get(q.id) || []) if (x !== fora && noForm.has(x)) c++; return c; };
  const penalidade = (q) => {
    let p = conflitos(q) ? 1e8 : 0;
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
    noForm.add(q.id);
    pegos[estrato]++;
    for (const d of secundarias) { const v = q[d] || "_sem"; contagem[d][v] = (contagem[d][v] || 0) + 1; }
    for (const m of multi) for (const r of rotulos(q, m)) m.cont[r] = (m.cont[r] || 0) + 1;
  }
  /* completa com o que sobrou se as cotas não fecharam (banco desequilibrado) */
  if (escolhidos.length < N) {
    const resto = pool.filter((q) => !noForm.has(q.id)).sort((a, b) => penalidade(a) - penalidade(b) || chaveAleatoria.get(a.id) - chaveAleatoria.get(b.id));
    /* primeiro os que não conflitam com o que já entrou; os que conflitam, só se faltar */
    const adiados = [];
    for (const q of resto) {
      if (escolhidos.length >= N) break;
      if (conflitos(q)) { adiados.push(q); continue; }
      escolhidos.push(q); noForm.add(q.id);
    }
    for (const q of adiados) { if (escolhidos.length >= N) break; escolhidos.push(q); noForm.add(q.id); }
  }

  const reparo = repararFaixas(escolhidos, pool, { step, principal, N, inim, prioridade: (q) => (modo === "personalizado" && vistasSet.has(q.id) ? 2 : 0) + (evitarSet.has(q.id) ? 1 : 0) + chaveAleatoria.get(q.id) * 1e-3 });
  const trocasInimigos = resolverInimigos(escolhidos, pool, inim, principal, (q) => (modo === "personalizado" && vistasSet.has(q.id) ? 2 : 0) + (evitarSet.has(q.id) ? 1 : 0) + chaveAleatoria.get(q.id) * 1e-3);
  if (apenasItens) return { itens: escolhidos, fora: [...new Set([...fora, ...reparo.pendentes])].sort(), trocas: reparo.trocas + trocasInimigos, dim };
  return formularioDeItens(escolhidos, { step, tipo, modo, semente, codigo, nome, pool, dim, random, chaveAleatoria, fora: [...new Set([...fora, ...reparo.pendentes])].sort(), trocas: reparo.trocas + trocasInimigos });
}

/* Troca, no lugar, o segundo item de cada par inimigo que sobrou na escolha por um item
   fora do formulário que não conflite com nenhum escolhido: primeiro do mesmo sistema,
   da mesma dificuldade e da mesma competência; depois só do mesmo sistema (as cotas de
   sistema não mudam); por fim de qualquer sistema. Sem candidato, o par fica (banco
   pequeno demais) e aparece em verificarFormulario. Devolve o número de trocas. */
function resolverInimigos(escolhidos, pool, inim, principal, prioridade) {
  if (!inim.size) return 0;
  const dentro = new Set(escolhidos.map((q) => q.id));
  const livre = (q, sai) => ![...(inim.get(q.id) || [])].some((x) => x !== sai && dentro.has(x));
  let trocas = 0;
  for (let i = 0; i < escolhidos.length; i++) {
    const sai = escolhidos[i];
    if (livre(sai, null)) continue;
    const fora = pool.filter((q) => !dentro.has(q.id) && livre(q, sai.id)).sort((a, b) => prioridade(a) - prioridade(b));
    const entra = fora.find((q) => q[principal] === sai[principal] && q.dificuldade === sai.dificuldade && q.competencia === sai.competencia)
      || fora.find((q) => q[principal] === sai[principal] && q.dificuldade === sai.dificuldade)
      || fora.find((q) => q[principal] === sai[principal]) || fora[0];
    if (!entra) continue;
    dentro.delete(sai.id); dentro.add(entra.id);
    escolhidos[i] = entra;
    trocas++;
  }
  return trocas;
}

/* Monta o objeto do formulário a partir dos itens escolhidos: blocos equilibrados,
   tempos, assinatura do banco e hash. pool: banco do Step (para a assinatura). */
function formularioDeItens(escolhidos, { step, tipo, modo, semente, codigo, nome, pool, dim, random, chaveAleatoria, fora = [], trocas = 0, parcial = false, motivoParcial = "" }) {
  const principal = DIMENSOES[step][0];
  const nBlocos = parcial ? Math.max(1, Math.ceil(escolhidos.length / TEMPOS_OFICIAIS.itens_por_bloco_max)) : dim.blocos;
  const blocos = distribuirEmBlocos(escolhidos, tamanhosBlocos(escolhidos.length, nBlocos), { random, principal, chaveAleatoria });
  const t = TIPOS_FORMULARIO[tipo];
  const assinatura = assinaturaBanco(pool);
  const cod = codigo || (step === "step1" ? "S1" : "CK") + "-" + (modo === "fixo" ? "F" : "P") + semente;
  const pausa = parcial ? pausaProporcional(t.pausa_ms, blocos.length, t[step].blocos) : t.pausa_ms;
  const form = {
    id: [step, tipo, modo, cod, assinatura].join(":"),
    codigo: cod,
    nome: nome || t.nome,
    step, tipo, modo, semente,
    reduzido: dim.reduzido,
    motivo_reducao: dim.motivo,
    parcial: !!parcial,
    motivo_parcial: parcial ? motivoParcial : "",
    oficial: { blocos: t[step].blocos, itens: t[step].itens, formato_oficial: !!t.oficial },
    blocos: blocos.map((b) => b.map((q) => q.id)),
    total: escolhidos.length,
    tempo: {
      bloco_ms: TEMPOS_OFICIAIS.bloco_ms,
      pausa_ms: pausa,
      tutorial_ms: t.tutorial_ms,
      dia_ms: blocos.length * TEMPOS_OFICIAIS.bloco_ms + pausa + t.tutorial_ms,
      pausa_proporcional: pausa !== t.pausa_ms
    },
    assinatura_banco: assinatura,
    fora_da_faixa: fora,
    trocas_de_reparo: trocas
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
function repararFaixas(escolhidos, pool, { step, principal, N, prioridade, inim = new Map() }) {
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
      /* a troca não pode juntar um par inimigo */
      const semConflito = (sai) => ![...(inim.get(entra.id) || [])].some((x) => x !== sai.id && usados.has(x));
      const i = escolhidos.findIndex((sai) => sai[principal] === entra[principal] && (falta ? !tem(sai) : tem(sai)) && aceita(sai, entra) && semConflito(sai));
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

/* ---------- partição do banco nos formulários fixos ----------
   Restrições de proporção de um Step: as faixas oficiais exigidas (sistema e
   competência ou tarefa do médico), as disciplinas contadas com todos os rótulos e a
   meta de dificuldade do projeto. */
function restricoesDoStep(step) {
  const out = [];
  for (const d of DIMENSOES[step]) {
    const tax = TAXONOMIA[step]?.[d];
    if (!tax) continue;
    const faixas = Object.fromEntries(tax.chaves.filter((c) => c.faixa).map((c) => [c.chave, c.faixa]));
    const campo = CAMPO_MULTIRROTULO[step]?.[d];
    if (!Object.keys(faixas).length || (!tax.exigir_faixa && !campo)) continue;
    out.push({ d, exigida: !!tax.exigir_faixa, peso: tax.exigir_faixa ? 1 : 0.6, faixas, rot: campo ? (q) => [...new Set([q[d], ...(q[campo] || [])].filter(Boolean))] : (q) => (q[d] ? [q[d]] : []) });
  }
  /* dificuldade: A e B com a mesma composição (formulários paralelos), em vez de puxar o A
     para a meta do projeto e deixar o B com o que sobra; a meta 20/55/25% continua no
     relatório como aviso (verificarFormulario) */
  out.push({ d: "dificuldade", paralela: true, peso: 0.6, faixas: FAIXAS_DIFICULDADE, rot: (q) => (q.dificuldade ? [q.dificuldade] : []) });
  return out;
}
/* Penalidade de uma chave: fora da faixa oficial pesa 1000 vezes mais que ficar na
   margem interna de 0,5 ponto percentual (folga para não encostar no limite) */
function penalidadeFaixa(c, n, faixa, soDuro = false) {
  if (!n || !faixa) return 0;
  const p = (100 * c) / n, [lo, hi] = faixa, meio = (lo + hi) / 2;
  const l = Math.min(lo + 0.5, meio), h = Math.max(hi - 0.5, meio);
  let v = 0;
  if (p < lo) v += 1000 * (lo - p) ** 2; else if (p > hi) v += 1000 * (p - hi) ** 2;
  if (soDuro) return v;
  if (p < l) v += (l - p) ** 2; else if (p > h) v += (p - h) ** 2;
  return v;
}

/* Partição do banco do Step em A (nA itens), B (nB itens) e reserva (o resto), por busca
   local a partir da escolha gulosa: trocas de itens entre os grupos que diminuem a soma
   das penalidades de faixa dos dois formulários e a diferença de Angoff médio entre
   eles; as penalidades do A pesam 100 vezes as do B. Determinística pela semente do A.
   Pares inimigos (mapaInimigos) não podem ficar no mesmo formulário: uma troca nunca
   junta um par no A, e cada par no B custa mais que qualquer faixa. A reserva não tem
   restrição. Devolve { A, B, reserva, conflitos: { A: [[a, b]], B: [[a, b]] } }. */
/* O A tem prioridade: quando o banco não comporta dois formulários dentro das faixas,
   o B (completo ou parcial) cede, e o A continua dentro delas */
const PESO_GRUPO = [100, 1];
const PESO_INIMIGO = [1e12, 1e8];
export function montarParticao(pool, step, nA, nB, { semente = 1, inicialA = null, inicialB = null, inim = mapaInimigos(pool) } = {}) {
  const random = rng(semente ^ 0x5bd1e995);
  const restr = restricoesDoStep(step);
  const grupo = new Map();
  const setA = new Set((inicialA || pool.slice(0, nA)).map((q) => q.id));
  const setB = new Set((inicialB || pool.filter((q) => !setA.has(q.id)).slice(0, nB)).map((q) => q.id));
  for (const q of pool) grupo.set(q.id, setA.has(q.id) ? 0 : setB.has(q.id) ? 1 : 2);
  const membros = [[], [], []];
  for (const q of pool) membros[grupo.get(q.id)].push(q);
  const cont = [0, 1].map(() => restr.map(() => ({})));
  const soma = [0, 0];
  for (const g of [0, 1]) for (const q of membros[g]) { soma[g] += angoffMontagem(q); restr.forEach((r, i) => { for (const k of r.rot(q)) cont[g][i][k] = (cont[g][i][k] || 0) + 1; }); }
  const n = [membros[0].length, membros[1].length];
  const custoAngoff = () => (n[0] && n[1] ? 1e4 * (soma[0] / n[0] - soma[1] / n[1]) ** 2 : 0);
  /* formulários paralelos: diferença entre A e B na proporção de cada chave das dimensões
     "paralelas" (dificuldade); 10 pontos percentuais de diferença custam 1000 */
  const iPar = restr.map((r, i) => (r.paralela ? i : -1)).filter((i) => i >= 0);
  const custoParalelo = () => {
    if (!n[0] || !n[1]) return 0;
    let c = 0;
    for (const i of iPar) for (const k of Object.keys(restr[i].faixas)) c += 1e5 * ((cont[0][i][k] || 0) / n[0] - (cont[1][i][k] || 0) / n[1]) ** 2;
    return c;
  };
  /* inimigos de q no grupo g, sem contar "fora" (o item que sai na troca) */
  const inimigosEm = (q, g, fora = null) => { let c = 0; for (const x of inim.get(q.id) || []) if (x !== fora && grupo.get(x) === g) c++; return c; };
  /* variação da penalidade do grupo g quando sai x e entra y (qualquer um pode ser null);
     soDuro: só a parte fora das faixas oficiais exigidas (sistema e competência) */
  const delta = (g, x, y, soDuro = false) => {
    let d = 0;
    restr.forEach((r, i) => {
      if ((soDuro && !r.exigida) || r.paralela) return;
      const mud = {};
      if (x) for (const k of r.rot(x)) mud[k] = (mud[k] || 0) - 1;
      if (y) for (const k of r.rot(y)) mud[k] = (mud[k] || 0) + 1;
      for (const [k, dd] of Object.entries(mud)) {
        if (!dd || !r.faixas[k]) continue;
        const c = cont[g][i][k] || 0;
        d += PESO_GRUPO[g] * r.peso * (penalidadeFaixa(c + dd, n[g], r.faixas[k], soDuro) - penalidadeFaixa(c, n[g], r.faixas[k], soDuro));
      }
    });
    return d;
  };
  /* variação dos pares inimigos no grupo g quando sai x e entra y */
  const deltaInimigos = (g, x, y) => (g > 1 ? 0 : PESO_INIMIGO[g] * ((y ? inimigosEm(y, g, x?.id) : 0) - (x ? inimigosEm(x, g) : 0)));
  const aplicar = (g, x, y) => {
    restr.forEach((r, i) => { for (const k of r.rot(x)) cont[g][i][k]--; for (const k of r.rot(y)) cont[g][i][k] = (cont[g][i][k] || 0) + 1; });
    soma[g] += angoffMontagem(y) - angoffMontagem(x);
  };
  const iteracoes = Math.min(60000, pool.length * 120);
  for (let it = 0; it < iteracoes; it++) {
    const g1 = random() < 0.5 ? 0 : 1;
    const opcoes = [0, 1, 2].filter((g) => g !== g1 && membros[g].length);
    if (!membros[g1].length || !opcoes.length) continue;
    const g2 = opcoes[Math.floor(random() * opcoes.length)];
    const i1 = Math.floor(random() * membros[g1].length), i2 = Math.floor(random() * membros[g2].length);
    const x = membros[g1][i1], y = membros[g2][i2];
    /* o A nunca sai mais das faixas oficiais exigidas para melhorar o B */
    const durA = g1 === 0 ? delta(0, x, y, true) : g2 === 0 ? delta(0, y, x, true) : 0;
    if (durA > 1e-9) continue;
    const dIni = deltaInimigos(g1, x, y) + deltaInimigos(g2, y, x);
    const glob0 = custoAngoff() + custoParalelo();
    let d = dIni + delta(g1, x, y) + (g2 < 2 ? delta(g2, y, x) : 0);
    aplicar(g1, x, y);
    if (g2 < 2) aplicar(g2, y, x);
    d += custoAngoff() + custoParalelo() - glob0;
    if (d < -1e-9) {
      membros[g1][i1] = y; membros[g2][i2] = x;
      grupo.set(y.id, g1); grupo.set(x.id, g2);
    } else {
      aplicar(g1, y, x);
      if (g2 < 2) aplicar(g2, x, y);
    }
  }
  /* pares que sobraram: tenta desfazer cada um com qualquer troca que não junte outro par
     e não tire o A das faixas exigidas (varredura completa, determinística) */
  for (const g of [0, 1]) {
    for (let volta = 0; volta < 3; volta++) {
      let mudou = false;
      for (let i1 = 0; i1 < membros[g].length; i1++) {
        const x = membros[g][i1];
        if (!inimigosEm(x, g)) continue;
        let feito = false;
        for (const g2 of [2, 1 - g]) {
          for (let i2 = 0; i2 < membros[g2].length && !feito; i2++) {
            const y = membros[g2][i2];
            if (inimigosEm(y, g, x.id) || (g2 < 2 && inimigosEm(x, g2, y.id))) continue;
            if ((g === 0 && delta(0, x, y, true) > 1e-9) || (g2 === 0 && delta(0, y, x, true) > 1e-9)) continue;
            aplicar(g, x, y); if (g2 < 2) aplicar(g2, y, x);
            membros[g][i1] = y; membros[g2][i2] = x; grupo.set(y.id, g); grupo.set(x.id, g2);
            feito = mudou = true;
          }
          if (feito) break;
        }
      }
      if (!mudou) break;
    }
  }
  const ordem = (l) => l.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const conflitos = { A: paresInimigosEm(membros[0].map((q) => q.id), inim), B: paresInimigosEm(membros[1].map((q) => q.id), inim) };
  return { A: ordem(membros[0]), B: ordem(membros[1]), reserva: ordem(membros[2]), conflitos };
}

/* Formulário fixo pelo código (S1-A, S1-B, CK-A, CK-B). A e B saem da mesma partição
   (montarParticao com a semente do A), então o A é o mesmo quando se pede só o A ou
   quando se pede o B. Com banco pequeno demais para separar (menos de um bloco
   sobrando depois do A), o B repete itens, evitando os do A até onde der. */
/* Formulário a partir de blocos gravados (ordem e composição fixas). Devolve null quando
   a gravação não serve para o banco atual (item ausente, inativo ou repetido, par
   inimigo no mesmo formulário, ou tamanho fora do formato). */
function formularioGravado(banco, step, f, tipo, pool) {
  const g = banco?.formularios_fixos?.[step]?.[f.codigo];
  if (!g || tipo !== "completo" || (g.tipo && g.tipo !== "completo")) return null;
  const porId = new Map(pool.map((q) => [q.id, q]));
  const ids = g.blocos.flat();
  if (new Set(ids).size !== ids.length || ids.some((id) => !porId.has(id))) return null;
  if (paresInimigosEm(ids, mapaInimigos(pool)).length) return null;
  const t = TIPOS_FORMULARIO[tipo];
  if (!g.parcial && (ids.length > t[step].itens || ids.length < t[step].blocos * MIN_ITENS_POR_BLOCO_COMPLETO || g.blocos.length !== t[step].blocos)) return null;
  const assinatura = assinaturaBanco(pool);
  const blocos = g.blocos.map((b) => b.slice());
  const pausa = g.parcial ? pausaProporcional(t.pausa_ms, blocos.length, t[step].blocos) : t.pausa_ms;
  const form = {
    id: [step, tipo, "fixo", f.codigo, assinatura].join(":"),
    codigo: f.codigo,
    nome: f.nome + " (" + t.nome.toLowerCase() + ")" + (g.parcial ? ", parcial" : ""),
    step, tipo, modo: "fixo", semente: f.semente,
    reduzido: false, motivo_reducao: "",
    parcial: !!g.parcial,
    motivo_parcial: g.parcial ? "Formulário parcial: depois do formulário A sobram " + ids.length + " itens deste Step, menos que os " + t[step].itens + " do formato, e nenhum item do A é repetido." : "",
    oficial: { blocos: t[step].blocos, itens: t[step].itens, formato_oficial: !!t.oficial },
    blocos,
    total: ids.length,
    tempo: { bloco_ms: TEMPOS_OFICIAIS.bloco_ms, pausa_ms: pausa, tutorial_ms: t.tutorial_ms, dia_ms: blocos.length * TEMPOS_OFICIAIS.bloco_ms + pausa + t.tutorial_ms, pausa_proporcional: pausa !== t.pausa_ms },
    assinatura_banco: assinatura,
    fora_da_faixa: [],
    trocas_de_reparo: 0,
    origem_montagem: "gravado",
    omitidos_por_inimigos: g.parcial ? 0 : t[step].itens - ids.length
  };
  form.hash = hashTexto(form.blocos.map((b) => b.join(",")).join("|"));
  return form;
}

export function montarFormularioFixo(banco, step, codigo, tipo = "completo", { ignorarGravado = false } = {}) {
  const lista = FORMULARIOS_FIXOS[step] || [];
  const i = lista.findIndex((f) => f.codigo === codigo);
  if (i < 0) throw new Error("Formulário fixo desconhecido: " + codigo);
  const pool = (banco?.steps?.[step] || []).filter((q) => q && q.id && (q.status === undefined || q.status === "ativo"));
  if (!ignorarGravado) { const g = formularioGravado(banco, step, lista[i], tipo, pool); if (g) return g; }
  const fA = lista[0], fB = lista[1];
  const nomeDe = (f) => f.nome + " (" + TIPOS_FORMULARIO[tipo].nome.toLowerCase() + ")";
  const selA = montarFormulario(banco, { step, tipo, modo: "fixo", semente: fA.semente, codigo: fA.codigo, apenasItens: true });
  const N = selA.dim.itens;
  const resto = pool.length - N;
  const separavel = resto >= TEMPOS_OFICIAIS.itens_por_bloco_max;
  if (!separavel) {
    /* banco reduzido (demonstração): A é o formulário guloso; B repete itens */
    if (i === 0) return montarFormulario(banco, { step, tipo, modo: "fixo", semente: fA.semente, codigo: fA.codigo, nome: nomeDe(fA) });
    const evitar = montarFormulario(banco, { step, tipo, modo: "fixo", semente: fA.semente, codigo: fA.codigo }).blocos.flat();
    return montarFormulario(banco, { step, tipo, modo: "fixo", semente: fB.semente, codigo: fB.codigo, nome: nomeDe(fB), evitar });
  }
  const nB = Math.min(N, resto);
  const parcialB = nB < N;
  const idsA = new Set(selA.itens.map((q) => q.id));
  const restoItens = pool.filter((q) => !idsA.has(q.id));
  const inicialB = parcialB ? restoItens : montarFormulario({ steps: { [step]: restoItens } }, { step, tipo, modo: "fixo", semente: fB.semente, codigo: fB.codigo, apenasItens: true }).itens;
  const inim = mapaInimigos(pool);
  const part = montarParticao(pool, step, N, nB, { semente: fA.semente, inicialA: selA.itens, inicialB, inim });
  /* par inimigo que não coube em formulários diferentes (por exemplo, três itens que se
     entregam, com só dois formulários e nenhum item sobrando): um item do par sai do B
     para a reserva. Sai primeiro o item público, depois o que tem mais inimigos no B e,
     no empate, o de id maior. O B continua no formato oficial enquanto cada bloco tiver
     pelo menos MIN_ITENS_POR_BLOCO_COMPLETO itens. */
  const omitidosB = [];
  for (let guarda = 0; guarda < 1000; guarda++) {
    const ids = part.B.map((q) => q.id);
    const pares = paresInimigosEm(ids, inim);
    if (!pares.length) break;
    const noB = new Set(ids);
    const grau = (id) => [...(inim.get(id) || [])].filter((x) => noB.has(x)).length;
    const porIdB = new Map(part.B.map((q) => [q.id, q]));
    const [a, b] = pares[0];
    const sai = [a, b].sort((x, y) => (porIdB.get(y).legado ? 1 : 0) - (porIdB.get(x).legado ? 1 : 0) || grau(y) - grau(x) || (y > x ? 1 : -1))[0];
    part.B = part.B.filter((q) => q.id !== sai);
    part.reserva.push(porIdB.get(sai));
    omitidosB.push(sai);
  }
  const f = i === 0 ? fA : fB;
  const itens = i === 0 ? part.A : part.B;
  const random = rng(f.semente);
  const chaveAleatoria = new Map(pool.map((q) => [q.id, random()]));
  const dimB = i === 1 && parcialB ? { ...selA.dim, reduzido: false, motivo: "" } : selA.dim;
  const parcial = i === 1 && parcialB;
  const form = formularioDeItens(itens, {
    step, tipo, modo: "fixo", semente: f.semente, codigo: f.codigo, nome: nomeDe(f) + (parcial ? ", parcial" : ""), pool, dim: dimB, random, chaveAleatoria, parcial,
    motivoParcial: parcial ? "Formulário parcial: depois do formulário A sobram " + itens.length + " itens deste Step, menos que os " + N + " do formato, e nenhum item do A é repetido." : ""
  });
  form.particao = { codigos: lista.map((x) => x.codigo), itens_a: N, itens_b: part.B.length, reserva: part.reserva.length, omitidos_do_b_por_inimigos: omitidosB, pares_inimigos_no_a: part.conflitos.A.length };
  form.omitidos_por_inimigos = i === 1 && !parcial ? N - itens.length : 0;
  form.origem_montagem = "calculado";
  return form;
}

/* Itens fora do corte num formulário fixo: os itens públicos (legado, os 80 de
   simulado/data/, com gabarito e explicação no repositório aberto) continuam no
   formulário, para não mudar a composição nem o tempo, mas não entram na estimativa,
   como os itens de pré-teste da prova real. Só vale quando o formulário também tem
   itens privados: no modo demonstração, com os 80 públicos apenas, todos contam.
   Devolve um Set de ids. */
export function itensForaDoCorte(form, porId) {
  if (!form || form.modo !== "fixo") return new Set();
  const get = porId instanceof Map ? (id) => porId.get(id) : (id) => porId?.[id];
  const ids = (form.blocos || []).flat();
  const legado = ids.filter((id) => get(id)?.legado);
  if (!legado.length || legado.length === ids.filter((id) => get(id)).length) return new Set();
  return new Set(legado);
}

/* Formulário fixo é reservado? A gravação em formularios.json (reservado) vale mais
   que o padrão de FORMULARIOS_FIXOS. */
export function formularioReservado(banco, step, codigo) {
  const g = banco?.formularios_fixos?.[step]?.[codigo];
  if (g && typeof g.reservado === "boolean") return g.reservado;
  return !!(FORMULARIOS_FIXOS[step] || []).find((f) => f.codigo === codigo)?.reservado;
}

/* Itens reservados para um aluno: os dos formulários fixos completos marcados como
   reservados que ele ainda não fez. simulados: listSimuladosCompletos() do aluno; um
   formulário é liberado quando há um simulado concluído dele, ou abandonado depois
   de pelo menos um bloco encerrado (os itens já foram expostos). Formulário reduzido
   (banco pequeno, como os 80 itens públicos) nunca é reservado: tiraria o banco
   inteiro da prática. Devolve { ids: Set, formularios: [{ step, codigo, nome, itens }] }. */
export function itensReservados(banco, simulados = [], { steps = ["step1", "step2ck"] } = {}) {
  const ids = new Set();
  const formularios = [];
  const feitos = new Set();
  for (const r of simulados || []) {
    const cod = r?.formulario?.codigo;
    if (!cod) continue;
    if (r.estado === "concluido" || (r.estado === "abandonado" && (r.sessao?.blocos_encerrados || 0) > 0)) feitos.add(r.step + "|" + cod);
  }
  for (const step of steps) {
    for (const f of FORMULARIOS_FIXOS[step] || []) {
      if (!formularioReservado(banco, step, f.codigo) || feitos.has(step + "|" + f.codigo)) continue;
      let form;
      try { form = montarFormularioFixo(banco, step, f.codigo, "completo"); } catch { continue; }
      if (form.reduzido) continue;
      const lista = form.blocos.flat();
      for (const id of lista) ids.add(id);
      formularios.push({ step, codigo: f.codigo, nome: f.nome, itens: lista.length, parcial: !!form.parcial });
    }
  }
  return { ids, formularios };
}

/* Itens de um formulário que o aluno já respondeu (respostas de qualquer origem,
   antes de começar o formulário) */
export function vistosNoFormulario(form, respostas) {
  const ids = new Set((form?.blocos || []).flat());
  const vistos = new Set();
  for (const r of respostas || []) if (ids.has(r.questao_id)) vistos.add(r.questao_id);
  return { n: vistos.size, total: ids.size, fracao: ids.size ? vistos.size / ids.size : 0, reaplicacao: ids.size ? vistos.size / ids.size > LIMITE_JA_VISTOS : false };
}

/* Formulário personalizado do aluno: prioriza itens não vistos */
export function montarFormularioPersonalizado(banco, { step, tipo = "completo", vistas = [], semente }) {
  const s = Number.isFinite(semente) ? semente : Number.parseInt(hashTexto(step + tipo + vistas.length + (vistas[vistas.length - 1] || "")), 16);
  return montarFormulario(banco, { step, tipo, modo: "personalizado", semente: s, vistas });
}

/* Distribuição em blocos: serpentina pela ordem do Angoff de montagem, depois busca
   local por trocas entre blocos que aproximam de cada bloco a média de Angoff do
   formulário, a proporção de cada dificuldade e a de cada sistema. Dentro do bloco, a
   ordem é embaralhada pela semente, evitando dois itens seguidos do mesmo sistema. */
function distribuirEmBlocos(itens, tamanhos, { random, principal, chaveAleatoria }) {
  const B = tamanhos.length;
  const ang = (q) => angoffMontagem(q);
  const ord = itens.slice().sort((a, b) => ang(b) - ang(a) || chaveAleatoria.get(a.id) - chaveAleatoria.get(b.id));
  const blocos = Array.from({ length: B }, () => []);
  let dir = 1, bIdx = 0;
  for (const q of ord) {
    let tentativas = 0;
    while (blocos[bIdx].length >= tamanhos[bIdx] && tentativas++ < 2 * B) { bIdx += dir; if (bIdx >= B) { bIdx = B - 1; dir = -1; } else if (bIdx < 0) { bIdx = 0; dir = 1; } }
    blocos[bIdx].push(q);
    bIdx += dir;
    if (bIdx >= B) { bIdx = B - 1; dir = -1; } else if (bIdx < 0) { bIdx = 0; dir = 1; }
  }
  if (B > 1) {
    const total = itens.length;
    const mGlobal = itens.reduce((s, q) => s + ang(q), 0) / Math.max(1, total);
    const prop = (campo) => { const m = {}; for (const q of itens) m[q[campo]] = (m[q[campo]] || 0) + 1 / total; return m; };
    const pDif = prop("dificuldade"), pSis = prop(principal);
    const est = blocos.map((b) => ({ soma: b.reduce((s, q) => s + ang(q), 0), dif: contarCampo(b, "dificuldade"), sis: contarCampo(b, principal), n: b.length }));
    const custoBloco = (e) => {
      let c = 1e4 * (e.soma / e.n - mGlobal) ** 2;
      for (const [k, p] of Object.entries(pDif)) c += ((e.dif[k] || 0) - p * e.n) ** 2;
      for (const [k, p] of Object.entries(pSis)) c += 0.3 * ((e.sis[k] || 0) - p * e.n) ** 2;
      return c;
    };
    const mover = (e, q, s) => { e.soma += s * ang(q); e.dif[q.dificuldade] = (e.dif[q.dificuldade] || 0) + s; e.sis[q[principal]] = (e.sis[q[principal]] || 0) + s; };
    const tentativas = Math.min(60000, total * 150);
    for (let t = 0; t < tentativas; t++) {
      const b1 = Math.floor(random() * B), b2 = Math.floor(random() * B);
      if (b1 === b2 || !blocos[b1].length || !blocos[b2].length) continue;
      const i1 = Math.floor(random() * blocos[b1].length), i2 = Math.floor(random() * blocos[b2].length);
      const q1 = blocos[b1][i1], q2 = blocos[b2][i2];
      if (q1.dificuldade === q2.dificuldade && q1[principal] === q2[principal] && Math.abs(ang(q1) - ang(q2)) < 1e-9) continue;
      const antes = custoBloco(est[b1]) + custoBloco(est[b2]);
      mover(est[b1], q1, -1); mover(est[b1], q2, 1); mover(est[b2], q2, -1); mover(est[b2], q1, 1);
      const depois = custoBloco(est[b1]) + custoBloco(est[b2]);
      if (depois < antes - 1e-9) { blocos[b1][i1] = q2; blocos[b2][i2] = q1; }
      else { mover(est[b1], q2, -1); mover(est[b1], q1, 1); mover(est[b2], q1, -1); mover(est[b2], q2, 1); }
    }
  }
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
function contarCampo(lista, campo) { const m = {}; for (const q of lista) m[q[campo]] = (m[q[campo]] || 0) + 1; return m; }

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
  const inteiro = !form.reduzido && !form.parcial;
  /* formato oficial: número de blocos oficial, até 20 itens por bloco e até o total do
     formato; com pares inimigos, o formulário pode ficar com menos itens, desde que cada
     bloco tenha pelo menos MIN_ITENS_POR_BLOCO_COMPLETO */
  if (inteiro && (total > form.oficial.itens || total < form.oficial.blocos * MIN_ITENS_POR_BLOCO_COMPLETO)) problemas.push("Total diferente do formato: " + total + " de " + form.oficial.itens + ".");
  else if (inteiro && total < form.oficial.itens) avisos.push(total + " itens, " + (form.oficial.itens - total) + " abaixo do máximo do formato: pares inimigos impediram usar todo o banco neste formulário (blocos de " + MIN_ITENS_POR_BLOCO_COMPLETO + " e 20 itens).");
  if (inteiro && form.blocos.length !== form.oficial.blocos) problemas.push("Número de blocos diferente do formato.");
  /* pares inimigos no mesmo formulário (contam os dois sentidos do campo inimigos) */
  const paresNoForm = paresInimigosEm(ids, mapaInimigos(ids.map(get).filter(Boolean)));
  if (paresNoForm.length) problemas.push("Pares inimigos no mesmo formulário: " + paresNoForm.map((p) => p.join(" e ")).join("; ") + ".");
  if (form.parcial) avisos.push(form.motivo_parcial || "Formulário parcial.");
  const blocos = form.blocos.map((b, i) => {
    const qs = b.map(get).filter(Boolean);
    const pd = { facil: 0, media: 0, dificil: 0 };
    for (const q of qs) pd[q.dificuldade] = (pd[q.dificuldade] || 0) + 1;
    return { indice: i, n: b.length, angoff_medio: qs.length ? qs.reduce((s, q) => s + q.angoff, 0) / qs.length : null, angoff_montagem_medio: qs.length ? qs.reduce((s, q) => s + angoffMontagem(q), 0) / qs.length : null, por_dificuldade: pd, sistemas: new Set(qs.map((q) => q.sistema)).size };
  });
  const medias = blocos.map((b) => b.angoff_montagem_medio).filter((x) => x !== null);
  const validos = itens.filter(Boolean);
  const mg = validos.reduce((s, q) => s + angoffMontagem(q), 0) / Math.max(1, validos.length);
  /* corte provisório: média do Angoff em vigor (do painel de juízes quando houver) */
  const corte = validos.reduce((s, q) => s + q.angoff, 0) / Math.max(1, validos.length);
  const doPainel = validos.filter((q) => q.angoff_origem === "painel").length;
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
    if (d === "dificuldade") for (const x of dimensoes[d]) { x.faixa = FAIXAS_DIFICULDADE[x.chave] || null; x.dentro = x.faixa ? x.pct >= x.faixa[0] / 100 - 1e-9 && x.pct <= x.faixa[1] / 100 + 1e-9 : null; x.meta_do_projeto = true; }
    for (const x of dimensoes[d]) if (d === "dificuldade" && x.dentro === false && !form.reduzido) avisos.push("dificuldade " + x.chave + " fora da meta do projeto (" + (x.pct * 100).toFixed(1) + "% para " + x.faixa[0] + " a " + x.faixa[1] + "%).");
    /* no formulário parcial (o restante do banco), a faixa é meta: fora dela vira aviso */
    for (const x of dimensoes[d]) if (x.exigida && x.dentro === false && !form.reduzido) (form.parcial ? avisos : problemas).push(d + " " + x.chave + " fora da faixa oficial (" + (x.pct * 100).toFixed(1) + "% para " + x.faixa[0] + " a " + x.faixa[1] + "%)" + (form.parcial ? " no formulário parcial." : "."));
    for (const x of dimensoes[d]) if (x.dentro_multirrotulo === false && !form.reduzido) avisos.push(d + " " + x.chave + " (todos os rótulos) fora da faixa oficial (" + (x.pct_multirrotulo * 100).toFixed(1) + "% para " + x.faixa[0] + " a " + x.faixa[1] + "%).");
  }
  return {
    ok: problemas.length === 0, total, blocos,
    equilibrio: { angoff_medio: mg, dp_entre_blocos: dpb, amplitude: medias.length ? Math.max(...medias) - Math.min(...medias) : 0 },
    corte: { angoff_medio: corte, origem: doPainel === validos.length && validos.length ? "painel" : doPainel ? "misto" : "provisorio", itens_com_painel: doPainel },
    dimensoes, problemas, avisos, pares_inimigos: paresNoForm
  };
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
