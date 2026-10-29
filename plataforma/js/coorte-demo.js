/* Road to America | COORTE SINTÉTICA do modo demonstração.
   Dezesseis participantes FICTÍCIOS, gerados de forma determinística (mesma
   semente e mesmo dia = mesmos dados), para que o painel do administrador tenha o
   que mostrar sem nenhum dado real. Tudo aqui é inventado: nomes, e-mails
   (@demo.local), revisões, simulados, autoavaliações e presença. Cada participante
   sai com sintetico: true e a interface deve exibir o selo "dados de demonstração".

   Nada disso é gravado no localStorage: a coorte é gerada na memória a cada dia e
   não se mistura com os dados do usuário de demonstração. Só as edições do admin
   sobre esses participantes (verificar NBME, lançar presença) ficam guardadas, numa
   chave separada (ver anki/js/store-local.js).

   Perfis cobertos: em dia, pronto pelo critério da EXIT 18, inativo (7, 9 e 23
   dias), sem nenhum estudo, recém-chegado, retenção baixa, simulados baixos,
   NBME abaixo da meta, NBME insuficiente perto da prova, presença abaixo de 80%,
   Step 1 já aprovado e preparo do Step 2 CK, e combinações. */
import { rng, sortearQuestoes, corrigirTentativa } from "./simulado.js";
import { dayStart, addDays } from "../../anki/js/util.js";

export const PREFIXO_SINTETICO = "demo-sint-";
export const SEMENTE_PADRAO = 20261028;
export const AULAS_TOTAIS_DEMO = 40;

/*
  Especificação de cada perfil. Dias são relativos a hoje (negativo = passado).
  hist: dias de histórico; p: chance de estudar num dia; rev: revisões médias por
  dia de estudo; ret: retenção real alvo; inativo: dias desde o último estudo;
  cob: cobertura do baralho oficial; leeches: número de leeches;
  pres: [assistidas, totais]; prova1/prova2: dias até a prova (null = sem data);
  ap1: Step 1 já aprovado; nbme: [step, dias atrás, probabilidade, escore, modo,
  faixa acima da aprovação baixa, verificada]; sim: [step, dias atrás, acertos em 20].
*/
export const PERFIS = [
  { slug: "ana-exemplo", nome: "Ana Exemplo", perfil: "Em dia, Step 1 em 4 meses",
    hist: 120, p: 0.95, rev: 110, ret: 0.91, inativo: 0, cob: 0.62, leeches: 2, pres: [38, 40], prova1: 120,
    nbme: [], sim: [["step1", 30, 13], ["step1", 16, 15], ["step1", 3, 16]] },
  { slug: "bruno-ficticio", nome: "Bruno Fictício", perfil: "Pronto pelo critério da EXIT 18, prova em 12 dias",
    hist: 170, p: 0.97, rev: 140, ret: 0.92, inativo: 0, cob: 0.94, leeches: 1, pres: [36, 40], prova1: 12,
    nbme: [["step1", 60, 71, 201, "standard", false, true], ["step1", 24, 93, 222, "standard", true, true], ["step1", 9, 96, 231, "standard", true, false]],
    sim: [["step1", 20, 15], ["step1", 10, 16], ["step1", 2, 17]] },
  { slug: "carla-modelo", nome: "Carla Modelo", perfil: "Parou há 9 dias",
    hist: 90, p: 0.9, rev: 80, ret: 0.89, inativo: 9, cob: 0.41, leeches: 3, pres: [33, 40], prova1: 140,
    nbme: [], sim: [["step1", 25, 13], ["step1", 12, 14]] },
  { slug: "diego-simulado", nome: "Diego Simulado", perfil: "Inativo há 23 dias e presença baixa",
    hist: 100, p: 0.7, rev: 60, ret: 0.86, inativo: 23, cob: 0.28, leeches: 5, pres: [24, 40], prova1: 95,
    nbme: [], sim: [["step1", 40, 11]] },
  { slug: "elisa-teste", nome: "Elisa Teste", perfil: "Retenção real baixa",
    hist: 110, p: 0.92, rev: 120, ret: 0.71, inativo: 0, cob: 0.55, leeches: 11, pres: [35, 40], prova1: 110,
    nbme: [], sim: [["step1", 14, 13], ["step1", 4, 13]] },
  { slug: "fabio-amostra", nome: "Fábio Amostra", perfil: "NBME abaixo da meta",
    hist: 140, p: 0.9, rev: 100, ret: 0.88, inativo: 1, cob: 0.7, leeches: 4, pres: [34, 40], prova1: 90,
    nbme: [["step1", 35, 62, 188, "standard", false, true], ["step1", 8, 74, 196, "standard", false, false]],
    sim: [["step1", 18, 12], ["step1", 6, 13]] },
  { slug: "gabriela-exemplo", nome: "Gabriela Exemplo", perfil: "Presença abaixo de 80%",
    hist: 95, p: 0.93, rev: 95, ret: 0.9, inativo: 0, cob: 0.48, leeches: 1, pres: [29, 40], prova1: 160,
    nbme: [], sim: [["step1", 9, 14]] },
  { slug: "hugo-ficticio", nome: "Hugo Fictício", perfil: "Simulados abaixo de 60%",
    hist: 80, p: 0.88, rev: 70, ret: 0.87, inativo: 2, cob: 0.36, leeches: 3, pres: [37, 40], prova1: 130,
    nbme: [], sim: [["step1", 21, 6], ["step1", 11, 7], ["step1", 1, 9]] },
  { slug: "iris-modelo", nome: "Íris Modelo", perfil: "Prova em 25 dias com uma só autoavaliação",
    hist: 150, p: 0.94, rev: 130, ret: 0.9, inativo: 0, cob: 0.83, leeches: 2, pres: [39, 40], prova1: 25,
    nbme: [["step1", 15, 91, 219, "standard", true, false]], sim: [["step1", 13, 15], ["step1", 5, 16]] },
  { slug: "joao-amostra", nome: "João Amostra", perfil: "Step 1 aprovado, preparo do Step 2 CK",
    hist: 130, p: 0.9, rev: 90, ret: 0.9, inativo: 0, cob: 0.97, leeches: 0, pres: [40, 40], prova1: null, ap1: true, prova2: 150,
    nbme: [["step1", 120, 92, 224, "standard", true, true], ["step1", 105, 95, 230, "standard", true, true], ["step2ck", 12, 94, 248, "standard", true, false]],
    sim: [["step2ck", 15, 13], ["step2ck", 4, 14]] },
  { slug: "karina-teste", nome: "Karina Teste", perfil: "Recém-chegada (conta de 3 dias)",
    hist: 3, p: 1, rev: 25, ret: 0.85, inativo: 0, cob: 0.05, leeches: 0, pres: [1, 1], prova1: null,
    nbme: [], sim: [], criada: 3 },
  { slug: "lucas-simulado", nome: "Lucas Simulado", perfil: "Conta de 20 dias sem nenhum estudo",
    hist: 0, p: 0, rev: 0, ret: 0, inativo: 0, cob: 0, leeches: 0, pres: [5, 12], prova1: null,
    nbme: [], sim: [], criada: 20 },
  { slug: "marina-exemplo", nome: "Marina Exemplo", perfil: "Vários critérios: retenção, simulados e presença",
    hist: 115, p: 0.75, rev: 85, ret: 0.69, inativo: 3, cob: 0.39, leeches: 14, pres: [27, 40], prova1: 100,
    nbme: [], sim: [["step1", 17, 9], ["step1", 5, 10]] },
  { slug: "nuno-ficticio", nome: "Nuno Fictício", perfil: "Em dia, ainda sem prontidão (85% e 91%)",
    hist: 160, p: 0.96, rev: 125, ret: 0.9, inativo: 0, cob: 0.88, leeches: 2, pres: [36, 40], prova1: null,
    nbme: [["step1", 30, 85, 211, "standard", true, true], ["step1", 6, 91, 220, "standard", true, true]],
    sim: [["step1", 15, 15], ["step1", 3, 15]] },
  { slug: "olivia-modelo", nome: "Olívia Modelo", perfil: "Sem estudo há 7 dias",
    hist: 75, p: 0.9, rev: 75, ret: 0.89, inativo: 7, cob: 0.33, leeches: 1, pres: [35, 40], prova1: 180,
    nbme: [], sim: [["step1", 12, 13]] },
  { slug: "pedro-amostra", nome: "Pedro Amostra", perfil: "Step 2 CK em 40 dias, NBME único abaixo da meta",
    hist: 125, p: 0.9, rev: 100, ret: 0.88, inativo: 0, cob: 0.92, leeches: 3, pres: [34, 40], prova1: null, ap1: true, prova2: 40,
    nbme: [["step1", 140, 93, 226, "standard", true, true], ["step1", 128, 94, 229, "standard", true, true], ["step2ck", 10, 80, 236, "standard", false, false]],
    sim: [["step2ck", 14, 12], ["step2ck", 2, 13]] }
];

const FORMULARIOS = { step1: ["CBSSA Form 30", "CBSSA Form 31", "CBSSA Form 32", "CBSSA Form 33"], step2ck: ["CCSSA Form 11", "CCSSA Form 12", "CCSSA Form 13"] };
const AREAS_FALLBACK = {
  step1: ["cardiovascular", "respiratorio_renal", "reprodutor_endocrino", "comportamento_nervoso", "sangue_imune", "musculoesqueletico_pele", "gastrointestinal", "multissistemico", "ciencias_sociais", "bioestatistica"],
  step2ck: ["medicina_interna", "pediatria", "ginecologia_obstetricia", "cirurgia", "psiquiatria", "neurologia", "emergencia", "medicina_preventiva"]
};

function isoDia(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function idsSinteticos(n) {
  return Array.from({ length: n }, (_, i) => "sint-card-" + String(i + 1).padStart(4, "0"));
}

/* revlog plausível: rampa nas primeiras semanas, novos (state 0), aprendizagem
   (1), revisão (2) e reaprendizagem (3), falhas na proporção 1 - ret */
function gerarRevlog(spec, uid, hoje, agora, cardIds, random) {
  const out = [];
  if (!spec.hist || !spec.rev) return out;
  const ultimoDia = -spec.inativo;
  for (let d = -spec.hist + 1; d <= ultimoDia; d++) {
    if (d !== ultimoDia && random() > spec.p) continue;
    const dia = addDays(hoje, d);
    const rampa = Math.min(1, (d + spec.hist + 4) / 30);
    const n = Math.max(5, Math.round(spec.rev * rampa * (0.6 + 0.8 * random())));
    const novos = Math.min(20, Math.round(n * 0.15));
    const inicioMin = 3 * 60 + Math.floor(random() * 14 * 60); /* entre 7h e 21h */
    for (let i = 0; i < n; i++) {
      const t = new Date(dia.getTime() + (inicioMin + i * 0.5) * 60000);
      let state, rating, elapsed;
      if (i < novos) { state = 0; rating = random() < 0.25 ? 1 : 3; elapsed = 0; }
      else if (i < novos * 2) { state = 1; rating = random() < 0.12 ? 1 : 3; elapsed = 0; }
      else if (random() < 0.06) { state = 3; rating = random() < 0.2 ? 1 : 3; elapsed = 0; }
      else {
        state = 2;
        const r = random();
        rating = r > spec.ret ? 1 : r > spec.ret - 0.08 ? 2 : r < 0.1 ? 4 : 3;
        elapsed = Math.max(1, Math.round(Math.exp(random() * 4.2)));
      }
      const duracao_ms = 4000 + Math.floor(random() * 14000);
      /* sorteia tudo antes de descartar o futuro, para que o resto da coorte
         não dependa da hora do dia */
      if (t > agora) continue;
      out.push({
        id: uid + "-r" + out.length,
        user_id: uid,
        card_id: cardIds[(out.length * 7 + Math.abs(d) * 13) % cardIds.length],
        ord: 1, rating, state, elapsed_days: elapsed, scheduled_days: elapsed,
        review: t.toISOString(), duracao_ms
      });
    }
  }
  return out;
}

function gerarEstados(spec, cardIds, random) {
  const nVistos = Math.round(spec.cob * cardIds.length);
  const maturos = Math.min(0.75, spec.hist / 220);
  const out = [];
  for (let i = 0; i < nVistos; i++) {
    const cid = cardIds[i];
    const r = random();
    let state, sched;
    if (r < 0.06) { state = r < 0.03 ? 1 : 3; sched = 0; }
    else if (r < 0.06 + maturos) { state = 2; sched = 21 + Math.floor(random() * 120); }
    else { state = 2; sched = 1 + Math.floor(random() * 20); }
    out.push({ key: cid + "#1", card_id: cid, ord: 1, state, scheduled_days: sched, stability: sched, suspenso: false, leech: false, reps: 1 + Math.floor(random() * 12), lapses: 0 });
  }
  for (let i = 0; i < Math.min(spec.leeches, out.length); i++) {
    const e = out[(i * 3) % out.length];
    e.leech = true; e.lapses = 8; e.suspenso = i % 2 === 0;
  }
  return out;
}

function gerarSimulado(spec, s, uid, idx, hoje, bancos, random) {
  const [step, diasAtras, acertosAlvo] = s;
  const banco = bancos?.[step];
  let questoes;
  if (Array.isArray(banco) && banco.length >= 20) {
    questoes = sortearQuestoes(banco, { n: 20, semente: hashStr(uid + step + idx) });
  } else {
    const areas = AREAS_FALLBACK[step];
    questoes = Array.from({ length: 20 }, (_, i) => ({ id: "sint-" + step + "-q" + String(i + 1).padStart(2, "0"), sistema: areas[i % areas.length], disciplina: "geral", dificuldade: ["facil", "media", "media", "dificil"][i % 4], correta: "A" }));
  }
  const certas = new Set();
  const ordem = questoes.map((_, i) => i);
  for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
  for (const i of ordem.slice(0, acertosAlvo)) certas.add(i);
  const letras = ["A", "B", "C", "D", "E"];
  const respostas = questoes.map((q, i) => {
    if (certas.has(i)) return q.correta;
    if (random() < 0.05) return null;
    const erradas = letras.filter((l) => l !== q.correta);
    return erradas[Math.floor(random() * erradas.length)];
  });
  const tempos = questoes.map(() => 55000 + Math.floor(random() * 50000));
  const soma = tempos.reduce((a, b) => a + b, 0);
  const escala = soma > 1800000 ? 1800000 / soma : 1;
  const tempos_ms = tempos.map((t) => Math.round(t * escala));
  const inicio = new Date(addDays(hoje, -diasAtras).getTime() + (16 + Math.floor(random() * 4)) * 3600000);
  const fim = new Date(inicio.getTime() + tempos_ms.reduce((a, b) => a + b, 0));
  const t = corrigirTentativa({
    step, questoes, respostas, tempos_ms,
    marcadas: questoes.map(() => random() < 0.15),
    inicio, fim, encerramento: escala < 1 ? "tempo" : "participante", versao_banco: "demo"
  });
  return { ...t, id: uid + "-sim" + idx, user_id: uid, criado_em: fim.toISOString() };
}

/*
  Gera a coorte. Parâmetros:
  - agora: data de referência (padrão: agora). O resultado só muda quando muda o dia.
  - oficiais: ids dos cards oficiais aprovados (para cobertura); sem eles, usa 600 ids sintéticos.
  - bancos: { step1: [...], step2ck: [...] } com as questões reais (opcional); sem eles,
    as tentativas usam questões fictícias com ids "sint-...".
  - semente: muda todos os números de uma vez.
  Devolve { participantes, revlog, estados, simulados, nbme, presenca, planos, oficiais }.
*/
export function gerarCoorte({ agora = new Date(), oficiais = [], bancos = null, semente = SEMENTE_PADRAO } = {}) {
  const hoje = dayStart(agora);
  const cardIds = oficiais.length ? [...oficiais].sort() : idsSinteticos(600);
  const res = { participantes: [], revlog: {}, estados: {}, simulados: [], nbme: [], presenca: {}, planos: {}, oficiais: cardIds };
  PERFIS.forEach((spec, n) => {
    const uid = PREFIXO_SINTETICO + spec.slug;
    const random = rng(semente + hashStr(spec.slug));
    const diasConta = spec.criada ?? spec.hist + 6;
    const criado = addDays(hoje, -diasConta);
    res.participantes.push({
      id: uid, nome: spec.nome, email: spec.slug.replace("-", ".") + "@demo.local", papel: "participante",
      criado_em: new Date(criado.getTime() + 10 * 3600000).toISOString(), sintetico: true, perfil_demo: spec.perfil, ordem: n
    });
    res.revlog[uid] = gerarRevlog(spec, uid, hoje, agora, cardIds, random);
    res.estados[uid] = gerarEstados(spec, cardIds, random);
    spec.sim.forEach((s, i) => res.simulados.push(gerarSimulado(spec, s, uid, i, hoje, bancos, random)));
    spec.nbme.forEach(([step, diasAtras, prob, escore, modo, faixa, verificada], i) => {
      const data = isoDia(addDays(hoje, -diasAtras));
      res.nbme.push({
        id: uid + "-nbme" + i, user_id: uid, step, formulario: FORMULARIOS[step][i % FORMULARIOS[step].length], modo, data,
        escore, escore_texto: "", probabilidade: prob, faixa_acima_aprovacao_baixa: faixa, observacao: "",
        verificada, verificada_por: verificada ? "demo-admin" : null, verificada_em: verificada ? addDays(hoje, -diasAtras + 1).toISOString() : null,
        criado_em: new Date(addDays(hoje, -diasAtras).getTime() + 15 * 3600000).toISOString()
      });
    });
    res.presenca[uid] = { user_id: uid, aulas_assistidas: spec.pres[0], aulas_totais: spec.pres[1], origem: "csv", atualizado_em: addDays(hoje, -1).toISOString() };
    res.planos[uid] = {
      user_id: uid,
      data_prova_step1: spec.prova1 == null ? null : isoDia(addDays(hoje, spec.prova1)),
      data_prova_step2ck: spec.prova2 == null ? null : isoDia(addDays(hoje, spec.prova2)),
      step1_aprovado: !!spec.ap1,
      step2ck_aprovado: false,
      data_matricula: isoDia(criado),
      ciclo_basico_concluido_em: null
    };
  });
  return res;
}

export const ehSintetico = (id) => String(id || "").startsWith(PREFIXO_SINTETICO);
