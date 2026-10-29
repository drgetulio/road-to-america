/* Dia de prova do simulado completo (dia-prova.js sobre plataforma/js/formularios.js)
   e gravação na camada de dados do modo demonstração. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { montarBanco } from "../../plataforma/js/banco.js";
import { montarFormularioFixo, verificarFormulario, estadoRelogio } from "../../plataforma/js/formularios.js";
import { validarProgresso, validarSessao } from "../../plataforma/js/registros.js";
import { LocalStore } from "../../anki/js/store-local.js";
import { gerarBancoSintetico } from "../../plataforma/tests/sintetico.mjs";
import {
  criarDia, comecarTutorial, comecarBloco, irParaQuestao, escolherResposta, alternarMarcada, alternarRisco, definirRealces,
  definirNotaItem, avisoDoBloco, fecharBloco, sincronizar, suspender, retomar, podeSuspender, relogioDoDia, resumoDoDia,
  maisRecente, restanteBloco, blocoExpirou, fimDoBloco, TOLERANCIA_AUSENCIA_MS, EXCEDENTE_MAX_MS
} from "../js/dia-prova.js";

const MIN = 60000;
const T0 = Date.parse("2026-10-29T12:00:00Z");
const banco = montarBanco(gerarBancoSintetico({ porStep: 600, semente: 7 }), { origem: "teste" });
const formS1 = montarFormularioFixo(banco, "step1", "S1-A", "completo");
const formCK = montarFormularioFixo(banco, "step2ck", "CK-A", "completo");
const ler = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), "utf8"));
const publicos = [...ler("../data/step1-questoes.json"), ...ler("../data/step2ck-questoes.json")];

test("formulários completos com banco suficiente: 14 blocos e 280 itens no Step 1, 16 e 318 no Step 2 CK, nas faixas", () => {
  assert.equal(formS1.blocos.length, 14);
  assert.equal(formS1.total, 280);
  assert.equal(formCK.blocos.length, 16);
  assert.equal(formCK.total, 318);
  assert.ok(formCK.blocos.every((b) => b.length <= 20));
  assert.equal(formS1.tempo.dia_ms, 8 * 60 * MIN);
  assert.equal(formCK.tempo.dia_ms, 9 * 60 * MIN);
  for (const f of [formS1, formCK]) assert.ok(verificarFormulario(f, banco.porId).ok, f.codigo);
});

test("tutorial: o que sobra dos 5 minutos vai para a pausa; pular dá os 5 minutos inteiros", () => {
  let s = criarDia(formS1);
  s = comecarTutorial(s, T0);
  s = comecarBloco(s, formS1, T0 + 2 * MIN);
  assert.equal(s.relogio.pausa_saldo_ms, 58 * MIN, "55 + 3 minutos do tutorial");
  let p = comecarBloco(criarDia(formS1), formS1, T0);
  assert.equal(p.relogio.pausa_saldo_ms, 60 * MIN, "pulou o tutorial");
  assert.equal(p.ui.bloco, 0);
  assert.equal(p.ui.riscadas.length, 20);
});

test("bloco: tempo por questão soma o tempo aberto, sem passar do fim; riscos, realces e notas ficam no estado", () => {
  let s = comecarBloco(criarDia(formS1), formS1, T0);
  s = escolherResposta(s, 0, "c", T0 + 30000);
  s = irParaQuestao(s, 1, T0 + 70000);
  s = alternarMarcada(s, 1, T0 + 80000);
  s = alternarRisco(s, 1, "A");
  s = alternarRisco(s, 1, "B");
  s = alternarRisco(s, 1, "A");
  s = definirRealces(s, 1, { vinheta: [[0, 5]], pergunta: [] });
  s = definirNotaItem(s, formS1, 1, "lembrar do potássio");
  s = irParaQuestao(s, 0, T0 + 100000);
  assert.equal(s.respostas[0][0].resposta, "C");
  assert.equal(s.respostas[0][0].tempo_ms, 70000);
  assert.equal(s.respostas[0][1].tempo_ms, 30000);
  assert.equal(s.respostas[0][1].marcada, true);
  assert.deepEqual(s.ui.riscadas[1], ["B"]);
  assert.deepEqual(s.ui.realces[1].vinheta, [[0, 5]]);
  assert.equal(s.notas[formS1.blocos[0][1]], "lembrar do potássio");
  assert.ok(s.rev > 5, "cada mudança sobe o contador");
  /* o tempo da questão aberta para no fim do bloco */
  const fim = fecharBloco(s, T0 + 45 * MIN, "participante");
  const soma = fim.respostas[0].reduce((a, r) => a + r.tempo_ms, 0);
  assert.equal(soma, 30 * MIN);
  assert.equal(fim.encerramentos[0].motivo, "tempo");
  assert.equal(fim.ui, null);
});

test("bloco encerrado não reabre: resposta depois do fim é recusada e a sobra vai para a pausa", () => {
  let s = comecarBloco(criarDia(formS1), formS1, T0);
  s = escolherResposta(s, 0, "A", T0 + MIN);
  const antes = structuredClone(s);
  s = fecharBloco(s, T0 + 20 * MIN, "participante");
  assert.equal(s.fase, "intervalo");
  assert.equal(s.encerramentos[0].sobra_ms, 10 * MIN);
  assert.equal(s.relogio.pausa_saldo_ms, 70 * MIN);
  assert.throws(() => escolherResposta(s, 0, "B", T0 + 21 * MIN), /bloco/);
  assert.deepEqual(validarProgresso(antes, s), []);
  const tentativa = structuredClone(s);
  tentativa.respostas[0][0].resposta = "E";
  assert.ok(validarProgresso(s, tentativa).length, "a camada de dados recusa mudar bloco encerrado");
  assert.deepEqual(validarSessao(formS1, s), []);
});

test("relógio do bloco: avisos de 5 e de 1 minuto, uma vez cada; expiração no instante certo", () => {
  let s = comecarBloco(criarDia(formS1), formS1, T0);
  assert.equal(restanteBloco(s, T0 + 10 * MIN), 20 * MIN);
  let r = avisoDoBloco(s, T0 + 24 * MIN);
  assert.equal(r.marco, null);
  r = avisoDoBloco(s, T0 + 25 * MIN + 1);
  assert.equal(r.marco, 5 * MIN);
  s = r.sessao;
  assert.equal(avisoDoBloco(s, T0 + 26 * MIN).marco, null);
  r = avisoDoBloco(s, T0 + 29 * MIN + 1);
  assert.equal(r.marco, MIN);
  assert.equal(blocoExpirou(r.sessao, T0 + 30 * MIN - 1), false);
  assert.equal(blocoExpirou(r.sessao, T0 + 30 * MIN), true);
  assert.equal(fimDoBloco(r.sessao), T0 + 30 * MIN);
});

test("pausa além do saldo vira débito e encurta o bloco seguinte", () => {
  let s = comecarBloco(criarDia(formS1), formS1, T0);
  s = fecharBloco(s, T0 + 30 * MIN, "tempo");
  /* saldo: 55 + 5 do tutorial pulado = 60 min; pausa de 70 min */
  const r = relogioDoDia(s, formS1, T0 + 100 * MIN);
  assert.equal(r.pausa_excedente_ms, 10 * MIN);
  assert.equal(r.proximo_bloco_ms, 20 * MIN);
  s = comecarBloco(s, formS1, T0 + 100 * MIN);
  assert.equal(s.relogio.bloco_limite_ms, 20 * MIN);
  assert.equal(restanteBloco(s, T0 + 100 * MIN), 20 * MIN);
});

test("parar e continuar depois: só entre blocos; o tempo parado não consome a pausa", () => {
  let s = comecarBloco(criarDia(formS1), formS1, T0);
  assert.equal(podeSuspender(s), false);
  assert.throws(() => suspender(s, T0 + MIN), /entre blocos/);
  s = fecharBloco(s, T0 + 30 * MIN, "tempo");
  s = suspender(s, T0 + 40 * MIN);
  assert.throws(() => comecarBloco(s, formS1, T0 + 50 * MIN), /Retome/);
  const parado = relogioDoDia(s, formS1, T0 + 3 * 24 * 60 * MIN);
  assert.equal(parado.pausa_saldo_ms, 50 * MIN, "o saldo congela no instante da parada");
  assert.equal(parado.dia_decorrido_ms, 40 * MIN);
  s = retomar(s, T0 + 3 * 24 * 60 * MIN);
  const depois = relogioDoDia(s, formS1, T0 + 3 * 24 * 60 * MIN + 5 * MIN);
  assert.equal(depois.pausa_saldo_ms, 45 * MIN, "a pausa volta a correr de onde parou");
  assert.equal(depois.dia_decorrido_ms, 45 * MIN);
  assert.equal(s.suspensoes.length, 1);
  s = comecarBloco(s, formS1, T0 + 3 * 24 * 60 * MIN + 5 * MIN);
  assert.equal(s.relogio.bloco_limite_ms, 30 * MIN);
});

test("página fechada com o bloco aberto: ao voltar, o bloco fecha pelo tempo e o dia fica parado no fim dele", () => {
  let s = comecarBloco(criarDia(formS1), formS1, T0);
  s = escolherResposta(s, 0, "B", T0 + MIN);
  const cedo = sincronizar(s, T0 + 10 * MIN);
  assert.equal(cedo.fechou, false);
  const logo = sincronizar(s, T0 + 30 * MIN + TOLERANCIA_AUSENCIA_MS - 1000);
  assert.equal(logo.fechou, true);
  assert.equal(logo.suspendeu, false, "dentro da tolerância, a pausa corre normalmente");
  const tarde = sincronizar(s, T0 + 5 * 60 * MIN);
  assert.equal(tarde.fechou, true);
  assert.equal(tarde.suspendeu, true);
  assert.equal(tarde.sessao.encerramentos[0].motivo, "tempo");
  assert.equal(tarde.sessao.respostas[0][0].resposta, "B");
  const r = relogioDoDia(tarde.sessao, formS1, T0 + 5 * 60 * MIN);
  assert.equal(r.pausa_saldo_ms, 60 * MIN, "a ausência não gastou a pausa");
  assert.equal(r.pausa_excedente_ms, 0);
});

test("página fechada na pausa: a volta no dia seguinte para o dia quando o saldo acabou e não zera os blocos seguintes", () => {
  let s = comecarBloco(criarDia(formS1), formS1, T0);
  s = fecharBloco(s, T0 + 20 * MIN);
  /* saldo: 55 + 5 do tutorial pulado + 10 de sobra = 70 min; acabou em T0 + 90 min */
  const dentro = sincronizar(s, T0 + 90 * MIN + TOLERANCIA_AUSENCIA_MS - 1000);
  assert.equal(dentro.suspendeu, false, "até 2 minutos além do saldo, vale como débito");
  const r = sincronizar(s, T0 + 24 * 60 * MIN);
  assert.equal(r.suspendeu, true);
  assert.equal(r.motivo, "pausa");
  assert.equal(Date.parse(r.sessao.suspensa.desde), T0 + 90 * MIN);
  const volta = T0 + 24 * 60 * MIN + 5 * MIN;
  const s2 = comecarBloco(retomar(r.sessao, volta), formS1, volta);
  assert.equal(s2.relogio.bloco_limite_ms, 30 * MIN, "a ausência não vira débito");
  assert.equal(s2.relogio.debito_ms, 0);
  assert.equal(resumoDoDia(s2, formS1).suspensoes, 1);
  assert.equal(sincronizar(r.sessao, volta).suspendeu, false, "dia já parado não para de novo");
});

test("pausa além do saldo com a página aberta: débito até 10 minutos, depois o dia para", () => {
  let s = comecarBloco(criarDia(formS1), formS1, T0);
  s = fecharBloco(s, T0 + 30 * MIN);
  /* saldo de 55 + 5 do tutorial pulado = 60 min, acabou em T0 + 90 min */
  assert.equal(sincronizar(s, T0 + 90 * MIN + 9 * MIN, { paginaAberta: true }).suspendeu, false);
  const r = sincronizar(s, T0 + 90 * MIN + 40 * MIN, { paginaAberta: true });
  assert.equal(r.suspendeu, true);
  assert.equal(Date.parse(r.sessao.suspensa.desde), T0 + 90 * MIN + EXCEDENTE_MAX_MS);
  const volta = T0 + 6 * 60 * MIN;
  const ret = retomar(r.sessao, volta);
  assert.equal(sincronizar(ret, volta + 30000, { paginaAberta: true }).suspendeu, false, "o débito já cobrado não para o dia de novo na volta");
  assert.equal(relogioDoDia(ret, formS1, volta).pausa_excedente_ms, EXCEDENTE_MAX_MS);
  const s2 = comecarBloco(ret, formS1, volta);
  assert.equal(s2.relogio.bloco_limite_ms, 20 * MIN, "os 10 minutos além do saldo saem do bloco seguinte");
});

test("tutorial deixado aberto com a página fechada: o excesso gasta a pausa e o dia para quando o saldo zera", () => {
  const s = comecarTutorial(criarDia(formS1), T0);
  assert.equal(sincronizar(s, T0 + 30 * MIN).suspendeu, false, "dentro do saldo, o tempo corre como pausa");
  const r = sincronizar(s, T0 + 10 * 60 * MIN);
  assert.equal(r.motivo, "tutorial");
  assert.equal(r.sessao.fase, "intervalo");
  assert.equal(r.sessao.bloco_atual, 0);
  assert.equal(Date.parse(r.sessao.suspensa.desde), T0 + 60 * MIN, "5 do tutorial + 55 de pausa");
  assert.equal(relogioDoDia(r.sessao, formS1, T0 + 10 * 60 * MIN).dia_decorrido_ms, 60 * MIN);
  const volta = T0 + 11 * 60 * MIN;
  const s2 = comecarBloco(retomar(r.sessao, volta), formS1, volta);
  assert.equal(s2.relogio.bloco_limite_ms, 30 * MIN, "a ausência não vira débito");
  assert.equal(s2.relogio.tutorial_usado_ms, 5 * MIN);
  assert.equal(s2.relogio.pausa_saldo_ms, 0);
  assert.equal(relogioDoDia(s2, formS1, volta).dia_decorrido_ms, 60 * MIN);
});

test("tutorial esquecido com a página aberta: gasta a pausa, débito de 10 minutos e o dia para", () => {
  const s = comecarTutorial(criarDia(formS1), T0);
  /* 5 do tutorial + 55 de pausa + 10 de débito = 70 minutos */
  assert.equal(sincronizar(s, T0 + 70 * MIN, { paginaAberta: true }).suspendeu, false);
  const r = sincronizar(s, T0 + 5 * 60 * MIN, { paginaAberta: true });
  assert.equal(r.motivo, "tutorial");
  const volta = T0 + 6 * 60 * MIN;
  const ret = retomar(r.sessao, volta);
  assert.equal(sincronizar(ret, volta + 60000, { paginaAberta: true }).suspendeu, false);
  const s2 = comecarBloco(ret, formS1, volta);
  assert.equal(s2.relogio.bloco_limite_ms, 20 * MIN, "só os 10 minutos de débito saem do bloco 1");
  assert.equal(s2.relogio.pausa_saldo_ms, 0);
});

test("dia inteiro do Step 2 CK: 16 blocos, fecha com resumo coerente e o relógio oficial confere", () => {
  let s = criarDia(formCK);
  let t = T0;
  s = comecarTutorial(s, t);
  t += 4 * MIN;
  for (let b = 0; b < 16; b++) {
    s = comecarBloco(s, formCK, t);
    const n = formCK.blocos[b].length;
    for (let i = 0; i < n; i++) {
      s = irParaQuestao(s, i, t);
      s = escolherResposta(s, i, banco.porId.get(formCK.blocos[b][i]).correta, t + 50000);
      t += 75000;
    }
    s = fecharBloco(s, t, "participante");
    if (b < 15) {
      if (b === 7) { s = suspender(s, t + MIN); s = retomar(s, t + 600 * MIN); t += 600 * MIN; }
      t += 3 * MIN;
    }
  }
  assert.equal(s.fase, "concluido");
  const d = resumoDoDia(s, formCK);
  assert.equal(d.blocos_encerrados, 16);
  assert.equal(d.encerrados_por_tempo, 0);
  assert.equal(d.suspensoes, 1);
  assert.equal(d.tutorial_usado_ms, 4 * MIN);
  assert.equal(d.pausa_disponivel_ms, 55 * MIN + MIN + d.sobra_blocos_ms);
  const usado = s.respostas.flat().reduce((a, r) => a + r.tempo_ms, 0);
  assert.equal(usado, d.tempo_em_blocos_ms, "o tempo por item soma o tempo dos blocos");
  assert.ok(d.dia_ms < formCK.tempo.dia_ms, "o tempo parado não entra no dia");
  assert.equal(estadoRelogio(s, t).fase, "concluido");
});

test("cópia do navegador só vence se for mais nova, do mesmo formulário e sem reabrir bloco", () => {
  let a = comecarBloco(criarDia(formS1), formS1, T0);
  const b = escolherResposta(a, 0, "A", T0 + MIN);
  assert.equal(maisRecente(a, b), b);
  assert.equal(maisRecente(b, a), b);
  assert.equal(maisRecente(a, null), a);
  const outro = { ...b, formulario_id: "x" };
  assert.equal(maisRecente(a, outro), a);
  const fechado = fecharBloco(b, T0 + 2 * MIN);
  const reaberto = { ...structuredClone(a), rev: fechado.rev + 5 };
  assert.equal(maisRecente(fechado, reaberto), fechado);
});

test("camada de dados (demonstração): cria, grava o progresso com o estado da tela, recusa reabrir bloco e conclui", async () => {
  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  const store = new LocalStore({ storage, bancosSimulado: { step1: [], step2ck: [] }, questoes: publicos });
  await store.init({ seeds: [] });
  store.setDemoRole("participante");
  const bp = montarBanco(publicos, { origem: "teste" });
  const form = montarFormularioFixo(bp, "step1", "S1-A", "prontidao");
  assert.equal(form.reduzido, true, "40 itens públicos: versão reduzida");
  let s = criarDia(form);
  const reg = await store.criarSimuladoCompleto({ formulario: form, sessao: s });
  s = comecarBloco(s, form, Date.now() - 10 * MIN);
  s = escolherResposta(s, 0, "A", Date.now() - 9 * MIN);
  s = definirNotaItem(s, form, 0, "nota");
  await store.salvarProgressoSimulado(reg.id, s);
  const fechado = fecharBloco(s, Date.now() - 5 * MIN);
  await store.salvarProgressoSimulado(reg.id, fechado);
  await assert.rejects(() => store.salvarProgressoSimulado(reg.id, s), /reabre|encerrado/);
  const lido = await store.getSimuladoCompleto(reg.id);
  assert.equal(lido.sessao.notas[form.blocos[0][0]], "nota");
  assert.equal(lido.bloco_atual, 1);
});
