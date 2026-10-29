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
import { lerAndamento, gravarAndamento, apagarAndamento, guardarPendentes, lerPendentes } from "../local.js";
import { htmlExplicacao, reportarItem } from "../explicacao.js";
import { NOME_STEP } from "../comum.js";
import { mesclarRevelados, garantirGabarito } from "../../../plataforma/js/banco.js";

/* Gabarito no servidor (Supabase): a correção e a explicação só chegam depois de a
   resposta ser registrada (r2a_responder). Tutor: uma questão por vez, ao confirmar;
   cronometrado: o bloco inteiro, ao encerrar. No modo demonstração, o navegador já tem
   o banco inteiro e nada muda. */
function mesclarLinhas(ctx, linhas) {
  mesclarRevelados(ctx.banco, Object.fromEntries((linhas || []).filter((x) => x.revelado).map((x) => [x.questao_id, x.revelado])));
}

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
    /* bloco tutor retomado: as questões já confirmadas voltam com a explicação */
    if (ctx.store.gabaritoNoServidor && s.confirmadas.some(Boolean)) {
      try { await garantirGabarito(ctx.store, ctx.banco, s.ids.filter((_, i) => s.confirmadas[i])); }
      catch (err) { toast("Não foi possível trazer as explicações já vistas: " + (err.message || err), "aviso", 8000); }
    }
    const n = s.ids.length;
    const tutor = s.modo === "tutor";
    const salvar = () => { gravarAndamento(s); };

    async function encerrarBloco(motivo) {
      /* o mesmo bloco aberto em outra aba (ou encerrado pelo prazo em outra tela) já foi
         gravado: não grava de novo */
      const guardado = lerAndamento();
      let jaGravado = !!guardado && (guardado.id !== s.id || !!guardado.encerrada);
      if (!guardado) {
        /* sem cópia no navegador: ou outra aba já encerrou e apagou, ou o navegador não
           guarda nada; só a presença das linhas na conta (ou na fila) separa os dois casos */
        try { await ctx.recarregarRespostas(); } catch { /* segue com o que tem */ }
        jaGravado = ctx.respostas.some((r) => r.sessao_id === s.id) || lerPendentes(ctx.dono).some((l) => l?.[0]?.sessao_id === s.id);
      }
      if (jaGravado) {
        ctx.go("#/resultado/" + encodeURIComponent(s.id));
        return;
      }
      encerrar(s, Date.now(), motivo);
      salvar();
      const lista = paraRespostasBanco(s, ctx.banco.porId);
      try {
        /* no servidor, reenvio de linha já registrada (tutor) não duplica */
        if (ctx.store.gabaritoNoServidor) mesclarLinhas(ctx, await ctx.store.responderItens(lista, { revelar: true }));
        else await ctx.store.saveRespostas(lista);
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
        const conf = t.closest("[data-confirmar]");
        if (conf) {
          const mostrar = () => {
            salvar();
            tela.redesenhar();
            const h = $("[data-texp-titulo]", el);
            h?.focus({ preventScroll: true });
            h?.scrollIntoView({ block: "start", behavior: "smooth" });
          };
          if (!ctx.store.gabaritoNoServidor) {
            try { confirmarResposta(s, i); } catch (err) { toast(err.message, "aviso"); return true; }
            mostrar();
            return true;
          }
          if (s.respostas[i] === null) { toast("Escolha uma alternativa antes de confirmar.", "aviso"); return true; }
          /* registra a resposta no servidor e só então recebe a correção e a explicação */
          conf.disabled = true;
          const linha = { questao_id: s.ids[i], step: s.step, resposta: s.respostas[i], tempo_ms: Math.min(86400000, Math.round(s.tempos_ms[i] || 0)), marcada: !!s.marcadas[i], modo: "tutor", origem: "banco", sessao_id: s.id, posicao: i, respondida_em: new Date().toISOString() };
          ctx.store.responderItens([linha], { revelar: true }).then((r) => {
            mesclarLinhas(ctx, r);
            confirmarResposta(s, i);
            mostrar();
          }).catch((err) => {
            conf.disabled = false;
            toast("A resposta não chegou ao servidor (" + (err.message || err) + "). Tente confirmar de novo.", "erro", 8000);
          });
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
        ? "<p>As respostas confirmadas e as escolhidas sem confirmar entram no seu desempenho; as questões em branco ficam fora da estimativa. A explicação de todas as questões fica na revisão do bloco.</p>"
        : "<p>Depois de encerrado, o bloco não reabre, como na prova, e as questões em branco contam como erro. A revisão com as explicações vem em seguida.</p>",
      rotuloSair: tutor ? "Sair para o início (o bloco fica guardado)" : "Sair para o início (o relógio continua)",
      sair: () => ctx.go("#/"),
      encerrar: encerrarBloco,
      anuncio: "Bloco do " + NOME_STEP[s.step] + " em modo " + ROTULO_MODO[s.modo].toLowerCase() + " iniciado. " + (tutor ? "O relógio conta o tempo gasto." : relogio(tempoRestante(s)) + " no relógio.")
    });
  }
};
