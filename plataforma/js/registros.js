/* Road to America | validação dos registros do banco de questões, usada pelas duas
   camadas de dados (LocalStore e SupabaseStore) antes de gravar. As mesmas regras
   valem no banco (supabase/schema.sql, seção BANCO DE QUESTÕES).
   Funções puras: devolvem listas de mensagens em português (vazia = válido) ou o
   registro normalizado. */

export const ID_QUESTAO = /^[A-Za-z0-9._-]{1,40}$/;
export const MODOS_RESPOSTA = Object.freeze(["tutor", "cronometrado"]);
export const ORIGENS_RESPOSTA = Object.freeze(["banco", "simulado", "bloco_30"]);
export const ESTADOS_SIMULADO = Object.freeze(["em_andamento", "concluido", "abandonado"]);
export const TIPOS_SIMULADO = Object.freeze(["completo", "meio", "prontidao"]);
export const STATUS_REPORTE = Object.freeze(["aberto", "em_analise", "resolvido", "rejeitado"]);
export const MOTIVOS_REPORTE = Object.freeze({
  gabarito: "Gabarito errado",
  mais_de_uma_correta: "Mais de uma alternativa defensável",
  desatualizado: "Conteúdo desatualizado (diretriz nova)",
  erro_texto: "Erro de digitação ou de unidade",
  valores_lab: "Valor laboratorial ou faixa de referência",
  explicacao: "Explicação incompleta ou errada",
  outro: "Outro"
});
export const LIMITE_ANOTACAO_ITEM = 5000;
export const LIMITE_REPORTE = 2000;
export const MAX_BLOCOS = 16;
export const MAX_ITENS_BLOCO = 20;
/* Data a partir da qual o padrão do Step 2 CK é 218 (antes era 214):
   https://usmle.org/scores-transcripts/examination-results-and-scoring */
export const PADRAO_CK_DESDE = "2025-07-01";

const agoraMs = (agora) => (agora instanceof Date ? agora.getTime() : Number.isFinite(agora) ? agora : Date.now());

/* ---------- respostas por item ---------- */
export function normalizarResposta(r) {
  const resp = r?.resposta === null || r?.resposta === undefined || r?.resposta === "" ? null : String(r.resposta).toUpperCase();
  const int = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    questao_id: String(r?.questao_id || ""),
    step: r?.step,
    resposta: resp,
    correta: !!r?.correta,
    tempo_ms: Math.max(0, Math.round(Number(r?.tempo_ms) || 0)),
    marcada: !!r?.marcada,
    modo: r?.modo || "cronometrado",
    origem: r?.origem || "banco",
    sessao_id: r?.sessao_id ? String(r.sessao_id) : null,
    bloco: int(r?.bloco),
    posicao: int(r?.posicao),
    versao_item: int(r?.versao_item),
    respondida_em: r?.respondida_em ? new Date(r.respondida_em).toISOString() : new Date().toISOString()
  };
}
export function validarResposta(r, agora = Date.now()) {
  const e = [];
  if (!r || typeof r !== "object") return ["Resposta vazia."];
  if (!ID_QUESTAO.test(r.questao_id || "")) e.push("Identificador de questão inválido.");
  if (!["step1", "step2ck"].includes(r.step)) e.push("Step inválido.");
  if (r.resposta !== null && !/^[A-J]$/.test(r.resposta)) e.push("Alternativa inválida.");
  if (!MODOS_RESPOSTA.includes(r.modo)) e.push("Modo inválido (tutor ou cronometrado).");
  if (!ORIGENS_RESPOSTA.includes(r.origem)) e.push("Origem inválida (banco, simulado ou bloco_30).");
  if (!Number.isInteger(r.tempo_ms) || r.tempo_ms < 0 || r.tempo_ms > 86400000) e.push("Tempo inválido.");
  for (const k of ["bloco", "posicao"]) if (r[k] !== null && (!Number.isInteger(r[k]) || r[k] < 0 || r[k] > 40)) e.push("Posição no simulado inválida.");
  if (r.sessao_id && r.sessao_id.length > 64) e.push("Identificador de sessão longo demais.");
  const t = Date.parse(r.respondida_em);
  if (!Number.isFinite(t)) e.push("Data da resposta inválida.");
  else if (t > agoraMs(agora) + 5 * 60000) e.push("A data da resposta não pode estar no futuro.");
  return e;
}

/* ---------- simulado completo ---------- */
export function validarFormularioGravado(f) {
  const e = [];
  if (!f || typeof f !== "object") return ["Formulário vazio."];
  if (!["step1", "step2ck"].includes(f.step)) e.push("Step inválido.");
  if (!TIPOS_SIMULADO.includes(f.tipo)) e.push("Tipo de formulário inválido.");
  if (!Array.isArray(f.blocos) || !f.blocos.length || f.blocos.length > MAX_BLOCOS) e.push("O formulário precisa ter de 1 a " + MAX_BLOCOS + " blocos.");
  else {
    if (f.blocos.some((b) => !Array.isArray(b) || !b.length || b.length > MAX_ITENS_BLOCO)) e.push("Cada bloco precisa ter de 1 a " + MAX_ITENS_BLOCO + " itens.");
    const ids = f.blocos.flat();
    if (ids.some((id) => !ID_QUESTAO.test(String(id)))) e.push("Há identificador de questão inválido no formulário.");
    if (new Set(ids).size !== ids.length) e.push("Há questões repetidas no formulário.");
  }
  if (!f.id || String(f.id).length > 120) e.push("Identificador do formulário ausente ou longo demais.");
  return e;
}
export function validarSessao(form, s) {
  const e = [];
  if (!s || typeof s !== "object") return ["Estado do simulado vazio."];
  if (!Array.isArray(s.respostas) || s.respostas.length !== form.blocos.length) e.push("As respostas precisam ter uma lista por bloco.");
  else if (s.respostas.some((b, i) => !Array.isArray(b) || b.length !== form.blocos[i].length)) e.push("Cada bloco precisa ter uma resposta por questão.");
  else if (s.respostas.flat().some((r) => r && r.resposta !== null && !/^[A-J]$/.test(String(r.resposta)))) e.push("Alternativa inválida nas respostas.");
  if (!Number.isInteger(s.bloco_atual) || s.bloco_atual < 0 || s.bloco_atual > form.blocos.length) e.push("Bloco atual inválido.");
  return e;
}
/* Igualdade de JSON sem depender da ordem das chaves (o jsonb do Postgres reordena) */
export function jsonCanonico(v) {
  if (Array.isArray(v)) return "[" + v.map(jsonCanonico).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + jsonCanonico(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}
/* Um bloco encerrado não reabre: as respostas dos blocos anteriores ao bloco atual
   gravado não mudam, e o bloco atual não volta. */
export function validarProgresso(anterior, nova) {
  const e = [];
  const a = anterior || {}, n = nova || {};
  if ((n.bloco_atual ?? 0) < (a.bloco_atual ?? 0)) e.push("Um bloco encerrado não reabre.");
  /* as condições de aplicação (oficiais ou estudo) são escolhidas antes do início e não mudam */
  if (a.condicoes && n.condicoes !== a.condicoes) e.push("As condições do dia (oficiais ou estudo) não mudam depois de escolhidas.");
  for (let i = 0; i < Math.min(a.bloco_atual ?? 0, a.respostas?.length ?? 0); i++) {
    if (jsonCanonico(a.respostas[i]) !== jsonCanonico(n.respostas?.[i])) { e.push("As respostas de um bloco encerrado não podem mudar."); break; }
  }
  return e;
}

/* ---------- anotações e reportes ---------- */
export function validarAnotacaoItem(questaoId, texto) {
  const e = [];
  if (!ID_QUESTAO.test(String(questaoId || ""))) e.push("Identificador de questão inválido.");
  if (String(texto ?? "").length > LIMITE_ANOTACAO_ITEM) e.push("A anotação tem no máximo " + LIMITE_ANOTACAO_ITEM + " caracteres.");
  return e;
}
export function validarReporte(x) {
  const e = [];
  if (!ID_QUESTAO.test(String(x?.questao_id || ""))) e.push("Identificador de questão inválido.");
  if (!(x?.motivo in MOTIVOS_REPORTE)) e.push("Escolha o motivo do reporte.");
  const t = String(x?.texto ?? "").trim();
  if (t.length > LIMITE_REPORTE) e.push("O texto tem no máximo " + LIMITE_REPORTE + " caracteres.");
  if (x?.motivo === "outro" && !t) e.push("Descreva o problema.");
  return e;
}

/* ---------- resultados oficiais (desfechos) ----------
   Step 1: resultado "pass" | "fail" (sem nota). Step 2 CK: nota de três dígitos e/ou
   resultado; sem resultado, ele é derivado da nota para provas a partir de
   01/07/2025 (padrão de 218). */
export function normalizarResultadoOficial(x) {
  const escore = x?.escore === null || x?.escore === undefined || x?.escore === "" ? null : Number(x.escore);
  let resultado = x?.resultado === "pass" || x?.resultado === "fail" ? x.resultado : null;
  const data = String(x?.data || "").slice(0, 10);
  if (!resultado && x?.step === "step2ck" && Number.isInteger(escore) && data >= PADRAO_CK_DESDE) resultado = escore >= 218 ? "pass" : "fail";
  return { user_id: x?.user_id || null, step: x?.step, data, resultado, escore, observacao: String(x?.observacao || "").trim() };
}
export function validarResultadoOficial(x, agora = Date.now()) {
  const e = [];
  const r = normalizarResultadoOficial(x);
  if (!r.user_id) e.push("Escolha o participante.");
  if (!["step1", "step2ck"].includes(r.step)) e.push("Step inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data) || !Number.isFinite(Date.parse(r.data))) e.push("Data inválida (use AAAA-MM-DD).");
  else if (Date.parse(r.data) > agoraMs(agora) + 2 * 86400000) e.push("A data da prova não pode estar no futuro.");
  if (r.step === "step1" && r.escore !== null) e.push("O Step 1 informa só Pass ou Fail, sem nota.");
  if (r.escore !== null && (!Number.isInteger(r.escore) || r.escore < 1 || r.escore > 999)) e.push("Nota inválida (inteiro de 1 a 999).");
  if (!r.resultado && r.escore === null) e.push("Informe o resultado ou a nota.");
  if (!r.resultado && r.step === "step2ck") e.push("Informe Pass ou Fail para provas anteriores a 01/07/2025.");
  /* resultado informado que a nota contradiz (desde 01/07/2025 a nota define o Pass) */
  if (r.step === "step2ck" && Number.isInteger(r.escore) && r.data >= PADRAO_CK_DESDE && r.resultado && r.resultado !== (r.escore >= 218 ? "pass" : "fail"))
    e.push("A nota " + r.escore + " não combina com " + (r.resultado === "pass" ? "Pass" : "Fail") + ": desde 01/07/2025 o padrão de aprovação do Step 2 CK é 218.");
  if (r.observacao.length > 1000) e.push("A observação tem no máximo 1000 caracteres.");
  return e;
}

/* ---------- calibração gravada pelo admin ---------- */
export function validarCalibracao(itens) {
  const e = [];
  if (!Array.isArray(itens) || !itens.length) return ["Nenhum item para gravar."];
  for (const it of itens) {
    if (!ID_QUESTAO.test(String(it?.id || ""))) { e.push("Identificador inválido na calibração."); break; }
    if (it.b !== null && (!Number.isFinite(it.b) || Math.abs(it.b) > 10)) { e.push("Dificuldade calibrada inválida em " + it.id + "."); break; }
  }
  return e;
}
