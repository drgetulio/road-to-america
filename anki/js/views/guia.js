/* Road to America | "Como estudar": práticas com evidência, em poucas linhas */
import { e } from "../ui.js";
import { pageHead } from "./shared.js";

const PASSOS = [
  {
    t: "Teste-se em vez de reler",
    p: "Tentar lembrar antes de ver a resposta fixa mais que reler o mesmo texto. Em residentes de pediatria e emergência, testes repetidos com feedback renderam notas 13 pontos percentuais maiores que o estudo repetido seis meses depois da aula (39% contra 26%). Por isso o app mostra a frente primeiro e só revela o verso quando você pede.",
    ref: [3, 1, 2]
  },
  {
    t: "Deixe o intervalo trabalhar",
    p: "Espaçar as revisões rende mais que concentrá-las, e o intervalo ideal cresce com a distância até a prova. O FSRS calcula, card a card, quando você está perto de esquecer e agenda a revisão para esse momento.",
    ref: [4, 5, 7]
  },
  {
    t: "Revise todos os dias e corte os novos primeiro",
    p: "Faça as revisões mesmo nos dias sem cards novos. Pelo manual do Anki, 20 novos por dia, todos os dias, levam a cerca de 200 revisões diárias. Quando o atraso crescer, reduza os novos e mantenha as revisões; o app já pausa os novos quando as revisões passam do limite.",
    ref: [10]
  },
  {
    t: "Entenda antes de memorizar",
    p: "Assista à aula ou leia a apostila do tema e só depois libere os cards daquele sistema (Ajustes, sistemas liberados). Decorar o que você não entendeu produz cards que falham e viram leech.",
    ref: [9]
  },
  {
    t: "Responda com honestidade",
    p: "Esqueceu, aperte Errei. Difícil conta como acerto e, usado num card esquecido, estica todos os intervalos seguintes. A retenção real nas Estatísticas deve ficar perto da desejada; se ficar bem abaixo, revise esse hábito antes de mexer nas configurações.",
    ref: [10]
  },
  {
    t: "Misture os sistemas",
    p: "A prova embaralha os temas, e a intercalação rende mais quando as categorias são parecidas e o material é complexo, como fisiopatologia e farmacologia. O app alterna os sistemas a cada card. Para decorar termos isolados, estudar em bloco pode ser melhor.",
    ref: [8]
  },
  {
    t: "Um fato por card",
    p: "Pergunta curta, resposta única e o mecanismo no campo de explicação. Para transformar texto da apostila, use cloze e oculte o conceito-chave, nunca a palavra de que a frase depende. Evite listas num card só; prefira cards que perguntem a diferença entre dois diagnósticos parecidos. Ver o mesmo fato por ângulos diferentes (mecanismo, clínica, fármaco) é permitido.",
    ref: [9]
  },
  {
    t: "Trate os leeches",
    p: "Depois de 8 erros, o card é suspenso e marcado. Reescrever costuma resolver: simplifique, acrescente um mnemônico ou separe os dois fatos que se confundem. Se o card não compensa o tempo, apague o seu ou sinalize o oficial para a curadoria.",
    ref: [10]
  },
  {
    t: "Junte cards e questões",
    p: "Num estudo com 72 alunos, o número de cards únicos no Anki e o de questões no estilo da prova previram o escore do Step 1 cada um por conta própria. Os estudos sobre Anki e Step 1 são observacionais: mostram associação, não causa. Use os cards para manter a base e as questões para treinar o raciocínio.",
    ref: [6, 11]
  },
  {
    t: "Reta final, sono e exercício",
    p: "Faça as autoavaliações do NBME (CBSSA, compradas à parte) no ritmo padrão e marque a última para 1 a 2 semanas antes da prova, janela em que ela melhor previu o Pass ou Fail da primeira tentativa. Durma 7 horas ou mais com horário regular durante todo o preparo: as notas acompanham o sono da semana e do mês anteriores, não só o da véspera. Exercício aeróbico regular ajuda a cognição, embora o efeito de uma sessão isolada seja pequeno.",
    ref: [12, 13, 14, 15]
  }
];

const REFS = [
  ["Roediger HL, Karpicke JD. Test-enhanced learning: taking memory tests improves long-term retention. Psychol Sci. 2006;17(3):249-55.", "10.1111/j.1467-9280.2006.01693.x"],
  ["Karpicke JD, Roediger HL. The critical importance of retrieval for learning. Science. 2008;319(5865):966-8.", "10.1126/science.1152408"],
  ["Larsen DP, Butler AC, Roediger HL. Repeated testing improves long-term retention relative to repeated study: a randomised controlled trial. Med Educ. 2009;43(12):1174-81.", "10.1111/j.1365-2923.2009.03518.x"],
  ["Cepeda NJ, Pashler H, Vul E, Wixted JT, Rohrer D. Distributed practice in verbal recall tasks: a review and quantitative synthesis. Psychol Bull. 2006;132(3):354-80.", "10.1037/0033-2909.132.3.354"],
  ["Cepeda NJ, Vul E, Rohrer D, Wixted JT, Pashler H. Spacing effects in learning: a temporal ridgeline of optimal retention. Psychol Sci. 2008;19(11):1095-102.", "10.1111/j.1467-9280.2008.02209.x"],
  ["Deng F, Gluckstein JA, Larsen DP. Student-directed retrieval practice is a predictor of medical licensing examination performance. Perspect Med Educ. 2015;4(6):308-13.", "10.1007/s40037-015-0220-x"],
  ["Kerfoot BP, DeWolf WC, Masser BA, Church PA, Federman DD. Spaced education improves the retention of clinical knowledge by medical students: a randomised controlled trial. Med Educ. 2007;41(1):23-31.", "10.1111/j.1365-2929.2006.02644.x"],
  ["Brunmair M, Richter T. Similarity matters: a meta-analysis of interleaved learning and its moderators. Psychol Bull. 2019;145(11):1029-52.", "10.1037/bul0000209"],
  ["Wozniak PA. Effective learning: twenty rules of formulating knowledge. SuperMemo; 1999.", "", "https://www.supermemo.com/en/archives1990-2015/articles/20rules"],
  ["Anki Manual. Deck options and Leeches. Ankitects; consultado em outubro de 2026.", "", "https://github.com/ankitects/anki-manual"],
  ["Frappa N, Chernov D, Dillon M, Alben MG. Anki use and academic performance in medical education: a systematic review of evidence and learning theory. Med Sci Educ. 2026;36(2):1015-25.", "10.1007/s40670-026-02643-5"],
  ["Fan F, O'Donnell F, Morrison C, Durand L, Barone M. Revisiting the utility of the National Board of Medical Examiners Comprehensive Basic Science Self-Assessment to gauge readiness for USMLE Step 1. Med Sci Educ. 2025;35(1):149-55.", "10.1007/s40670-024-02155-0"],
  ["Okano K, Kaczmarzyk JR, Dave N, Gabrieli JDE, Grossman JC. Sleep quality, duration, and consistency are associated with better academic performance in college students. NPJ Sci Learn. 2019;4:16.", "10.1038/s41539-019-0055-z"],
  ["Diekelmann S, Born J. The memory function of sleep. Nat Rev Neurosci. 2010;11(2):114-26.", "10.1038/nrn2762"],
  ["Chang YK, Labban JD, Gapin JI, Etnier JL. The effects of acute exercise on cognitive performance: a meta-analysis. Brain Res. 2012;1453:87-101.", "10.1016/j.brainres.2012.02.068"]
];

export default {
  titulo: "Como estudar",
  async render(ctx, el) {
    el.innerHTML = '<div class="wrap section-sm guia">' +
      pageHead({ eyebrow: "Método", titulo: "Como estudar com os flashcards", lead: "Dez saídas da estrada, cada uma apoiada em estudo publicado. Os números entre colchetes levam às referências no fim da página." }) +
      '<ol class="exits">' + PASSOS.map((s, i) =>
        '<li class="exits__item"><span class="exit-sign" aria-hidden="true"><small>EXIT</small><b>' + (i + 1) + "</b></span>" +
        '<div><h2 class="exits__t">' + e(s.t) + '</h2><p class="body">' + e(s.p) + ' <span class="refs">' + [...s.ref].sort((a, b) => a - b).map((r) => '<a href="#ref-' + r + '" aria-label="Referência ' + r + '">[' + r + "]</a>").join("") + "</span></p></div></li>").join("") +
      "</ol>" +
      '<section class="panel" aria-labelledby="cfg-t"><div class="panel__head"><h2 class="h-sm" id="cfg-t">Configuração recomendada</h2></div>' +
        '<ul class="checklist">' +
          "<li>Retenção desejada de 90%, o padrão do Anki com FSRS. Acima disso o número de revisões cresce muito rápido e, acima de 97%, fica insustentável. Nas últimas semanas, suba um pouco só se o tempo diário permitir.</li>" +
          "<li>Passos de aprendizagem de 1 e 10 minutos; reaprendizagem de 10 minutos. Com o FSRS, nenhum passo deve chegar a 1 dia, porque o algoritmo cuida dos intervalos entre dias.</li>" +
          "<li>Ocultar irmãos ligado: as lacunas de uma mesma nota ficam para dias diferentes, para uma não entregar a resposta da outra.</li>" +
          "<li>Se você também usa o Anki desktop, otimize os parâmetros do FSRS uma vez por mês, depois de algumas centenas de revisões, e cole os números em Ajustes.</li>" +
        "</ul>" +
        '<p><a class="btn btn--ghost btn--sm" href="#/ajustes">Abrir ajustes</a></p>' +
      "</section>" +
      '<section class="refs-list" aria-labelledby="ref-t"><h2 class="h-sm" id="ref-t">Referências</h2><ol>' +
        REFS.map(([c, doi, url], i) => '<li id="ref-' + (i + 1) + '" lang="en">' + e(c) + (doi ? ' <a href="https://doi.org/' + e(doi) + '" target="_blank" rel="noopener">doi:' + e(doi) + "</a>" : url ? ' <a href="' + e(url) + '" target="_blank" rel="noopener">' + e(url.replace(/^https:\/\//, "")) + "</a>" : "") + "</li>").join("") +
      "</ol></section>" +
      "</div>";
  }
};
