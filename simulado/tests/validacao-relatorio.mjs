/* Road to America | validação por simulação do resultado estimado do simulado completo
   (PSICOMETRIA.md, seção 17). Não é node:test: é um script de conferência, mais lento.

   Para cada cenário, 1.000 examinandos com habilidade verdadeira theta ~ N(0; 0,8^2)
   respondem a um formulário fixo do banco sintético pelo modelo de Rasch. O relatório
   estima P(theta > 0 | respostas) só com as respostas do simulado, como na tela.
   Cenários:
   - vies = 0: o Angoff dos autores está certo (o modelo do relatório é o verdadeiro);
   - vies = +-0,25 ou +-0,5 logit: todos os itens são, na verdade, mais difíceis (+)
     ou mais fáceis (-) do que a dificuldade-alvo diz. É o erro comum da limitação 1 da
     seção 15, que mais respostas não corrigem. Desde 29/10/2026 a probabilidade inclui
     a incerteza do padrão (c ~ N(0; 0,4²), seção 6.1).
   Saída: cobertura do intervalo de 90% de theta (só a medida) e do intervalo da
   distância ao limiar (medida e padrão), escore de Brier e, entre os relatórios com
   precisão alta, a proporção com Pass/Fail trocado em relação à verdade.

   Uso, na raiz:  node simulado/tests/validacao-relatorio.mjs */
import { montarBanco } from "../../plataforma/js/banco.js";
import { montarFormularioFixo } from "../../plataforma/js/formularios.js";
import { bDoItem, expit, normalAleatoria } from "../../plataforma/js/psicometria.js";
import { rng } from "../../plataforma/js/simulado.js";
import { gerarBancoSintetico } from "../../plataforma/tests/sintetico.mjs";
import { estimativaDoSimulado, resultadoEstimado } from "../js/relatorio.js";

const N = Number(process.env.N || 1000);
const banco = montarBanco(gerarBancoSintetico({ porStep: 700, semente: 7 }), { origem: "validacao" });
const cenarios = [
  ["step1", "S1-A", "completo", 0], ["step2ck", "CK-A", "completo", 0], ["step1", "S1-A", "prontidao", 0],
  ["step1", "S1-A", "completo", 0.25], ["step1", "S1-A", "completo", -0.25],
  ["step1", "S1-A", "completo", 0.5], ["step1", "S1-A", "completo", -0.5]
];
const f3 = (x) => x.toFixed(3).replace(".", ",");
console.log("Step | formato | itens | viés | cobertura IC90 de θ | cobertura IC90 da distância ao limiar | Brier | precisão alta | trocados entre alta | indefinidos");
for (const [step, cod, tipo, vies] of cenarios) {
  const form = montarFormularioFixo(banco, step, cod, tipo);
  const ids = form.blocos.flat();
  const R = rng(20261029);
  let cobre = 0, cobreRel = 0, brier = 0, alta = 0, trocados = 0, indef = 0;
  for (let k = 0; k < N; k++) {
    const theta = normalAleatoria(R) * 0.8;
    const linhas = ids.map((id) => {
      const q = banco.porId.get(id);
      const x = R() < expit(theta - bDoItem(q) - vies);
      return { questao_id: id, step, resposta: x ? q.correta : "Z", correta: x, modo: "cronometrado", origem: "simulado", respondida_em: "2026-10-29T10:00:00Z" };
    });
    const est = estimativaDoSimulado({ form, linhas, porId: banco.porId });
    const y = theta > 0 ? 1 : 0;
    if (theta >= est.ic90[0] && theta <= est.ic90[1]) cobre++;
    if (theta >= est.ic90_relativo[0] && theta <= est.ic90_relativo[1]) cobreRel++;
    brier += (est.p_aprovacao - y) ** 2;
    if (resultadoEstimado(est, step).codigo === "indefinido") indef++;
    if (est.confianca.alta) { alta++; if ((est.p_aprovacao >= 0.5) !== (y === 1)) trocados++; }
  }
  console.log([step, tipo, ids.length, String(vies).replace(".", ","), f3(cobre / N), f3(cobreRel / N), f3(brier / N), alta, trocados + " (" + f3(trocados / Math.max(1, alta)) + ")", indef].join(" | "));
}
