/* Montagem de formulários no formato oficial e relógio do simulado completo */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { montarBanco } from "../js/banco.js";
import {
  tamanhosBlocos, montarFormulario, montarFormularioFixo, montarFormularioPersonalizado, verificarFormulario, dimensionar,
  TIPOS_FORMULARIO, TEMPOS_OFICIAIS, FORMULARIOS_FIXOS,
  novaSessao, iniciarTutorial, iniciarBloco, encerrarBloco, responder, atualizarSessao, estadoRelogio, corrigirSessao
} from "../js/formularios.js";
import { validarProgresso, validarSessao, validarFormularioGravado } from "../js/registros.js";
import { gerarBancoSintetico } from "./sintetico.mjs";

const ler = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), "utf8"));
const bancoDemo = montarBanco([...ler("../../simulado/data/step1-questoes.json"), ...ler("../../simulado/data/step2ck-questoes.json")]);
const banco = montarBanco(gerarBancoSintetico({ porStep: 500, semente: 99 }));
const MIN = 60000;

test("blocos no formato oficial: 280 em 14 de 20; 318 em 16 (14 de 20 e 2 de 19); dia de 8 h e 9 h", () => {
  assert.deepEqual(tamanhosBlocos(280, 14), Array(14).fill(20));
  assert.deepEqual(tamanhosBlocos(318, 16), [...Array(14).fill(20), 19, 19]);
  assert.deepEqual(tamanhosBlocos(159, 8), [...Array(7).fill(20), 19]);
  assert.throws(() => tamanhosBlocos(300, 14), /20 itens/);
  const c = TIPOS_FORMULARIO.completo;
  assert.equal(14 * TEMPOS_OFICIAIS.bloco_ms + c.pausa_ms + c.tutorial_ms, TEMPOS_OFICIAIS.dia_ms.step1);
  assert.equal(16 * TEMPOS_OFICIAIS.bloco_ms + c.pausa_ms + c.tutorial_ms, TEMPOS_OFICIAIS.dia_ms.step2ck);
});

test("montagem com banco de 1000 itens: todos os tipos dentro das faixas oficiais e equilibrados entre blocos", () => {
  for (const step of ["step1", "step2ck"]) {
    for (const tipo of ["completo", "meio", "prontidao"]) {
      for (const { codigo } of FORMULARIOS_FIXOS[step]) {
        const f = montarFormularioFixo(banco, step, codigo, tipo);
        const v = verificarFormulario(f, banco.porId);
        assert.equal(f.reduzido, false);
        assert.equal(f.total, TIPOS_FORMULARIO[tipo][step].itens);
        assert.equal(f.blocos.length, TIPOS_FORMULARIO[tipo][step].blocos);
        assert.ok(v.ok, step + " " + tipo + " " + codigo + ": " + v.problemas.join(" | "));
        assert.ok(v.equilibrio.dp_entre_blocos < 0.01, "Angoff médio parecido entre blocos (" + v.equilibrio.dp_entre_blocos + ")");
        const exigidas = Object.values(v.dimensoes).flat().filter((x) => x.exigida);
        assert.ok(exigidas.length >= 14, "sistemas e competências ou tarefas conferidos");
        assert.ok(exigidas.every((x) => x.dentro));
        for (const b of v.blocos) {
          const d = b.por_dificuldade;
          assert.ok(d.facil > 0 && d.media > 0 && d.dificil > 0, "cada bloco tem as três dificuldades");
        }
      }
    }
  }
});

test("formulário fixo reproduzível pela semente; B evita A; personalizado prioriza não vistos", () => {
  const a1 = montarFormularioFixo(banco, "step1", "S1-A");
  const a2 = montarFormularioFixo(banco, "step1", "S1-A");
  assert.equal(a1.hash, a2.hash);
  assert.deepEqual(a1.blocos, a2.blocos);
  assert.equal(a1.id, a2.id);
  const b = montarFormularioFixo(banco, "step1", "S1-B");
  assert.notEqual(a1.hash, b.hash);
  const emA = new Set(a1.blocos.flat());
  const sobreposicao = b.blocos.flat().filter((id) => emA.has(id)).length;
  assert.ok(sobreposicao <= 2 * 280 - 500 + 25, "sobreposição perto do mínimo possível (" + sobreposicao + ")");
  const vistas = banco.steps.step1.slice(0, 200).map((q) => q.id);
  const p = montarFormularioPersonalizado(banco, { step: "step1", tipo: "completo", vistas });
  const vistasSet = new Set(vistas);
  const repetidas = p.blocos.flat().filter((id) => vistasSet.has(id)).length;
  assert.ok(repetidas <= 20, "personalizado repete poucas vistas (" + repetidas + ")");
  assert.ok(verificarFormulario(p, banco.porId).ok, "e continua dentro das faixas");
  assert.ok(montarFormularioPersonalizado(banco, { step: "step1", tipo: "prontidao", vistas }).blocos.flat().every((id) => !vistasSet.has(id)), "com folga, nenhuma vista");
  /* mudar o banco muda a assinatura do formulário */
  const outro = montarBanco(gerarBancoSintetico({ porStep: 499, semente: 99 }));
  assert.notEqual(montarFormularioFixo(outro, "step1", "S1-A").assinatura_banco, a1.assinatura_banco);
});

test("banco com composição distorcida continua dentro das faixas quando há itens suficientes", () => {
  const torto = montarBanco(gerarBancoSintetico({ porStep: 600, semente: 7, distorcer: { step1: { cardiovascular: 3, bioestatistica: 0.7 }, step2ck: { respiratorio: 3, endocrino: 0.6 } } }));
  for (const step of ["step1", "step2ck"]) {
    const f = montarFormularioFixo(torto, step, step === "step1" ? "S1-A" : "CK-A");
    const v = verificarFormulario(f, torto.porId);
    assert.ok(v.ok, v.problemas.join(" | "));
  }
});

test("banco de demonstração (40 por Step): versões reduzidas sinalizadas, 2 blocos de 20, sem repetir item", () => {
  for (const step of ["step1", "step2ck"]) {
    for (const tipo of ["completo", "meio", "prontidao"]) {
      const f = montarFormularioFixo(bancoDemo, step, step === "step1" ? "S1-A" : "CK-A", tipo);
      assert.equal(f.reduzido, true);
      assert.match(f.motivo_reducao, /Versão reduzida/);
      assert.deepEqual(f.blocos.map((b) => b.length), [20, 20]);
      assert.equal(new Set(f.blocos.flat()).size, 40);
      assert.deepEqual(validarFormularioGravado(f), []);
    }
  }
  assert.deepEqual(dimensionar("step1", "completo", 15), { blocos: 1, itens: 15, reduzido: true, motivo: dimensionar("step1", "completo", 15).motivo });
});

test("dentro de cada bloco, itens seguidos do mesmo sistema só quando não há como evitar", () => {
  const f = montarFormularioFixo(banco, "step2ck", "CK-B");
  for (const b of f.blocos) {
    const s = b.map((id) => banco.porId.get(id).sistema);
    const seguidos = s.filter((x, i) => i && x === s[i - 1]).length;
    assert.ok(seguidos <= 1, "seguidos: " + seguidos);
  }
});

test("relógio: tutorial e sobra de bloco vão para a pausa; pausa além do saldo desconta do bloco seguinte; bloco encerrado não reabre", () => {
  const f = montarFormularioFixo(bancoDemo, "step1", "S1-A");
  let s = novaSessao(f);
  assert.deepEqual(validarSessao(f, s), []);
  const t0 = Date.UTC(2026, 9, 29, 8, 0);
  s = iniciarTutorial(s, t0);
  s = iniciarBloco(s, t0 + 2 * MIN);                     /* tutorial de 2 min: sobram 3 para a pausa */
  assert.equal(s.relogio.pausa_saldo_ms, 58 * MIN);
  s = responder(s, 0, { resposta: f.blocos[0].length ? bancoDemo.porId.get(f.blocos[0][0]).correta : "A", tempo_ms_add: 70000 }, t0 + 3 * MIN);
  s = responder(s, 1, { marcada: true }, t0 + 4 * MIN);
  assert.throws(() => responder(s, 25, { resposta: "A" }, t0 + 4 * MIN), /fora do bloco/);
  s = encerrarBloco(s, t0 + 22 * MIN);                   /* 20 min usados: sobram 10 */
  assert.equal(s.relogio.pausa_saldo_ms, 68 * MIN);
  assert.equal(s.fase, "intervalo");
  assert.throws(() => responder(s, 0, { resposta: "B" }, t0 + 23 * MIN), /Não há bloco/);
  const st = estadoRelogio(s, t0 + 22 * MIN + 70 * MIN);  /* 70 min de intervalo: 2 min além */
  assert.equal(st.pausa_saldo_ms, 0);
  assert.equal(st.pausa_excedente_ms, 2 * MIN);
  const anterior = s;
  s = iniciarBloco(s, t0 + 92 * MIN);
  assert.equal(s.relogio.bloco_limite_ms, 28 * MIN, "o excedente sai do bloco seguinte");
  assert.deepEqual(validarProgresso(anterior, s), []);
  const adulterada = JSON.parse(JSON.stringify(s));
  adulterada.respostas[0][0].resposta = "E";
  assert.match(validarProgresso(s, adulterada).join(" "), /encerrado/);
  assert.match(validarProgresso(s, { ...s, bloco_atual: 0 }).join(" "), /não reabre/);
  /* o tempo acaba com a página fechada: a retomada encerra o bloco no limite */
  const depois = atualizarSessao(s, t0 + 92 * MIN + 40 * MIN);
  assert.equal(depois.fase, "concluido");
  assert.equal(depois.encerramentos[1].motivo, "tempo");
  assert.equal(depois.encerramentos[1].usado_ms, 28 * MIN);
  const { resultado, respostas } = corrigirSessao(f, depois, bancoDemo.porId, { sessaoId: "sc-1" });
  assert.equal(resultado.total, 40);
  assert.equal(resultado.acertos, 1);
  assert.equal(resultado.em_branco, 39);
  assert.equal(respostas.length, 40);
  assert.ok(respostas.every((r) => r.origem === "simulado" && r.modo === "cronometrado" && r.sessao_id === "sc-1"));
  assert.equal(respostas[1].marcada, true);
  assert.equal(respostas[0].tempo_ms, 70000);
});

test("relógio: pular o tutorial dá os 5 minutos à pausa; o formulário de prontidão não tem tutorial", () => {
  const f = montarFormularioFixo(bancoDemo, "step2ck", "CK-A", "completo");
  const s = iniciarBloco(novaSessao(f), 0);
  assert.equal(s.relogio.pausa_saldo_ms, 60 * MIN);
  const pr = montarFormularioFixo(bancoDemo, "step1", "S1-A", "prontidao");
  assert.throws(() => iniciarTutorial(novaSessao(pr), 0), /não tem tutorial/);
  assert.equal(pr.tempo.dia_ms, pr.blocos.length * 30 * MIN + 15 * MIN);
});
