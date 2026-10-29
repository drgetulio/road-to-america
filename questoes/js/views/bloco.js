/* Road to America | banco de questões: bloco em andamento.
   A tela é a interface de bloco do simulado (simulado/js/interface-bloco.js), a
   mesma do bloco de 30 minutos e dos simulados completos. Aqui se liga essa tela à
   sessão do banco (plataforma/js/banco-aluno.js, no formato de simulado/js/sessao.js):
   - cronometrado: 90 s por item, relógio regressivo, encerra sozinho no fim;
   - tutor: relógio conta o tempo gasto; depois de confirmar a resposta, a
     alternativa trava e a explicação aparece logo abaixo das alternativas.
   As anotações são da conta (store.saveAnotacaoItem) e voltam quando o item
   aparecer de novo. */
import { montarBloco } from "../../../simulado/js/interface-bloco.js";
import { restaurarSessao, irPara, responder, alternarMarca, alternarRiscada, definirNota, tempoRestante, expirou, encerrar, avisoPendente } from "../../../simulado/js/sessao.js";
import { relogio } from "../../../simulado/js/resultado.js";
import { confirmarResposta, travada, paraRespostasBanco, ROTULO_MODO } from "../../../plataforma/js/banco-aluno.js";
import { $, e, icon, toast } from "../../../anki/js/ui.js";
import { lerAndamento, gravarAndamento, apagarAndamento, guardarPendentes } from "../local.js";
import { htmlExplicacao, reportarItem } from "../explicacao.js";
import { NOME_STEP } from "../comum.js";

let tela = null;
let tNotas = {};

export default {
  titulo: "Bloco em andamento",
  destroy() { if (tela) tela.destroy(); tela = null; for (const t of Object.values(tNotas)) clearTimeout(t); tNotas = {}; },
  async render(ctx, el) {
    const s = restaurarSessao(lerAndamento());
    if (!s || s.encerrada || s.dono !== ctx.dono || s.origem !== "banco") { location.replace("#/"); return; }
    if (!Array.isArray(s.confirmadas) || s.confirmadas.length !== s.ids.length) s.confirmadas = Array(s.ids.length).fill(false);
    const questoes = s.ids.map((id) => ctx.banco.porId.get(id));
    if (questoes.some((q) => !q)) { apagarAndamento(); toast("O banco de questões mudou e este bloco não pode continuar.", "erro", 7000); location.replace("#/"); return; }
    const n = s.ids.length;
    const tutor = s.modo === "tutor";
    const salvar = () => { gravarAndamento(s); };

    async function encerrarBloco(motivo) {
      encerrar(s, Date.now(), motivo);
      salvar();
      const lista = paraRespostasBanco(s, ctx.banco.porId);
      try {
        await ctx.store.saveRespostas(lista);
      } catch (err) {
        console.error(err);
        guardarPendentes(ctx.dono, lista);
        toast("As respostas não chegaram à sua conta agora (" + (err.message || err) + "). Elas ficaram neste navegador e serão enviadas na próxima visita.", "aviso", 9000);
      }
      apagarAndamento();
      try { await ctx.recarregarRespostas(); } catch { /* segue com o que tem */ }
      ctx._ultimoBloco = { id: s.id, porTempo: s.encerramento === "tempo" };
      ctx.go("#/resultado/" + encodeURIComponent(s.id));
    }

    function htmlTutor(i) {
        const q = questoes[i];
        const resp = s.respostas[i];
        if (travada(s, i)) return htmlExplicacao(q, resp, { tutor: i < n - 1, idBase: String(i) });
        if (resp === null) return '<p class="tconf tconf--dica">' + icon("info") + "<span>Escolha uma alternativa e confirme para ver a explicação.</span></p>";
        return '<div class="tconf"><button type="button" class="btn btn--sm" data-confirmar>' + icon("check") + "Confirmar resposta " + e(resp) + '</button><span class="fine">Depois de confirmar, a resposta não muda.</span></div>';
    }
    const extra = tutor ? {
      html: (i) => '<div data-tutor-extra>' + htmlTutor(i) + "</div>",
      clique(ev, i) {
        const t = ev.target;
        if (t.closest("[data-confirmar]")) {
          try { confirmarResposta(s, i); } catch (err) { toast(err.message, "aviso"); return true; }
          salvar();
          tela.redesenhar();
          const h = $("[data-texp-titulo]", el);
          h?.focus({ preventScroll: true });
          h?.scrollIntoView({ block: "start", behavior: "smooth" });
          return true;
        }
        if (t.closest("[data-proxima]")) { $("[data-prox]", el)?.click(); return true; }
        const rep = t.closest("[data-reportar]");
        if (rep) { reportarItem(ctx, rep.dataset.reportar); return true; }
        return false;
      }
    } : null;

    tela = montarBloco(el, {
      titulo: "Bloco do " + NOME_STEP[s.step] + ", " + n + (n === 1 ? " questão" : " questões") + ", modo " + ROTULO_MODO[s.modo].toLowerCase(),
      marca: NOME_STEP[s.step] + " · " + ROTULO_MODO[s.modo],
      questoes,
      labs: ctx.labs,
      estado: {
        atual: () => s.atual,
        resposta: (i) => s.respostas[i],
        marcada: (i) => s.marcadas[i],
        riscadas: (i) => s.riscadas[i],
        realces: (i) => s.realces[i],
        nota: (i) => s.notas[i],
        travada: (i) => travada(s, i),
        gabarito: (i) => (travada(s, i) ? questoes[i].correta : null)
      },
      acoes: {
        ir: (i, agora) => { if (!s.encerrada) irPara(s, i, agora); },
        responder: (i, letra) => { if (!travada(s, i)) responder(s, i, letra); if (tutor) setTimeout(() => { const box = $("[data-tutor-extra]", el); if (box && !travada(s, i)) box.innerHTML = htmlTutor(i); }, 0); },
        marcar: (i) => alternarMarca(s, i),
        riscar: (i, letra) => alternarRiscada(s, i, letra),
        nota: (i, texto) => {
          definirNota(s, i, texto);
          clearTimeout(tNotas[i]);
          tNotas[i] = setTimeout(() => { ctx.store.saveAnotacaoItem(s.ids[i], s.notas[i]).catch((err) => toast("A anotação não foi gravada na conta: " + err.message, "aviso")); }, 800);
        },
        realces: (i, r) => { s.realces[i] = r; },
        salvar
      },
      relogio: tutor ? {
        rotulo: "Tempo no bloco",
        progressivo: true,
        restante: (agora) => Math.max(0, Math.min(agora, s.inicio + s.limite_ms) - s.inicio),
        expirou: (agora) => expirou(s, agora),
        aviso: () => null
      } : {
        rotulo: "Tempo restante do bloco",
        restante: (agora) => tempoRestante(s, agora),
        expirou: (agora) => expirou(s, agora),
        aviso: (agora) => avisoPendente(s, agora)
      },
      questaoExtra: extra,
      textoNotas: "As anotações ficam na sua conta, uma por questão, e voltam sempre que a questão aparecer.",
      textoFim: () => tutor
        ? "<p>As respostas confirmadas e as escolhidas sem confirmar entram no seu desempenho. A explicação de todas as questões fica na revisão do bloco.</p>"
        : "<p>Depois de encerrado, o bloco não reabre, como na prova. A revisão com as explicações vem em seguida.</p>",
      rotuloSair: tutor ? "Sair para o início (o bloco fica guardado)" : "Sair para o início (o relógio continua)",
      sair: () => ctx.go("#/"),
      encerrar: encerrarBloco,
      anuncio: "Bloco do " + NOME_STEP[s.step] + " em modo " + ROTULO_MODO[s.modo].toLowerCase() + " iniciado. " + (tutor ? "O relógio conta o tempo gasto." : relogio(tempoRestante(s)) + " no relógio.")
    });
  }
};
