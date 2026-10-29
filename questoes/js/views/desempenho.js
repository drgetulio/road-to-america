/* Road to America | banco de questões: desempenho por área e curva de evolução.
   Perfil por área como no relatório oficial de reprovação (mais baixo, igual ou mais
   alto que o examinando no limiar), a partir das primeiras respostas a cada item. */
import { estimarAluno, prepararRespostas } from "../../../plataforma/js/psicometria.js";
import { sistemasDoOutline, pesosDoOutline } from "../../../plataforma/js/banco.js";
import { curvaEvolucao, chavesDaDimensao, estatisticasAluno, LIMITES_BLOCO } from "../../../plataforma/js/banco-aluno.js";
import { $, e, icon } from "../../../anki/js/ui.js";
import { cabecalho, abas, seletorStep, NOME_STEP, pct, pctProb, plural, dataBR, segundos, nome, ROTULO_DIM, CLASSE_PERFIL, svgEvolucao, barraLimiar } from "../comum.js";

const DIMS = { step1: ["sistema", "disciplinas", "competencia"], step2ck: ["sistema", "disciplinas_oficiais", "competencia", "area"] };
const DIM_TAX = { disciplinas: "disciplina", disciplinas_oficiais: "disciplina_oficial" };

export default {
  titulo: "Desempenho",
  async render(ctx, el, { params }) {
    el.innerHTML = "<div data-raiz></div>";
    const raiz = $("[data-raiz]", el);
    let step = ["step1", "step2ck"].includes(params.get("step")) ? params.get("step") : ctx.step;
    const desenhar = () => {
      const est = estimarAluno({ step, respostas: ctx.respostas, itens: ctx.banco.porId, sistemas: sistemasDoOutline(step), pesosSistemas: pesosDoOutline(step) });
      const curva = curvaEvolucao({ respostas: ctx.respostas, itens: ctx.banco.porId, step });
      const st = estatisticasAluno(ctx.banco, ctx.historico, step);
      const { usadas } = prepararRespostas(ctx.respostas, ctx.banco.porId, { step });
      const cron = ctx.respostas.filter((r) => r.step === step && r.modo === "cronometrado" && r.resposta !== null && r.tempo_ms > 0);
      const tMedio = cron.length ? cron.reduce((s, r) => s + r.tempo_ms, 0) / cron.length : null;
      const nTutor = usadas.filter((u) => u.modo === "tutor").length;
      raiz.innerHTML = '<div class="wrap section-sm q-pag">' +
        cabecalho({ titulo: "Desempenho", lead: "Como você está em cada área do outline em relação ao examinando no limiar do banco, e como a probabilidade de estar acima do limiar mudou a cada sessão. Conta a primeira resposta a cada item: a repetição mede memória do item, não habilidade." }) +
        abas("desempenho") +
        seletorStep(step) +
        '<dl class="q-nums q-nums--faixa">' +
          "<div><dt>Itens respondidos</dt><dd>" + est.n + " <small>de " + st.total + "</small></dd></div>" +
          "<div><dt>Acerto bruto</dt><dd>" + (est.n ? pct(est.taxa_bruta) : "sem dado") + "</dd></div>" +
          "<div><dt>Limiar nos mesmos itens</dt><dd>" + (usadas.length ? pct(usadas.reduce((s, u) => s + 1 / (1 + Math.exp(u.b)), 0) / usadas.length) : "sem dado") + "</dd></div>" +
          "<div><dt>Tempo médio (cronometrado)</dt><dd>" + (tMedio === null ? "sem dado" : segundos(tMedio)) + " <small>ritmo: " + segundos(LIMITES_BLOCO.ritmo_ms) + "</small></dd></div>" +
          "<div><dt>Em modo tutor</dt><dd>" + nTutor + " <small>valem metade</small></dd></div>" +
        "</dl>" +

        '<section class="panel" aria-labelledby="ev-t"><div class="panel__head"><h2 class="h-sm" id="ev-t">Curva de evolução</h2>' +
          '<p class="hint">Cada ponto é uma sessão (bloco do banco, simulado completo ou bloco de 30 minutos): a probabilidade de estar acima do limiar do banco com todas as respostas até ali. Entre 10% e 90% a estimativa ainda não decide.</p></div>' +
          (curva.length
            ? svgEvolucao(curva) +
              '<details class="q-tabela-dados"><summary>Ver os valores em tabela</summary><div class="q-tab-wrap"><table class="q-tab"><thead><tr><th scope="col">Sessão</th><th scope="col">Data</th><th scope="col" class="num">Acerto na sessão</th><th scope="col" class="num">Limiar na sessão</th><th scope="col" class="num">Itens acumulados</th><th scope="col" class="num">Probabilidade</th></tr></thead><tbody>' +
                curva.map((p, i) => '<tr><th scope="row">' + (i + 1) + "</th><td>" + e(dataBR(p.ate)) + '</td><td class="num">' + p.sessao_acertos + "/" + p.sessao_total + " (" + pct(p.sessao_taxa) + ')</td><td class="num">' + pct(p.sessao_limiar) + '</td><td class="num">' + p.n + '</td><td class="num">' + pctProb(p.p_aprovacao) + "</td></tr>").join("") +
              "</tbody></table></div></details>"
            : '<p class="body">A curva aparece depois do primeiro bloco do ' + NOME_STEP[step] + ".</p>") +
        "</section>" +

        DIMS[step].map((d) => {
          const perfil = new Map((est.perfil[d] || []).map((x) => [x.chave, x]));
          const chaves = chavesDaDimensao(step, DIM_TAX[d] || d, [...perfil.keys()]);
          const comItens = chaves.filter((k) => perfil.has(k)).sort((a, b) => perfil.get(a).p_acima - perfil.get(b).p_acima);
          const sem = chaves.filter((k) => !perfil.has(k));
          return '<section class="panel" aria-labelledby="pf-' + d + '"><div class="panel__head"><h2 class="h-sm" id="pf-' + d + '">Por ' + e(ROTULO_DIM[step][d].toLowerCase()) + "</h2>" +
            '<p class="hint">Da mais fraca para a mais forte. A classe usa o intervalo de 90% da habilidade só com os itens da área; com menos de 5 itens, a área aparece como "poucos itens".' + (d === "disciplinas" || d === "disciplinas_oficiais" ? " Um item conta em cada disciplina que ele testa." : "") + "</p></div>" +
            '<div class="q-tab-wrap"><table class="q-tab q-tab--perfil"><thead><tr><th scope="col">' + e(ROTULO_DIM[step][d]) + '</th><th scope="col" class="num">Itens</th><th scope="col">Você e o limiar</th><th scope="col">Em relação ao limiar</th><th scope="col"><span class="sr-only">Estudar</span></th></tr></thead><tbody>' +
            comItens.map((k) => {
              const x = perfil.get(k);
              const c = CLASSE_PERFIL[x.classe];
              const dimF = DIM_TAX[d] || d;
              return '<tr><th scope="row">' + e(nome(step, d, k)) + '</th><td class="num">' + x.acertos + "/" + x.n + "</td><td>" + barraLimiar(x.taxa, x.esperado_limiar, "Você " + pct(x.taxa) + "; o examinando no limiar acertaria " + pct(x.esperado_limiar)) + '<span class="q-tab__sub">' + pct(x.taxa) + " contra " + pct(x.esperado_limiar) + "</span></td>" +
                '<td><span class="prog-chip prog-chip--' + c.css + '">' + icon(c.icone) + e(c.rotulo) + "</span></td>" +
                '<td><a class="link-btn" href="#/criar?step=' + step + "&" + dimF + "=" + encodeURIComponent(k) + "&situacao=" + (x.acertos < x.n ? "erradas" : "nao_vistas") + '" aria-label="' + e("Criar bloco de " + nome(step, d, k)) + '">' + icon("plus-circle") + "Bloco</a></td></tr>";
            }).join("") +
            sem.map((k) => '<tr class="is-sem"><th scope="row">' + e(nome(step, d, k)) + '</th><td class="num">0</td><td colspan="2"><span class="muted">Sem itens respondidos</span></td><td><a class="link-btn" href="#/criar?step=' + step + "&" + (DIM_TAX[d] || d) + "=" + encodeURIComponent(k) + '&situacao=nao_vistas" aria-label="' + e("Criar bloco de " + nome(step, d, k)) + '">' + icon("plus-circle") + "Bloco</a></td></tr>").join("") +
            "</tbody></table></div></section>";
        }).join("") +
        '<p class="q-nota">' + icon("info") + "<span>O relatório oficial de quem é reprovado no USMLE mostra o desempenho por área em relação ao examinando com aprovação baixa (mais baixo, igual ou mais alto). Aqui a comparação é com o limiar do banco, hoje provisório (dificuldade-alvo dos itens); não é resultado oficial. Método em plataforma/PSICOMETRIA.md, seção 8.</span></p>" +
      "</div>";
    };
    desenhar();
    raiz.addEventListener("change", (ev) => {
      if (ev.target.name !== "step-tela") return;
      step = ev.target.value;
      ctx.step = step;
      desenhar();
      $('input[name="step-tela"]:checked', raiz)?.focus();
    });
  }
};
