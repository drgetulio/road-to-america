/* Road to America | simulado: tela inicial (escolha do Step, formato, histórico) */
import { FORMATO_OFICIAL, NOME_STEP, SIMULADO_30 } from "../../plataforma/js/simulado.js";
import { criarSessao, sortearBloco, restaurarSessao, tempoRestante, encerrar, paraTentativa } from "./sessao.js";
import { lerAndamento, gravarAndamento, apagarAndamento, lerPrefs, gravarPrefs, gravarNotas } from "./armazenamento.js";
import { resumoHistorico, idsDaUltima, linhasPorCampo, relogio, pct, segundos, titulosAreas } from "./resultado.js";
import { $, $$, e, icon, dialogo, dataHora, toast } from "./dom.js";

const FONTES = {
  dia: "https://www.usmle.org/bulletin-information/examination-day-testing",
  recursos: "https://www.usmle.org/exam-resources"
};

function dataBr(iso) {
  const [a, m, d] = iso.split("-");
  return d + "/" + m + "/" + a;
}

function passe(step, marcado, n) {
  const f = FORMATO_OFICIAL[step];
  return '<label class="passe">' +
    '<input type="radio" name="step" value="' + step + '"' + (marcado ? " checked" : "") + ">" +
    '<span class="passe__main">' +
      '<span class="passe__top"><span>USMLE</span><span>Em vigor desde ' + dataBr(f.vigente_desde) + "</span></span>" +
      '<span class="passe__nome">' + NOME_STEP[step] + "</span>" +
      '<dl class="passe__dados">' +
        "<div><dt>Blocos na prova</dt><dd>" + f.blocos + " de " + f.minutos_por_bloco + " min</dd></div>" +
        "<div><dt>Questões na prova</dt><dd>até " + f.questoes_max + "</dd></div>" +
        "<div><dt>Por bloco</dt><dd>até " + f.questoes_por_bloco + "</dd></div>" +
        "<div><dt>Sessão</dt><dd>" + f.horas_sessao + " h</dd></div>" +
      "</dl>" +
      '<span class="fine">Banco deste simulado: ' + n + " questões revisadas.</span>" +
    "</span>" +
    '<span class="passe__stub" aria-hidden="true"><span>Bloco</span><b>20 q</b><span>30 min</span></span>' +
    '<span class="passe__check" aria-hidden="true">' + icon("check") + "</span>" +
  "</label>";
}

function avisoConta(ctx) {
  if (ctx.conta === "participante") {
    return '<div class="aviso-conta aviso-conta--ok">' + icon("user-circle") + "<p>Você entrou como <strong>" + e(ctx.user.nome || ctx.user.email) + "</strong>. Cada bloco encerrado vai para o seu histórico e para o acompanhamento da equipe.</p></div>";
  }
  if (ctx.conta === "demo") {
    return '<div class="aviso-conta">' + icon("info") + "<p><strong>Modo demonstração.</strong> As tentativas ficam só neste navegador e entram no painel do administrador de demonstração. Nada é enviado a um servidor.</p></div>";
  }
  return '<div class="aviso-conta">' + icon("lock-simple") + '<p>Você está sem login: as tentativas ficam salvas só neste navegador. Participantes da turma <a href="../anki/#/entrar">entram pelo app de flashcards</a> para que o bloco vá para o painel de acompanhamento.</p></div>';
}

function linhaHistorico(t) {
  const medio = t.total ? t.duracao_ms / t.total : null;
  return "<tr>" +
    '<th scope="row" data-rot="Data">' + e(dataHora(t.fim)) + (t._pendente_envio ? ' <span class="chip chip--aviso">não enviada</span>' : "") + "</th>" +
    '<td class="num" data-rot="Acertos">' + t.acertos + " de " + t.total + "</td>" +
    '<td class="num" data-rot="Percentual">' + pct(t.percentual) + "</td>" +
    '<td class="num" data-rot="Tempo médio">' + (medio === null ? "sem dados" : segundos(medio) + " s") + "</td>" +
    '<td data-rot="Encerramento">' + (t.encerramento === "tempo" ? "tempo esgotado" : "pelo participante") + "</td>" +
    '<td><a href="#/resultado/' + encodeURIComponent(t.id) + '">Ver resultado<span class="sr-only"> de ' + e(dataHora(t.fim)) + "</span></a></td>" +
  "</tr>";
}

async function montarHistorico(ctx, el, step) {
  const box = $("[data-historico]", el);
  box.innerHTML = '<p class="muted" role="status">Carregando o histórico...</p>';
  const todas = await ctx.listarTentativas();
  const r = resumoHistorico(todas, step);
  ctx._historico = todas;
  if (!r.n) {
    box.innerHTML = '<div class="vazio"><p>Nenhum bloco do ' + NOME_STEP[step] + " encerrado ainda. O primeiro resultado aparece aqui.</p></div>";
    return;
  }
  const fracas = r.n >= 2 ? linhasPorCampo(r.lista, step, "por_sistema").filter((l) => l.total >= 2).slice(0, 3) : [];
  const rot = titulosAreas(step);
  const variacao = r.variacao === null ? "" : " A última ficou " + (r.variacao === 0 ? "igual à anterior" : (r.variacao > 0 ? Math.round(r.variacao * 100) + " pontos acima" : Math.round(-r.variacao * 100) + " pontos abaixo") + " da anterior") + ".";
  box.innerHTML =
    '<p class="body">' + r.n + (r.n === 1 ? " bloco encerrado" : " blocos encerrados") + " do " + NOME_STEP[step] + ". Média de " + pct(r.media) + ", melhor resultado " + pct(r.melhor) + "." + variacao + "</p>" +
    (fracas.length ? '<div class="cartao"><h3 class="h-sm">' + e(rot.sistema) + "s com menor acerto somando os blocos</h3><ul class=\"lista-check\">" +
      fracas.map((l) => "<li>" + icon("chart-bar") + "<span><strong>" + e(l.rotulo) + "</strong>: " + l.acertos + " de " + l.total + " (" + pct(l.taxa) + ")</span></li>").join("") + "</ul></div>" : "") +
    '<div class="tabela-wrap"><table class="tabela tabela--cartoes"><caption class="sr-only">Blocos encerrados do ' + NOME_STEP[step] + ", do mais recente para o mais antigo</caption>" +
    '<thead><tr><th scope="col">Data</th><th scope="col">Acertos</th><th scope="col">Percentual</th><th scope="col">Tempo médio</th><th scope="col">Encerramento</th><th scope="col"><span class="sr-only">Ação</span></th></tr></thead>' +
    "<tbody>" + r.lista.slice(0, 30).map(linhaHistorico).join("") + "</tbody></table></div>";
}

/* Encerra um bloco salvo pela tela inicial e grava */
async function encerrarSalvo(ctx, s) {
  encerrar(s, Date.now());
  const t = paraTentativa(s, ctx.porId);
  const r = await ctx.salvarTentativa(t);
  gravarNotas(r.registro.id, s.notas);
  apagarAndamento();
  ctx._ultimoSalvamento = { id: r.registro.id, onde: r.onde, erro: r.erro };
  ctx.go("#/resultado/" + encodeURIComponent(r.registro.id));
}

export default {
  titulo: "",
  async render(ctx, el) {
    document.body.classList.remove("em-prova");
    const prefs = lerPrefs();
    let step = prefs.step;
    const salvo = restaurarSessao(lerAndamento());
    const resta = salvo ? tempoRestante(salvo) : 0;

    el.innerHTML =
      '<div class="wrap section-sm inicio">' +
        '<div class="inicio__topo">' +
          "<div>" +
            '<p class="eyebrow"><span class="fita" aria-hidden="true"></span>Simulado de 30 minutos</p>' +
            '<h1 class="display h1">Um bloco do USMLE, <em>no relógio da prova.</em></h1>' +
            '<p class="lead">Vinte questões em 30 minutos, com as ferramentas do dia da prova: valores laboratoriais, marcação para revisão, riscar alternativas, realce do texto, anotações e calculadora. No fim, você vê o acerto por área, o seu ritmo comparado aos 90 segundos por questão e a explicação de cada item.</p>' +
          "</div>" +
          '<div class="placa" aria-label="Formato deste simulado">' +
            '<p class="placa__rota"><span class="fita" aria-hidden="true"></span>Um bloco oficial</p>' +
            '<p class="placa__num">Exit 30<small>minutos, sem pausa</small></p>' +
            "<dl><div><dt>Questões</dt><dd>" + SIMULADO_30.questoes + "</dd></div><div><dt>Minutos</dt><dd>" + SIMULADO_30.duracao_ms / 60000 + "</dd></div><div><dt>Por questão</dt><dd>" + SIMULADO_30.ritmo_ms / 1000 + " s</dd></div></dl>" +
          "</div>" +
        "</div>" +

        avisoConta(ctx) +

        (salvo && resta > 0 ? '<div class="aviso-conta andamento" data-andamento>' + icon("hourglass-medium") +
          "<div><p><strong>Há um bloco em andamento</strong> (" + NOME_STEP[salvo.step] + ", " + relogio(resta) + " restantes). O relógio do bloco continua correndo mesmo com a página fechada.</p>" +
          '<p class="acoes" style="margin-top:10px"><a class="btn btn--sm" href="#/bloco">' + icon("play") + 'Voltar ao bloco</a><button type="button" class="btn btn--ghost btn--sm" data-encerrar-salvo>Encerrar e ver o resultado</button></p></div></div>' : "") +

        '<fieldset class="escolha"><legend>Escolha o Step</legend><div class="escolha__grid">' +
          passe("step1", step === "step1", ctx.bancos.step1.length) + passe("step2ck", step === "step2ck", ctx.bancos.step2ck.length) +
        "</div></fieldset>" +

        '<div class="fatos">' +
          '<section class="cartao" aria-labelledby="t-oficial"><h2 class="h-sm" id="t-oficial">Como é o bloco na prova</h2><ul class="lista-check">' +
            "<li>" + icon("clock") + "<span>Desde maio de 2026, o Step 1 tem <strong>14 blocos de 30 minutos</strong> e o Step 2 CK, <strong>16 blocos de 30 minutos</strong>, com até 20 questões em cada bloco.</span></li>" +
            "<li>" + icon("hourglass-medium") + "<span>Trinta minutos para 20 questões dão <strong>90 segundos por questão</strong>, em média.</span></li>" +
            "<li>" + icon("flag") + "<span>Dentro do bloco, você vai e volta entre as questões, marca para revisão e muda a resposta.</span></li>" +
            "<li>" + icon("lock-simple") + "<span>Depois de encerrado, o bloco <strong>não reabre</strong>: não há como voltar a blocos anteriores.</span></li>" +
          "</ul>" +
          '<p class="fonte">Fontes: usmle.org, páginas do <a href="' + FORMATO_OFICIAL.step1.fonte + '" rel="noopener" target="_blank">Step 1</a>, do <a href="' + FORMATO_OFICIAL.step2ck.fonte + '" rel="noopener" target="_blank">Step 2 CK</a> e <a href="' + FONTES.dia + '" rel="noopener" target="_blank">Examination Day Testing</a>, consultadas em 28/10/2026.</p></section>' +

          '<section class="cartao" aria-labelledby="t-este"><h2 class="h-sm" id="t-este">Como funciona este simulado</h2><ul class="lista-check">' +
            "<li>" + icon("list-numbers") + '<span>As 20 questões saem do banco revisado do Step escolhido, <strong data-estrato>' + (step === "step1" ? "estratificadas por sistema" : "estratificadas por área") + "</strong>, na proporção em que cada uma aparece no banco.</span></li>" +
            "<li>" + icon("arrow-counter-clockwise") + "<span>As questões da sua tentativa anterior ficam de fora sempre que o banco permite.</span></li>" +
            "<li>" + icon("clock-countdown") + "<span>O relógio começa em 30:00 quando você inicia e não pausa. Avisa quando faltarem 5 minutos e 1 minuto; ao zerar, o bloco se encerra sozinho.</span></li>" +
            "<li>" + icon("graduation-cap") + "<span>Questões em inglês, como na prova. A explicação vem em inglês, com um resumo em português.</span></li>" +
            "<li>" + icon("info") + "<span>É um treino formativo: o resultado não entra nas condições da garantia, que contam as autoavaliações oficiais do NBME.</span></li>" +
          "</ul></section>" +
        "</div>" +

        '<details class="cartao"><summary>' + icon("keyboard") + "Ferramentas e atalhos do bloco</summary>" +
          '<p>As funções seguem o que o USMLE descreve para o software de prova: navegação pelo teclado, menu de ajustes, valores laboratoriais, anotações e calculadora. Riscar alternativas, realçar texto, marcar e a tela de revisão do bloco repetem o funcionamento conhecido do software. A tela oficial não é copiada; para conhecê-la, faça o <a href="' + FONTES.recursos + '" rel="noopener" target="_blank">tutorial em usmle.org</a> antes da prova.</p>' +
          '<table class="atalhos"><caption class="sr-only">Atalhos de teclado</caption><thead><tr><th scope="col">Tecla</th><th scope="col">O que faz</th></tr></thead><tbody>' +
            "<tr><td><kbd>N</kbd> ou <kbd>→</kbd></td><td>Próxima questão</td></tr>" +
            "<tr><td><kbd>P</kbd> ou <kbd>←</kbd></td><td>Questão anterior</td></tr>" +
            "<tr><td><kbd>1</kbd> a <kbd>6</kbd></td><td>Escolhe a alternativa A a F</td></tr>" +
            "<tr><td><kbd>M</kbd></td><td>Marca ou desmarca a questão para revisão</td></tr>" +
            "<tr><td><kbd>H</kbd></td><td>Realça o trecho selecionado da vinheta (de novo, remove)</td></tr>" +
            "<tr><td><kbd>L</kbd></td><td>Abre ou fecha os valores laboratoriais</td></tr>" +
            "<tr><td><kbd>C</kbd></td><td>Abre ou fecha a calculadora</td></tr>" +
            "<tr><td><kbd>O</kbd></td><td>Abre ou fecha as anotações da questão</td></tr>" +
            "<tr><td><kbd>R</kbd></td><td>Tela de revisão do bloco</td></tr>" +
            "<tr><td><kbd>Esc</kbd></td><td>Fecha o painel aberto</td></tr>" +
            "<tr><td><kbd>?</kbd></td><td>Mostra esta lista durante o bloco</td></tr>" +
          "</tbody></table>" +
          '<p class="fine">Riscar uma alternativa: botão à esquerda dela ou clique com o botão direito no texto. Riscar não apaga a resposta escolhida.</p>' +
        "</details>" +

        '<div class="iniciar">' +
          "<p>Ao iniciar, o relógio começa a contar. Reserve 30 minutos sem interrupções, como no dia da prova.</p>" +
          '<button type="button" class="btn" data-iniciar>' + icon("play") + '<span data-iniciar-rot>Iniciar bloco do ' + NOME_STEP[step] + "</span></button>" +
        "</div>" +

        '<section class="historico" aria-labelledby="t-hist">' +
          '<div class="historico__topo"><h2 class="display h3" id="t-hist">Seus blocos do <span data-hist-step>' + NOME_STEP[step] + "</span></h2>" +
          '<p class="fine">' + (ctx.conta === "participante" ? "Histórico da sua conta." : "Histórico deste navegador.") + "</p></div>" +
          '<div data-historico aria-live="polite"></div>' +
        "</section>" +
      "</div>";

    const atualizarStep = (novo) => {
      step = novo;
      gravarPrefs({ ...lerPrefs(), step });
      $("[data-iniciar-rot]", el).textContent = "Iniciar bloco do " + NOME_STEP[step];
      $("[data-hist-step]", el).textContent = NOME_STEP[step];
      $("[data-estrato]", el).textContent = step === "step1" ? "estratificadas por sistema" : "estratificadas por área";
      montarHistorico(ctx, el, step);
    };
    $$('input[name="step"]', el).forEach((r) => r.addEventListener("change", () => atualizarStep(r.value)));

    $("[data-encerrar-salvo]", el)?.addEventListener("click", async () => {
      const s = restaurarSessao(lerAndamento());
      if (!s) { ctx.render(); return; }
      const ok = await dialogo({
        titulo: "Encerrar o bloco em andamento?",
        corpo: "<p>As respostas dadas até agora serão corrigidas. Depois de encerrado, o bloco não reabre.</p>",
        acoes: [{ rotulo: "Voltar", valor: false, estilo: "ghost" }, { rotulo: "Encerrar bloco", valor: true, estilo: "perigo" }]
      });
      if (ok) await encerrarSalvo(ctx, s);
    });

    $("[data-iniciar]", el).addEventListener("click", async () => {
      const aberto = restaurarSessao(lerAndamento());
      if (aberto && tempoRestante(aberto) > 0) {
        const v = await dialogo({
          titulo: "Há um bloco em andamento",
          corpo: "<p>Termine o bloco aberto antes de começar outro. Você pode voltar a ele ou encerrá-lo agora e ver o resultado.</p>",
          acoes: [{ rotulo: "Encerrar e ver o resultado", valor: "encerrar", estilo: "ghost" }, { rotulo: "Voltar ao bloco", valor: "voltar", foco: true }]
        });
        if (v === "voltar") ctx.go("#/bloco");
        else if (v === "encerrar") await encerrarSalvo(ctx, aberto);
        return;
      }
      const banco = ctx.bancos[step];
      if (!banco.length) { toast("O banco de questões deste Step não carregou.", "erro"); return; }
      const historico = ctx._historico || (await ctx.listarTentativas());
      const semente = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      const questoes = sortearBloco({ banco, vistas: idsDaUltima(historico, step), semente });
      const s = criarSessao({ step, questoes, agora: Date.now(), semente, versao_banco: step + "-" + banco.length });
      if (!gravarAndamento(s)) toast("O navegador não deixou guardar o bloco: se a página recarregar, o progresso se perde.", "aviso", 6000);
      ctx._sessao = s;
      ctx.go("#/bloco");
    });

    await montarHistorico(ctx, el, step);
  }
};
