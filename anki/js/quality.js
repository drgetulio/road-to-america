/* Road to America | verificador de qualidade do card.
   Baseado no princípio da informação mínima (Wozniak, regra 4) e no uso de
   cloze (regra 5): um fato por card, resposta curta e sem ambiguidade. */
import { parseCloze, clozeOrds, clozeErrors } from "./cloze.js";
import { plainText } from "./util.js";

const STOP = new Set(("a an the of in on at to for from by with and or but is are was were be been being this that these those it its as " +
  "which what who whom whose when where why how most more least than then there their they them he she his her its " +
  "do does did can could should would will may might must has have had not no yes vs versus into over under about each " +
  "following likely patient patients").split(" "));

const PALAVRAS_SIM_NAO = /^(is|are|does|do|did|can|could|should|will|would|has|have|had|was|were|may|might|must)\b/i;
const PEDE_LISTA = /\b(list|name (all|the|three|four|five|\d+)|enumerate|what are (all|the \d+|the (three|four|five|six|seven))|all of the|causes of|features of|components of|steps of)\b/i;

function palavras(s) {
  return plainText(s).split(/\s+/).filter(Boolean);
}

export function tokens(s) {
  return plainText(s)
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/* Similaridade de Dice entre conjuntos de termos e de pares de termos */
const cacheGramas = new Map();
function gramas(texto) {
  let g = cacheGramas.get(texto);
  if (g) return g;
  const t = tokens(texto);
  g = new Set(t);
  for (let i = 0; i < t.length - 1; i++) g.add(t[i] + " " + t[i + 1]);
  if (cacheGramas.size > 20000) cacheGramas.clear();
  cacheGramas.set(texto, g);
  return g;
}

export function similarity(a, b) {
  const A = gramas(a);
  const B = gramas(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

const textoDoCard = (c) => (c.frente || "") + " " + (c.verso || "");

/* Card mais parecido entre os existentes (ignora o próprio) */
export function mostSimilar(card, existentes = [], limiar = 0.55) {
  let melhor = null;
  const alvo = textoDoCard(card);
  for (const e of existentes) {
    if (!e || e.id === card.id) continue;
    const s = similarity(alvo, textoDoCard(e));
    if (s >= limiar && (!melhor || s > melhor.score)) melhor = { card: e, score: s };
  }
  return melhor;
}

/*
  Avalia um card. Devolve uma lista de { nivel, codigo, titulo, detalhe }:
  "erro" impede salvar; "aviso" pede reescrita; "dica" é sugestão.
*/
export function checkQuality(card, existentes = []) {
  const out = [];
  const add = (nivel, codigo, titulo, detalhe = "") => out.push({ nivel, codigo, titulo, detalhe });
  const frente = card.frente || "";
  const verso = card.verso || "";
  const pFrente = palavras(frente);
  const pVerso = palavras(verso);

  if (!plainText(frente)) {
    add("erro", "frente_vazia", card.tipo === "cloze" ? "Escreva o texto do cloze." : "Escreva a pergunta.");
    return out;
  }

  if (card.tipo === "cloze") {
    for (const e of clozeErrors(frente)) add("erro", "cloze_sintaxe", e);
    const lacunas = parseCloze(frente);
    const ords = clozeOrds(frente);
    if (ords.length > 3) add("aviso", "cloze_demais", "Lacunas demais: " + ords.length + " cards na mesma nota.", "Com mais de três lacunas, uma frase vira um card de lista. Divida em notas menores ou mantenha só os conceitos-chave.");
    const porOrd = {};
    lacunas.forEach((l) => { porOrd[l.ord] = (porOrd[l.ord] || 0) + 1; });
    const repetida = Object.entries(porOrd).find(([, n]) => n > 2);
    if (repetida) add("aviso", "cloze_agrupada", "A lacuna c" + repetida[0] + " esconde " + repetida[1] + " trechos de uma vez.", "Esconder vários trechos com o mesmo número cria uma enumeração. Prefira um número por fato.");
    const oculto = lacunas.reduce((n, l) => n + plainText(l.resposta).length, 0);
    const total = plainText(frente).length;
    if (total && oculto / total > 0.5) add("aviso", "cloze_oculta_demais", "Mais da metade do texto está oculta.", "Sem contexto, a lacuna fica ambígua. Oculte só o termo-chave e deixe as pistas à vista.");
    const triviais = lacunas.filter((l) => tokens(l.resposta).length === 0 && plainText(l.resposta));
    if (triviais.length) add("aviso", "cloze_trivial", "Lacuna sem conteúdo: “" + plainText(triviais[0].resposta) + "”.", "Oculte o conceito, não palavras de ligação.");
    const longas = lacunas.filter((l) => palavras(l.resposta).length > 6);
    if (longas.length) add("aviso", "cloze_longa", "Uma lacuna tem " + palavras(longas[0].resposta).length + " palavras.", "Respostas longas são lembradas pela metade. Reduza a lacuna ao termo que você precisa recuperar.");
    if (pFrente.length > 45) add("aviso", "texto_longo", "Texto longo (" + pFrente.length + " palavras).", "Frases curtas com uma ideia rendem memória melhor que parágrafos.");
  } else {
    if (!plainText(verso)) add("erro", "verso_vazio", "Escreva a resposta.");
    if (PALAVRAS_SIM_NAO.test(plainText(frente))) add("aviso", "sim_nao", "Pergunta de sim ou não.", "Com duas respostas possíveis, metade dos acertos é sorte. Pergunte pelo conceito: “Which enzyme...?”, “What mechanism...?”.");
    if (pVerso.length > 15) add("aviso", "verso_longo", "Resposta longa (" + pVerso.length + " palavras).", "A resposta ideal cabe em poucas palavras. Leve o porquê para o campo Explicação.");
    const itens = plainText(verso).split(/,|;|\n|\s\/\s|\band\b/i).map((s) => s.trim()).filter(Boolean);
    if (itens.length >= 3 || /<br>.*<br>/i.test(verso) || /(^|\s)(1[.)]|[-•*])\s/.test(plainText(verso))) {
      add("aviso", "lista", "A resposta parece uma lista (" + Math.max(itens.length, 3) + " itens).", "Listas são esquecidas item por item. Transforme cada item num cloze ou num card próprio, com uma pista de contexto.");
    }
    if (PEDE_LISTA.test(plainText(frente))) add("aviso", "pede_lista", "A pergunta pede uma enumeração.", "Troque “List the causes of X” por cards que liguem cada causa a uma pista que a diferencie.");
    const perguntas = (plainText(frente).match(/\?/g) || []).length;
    const sentencasVerso = plainText(verso).split(/[.!?]\s+[A-Z]/).length;
    if (perguntas > 1 || sentencasVerso > 2) add("aviso", "duas_ideias", "Mais de uma ideia no mesmo card.", "Separe em dois cards. Um card que mistura fatos tem o intervalo ditado pelo fato mais difícil.");
    else if (/\band\b/i.test(plainText(frente)) && perguntas === 1 && /\b(what|which|how|name)\b.*\band\b.*\b(what|which|how)\b/i.test(plainText(frente))) add("aviso", "duas_ideias", "A pergunta junta duas perguntas.", "Separe em dois cards.");
    const tv = tokens(verso);
    if (tv.length && tv.every((t) => tokens(frente).includes(t))) add("aviso", "resposta_na_pergunta", "A resposta já aparece na pergunta.", "Reescreva a frente para que a resposta precise ser recuperada.");
    if (pFrente.length > 40) add("dica", "frente_longa", "Pergunta longa (" + pFrente.length + " palavras).", "Vinhetas curtas funcionam; acima de duas frases, confira se só uma pista leva à resposta.");
  }

  if (!plainText(card.extra)) add("aviso", "sem_mecanismo", "Falta a explicação do mecanismo.", "No Step 1 a questão pergunta o porquê. Uma ou duas frases sobre o mecanismo ligam o fato ao raciocínio e ajudam quando o card falhar.");
  else if (palavras(card.extra).length > 70) add("dica", "extra_longo", "Explicação longa.", "Uma a três frases bastam; o restante cabe na apostila.");

  if (!card.fonte) add("dica", "sem_fonte", "Indique a referência-padrão (livro-texto ou diretriz).");
  if (!card.tags || !card.tags.length) add("dica", "sem_tags", "Acrescente ao menos uma tag de tema.");

  const par = mostSimilar(card, existentes);
  if (par) {
    const dup = par.score >= 0.85;
    add(dup ? "aviso" : "dica", dup ? "duplicata" : "parecido",
      (dup ? "Provável duplicata de " : "Parecido com ") + (par.card.id || "outro card") + " (" + Math.round(par.score * 100) + "% de semelhança).",
      "“" + plainText(par.card.frente).slice(0, 110) + "”. " + (dup ? "Se for o mesmo fato, prefira estudar o existente." : "Se os dois forem fáceis de confundir, crie um card que pergunte a diferença entre eles."));
  }
  return out;
}

/* Resumo para o selo do verificador */
export function qualitySummary(lista) {
  const erros = lista.filter((x) => x.nivel === "erro").length;
  const avisos = lista.filter((x) => x.nivel === "aviso").length;
  const dicas = lista.filter((x) => x.nivel === "dica").length;
  let selo = "pronto";
  if (erros) selo = "bloqueado";
  else if (avisos) selo = "revisar";
  return { erros, avisos, dicas, selo };
}
