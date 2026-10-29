/* Road to America | banco de questões: começar um bloco (do formulário, de um atalho
   ou com as erradas de um bloco anterior) */
import { filtrarPool, validarPedidoBloco, sortearBlocoBanco, criarBlocoBanco, limiteItens } from "../../plataforma/js/banco-aluno.js";
import { toast } from "../../anki/js/ui.js";
import { gravarAndamento, gravarPrefs } from "./local.js";

async function notasDe(ctx, ids) {
  try {
    const lista = await ctx.store.listAnotacoesItem();
    const m = new Map(lista.map((a) => [a.questao_id, a.texto || ""]));
    return ids.map((id) => m.get(id) || "");
  } catch { return ids.map(() => ""); }
}

/* pedido: { step, selecao, situacao, n, modo, livre } */
export async function comecarBloco(ctx, pedido) {
  if (ctx.andamento()) throw new Error("Há um bloco em andamento. Termine ou encerre esse bloco antes de começar outro.");
  const pool = filtrarPool(ctx.banco, { step: pedido.step, selecao: pedido.selecao, situacao: pedido.situacao, historico: ctx.historico });
  const nPedido = Math.min(Number(pedido.n) || 0, limiteItens(pedido.livre));
  const erros = validarPedidoBloco({ step: pedido.step, n: nPedido, modo: pedido.modo, livre: pedido.livre, disponiveis: pool.length });
  if (erros.length) throw new Error(erros.join(" "));
  const n = Math.min(nPedido, pool.length);
  const itens = sortearBlocoBanco(pool, { n, semente: Date.now() % 2147483647, historico: ctx.historico });
  const s = criarBlocoBanco({
    step: pedido.step, itens, modo: pedido.modo, livre: pedido.livre && n > 20,
    criterios: { selecao: pedido.selecao || {}, situacao: pedido.situacao || "todas" },
    dono: ctx.dono, notas: await notasDe(ctx, itens.map((q) => q.id))
  });
  if (!gravarAndamento(s)) toast("O navegador não deixou guardar o bloco. Ele funciona, mas não volta se a página recarregar.", "aviso", 7000);
  gravarPrefs({ step: pedido.step, pedido: { ...pedido, n: nPedido } });
  if (n < nPedido) toast("Só " + n + (n === 1 ? " item atende" : " itens atendem") + " aos filtros. O bloco tem " + n + ".", "info", 6000);
  ctx.go("#/bloco");
}

/* Bloco com itens escolhidos (por exemplo, as erradas de um bloco) */
export async function comecarComIds(ctx, { step, ids, modo = "tutor" }) {
  if (ctx.andamento()) throw new Error("Há um bloco em andamento. Termine ou encerre esse bloco antes de começar outro.");
  const itens = ids.map((id) => ctx.banco.porId.get(id)).filter(Boolean).slice(0, 40);
  if (!itens.length) throw new Error("Nenhum desses itens está no banco agora.");
  const s = criarBlocoBanco({ step, itens, modo, livre: itens.length > 20, criterios: { selecao: {}, situacao: "refazer" }, dono: ctx.dono, notas: await notasDe(ctx, itens.map((q) => q.id)) });
  gravarAndamento(s);
  ctx.go("#/bloco");
}
