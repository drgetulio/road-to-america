/* Road to America | rotinas do admin para calibrar o banco com dados reais.

   1. prepararRecalibracao: lê a matriz de respostas da turma (primeira resposta,
      sem tutor) e recalibra os b de Rasch com priori no Angoff (psicometria.js,
      recalibrarRasch). Só os itens com pelo menos minRespostas respostas recebem
      o b novo, e a ancoragem pela curva do teste é feita nesses itens.
   2. aplicarRecalibracao: grava os b novos (store.salvarCalibracao).
   3. calibrarDesfechos: junta resultados oficiais (Pass/Fail e nota do Step 2 CK)
      e escores NBME em standard-paced ao theta de cada aluno na data e ajusta a
      regressão logística (Pass/Fail) e as regressões lineares (notas).
      Da regressão do escore NBME sai a ligação com a NBME (corteLigadoNbme): o
      theta em que o escore previsto atinge o padrão de aprovação, com erro-padrão
      pelo método delta, que substitui o limiar provisório quando é suficiente.
   4. salvarModelo: grava o modelo do Step (store.saveModeloPsicometrico); a tela
      do aluno passa esse modelo para estimarAluno. Sem modelo suficiente, a tela
      continua dizendo que a estimativa vem do padrão provisório do banco.
   Interface em plataforma/INTERFACE.md; método em plataforma/PSICOMETRIA.md. */
import { carregarBanco } from "./banco.js";
import { recalibrarRasch, ajustarDesfechos, ajustarEscore, corteLigadoNbme, montarDadosDesfechos, estimarEfeitoModo, prepararRespostas, eap, RECALIBRACAO_PADRAO, LIMIARES_ITEM } from "./psicometria.js";

/* Participante elegível para informar o resultado: tem pelo menos este número de
   respostas no Step e nenhuma resposta nos últimos 45 dias (terminou o preparo). Quem é elegível e não informou entra como não respondente na
   taxa de resposta e na ponderação do modelo de desfechos (PSICOMETRIA.md, seção 13). */
export const MIN_RESPOSTAS_ELEGIVEL = 20;
export const DIAS_INATIVO_ELEGIVEL = 45;

export const MIN_RESPOSTAS_CALIBRACAO = LIMIARES_ITEM.n_min;

export async function prepararRecalibracao({ store, step, tau = RECALIBRACAO_PADRAO.tau, minRespostas = MIN_RESPOSTAS_CALIBRACAO, incluirTutor = false } = {}) {
  const banco = await carregarBanco({ store, step, incluirInativos: true });
  const matriz = await store.listRespostasCalibracao({ step, incluirTutor });
  const n = new Map();
  for (const r of matriz) n.set(r.questao_id, (n.get(r.questao_id) || 0) + 1);
  const ancorarEm = [...n].filter(([id, k]) => k >= minRespostas && banco.porId.has(id)).map(([id]) => id);
  const r = recalibrarRasch(matriz.map((m) => ({ pessoa: m.pessoa, questao_id: m.questao_id, correta: m.correta })), banco.porId, { tau, ancorarEm: ancorarEm.length ? ancorarEm : null });
  const itens = r.itens.map((it) => ({ ...it, aplicar: it.n >= minRespostas, delta: it.b - it.b_angoff }));
  return {
    step, itens,
    a_aplicar: itens.filter((i) => i.aplicar).length,
    pessoas: r.pessoas.length, respostas: matriz.length,
    convergiu: r.convergiu, iteracoes: r.iteracoes, deslocamento: r.deslocamento,
    parametros: { ...r.parametros, min_respostas: minRespostas },
    demonstracao: store.mode === "local"
  };
}

export async function aplicarRecalibracao({ store, preparo }) {
  const itens = (preparo?.itens || []).filter((i) => i.aplicar).map((i) => ({ id: i.id, b: Math.round(i.b * 1e4) / 1e4, ep: Math.round(i.ep * 1e4) / 1e4, n: i.n }));
  if (!itens.length) return { gravados: 0 };
  return store.salvarCalibracao(itens);
}

/* Desfaz a calibração (volta ao Angoff) dos ids indicados */
export async function desfazerCalibracao({ store, ids }) {
  return store.salvarCalibracao((ids || []).map((id) => ({ id, b: null })));
}

export async function calibrarDesfechos({ store, step } = {}) {
  const banco = await carregarBanco({ store, step, incluirInativos: true });
  const oficiais = await store.listResultadosOficiais({ todos: true, step });
  const nbme = (await store.listNbme({ todos: true, step })).filter((x) => Number.isFinite(Number(x.escore)) && x.escore !== null && (x.modo || "standard") === "standard");
  const usuarios = [...new Set([...oficiais.map((o) => o.user_id), ...nbme.map((x) => x.user_id)])];
  const porUsuario = new Map();
  for (const u of usuarios) porUsuario.set(u, await store.listRespostas({ userId: u, step }));
  const dadosOficiais = montarDadosDesfechos(oficiais.map((o) => ({ user_id: o.user_id, step, data: o.data, resultado: o.resultado, escore: o.escore })), porUsuario, banco.porId);
  const dadosNbme = montarDadosDesfechos(nbme.map((x) => ({ user_id: x.user_id, step, data: x.data, escore: Number(x.escore) })), porUsuario, banco.porId);
  /* não respondentes: participantes com respostas suficientes no Step e sem resultado
     oficial informado (theta com todas as respostas). Inclui quem ainda não fez a
     prova, então a taxa de resposta é um limite inferior. */
  const comResultado = new Set(oficiais.filter((o) => o.resultado === "pass" || o.resultado === "fail").map((o) => o.user_id));
  const naoRespondentes = [];
  let elegiveis = comResultado.size;
  if (store.listParticipantes) {
    const parts = await store.listParticipantes().catch(() => []);
    for (const pt of parts || []) {
      const uid = pt.id || pt.user_id;
      if (!uid || comResultado.has(uid)) continue;
      const rs = porUsuario.get(uid) || (await store.listRespostas({ userId: uid, step }).catch(() => []));
      const { usadas } = prepararRespostas(rs, banco.porId, { step });
      if (usadas.length < MIN_RESPOSTAS_ELEGIVEL) continue;
      /* quem ainda estuda (resposta nos últimos DIAS_INATIVO_ELEGIVEL dias) provavelmente
         não fez a prova: não é não respondente */
      const ultima = rs.reduce((m, r) => (String(r.respondida_em || "") > m ? String(r.respondida_em) : m), "");
      if (ultima && Date.now() - Date.parse(ultima) < DIAS_INATIVO_ELEGIVEL * 86400000) continue;
      naoRespondentes.push({ user_id: uid, theta: eap(usadas, { sigmaCorte: 0 }).theta, n: usadas.length });
      elegiveis++;
    }
  }
  /* efeito do modo tutor, com a matriz de primeiras respostas incluindo o tutor */
  let efeitoModo = null;
  if (store.listRespostasCalibracao) {
    const matriz = await store.listRespostasCalibracao({ step, incluirTutor: true }).catch(() => []);
    efeitoModo = estimarEfeitoModo(matriz, banco.porId);
  }
  const escoreNbme = ajustarEscore(dadosNbme);
  return {
    step,
    pass_fail: ajustarDesfechos(dadosOficiais, { naoRespondentes }),
    efeito_modo: efeitoModo,
    escore_oficial: step === "step2ck" ? ajustarEscore(dadosOficiais.filter((d) => d.escore !== null)) : null,
    escore_nbme: escoreNbme,
    ligacao_nbme: corteLigadoNbme(escoreNbme, { step }),
    n: { resultados_oficiais: dadosOficiais.length, nbme: dadosNbme.length, alunos: usuarios.length, elegiveis, nao_respondentes: naoRespondentes.length },
    /* pontos usados no ajuste (theta na data do desfecho), para os gráficos do admin */
    dados: { oficiais: dadosOficiais, nbme: dadosNbme },
    demonstracao: store.mode === "local"
  };
}

const linear = (m) => ({ a: m.a, b: m.b, sigma: m.sigma, r2: m.r2, n: m.n, var_a: m.var_a ?? null, var_b: m.var_b ?? null, cov_ab: m.cov_ab ?? null, suficiente: !!m.suficiente });

/* Modelo gravado para as telas: só o que estimarAluno usa, mais a procedência */
export async function salvarModelo({ store, step, desfechos }) {
  const d = desfechos || {};
  const modelo = {
    versao: 3,
    metodo: "regressao_logistica_ponderada_e_linear_sobre_theta_eap_sem_integrar_dp",
    desfechos: d.pass_fail ? {
      beta0: d.pass_fail.beta0, beta1: d.pass_fail.beta1, cov: d.pass_fail.cov || null, n: d.pass_fail.n, aprovados: d.pass_fail.aprovados, reprovados: d.pass_fail.reprovados,
      taxa_resposta: d.pass_fail.taxa_resposta ?? null, ponderado: !!d.pass_fail.ponderado, auc: d.pass_fail.auc, brier: d.pass_fail.brier,
      suficiente: !!d.pass_fail.suficiente, exploratorio: !!d.pass_fail.exploratorio
    } : null,
    /* efeito do modo tutor: só vai para as telas quando há respostas suficientes */
    efeito_modo: d.efeito_modo && d.efeito_modo.suficiente ? { delta: d.efeito_modo.delta, ep: d.efeito_modo.ep, n_tutor: d.efeito_modo.n_tutor, pessoas: d.efeito_modo.pessoas } : null,
    escore_oficial: d.escore_oficial ? linear(d.escore_oficial) : null,
    escore_nbme: d.escore_nbme ? linear(d.escore_nbme) : null,
    /* corte ligado à NBME: só vai para as telas quando é suficiente */
    ligacao_nbme: d.ligacao_nbme ? { metodo: d.ligacao_nbme.metodo, limiar: d.ligacao_nbme.limiar, n: d.ligacao_nbme.n, mu: d.ligacao_nbme.mu, ep: d.ligacao_nbme.ep, sigma: d.ligacao_nbme.sigma, t: d.ligacao_nbme.t ?? null, suficiente: !!d.ligacao_nbme.suficiente, motivo: d.ligacao_nbme.motivo || "" } : null,
    demonstracao: !!d.demonstracao
  };
  return store.saveModeloPsicometrico(step, modelo);
}
