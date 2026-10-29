/* Road to America | respostas sintéticas da demonstração.

   Só no modo demonstração: dá à análise de itens, à calibração e à probabilidade de
   aprovação da área administrativa dados para mostrar. Nada disto é dado real; todas
   as linhas saem com sintetico: true e a tela marca "dados de demonstração".

   Três grupos de dados, todos gerados por um modelo de Rasch a partir de habilidades
   conhecidas (PSICOMETRIA.md, seção 19):

   1. Participantes fictícios de coorte-demo.js com simulados: theta derivado do
      acerto médio dos simulados, pela escala do banco,
      theta = logit(acerto médio) - logit(0,65), em que 0,65 é o Angoff padrão do item
      de dificuldade média. Respondem itens do Step dos seus simulados.
   2. Turmas anteriores fictícias (ids demo-sint-cal-...): examinandos que não
      aparecem na lista de participantes e existem só para a calibração ter volume.
      theta ~ N(0,3; 1), número de examinandos suficiente para cerca de 45 respostas
      por item. Parte deles tem desfecho fictício (Pass/Fail), para a regressão.
   3. Reportes de erro fictícios sobre os itens com defeito plantado.

   Dificuldade verdadeira de cada item: b = b de Angoff + erro N(0; 0,45²), sorteado
   pelo identificador do item. Para que os alertas da análise de itens tenham o que
   mostrar, alguns itens recebem um defeito plantado de propósito (gabarito trocado,
   item pouco discriminativo, muito difícil, muito fácil). Esses defeitos são da
   simulação e não dizem nada sobre a qualidade dos itens públicos.

   Todos os números de SIMULACAO_DEMO são parâmetros escolhidos para a demonstração,
   sem valor empírico. Determinístico: mesma semente, mesmos itens e mesmo dia, mesmos
   dados. */
import { PERFIS, PREFIXO_SINTETICO } from "./coorte-demo.js";
import { rng } from "./simulado.js";
import { expit, logit, bDoItem, normalAleatoria } from "./psicometria.js";
import { normalizarItem, hashTexto } from "./banco.js";

export const SEMENTE_RESPOSTAS = 20261029;
const MAX_POR_PESSOA = 250;
const DIA = 86400000;

export const SIMULACAO_DEMO = Object.freeze({
  dp_erro_angoff: 0.45,
  calibracao: Object.freeze({ prefixo: PREFIXO_SINTETICO + "cal-", media: 0.3, dp: 1, itens_por_pessoa: 160, respostas_por_item: 45, min_pessoas: 60, max_pessoas: 400, tutor: 0.15, dias: 150 }),
  desfechos: Object.freeze({ proporcao: 0.6, dp_erro_prova: 0.3 }),
  /* pesos de atração dos distratores (em ordem sorteada por item) */
  distratores: Object.freeze([0.36, 0.26, 0.21, 0.17]),
  /* proporção de itens de cada Step com defeito plantado (no mínimo 1 de cada, com 20 itens ou mais) */
  defeitos: Object.freeze({ gabarito_trocado: 0.025, pouco_discriminativo: 0.03, muito_dificil: 0.02, muito_facil: 0.02 }),
  p_pouco_discriminativo: 0.55,
  desvio_muito_dificil: 1.8,
  desvio_muito_facil: -4
});

export const ROTULO_DEFEITO = Object.freeze({
  gabarito_trocado: "gabarito trocado (os examinandos que sabem escolhem outra alternativa)",
  pouco_discriminativo: "pouco discriminativo (acerto quase igual em todas as habilidades)",
  muito_dificil: "muito difícil",
  muito_facil: "muito fácil"
});

export function thetaDoPerfil(p) {
  const sims = p.sim || [];
  if (!sims.length) return null;
  const media = sims.reduce((s, x) => s + x[2], 0) / (sims.length * 20);
  const m = Math.min(0.97, Math.max(0.05, media));
  return logit(m) - logit(0.65);
}

const semente32 = (s) => parseInt(hashTexto(s), 16) >>> 0;
const normalizar = (itens) => (itens || []).map((q) => (q && q.b_angoff !== undefined ? q : normalizarItem(q))).filter((q) => q.id && q.correta && Array.isArray(q.alternativas) && q.alternativas.length >= 2);

/* Modelo verdadeiro da simulação: Map id -> { b, defeito, chave_verdadeira, distratores: [[letra, peso]] }.
   O defeito e a chave verdadeira usam o gabarito ORIGINAL do item (o do arquivo),
   para que uma correção de gabarito feita pelo admin mude o acerto, não a verdade. */
export function modeloVerdadeiro(itens) {
  const norm = normalizar(itens);
  const P = SIMULACAO_DEMO;
  const out = new Map();
  for (const step of ["step1", "step2ck"]) {
    const doStep = norm.filter((q) => q.step === step).sort((a, b) => (hashTexto("defeito|" + a.id) < hashTexto("defeito|" + b.id) ? -1 : 1));
    const defeito = new Map();
    if (doStep.length >= 20) {
      let k = 0;
      for (const [nome, prop] of Object.entries(P.defeitos)) {
        const n = Math.max(1, Math.round(doStep.length * prop));
        for (let i = 0; i < n && k < doStep.length; i++, k++) defeito.set(doStep[k].id, nome);
      }
    }
    for (const q of doStep) {
      const r = rng(semente32("item|" + q.id));
      const d = defeito.get(q.id) || null;
      let b = bDoItem(q, { usarCalibrado: false }) + P.dp_erro_angoff * normalAleatoria(r);
      if (d === "muito_dificil") b = Math.max(b, 0.5) + P.desvio_muito_dificil;
      if (d === "muito_facil") b = Math.min(b, -0.5) + P.desvio_muito_facil;
      const letras = q.alternativas.map((a) => a.letra);
      const outras = letras.filter((l) => l !== q.correta).map((l) => [r(), l]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
      let chave = q.correta;
      let erradas = outras;
      if (d === "gabarito_trocado") {
        /* a resposta "verdadeira" é um distrator; o gabarito do arquivo vira o distrator mais atraente */
        chave = outras[0];
        erradas = [q.correta, ...outras.slice(1)];
      }
      const pesos = erradas.map((l, i) => [l, P.distratores[i] ?? P.distratores[P.distratores.length - 1]]);
      out.set(q.id, { id: q.id, step, b, defeito: d, chave_verdadeira: chave, distratores: pesos });
    }
  }
  return out;
}

function sortearPeso(pares, random) {
  const tot = pares.reduce((s, [, w]) => s + w, 0);
  let x = random() * tot;
  for (const [l, w] of pares) { x -= w; if (x <= 0) return l; }
  return pares[pares.length - 1][0];
}
function responder(m, theta, random) {
  const pSabe = m.defeito === "pouco_discriminativo" ? SIMULACAO_DEMO.p_pouco_discriminativo : expit(theta - m.b);
  return random() < pSabe ? m.chave_verdadeira : sortearPeso(m.distratores, random);
}

/* Habilidade verdadeira de cada examinando fictício: [{ user_id, step, theta, grupo, nome? }] */
export function examinandosDemo({ itens, semente = SEMENTE_RESPOSTAS } = {}) {
  const norm = normalizar(itens);
  const n = { step1: norm.filter((q) => q.step === "step1").length, step2ck: norm.filter((q) => q.step === "step2ck").length };
  const out = [];
  PERFIS.forEach((p) => {
    const theta = thetaDoPerfil(p);
    if (theta === null || !n[p.sim[0][0]]) return;
    out.push({ user_id: PREFIXO_SINTETICO + p.slug, step: p.sim[0][0], theta, grupo: "participante", nome: p.nome });
  });
  const C = SIMULACAO_DEMO.calibracao;
  for (const step of ["step1", "step2ck"]) {
    if (!n[step]) continue;
    const k = Math.min(n[step], C.itens_por_pessoa);
    const pessoas = Math.min(C.max_pessoas, Math.max(C.min_pessoas, Math.ceil((C.respostas_por_item * n[step]) / k)));
    const r = rng(semente + (step === "step1" ? 101 : 202));
    for (let j = 0; j < pessoas; j++) {
      out.push({ user_id: C.prefixo + (step === "step1" ? "s1-" : "ck-") + String(j + 1).padStart(3, "0"), step, theta: C.media + C.dp * normalAleatoria(r), grupo: "calibracao" });
    }
  }
  return out;
}

/* itens: brutos ou normalizados (o gabarito original é o do item);
   gabaritos: Map id -> { correta, versao } com as correções do admin (opcional);
   agora: Date. Devolve linhas no formato de listRespostas(). */
export function gerarRespostasDemo({ itens, agora = new Date(), semente = SEMENTE_RESPOSTAS, gabaritos = null, modelo = null } = {}) {
  const norm = normalizar(itens);
  const mod = modelo || modeloVerdadeiro(norm);
  const porStep = { step1: norm.filter((q) => q.step === "step1"), step2ck: norm.filter((q) => q.step === "step2ck") };
  const dia = Math.floor(new Date(agora).getTime() / DIA);
  const t0 = new Date(agora).getTime();
  const chaveAtual = (q) => gabaritos?.get?.(q.id)?.correta || q.correta;
  const versaoAtual = (q) => gabaritos?.get?.(q.id)?.versao || q.versao || 1;
  const out = [];
  const C = SIMULACAO_DEMO.calibracao;
  examinandosDemo({ itens: norm, semente }).forEach((ex, idx) => {
    const pool = porStep[ex.step];
    const cal = ex.grupo === "calibracao";
    const random = rng(semente + idx * 7919 + dia);
    const ordem = pool.map((q) => [random(), q]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const n = cal ? Math.min(pool.length, C.itens_por_pessoa) : Math.min(MAX_POR_PESSOA, Math.max(10, Math.round(pool.length * 0.7)));
    /* turmas anteriores: estudaram num período mais longo, terminando antes de hoje */
    const fim = cal ? 1 + Math.floor(random() * 40) : 0;
    const janela = cal ? C.dias - fim : 60;
    ordem.slice(0, n).forEach((q, k) => {
      const m = mod.get(q.id);
      if (!m) return;
      const resposta = responder(m, ex.theta, random);
      const diasAtras = fim + Math.floor(((n - k) / n) * janela * (0.6 + 0.4 * random()));
      out.push({
        id: ex.user_id + "-r" + k,
        user_id: ex.user_id,
        questao_id: q.id,
        step: ex.step,
        resposta,
        correta: resposta === chaveAtual(q),
        tempo_ms: Math.round(45000 + random() * 90000),
        marcada: random() < 0.1,
        modo: random() < (cal ? 1 - C.tutor : 0.7) ? "cronometrado" : "tutor",
        origem: "banco",
        sessao_id: null, bloco: null, posicao: null,
        versao_item: versaoAtual(q),
        respondida_em: new Date(t0 - diasAtras * DIA - Math.floor(random() * 36e5)).toISOString(),
        sintetico: true
      });
    });
  });
  return out;
}

/* Desfechos fictícios das turmas anteriores (resultado oficial Pass/Fail), para a
   regressão logística da tela de calibração. Pass quando theta + erro > 0, com erro
   N(0; 0,3²) entre o banco e a prova (parâmetro da simulação). Data: de 7 a 27 dias
   depois da última resposta do examinando. No Step 2 CK, só Pass/Fail, sem nota:
   a demonstração não inventa a escala de três dígitos. */
export function gerarDesfechosDemo({ itens, respostas, agora = new Date(), semente = SEMENTE_RESPOSTAS } = {}) {
  const ultima = new Map();
  for (const r of respostas || []) if (!ultima.has(r.user_id) || r.respondida_em > ultima.get(r.user_id)) ultima.set(r.user_id, r.respondida_em);
  const P = SIMULACAO_DEMO.desfechos;
  const out = [];
  const hoje = new Date(agora).getTime();
  for (const step of ["step1", "step2ck"]) {
    const grupo = examinandosDemo({ itens, semente }).filter((x) => x.grupo === "calibracao" && x.step === step);
    const r = rng(semente + (step === "step1" ? 303 : 404));
    const nDesf = Math.round(grupo.length * P.proporcao);
    grupo.slice(0, nDesf).forEach((ex) => {
      const ult = ultima.get(ex.user_id);
      if (!ult) return;
      const data = Math.min(hoje - DIA, Date.parse(ult) + (7 + Math.floor(r() * 21)) * DIA);
      const pass = ex.theta + P.dp_erro_prova * normalAleatoria(r) > 0;
      out.push({
        id: "demo-res-" + ex.user_id.slice(PREFIXO_SINTETICO.length), user_id: ex.user_id, step,
        data: new Date(data).toISOString().slice(0, 10), resultado: pass ? "pass" : "fail", escore: null,
        observacao: "Desfecho fictício da demonstração.", registrado_por: "demo-admin",
        criado_em: new Date(data + DIA).toISOString(), atualizado_em: new Date(data + DIA).toISOString(), sintetico: true
      });
    });
  }
  return out;
}

/* Reportes fictícios: um por item com gabarito trocado (o que um aluno atento faria)
   e dois sobre outros itens, para a fila de reportes ter o que mostrar. */
export function gerarReportesDemo({ itens, agora = new Date(), modelo = null } = {}) {
  const norm = normalizar(itens);
  const mod = modelo || modeloVerdadeiro(norm);
  const t0 = new Date(agora).getTime();
  const autores = PERFIS.slice(0, 6);
  const out = [];
  let k = 0;
  const add = (q, motivo, texto, diasAtras) => {
    const a = autores[k % autores.length];
    out.push({
      id: "demo-rep-" + (++k), user_id: PREFIXO_SINTETICO + a.slug, autor_nome: a.nome, questao_id: q.id, versao_item: q.versao || 1,
      motivo, texto, status: "aberto", resposta: "", resolvido_por: null, resolvido_em: null,
      criado_em: new Date(t0 - diasAtras * DIA - k * 3600e3).toISOString(), sintetico: true
    });
  };
  const trocados = norm.filter((q) => mod.get(q.id)?.defeito === "gabarito_trocado");
  trocados.forEach((q, i) => add(q, "gabarito", "Marquei a alternativa " + mod.get(q.id).chave_verdadeira + " e a própria explicação parece defender essa alternativa, não a " + q.correta + ". Podem conferir o gabarito?", 3 + i * 4));
  const outros = norm.filter((q) => !mod.get(q.id)?.defeito).sort((a, b) => (hashTexto("rep|" + a.id) < hashTexto("rep|" + b.id) ? -1 : 1));
  if (outros[0]) add(outros[0], "explicacao", "A explicação não diz por que as outras alternativas estão erradas.", 6);
  if (outros[1]) add(outros[1], "valores_lab", "Os valores de referência da vinheta não batem com a tabela de valores laboratoriais.", 11);
  return out;
}
