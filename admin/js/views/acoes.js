/* Road to America | área administrativa: ações que abrem diálogo (importar presença) */
import { $, e, icon, toast, dialog, readFile } from "../../../anki/js/ui.js";
import { parsePresencaCsv } from "../../../plataforma/js/desempenho.js";

/* Importa a presença por CSV. Devolve true se algo foi gravado. */
export async function importarPresenca(ctx) {
  let texto = "";
  const r = await dialog({
    titulo: "Importar presença (CSV)",
    largura: "largo",
    corpo:
      '<p class="body">Uma linha por participante, com cabeçalho. Colunas obrigatórias, em qualquer ordem: <code>email</code>, <code>aulas_assistidas</code> e <code>aulas_totais</code>. Separador vírgula, ponto e vírgula ou tab. O e-mail precisa ser o da conta do participante; e-mail repetido fica com a última linha.</p>' +
      '<div class="field"><label for="imp-arq">Arquivo CSV</label><input id="imp-arq" type="file" accept=".csv,.txt,text/csv,text/plain" class="input"></div>' +
      '<div class="field"><label for="imp-txt">Ou cole o conteúdo</label><textarea id="imp-txt" name="texto" rows="6" class="input input--area mono" placeholder="email;aulas_assistidas;aulas_totais&#10;ana.exemplo@demo.local;34;40"></textarea></div>' +
      '<p class="hint" data-prev aria-live="polite"></p>' +
      '<p class="error" data-dialog-erro hidden role="alert"></p>',
    acoes: [{ rotulo: "Cancelar", valor: "cancelar", estilo: "ghost", cancelar: true }, { rotulo: "Importar", valor: "ok", icone: "upload-simple" }],
    aoAbrir: (dlg) => {
      const ta = $("#imp-txt", dlg);
      const prev = $("[data-prev]", dlg);
      const mostrar = () => {
        const { linhas, erros } = parsePresencaCsv(ta.value);
        prev.textContent = ta.value.trim() ? linhas.length + " linha(s) válida(s)" + (erros.length ? ", " + erros.length + " com erro: " + erros.slice(0, 3).map((x) => "linha " + x.linha + " (" + x.motivo + ")").join("; ") : "") + "." : "";
      };
      ta.addEventListener("input", mostrar);
      $("#imp-arq", dlg).addEventListener("change", async (ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;
        ta.value = await readFile(f);
        mostrar();
      });
    },
    validar: (dados) => {
      texto = dados.texto || "";
      if (!texto.trim()) return "Escolha um arquivo ou cole o conteúdo do CSV.";
      const { linhas, erros } = parsePresencaCsv(texto);
      if (!linhas.length) return erros[0]?.motivo || "Nenhuma linha válida no arquivo.";
      return "";
    }
  });
  if (!r) return false;
  try {
    const res = await ctx.store.importPresencaCsv(texto);
    ctx.invalidar();
    const partes = [res.atualizados + " participante(s) atualizado(s)"];
    if (res.nao_encontrados.length) partes.push(res.nao_encontrados.length + " e-mail(s) sem conta");
    if (res.erros.length) partes.push(res.erros.length + " linha(s) com erro");
    toast("Presença importada: " + partes.join(", ") + ".", res.atualizados ? "ok" : "aviso", 6000);
    if (res.nao_encontrados.length || res.erros.length) {
      /* o evento "close" do primeiro diálogo chega numa tarefa seguinte; abrir o
         segundo antes disso o fecharia na hora (mesmo elemento <dialog>) */
      await new Promise((ok) => setTimeout(ok, 30));
      await dialog({
        titulo: "Resultado da importação",
        corpo: "<p><b>" + res.atualizados + "</b> participante(s) atualizado(s).</p>" +
          (res.nao_encontrados.length ? "<p>E-mails sem conta na plataforma (nada foi gravado para eles):</p><ul>" + res.nao_encontrados.map((x) => "<li><code>" + e(x) + "</code></li>").join("") + "</ul>" : "") +
          (res.erros.length ? "<p>Linhas com erro:</p><ul>" + res.erros.map((x) => "<li>" + (x.linha ? "Linha " + x.linha + ": " : "") + e(x.motivo) + (x.email ? " (" + e(x.email) + ")" : "") + "</li>").join("") + "</ul>" : "")
      });
    }
    return res.atualizados > 0;
  } catch (err) {
    toast(err.message, "erro");
    return false;
  }
}

export function botaoImportar() {
  return '<button class="btn btn--ghost btn--sm" type="button" data-importar>' + icon("upload-simple") + "Importar presença (CSV)</button>";
}
