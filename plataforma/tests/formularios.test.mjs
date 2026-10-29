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
        const N = TIPOS_FORMULARIO[tipo][step].itens;
        const sobra = banco.steps[step].length - N;
        if (codigo.endsWith("-B") && sobra < N) {
          /* o B fica com o restante do banco, sem repetir item do A, e sai como parcial */
          assert.equal(f.parcial, true);
          assert.equal(f.total, sobra);
          assert.equal(f.blocos.length, Math.ceil(sobra / 20));
          assert.match(f.motivo_parcial, /parcial/);
          const a = new Set(montarFormularioFixo(banco, step, FORMULARIOS_FIXOS[step][0].codigo, tipo).blocos.flat());
          assert.equal(f.blocos.flat().filter((id) => a.has(id)).length, 0, "sem sobreposição com o A");
        } else {
          assert.equal(f.parcial, false);
          assert.equal(f.total, N);
          assert.equal(f.blocos.length, TIPOS_FORMULARIO[tipo][step].blocos);
        }
        assert.ok(v.ok, step + " " + tipo + " " + codigo + ": " + v.problemas.join(" | "));
        assert.ok(v.equilibrio.dp_entre_blocos < 0.01, "Angoff médio parecido entre blocos (" + v.equilibrio.dp_entre_blocos + ")");
        const exigidas = Object.values(v.dimensoes).flat().filter((x) => x.exigida);
        assert.ok(exigidas.length >= 14, "sistemas e competências ou tarefas conferidos");
        /* no parcial do banco sintético (500 por Step) as faixas são meta: bioestatística
           tem 15 itens, que não cabem em 4% de dois formulários */
        if (!f.parcial) assert.ok(exigidas.every((x) => x.dentro));
        for (const b of v.blocos) {
          const d = b.por_dificuldade;
          assert.ok(d.facil > 0 && d.media > 0 && d.dificil > 0, "cada bloco tem as três dificuldades");
        }
      }
    }
  }
});

test("formulário fixo reproduzível pela semente; B não repete item do A; personalizado prioriza não vistos", () => {
  const a1 = montarFormularioFixo(banco, "step1", "S1-A");
  const a2 = montarFormularioFixo(banco, "step1", "S1-A");
  assert.equal(a1.hash, a2.hash);
  assert.deepEqual(a1.blocos, a2.blocos);
  assert.equal(a1.id, a2.id);
  const b = montarFormularioFixo(banco, "step1", "S1-B");
  assert.notEqual(a1.hash, b.hash);
  const emA = new Set(a1.blocos.flat());
  const sobreposicao = b.blocos.flat().filter((id) => emA.has(id)).length;
  assert.equal(sobreposicao, 0, "A e B formam uma partição: nenhum item repetido");
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

/* ---------- rodada 4: pares inimigos nos formulários fixos e personalizados ---------- */
import { mapaInimigos, paresInimigosEm, montarParticao, MIN_ITENS_POR_BLOCO_COMPLETO } from "../js/formularios.js";
import { normalizarFormulariosGravados } from "../js/banco.js";
import { rng as rngT } from "../js/simulado.js";

/* banco sintético com pares inimigos gravados num lado só e um trio (três itens que se
   entregam): com 560 itens no Step 1 e dois formulários de 280, o trio obriga um item a
   ficar fora dos dois */
function bancoComInimigos(porStep, semente) {
  const brutos = gerarBancoSintetico({ porStep, semente });
  const r = rngT(semente + 7);
  const porStep_ = { step1: brutos.filter((q) => q.step === "step1"), step2ck: brutos.filter((q) => q.step === "step2ck") };
  const pares = [];
  for (const step of ["step1", "step2ck"]) {
    const L = porStep_[step];
    for (let k = 0; k < 40; k++) {
      const a = L[Math.floor(r() * L.length)];
      const mesmos = L.filter((q) => q.sistema === a.sistema && q.id !== a.id);
      const b = mesmos[Math.floor(r() * mesmos.length)];
      (a.inimigos ||= []).push(b.id); /* só um lado: a plataforma lê nos dois sentidos */
      pares.push([a.id, b.id]);
    }
    const [x, y, z] = L.filter((q) => q.sistema === L[0].sistema).slice(0, 3);
    (x.inimigos ||= []).push(y.id, z.id); (y.inimigos ||= []).push(z.id);
  }
  return { banco: montarBanco(brutos), pares };
}

test("pares inimigos: nunca no mesmo formulário fixo nem no personalizado; um trio tira um item do B, que continua no formato", () => {
  const { banco: b560 } = bancoComInimigos(560, 41);
  for (const step of ["step1"]) {
    const inim = mapaInimigos(b560.steps[step]);
    assert.ok(inim.size > 60, "pares lidos nos dois sentidos");
    const [cA, cB] = FORMULARIOS_FIXOS[step].map((f) => f.codigo);
    const A = montarFormularioFixo(b560, step, cA, "completo"), B = montarFormularioFixo(b560, step, cB, "completo");
    const idsA = A.blocos.flat(), idsB = B.blocos.flat();
    assert.deepEqual(paresInimigosEm(idsA, inim), [], "nenhum par no A");
    assert.deepEqual(paresInimigosEm(idsB, inim), [], "nenhum par no B");
    assert.equal(idsA.filter((id) => new Set(idsB).has(id)).length, 0, "A e B sem itens em comum");
    assert.equal(A.total, 280);
    assert.ok(B.total < 280 && B.total >= 14 * MIN_ITENS_POR_BLOCO_COMPLETO, "o trio tira item do B: " + B.total);
    assert.equal(B.parcial, false);
    assert.equal(B.blocos.length, 14);
    assert.ok(B.blocos.every((x) => x.length >= 19 && x.length <= 20));
    assert.equal(B.omitidos_por_inimigos, 280 - B.total);
    assert.equal(B.particao.omitidos_do_b_por_inimigos.length, 280 - B.total);
    const vB = verificarFormulario(B, b560.porId);
    /* o banco sintético de 560 tem a composição sorteada, sem folga para dois formulários
       nas faixas; aqui só interessa que o tamanho e os pares estejam certos */
    assert.ok(!vB.problemas.some((x) => /inimigos|Total|blocos/.test(x)), vB.problemas.join(" | "));
    assert.ok(vB.avisos.some((a) => /pares inimigos impediram/.test(a)));
    assert.deepEqual(vB.pares_inimigos, []);
    /* gravação com par inimigo dentro é recusada: o formulário é recalculado */
    const p1 = idsA.find((id) => inim.has(id));
    const p2 = [...inim.get(p1)][0];
    const troca = idsA.find((x) => x !== p1 && !inim.has(x));
    const blocosRuins = A.blocos.map((bl) => bl.map((id) => (id === troca ? p2 : id)));
    const ids2 = blocosRuins.flat();
    assert.ok(new Set(ids2).size === ids2.length && ids2.includes(p1) && ids2.includes(p2), "formulário de teste com um par inimigo dentro");
    {
      const gravado = { ...b560, formularios_fixos: normalizarFormulariosGravados({ [step]: { A: { codigo: cA, blocos_itens: blocosRuins } } }) };
      assert.equal(montarFormularioFixo(gravado, step, cA, "completo").origem_montagem, "calculado", "gravação com par inimigo não abre");
      const ok = { ...b560, formularios_fixos: normalizarFormulariosGravados({ [step]: { A: { codigo: cA, blocos_itens: A.blocos } } }) };
      assert.equal(montarFormularioFixo(ok, step, cA, "completo").origem_montagem, "gravado");
    }
    /* verificarFormulario acusa o par */
    const comPar = { ...A, blocos: blocosRuins };
    {
      const v = verificarFormulario(comPar, b560.porId);
      assert.ok(v.problemas.some((x) => /Pares inimigos no mesmo formulário/.test(x)));
    }
  }
  /* banco com folga (500 por Step): personalizado completo e os fixos sem par nenhum */
  const { banco: b500 } = bancoComInimigos(500, 52);
  for (const step of ["step1", "step2ck"]) {
    const inim = mapaInimigos(b500.steps[step]);
    for (let s = 1; s <= 3; s++) {
      const vistas = b500.steps[step].slice(0, 60 * s).map((q) => q.id);
      const P = montarFormularioPersonalizado(b500, { step, tipo: "completo", vistas, semente: 900 + s });
      assert.deepEqual(paresInimigosEm(P.blocos.flat(), inim), [], "personalizado " + step + " sem par inimigo");
      assert.ok(verificarFormulario(P, b500.porId).ok);
    }
    for (const tipo of ["completo", "meio", "prontidao"]) for (const { codigo } of FORMULARIOS_FIXOS[step]) {
      const f = montarFormularioFixo(b500, step, codigo, tipo);
      assert.deepEqual(paresInimigosEm(f.blocos.flat(), inim), [], step + " " + tipo + " " + codigo);
    }
  }
  /* partição direta: o A nunca recebe um par */
  const pool = b560.steps.step1;
  const part = montarParticao(pool, "step1", 280, 280, { semente: 3 });
  assert.deepEqual(part.conflitos.A, []);
});
