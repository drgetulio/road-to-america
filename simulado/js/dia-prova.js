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
   - fechar a página durante a pausa, sem "parar", não suspende nada enquanto
     houver saldo: a pausa continua correndo, como no centro de provas. Se a volta
     acontece mais de 2 minutos depois de o saldo acabar, o dia fica parado no
     instante em que o saldo acabou; com a página aberta, a pausa além do saldo vira
     débito no bloco seguinte até 10 minutos, e depois disso o dia para. Sem essa
     regra, uma pausa esquecida zeraria o tempo de todos os blocos seguintes;
   - tutorial deixado aberto além dos 5 minutos: o excesso gasta a pausa e segue a
     mesma regra da pausa; ao parar, o tutorial é encerrado antes do bloco 1.

   Condições de aplicação (sessao.condicoes), escolhidas antes de começar:
   - "oficiais": como no centro de provas. Não há "parar e continuar depois", o dia
     nunca para sozinho e toda pausa além do saldo sai dos blocos seguintes, com a
     página aberta ou fechada. Só este modo conta como condições padronizadas (como o
     standard-paced do NBME) e entra na estimativa de prontidão do relatório;
   - "estudo": as regras de parada descritas acima. O relatório marca o dia como
     não padronizado.

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

export const CONDICOES = Object.freeze(["oficiais", "estudo"]);
export function criarDia(form, { condicoes = "estudo" } = {}) {
  return { ...novaSessao(form), notas: {}, suspensa: null, suspensoes: [], ui: null, rev: 0, condicoes: CONDICOES.includes(condicoes) ? condicoes : "estudo" };
}
export const emCondicoesOficiais = (s) => s?.condicoes === "oficiais";
/* Dia em condições padronizadas: condições oficiais escolhidas e nenhuma parada */
export function condicoesPadronizadas(s) {
  return emCondicoesOficiais(s) && !(s.suspensoes || []).length && !s.suspensa;
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

/* Pausa além do saldo com a página aberta: até este limite vira débito no bloco
   seguinte, como na prova; passou dele, o dia para (critério interno, para que uma
   pausa esquecida não zere os blocos seguintes) */
export const EXCEDENTE_MAX_MS = 10 * 60 * 1000;

/* Instante em que o saldo de pausa acabou (fase "intervalo") */
function fimDoSaldo(s) { return Date.parse(s.relogio.fase_desde) + s.relogio.pausa_saldo_ms; }

/* Ao abrir a página (e a cada segundo na pausa): resolve o tempo que correu sem
   ninguém na tela. Devolve { sessao, fechou, suspendeu, motivo }.
   - bloco cujo tempo acabou com a página fechada: fecha no fim do tempo; se a
     ausência passou da tolerância e ainda há blocos, o dia para no fim do bloco;
   - pausa que passou do saldo além da tolerância (página fechada) ou além de
     EXCEDENTE_MAX_MS (página aberta): o dia para; com a página fechada, no instante
     em que o saldo acabou (a ausência não vira débito); com a página aberta, depois
     de EXCEDENTE_MAX_MS de débito;
   - tutorial aberto além de 5 minutos: o excesso gasta a pausa, como na prova, e
     segue a mesma regra da pausa (página fechada: para quando o saldo zerou; página
     aberta: débito até EXCEDENTE_MAX_MS). Ao parar, o tutorial é encerrado e o dia
     fica parado antes do bloco 1. */
export function sincronizar(sessao, agora, { paginaAberta = false } = {}) {
  const t = ms(agora);
  const nada = { sessao, fechou: false, suspendeu: false, motivo: null };
  if (sessao.suspensa) return nada;
  /* condições oficiais: o dia nunca para; pausa e tutorial além do saldo viram débito
     (o relógio oficial cobra ao iniciar o bloco seguinte) e o bloco vencido fecha no
     fim do tempo */
  if (emCondicoesOficiais(sessao)) {
    if (!blocoExpirou(sessao, t)) return nada;
    return { sessao: fecharBloco(sessao, fimDoBloco(sessao), "tempo"), fechou: true, suspendeu: false, motivo: null };
  }
  if (sessao.fase === "intervalo" && sessao.relogio.fase_desde) {
    const zero = fimDoSaldo(sessao);
    const limite = paginaAberta ? EXCEDENTE_MAX_MS : TOLERANCIA_AUSENCIA_MS;
    if (t - zero <= limite) return nada;
    const s = clone(sessao);
    s.suspensa = { desde: iso(paginaAberta ? zero + EXCEDENTE_MAX_MS : zero), automatica: true, motivo: "pausa" };
    return { sessao: tocar(s), fechou: false, suspendeu: true, motivo: "pausa" };
  }
  if (sessao.fase === "tutorial" && sessao.relogio.fase_desde) {
    /* o tempo além dos 5 minutos do tutorial gasta a pausa (relógio oficial). Página
       fechada: passados 2 minutos do fim do saldo, o dia para quando o saldo zerou.
       Página aberta: o débito vai até EXCEDENTE_MAX_MS e o dia para ali. Ao parar, o
       tutorial é fechado no instante da parada e o dia fica em pausa antes do bloco 1. */
    const r0 = sessao.relogio;
    const zero = Date.parse(r0.fase_desde) + r0.tutorial_ms + r0.pausa_saldo_ms;
    const limite = paginaAberta ? EXCEDENTE_MAX_MS : TOLERANCIA_AUSENCIA_MS;
    if (t - zero <= limite) return nada;
    const corte = paginaAberta ? zero + EXCEDENTE_MAX_MS : zero;
    const s = clone(sessao);
    const r = s.relogio;
    const usado = corte - Date.parse(r.fase_desde);
    r.tutorial_usado_ms = Math.min(usado, r.tutorial_ms);
    const excesso = usado - r.tutorial_usado_ms;
    r.pausa_usada_ms += excesso;
    r.pausa_saldo_ms -= excesso;
    if (r.pausa_saldo_ms < 0) { r.debito_ms += -r.pausa_saldo_ms; r.pausa_saldo_ms = 0; }
    s.fase = "intervalo";
    r.fase_desde = iso(corte);
    s.suspensa = { desde: iso(corte), automatica: true, motivo: "tutorial" };
    return { sessao: tocar(s), fechou: false, suspendeu: true, motivo: "tutorial" };
  }
  if (!blocoExpirou(sessao, t)) return nada;
  const fim = fimDoBloco(sessao);
  let s = fecharBloco(sessao, fim, "tempo");
  let suspendeu = false;
  if (s.fase === "intervalo" && t - fim > TOLERANCIA_AUSENCIA_MS) {
    s = clone(s);
    s.suspensa = { desde: iso(fim), automatica: true, motivo: "bloco" };
    suspendeu = true;
    tocar(s);
  }
  return { sessao: s, fechou: true, suspendeu, motivo: suspendeu ? "bloco" : null };
}

export const podeSuspender = (s) => s.fase === "intervalo" && !s.suspensa && !emCondicoesOficiais(s);

export function suspender(sessao, agora) {
  if (emCondicoesOficiais(sessao)) throw new Error("Em condições oficiais o dia não para, como na prova.");
  if (!podeSuspender(sessao)) throw new Error(sessao.suspensa ? "O dia já está suspenso." : "Só é possível parar entre blocos.");
  const s = clone(sessao);
  s.suspensa = { desde: iso(ms(agora)), automatica: false, motivo: "participante" };
  return tocar(s);
}

/* Retoma o dia: o tempo suspenso não conta na pausa (a pausa recomeça de onde parou) */
export function retomar(sessao, agora) {
  if (!sessao.suspensa) return sessao;
  const t = ms(agora);
  const s = clone(sessao);
  const desde = Date.parse(s.suspensa.desde);
  const dur = Math.max(0, t - desde);
  if (s.fase === "intervalo" && s.relogio.fase_desde) {
    /* a pausa corrida até a parada entra na conta agora (como faz o relógio oficial ao
       fechar o intervalo): o saldo cai, o excesso vira débito e a pausa recomeça na
       volta. Assim, o débito já cobrado não volta a contar para a parada automática. */
    const r = s.relogio;
    const usado = Math.max(0, desde - Date.parse(r.fase_desde));
    r.pausa_usada_ms += usado;
    r.pausa_saldo_ms -= usado;
    if (r.pausa_saldo_ms < 0) { r.debito_ms += -r.pausa_saldo_ms; r.pausa_saldo_ms = 0; }
    r.fase_desde = iso(t);
  }
  (s.suspensoes ||= []).push({ desde: s.suspensa.desde, ate: iso(t), automatica: !!s.suspensa.automatica, motivo: s.suspensa.motivo || "participante" });
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
    dia_previsto_ms: form.tempo.dia_ms,
    condicoes: s.condicoes || "estudo",
    padronizadas: condicoesPadronizadas(s)
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
