/* Integração com o banco completo (banco-privado/, fora do git; sem a pasta, o teste é
   pulado): os arquivos gravados banco-privado/formularios.json e
   banco-privado/relatorio-banco.md precisam corresponder aos lotes atuais.
   1. Recalcula, a partir dos lotes, as proporções de cada formulário gravado (sistema,
      competência, disciplinas, dificuldade), a dificuldade por bloco, o gabarito, o corte
      provisório e os pares inimigos, e compara com o que formularios.json diz.
   2. Confere os pares inimigos nos lotes: nenhum candidato sem decisão, campo completo
      nos dois itens de cada par e nenhum par dentro de um formulário fixo.
   3. Remonta os formulários com a ferramenta (formularios.mjs, determinística) e compara
      com o arquivo gravado, menos a data.
   4. Gera o relatório (relatorio.mjs) e compara com relatorio-banco.md.
   Qualquer mudança nos lotes sem rodar de novo formularios.mjs --gravar e relatorio.mjs
   faz o teste falhar. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assinaturaBanco } from "../js/banco.js";
import { verificarFormulario, montarFormularioFixo, mapaInimigos, paresInimigosEm, FORMULARIOS_FIXOS } from "../js/formularios.js";

const raiz = fileURLToPath(new URL("../../", import.meta.url));
const bp = raiz + "banco-privado/";
const temBanco = existsSync(bp + "formularios.json") && existsSync(bp + "ferramentas/lib-banco.mjs") && readdirSync(bp).some((n) => /^step/.test(n));
const pular = temBanco ? false : "sem banco-privado/ (lotes, formularios.json e ferramentas)";
const arred = (x, c) => Math.round(x * 10 ** c) / 10 ** c;

let cache = null;
async function carregar() {
  if (cache) return cache;
  const lib = await import(bp + "ferramentas/lib-banco.mjs");
  const { banco } = await lib.carregarComoPlataforma();
  const lotes = lib.lerLotes();
  const gravado = JSON.parse(readFileSync(bp + "formularios.json", "utf8"));
  cache = { lib, banco, lotes, itensLotes: lotes.flatMap((l) => l.itens), gravado };
  return cache;
}

test("formularios.json: proporções, dificuldade, gabarito, corte e inimigos recalculados a partir dos lotes", { skip: pular }, async () => {
  const { banco, itensLotes, gravado } = await carregar();
  const porIdLote = new Map(itensLotes.map((q) => [q.id, q]));
  for (const step of ["step1", "step2ck"]) {
    const pool = banco.steps[step].filter((q) => q.status === undefined || q.status === "ativo");
    assert.equal(gravado.assinatura_banco[step], assinaturaBanco(pool), step + ": assinatura do banco (ids e versões) diferente da gravada; rode formularios.mjs --gravar");
    const registros = Object.values(gravado[step]);
    assert.equal(registros.length, FORMULARIOS_FIXOS[step].length);
    const usados = new Set();
    /* inimigos lidos direto dos lotes (os dois sentidos) mais os do banco carregado */
    const inim = mapaInimigos(pool);
    for (const r of registros) {
      const ids = r.blocos_itens.flat();
      assert.equal(ids.length, r.itens, r.codigo + ": total");
      assert.equal(r.blocos_itens.length, r.blocos, r.codigo + ": blocos");
      assert.deepEqual(r.blocos_itens.map((b) => b.length), r.tamanhos_dos_blocos, r.codigo + ": tamanhos dos blocos");
      for (const id of ids) { assert.ok(!usados.has(id), r.codigo + ": item repetido entre formulários " + id); usados.add(id); }
      for (const id of ids) assert.ok(banco.porId.has(id), r.codigo + ": item fora do banco " + id);
      const form = { step, codigo: r.codigo, blocos: r.blocos_itens, parcial: r.parcial, reduzido: false, oficial: { itens: step === "step1" ? 280 : 318, blocos: step === "step1" ? 14 : 16 } };
      const v = verificarFormulario(form, banco.porId);
      assert.equal(v.ok, r.dentro_das_faixas, r.codigo + ": situação nas faixas");
      assert.deepEqual(v.problemas, r.problemas, r.codigo + ": problemas");
      /* proporções de cada dimensão, como formularios.mjs grava */
      for (const [d, lista] of Object.entries(v.dimensoes)) {
        if (["area", "tarefa"].includes(d)) continue;
        const esperado = Object.fromEntries(lista.filter((x) => x.n || x.faixa).map((x) => [x.chave, { n: x.n, pct: arred(100 * x.pct, 1), ...(x.n_multirrotulo !== undefined ? { n_todos_os_rotulos: x.n_multirrotulo } : {}) }]));
        const gravadoD = Object.fromEntries(Object.entries(r.proporcoes[d] || {}).map(([k, x]) => [k, { n: x.n, pct: x.pct, ...(x.n_todos_os_rotulos !== undefined ? { n_todos_os_rotulos: x.n_todos_os_rotulos } : {}) }]));
        assert.deepEqual(gravadoD, esperado, r.codigo + ": proporções de " + d + " desatualizadas em formularios.json");
      }
      /* dificuldade contada direto nos lotes (itens privados) e no banco (públicos) */
      const dif = { facil: 0, media: 0, dificil: 0 };
      for (const id of ids) dif[(porIdLote.get(id) || banco.porId.get(id)).dificuldade]++;
      for (const k of Object.keys(dif)) assert.equal(r.proporcoes.dificuldade[k]?.n || 0, dif[k], r.codigo + ": itens " + k + " pelos lotes");
      assert.deepEqual(r.dificuldade_por_bloco, v.blocos.map((b) => b.por_dificuldade), r.codigo + ": dificuldade por bloco");
      const gab = {};
      for (const id of ids) { const l = banco.porId.get(id).correta; gab[l] = (gab[l] || 0) + 1; }
      assert.deepEqual(r.gabarito_total, gab, r.codigo + ": gabarito");
      assert.equal(r.corte_angoff, arred(v.corte.angoff_medio, 3), r.codigo + ": corte provisório");
      /* inimigos: nenhum par dentro do formulário, contando os dois sentidos do campo */
      assert.deepEqual(paresInimigosEm(ids, inim), [], r.codigo + ": par inimigo no mesmo formulário");
      assert.equal(r.pares_inimigos_no_formulario, 0);
      assert.equal(r.omitidos_por_inimigos, r.parcial ? 0 : form.oficial.itens - ids.length, r.codigo + ": itens a menos por inimigos");
      /* a plataforma abre exatamente o gravado */
      const f = montarFormularioFixo(banco, step, r.codigo, "completo");
      assert.equal(f.origem_montagem, "gravado", r.codigo + ": a plataforma não abre o formulário gravado");
      assert.deepEqual(f.blocos, r.blocos_itens);
    }
  }
});

test("inimigos nos lotes: candidatos decididos, campo completo nos dois itens de cada par", { skip: pular }, async () => {
  const { itensLotes } = await carregar();
  const { paresInimigos, faltasNoCampo } = await import(bp + "ferramentas/inimigos.mjs");
  const { pares, pendentes } = paresInimigos(itensLotes);
  assert.deepEqual(pendentes.map((p) => p.a + " x " + p.b), [], "par candidato sem decisão em decisoes-inimigos.json");
  assert.ok(pares.length > 0);
  const falta = faltasNoCampo(itensLotes, pares);
  assert.deepEqual([...falta.keys()], [], "campo inimigos incompleto (rode ferramentas/inimigos.mjs --gravar)");
});

test("formularios.json é o que formularios.mjs gera com os lotes atuais", { skip: pular }, async () => {
  const { banco, gravado } = await carregar();
  const { gerarFormularios } = await import(bp + "ferramentas/formularios.mjs");
  const { saida, erros } = await gerarFormularios({ bancoCarregado: banco, silencioso: true });
  assert.equal(erros, 0, "formulários fora das faixas ou com sobreposição");
  const semData = (x) => ({ ...x, gerado_em: null });
  assert.deepEqual(semData(JSON.parse(JSON.stringify(saida))), semData(gravado), "formularios.json desatualizado (rode formularios.mjs --gravar)");
});

test("relatorio-banco.md é o que relatorio.mjs gera com os lotes e formularios.json atuais", { skip: pular }, async () => {
  const { banco } = await carregar();
  const { gerarRelatorio } = await import(bp + "ferramentas/relatorio.mjs");
  const texto = await gerarRelatorio({ bancoCarregado: banco });
  const arquivo = readFileSync(bp + "relatorio-banco.md", "utf8");
  if (texto !== arquivo) {
    const a = texto.split("\n"), b = arquivo.split("\n");
    const i = a.findIndex((l, k) => l !== b[k]);
    assert.fail("relatorio-banco.md desatualizado (rode relatorio.mjs); primeira linha diferente " + (i + 1) + ":\n  gerado:  " + a[i] + "\n  gravado: " + b[i]);
  }
});
