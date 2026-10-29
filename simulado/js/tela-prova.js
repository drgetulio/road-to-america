/* Road to America | simulado de 30 minutos: tela do bloco em andamento.
   A interface do bloco (ferramentas, revisão, relógio, atalhos) fica em
   interface-bloco.js, a mesma dos simulados completos; aqui só se liga essa tela
   ao estado do bloco de 30 minutos (sessao.js) e à gravação da tentativa. */
import { NOME_STEP } from "../../plataforma/js/simulado.js";
import {
  restaurarSessao, irPara, responder, alternarMarca, alternarRiscada, definirNota,
  tempoRestante, expirou, encerrar, paraTentativa, avisoPendente
} from "./sessao.js";
import { lerAndamento, gravarAndamento, apagarAndamento, gravarNotas } from "./armazenamento.js";
import { montarBloco } from "./interface-bloco.js";
import { relogio } from "./resultado.js";
import { toast } from "./dom.js";

let tela = null;

export default {
  titulo: "Bloco em andamento",
  destroy() { if (tela) tela.destroy(); tela = null; },
  async render(ctx, el) {
    const s = ctx._sessao && !ctx._sessao.encerrada ? ctx._sessao : restaurarSessao(lerAndamento());
    ctx._sessao = null;
    if (!s || s.encerrada || ctx.deOutraConta(s)) { location.replace("#/"); return; }
    const questoes = s.ids.map((id) => ctx.porId.get(id));
    if (questoes.some((q) => !q)) { apagarAndamento(); toast("O banco de questões mudou e este bloco não pode continuar.", "erro"); location.replace("#/"); return; }
    const n = s.ids.length;
    const salvar = () => { gravarAndamento(s); };

    async function encerrarBloco(motivo) {
      encerrar(s, Date.now(), motivo);
      salvar();
      let r;
      try {
        r = await ctx.salvarTentativa(paraTentativa(s, ctx.porId));
      } catch (err) {
        /* o bloco encerrado fica guardado no navegador; a tela inicial oferece de novo o encerramento */
        console.error(err);
        toast("Não foi possível gravar o resultado: " + (err.message || err) + ". O bloco continua guardado neste navegador.", "erro", 8000);
        ctx.go("#/");
        return;
      }
      gravarNotas(r.registro.id, s.notas);
      apagarAndamento();
      ctx._ultimoSalvamento = { id: r.registro.id, onde: r.onde, erro: r.erro, porTempo: s.encerramento === "tempo" };
      ctx.go("#/resultado/" + encodeURIComponent(r.registro.id));
    }

    tela = montarBloco(el, {
      titulo: "Bloco do " + NOME_STEP[s.step] + ", " + n + " questões",
      marca: NOME_STEP[s.step],
      questoes,
      labs: ctx.labs,
      estado: {
        atual: () => s.atual,
        resposta: (i) => s.respostas[i],
        marcada: (i) => s.marcadas[i],
        riscadas: (i) => s.riscadas[i],
        realces: (i) => s.realces[i],
        nota: (i) => s.notas[i]
      },
      acoes: {
        ir: (i, agora) => { if (!s.encerrada) irPara(s, i, agora); },
        responder: (i, letra) => responder(s, i, letra),
        marcar: (i) => alternarMarca(s, i),
        riscar: (i, letra) => alternarRiscada(s, i, letra),
        nota: (i, texto) => definirNota(s, i, texto),
        realces: (i, r) => { s.realces[i] = r; },
        salvar
      },
      relogio: {
        rotulo: "Tempo restante do bloco",
        restante: (agora) => tempoRestante(s, agora),
        expirou: (agora) => expirou(s, agora),
        aviso: (agora) => avisoPendente(s, agora)
      },
      textoNotas: "As anotações ficam só neste navegador e aparecem na revisão do resultado.",
      rotuloSair: "Sair para o início (o relógio continua)",
      sair: () => ctx.go("#/"),
      encerrar: encerrarBloco,
      anuncio: "Bloco do " + NOME_STEP[s.step] + " iniciado. " + relogio(tempoRestante(s)) + " no relógio."
    });
  }
};
