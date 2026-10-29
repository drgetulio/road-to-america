/* Road to America | rotinas do admin para calibrar o banco com dados reais.

   1. prepararRecalibracao: lê a matriz de respostas da turma (primeira resposta,
      sem tutor) e recalibra os b de Rasch com priori no Angoff (psicometria.js,
      recalibrarRasch). Só os itens com pelo menos minRespostas respostas recebem
      o b novo, e a ancoragem pela curva do teste é feita nesses itens.
   2. aplicarRecalibracao: grava os b novos (store.salvarCalibracao).
   3. calibrarDesfechos: junta resultados oficiais (Pass/Fail e nota do Step 2 CK)
      e escores NBME em standard-paced ao theta de cada aluno na data e ajusta a
      regressão logística (Pass/Fail) e as regressões lineares (notas).
   4. salvarModelo: grava o modelo do Step (store.saveModeloPsicometrico); a tela
      do aluno passa esse modelo para estimarAluno. Sem modelo suficiente, a tela
      continua dizendo que a estimativa vem do padrão de Angoff.
   Interface em plataforma/INTERFACE.md; método em plataforma/PSICOMETRIA.md. */
import { carregarBanco } from "./banco.js";
import { recalibrarRasch, ajustarDesfechos, ajustarEscore, montarDadosDesfechos, RECALIBRACAO_PADRAO, LIMIARES_ITEM } from "./psicometria.js";

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
  return {
    step,
    pass_fail: ajustarDesfechos(dadosOficiais),
    escore_oficial: step === "step2ck" ? ajustarEscore(dadosOficiais.filter((d) => d.escore !== null)) : null,
    escore_nbme: ajustarEscore(dadosNbme),
    n: { resultados_oficiais: dadosOficiais.length, nbme: dadosNbme.length, alunos: usuarios.length },
    /* pontos usados no ajuste (theta na data do desfecho), para os gráficos do admin */
    dados: { oficiais: dadosOficiais, nbme: dadosNbme },
    demonstracao: store.mode === "local"
  };
}

/* Modelo gravado para as telas: só o que estimarAluno usa, mais a procedência */
export async function salvarModelo({ store, step, desfechos }) {
  const d = desfechos || {};
  const modelo = {
    versao: 1,
    metodo: "regressao_logistica_e_linear_sobre_theta_eap",
    desfechos: d.pass_fail ? { beta0: d.pass_fail.beta0, beta1: d.pass_fail.beta1, n: d.pass_fail.n, aprovados: d.pass_fail.aprovados, reprovados: d.pass_fail.reprovados, auc: d.pass_fail.auc, brier: d.pass_fail.brier, suficiente: !!d.pass_fail.suficiente } : null,
    escore_oficial: d.escore_oficial ? { a: d.escore_oficial.a, b: d.escore_oficial.b, sigma: d.escore_oficial.sigma, r2: d.escore_oficial.r2, n: d.escore_oficial.n, suficiente: !!d.escore_oficial.suficiente } : null,
    escore_nbme: d.escore_nbme ? { a: d.escore_nbme.a, b: d.escore_nbme.b, sigma: d.escore_nbme.sigma, r2: d.escore_nbme.r2, n: d.escore_nbme.n, suficiente: !!d.escore_nbme.suficiente } : null,
    demonstracao: !!d.demonstracao
  };
  return store.saveModeloPsicometrico(step, modelo);
}
