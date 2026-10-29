/* Road to America | simulados completos: escolha do formulário, simulados em
   andamento, histórico e indicador de aprovação do banco */
import { FORMATO_OFICIAL, NOME_STEP } from "../../plataforma/js/simulado.js";
import { TIPOS_FORMULARIO, FORMULARIOS_FIXOS, TEMPOS_OFICIAIS, LIMITE_JA_VISTOS, dimensionar, montarFormularioFixo, montarFormularioPersonalizado, itensReservados, vistosNoFormulario, formularioReservado } from "../../plataforma/js/formularios.js";
import { prontidaoCombinada, nomePadrao } from "../../plataforma/js/psicometria.js";
import { resumoRevisao } from "../../plataforma/js/banco.js";
import { prontidao } from "../../plataforma/js/desempenho.js";
import { criarDia } from "./dia-prova.js";
import { estimativaGeral, linhaHistorico, NOMES_TIPO, textoRegraConfianca, leituraConfianca } from "./relatorio.js";
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

/* o banco ainda não tem itens com imagem, áudio ou vídeo neste Step? */
function semMidia(banco, step) {
  return !(banco?.steps?.[step] || []).some((q) => (q.midia || []).length);
}

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

function seloConfianca(conf) {
  return conf?.alta ? '<span class="chip chip--ok">' + icon("seal-check") + e(conf.texto_curto || "Precisão alta") + "</span>" : '<span class="chip chip--aviso">' + icon("hourglass-medium") + "Estimativa preliminar</span>";
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
      box.innerHTML = '<div class="cartao"><h3 class="h-sm">Posição em relação ao limiar do banco</h3><p>Você ainda não respondeu itens do ' + NOME_STEP[step] + " no banco. A estimativa aparece depois do primeiro bloco, e a precisão alta exige pelo menos " + est.confianca.n_minimo + " itens.</p>" +
        '<p class="fine">' + e(pr.regra) + "</p></div>";
      return;
    }
    box.innerHTML =
      '<div class="cartao indicador">' +
        '<div class="indicador__topo"><h3 class="h-sm">Posição em relação ao limiar do banco</h3>' + seloConfianca(est.confianca) + "</div>" +
        '<p class="indicador__p"><b>' + prob(est.p_aprovacao) + "</b><span>de probabilidade de estar acima do limiar do banco (padrão " + e(nomePadrao(est.corte?.origem)) + (step === "step2ck" ? ", que representa o 218" : "") + "), com " + plural(est.n, "item respondido", "itens respondidos") + " do " + NOME_STEP[step] + ". Não é probabilidade de aprovação no USMLE.</span></p>" +
        "<p>" + e(leituraConfianca(est)) + (!est.confianca.alta && est.confianca.faltam_sistemas?.length ? " Há " + plural(est.confianca.faltam_sistemas.length, "sistema", "sistemas") + " do outline com poucos itens respondidos." : "") + "</p>" +
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
    '<thead><tr><th scope="col">Data</th><th scope="col">Simulado</th><th scope="col">Acertos</th><th scope="col">Acima do limiar do banco</th><th scope="col"><span class="sr-only">Ação</span></th></tr></thead><tbody>' +
    lista.map((l) => "<tr>" +
      '<th scope="row" data-rot="Data">' + e(dataHora(l.data)) + "</th>" +
      '<td data-rot="Simulado">' + NOME_STEP[l.step] + ", " + e(NOMES_TIPO[l.tipo] || l.tipo) + (l.reduzido ? ' <span class="chip">reduzido</span>' : "") + (l.padronizado === false ? ' <span class="chip">estudo</span>' : l.padronizado ? ' <span class="chip chip--ok">condições oficiais</span>' : "") + (l.reaplicacao ? ' <span class="chip chip--aviso">reaplicação</span>' : "") + "</td>" +
      '<td class="num" data-rot="Acertos">' + (l.acertos === null ? "sem dados" : l.acertos + " de " + l.total + " (" + pct(l.percentual) + ")") + "</td>" +
      '<td data-rot="Acima do limiar">' + (l.p_aprovacao === null ? "sem dados" : prob(l.p_aprovacao) + " " + (l.alta ? '<span class="chip chip--ok">precisão alta</span>' : '<span class="chip chip--aviso">preliminar</span>')) + "</td>" +
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
          '<p class="lead">Tutorial opcional, blocos de 30 minutos com até 20 itens, pausa que você administra e nenhum retorno a bloco encerrado. No fim, um relatório de desempenho com a posição em relação ao limiar do banco, o perfil por área em relação ao examinando no limiar e a revisão de cada item.</p>' +
          '<p class="fine" style="margin-top:12px"><a href="#/">Prefere um bloco só? Faça o simulado de 30 minutos.</a></p>' +
        "</div>" +
        '<div class="placa" aria-label="Formato oficial do dia de prova">' +
          '<p class="placa__rota"><span class="fita" aria-hidden="true"></span>Dia de prova oficial</p>' +
          '<p class="placa__num">280<small>itens no Step 1, 318 no Step 2 CK</small></p>' +
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
    const reservas = itensReservados(banco, lista);
    let respostasPorStep = {};
    const respostasDo = async (st) => {
      if (!respostasPorStep[st]) respostasPorStep[st] = await ctx.store.listRespostas({ step: st }).catch(() => []);
      return respostasPorStep[st];
    };
    /* formulários fixos montados (memória), para o resumo e a contagem de itens vistos */
    const formsCache = new Map();
    const formFixo = (st, cod, tp) => {
      const k = st + "|" + cod + "|" + tp;
      if (!formsCache.has(k)) { try { formsCache.set(k, montarFormularioFixo(banco, st, cod, tp)); } catch { formsCache.set(k, null); } }
      return formsCache.get(k);
    };
    const concluidos = lista.filter((r) => r.estado === "concluido").map(linhaHistorico);

    const avisosStep = (step) =>
      (semMidia(banco, step) ? '<div class="aviso-conta" data-aviso-midia>' + icon("info") + "<p><strong>Sem itens com imagem, por enquanto.</strong> O banco ainda não tem itens com imagem, áudio ou vídeo: ECG, radiografias, histologia e lesões de pele aparecem descritos no texto. Na prova, você precisa ler a imagem, e a descrição deixa o item mais fácil. Leve isso em conta ao ler o resultado.</p></div>" : "") +
      (() => { const rv = resumoRevisao(banco?.steps?.[step] || []); return rv.aviso ? '<div class="aviso-conta" data-aviso-revisao>' + icon("warning") + "<p><strong>Sem revisão médica, por enquanto.</strong> " + e(rv.aviso) + "</p></div>" : ""; })() +
      (step === "step2ck" && (banco?.steps?.step2ck || []).length ? (() => { const tot = banco.steps.step2ck.length; const res = (reservas.formularios || []).filter((f) => f.step === "step2ck").reduce((a, f) => a + (f.itens || 0), 0); return res ? '<div class="aviso-conta" data-aviso-ck>' + icon("info") + "<p><strong>Banco do Step 2 CK ainda pequeno.</strong> O estudo no banco de questões e o simulado completo limpo disputam os mesmos " + tot + " itens: enquanto o formulário reservado espera por você, " + res + " deles ficam fora do banco de questões e sobram " + (tot - res) + " para estudar. Quem faz primeiro o banco inteiro chega aos outros formulários já tendo visto os itens.</p></div>" : ""; })() : "");
    const demoBanco = banco.origem !== "supabase";
    const html =
      '<div class="wrap section-sm inicio">' + topo +
      (demoBanco ? '<div class="aviso-conta">' + icon("info") + "<p><strong>Modo demonstração.</strong> " + (banco.origem === "demonstracao_completa" ? "Banco completo lido de banco-privado/ neste computador." : "Só os " + banco.itens.length + " itens públicos estão disponíveis, então os formulários saem em versão reduzida, com o mesmo relógio e as mesmas regras do dia.") + " Tudo fica neste navegador.</p></div>" : "") +
      '<div data-avisos-step style="display:contents">' + avisosStep(step) + "</div>" +

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
        '<p class="fine" style="margin-top:10px">Os formulários fixos têm os mesmos itens para toda a turma, o que permite comparar resultados; o B não repete itens do A. O formulário reservado fica fora do banco de questões até você fazê-lo, como as autoavaliações do NBME, para que a primeira aplicação seja limpa. O personalizado dá preferência aos itens que você ainda não respondeu, sem sair das faixas do outline.</p></fieldset>' +

      '<div class="fatos">' +
        '<section class="cartao" aria-labelledby="t-dia"><h2 class="h-sm" id="t-dia">Como é o dia na prova</h2><ul class="lista-check">' +
          "<li>" + icon("clock") + "<span>Step 1, desde 14/05/2026: <strong>14 blocos de 30 minutos</strong>, até 280 itens, dia de 8 horas. Step 2 CK, desde 07/05/2026: <strong>16 blocos de 30 minutos</strong>, até 318 itens, dia de 9 horas. Até 20 itens por bloco.</span></li>" +
          "<li>" + icon("hourglass-medium") + "<span>Pausa de pelo menos <strong>55 minutos</strong> no dia, mais o tutorial opcional de 5 minutos. O tempo que sobra de um bloco ou do tutorial vai para a pausa.</span></li>" +
          "<li>" + icon("lock-simple") + "<span>Bloco encerrado não reabre; a revisão de itens marcados vale só dentro do bloco.</span></li>" +
          "<li>" + icon("chart-bar") + "<span>Na prova, Step 1: resultado Pass ou Fail. Step 2 CK: nota de três dígitos, com mínimo de 218 desde 01/07/2025. Aqui, enquanto o padrão do banco for provisório, o relatório mostra a posição em relação ao limiar do banco, e não Pass ou Fail.</span></li>" +
        "</ul>" +
        '<p class="fonte">Fontes: usmle.org, páginas do <a href="' + FONTES.s1 + '" target="_blank" rel="noopener">Step 1</a>, do <a href="' + FONTES.ck + '" target="_blank" rel="noopener">Step 2 CK</a>, <a href="' + FONTES.dia + '" target="_blank" rel="noopener">Examination Day Testing</a> e <a href="' + FONTES.notas + '" target="_blank" rel="noopener">Examination Results and Scoring</a>, consultadas em 28/10/2026.</p></section>' +
        '<section class="cartao" aria-labelledby="t-aqui"><h2 class="h-sm" id="t-aqui">Como funciona aqui</h2><ul class="lista-check">' +
          "<li>" + icon("list-numbers") + "<span>Os itens saem nas faixas oficiais de sistemas, disciplinas e competências do outline, com a mesma dificuldade média em todos os blocos.</span></li>" +
          "<li>" + icon("flask") + "<span>A tela do bloco é a mesma do simulado de 30 minutos: marcar, riscar, realçar, valores laboratoriais, anotações, calculadora e a tabela de cada item.</span></li>" +
          "<li>" + icon("pause") + "<span>Antes de começar, você escolhe as condições: <strong>oficiais</strong> (sem parar, a pausa corre como na prova) ou <strong>estudo</strong> (pode parar entre blocos e continuar depois). Só o dia em condições oficiais conta como padronizado no relatório.</span></li>" +
          "<li>" + icon("info") + "<span>A probabilidade mostrada é a de estar acima do limiar do banco, que ainda é provisório (vem da dificuldade-alvo dos itens, sem painel de juízes). Não é probabilidade de aprovação no USMLE. A decisão de marcar a prova segue a EXIT 18, com as autoavaliações do NBME.</span></li>" +
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
      const reservadoAinda = (cod) => reservas.formularios.some((f) => f.step === step && f.codigo === cod);
      $("[data-formularios]", el).innerHTML = [...FORMULARIOS_FIXOS[step].map((f) => [f.codigo, f.nome, "Fixo, " + f.codigo + (formularioReservado(banco, step, f.codigo) ? (reservadoAinda(f.codigo) ? ", reservado para você" : ", reservado (já feito)") : "")]), ["personalizado", "Personalizado", "Itens que você ainda não viu"]]
        .map(([cod, nome, sub]) => '<label class="opcao"><input type="radio" name="montagem" value="' + cod + '"' + (cod === montagem ? " checked" : "") + "><span><b>" + e(nome) + "</b><small>" + e(sub) + '</small><small data-vistos="' + e(cod) + '"></small></span></label>').join("");
      contarVistos();
      $$('input[name="tipo"]', el).forEach((r) => r.addEventListener("change", () => { tipo = r.value; gravarPrefs({ ...lerPrefs(), tipo_completo: tipo }); resumo(); contarVistos(); }));
      $$('input[name="montagem"]', el).forEach((r) => r.addEventListener("change", () => { montagem = r.value; gravarPrefs({ ...lerPrefs(), montagem }); resumo(); }));
      resumo();
    };
    /* "Você já respondeu N de M itens" em cada formulário fixo */
    const contarVistos = async () => {
      const st = step, tp = tipo;
      const rs = await respostasDo(st);
      if (st !== step || tp !== tipo) return;
      for (const f of FORMULARIOS_FIXOS[st]) {
        const alvo = $('[data-vistos="' + f.codigo + '"]', el);
        const form = formFixo(st, f.codigo, tp);
        if (!alvo || !form) continue;
        const v = vistosNoFormulario(form, rs);
        alvo.textContent = v.n ? "Você já respondeu " + v.n + " de " + v.total + " itens deste formulário." : "Nenhum item deste formulário respondido ainda.";
        alvo.classList.toggle("is-aviso", v.reaplicacao);
      }
    };
    /* resumo do formulário escolhido: o fixo montado de fato (o B parcial do Step 2 CK
       tem menos blocos e pausa proporcional), ou o tamanho do personalizado */
    const resumo = () => {
      const t = TIPOS_FORMULARIO[tipo];
      const fx = montagem !== "personalizado" ? formFixo(step, montagem, tipo) : null;
      const dim = dimensionar(step, tipo, banco.contagem[step] || 0);
      const blocos = fx ? fx.blocos.length : dim.blocos;
      const itens = fx ? fx.total : dim.itens;
      const pausa = fx ? fx.tempo.pausa_ms : t.pausa_ms;
      const dia = fx ? fx.tempo.dia_ms : dim.blocos * TEMPOS_OFICIAIS.bloco_ms + t.pausa_ms + t.tutorial_ms;
      const nota = fx?.parcial ? " Formulário parcial (" + blocos + " de " + t[step].blocos + " blocos), com a pausa reduzida na proporção." : fx?.reduzido || (!fx && dim.reduzido) ? " " + e(fx ? fx.motivo_reducao : dim.motivo) : "";
      $("[data-resumo-inicio]", el).innerHTML = "<strong>" + NOME_STEP[step] + ", " + e(t.nome.toLowerCase()) + (fx ? ", " + e(fx.codigo) : "") + ":</strong> " + plural(blocos, "bloco", "blocos") + " de 30 minutos, " + itens + " itens, " + duracao(pausa) + " de pausa" + (t.tutorial_ms ? " e tutorial opcional de 5 minutos" : "") + ", dia de " + duracao(dia) + "." + nota;
      $("[data-ind-step]", el).textContent = NOME_STEP[step];
    };
    $$('input[name="step"]', el).forEach((r) => r.addEventListener("change", () => {
      step = r.value; gravarPrefs({ ...lerPrefs(), step }); desenharOpcoes(); indicador(ctx, el, banco, step);
      const av = $("[data-avisos-step]", el); if (av) av.innerHTML = avisosStep(step);
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
        const respostasStep = await respostasDo(step);
        if (montagem === "personalizado") {
          const vistas = respostasStep.map((r) => r.questao_id);
          /* o personalizado não usa itens de formulário reservado ainda não feito */
          const semReserva = reservas.ids.size ? { ...banco, steps: { ...banco.steps, [step]: (banco.steps[step] || []).filter((q) => !reservas.ids.has(q.id)) } } : banco;
          form = montarFormularioPersonalizado(semReserva, { step, tipo, vistas });
        } else form = formFixo(step, montagem, tipo) || montarFormularioFixo(banco, step, montagem, tipo);
        const t = TIPOS_FORMULARIO[tipo];
        const vistos = vistosNoFormulario(form, respostasStep);
        const escolha = await dialogo({
          titulo: "Começar o " + t.nome.toLowerCase() + "?",
          corpo: "<p>" + e(form.nome) + ": " + plural(form.blocos.length, "bloco", "blocos") + ", " + form.total + " itens, " + duracao(form.tempo.pausa_ms) + " de pausa" + (form.tempo.pausa_proporcional ? " (proporcional aos blocos)" : "") + " e dia de " + duracao(form.tempo.dia_ms) + ".</p>" +
            (form.reduzido ? "<p>" + e(form.motivo_reducao) + "</p>" : "") +
            (form.parcial ? "<p>" + e(form.motivo_parcial) + "</p>" : "") +
            '<p data-modal-vistos>' + (vistos.n ? "<strong>Você já respondeu " + vistos.n + " de " + vistos.total + " itens deste formulário</strong> (" + pct(vistos.fracao) + ")." + (vistos.reaplicacao ? " Acima de " + Math.round(LIMITE_JA_VISTOS * 100) + "%, o relatório sai como reaplicação, não comparável, e fica fora da leitura de prontidão. Prefira o " + (FORMULARIOS_FIXOS[step].find((f) => f.codigo !== form.codigo)?.nome || "outro formulário") + " ou o personalizado." : " A repetição tende a subir o acerto.") : "Nenhum item deste formulário foi respondido por você antes.") + "</p>" +
            '<fieldset class="escolha-cond"><legend>Condições do dia</legend>' +
              '<label class="opcao opcao--linha"><input type="radio" name="condicoes" value="oficiais" checked><span><b>Condições oficiais</b><small>Sem parar. A pausa corre como na prova, e o que passar do saldo sai dos blocos seguintes, mesmo com a página fechada. Conta como dia padronizado.</small></span></label>' +
              '<label class="opcao opcao--linha"><input type="radio" name="condicoes" value="estudo"><span><b>Estudo</b><small>Você pode parar entre blocos e continuar depois. O relatório marca o dia como não padronizado.</small></span></label>' +
            "</fieldset>" +
            "<p>O relógio começa quando você abrir o tutorial ou o primeiro bloco. Reserve o tempo do dia inteiro.</p>",
          acoes: [{ rotulo: "Voltar", valor: false, estilo: "ghost" }, { rotulo: "Começar", valor: "ok", foco: true, icone: "play" }],
          ler: () => $('input[name="condicoes"]:checked')?.value || "oficiais"
        });
        if (!escolha) return;
        const condicoes = typeof escolha === "object" && escolha.lido ? escolha.lido : "oficiais";
        if (vistos.reaplicacao) {
          const seguir = await dialogo({
            titulo: "Fazer como reaplicação?",
            corpo: "<p>Você já respondeu " + pct(vistos.fracao) + " dos itens deste formulário. O relatório vai sair marcado como reaplicação, não comparável com uma primeira aplicação, e a estimativa dele não entra na leitura de prontidão.</p>",
            acoes: [{ rotulo: "Escolher outro formulário", valor: false, estilo: "ghost", foco: true }, { rotulo: "Fazer assim mesmo", valor: true }]
          });
          if (!seguir) return;
        }
        form.ja_vistos = { n: vistos.n, total: vistos.total, reaplicacao: vistos.reaplicacao };
        const reg = await ctx.store.criarSimuladoCompleto({ formulario: form, sessao: criarDia(form, { condicoes }) });
        ctx.go("#/dia/" + encodeURIComponent(reg.id));
      } catch (err) {
        console.error(err);
        toast("Não foi possível montar o simulado: " + (err.message || err), "erro", 8000);
      } finally { if (botao.isConnected) botao.disabled = false; }
    });

    await indicador(ctx, el, banco, step);
  }
};
