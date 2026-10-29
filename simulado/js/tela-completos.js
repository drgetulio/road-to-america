/* Road to America | simulados completos: escolha do formulário, simulados em
   andamento, histórico e indicador de aprovação do banco */
import { FORMATO_OFICIAL, NOME_STEP } from "../../plataforma/js/simulado.js";
import { TIPOS_FORMULARIO, FORMULARIOS_FIXOS, TEMPOS_OFICIAIS, dimensionar, montarFormularioFixo, montarFormularioPersonalizado } from "../../plataforma/js/formularios.js";
import { prontidaoCombinada } from "../../plataforma/js/psicometria.js";
import { prontidao } from "../../plataforma/js/desempenho.js";
import { criarDia } from "./dia-prova.js";
import { estimativaGeral, linhaHistorico, NOMES_TIPO, textoRegraConfianca } from "./relatorio.js";
import { pct, prob, duracao, plural } from "./formato.js";
import { lerPrefs, gravarPrefs } from "./armazenamento.js";
import { $, $$, e, icon, dialogo, dataHora, toast } from "./dom.js";

const FONTES = {
  dia: "https://www.usmle.org/bulletin-information/examination-day-testing",
  s1: "https://www.usmle.org/step-exams/step-1",
  ck: "https://www.usmle.org/step-exams/step-2-ck",
  notas: "https://www.usmle.org/scores-transcripts/examination-results-and-scoring"
};
const TIPOS = ["completo", "meio", "prontidao"];

function dataBr(iso) { const [a, m, d] = iso.split("-"); return d + "/" + m + "/" + a; }

function cartaoTipo(tipo, step, marcado, disponiveis) {
  const t = TIPOS_FORMULARIO[tipo];
  const of = t[step];
  const dim = dimensionar(step, tipo, disponiveis);
  const dia = of.blocos * TEMPOS_OFICIAIS.bloco_ms + t.pausa_ms + t.tutorial_ms;
  return '<label class="passe passe--tipo">' +
    '<input type="radio" name="tipo" value="' + tipo + '"' + (marcado ? " checked" : "") + ">" +
    '<span class="passe__main">' +
      '<span class="passe__top"><span>' + (t.oficial ? "Formato oficial" : "Recorte da Road to America") + "</span></span>" +
      '<span class="passe__nome">' + e(t.nome) + "</span>" +
      '<dl class="passe__dados">' +
        "<div><dt>Blocos</dt><dd>" + of.blocos + " de 30 min</dd></div>" +
        "<div><dt>Itens</dt><dd>" + of.itens + "</dd></div>" +
        "<div><dt>Pausa</dt><dd>" + duracao(t.pausa_ms) + "</dd></div>" +
        "<div><dt>Dia</dt><dd>" + duracao(dia) + "</dd></div>" +
      "</dl>" +
      (dim.reduzido ? '<span class="fine">Com o banco disponível agora: ' + plural(dim.blocos, "bloco", "blocos") + " e " + dim.itens + " itens.</span>" : "") +
    "</span>" +
    '<span class="passe__check passe__check--fim" aria-hidden="true">' + icon("check") + "</span>" +
  "</label>";
}

function seloConfianca(alta) {
  return alta ? '<span class="chip chip--ok">' + icon("seal-check") + "Alta confiança</span>" : '<span class="chip chip--aviso">' + icon("hourglass-medium") + "Estimativa preliminar</span>";
}

async function indicador(ctx, el, banco, step) {
  const box = $("[data-indicador]", el);
  box.innerHTML = '<p class="muted" role="status">Calculando a estimativa com as suas respostas...</p>';
  try {
    const [respostas, modelos, nbme] = await Promise.all([
      ctx.store.listRespostas({ step }),
      ctx.store.getModelosPsicometricos().catch(() => null),
      ctx.store.listNbme ? ctx.store.listNbme({ step }).catch(() => []) : []
    ]);
    const est = estimativaGeral({ step, respostas, porId: banco.porId, modelos });
    const pr = prontidaoCombinada({ exit18: prontidao(nbme, step), banco: est.n ? est : null });
    if (!est.n) {
      box.innerHTML = '<div class="cartao"><h3 class="h-sm">Probabilidade de aprovação pelo banco</h3><p>Você ainda não respondeu itens do ' + NOME_STEP[step] + " no banco. A estimativa aparece depois do primeiro bloco, e a confiança alta exige pelo menos " + est.confianca.n_minimo + " itens.</p>" +
        '<p class="fine">' + e(pr.regra) + "</p></div>";
      return;
    }
    const faltam = est.confianca.faltam_itens ?? est.confianca.faltam_itens_minimo;
    box.innerHTML =
      '<div class="cartao indicador">' +
        '<div class="indicador__topo"><h3 class="h-sm">Probabilidade de aprovação pelo banco</h3>' + seloConfianca(est.confianca.alta) + "</div>" +
        '<p class="indicador__p"><b>' + prob(est.p_aprovacao) + "</b><span>" + (step === "step2ck" ? "de atingir o padrão de aprovação do banco (que representa o 218)" : "de estar acima do limiar de aprovação") + ", com " + plural(est.n, "item respondido", "itens respondidos") + " do " + NOME_STEP[step] + ".</span></p>" +
        "<p>" + e(est.confianca.texto) + (!est.confianca.alta && faltam ? " Faltam cerca de " + plural(faltam, "item", "itens") + (est.confianca.faltam_sistemas?.length ? " e itens em " + plural(est.confianca.faltam_sistemas.length, "sistema", "sistemas") + " sem resposta" : "") + "." : "") + "</p>" +
        '<p class="fine">' + e(textoRegraConfianca(est)) + "</p>" +
        '<p class="fine">' + est.avisos.map(e).join(" ") + "</p>" +
        '<div class="aviso-conta' + (pr.status === "pronto" ? " aviso-conta--ok" : "") + '">' + icon("flag-banner") + "<p><strong>Prontidão (EXIT 18).</strong> " + e(pr.mensagem) + "</p></div>" +
      "</div>";
  } catch (err) {
    console.error(err);
    box.innerHTML = '<div class="vazio"><p>Não foi possível calcular a estimativa agora: ' + e(err.message || err) + "</p></div>";
  }
}

function tabelaHistorico(lista) {
  return '<div class="tabela-wrap"><table class="tabela tabela--cartoes"><caption class="sr-only">Simulados completos encerrados, do mais recente para o mais antigo</caption>' +
    '<thead><tr><th scope="col">Data</th><th scope="col">Simulado</th><th scope="col">Acertos</th><th scope="col">Probabilidade de aprovação</th><th scope="col"><span class="sr-only">Ação</span></th></tr></thead><tbody>' +
    lista.map((l) => "<tr>" +
      '<th scope="row" data-rot="Data">' + e(dataHora(l.data)) + "</th>" +
      '<td data-rot="Simulado">' + NOME_STEP[l.step] + ", " + e(NOMES_TIPO[l.tipo] || l.tipo) + (l.reduzido ? ' <span class="chip">reduzido</span>' : "") + "</td>" +
      '<td class="num" data-rot="Acertos">' + (l.acertos === null ? "sem dados" : l.acertos + " de " + l.total + " (" + pct(l.percentual) + ")") + "</td>" +
      '<td data-rot="Aprovação">' + (l.p_aprovacao === null ? "sem dados" : prob(l.p_aprovacao) + " " + (l.alta ? '<span class="chip chip--ok">alta confiança</span>' : '<span class="chip chip--aviso">preliminar</span>')) + "</td>" +
      '<td><a href="#/relatorio/' + encodeURIComponent(l.id) + '">Ver relatório<span class="sr-only"> de ' + e(dataHora(l.data)) + "</span></a></td>" +
    "</tr>").join("") + "</tbody></table></div>";
}

export default {
  titulo: "Simulados completos",
  async render(ctx, el) {
    document.body.classList.remove("em-prova");
    const prefs = lerPrefs();
    let step = prefs.step;
    let tipo = TIPOS.includes(prefs.tipo_completo) ? prefs.tipo_completo : "completo";
    let montagem = prefs.montagem || "S1-A";

    const topo =
      '<div class="inicio__topo">' +
        "<div>" +
          '<p class="eyebrow"><span class="fita" aria-hidden="true"></span>Simulados que replicam a prova</p>' +
          '<h1 class="display h1">O dia da prova, <em>bloco a bloco.</em></h1>' +
          '<p class="lead">Tutorial opcional, blocos de 30 minutos com até 20 itens, pausa que você administra e nenhum retorno a bloco encerrado. No fim, um relatório de desempenho com a probabilidade de aprovação, o perfil por área em relação ao examinando no limiar e a revisão de cada item.</p>' +
          '<p class="fine" style="margin-top:12px"><a href="#/">Prefere um bloco só? Faça o simulado de 30 minutos.</a></p>' +
        "</div>" +
        '<div class="placa" aria-label="Formato oficial do dia de prova">' +
          '<p class="placa__rota"><span class="fita" aria-hidden="true"></span>Dia de prova oficial</p>' +
          '<p class="placa__num">Exit 280<small>itens no Step 1, 318 no Step 2 CK</small></p>' +
          "<dl><div><dt>Blocos</dt><dd>14 | 16</dd></div><div><dt>Pausa</dt><dd>55 min</dd></div><div><dt>Dia</dt><dd>8 h | 9 h</dd></div></dl>" +
        "</div>" +
      "</div>";

    if (ctx.conta === "visitante") {
      el.innerHTML = '<div class="wrap section-sm inicio">' + topo +
        '<div class="aviso-conta">' + icon("lock-simple") + '<p>Os simulados completos usam o banco de questões da turma e guardam o dia de prova na sua conta, para você parar e continuar depois. <a href="../anki/#/entrar">Entre pelo app de flashcards</a> e volte a esta página. Sem login, você pode fazer o <a href="#/">simulado de 30 minutos</a>.</p></div></div>';
      return;
    }

    el.innerHTML = '<div class="wrap section-sm inicio">' + topo + '<p class="muted" role="status" data-carregando>Carregando o banco de questões...</p></div>';
    let banco;
    try { banco = await ctx.obterBanco(); }
    catch (err) {
      console.error(err);
      $("[data-carregando]", el).outerHTML = '<div class="vazio"><p>Não foi possível carregar o banco de questões: ' + e(err.message || err) + "</p></div>";
      return;
    }
    if (!banco || !banco.itens.length) {
      $("[data-carregando]", el).outerHTML = '<div class="aviso-conta">' + icon("lock-simple") + "<p>O banco de questões ainda não está liberado para a sua conta. A equipe ativa a matrícula de cada participante; se você já é da turma, fale com a coordenação.</p></div>";
      return;
    }
    let lista = [];
    try { lista = await ctx.store.listSimuladosCompletos({}); }
    catch (err) { console.error(err); toast("Não foi possível ler os seus simulados: " + (err.message || err), "erro"); }
    const andamento = lista.filter((r) => r.estado === "em_andamento");
    const concluidos = lista.filter((r) => r.estado === "concluido").map(linhaHistorico);

    const demoBanco = banco.origem !== "supabase";
    const html =
      '<div class="wrap section-sm inicio">' + topo +
      (demoBanco ? '<div class="aviso-conta">' + icon("info") + "<p><strong>Modo demonstração.</strong> " + (banco.origem === "demonstracao_completa" ? "Banco completo lido de banco-privado/ neste computador." : "Só os " + banco.itens.length + " itens públicos estão disponíveis, então os formulários saem em versão reduzida, com o mesmo relógio e as mesmas regras do dia.") + " Tudo fica neste navegador.</p></div>" : "") +

      (andamento.length ? '<section class="cartao andamento" aria-labelledby="t-and"><h2 class="h-sm" id="t-and">Em andamento</h2><ul class="revisar">' +
        andamento.map((r) => "<li><div><b>" + NOME_STEP[r.step] + ", " + e(NOMES_TIPO[r.tipo] || r.tipo) + "</b><br><span class=\"fine\">" + e(r.nome) + ". Bloco " + Math.min(r.sessao.bloco_atual + 1, r.formulario.blocos.length) + " de " + r.formulario.blocos.length +
          (r.sessao.suspensa ? ", dia parado em " + e(dataHora(r.sessao.suspensa.desde)) : r.sessao.fase === "bloco" ? ", bloco aberto (o relógio do bloco continua)" : r.sessao.fase === "intervalo" ? ", em pausa (a pausa continua correndo)" : "") + ".</span></div>" +
          '<div class="acoes"><a class="btn btn--sm" href="#/dia/' + encodeURIComponent(r.id) + '">' + icon("play") + "Continuar</a>" +
          '<button type="button" class="btn btn--ghost btn--sm" data-abandonar="' + e(r.id) + '">Abandonar</button></div></li>').join("") + "</ul></section>" : "") +

      '<fieldset class="escolha"><legend>Escolha o Step</legend><div class="escolha__grid">' +
        ["step1", "step2ck"].map((st) => {
          const f = FORMATO_OFICIAL[st];
          return '<label class="passe"><input type="radio" name="step" value="' + st + '"' + (st === step ? " checked" : "") + ">" +
            '<span class="passe__main"><span class="passe__top"><span>USMLE</span><span>Em vigor desde ' + dataBr(f.vigente_desde) + "</span></span>" +
            '<span class="passe__nome">' + NOME_STEP[st] + "</span>" +
            '<dl class="passe__dados"><div><dt>Blocos</dt><dd>' + f.blocos + " de " + f.minutos_por_bloco + " min</dd></div><div><dt>Itens</dt><dd>até " + f.questoes_max + "</dd></div><div><dt>Dia</dt><dd>" + f.horas_sessao + " h</dd></div><div><dt>Resultado</dt><dd>" + (st === "step1" ? "Pass/Fail" : "nota, mínimo 218") + "</dd></div></dl>" +
            '<span class="fine">No banco: ' + (banco.contagem[st] || 0) + " itens ativos.</span></span>" +
            '<span class="passe__stub" aria-hidden="true"><span>Dia</span><b>' + f.blocos + "</b><span>blocos</span></span>" +
            '<span class="passe__check" aria-hidden="true">' + icon("check") + "</span></label>";
        }).join("") +
      "</div></fieldset>" +

      '<fieldset class="escolha"><legend>Formato</legend><div class="escolha__grid escolha__grid--3" data-tipos></div></fieldset>' +

      '<fieldset class="escolha"><legend>Formulário</legend><div class="formularios" data-formularios></div>' +
        '<p class="fine" style="margin-top:10px">Os formulários fixos têm os mesmos itens para toda a turma, o que permite comparar resultados; o B evita os itens do A e o C evita os do A e do B, até onde o banco permite. O personalizado dá preferência aos itens que você ainda não respondeu, sem sair das faixas do outline.</p></fieldset>' +

      '<div class="fatos">' +
        '<section class="cartao" aria-labelledby="t-dia"><h2 class="h-sm" id="t-dia">Como é o dia na prova</h2><ul class="lista-check">' +
          "<li>" + icon("clock") + "<span>Step 1, desde 14/05/2026: <strong>14 blocos de 30 minutos</strong>, até 280 itens, dia de 8 horas. Step 2 CK, desde 07/05/2026: <strong>16 blocos de 30 minutos</strong>, até 318 itens, dia de 9 horas. Até 20 itens por bloco.</span></li>" +
          "<li>" + icon("hourglass-medium") + "<span>Pausa de pelo menos <strong>55 minutos</strong> no dia, mais o tutorial opcional de 5 minutos. O tempo que sobra de um bloco ou do tutorial vai para a pausa.</span></li>" +
          "<li>" + icon("lock-simple") + "<span>Bloco encerrado não reabre; a revisão de itens marcados vale só dentro do bloco.</span></li>" +
          "<li>" + icon("chart-bar") + "<span>Step 1: resultado Pass ou Fail. Step 2 CK: nota de três dígitos, com mínimo de 218 desde 01/07/2025.</span></li>" +
        "</ul>" +
        '<p class="fonte">Fontes: usmle.org, páginas do <a href="' + FONTES.s1 + '" target="_blank" rel="noopener">Step 1</a>, do <a href="' + FONTES.ck + '" target="_blank" rel="noopener">Step 2 CK</a>, <a href="' + FONTES.dia + '" target="_blank" rel="noopener">Examination Day Testing</a> e <a href="' + FONTES.notas + '" target="_blank" rel="noopener">Examination Results and Scoring</a>, consultadas em 28/10/2026.</p></section>' +
        '<section class="cartao" aria-labelledby="t-aqui"><h2 class="h-sm" id="t-aqui">Como funciona aqui</h2><ul class="lista-check">' +
          "<li>" + icon("list-numbers") + "<span>Os itens saem nas faixas oficiais de sistemas, disciplinas e competências do outline, com a mesma dificuldade média em todos os blocos.</span></li>" +
          "<li>" + icon("flask") + "<span>A tela do bloco é a mesma do simulado de 30 minutos: marcar, riscar, realçar, valores laboratoriais, anotações, calculadora e a tabela de cada item.</span></li>" +
          "<li>" + icon("pause") + "<span>Entre dois blocos, você pode <strong>parar e continuar depois</strong>: o tempo parado não conta como pausa. Isso não existe na prova e aparece no relatório.</span></li>" +
          "<li>" + icon("info") + "<span>A probabilidade de aprovação vem do padrão de Angoff do banco e não é resultado oficial. A decisão de marcar a prova segue a EXIT 18, com as autoavaliações do NBME.</span></li>" +
        "</ul></section>" +
      "</div>" +

      '<div class="iniciar"><p data-resumo-inicio></p><button type="button" class="btn" data-iniciar>' + icon("play") + "<span>Montar e começar</span></button></div>" +

      '<section class="historico" aria-labelledby="t-ind"><div class="historico__topo"><h2 class="display h3" id="t-ind">Sua estimativa no <span data-ind-step></span></h2><p class="fine">Todas as suas respostas do banco: blocos de 30 minutos e simulados completos.</p></div><div data-indicador aria-live="polite"></div></section>' +

      '<section class="historico" aria-labelledby="t-hist"><div class="historico__topo"><h2 class="display h3" id="t-hist">Histórico de simulados completos</h2></div>' +
        (concluidos.length ? tabelaHistorico(concluidos) : '<div class="vazio"><p>Nenhum simulado completo encerrado ainda. O relatório de cada um fica aqui.</p></div>') +
      "</section>" +
      "</div>";
    el.innerHTML = html;

    const codigoValido = (st, cod) => cod === "personalizado" || FORMULARIOS_FIXOS[st].some((f) => f.codigo === cod);
    const desenharOpcoes = () => {
      $("[data-tipos]", el).innerHTML = TIPOS.map((t) => cartaoTipo(t, step, t === tipo, banco.contagem[step] || 0)).join("");
      if (!codigoValido(step, montagem)) montagem = FORMULARIOS_FIXOS[step][0].codigo;
      $("[data-formularios]", el).innerHTML = [...FORMULARIOS_FIXOS[step].map((f) => [f.codigo, f.nome, "Fixo, " + f.codigo]), ["personalizado", "Personalizado", "Itens que você ainda não viu"]]
        .map(([cod, nome, sub]) => '<label class="opcao"><input type="radio" name="montagem" value="' + cod + '"' + (cod === montagem ? " checked" : "") + "><span><b>" + e(nome) + "</b><small>" + e(sub) + "</small></span></label>").join("");
      $$('input[name="tipo"]', el).forEach((r) => r.addEventListener("change", () => { tipo = r.value; gravarPrefs({ ...lerPrefs(), tipo_completo: tipo }); resumo(); }));
      $$('input[name="montagem"]', el).forEach((r) => r.addEventListener("change", () => { montagem = r.value; gravarPrefs({ ...lerPrefs(), montagem }); resumo(); }));
      resumo();
    };
    const resumo = () => {
      const t = TIPOS_FORMULARIO[tipo];
      const dim = dimensionar(step, tipo, banco.contagem[step] || 0);
      const dia = dim.blocos * TEMPOS_OFICIAIS.bloco_ms + t.pausa_ms + t.tutorial_ms;
      $("[data-resumo-inicio]", el).innerHTML = "<strong>" + NOME_STEP[step] + ", " + e(t.nome.toLowerCase()) + ":</strong> " + plural(dim.blocos, "bloco", "blocos") + " de 30 minutos, " + dim.itens + " itens, " + duracao(t.pausa_ms) + " de pausa" + (t.tutorial_ms ? " e tutorial opcional de 5 minutos" : "") + ", dia de " + duracao(dia) + "." + (dim.reduzido ? " " + e(dim.motivo) : "");
      $("[data-ind-step]", el).textContent = NOME_STEP[step];
    };
    $$('input[name="step"]', el).forEach((r) => r.addEventListener("change", () => {
      step = r.value; gravarPrefs({ ...lerPrefs(), step }); desenharOpcoes(); indicador(ctx, el, banco, step);
    }));
    desenharOpcoes();

    $$("[data-abandonar]", el).forEach((b) => b.addEventListener("click", async () => {
      const ok = await dialogo({
        titulo: "Abandonar o simulado?",
        corpo: "<p>O simulado sai da lista de andamento e não gera relatório. As respostas dos blocos já encerrados continuam fora da estimativa.</p>",
        acoes: [{ rotulo: "Voltar", valor: false, estilo: "ghost", foco: true }, { rotulo: "Abandonar", valor: true, estilo: "perigo" }]
      });
      if (!ok) return;
      try { await ctx.store.abandonarSimuladoCompleto(b.dataset.abandonar); toast("Simulado abandonado.", "info"); ctx.render(); }
      catch (err) { toast("Não foi possível abandonar: " + (err.message || err), "erro"); }
    }));

    $("[data-iniciar]", el).addEventListener("click", async (ev) => {
      const botao = ev.currentTarget;
      const mesmo = andamento.find((r) => r.step === step);
      if (mesmo) {
        const v = await dialogo({
          titulo: "Há um simulado do " + NOME_STEP[step] + " em andamento",
          corpo: "<p>Termine ou abandone o simulado aberto antes de começar outro do mesmo Step.</p>",
          acoes: [{ rotulo: "Fechar", valor: null, estilo: "ghost" }, { rotulo: "Continuar o simulado aberto", valor: "ir", foco: true }]
        });
        if (v === "ir") ctx.go("#/dia/" + encodeURIComponent(mesmo.id));
        return;
      }
      botao.disabled = true;
      try {
        let form;
        if (montagem === "personalizado") {
          const vistas = (await ctx.store.listRespostas({ step })).map((r) => r.questao_id);
          form = montarFormularioPersonalizado(banco, { step, tipo, vistas });
        } else form = montarFormularioFixo(banco, step, montagem, tipo);
        const t = TIPOS_FORMULARIO[tipo];
        const ok = await dialogo({
          titulo: "Começar o " + t.nome.toLowerCase() + "?",
          corpo: "<p>" + e(form.nome) + ": " + plural(form.blocos.length, "bloco", "blocos") + ", " + form.total + " itens, " + duracao(form.tempo.pausa_ms) + " de pausa e dia de " + duracao(form.tempo.dia_ms) + ".</p>" +
            (form.reduzido ? "<p>" + e(form.motivo_reducao) + "</p>" : "") +
            "<p>O relógio começa quando você abrir o tutorial ou o primeiro bloco. Reserve o tempo do dia inteiro; se precisar, pare entre dois blocos e continue depois.</p>",
          acoes: [{ rotulo: "Voltar", valor: false, estilo: "ghost" }, { rotulo: "Começar", valor: true, foco: true, icone: "play" }]
        });
        if (!ok) return;
        const reg = await ctx.store.criarSimuladoCompleto({ formulario: form, sessao: criarDia(form) });
        ctx.go("#/dia/" + encodeURIComponent(reg.id));
      } catch (err) {
        console.error(err);
        toast("Não foi possível montar o simulado: " + (err.message || err), "erro", 8000);
      } finally { if (botao.isConnected) botao.disabled = false; }
    });

    await indicador(ctx, el, banco, step);
  }
};
