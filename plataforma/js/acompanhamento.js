/* Road to America | textos e listas de acompanhamento compartilhados pela área
   administrativa (admin/) e pela tela "Meu progresso" do app de flashcards.
   Funções puras: recebem a linha de resumo e a avaliação de desempenho.js e
   devolvem rótulos, o checklist da garantia e a leitura da prontidão (EXIT 18).
   Nenhuma regra nova de garantia ou de risco mora aqui: as regras continuam em
   desempenho.js; este módulo só organiza o que a tela mostra. */
import { CONFIG_PADRAO, mergeConfig, parseData } from "./desempenho.js";

export const NOME_STEP = Object.freeze({ step1: "Step 1", step2ck: "Step 2 CK" });

/* Nomes curtos dos sistemas e disciplinas do Step 1 (mesmos de anki/data/taxonomia.json),
   usados quando a taxonomia não foi carregada */
export const NOMES_STEP1 = Object.freeze({
  desenvolvimento_humano: "Desenvolvimento humano",
  sangue_imune: "Sangue e imune",
  comportamento_nervoso: "Nervoso e comportamento",
  musculoesqueletico_pele: "Musculoesquelético e pele",
  cardiovascular: "Cardiovascular",
  respiratorio_renal: "Respiratório e renal",
  gastrointestinal: "Gastrointestinal",
  reprodutor_endocrino: "Reprodutor e endócrino",
  multissistemico: "Multissistêmico",
  bioestatistica: "Bioestatística e epidemiologia",
  ciencias_sociais: "Ciências sociais e comunicação",
  geral: "Conceitos transversais",
  patologia: "Patologia",
  fisiologia: "Fisiologia",
  anatomia: "Anatomia e embriologia",
  microbiologia: "Microbiologia",
  farmacologia: "Farmacologia",
  comportamental: "Ciências do comportamento",
  bioquimica: "Bioquímica e nutrição",
  histologia: "Histologia e biologia celular",
  imunologia: "Imunologia",
  genetica: "Genética",
  nutricao: "Nutrição",
  facil: "Fácil",
  media: "Média",
  dificil: "Difícil"
});

/* Rótulos das áreas e tarefas do banco do Step 2 CK (o Step 1 usa a taxonomia do app) */
export const NOMES_STEP2CK = Object.freeze({
  medicina_interna: "Medicina interna",
  pediatria: "Pediatria",
  cirurgia: "Cirurgia",
  ginecologia_obstetricia: "Ginecologia e obstetrícia",
  psiquiatria: "Psiquiatria",
  neurologia: "Neurologia",
  emergencia: "Emergência",
  medicina_preventiva: "Medicina preventiva",
  etica_comunicacao: "Ética e comunicação",
  bioestatistica: "Bioestatística",
  manejo: "Manejo",
  diagnostico: "Diagnóstico",
  mecanismo: "Mecanismo",
  prevencao: "Prevenção",
  etica: "Ética"
});

/* Nome legível de uma chave de sistema, disciplina, área ou tarefa.
   tax: taxonomia do app (buildTaxonomy), opcional. */
export function nomeArea(chave, { step = "step1", tax = null } = {}) {
  if (!chave) return "";
  if (step === "step2ck" && NOMES_STEP2CK[chave]) return NOMES_STEP2CK[chave];
  if (tax) {
    const s = tax.sistemas?.find?.((x) => x.chave === chave) || tax.disciplinas?.find?.((x) => x.chave === chave);
    if (s) return s.nome_curto || s.nome_pt;
  }
  if (step !== "step2ck" && NOMES_STEP1[chave]) return NOMES_STEP1[chave];
  if (NOMES_STEP2CK[chave]) return NOMES_STEP2CK[chave];
  if (NOMES_STEP1[chave]) return NOMES_STEP1[chave];
  const t = String(chave).replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---------- Formatação ---------- */
export function pct(x, casas = 0) {
  if (x === null || x === undefined || !Number.isFinite(Number(x))) return "sem dado";
  return (Number(x) * 100).toFixed(casas).replace(".", ",") + "%";
}
/* "AAAA-MM-DD" ou ISO -> "28/10/2026" */
export function dataBR(s) {
  if (!s) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? parseData(s) : new Date(s);
  if (!d || !Number.isFinite(d.getTime())) return "";
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
}
export function plural(n, um, varios) {
  return n + " " + (Math.abs(n) === 1 ? um : varios);
}

/* Step em preparação agora: o primeiro ainda não aprovado */
export function stepAtual(linha) {
  if (!linha?.plano?.step1_aprovado) return "step1";
  if (!linha?.plano?.step2ck_aprovado) return "step2ck";
  return "concluido";
}

/* ---------- Situação da garantia hoje ----------
   desempenho.js diz se as condições do Termo estão cumpridas (cumpre). Como a
   garantia só é pedida ao fim do prazo, quase todos aparecem como "ainda_nao"
   no começo do curso. Para o acompanhamento, a pergunta útil é outra: o
   participante está no ritmo de cumprir? Daí as situações:
   - "cumprida": condições cumpridas e NBMEs verificadas (cumpre = "sim");
   - "verificar": condições cumpridas, falta a equipe verificar NBMEs;
   - "atrasada": presença abaixo do mínimo, ou Step com prova a menos de
     nbme_antecedencia_dias e sem as NBMEs mínimas (critério nbme_insuficiente);
   - "sem_presenca": nenhuma presença lançada ainda;
   - "em_dia": presença no mínimo e NBMEs no ritmo da data de prova. */
export const ROTULO_SITUACAO_GARANTIA = Object.freeze({
  cumprida: "Cumprida",
  verificar: "Falta verificar NBME",
  em_dia: "Em dia",
  atrasada: "Atrasada",
  sem_presenca: "Sem presença lançada"
});

export function situacaoGarantia(av) {
  const g = av.garantia;
  if (g.cumpre === "sim") return "cumprida";
  if (g.cumpre === "pendente_verificacao") return "verificar";
  const nbAtraso = (av.riscos || []).some((r) => r.codigo === "nbme_insuficiente");
  if (g.presenca.cumpre === false || nbAtraso) return "atrasada";
  if (g.presenca.cumpre === null) return "sem_presenca";
  return "em_dia";
}

/* ---------- Checklist da garantia (garantia.html) ----------
   Devolve itens { chave, ok: true | false | null, titulo, detalhe }.
   ok null = ainda sem dado para dizer. */
export function checklistGarantia(linha, av, { config = CONFIG_PADRAO, participante = false } = {}) {
  const c = mergeConfig(config);
  const g = av.garantia;
  const itens = [];
  const voce = participante;

  const p = g.presenca;
  const minPres = pct(c.presenca_minima);
  if (p.cumpre === null) {
    itens.push({ chave: "presenca", ok: null, titulo: "Pelo menos " + minPres + " das aulas assistidas",
      detalhe: voce ? "A equipe ainda não lançou a sua presença." : "Presença ainda não lançada." });
  } else {
    itens.push({ chave: "presenca", ok: p.cumpre, titulo: "Pelo menos " + minPres + " das aulas assistidas",
      detalhe: p.aulas_assistidas + " de " + p.aulas_totais + " aulas (" + pct(p.percentual) + ")" +
        (p.cumpre ? "." : "; faltam " + plural(p.faltam_aulas, "aula", "aulas") + " para chegar a " + minPres + " com o total atual.") });
  }

  for (const step of ["step1", "step2ck"]) {
    const n = g.nbme[step];
    const titulo = "Duas autoavaliações oficiais do NBME do " + NOME_STEP[step];
    if (!n.exigido) {
      itens.push({ chave: "nbme_" + step, ok: true, titulo, detalhe: NOME_STEP[step] + " aprovado: a condição não se aplica." });
      continue;
    }
    let det = n.lancados >= n.minimo ? plural(n.lancados, "lançada", "lançadas") + " (mínimo " + n.minimo + ")" : n.lancados + " de " + n.minimo + " lançadas";
    if (n.lancados) det += ", " + plural(n.verificados, "verificada", "verificadas") + " pela equipe";
    det += ".";
    if (n.pendente_verificacao) det += voce ? " A equipe ainda vai conferir os relatórios." : " Falta verificar.";
    itens.push({ chave: "nbme_" + step, ok: n.cumpre, titulo, detalhe: det });
  }

  const anos = Math.round(c.garantia_anos);
  if (!g.prazo) {
    itens.push({ chave: "prazo", ok: null, titulo: "Prazo de " + anos + " anos a partir da matrícula",
      detalhe: voce ? "A data da sua matrícula ainda não foi lançada pela equipe." : "Data de matrícula não lançada: o prazo não pode ser calculado." });
  } else {
    const desde = linha.plano?.ciclo_basico_concluido_em && linha.plano.ciclo_basico_concluido_em === g.prazo.inicio
      ? "da conclusão do ciclo básico" : "da matrícula";
    const d = g.prazo.dias_restantes;
    itens.push({ chave: "prazo", ok: d >= 0, titulo: "Prazo de " + anos + " anos a partir " + desde,
      detalhe: "De " + dataBR(g.prazo.inicio) + " a " + dataBR(g.prazo.fim) + (d >= 0 ? "; faltam " + plural(d, "dia", "dias") + "." : "; prazo encerrado há " + plural(-d, "dia", "dias") + ".") });
  }
  return itens;
}

/* ---------- Prontidão para manter a data (EXIT 18) ----------
   Texto para a tela a partir de avaliarParticipante().prontidao[step]. */
export const ROTULO_PRONTIDAO = Object.freeze({
  pronto: "Critério atendido",
  nao_pronto: "Critério não atendido",
  insuficiente: "Dados insuficientes",
  aprovado: "Step aprovado"
});

export function leituraProntidao(pr, linha, step, { config = CONFIG_PADRAO, agora = new Date() } = {}) {
  const c = mergeConfig(config);
  const prova = parseData(linha?.plano?.["data_prova_" + step]);
  const dias = prova ? Math.round((prova.setHours(12, 0, 0, 0) - new Date(agora).setHours(12, 0, 0, 0)) / 86400000) : null;
  const avisos = [];
  if (pr.status === "pronto" && !pr.faixa_confirmada) avisos.push("A faixa provável de escore não foi informada nas duas autoavaliações: confira no relatório se ela está inteira acima da faixa de aprovação baixa.");
  if (pr.status !== "aprovado" && dias !== null && dias >= 0 && dias <= 14) avisos.push("Prova em " + plural(dias, "dia", "dias") + ": é o momento da decisão de manter ou adiar a data (EXIT 18).");
  return {
    status: pr.status,
    rotulo: ROTULO_PRONTIDAO[pr.status] || pr.status,
    criterio: "Duas autoavaliações seguidas, em standard-paced, com probabilidade de aprovação de " + c.meta_probabilidade + "% ou mais e faixa provável de escore inteira acima da faixa de aprovação baixa.",
    motivo: pr.motivo || (pr.status === "pronto" ? "As duas últimas autoavaliações atendem ao critério." : ""),
    consideradas: pr.consideradas || [],
    dias_para_prova: dias,
    avisos
  };
}
