/* Road to America | dia de prova do simulado completo: check-in, tutorial opcional,
   blocos (mesma tela do bloco de 30 minutos), pausas com saldo, parar e continuar
   depois e fim do dia. O estado é o de dia-prova.js (sobre o relógio oficial de
   plataforma/js/formularios.js) e fica na camada de dados
   (store.salvarProgressoSimulado), com uma cópia no navegador a cada mudança.
   Ícones usados: ph-pause ph-play ph-coffee ph-timer ph-airplane-takeoff
   ph-airplane-landing ph-calendar-check ph-book-open ph-sign-out ph-check ph-lock-simple */
import { NOME_STEP } from "../../plataforma/js/simulado.js";
import {
  comecarTutorial, comecarBloco, irParaQuestao, escolherResposta, alternarMarcada, alternarRisco, definirRealces,
  definirNotaItem, avisoDoBloco, fecharBloco, sincronizar, suspender, retomar, podeSuspender, relogioDoDia,
  resumoDoDia, maisRecente, restanteBloco, blocoExpirou
} from "./dia-prova.js";
import { montarBloco } from "./interface-bloco.js";
import { corrigirRegistro, estimativaDoSimulado, instantaneo, NOMES_TIPO } from "./relatorio.js";
import { gravarEspelho, lerEspelho, apagarEspelho } from "./armazenamento.js";
import { relogio } from "./resultado.js";
import { duracao, plural, pct } from "./formato.js";
import { $, e, icon, toast, dialogo, anunciar } from "./dom.js";

const TUTORIAL_OFICIAL = "https://www.usmle.org/exam-resources";

let limpar = null;

function trilha(form, s) {
  return '<ol class="trilha" aria-label="Blocos do dia">' + form.blocos.map((b, i) => {
    const feito = i < s.blocos_encerrados;
    const atual = i === s.bloco_atual && s.fase !== "concluido";
    const enc = s.encerramentos.find((x) => x.bloco === i);
    return '<li class="trilha__b' + (feito ? " is-feito" : "") + (atual ? " is-atual" : "") + '"' + (atual ? ' aria-current="step"' : "") + ">" +
      "<span>" + (i + 1) + '</span><span class="sr-only">' + (feito ? ", encerrado" + (enc?.motivo === "tempo" ? " pelo tempo" : "") : atual ? ", próximo" : ", a fazer") + "</span></li>";
  }).join("") + "</ol>";
}

export default {
  titulo: "Dia de prova",
  focoProprio: true,
  destroy() { if (limpar) limpar(); limpar = null; },
  async render(ctx, el, { sub }) {
    document.body.classList.remove("em-prova");
    const id = decodeURIComponent(sub[0] || "");
    el.innerHTML = '<div class="wrap section-sm"><p class="muted" role="status">Abrindo o simulado...</p></div>';
    const voltar = '<p style="margin-top:12px"><a class="btn btn--ghost btn--sm" href="#/completos">Voltar aos simulados completos</a></p>';
    if (ctx.conta === "visitante") { location.replace("#/completos"); return; }
    let banco, reg;
    try {
      banco = await ctx.obterBanco();
      reg = await ctx.store.getSimuladoCompleto(id);
    } catch (err) {
      el.innerHTML = '<div class="wrap section-sm"><div class="vazio"><h1 class="h-sm">Não foi possível abrir o simulado.</h1><p>' + e(err.message || err) + "</p>" + voltar + "</div></div>";
      return;
    }
    if (!reg) { el.innerHTML = '<div class="wrap section-sm"><div class="vazio"><h1 class="h-sm">Simulado não encontrado.</h1><p>Ele não está na sua conta ou neste navegador.</p>' + voltar + "</div></div>"; return; }
    if (reg.estado === "concluido") { location.replace("#/relatorio/" + encodeURIComponent(id)); return; }
    if (reg.estado === "abandonado") { el.innerHTML = '<div class="wrap section-sm"><div class="vazio"><h1 class="h-sm">Este simulado foi abandonado.</h1><p>Um simulado abandonado não reabre.</p>' + voltar + "</div></div>"; return; }
    const form = reg.formulario;
    const faltando = form.blocos.flat().filter((q) => !banco.porId.has(q));
    if (faltando.length) {
      el.innerHTML = '<div class="wrap section-sm"><div class="vazio"><h1 class="h-sm">O banco mudou depois que este simulado foi montado.</h1><p>' + plural(faltando.length, "item deste formulário não está", "itens deste formulário não estão") + " mais ativos no banco (" + e(faltando.slice(0, 5).join(", ")) + (faltando.length > 5 ? "..." : "") + "). Abandone este simulado e monte outro.</p>" + voltar + "</div></div>";
      return;
    }

    /* ---------- Estado e gravação ---------- */
    let s = maisRecente(reg.sessao, lerEspelho(id));
    let fila = Promise.resolve();
    let sujo = s !== reg.sessao;
    let tGravar = null;
    let avisouFalha = false;
    let destruido = false;
    const gravarAgora = () => {
      clearTimeout(tGravar);
      if (!sujo) return fila;
      sujo = false;
      const copia = s;
      fila = fila.then(() => ctx.store.salvarProgressoSimulado(id, copia)).then(() => { avisouFalha = false; }).catch((err) => {
        console.error(err);
        sujo = true;
        if (!avisouFalha) { avisouFalha = true; toast("Sem conexão com a conta agora. O dia continua guardado neste navegador e será enviado na próxima gravação.", "aviso", 7000); }
      });
      return fila;
    };
    const mudar = (novo, { urgente = false } = {}) => {
      if (novo === s) { if (urgente) gravarAgora(); return; }
      s = novo;
      gravarEspelho(id, s);
      sujo = true;
      clearTimeout(tGravar);
      if (urgente) gravarAgora(); else tGravar = setTimeout(gravarAgora, 3000);
    };
    gravarEspelho(id, s);

    const sinc = sincronizar(s, Date.now());
    if (sinc.fechou || sinc.suspendeu) {
      mudar(sinc.sessao, { urgente: true });
      const msg = {
        bloco: "O tempo do bloco acabou enquanto a página estava fechada. O bloco foi encerrado e o dia ficou parado a partir do fim dele.",
        pausa: "O saldo de pausa acabou enquanto a página estava fechada. O dia ficou parado no instante em que o saldo zerou, sem desconto nos próximos blocos.",
        tutorial: "O tutorial ficou aberto com a página fechada e o tempo além dele gastou a pausa. O dia ficou parado, antes do bloco 1, no instante em que o saldo zerou."
      };
      toast(msg[sinc.motivo] || "O tempo do bloco acabou e ele foi encerrado.", "info", 9000);
    } else if (sujo) gravarAgora();

    const questoesDoBloco = () => form.blocos[s.bloco_atual].map((qid) => banco.porId.get(qid));
    let tela = null;
    let tick = null;
    const pararTela = () => { clearInterval(tick); tick = null; if (tela) { tela.destroy(); tela = null; } };
    const focarTitulo = () => { const h = $("h1", el); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } window.scrollTo({ top: 0 }); };
    const nomeDia = NOME_STEP[form.step] + ", " + (NOMES_TIPO[form.tipo] || form.tipo).toLowerCase();

    function cabecalho(rotulo) {
      const r = relogioDoDia(s, form, Date.now());
      return '<div class="dia__cab">' +
        '<p class="eyebrow"><span class="fita" aria-hidden="true"></span>' + e(rotulo) + "</p>" +
        '<p class="dia__relogio"><span>Dia de prova</span><b data-dia-t>' + relogio(r.dia_decorrido_ms) + "</b><small>de " + duracao(r.dia_total_ms) + "</small></p>" +
      "</div>";
    }
    function atualizarDia() {
      const r = relogioDoDia(s, form, Date.now());
      const t = $("[data-dia-t]", el);
      if (t) t.textContent = relogio(r.dia_decorrido_ms);
      return r;
    }

    /* ---------- Fases ---------- */
    function desenhar() {
      pararTela();
      if (destruido) return;
      document.body.classList.remove("em-prova");
      if (s.fase === "bloco") return telaBloco();
      if (s.fase === "concluido") return telaFim();
      if (s.fase === "tutorial") return telaTutorial();
      if (s.fase === "intervalo") return s.suspensa ? telaParado() : telaPausa();
      return telaInicio();
    }

    function telaInicio() {
      const temTutorial = form.tempo.tutorial_ms > 0;
      el.innerHTML = '<div class="wrap section-sm dia">' + cabecalho("Check-in") +
        '<h1 class="display h2">' + e(nomeDia) + "</h1>" +
        '<article class="embarque" aria-label="Resumo do dia">' +
          '<div class="embarque__main">' +
            '<p class="embarque__top"><span>' + e(form.nome) + "</span><span>" + (form.modo === "fixo" ? "Formulário fixo " + e(form.codigo) : "Formulário personalizado") + "</span></p>" +
            '<dl class="embarque__dados">' +
              "<div><dt>Blocos</dt><dd>" + form.blocos.length + "<small>de 30 minutos, até 20 itens</small></dd></div>" +
              "<div><dt>Itens</dt><dd>" + form.total + "<small>" + (form.reduzido ? "versão reduzida" : "formato " + (form.oficial.formato_oficial ? "oficial" : "da Road to America")) + "</small></dd></div>" +
              "<div><dt>Pausa</dt><dd>" + duracao(form.tempo.pausa_ms) + "<small>mais as sobras de blocos" + (temTutorial ? " e do tutorial" : "") + "</small></dd></div>" +
              "<div><dt>Tutorial</dt><dd>" + (temTutorial ? duracao(form.tempo.tutorial_ms) : "sem") + "<small>" + (temTutorial ? "opcional" : "neste formato") + "</small></dd></div>" +
              "<div><dt>Dia</dt><dd>" + duracao(form.tempo.dia_ms) + "<small>blocos, pausa e tutorial</small></dd></div>" +
            "</dl>" +
          "</div>" +
          '<div class="embarque__stub" aria-hidden="true"><span>Embarque</span><b>' + form.blocos.length + "</b><em>blocos</em></div>" +
        "</article>" +
        (form.reduzido ? '<div class="aviso-conta">' + icon("info") + "<p>" + e(form.motivo_reducao) + "</p></div>" : "") +
        '<section class="cartao" aria-labelledby="t-regras"><h2 class="h-sm" id="t-regras">Regras do dia</h2><ul class="lista-check">' +
          "<li>" + icon("lock-simple") + "<span>Um bloco encerrado, por você ou pelo tempo, não reabre. A revisão de itens marcados vale só dentro do bloco aberto.</span></li>" +
          "<li>" + icon("coffee") + "<span>Entre os blocos, a pausa usa o seu saldo. O que passar do saldo é descontado do bloco seguinte, porque o dia não se estende. Passados 10 minutos além do saldo, o dia para sozinho (regra da Road to America).</span></li>" +
          "<li>" + icon("pause") + "<span>Entre dois blocos, você pode parar e continuar outro dia. O tempo parado não conta como pausa.</span></li>" +
          "<li>" + icon("timer") + "<span>Se a página fechar com um bloco aberto, o relógio do bloco continua, como no centro de provas.</span></li>" +
        "</ul></section>" +
        '<div class="iniciar"><p>' + (temTutorial ? "O tutorial mostra as ferramentas da tela. Pular dá os 5 minutos inteiros à pausa." : "Este formato não tem tutorial. O relógio começa com o bloco 1.") + "</p>" +
          '<div class="acoes">' + (temTutorial ? '<button type="button" class="btn btn--ghost" data-tutorial>' + icon("book-open") + "Fazer o tutorial (5 min)</button>" : "") +
          '<button type="button" class="btn" data-bloco>' + icon("play") + (temTutorial ? "Pular o tutorial e iniciar o bloco 1" : "Iniciar o bloco 1") + "</button></div></div>" +
        '<p><a href="#/completos">Sair. Nada está correndo ainda.</a></p>' +
        "</div>";
      $("[data-tutorial]", el)?.addEventListener("click", () => { mudar(comecarTutorial(s, Date.now()), { urgente: true }); desenhar(); });
      $("[data-bloco]", el).addEventListener("click", iniciarProximo);
      focarTitulo();
    }

    function telaTutorial() {
      el.innerHTML = '<div class="wrap section-sm dia">' + cabecalho("Tutorial opcional") +
        '<div class="pausa">' +
          '<div class="pausa__placa" role="group" aria-label="Tempo do tutorial"><p class="pausa__rot">Tempo do tutorial</p><p class="pausa__t" data-tut-t></p><p class="pausa__sub" data-tut-sub>O que sobrar vai para a pausa.</p></div>' +
          "<div>" +
            '<h1 class="display h2">A tela do bloco, <em>em 5 minutos.</em></h1>' +
            '<p class="lead">É a mesma tela em todos os blocos e no simulado de 30 minutos. Para conhecer a do software oficial, faça também o <a href="' + TUTORIAL_OFICIAL + '" target="_blank" rel="noopener">tutorial em usmle.org</a>.</p>' +
          "</div>" +
        "</div>" +
        '<div class="tutorial">' +
          '<section class="cartao"><h2 class="h-sm">' + icon("list-numbers") + "Navegar e marcar</h2><p>A lista numerada leva a qualquer item do bloco. Anterior e Próxima andam de um em um (teclas P e N). Marcar (M) guarda o item para a revisão do bloco; a marcação não muda a resposta.</p></section>" +
          '<section class="cartao"><h2 class="h-sm">' + icon("text-strikethrough") + "Riscar e realçar</h2><p>O botão à esquerda de cada alternativa (ou o botão direito do mouse) risca a opção, sem apagar a resposta escolhida. Selecione um trecho da vinheta e toque em Realçar (H); clique no realce para tirar.</p></section>" +
          '<section class="cartao"><h2 class="h-sm">' + icon("flask") + "Valores e calculadora</h2><p>Lab (L) abre a tabela de valores laboratoriais com busca em inglês e português. A calculadora (C) faz as quatro operações, porcentagem e raiz. Alguns itens trazem a própria tabela de exames no meio do caso.</p></section>" +
          '<section class="cartao"><h2 class="h-sm">' + icon("note-pencil") + "Anotações</h2><p>Anotações (O) guardam um texto por item. Elas voltam no relatório, ao lado da explicação.</p></section>" +
          '<section class="cartao"><h2 class="h-sm">' + icon("clock-countdown") + "Relógio do bloco</h2><p>Começa em 30:00, avisa a 5 minutos e a 1 minuto e encerra o bloco ao zerar. Se você encerrar antes, a sobra vai para a pausa.</p></section>" +
          '<section class="cartao"><h2 class="h-sm">' + icon("coffee") + "Pausa</h2><p>Depois de cada bloco aparece o saldo de pausa. O tempo além do saldo é descontado do bloco seguinte. Entre blocos, Parar guarda o dia para continuar depois.</p></section>" +
        "</div>" +
        '<div class="iniciar"><p>Ao encerrar o tutorial, o bloco 1 começa e o tempo que sobrou do tutorial vai para a pausa.</p><button type="button" class="btn" data-bloco>' + icon("play") + "Encerrar o tutorial e iniciar o bloco 1</button></div>" +
        "</div>";
      $("[data-bloco]", el).addEventListener("click", iniciarProximo);
      const atualizar = () => {
        const sx = sincronizar(s, Date.now(), { paginaAberta: true });
        if (sx.suspendeu) {
          mudar(sx.sessao, { urgente: true });
          desenhar();
          anunciar("O tutorial passou 10 minutos do saldo de pausa e o dia foi parado antes do bloco 1.");
          return false;
        }
        const r = atualizarDia();
        const resta = r.tutorial_restante_ms ?? 0;
        $("[data-tut-t]", el).textContent = relogio(Math.ceil(resta / 1000) * 1000);
        if (resta <= 0) $("[data-tut-sub]", el).textContent = "O tempo do tutorial acabou; daqui em diante, o tempo conta como pausa.";
      };
      if (atualizar() === false) return;
      tick = setInterval(atualizar, 500);
      focarTitulo();
    }

    function telaPausa() {
      const ultimo = s.encerramentos[s.encerramentos.length - 1];
      const proximo = s.bloco_atual + 1;
      el.innerHTML = '<div class="wrap section-sm dia">' + cabecalho("Pausa entre blocos") +
        '<div class="pausa">' +
          '<div class="pausa__placa" role="group" aria-label="Saldo de pausa"><p class="pausa__rot" data-pausa-rot>Saldo de pausa</p><p class="pausa__t" data-pausa-t></p><p class="pausa__sub" data-pausa-sub></p></div>' +
          "<div>" +
            '<h1 class="display h2">' + (s.blocos_encerrados ? "Bloco " + s.blocos_encerrados + " de " + form.blocos.length + " encerrado" + (ultimo?.motivo === "tempo" ? " <em>pelo tempo.</em>" : ".") : "Tutorial encerrado. <em>Antes do bloco 1.</em>") + "</h1>" +
            '<p class="lead">' + (ultimo ? (ultimo.sobra_ms > 0 ? "Você encerrou o bloco com " + duracao(ultimo.sobra_ms) + " sobrando, e esse tempo entrou no saldo de pausa. " : "") : "") + "O próximo é o bloco " + proximo + "." + (s.blocos_encerrados ? " Ele não reabre os anteriores." : "") + "</p>" +
          "</div>" +
        "</div>" +
        trilha(form, s) +
        '<div class="iniciar"><p data-proximo-txt></p><div class="acoes"><button type="button" class="btn btn--ghost" data-parar>' + icon("pause") + "Parar e continuar depois</button>" +
          '<button type="button" class="btn" data-bloco>' + icon("play") + "Iniciar o bloco " + proximo + "</button></div></div>" +
        '<p class="fine">Parar guarda o dia na sua conta: o saldo de pausa fica congelado até você voltar. Na prova, a pausa corre sem parar; por isso o relatório informa quantas vezes o dia foi interrompido.</p>' +
        "</div>";
      $("[data-bloco]", el).addEventListener("click", iniciarProximo);
      $("[data-parar]", el).addEventListener("click", async () => {
        if (!podeSuspender(s)) return;
        mudar(suspender(s, Date.now()), { urgente: true });
        await gravarAgora();
        toast("Dia parado. Continue em Simulados completos, quando quiser.", "ok", 6000);
        ctx.go("#/completos");
      });
      let avisou = false;
      const atualizar = () => {
        const parar = sincronizar(s, Date.now(), { paginaAberta: true });
        if (parar.suspendeu) {
          mudar(parar.sessao, { urgente: true });
          desenhar();
          anunciar("A pausa passou 10 minutos do saldo e o dia foi parado. Retome quando voltar.");
          return false;
        }
        const r = atualizarDia();
        const placa = $(".pausa__placa", el);
        if (r.pausa_excedente_ms > 0) {
          placa.classList.add("is-excedente");
          $("[data-pausa-rot]", el).textContent = "Pausa além do saldo";
          $("[data-pausa-t]", el).textContent = relogio(r.pausa_excedente_ms);
          $("[data-pausa-sub]", el).textContent = "Sai do tempo do próximo bloco.";
          if (!avisou) { avisou = true; anunciar("O saldo de pausa acabou. O tempo extra será descontado do próximo bloco."); }
        } else {
          placa.classList.remove("is-excedente");
          $("[data-pausa-rot]", el).textContent = "Saldo de pausa";
          $("[data-pausa-t]", el).textContent = relogio(Math.ceil(r.pausa_saldo_ms / 1000) * 1000);
          const nesta = Math.max(0, Date.now() - Date.parse(s.relogio.fase_desde));
          $("[data-pausa-sub]", el).textContent = "Nesta pausa: " + relogio(nesta) + ". No dia: " + duracao(r.pausa_usada_ms + nesta) + ".";
        }
        $("[data-proximo-txt]", el).innerHTML = "O bloco " + proximo + " terá <strong>" + relogio(r.proximo_bloco_ms) + "</strong>" + (r.proximo_bloco_ms < form.tempo.bloco_ms ? ", porque a pausa passou do saldo." : ", o tempo inteiro.");
      };
      if (atualizar() === false) return;
      tick = setInterval(atualizar, 500);
      focarTitulo();
    }

    function telaParado() {
      const auto = s.suspensa?.automatica;
      const r = relogioDoDia(s, form, Date.now());
      el.innerHTML = '<div class="wrap section-sm dia">' + cabecalho("Dia parado") +
        '<div class="pausa">' +
          '<div class="pausa__placa is-parado" role="group" aria-label="Saldo de pausa congelado"><p class="pausa__rot">Saldo de pausa</p><p class="pausa__t">' + relogio(r.pausa_saldo_ms) + '</p><p class="pausa__sub">congelado enquanto o dia está parado</p></div>' +
          "<div>" +
            '<h1 class="display h2">Seu dia está parado <em>antes do bloco ' + (s.bloco_atual + 1) + ".</em></h1>" +
            '<p class="lead">' + (auto ? ({
              bloco: "O tempo do bloco " + s.blocos_encerrados + " acabou com a página fechada; o bloco foi encerrado no fim do tempo e o dia parou ali. ",
              tutorial: r.pausa_excedente_ms > 0
                ? "O tutorial passou 10 minutos do saldo de pausa com a página aberta; esses 10 minutos saem do bloco 1, e o dia parou ali. "
                : "O tutorial ficou aberto com a página fechada e gastou o saldo de pausa; o dia parou no instante em que ele zerou. ",
              pausa: r.pausa_excedente_ms > 0
                ? "A pausa passou 10 minutos do saldo com a página aberta; esses 10 minutos saem do próximo bloco, e o dia parou ali. "
                : "O saldo de pausa acabou com a página fechada; o dia parou no instante em que ele zerou. ",
            }[s.suspensa.motivo] || "") : "") + "Ao retomar, a pausa volta a correr de onde parou. Os blocos encerrados não reabrem.</p>" +
          "</div>" +
        "</div>" +
        trilha(form, s) +
        '<div class="iniciar"><p>Retome quando puder reservar o restante do dia: ' + plural(form.blocos.length - s.blocos_encerrados, "bloco", "blocos") + " pela frente.</p>" +
          '<div class="acoes"><a class="btn btn--ghost" href="#/completos">' + icon("sign-out") + 'Voltar depois</a><button type="button" class="btn" data-retomar>' + icon("play") + "Retomar o dia</button></div></div>" +
        "</div>";
      $("[data-retomar]", el).addEventListener("click", () => { mudar(retomar(s, Date.now()), { urgente: true }); desenhar(); anunciar("Dia retomado. A pausa voltou a correr."); });
      focarTitulo();
    }

    function iniciarProximo() {
      if (s.suspensa) return;
      const novo = comecarBloco(s, form, Date.now());
      mudar(novo, { urgente: true });
      desenhar();
    }

    function telaBloco() {
      const questoes = questoesDoBloco();
      const b = s.bloco_atual;
      const linha = (i) => s.respostas[s.bloco_atual][i];
      const seguro = (f) => (...args) => {
        try { f(...args); }
        catch (err) { if (!/tempo do bloco acabou|Não há bloco/.test(err.message || "")) { console.error(err); toast(err.message || String(err), "erro"); } }
      };
      tela = montarBloco(el, {
        titulo: nomeDia + ", bloco " + (b + 1) + " de " + form.blocos.length + ", " + questoes.length + " itens",
        marca: NOME_STEP[form.step] + " | Bloco " + (b + 1) + " de " + form.blocos.length,
        questoes,
        labs: ctx.labs,
        estado: {
          atual: () => s.ui?.atual ?? 0,
          resposta: (i) => linha(i)?.resposta ?? null,
          marcada: (i) => !!linha(i)?.marcada,
          riscadas: (i) => s.ui?.riscadas[i] || [],
          realces: (i) => s.ui?.realces[i] || { vinheta: [], pergunta: [] },
          nota: (i) => s.notas?.[form.blocos[s.bloco_atual][i]] || ""
        },
        acoes: {
          ir: seguro((i, t) => mudar(irParaQuestao(s, i, t))),
          responder: seguro((i, letra) => mudar(escolherResposta(s, i, letra, Date.now()))),
          marcar: seguro((i) => mudar(alternarMarcada(s, i, Date.now()))),
          riscar: seguro((i, letra) => mudar(alternarRisco(s, i, letra))),
          nota: seguro((i, texto) => mudar(definirNotaItem(s, form, i, texto))),
          realces: seguro((i, r) => mudar(definirRealces(s, i, r))),
          salvar: ({ urgente = false } = {}) => { if (urgente) gravarAgora(); }
        },
        relogio: {
          rotulo: "Tempo restante do bloco",
          restante: (t) => restanteBloco(s, t),
          expirou: (t) => blocoExpirou(s, t),
          aviso: (t) => { const r = avisoDoBloco(s, t); if (r.marco) mudar(r.sessao); return r.marco; }
        },
        rodapeExtra: {
          html: '<span class="relogio__rot">Dia</span><span class="relogio__t relogio__t--dia" data-dia-bloco></span>',
          atualizar: (no, t) => { const x = $("[data-dia-bloco]", no); const txt = relogio(relogioDoDia(s, form, t).dia_decorrido_ms); if (x && x.textContent !== txt) x.textContent = txt; }
        },
        textoNotas: "As anotações ficam com o simulado e aparecem no relatório, ao lado da explicação do item.",
        textoFim: () => "<p>Depois de encerrado, o bloco não reabre. O tempo que sobrar vai para a pausa.</p>",
        rotuloSair: "Sair (o relógio do bloco continua)",
        sair: async () => { await gravarAgora(); ctx.go("#/completos"); },
        encerrar: async (motivo) => {
          mudar(fecharBloco(s, Date.now(), motivo), { urgente: true });
          tela?.destroy(); tela = null;
          desenhar();
          anunciar(s.fase === "concluido" ? "Último bloco encerrado. Fim do dia." : "Bloco " + (b + 1) + " encerrado. Pausa entre blocos.");
        },
        anuncio: "Bloco " + (b + 1) + " de " + form.blocos.length + " iniciado. " + relogio(restanteBloco(s, Date.now())) + " no relógio."
      });
    }

    async function telaFim() {
      el.innerHTML = '<div class="wrap section-sm dia">' + cabecalho("Fim do dia") +
        '<h1 class="display h2">Fim do dia de prova. <em>Corrigindo...</em></h1><p class="muted" role="status" data-status>Gravando as respostas e calculando o relatório.</p></div>';
      focarTitulo();
      try {
        const { resultado, respostas } = corrigirRegistro({ ...reg, sessao: s }, banco.porId);
        if (!s.respostas_gravadas) {
          await ctx.store.saveRespostas(respostas);
          mudar({ ...s, respostas_gravadas: true, rev: (s.rev || 0) + 1 });
          await gravarAgora();
        }
        const modelos = await ctx.store.getModelosPsicometricos().catch(() => null);
        const est = estimativaDoSimulado({ form, linhas: respostas, porId: banco.porId, modelos });
        await gravarAgora();
        await ctx.store.concluirSimuladoCompleto(id, { sessao: s, resultado: { ...resultado, estimativa: instantaneo(est), dia: resumoDoDia(s, form) } });
        apagarEspelho(id);
        const dia = resumoDoDia(s, form);
        el.innerHTML = '<div class="wrap section-sm dia">' + cabecalho("Fim do dia") +
          '<h1 class="display h2">Fim do dia de prova. <em>Bom trabalho.</em></h1>' +
          '<article class="embarque" aria-label="Resumo do dia"><div class="embarque__main">' +
            '<p class="embarque__top"><span>' + e(nomeDia) + "</span><span>" + e(form.nome) + "</span></p>" +
            '<dl class="embarque__dados">' +
              "<div><dt>Acertos</dt><dd>" + resultado.acertos + "<small>de " + resultado.total + " (" + pct(resultado.percentual) + ")</small></dd></div>" +
              "<div><dt>Blocos</dt><dd>" + dia.blocos_encerrados + "<small>" + plural(dia.encerrados_por_tempo, "encerrado pelo tempo", "encerrados pelo tempo") + "</small></dd></div>" +
              "<div><dt>Pausa usada</dt><dd>" + duracao(dia.pausa_usada_ms) + "<small>de " + duracao(dia.pausa_disponivel_ms) + " disponíveis</small></dd></div>" +
              "<div><dt>Dia</dt><dd>" + (dia.dia_ms === null ? "sem dados" : duracao(dia.dia_ms)) + "<small>" + (dia.suspensoes ? plural(dia.suspensoes, "parada", "paradas") + " fora do relógio" : "sem paradas") + "</small></dd></div>" +
            "</dl></div>" +
            '<div class="embarque__stub" aria-hidden="true"><span>Chegada</span><b>' + Math.round(resultado.percentual * 100) + "%</b><em>" + resultado.acertos + "/" + resultado.total + "</em></div>" +
          "</article>" +
          '<div class="acoes"><a class="btn" href="#/relatorio/' + encodeURIComponent(id) + '">' + icon("chart-bar") + 'Ver o relatório de desempenho</a><a class="btn btn--ghost" href="#/completos">Simulados completos</a></div>' +
          "</div>";
        focarTitulo();
      } catch (err) {
        console.error(err);
        $("[data-status]", el).outerHTML = '<div class="aviso-conta">' + icon("warning-circle") + "<p>Não foi possível gravar o resultado agora: " + e(err.message || err) + ". O dia está guardado neste navegador.</p></div>" +
          '<p class="acoes"><button type="button" class="btn" data-tentar>Tentar de novo</button></p>';
        $("[data-tentar]", el).addEventListener("click", () => telaFim());
      }
    }

    const aoEsconder = () => { if (document.visibilityState === "hidden") gravarAgora(); };
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", gravarAgora);
    limpar = () => {
      destruido = true;
      pararTela();
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", gravarAgora);
      gravarAgora();
      document.body.classList.remove("em-prova");
    };
    desenhar();
  }
};
