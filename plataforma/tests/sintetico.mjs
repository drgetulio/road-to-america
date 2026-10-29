/* Itens sintéticos no contrato atual, só para testes (não são questões de verdade).
   gerarBancoSintetico({ porStep, semente, distorcer }) devolve um array de itens
   brutos dos dois Steps, com composição próxima dos pontos médios do outline. */
import { TAXONOMIA } from "../js/banco.js";
import { rng } from "../js/simulado.js";

function sortearPeso(lista, random) {
  const tot = lista.reduce((s, [, w]) => s + w, 0);
  let r = random() * tot;
  for (const [k, w] of lista) { r -= w; if (r <= 0) return k; }
  return lista[lista.length - 1][0];
}
const pesos = (step, dim, distorcer = {}) => TAXONOMIA[step][dim].chaves
  .map((c) => [c.chave, (c.faixa ? (c.faixa[0] + c.faixa[1]) / 2 : c.alvo || 0) * (distorcer[c.chave] || 1)])
  .filter(([, w]) => w > 0);

export function gerarItemSintetico({ step, n, random, sistema, extra = {} }) {
  const pref = step === "step1" ? "S1" : "CK";
  const dif = sortearPeso([["facil", 1], ["media", 2], ["dificil", 1]], random);
  const angoffBase = { facil: 0.8, media: 0.65, dificil: 0.45 }[dif];
  const letras = ["A", "B", "C", "D", "E"];
  const item = {
    id: "R2A-" + pref + "-" + String(n).padStart(4, "0"),
    spec_id: pref + "-" + String(n).padStart(4, "0"),
    step,
    versao: 1,
    vinheta: "Synthetic test vignette number " + n + " for the platform tests only.",
    pergunta: "Which of the following is the most likely explanation?",
    alternativas: letras.map((l) => ({ letra: l, texto: "Option " + l + " of item " + n })),
    correta: letras[Math.floor(random() * 5)],
    explicacao: "Synthetic explanation.",
    explicacoes_alternativas: Object.fromEntries(letras.map((l) => [l, "Why " + l + "."])),
    objetivo_educacional: "Synthetic objective.",
    explicacao_pt: "Explicação sintética de teste.",
    sistema,
    dificuldade: dif,
    angoff: Math.round((angoffBase + (random() - 0.5) * 0.16) * 100) / 100,
    alto_rendimento: random() < 0.5,
    tags: [step],
    fonte: "Teste sintético, 2026.",
    valores_lab: [],
    revisao: { verificado: true, revisor: "teste", data: "2026-10-29", notas: "" },
    ...extra
  };
  if (step === "step1") {
    item.disciplina = sortearPeso(pesos("step1", "disciplina"), random);
    item.competencia = sortearPeso(pesos("step1", "competencia"), random);
  } else {
    item.competencia = sortearPeso(pesos("step2ck", "competencia"), random);
    const disc = [["medicina", 55], ["pediatria", 17], ["cirurgia", 10], ["ginecologia_obstetricia", 10], ["psiquiatria", 8]];
    const d1 = sortearPeso(disc, random);
    const d2 = random() < 0.25 ? sortearPeso(disc.filter(([k]) => k !== d1), random) : null;
    item.disciplinas_oficiais = d2 ? [d1, d2] : [d1];
    item.area = d1 === "medicina" ? "medicina_interna" : d1;
    item.tarefa = ["manejo", "diagnostico", "interpretacao_exames", "etica", "prevencao", "prognostico"][Math.floor(random() * 6)];
  }
  return item;
}

export function gerarBancoSintetico({ porStep = 500, semente = 99, distorcer = {} } = {}) {
  const random = rng(semente);
  const out = [];
  for (const step of ["step1", "step2ck"]) {
    const ps = pesos(step, "sistema", distorcer[step] || {});
    for (let i = 1; i <= porStep; i++) out.push(gerarItemSintetico({ step, n: i, random, sistema: sortearPeso(ps, random) }));
  }
  return out;
}
