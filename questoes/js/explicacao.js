/* Road to America | banco de questões: explicação de um item (modo tutor, depois de
   confirmar a resposta, e revisão do bloco encerrado) e reporte de erro no item. */
import { MOTIVOS_REPORTE, LIMITE_REPORTE } from "../../plataforma/js/registros.js";
import { e, icon, dialog, toast } from "../../anki/js/ui.js";
import { nome, ROTULO_DIM, pct } from "./comum.js";

function classificacao(q) {
  const s = q.step;
  const partes = s === "step1"
    ? [["sistema", q.sistema], ["disciplinas", (q.disciplinas || []).map((d) => nome(s, "disciplinas", d)).join(", ")], ["competencia", q.competencia]]
    : [["sistema", q.sistema], ["disciplinas_oficiais", (q.disciplinas_oficiais || []).map((d) => nome(s, "disciplinas_oficiais", d)).join(", ")], ["competencia", q.competencia], ["area", q.area], ["tarefa", q.tarefa]];
  return '<dl class="texp__class">' + partes.filter(([, v]) => v).map(([d, v]) =>
    "<div><dt>" + e(ROTULO_DIM[s][d]) + "</dt><dd>" + e(d === "disciplinas" || d === "disciplinas_oficiais" ? v : nome(s, d, v)) + "</dd></div>").join("") +
    (q.topico ? '<div><dt>Tópico</dt><dd lang="en">' + e(q.topico) + "</dd></div>" : "") + "</dl>";
}

/* q: item normalizado; resposta: letra ou null.
   opcoes: { tutor: mostra o botão "Próxima questão"; anotacao: texto da anotação; idBase } */
export function htmlExplicacao(q, resposta, { tutor = false, anotacao = "", idBase = "x" } = {}) {
  const certo = resposta !== null && resposta === q.correta;
  const status = resposta === null ? ["em_branco", "Em branco", "minus-circle"] : certo ? ["certa", "Você acertou", "check-circle"] : ["errada", "Você errou", "x-circle"];
  const porAlt = q.explicacoes_alternativas || {};
  const temPorAlt = Object.keys(porAlt).length > 0;
  return '<section class="texp texp--' + status[0] + '" aria-labelledby="texp-' + idBase + '">' +
    '<header class="texp__cab"><h3 id="texp-' + idBase + '" tabindex="-1" data-texp-titulo>' + icon(status[2]) + e(status[1]) + "</h3>" +
      '<p class="texp__gab">Resposta correta: <b>' + e(q.correta) + "</b>" + (resposta !== null && !certo ? " · sua resposta: <b>" + e(resposta) + "</b>" : "") + "</p></header>" +
    (q.objetivo_educacional ? '<div class="texp__bloco"><h4>Objetivo educacional</h4><p lang="en">' + e(q.objetivo_educacional) + "</p></div>" : "") +
    '<div class="texp__bloco"><h4>Explicação</h4><p lang="en">' + e(q.explicacao) + "</p></div>" +
    (temPorAlt ? '<div class="texp__bloco"><h4>Por que cada alternativa está certa ou errada</h4><ul class="texp__alts">' +
      q.alternativas.map((a) => '<li class="' + (a.letra === q.correta ? "is-correta" : a.letra === resposta ? "is-sua" : "") + '"><span class="texp__letra">' + e(a.letra) + "</span><div>" +
        '<p class="texp__alt" lang="en">' + e(a.texto) + (a.letra === q.correta ? ' <span class="chip chip--ok" lang="pt-BR">correta</span>' : a.letra === resposta ? ' <span class="chip chip--erro" lang="pt-BR">sua resposta</span>' : "") + "</p>" +
        (porAlt[a.letra] ? '<p lang="en">' + e(porAlt[a.letra]) + "</p>" : "") + "</div></li>").join("") + "</ul></div>" : "") +
    (q.explicacao_pt ? '<div class="texp__bloco texp__pt"><h4><span class="fita" aria-hidden="true"></span>Resumo em português</h4><p>' + e(q.explicacao_pt) + "</p></div>" : "") +
    '<div class="texp__rodape">' + classificacao(q) +
      '<p class="texp__meta">' + icon("target") + "<span>Padrão do item: o examinando no limiar de aprovação acerta este item com probabilidade de " + pct(q.angoff) +
        (q.angoff_origem === "padrao_dificuldade" ? " (padrão do contrato para a dificuldade " + e({ facil: "fácil", media: "média", dificil: "difícil" }[q.dificuldade] || "média") + ")" : " (julgamento de Angoff do autor)") + ".</span></p>" +
      (q.fonte ? '<p class="texp__meta">' + icon("book-open") + '<span>Fonte: <span lang="en">' + e(q.fonte) + "</span></span></p>" : "") +
      (anotacao ? '<p class="texp__meta">' + icon("note-pencil") + "<span>Sua anotação: " + e(anotacao) + "</span></p>" : "") +
    "</div>" +
    '<div class="texp__acoes">' +
      (tutor ? '<button type="button" class="btn btn--sm" data-proxima>' + icon("arrow-right") + "Próxima questão</button>" : "") +
      '<button type="button" class="link-btn" data-reportar="' + e(q.id) + '">' + icon("flag") + "Reportar erro neste item</button>" +
      '<span class="texp__id">Item ' + e(q.id) + "</span>" +
    "</div>" +
  "</section>";
}

/* Diálogo de reporte (gabarito, mais de uma correta, desatualizado...) */
export async function reportarItem(ctx, questaoId) {
  const r = await dialog({
    titulo: "Reportar erro no item " + questaoId,
    corpo:
      '<p class="hint">A equipe recebe o reporte com o item e responde na fila de revisão. Itens com problema confirmado saem do banco até a correção.</p>' +
      '<fieldset class="field"><legend>O que está errado?</legend><div class="radios">' +
      Object.entries(MOTIVOS_REPORTE).map(([v, t], i) => '<label class="radio"><input type="radio" name="motivo" value="' + v + '"' + (i === 0 ? " checked" : "") + "><span>" + e(t) + "</span></label>").join("") +
      "</div></fieldset>" +
      '<div class="field"><label for="rep-texto">Explique, com a fonte se puder</label><textarea id="rep-texto" name="texto" class="input input--area" rows="4" maxlength="' + LIMITE_REPORTE + '"></textarea></div>' +
      '<p class="error" data-dialog-erro hidden></p>',
    acoes: [{ rotulo: "Cancelar", valor: "cancelar", estilo: "ghost", cancelar: true }, { rotulo: "Enviar reporte", valor: "enviar", icone: "flag" }],
    validar: (d) => (d.motivo === "outro" && !String(d.texto || "").trim() ? "Descreva o problema." : "")
  });
  if (!r) return false;
  try {
    await ctx.store.reportarItem({ questao_id: questaoId, motivo: r.dados.motivo, texto: r.dados.texto || "" });
    toast("Reporte enviado. Obrigado por ajudar a melhorar o banco.", "ok");
    return true;
  } catch (err) { toast(err.message, "erro"); return false; }
}
