/* Road to America | dia de prova do simulado completo (Step 1, Step 2 CK, meio
   formulário e avaliação de prontidão).

   O relógio oficial do dia (tutorial, blocos, saldo de pausa, débito de pausa,
   bloco encerrado que não reabre) é o de plataforma/js/formularios.js. Este módulo
   só acrescenta ao mesmo estado JSON o que a tela do bloco precisa e o relógio
   oficial não guarda:

   - sessao.ui: questão aberta, hora em que ela foi aberta (para o tempo por
     questão), alternativas riscadas, realces e avisos de 5 e 1 minuto do bloco
     atual. Recomeça a cada bloco, porque nada de um bloco encerrado muda;
   - sessao.notas: anotações por item ({ id: texto }), que voltam no relatório;
   - sessao.suspensa e sessao.suspensoes: "parar e continuar depois". Só existe
     entre blocos (na prova não se pausa um bloco). O tempo em que o dia ficou
     suspenso não conta como pausa. É um recurso de estudo da Road to America,
     fora do formato oficial, e o relatório informa quantas vezes o dia parou;
   - sessao.rev: contador de mudanças, para escolher entre a cópia do navegador e a
     da conta a mais recente.

   Regras de tempo que valem aqui:
   - o tempo de cada questão é o intervalo em que ela ficou aberta, sem passar do
     fim do bloco;
   - um bloco cujo tempo acabou com a página fechada é encerrado no instante em que
     o tempo acabou ("tempo") e o dia fica suspenso a partir dali, para que a
     ausência não consuma a pausa nem vire débito no bloco seguinte;
   - fechar a página durante a pausa, sem "parar", não suspende nada: a pausa
     continua correndo, como no centro de provas.

   Funções puras: recebem "agora" em milissegundos (ou Date) e devolvem um estado
   novo. Nada aqui toca o DOM. */
import {
  novaSessao, iniciarTutorial, iniciarBloco, encerrarBloco, estadoRelogio, responder as responderOficial
} from "../../plataforma/js/formularios.js";

const ms = (agora) => (agora instanceof Date ? agora.getTime() : typeof agora === "number" ? agora : Date.parse(agora));
const iso = (t) => new Date(t).toISOString();
const clone = (s) => JSON.parse(JSON.stringify(s));

export const AVISOS_BLOCO_MS = Object.freeze([60 * 1000, 5 * 60 * 1000]);
/* Bloco que acabou há mais que isto com a página fechada: o dia fica suspenso no fim do bloco */
export const TOLERANCIA_AUSENCIA_MS = 2 * 60 * 1000;
export const LIMITE_NOTA = 2000;

function tocar(s) { s.rev = (Number(s.rev) || 0) + 1; return s; }

function uiNova(s, form, t) {
  const n = form.blocos[s.bloco_atual].length;
  return {
    bloco: s.bloco_atual,
    atual: 0,
    entrou_em: iso(t),
    visitadas: Array.from({ length: n }, (_, i) => i === 0),
    riscadas: Array.from({ length: n }, () => []),
    realces: Array.from({ length: n }, () => ({ vinheta: [], pergunta: [] })),
    avisos: []
  };
}

export function criarDia(form) {
  return { ...novaSessao(form), notas: {}, suspensa: null, suspensoes: [], ui: null, rev: 0 };
}

/* Fim previsto do bloco atual (ms) */
export function fimDoBloco(s) {
  if (s.fase !== "bloco") return null;
  return Date.parse(s.relogio.bloco_inicio) + s.relogio.bloco_limite_ms;
}
export function restanteBloco(s, agora) {
  const f = fimDoBloco(s);
  return f === null ? 0 : Math.max(0, f - ms(agora));
}
export const blocoExpirou = (s, agora) => s.fase === "bloco" && ms(agora) >= fimDoBloco(s);

export function comecarTutorial(sessao, agora) {
  return tocar(iniciarTutorial(sessao, agora));
}

export function comecarBloco(sessao, form, agora) {
  if (sessao.suspensa) throw new Error("Retome o dia antes de iniciar o bloco.");
  const t = ms(agora);
  const s = iniciarBloco(sessao, t);
  s.ui = uiNova(s, form, t);
  return tocar(s);
}

/* Soma ao item aberto o tempo desde que ele foi aberto, sem passar do fim do bloco */
function acumular(s, t) {
  if (s.fase !== "bloco" || !s.ui) return;
  const ate = Math.min(t, fimDoBloco(s));
  const desde = Date.parse(s.ui.entrou_em);
  const delta = Math.max(0, ate - desde);
  const linha = s.respostas[s.bloco_atual][s.ui.atual];
  linha.tempo_ms = Math.max(0, Math.round((linha.tempo_ms || 0) + delta));
  s.ui.entrou_em = iso(Math.max(desde, ate));
}

function exigeBloco(s, t) {
  if (s.fase !== "bloco" || !s.ui) throw new Error("Não há bloco em andamento.");
  if (t !== undefined && t >= fimDoBloco(s)) throw new Error("O tempo do bloco acabou.");
}

export function irParaQuestao(sessao, i, agora) {
  const t = ms(agora);
  if (sessao.fase !== "bloco" || !sessao.ui) return sessao;
  const s = clone(sessao);
  acumular(s, t);
  const n = s.respostas[s.bloco_atual].length;
  const alvo = Math.max(0, Math.min(n - 1, Number(i) || 0));
  s.ui.atual = alvo;
  s.ui.visitadas[alvo] = true;
  return tocar(s);
}

export function escolherResposta(sessao, i, letra, agora) {
  const t = ms(agora);
  exigeBloco(sessao, t);
  return tocar(responderOficial(sessao, i, { resposta: letra ? String(letra).toUpperCase() : null }, t));
}

export function alternarMarcada(sessao, i, agora) {
  const t = ms(agora);
  exigeBloco(sessao, t);
  const atual = !!sessao.respostas[sessao.bloco_atual][i]?.marcada;
  return tocar(responderOficial(sessao, i, { marcada: !atual }, t));
}

export function alternarRisco(sessao, i, letra) {
  exigeBloco(sessao);
  const s = clone(sessao);
  const L = String(letra).toUpperCase();
  const lista = s.ui.riscadas[i];
  const k = lista.indexOf(L);
  if (k >= 0) lista.splice(k, 1); else lista.push(L);
  lista.sort();
  return tocar(s);
}

export function definirRealces(sessao, i, realces) {
  exigeBloco(sessao);
  const s = clone(sessao);
  s.ui.realces[i] = { vinheta: [...(realces?.vinheta || [])], pergunta: [...(realces?.pergunta || [])] };
  return tocar(s);
}

/* Anotação do item (só no bloco atual, como na prova; fica para o relatório) */
export function definirNotaItem(sessao, form, i, texto) {
  exigeBloco(sessao);
  const s = clone(sessao);
  const id = form.blocos[s.bloco_atual][i];
  const t = String(texto || "").slice(0, LIMITE_NOTA);
  if (!s.notas) s.notas = {};
  if (t) s.notas[id] = t; else delete s.notas[id];
  return tocar(s);
}

/* Aviso de 5 e de 1 minuto: devolve { sessao, marco } com o aviso que acabou de vencer */
export function avisoDoBloco(sessao, agora) {
  if (sessao.fase !== "bloco" || !sessao.ui) return { sessao, marco: null };
  const resta = restanteBloco(sessao, agora);
  for (const marco of AVISOS_BLOCO_MS) {
    if (resta <= marco && resta > 0 && !sessao.ui.avisos.includes(marco)) {
      const s = clone(sessao);
      for (const m of AVISOS_BLOCO_MS) if (m >= marco && !s.ui.avisos.includes(m)) s.ui.avisos.push(m);
      return { sessao: tocar(s), marco };
    }
  }
  return { sessao, marco: null };
}

/* Encerra o bloco atual (pelo participante ou pelo tempo). A sobra vai para a pausa. */
export function fecharBloco(sessao, agora, motivo = "participante") {
  if (sessao.fase !== "bloco") throw new Error("Não há bloco em andamento.");
  const fim = fimDoBloco(sessao);
  const t = Math.min(ms(agora), fim);
  const porTempo = motivo === "tempo" || ms(agora) >= fim;
  const s = clone(sessao);
  acumular(s, t);
  const out = encerrarBloco(s, porTempo ? fim : t, porTempo ? "tempo" : "participante");
  out.ui = null;
  return tocar(out);
}

/* Ao abrir a página: fecha o bloco cujo tempo acabou com a página fechada. Se a
   ausência passou da tolerância e ainda há blocos, o dia fica suspenso no fim do
   bloco. Devolve { sessao, fechou: bool, suspendeu: bool }. */
export function sincronizar(sessao, agora) {
  const t = ms(agora);
  if (!blocoExpirou(sessao, t)) return { sessao, fechou: false, suspendeu: false };
  const fim = fimDoBloco(sessao);
  let s = fecharBloco(sessao, fim, "tempo");
  let suspendeu = false;
  if (s.fase === "intervalo" && t - fim > TOLERANCIA_AUSENCIA_MS) {
    s = clone(s);
    s.suspensa = { desde: iso(fim), automatica: true };
    suspendeu = true;
    tocar(s);
  }
  return { sessao: s, fechou: true, suspendeu };
}

export const podeSuspender = (s) => s.fase === "intervalo" && !s.suspensa;

export function suspender(sessao, agora) {
  if (!podeSuspender(sessao)) throw new Error(sessao.suspensa ? "O dia já está suspenso." : "Só é possível parar entre blocos.");
  const s = clone(sessao);
  s.suspensa = { desde: iso(ms(agora)), automatica: false };
  return tocar(s);
}

/* Retoma o dia: o tempo suspenso não conta na pausa (a pausa recomeça de onde parou) */
export function retomar(sessao, agora) {
  if (!sessao.suspensa) return sessao;
  const t = ms(agora);
  const s = clone(sessao);
  const desde = Date.parse(s.suspensa.desde);
  const dur = Math.max(0, t - desde);
  if (s.fase === "intervalo" && s.relogio.fase_desde) s.relogio.fase_desde = iso(Date.parse(s.relogio.fase_desde) + dur);
  (s.suspensoes ||= []).push({ desde: s.suspensa.desde, ate: iso(t), automatica: !!s.suspensa.automatica });
  s.suspensa = null;
  return tocar(s);
}

export function tempoSuspenso(s, agora) {
  let total = (s.suspensoes || []).reduce((a, x) => a + Math.max(0, Date.parse(x.ate) - Date.parse(x.desde)), 0);
  if (s.suspensa) total += Math.max(0, ms(agora) - Date.parse(s.suspensa.desde));
  return total;
}

/* Leitura do relógio do dia para a tela. Durante a suspensão, o relógio fica parado
   no instante em que o dia parou. */
export function relogioDoDia(s, form, agora) {
  const t = ms(agora);
  const congelado = s.suspensa ? Date.parse(s.suspensa.desde) : t;
  const est = estadoRelogio(s, congelado);
  const ref = s.fase === "concluido" && s.fim ? Date.parse(s.fim) : t;
  const decorrido = s.inicio ? Math.max(0, ref - Date.parse(s.inicio) - tempoSuspenso(s, ref)) : 0;
  return {
    ...est,
    suspensa: !!s.suspensa,
    dia_decorrido_ms: decorrido,
    dia_total_ms: form.tempo.dia_ms,
    dia_restante_ms: Math.max(0, form.tempo.dia_ms - decorrido)
  };
}

/* Resumo do dia para o fim da prova e o relatório */
export function resumoDoDia(s, form) {
  const r = s.relogio;
  const usado = s.encerramentos.reduce((a, x) => a + x.usado_ms, 0);
  return {
    blocos: form.blocos.length,
    blocos_encerrados: s.blocos_encerrados,
    tempo_em_blocos_ms: usado,
    sobra_blocos_ms: r.sobra_blocos_ms,
    tutorial_usado_ms: r.tutorial_usado_ms,
    tutorial_ms: r.tutorial_ms,
    pausa_inicial_ms: r.pausa_inicial_ms,
    pausa_usada_ms: r.pausa_usada_ms,
    pausa_disponivel_ms: r.pausa_inicial_ms + r.sobra_blocos_ms + Math.max(0, r.tutorial_ms - r.tutorial_usado_ms),
    debito_ms: r.debito_ms,
    encerrados_por_tempo: s.encerramentos.filter((x) => x.motivo === "tempo").length,
    suspensoes: (s.suspensoes || []).length + (s.suspensa ? 1 : 0),
    tempo_suspenso_ms: tempoSuspenso(s, s.fim ? Date.parse(s.fim) : Date.now()),
    dia_ms: s.inicio && s.fim ? Math.max(0, Date.parse(s.fim) - Date.parse(s.inicio) - tempoSuspenso(s, Date.parse(s.fim))) : null,
    dia_previsto_ms: form.tempo.dia_ms
  };
}

/* Escolhe entre a cópia da conta e a do navegador (gravada a cada mudança). A do
   navegador só vence se for do mesmo formulário, mais nova e não reabrir bloco. */
export function maisRecente(remota, local) {
  if (!local) return remota;
  if (!remota) return local;
  if (local.formulario_id !== remota.formulario_id) return remota;
  if ((Number(local.rev) || 0) <= (Number(remota.rev) || 0)) return remota;
  if ((local.bloco_atual ?? 0) < (remota.bloco_atual ?? 0)) return remota;
  for (let i = 0; i < (remota.bloco_atual ?? 0); i++) {
    if (JSON.stringify(local.respostas?.[i]) !== JSON.stringify(remota.respostas?.[i])) return remota;
  }
  return local;
}
