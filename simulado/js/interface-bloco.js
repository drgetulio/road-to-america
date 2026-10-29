/* Road to America | interface de um bloco de prova, comum ao simulado de 30 minutos
   e aos simulados completos (Step 1 com 14 blocos, Step 2 CK com 16).
   Funções do software de prova reproduzidas: navegação por número e por
   anterior/próxima, marcar para revisão, riscar alternativas, realçar trechos da
   vinheta e da pergunta, tabela do próprio item, valores laboratoriais, anotações
   por questão, calculadora padrão, relógio regressivo do bloco, tela de revisão do
   bloco (só dentro do bloco), encerrar bloco, ajustes de tamanho do texto e de
   cores e atalhos de teclado.

   A tela não guarda estado da prova: lê tudo pelo "estado" e muda tudo pelas
   "acoes" que quem chama entrega. Assim o bloco de 30 minutos (sessao.js) e o dia
   de prova completo (dia-prova.js, sobre plataforma/js/formularios.js) usam a
   mesma tela sem duplicar a regra de cada um.

   montarBloco(el, cfg) -> { destroy() }
   cfg = {
     titulo, marca, questoes, labs,
     estado: { atual(), resposta(i), marcada(i), riscadas(i), realces(i), nota(i) },
     acoes:  { ir(i, agora), responder(i, letra), marcar(i), riscar(i, letra),
               nota(i, texto), realces(i, { vinheta, pergunta }), salvar({ urgente }) },
     relogio: { rotulo, restante(agora), expirou(agora), aviso(agora) -> ms | null },
     rodapeExtra: { html, atualizar(no, agora) }    // opcional (cronômetro do dia)
     textoNotas, textoFim(contagem, restanteMs) -> html, rotuloSair,
     encerrar(motivo) async, sair() async
   }
   Ganchos opcionais do banco de questões (questoes/, modo tutor); sem eles a tela
   funciona como antes:
     estado.travada(i)  -> true: a resposta do item está confirmada e não muda
     estado.gabarito(i) -> letra correta para marcar as alternativas (ou null)
     questaoExtra: { html(i) -> html depois das alternativas, clique(ev, i) -> true se tratou }
     relogio.progressivo: true -> o relógio conta o tempo gasto (sem avisos de fim)
   O retorno ganha redesenhar(), para quem chama atualizar a questão depois de mudar
   o estado por fora (por exemplo, ao confirmar a resposta no modo tutor). */
import { segmentos, alternar, remover, realceEm } from "./realce.js";
import { novaCalculadora, teclar, teclaDoTeclado } from "./calculadora.js";
import { filtrarLabs, contarItens } from "./labs.js";
import { relogio } from "./resultado.js";
import { lerPrefs, gravarPrefs } from "./armazenamento.js";
import { $, $$, e, icon, toast, dialogo } from "./dom.js";
import { alternarTema, temaAtual } from "./tema.js";

export const ESCUDO = '<svg viewBox="0 0 34 38" aria-hidden="true"><path d="M3 2.5h28c.9 3.4.9 6.6 0 9.3 2.6 7.6 1.4 15.3-5.4 20.7-3.6 2.8-6.6 3.9-8.6 4.6-2-.7-5-1.8-8.6-4.6C1.6 27.1.4 19.4 3 11.8c-.9-2.7-.9-5.9 0-9.3z" fill="#0f2747" stroke="#f3f5f2" stroke-width="1.6"/><path d="M3.4 3.3h27.2c.6 2.6.6 5 0 7.2H3.4c-.6-2.2-.6-4.6 0-7.2z" fill="#b0243a"/><text x="17" y="26" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="12.5" fill="#f3f5f2">R2A</text></svg>';

const estreito = () => matchMedia("(max-width: 860px)").matches;

/* Tabela do próprio item (painel laboratorial do caso). Contrato:
   tabela: { titulo, cabecalho?: [..], linhas: [[nome, valor, ...], ...] } */
export function htmlTabelaItem(tab, { id = "" } = {}) {
  if (!tab || !Array.isArray(tab.linhas) || !tab.linhas.length) return "";
  const cab = Array.isArray(tab.cabecalho) && tab.cabecalho.length ? tab.cabecalho : null;
  return '<div class="qtab-wrap"><table class="qtab" lang="en"' + (id ? ' id="' + e(id) + '"' : "") + ">" +
    (tab.titulo ? "<caption>" + e(tab.titulo) + "</caption>" : "") +
    (cab ? "<thead><tr>" + cab.map((c) => '<th scope="col">' + e(c) + "</th>").join("") + "</tr></thead>" : "") +
    "<tbody>" + tab.linhas.map((l) => {
      const cel = Array.isArray(l) ? l : [String(l)];
      return '<tr><th scope="row">' + e(cel[0]) + "</th>" + cel.slice(1).map((c) => "<td>" + e(c) + "</td>").join("") + "</tr>";
    }).join("") + "</tbody></table></div>";
}

export function montarBloco(el, cfg) {
  const { questoes, estado: E, acoes: A } = cfg;
  const n = questoes.length;
  const prefs = lerPrefs();
  let revisao = false;
  let filtroRev = "todas";
  let finalizando = false;
  let calc = novaCalculadora();
  let labTermo = "";
  let labSecao = null;
  const agora = () => Date.now();

  const contagem = () => {
    let respondidas = 0, marcadas = 0;
    for (let i = 0; i < n; i++) { if (E.resposta(i) !== null) respondidas++; if (E.marcada(i)) marcadas++; }
    return { total: n, respondidas, sem_resposta: n - respondidas, marcadas };
  };
  const listaRevisao = (filtro) => Array.from({ length: n }, (_, i) => ({
    i, numero: i + 1, respondida: E.resposta(i) !== null, marcada: E.marcada(i), tem_nota: !!E.nota(i)
  })).filter((x) => (filtro === "marcadas" ? x.marcada : filtro === "sem_resposta" ? !x.respondida : true));

  document.body.classList.add("em-prova");
  el.innerHTML =
    '<div class="prova" data-prova data-fonte="' + prefs.fonte + '">' +
      '<h1 class="sr-only">' + e(cfg.titulo) + "</h1>" +
      '<header class="pbar" aria-label="Barra do bloco">' +
        '<button type="button" class="pbtn pbtn--lista" data-abrir-lista aria-label="Questões" aria-expanded="false" aria-controls="plista">' + icon("list-numbers") + "<span>Questões</span></button>" +
        '<span class="pbar__marca">' + ESCUDO + "<span>" + e(cfg.marca) + "</span></span>" +
        '<p class="pbar__item" data-item></p>' +
        '<button type="button" class="pbtn pbtn--marca" data-marcar aria-pressed="false">' + icon("flag") + "<span>Marcar</span></button>" +
        '<nav class="pbar__nav" aria-label="Navegação entre questões">' +
          '<button type="button" class="pbtn" data-ant aria-label="Anterior">' + icon("caret-left") + "<span>Anterior</span></button>" +
          '<button type="button" class="pbtn" data-prox aria-label="Próxima"><span>Próxima</span>' + icon("caret-right") + "</button>" +
        "</nav>" +
        '<div class="pbar__ferr" role="group" aria-label="Ferramentas">' +
          '<button type="button" class="pbtn" data-ferr="lab" aria-expanded="false" aria-controls="painel-lab">' + icon("flask") + "<span>Lab</span></button>" +
          '<button type="button" class="pbtn" data-ferr="calc" aria-expanded="false" aria-controls="painel-calc">' + icon("calculator") + "<span>Calculadora</span></button>" +
          '<button type="button" class="pbtn" data-ferr="notas" aria-expanded="false" aria-controls="painel-notas">' + icon("note-pencil") + "<span>Anotações</span></button>" +
          '<button type="button" class="pbtn" data-ajustes aria-haspopup="menu" aria-expanded="false">' + icon("text-aa") + "<span>Ajustes</span></button>" +
        "</div>" +
        '<button type="button" class="pbtn pbtn--menu" data-menu-ferr aria-label="Ferramentas" aria-haspopup="menu" aria-expanded="false">' + icon("dots-three") + "<span>Ferramentas</span></button>" +
      "</header>" +
      '<div class="pcorpo">' +
        '<nav class="plista" id="plista" aria-label="Questões do bloco" data-lista><h2>Questões</h2><ol>' +
          questoes.map((_, i) => '<li><button type="button" class="pnum" data-ir="' + i + '"><span class="pnum__resp" aria-hidden="true"></span><span>' + (i + 1) + '</span><i class="ph ph-flag pnum__flag" aria-hidden="true"></i><span class="sr-only" data-pnum-sr></span></button></li>').join("") +
        "</ol>" +
        '<div class="plista__leg" aria-hidden="true"><span><span class="pnum__resp" style="background:currentColor"></span>respondida</span><span><span class="pnum__resp"></span>sem resposta</span><span>' + icon("flag") + "marcada</span></div>" +
        "</nav>" +
        '<section class="pquestao" data-area aria-label="Questão"></section>' +
        '<aside class="painel plab" id="painel-lab" role="dialog" aria-modal="false" aria-labelledby="t-lab" data-painel="lab" hidden>' +
          '<div class="painel__cab"><h2 id="t-lab">' + icon("flask") + "Valores laboratoriais</h2>" +
          '<button type="button" class="icon-btn" data-fechar-painel="lab" aria-label="Fechar valores laboratoriais">' + icon("x") + "</button></div>" +
          '<div class="plab__filtros">' +
            '<label class="sr-only" for="lab-busca">Buscar exame</label>' +
            '<input class="input" id="lab-busca" type="search" placeholder="Buscar: sodium, TSH, ferritina..." autocomplete="off" data-lab-busca>' +
            '<div class="plab__secoes" role="group" aria-label="Seções da tabela" data-lab-secoes></div>' +
            '<p class="fine" role="status" data-lab-conta></p>' +
          "</div>" +
          '<div class="painel__corpo" data-lab-rolagem>' +
            '<div data-lab-tabelas></div>' +
            '<p class="plab__nota">' + e(cfg.labs.nota) + " Fontes: " + cfg.labs.fontes.map((f) => f.url ? '<a href="' + e(f.url) + '" target="_blank" rel="noopener">' + e(f.rotulo) + "</a>" : e(f.rotulo)).join("; ") + ".</p>" +
          "</div>" +
        "</aside>" +
      "</div>" +
      '<footer class="prodape" aria-label="Relógio e encerramento do bloco">' +
        '<div class="relogio" data-relogio><span class="relogio__rot">' + e(cfg.relogio.rotulo || "Tempo restante do bloco") + '</span><span class="relogio__t" role="timer" aria-label="' + e(cfg.relogio.rotulo || "Tempo restante do bloco") + '" data-t></span></div>' +
        (cfg.rodapeExtra ? '<div class="relogio relogio--dia" data-rodape-extra>' + cfg.rodapeExtra.html + "</div>" : "") +
        '<button type="button" class="pbtn" data-revisao aria-pressed="false" aria-label="Revisão do bloco">' + icon("list-numbers") + "<span>Revisão do bloco</span></button>" +
        '<button type="button" class="pbtn pbtn--fim" data-fim aria-label="Encerrar bloco">' + icon("flag-banner") + "<span>Encerrar bloco</span></button>" +
      "</footer>" +
      '<div class="painel pflutua pcalc" id="painel-calc" role="dialog" aria-modal="false" aria-labelledby="t-calc" data-painel="calc" hidden>' +
        '<div class="painel__cab"><h2 id="t-calc">' + icon("calculator") + "Calculadora</h2>" +
        '<button type="button" class="icon-btn" data-fechar-painel="calc" aria-label="Fechar calculadora">' + icon("x") + "</button></div>" +
        '<div class="painel__corpo">' +
          '<div class="calc__visor" tabindex="0" role="group" aria-label="Visor da calculadora. Com o foco aqui, digite números e operações; Enter calcula." data-calc-foco><span class="calc__expr" data-calc-expr></span><output class="calc__num" aria-live="polite" data-calc-visor>0</output></div>' +
          '<div class="calc__teclas" data-calc-teclas>' +
            [["C", "C", "Limpar tudo", "op"], ["CE", "CE", "Limpar visor", "op"], ["back", "⌫", "Apagar dígito", "op"], ["/", "÷", "Dividir", "op"],
             ["7", "7"], ["8", "8"], ["9", "9"], ["*", "×", "Multiplicar", "op"],
             ["4", "4"], ["5", "5"], ["6", "6"], ["-", "−", "Subtrair", "op"],
             ["1", "1"], ["2", "2"], ["3", "3"], ["+", "+", "Somar", "op"],
             ["neg", "±", "Inverter sinal", "op"], ["0", "0"], [".", ".", "Ponto decimal"], ["=", "=", "Igual", "igual"],
             ["sqrt", "√", "Raiz quadrada", "op"], ["%", "%", "Porcentagem", "op"]]
              .map(([k, t, rot, cls]) => '<button type="button" data-k="' + k + '"' + (cls ? ' class="' + cls + '"' : "") + (rot ? ' aria-label="' + rot + '"' : "") + ">" + t + "</button>").join("") +
          "</div>" +
          '<p class="fine">Use também o teclado com o foco na calculadora: números, + − * /, Enter, Backspace e Delete.</p>' +
        "</div>" +
      "</div>" +
      '<div class="painel pflutua pnotas" id="painel-notas" role="dialog" aria-modal="false" aria-labelledby="t-notas" data-painel="notas" hidden>' +
        '<div class="painel__cab"><h2 id="t-notas">' + icon("note-pencil") + "Anotações</h2>" +
        '<button type="button" class="icon-btn" data-fechar-painel="notas" aria-label="Fechar anotações">' + icon("x") + "</button></div>" +
        '<div class="painel__corpo">' +
          '<label for="nota-txt" data-nota-rot></label>' +
          '<textarea id="nota-txt" maxlength="2000" data-nota></textarea>' +
          '<p class="fine" data-nota-conta></p>' +
          '<p class="fine">' + e(cfg.textoNotas || "As anotações aparecem na revisão do resultado.") + "</p>" +
        "</div>" +
      "</div>" +
      '<p class="sr-only" aria-live="polite" data-live></p>' +
    "</div>";

  const P = $("[data-prova]", el);
  const area = $("[data-area]", P);
  const live = $("[data-live]", P);
  const falar = (msg) => { live.textContent = ""; setTimeout(() => { live.textContent = msg; }, 40); };
  const salvar = (op) => A.salvar(op);
  let tNota = null;

  /* ---------- Barra, lista e relógio ---------- */
  function renderBarra() {
    const at = E.atual();
    $("[data-item]", P).innerHTML = "Questão " + (at + 1) + " <small>de " + n + "</small>";
    const m = $("[data-marcar]", P);
    m.setAttribute("aria-pressed", E.marcada(at) ? "true" : "false");
    m.setAttribute("aria-label", (E.marcada(at) ? "Desmarcar" : "Marcar") + " a questão " + (at + 1) + " para revisão");
    $("[data-ant]", P).disabled = at === 0 && !revisao;
    $("[data-prox]", P).disabled = at === n - 1 && !revisao;
    $("[data-revisao]", P).setAttribute("aria-pressed", revisao ? "true" : "false");
  }
  function renderLista() {
    const at = E.atual();
    $$("[data-ir]", P).forEach((b) => {
      const i = Number(b.dataset.ir);
      const resp = E.resposta(i) !== null;
      const marc = E.marcada(i);
      b.classList.toggle("is-resp", resp);
      b.classList.toggle("is-marcada", marc);
      if (i === at && !revisao) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      $("[data-pnum-sr]", b).textContent = ", " + (resp ? "respondida" : "sem resposta") + (marc ? ", marcada" : "");
      b.setAttribute("aria-label", "Questão " + (i + 1) + (resp ? ", respondida" : ", sem resposta") + (marc ? ", marcada para revisão" : ""));
    });
  }
  function renderRelogio(t = agora()) {
    const resta = cfg.relogio.restante(t);
    /* contagem regressiva arredonda para cima: 00:00 só aparece quando o bloco acaba */
    const prog = !!cfg.relogio.progressivo;
    const txt = relogio((prog ? Math.floor(resta / 1000) : Math.ceil(resta / 1000)) * 1000);
    const tt = $("[data-t]", P);
    if (tt.textContent !== txt) tt.textContent = txt;
    const r = $("[data-relogio]", P);
    r.classList.toggle("is-aviso", !prog && resta <= 5 * 60000 && resta > 60000);
    r.classList.toggle("is-final", !prog && resta <= 60000);
    if (cfg.rodapeExtra) cfg.rodapeExtra.atualizar($("[data-rodape-extra]", P), t);
  }

  /* ---------- Questão ---------- */
  function htmlRealce(texto, intervalos) {
    return segmentos(texto, intervalos).map((sg) => sg.realce
      ? '<mark data-ini="' + sg.inicio + '" title="Clique para remover o realce">' + e(sg.texto) + "</mark>"
      : e(sg.texto)).join("");
  }
  function renderQuestao({ foco = false } = {}) {
    if (revisao) { renderRevisao(); return; }
    const i = E.atual();
    const q = questoes[i];
    const resp = E.resposta(i);
    const risc = E.riscadas(i);
    const rl = E.realces(i);
    const trav = !!E.travada?.(i);
    const gab = E.gabarito?.(i) || null;
    area.setAttribute("aria-label", "Questão " + (i + 1) + " de " + n);
    area.innerHTML =
      '<div class="pquestao__in">' +
        '<div class="pquestao__cab"><h2 tabindex="-1" data-titulo-q>Questão ' + (i + 1) + " de " + n + "</h2>" +
        (E.marcada(i) ? '<span class="chip chip--erro">' + icon("flag") + "Marcada</span>" : "") + "</div>" +
        '<p class="texto-q" lang="en" data-realce="vinheta">' + htmlRealce(q.vinheta, rl.vinheta) + "</p>" +
        htmlTabelaItem(q.tabela) +
        '<p class="texto-q texto-q--pergunta" lang="en" data-realce="pergunta" id="perg-' + i + '">' + htmlRealce(q.pergunta, rl.pergunta) + "</p>" +
        '<fieldset class="alts" aria-describedby="perg-' + i + '"><legend>Alternativas</legend>' +
          q.alternativas.map((a) => {
            const id = "alt-" + i + "-" + a.letra;
            const riscada = risc.includes(a.letra);
            const certa = gab && a.letra === gab;
            const errada = gab && resp === a.letra && !certa;
            return '<div class="alt' + (resp === a.letra ? " is-escolhida" : "") + (riscada ? " is-riscada" : "") + (certa ? " is-certa" : "") + (errada ? " is-errada" : "") + '" data-alt="' + a.letra + '">' +
              '<button type="button" class="alt__riscar" data-riscar="' + a.letra + '" aria-pressed="' + riscada + '" aria-label="' + (riscada ? "Desfazer risco da" : "Riscar a") + " alternativa " + a.letra + '">' + icon("text-strikethrough") + "</button>" +
              '<label class="alt__label" for="' + id + '" lang="en">' +
                '<input type="radio" name="resp-' + i + '" id="' + id + '" value="' + a.letra + '"' + (resp === a.letra ? " checked" : "") + (trav ? " disabled" : "") + ">" +
                '<span class="alt__letra">' + a.letra + ".</span>" +
                '<span class="alt__texto">' + e(a.texto) + (riscada ? '<span class="sr-only" lang="pt-BR"> (riscada)</span>' : "") +
                  (certa ? '<span class="sr-only" lang="pt-BR"> (alternativa correta)</span>' : errada ? '<span class="sr-only" lang="pt-BR"> (sua resposta, incorreta)</span>' : "") + "</span>" +
              "</label></div>";
          }).join("") +
        "</fieldset>" +
        (cfg.questaoExtra ? cfg.questaoExtra.html(i) || "" : "") +
        '<p class="pdica">' + icon("highlighter-circle") + "<span>Selecione um trecho do texto e toque em Realçar (ou tecle H). Clique no realce para removê-lo.</span>" +
        (rl.vinheta.length || rl.pergunta.length ? '<button type="button" class="link-btn" data-limpar-realce>' + icon("eraser") + "Limpar realces</button>" : "") + "</p>" +
      "</div>";
    area.scrollTop = 0;
    const ativo = document.activeElement;
    if (foco || !ativo || ativo === document.body || !ativo.isConnected) $("[data-titulo-q]", area).focus({ preventScroll: true });
    atualizarNota();
  }

  function renderRevisao({ focar = true } = {}) {
    const c = contagem();
    const itens = listaRevisao(filtroRev);
    area.setAttribute("aria-label", "Revisão do bloco");
    area.innerHTML =
      '<div class="pquestao__in prev">' +
        '<div class="pquestao__cab"><h2 tabindex="-1" data-titulo-q>Revisão do bloco</h2></div>' +
        '<p class="texto-q" style="font-size:17.5px">' + c.respondidas + " de " + c.total + " respondidas, " + c.sem_resposta + " sem resposta, " + c.marcadas + (c.marcadas === 1 ? " marcada" : " marcadas") + ". O relógio continua correndo. Escolha uma questão para voltar a ela.</p>" +
        '<div class="filtros" role="group" aria-label="Filtrar questões">' +
          [["todas", "Todas (" + c.total + ")"], ["marcadas", "Marcadas (" + c.marcadas + ")"], ["sem_resposta", "Sem resposta (" + c.sem_resposta + ")"]]
            .map(([v, r]) => '<button type="button" class="filtro" data-filtro-rev="' + v + '" aria-pressed="' + (filtroRev === v) + '">' + r + "</button>").join("") +
        "</div>" +
        (itens.length ? '<ul class="prev__grade">' + itens.map((x) => '<li><button type="button" data-ir-rev="' + x.i + '" aria-label="Questão ' + x.numero + (x.respondida ? ", respondida" : ", sem resposta") + (x.marcada ? ", marcada" : "") + (x.tem_nota ? ", com anotação" : "") + '">' +
          "<b>" + x.numero + "</b><span" + (x.respondida ? "" : ' class="sem"') + ">" + (x.respondida ? "Respondida" : "Sem resposta") + (x.tem_nota ? " " + icon("note-pencil", "prev__nota") : "") + "</span>" + (x.marcada ? icon("flag") : "<span></span>") + "</button></li>").join("") + "</ul>"
          : '<div class="vazio"><p>Nenhuma questão neste filtro.</p></div>') +
        '<div class="acoes"><button type="button" class="btn btn--ghost btn--sm" data-voltar-q>' + icon("arrow-left") + "Voltar à questão " + (E.atual() + 1) + '</button><button type="button" class="btn btn--sm" data-fim-rev>' + icon("flag-banner") + "Encerrar bloco</button></div>" +
      "</div>";
    if (focar) $("[data-titulo-q]", area).focus({ preventScroll: true });
  }

  function tudo(op = {}) { renderBarra(); renderLista(); renderQuestao(op); }

  function ir(i, { foco = false } = {}) {
    if (finalizando) return;
    revisao = false;
    A.ir(i, agora());
    salvar();
    tudo({ foco });
    const at = E.atual();
    falar("Questão " + (at + 1) + " de " + n + (E.resposta(at) ? ", resposta " + E.resposta(at) : ", sem resposta") + (E.marcada(at) ? ", marcada" : ""));
    fecharLista();
  }
  function passo(dir, op) {
    const at = E.atual();
    if (revisao) { ir(at, op); return; }
    if (dir > 0 && at < n - 1) ir(at + 1, op);
    else if (dir < 0 && at > 0) ir(at - 1, op);
    else if (dir > 0) falar("Esta é a última questão. Abra a revisão do bloco ou encerre o bloco.");
    else falar("Esta é a primeira questão.");
  }
  function marcar() {
    if (revisao || finalizando) return;
    const at = E.atual();
    A.marcar(at);
    salvar();
    renderBarra(); renderLista();
    const chipBox = $(".pquestao__cab", area);
    const chip = $(".chip", chipBox);
    if (E.marcada(at) && !chip) chipBox.insertAdjacentHTML("beforeend", '<span class="chip chip--erro">' + icon("flag") + "Marcada</span>");
    else if (!E.marcada(at) && chip) chip.remove();
    falar(E.marcada(at) ? "Questão marcada para revisão." : "Marca removida.");
  }
  function escolher(letra) {
    if (finalizando || E.travada?.(E.atual())) return;
    A.responder(E.atual(), letra);
    salvar();
    $$(".alt", area).forEach((a) => a.classList.toggle("is-escolhida", a.dataset.alt === letra));
    const r = $('input[value="' + letra + '"]', area);
    if (r) r.checked = true;
    renderLista();
  }
  function riscar(letra) {
    if (finalizando) return;
    const at = E.atual();
    A.riscar(at, letra);
    salvar();
    const alt = $('[data-alt="' + letra + '"]', area);
    const on = E.riscadas(at).includes(letra);
    alt.classList.toggle("is-riscada", on);
    const b = $("[data-riscar]", alt);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", (on ? "Desfazer risco da" : "Riscar a") + " alternativa " + letra);
    const txt = $(".alt__texto", alt);
    $(".sr-only", txt)?.remove();
    if (on) txt.insertAdjacentHTML("beforeend", '<span class="sr-only" lang="pt-BR"> (riscada)</span>');
    falar("Alternativa " + letra + (on ? " riscada." : " sem risco."));
  }

  /* ---------- Realce ---------- */
  const btnRealce = document.createElement("button");
  btnRealce.type = "button";
  btnRealce.className = "btn-realce";
  btnRealce.hidden = true;
  btnRealce.innerHTML = icon("highlighter-circle") + "Realçar";
  P.appendChild(btnRealce);
  let selecao = null;

  function selecaoAtual() {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    const cont = (no) => (no.nodeType === 1 ? no : no.parentElement)?.closest("[data-realce]");
    const c1 = cont(r.startContainer);
    const c2 = cont(r.endContainer);
    if (!c1 || c1 !== c2 || !area.contains(c1)) return null;
    const pos = (no, off) => { const x = document.createRange(); x.setStart(c1, 0); x.setEnd(no, off); return x.toString().length; };
    const a = pos(r.startContainer, r.startOffset);
    const b = pos(r.endContainer, r.endOffset);
    if (b <= a) return null;
    return { campo: c1.dataset.realce, a, b, rect: r.getBoundingClientRect() };
  }
  function trocarRealces(campo, lista) {
    const at = E.atual();
    const atual = E.realces(at);
    A.realces(at, { vinheta: campo === "vinheta" ? lista : atual.vinheta.slice(), pergunta: campo === "pergunta" ? lista : atual.pergunta.slice() });
  }
  function aplicarRealce(x) {
    if (!x || revisao || finalizando) return;
    const q = questoes[E.atual()];
    trocarRealces(x.campo, alternar(E.realces(E.atual())[x.campo], x.a, x.b, q[x.campo].length));
    salvar();
    document.getSelection()?.removeAllRanges();
    btnRealce.hidden = true;
    selecao = null;
    renderQuestao();
  }
  let tSel = null;
  const aoSelecionar = () => {
    clearTimeout(tSel);
    tSel = setTimeout(() => {
      selecao = selecaoAtual();
      if (!selecao) { btnRealce.hidden = true; return; }
      const { rect } = selecao;
      btnRealce.hidden = false;
      const w = btnRealce.offsetWidth || 110;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2));
      let top = rect.bottom + 8;
      if (top + 48 > window.innerHeight - 70) top = Math.max(70, rect.top - 52);
      btnRealce.style.left = left + "px";
      btnRealce.style.top = top + "px";
    }, 120);
  };
  document.addEventListener("selectionchange", aoSelecionar);
  btnRealce.addEventListener("mousedown", (ev) => ev.preventDefault());
  btnRealce.addEventListener("click", () => aplicarRealce(selecao || selecaoAtual()));

  /* ---------- Painéis ---------- */
  const painel = (nome) => $('[data-painel="' + nome + '"]', P);
  const botoesFerr = (nome) => $$('[data-ferr="' + nome + '"]', P);
  const origemFoco = {};
  function abrirPainel(nome, { focar = true } = {}) {
    if (estreito()) for (const outro of ["lab", "calc", "notas"]) if (outro !== nome) fecharPainel(outro, { devolver: false });
    const p = painel(nome);
    origemFoco[nome] = document.activeElement;
    p.hidden = false;
    botoesFerr(nome).forEach((b) => b.setAttribute("aria-expanded", "true"));
    if (nome === "lab") renderLab();
    if (nome === "notas") atualizarNota();
    if (focar) {
      const alvo = nome === "lab" ? $("[data-lab-busca]", p) : nome === "notas" ? $("[data-nota]", p) : $("[data-calc-foco]", p);
      alvo?.focus();
    }
  }
  function fecharPainel(nome, { devolver = true } = {}) {
    const p = painel(nome);
    if (p.hidden) return;
    const dentro = p.contains(document.activeElement);
    p.hidden = true;
    botoesFerr(nome).forEach((b) => b.setAttribute("aria-expanded", "false"));
    if (devolver && dentro) {
      const o = origemFoco[nome];
      if (o && o.isConnected && !o.closest("[hidden]") && o.offsetParent !== null) o.focus();
      else $("[data-titulo-q]", area)?.focus({ preventScroll: true });
    }
  }
  const alternarPainel = (nome) => (painel(nome).hidden ? abrirPainel(nome) : fecharPainel(nome));

  /* Valores laboratoriais */
  function renderLab() {
    const p = painel("lab");
    const secoes = cfg.labs.secoes;
    $("[data-lab-secoes]", p).innerHTML =
      '<button type="button" data-lab-secao="" aria-pressed="' + (!labSecao) + '">Todas</button>' +
      secoes.map((sc) => '<button type="button" data-lab-secao="' + sc.id + '" aria-pressed="' + (labSecao === sc.id) + '">' + e(sc.titulo_pt) + "</button>").join("");
    const res = filtrarLabs(cfg.labs, labTermo, labSecao);
    const nItens = contarItens(res);
    $("[data-lab-conta]", p).textContent = labTermo ? (nItens ? nItens + (nItens === 1 ? " exame encontrado." : " exames encontrados.") : "Nenhum exame com esse termo.") : nItens + " exames.";
    $("[data-lab-tabelas]", p).innerHTML = res.map((sc) =>
      '<table class="ltab"><caption>' + e(sc.titulo) + "<small>" + e(sc.titulo_pt) + "</small></caption>" +
      '<thead><tr><th scope="col">Exame</th><th scope="col">Faixa de referência</th><th scope="col">Intervalo SI</th></tr></thead><tbody>' +
      (sc.nota ? '<tr class="nota"><td colspan="3">' + e(sc.nota) + "</td></tr>" : "") +
      sc.itens.map((it) => (it.linhas
        ? '<tr><th scope="rowgroup" colspan="3" lang="en">' + e(it.nome) + '<span class="pt" lang="pt-BR">' + e(it.pt) + "</span></th></tr>" +
          it.linhas.map((l) => '<tr class="sub"><th scope="row" lang="en">' + e(l[0]) + '</th><td lang="en">' + e(l[1]) + '</td><td lang="en">' + e(l[2]) + "</td></tr>").join("")
        : '<tr><th scope="row" lang="en">' + e(it.nome) + '<span class="pt" lang="pt-BR">' + e(it.pt) + '</span></th><td lang="en">' + e(it.conv) + '</td><td lang="en">' + e(it.si) + "</td></tr>") +
        (it.nota ? '<tr class="nota"><td colspan="3">' + e(it.nota) + "</td></tr>" : "")).join("") +
      "</tbody></table>").join("");
  }
  const labBusca = $("[data-lab-busca]", P);
  labBusca.addEventListener("input", () => { labTermo = labBusca.value; renderLab(); $("[data-lab-rolagem]", P).scrollTop = 0; });
  painel("lab").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-lab-secao]");
    if (!b) return;
    labSecao = b.dataset.labSecao || null;
    labTermo = ""; labBusca.value = "";
    renderLab();
    $('[data-lab-secao="' + (labSecao || "") + '"]', P)?.focus();
    $("[data-lab-rolagem]", P).scrollTop = 0;
  });

  /* Calculadora */
  function renderCalc() {
    $("[data-calc-visor]", P).textContent = calc.visor;
    $("[data-calc-expr]", P).textContent = calc.expressao;
  }
  painel("calc").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-k]");
    if (!b) return;
    calc = teclar(calc, b.dataset.k);
    renderCalc();
  });
  painel("calc").addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === "Tab") return;
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.closest("[data-k], [data-fechar-painel]")) return;
    const k = teclaDoTeclado(ev.key);
    ev.stopPropagation();
    if (k) { ev.preventDefault(); calc = teclar(calc, k); renderCalc(); }
  });
  renderCalc();

  /* Anotações */
  function atualizarNota() {
    const p = painel("notas");
    const t = $("[data-nota]", p);
    const at = E.atual();
    $("[data-nota-rot]", p).textContent = "Anotação da questão " + (at + 1);
    if (document.activeElement !== t || t.dataset.q !== String(at)) t.value = E.nota(at) || "";
    t.dataset.q = String(at);
    $("[data-nota-conta]", p).textContent = (t.value.length) + " de 2000 caracteres";
  }
  $("[data-nota]", P).addEventListener("input", (ev) => {
    if (finalizando) return;
    const i = Number(ev.target.dataset.q);
    A.nota(i, ev.target.value);
    $("[data-nota-conta]", P).textContent = ev.target.value.length + " de 2000 caracteres";
    clearTimeout(tNota);
    tNota = setTimeout(() => salvar(), 400);
    /* na tela de revisão, só atualiza o indicador de anotação, sem tirar o foco do campo */
    if (revisao) renderRevisao({ focar: false });
  });

  /* ---------- Menus (ajustes e ferramentas no celular) ---------- */
  let menu = null;
  function fecharMenu(devolver = true) {
    if (!menu) return;
    const { el: m, botao } = menu;
    m.remove();
    botao.setAttribute("aria-expanded", "false");
    menu = null;
    if (devolver) botao.focus();
  }
  function abrirMenu(botao, itens) {
    fecharMenu(false);
    const m = document.createElement("div");
    m.className = "menu-pop";
    m.setAttribute("role", "menu");
    m.setAttribute("aria-label", botao.textContent.trim());
    m.innerHTML = itens.map((it) => it.sep ? '<hr role="separator">' : it.titulo ? '<h2 aria-hidden="true">' + e(it.titulo) + "</h2>"
      : '<button type="button" role="' + (it.radio ? "menuitemradio" : "menuitem") + '"' + (it.radio ? ' aria-checked="' + !!it.marcado + '"' : "") + ' data-mi="' + e(it.id) + '">' + icon(it.icone) + "<span>" + e(it.rotulo) + "</span></button>").join("");
    P.appendChild(m);
    const r = botao.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 16);
    m.style.width = w + "px";
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
    m.style.top = (r.bottom + 6) + "px";
    botao.setAttribute("aria-expanded", "true");
    menu = { el: m, botao };
    const opcoes = $$("[data-mi]", m);
    (opcoes.find((o) => o.getAttribute("aria-checked") === "true") || opcoes[0])?.focus();
    m.addEventListener("keydown", (ev) => {
      const k = opcoes.indexOf(document.activeElement);
      if (ev.key === "ArrowDown") { ev.preventDefault(); opcoes[(k + 1) % opcoes.length].focus(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); opcoes[(k - 1 + opcoes.length) % opcoes.length].focus(); }
      else if (ev.key === "Home") { ev.preventDefault(); opcoes[0].focus(); }
      else if (ev.key === "End") { ev.preventDefault(); opcoes[opcoes.length - 1].focus(); }
      else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fecharMenu(); }
      else if (ev.key === "Tab") fecharMenu(false);
      ev.stopPropagation();
    });
    m.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-mi]");
      if (!b) return;
      const it = itens.find((x) => x.id === b.dataset.mi);
      fecharMenu(!it.semDevolver);
      it.acao();
    });
  }
  function itensAjustes() {
    const f = P.dataset.fonte;
    const fonte = (v) => () => { P.dataset.fonte = v; gravarPrefs({ ...lerPrefs(), fonte: v }); falar("Tamanho do texto: " + { normal: "normal", grande: "grande", maior: "maior" }[v] + "."); };
    return [
      { titulo: "Tamanho do texto" },
      { id: "f-normal", rotulo: "Normal", icone: "text-aa", radio: true, marcado: f === "normal", acao: fonte("normal") },
      { id: "f-grande", rotulo: "Grande", icone: "text-aa", radio: true, marcado: f === "grande", acao: fonte("grande") },
      { id: "f-maior", rotulo: "Maior", icone: "text-aa", radio: true, marcado: f === "maior", acao: fonte("maior") },
      { sep: true },
      { id: "tema", rotulo: temaAtual() === "dark" ? "Usar cores claras" : "Usar cores escuras", icone: "circle-half", acao: () => { const t = alternarTema(); falar(t === "dark" ? "Cores escuras." : "Cores claras."); } },
      { id: "atalhos", rotulo: "Atalhos de teclado", icone: "keyboard", acao: mostrarAtalhos, semDevolver: true },
      { sep: true },
      { id: "sair", rotulo: cfg.rotuloSair || "Sair para o início (o relógio continua)", icone: "sign-out", acao: () => { A.ir(E.atual(), agora()); salvar({ urgente: true }); cfg.sair(); }, semDevolver: true }
    ];
  }
  $("[data-ajustes]", P).addEventListener("click", (ev) => (menu?.botao === ev.currentTarget ? fecharMenu() : abrirMenu(ev.currentTarget, itensAjustes())));
  $("[data-menu-ferr]", P).addEventListener("click", (ev) => {
    if (menu?.botao === ev.currentTarget) { fecharMenu(); return; }
    abrirMenu(ev.currentTarget, [
      { id: "lab", rotulo: "Valores laboratoriais", icone: "flask", acao: () => abrirPainel("lab"), semDevolver: true },
      { id: "calc", rotulo: "Calculadora", icone: "calculator", acao: () => abrirPainel("calc"), semDevolver: true },
      { id: "notas", rotulo: "Anotações", icone: "note-pencil", acao: () => abrirPainel("notas"), semDevolver: true },
      { sep: true },
      ...itensAjustes()
    ]);
  });
  const fora = (ev) => { if (menu && !menu.el.contains(ev.target) && !menu.botao.contains(ev.target)) fecharMenu(false); };
  document.addEventListener("pointerdown", fora);

  function mostrarAtalhos() {
    dialogo({
      titulo: "Atalhos de teclado",
      corpo: '<table class="atalhos"><thead><tr><th scope="col">Tecla</th><th scope="col">O que faz</th></tr></thead><tbody>' +
        [["N ou →", "Próxima questão"], ["P ou ←", "Questão anterior"], ["1 a 6", "Escolhe a alternativa A a F"], ["M", "Marca ou desmarca para revisão"], ["H", "Realça o trecho selecionado"],
         ["L", "Valores laboratoriais"], ["C", "Calculadora"], ["O", "Anotações"], ["R", "Revisão do bloco"], ["Esc", "Fecha o painel aberto"]]
          .map(([k, t]) => "<tr><td><kbd>" + e(k) + "</kbd></td><td>" + e(t) + "</td></tr>").join("") +
        "</tbody></table><p class=\"fine\">Com o foco numa alternativa, as setas mudam a resposta, como em qualquer grupo de opções. Riscar: botão à esquerda da alternativa ou botão direito do mouse no texto.</p>"
    });
  }

  /* ---------- Lista no celular ---------- */
  const lista = $("[data-lista]", P);
  const btnLista = $("[data-abrir-lista]", P);
  function fecharLista() { if (!lista.classList.contains("is-aberta")) return; lista.classList.remove("is-aberta"); btnLista.setAttribute("aria-expanded", "false"); }
  btnLista.addEventListener("click", () => {
    const ab = lista.classList.toggle("is-aberta");
    btnLista.setAttribute("aria-expanded", ab ? "true" : "false");
    if (ab) ($('[aria-current="true"]', lista) || $("[data-ir]", lista)).focus();
  });

  /* ---------- Encerrar ---------- */
  async function finalizar(motivo) {
    if (finalizando) return;
    finalizando = true;
    clearInterval(timer);
    window.removeEventListener("beforeunload", antesDeSair);
    try { await cfg.encerrar(motivo); }
    catch (err) { console.error(err); toast("Não foi possível encerrar o bloco: " + (err.message || err), "erro", 8000); }
  }
  async function pedirFim() {
    if (finalizando) return;
    const c = contagem();
    const partes = [];
    if (c.sem_resposta) partes.push(c.sem_resposta + (c.sem_resposta === 1 ? " questão sem resposta" : " questões sem resposta"));
    if (c.marcadas) partes.push(c.marcadas + (c.marcadas === 1 ? " questão marcada" : " questões marcadas"));
    const ok = await dialogo({
      titulo: "Encerrar o bloco?",
      corpo: "<p>" + (partes.length ? "Você tem " + e(partes.join(" e ")) + ". " : "Todas as questões têm resposta. ") +
        (cfg.relogio.progressivo ? "Tempo no bloco: <strong>" + relogio(cfg.relogio.restante(agora())) + "</strong>.</p>"
          : "Ainda restam <strong>" + relogio(cfg.relogio.restante(agora())) + "</strong> no relógio.</p>") +
        (cfg.textoFim ? cfg.textoFim(c) : "<p>Depois de encerrado, o bloco não reabre, como na prova.</p>"),
      acoes: [{ rotulo: "Voltar ao bloco", valor: false, estilo: "ghost", foco: true }, { rotulo: "Encerrar bloco", valor: true, estilo: "perigo", icone: "flag-banner" }]
    });
    if (ok) finalizar("participante");
  }

  /* ---------- Eventos ---------- */
  P.addEventListener("click", (ev) => {
    const t = ev.target;
    if (cfg.questaoExtra?.clique && !revisao && area.contains(t) && cfg.questaoExtra.clique(ev, E.atual())) return;
    const irB = t.closest("[data-ir]");
    if (irB) { ir(Number(irB.dataset.ir)); return; }
    const irR = t.closest("[data-ir-rev]");
    if (irR) { ir(Number(irR.dataset.irRev), { foco: true }); return; }
    if (t.closest("[data-voltar-q]")) { ir(E.atual(), { foco: true }); return; }
    const rb = t.closest("[data-riscar]");
    if (rb) { riscar(rb.dataset.riscar); return; }
    const mk = t.closest(".texto-q mark");
    if (mk && document.getSelection()?.isCollapsed !== false) {
      const campo = mk.closest("[data-realce]").dataset.realce;
      const atuais = E.realces(E.atual())[campo];
      const intervalo = realceEm(atuais, Number(mk.dataset.ini));
      if (intervalo) { trocarRealces(campo, remover(atuais, intervalo[0], intervalo[1])); salvar(); renderQuestao(); falar("Realce removido."); }
      return;
    }
    if (t.closest("[data-limpar-realce]")) { A.realces(E.atual(), { vinheta: [], pergunta: [] }); salvar(); renderQuestao({ foco: true }); falar("Realces removidos."); return; }
    const fr = t.closest("[data-filtro-rev]");
    if (fr) { filtroRev = fr.dataset.filtroRev; renderRevisao(); $('[data-filtro-rev="' + filtroRev + '"]', area)?.focus(); return; }
    const fp = t.closest("[data-fechar-painel]");
    if (fp) { fecharPainel(fp.dataset.fecharPainel); return; }
    const fe = t.closest("[data-ferr]");
    if (fe) { alternarPainel(fe.dataset.ferr); return; }
    if (t.closest("[data-fim-rev]")) { pedirFim(); return; }
  });
  area.addEventListener("change", (ev) => { if (ev.target.matches('input[type="radio"]')) escolher(ev.target.value); });
  area.addEventListener("contextmenu", (ev) => {
    const alt = ev.target.closest("[data-alt]");
    if (!alt) return;
    ev.preventDefault();
    riscar(alt.dataset.alt);
  });
  $("[data-marcar]", P).addEventListener("click", marcar);
  $("[data-ant]", P).addEventListener("click", () => passo(-1));
  $("[data-prox]", P).addEventListener("click", () => passo(1));
  $("[data-revisao]", P).addEventListener("click", () => {
    if (finalizando) return;
    revisao = !revisao;
    if (!revisao) ir(E.atual(), { foco: true });
    else { A.ir(E.atual(), agora()); salvar(); tudo(); fecharLista(); }
  });
  $("[data-fim]", P).addEventListener("click", pedirFim);

  const ehCampo = (t) => t && (t.matches?.("textarea, input:not([type=radio]), select, [contenteditable]") || false);
  function teclas(ev) {
    if (finalizando) return;
    if ($("[data-modal]").open) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target;
    if (ev.key === "Escape") {
      if (menu) { fecharMenu(); return; }
      if (lista.classList.contains("is-aberta")) { fecharLista(); btnLista.focus(); return; }
      const aberto = ["calc", "notas", "lab"].find((p) => !painel(p).hidden && painel(p).contains(t)) || ["calc", "notas", "lab"].find((p) => !painel(p).hidden);
      if (aberto) { ev.preventDefault(); fecharPainel(aberto); const f = document.activeElement; if (!f || f === document.body || !f.isConnected) $("[data-titulo-q]", area)?.focus({ preventScroll: true }); }
      else if (!btnRealce.hidden) { document.getSelection()?.removeAllRanges(); btnRealce.hidden = true; }
      return;
    }
    if (ehCampo(t)) return;
    const radio = t?.matches?.('input[type="radio"]');
    const k = ev.key;
    if ((k === "ArrowRight" || k === "ArrowLeft") && radio) return;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    const acoes = {
      n: () => passo(1), ArrowRight: () => passo(1),
      p: () => passo(-1), ArrowLeft: () => passo(-1),
      m: marcar,
      h: () => { const x = selecaoAtual(); if (x) aplicarRealce(x); else falar("Selecione um trecho da vinheta ou da pergunta para realçar."); },
      l: () => alternarPainel("lab"),
      c: () => alternarPainel("calc"),
      o: () => alternarPainel("notas"),
      r: () => $("[data-revisao]", P).click(),
      "?": mostrarAtalhos
    };
    if (/^[1-9]$/.test(k) && !revisao) {
      const alt = questoes[E.atual()].alternativas[Number(k) - 1];
      if (alt) { ev.preventDefault(); escolher(alt.letra); falar("Resposta " + alt.letra + "."); }
      return;
    }
    const f = acoes[lower];
    if (f) { ev.preventDefault(); f(); }
  }
  document.addEventListener("keydown", teclas);

  /* ---------- Relógio ---------- */
  const timer = setInterval(() => {
    const t = agora();
    if (cfg.relogio.expirou(t)) { renderRelogio(t); toast("Tempo esgotado. O bloco foi encerrado.", "aviso", 6000); falar("Tempo esgotado. O bloco foi encerrado."); finalizar("tempo"); return; }
    renderRelogio(t);
    const av = cfg.relogio.aviso(t);
    if (av) {
      toast(av >= 5 * 60000 ? "Faltam 5 minutos no bloco." : "Falta 1 minuto no bloco.", "aviso", 5000);
      salvar();
    }
  }, 250);

  /* guarda o tempo da questão atual quando a aba some (troca de aba, celular bloqueado, fechar) */
  const aoEsconder = () => { if (document.visibilityState === "hidden" && !finalizando) { A.ir(E.atual(), agora()); salvar({ urgente: true }); } };
  document.addEventListener("visibilitychange", aoEsconder);
  const antesDeSair = (ev) => { if (finalizando) return; A.ir(E.atual(), agora()); salvar({ urgente: true }); ev.preventDefault(); ev.returnValue = ""; };
  window.addEventListener("beforeunload", antesDeSair);

  renderRelogio();
  tudo({ foco: true });
  if (cfg.anuncio) falar(cfg.anuncio);
  if (cfg.relogio.expirou(agora())) finalizar("tempo");

  return {
    destroy() {
      clearInterval(timer);
      clearTimeout(tSel);
      clearTimeout(tNota);
      if (!finalizando) { try { A.ir(E.atual(), agora()); } catch { /* bloco encerrado */ } salvar({ urgente: true }); }
      document.removeEventListener("keydown", teclas);
      document.removeEventListener("selectionchange", aoSelecionar);
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("beforeunload", antesDeSair);
      document.body.classList.remove("em-prova");
    },
    get finalizando() { return finalizando; },
    redesenhar(op = {}) { if (!finalizando) tudo(op); }
  };
}
