/* Road to America | lógica da verificação de elegibilidade */
(function () {
  "use strict";

  var form = document.getElementById("checker");
  if (!form) return;
  var result = document.querySelector("[data-result]");
  var body = document.querySelector("[data-result-body]");
  var anoBox = form.querySelector("[data-ano]");
  var anoSel = form.querySelector("#c-ano");
  var escolaInp = form.querySelector("#c-escola");
  var saemeHit = form.querySelector("[data-saeme-hit]");
  var leadForm = document.querySelector('form[data-lead="verificacao"]');
  var ESCOLAS = window.R2A_ESCOLAS || [];

  if (window.R2A_fillSchoolList) window.R2A_fillSchoolList("lista-escolas");

  /* anos de formatura, do mais recente para o mais antigo */
  var now = new Date().getFullYear();
  var opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Selecione";
  anoSel.appendChild(opt0);
  for (var y = now; y >= 1960; y--) {
    var o = document.createElement("option");
    o.value = String(y);
    o.textContent = String(y);
    anoSel.appendChild(o);
  }

  /* escola vinda da página inicial (?escola=) */
  try {
    var pre = new URLSearchParams(location.search).get("escola");
    if (pre) escolaInp.value = pre;
  } catch (e) { /* navegador antigo */ }

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }
  function findSchool(text) {
    var t = norm(text);
    if (t.length < 3) return null;
    var exact = null, partial = null;
    ESCOLAS.forEach(function (s) {
      var n = norm(s.nome);
      var sig = norm(s.sigla || "");
      if ((s.aliases || []).some(function (al) { return norm(al) === t; })) exact = exact || s;
      var full = norm(window.R2A_schoolLabel ? window.R2A_schoolLabel(s) : s.nome);
      if (n === t || full === t || (sig && sig === t)) exact = exact || s;
      else if (!partial && t.length >= 6 && (n.indexOf(t) !== -1 || t.indexOf(n) !== -1)) partial = s;
    });
    return exact || partial;
  }

  function val(name) {
    var c = form.querySelector('input[name="' + name + '"]:checked');
    return c ? c.value : "";
  }

  function li(icon, html) {
    return '<li><i class="ph ' + icon + '" aria-hidden="true"></i><span>' + html + "</span></li>";
  }

  var last = "";
  function render() {
    var escola = escolaInp.value.trim();
    var sit = val("situacao");
    var ano = anoSel.value;
    var w = val("wdoms");
    var tr = val("transferencia");
    var school = findSchool(escola);

    anoBox.hidden = sit !== "formado";
    var okLabel = form.querySelector("[data-label-ok]");
    if (okLabel) {
      okLabel.firstChild.nodeValue = sit === "estudante" ? "A nota do ECFMG aparece com Graduation Years: Current" : "A nota do ECFMG aparece e inclui o meu ano";
      var okSub = okLabel.querySelector("[data-label-ok-sub]");
      if (okSub) okSub.textContent = sit === "estudante" ? "O campo Graduation Years indica Current" : "O intervalo de Graduation Years inclui o seu ano";
    }

    /* selo SAEME, quando a escola consta na lista */
    if (school && school.saeme) {
      saemeHit.classList.add("is-on");
      saemeHit.querySelector("span").textContent = school.nome + " consta como acreditada pelo SAEME" + (school.validade ? ", com validade até " + school.validade : "") + ". Se a acreditação estava válida no ano da sua formatura, você também pode usar o Pathway 3 da certificação ECFMG. Confira as regras do ano no site do ECFMG.";
    } else {
      saemeHit.classList.remove("is-on");
    }

    var answered = [escola.length >= 3, sit && (sit === "estudante" || ano), !!w, !!tr];
    var count = answered.filter(Boolean).length;

    var level = "", badge = "", title = "", text = "", items = [];
    if (!w) {
      level = "";
      badge = '<i class="ph ph-hourglass-medium" aria-hidden="true"></i>' + (count ? "Faltam " + (4 - count) + (4 - count === 1 ? " resposta" : " respostas") : "Aguardando respostas");
      title = count ? "Continue respondendo." : "O seu resultado aparece aqui.";
      text = "A resposta da pergunta 3 define o resultado, porque vem do que o World Directory registra sobre a sua escola.";
    } else if (w === "ok" && count < 4) {
      level = "";
      badge = '<i class="ph ph-hourglass-medium" aria-hidden="true"></i>Faltam ' + (4 - count) + (4 - count === 1 ? " resposta" : " respostas");
      title = "Quase lá.";
      text = !answered[0] ? "Informe o nome da escola." : (!answered[1] ? "Informe se já se formou e, se for o caso, o ano de formatura." : "Responda se você estudou em mais de uma escola.");
    } else if (w === "ok") {
      level = "ok";
      badge = '<i class="ph-fill ph-check-circle" aria-hidden="true"></i>Caminho aberto';
      title = sit === "estudante" ? "Você já pode se preparar para o Step 1 e o Step 2 CK." : "A sua faculdade está liberada para o USMLE.";
      text = "Pelo que você informou, a sua escola atende aos requisitos do ECFMG segundo o World Directory, que é o critério do USMLE para escolas fora dos EUA.";
      items.push(li("ph-check-circle", "Inscrição no Step 1 e no Step 2 CK pela FSMB, com a conta MyIntealth para a certificação."));
      items.push(li("ph-check-circle", sit === "estudante" ? "A matrícula precisa estar ativa e o ciclo básico concluído no início do período de elegibilidade." : "O diploma final e o histórico serão verificados pelo ECFMG diretamente com a escola."));
      if (tr === "sim") items.push(li("ph-check-circle", "Como houve transferência, o histórico da escola anterior também será verificado."));
      items.push(li("ph-check-circle", "Próximo passo: montar a sua rota de estudo com um mentor."));
    } else if (w === "sem-nota" && school && school.saeme) {
      level = "check";
      badge = '<i class="ph-fill ph-info" aria-hidden="true"></i>Vamos confirmar';
      title = "Confira de novo a aba Sponsor Notes.";
      text = "Escolas acreditadas pelo SAEME costumam ter a Sponsor Note do ECFMG. Veja se abriu a aba certa e o registro do campus correto.";
      items.push(li("ph-info", "No World Directory, cada campus pode ter um registro próprio."));
      items.push(li("ph-info", "Se a dúvida continuar, um mentor confere por você."));
    } else if (w === "fora" || w === "sem-nota") {
      level = "stop";
      badge = '<i class="ph-fill ph-warning-circle" aria-hidden="true"></i>Atenção';
      title = w === "fora" ? "O seu ano de formatura não está coberto hoje." : "Sem a nota do ECFMG, a escola não está liberada por enquanto.";
      text = w === "fora" ? "O ECFMG só aceita formados nos anos listados na Sponsor Note. Antes de tirar conclusões, confira de novo o campo Graduation Years." : "O ECFMG informa que, sem a Sponsor Note, alunos e formados da escola não são elegíveis à certificação.";
      items.push(li("ph-arrow-circle-right", "Confira se não há outro registro da escola com nome antigo ou de outro campus."));
      items.push(li("ph-arrow-circle-right", "A nota é solicitada pela própria escola, por meio de um representante autorizado. Leve a questão à coordenação do curso."));
      items.push(li("ph-arrow-circle-right", "Peça a conferência de um mentor antes de tomar qualquer decisão."));
    } else {
      level = "check";
      badge = '<i class="ph-fill ph-info" aria-hidden="true"></i>Vamos confirmar';
      title = w === "nao-achei" ? "A escola pode estar listada com outro nome." : "Um mentor confere para você.";
      text = w === "nao-achei" ? "No World Directory, as escolas brasileiras aparecem pelo nome oficial em português. Pesquise só pela cidade e confira a lista de resultados." : "Envie os seus dados abaixo e receba a conferência por e-mail, com o próximo passo indicado para o seu caso.";
      items.push(li("ph-info", "Escolas reconhecidas pelo MEC costumam ter a Sponsor Note; cursos muito novos podem ter anos restritos."));
      if (tr === "sim") items.push(li("ph-info", "Com transferência, o histórico de cada escola é verificado separadamente."));
      items.push(li("ph-info", "A conferência é gratuita e não obriga a matrícula."));
    }

    if (school && school.vencida && w) {
      items.push(li("ph-info", "A acreditação SAEME registrada para esta escola venceu em " + school.vencida + ". Confira a renovação em saeme.org.br. Isso não muda a elegibilidade ao USMLE."));
    } else if (school && !school.saeme && w) {
      items.push(li(level === "ok" ? "ph-check-circle" : "ph-info", "Não temos a acreditação SAEME desta escola registrada na nossa lista. Confira em saeme.org.br. De todo modo, isso não muda a elegibilidade ao USMLE."));
    }

    var dots = "";
    for (var i = 0; i < 4; i++) dots += '<span class="' + (answered[i] ? "is-done" : "") + '"></span>';

    var cta = w ? '<a class="btn btn--block" href="#confirmar">' + (level === "ok" ? "Montar minha rota" : "Quero a confirmação") + ' <i class="ph ph-arrow-down" aria-hidden="true"></i></a>' : "";

    var html = '<span class="result__badge">' + badge + "</span>" +
      '<h2 class="display h3">' + title + "</h2>" +
      "<p>" + text + "</p>" +
      (items.length ? "<ul>" + items.join("") + "</ul>" : "") +
      '<div class="progress-dots" aria-hidden="true">' + dots + "</div>" + cta;

    var key = level + "|" + w + "|" + sit + "|" + tr + "|" + (school ? school.nome : "") + "|" + count;
    if (key !== last) {
      body.innerHTML = html;
      body.removeAttribute("data-anim");
      void body.offsetWidth;
      body.setAttribute("data-anim", "");
      last = key;
    }
    var live = document.querySelector("[data-result-live]");
    var liveText = level ? (badge.replace(/<[^>]+>/g, "") + ". " + title) : "";
    if (live && live.textContent !== liveText) live.textContent = liveText;
    if (level) result.setAttribute("data-level", level);
    else result.removeAttribute("data-level");

    /* leva as respostas para o formulário de contato */
    if (leadForm) {
      var ve = leadForm.querySelector('[name="escola"]');
      if (ve && escola && !ve.dataset.touched) ve.value = escola;
      leadForm.querySelector('[name="resultado_verificacao"]').value = [w || "sem resposta", sit, tr ? "transferencia:" + tr : ""].filter(Boolean).join(" | ");
      leadForm.querySelector('[name="ano_formatura"]').value = sit === "formado" ? ano : (sit === "estudante" ? "cursando" : "");
    }
  }

  if (leadForm) {
    var ve = leadForm.querySelector('[name="escola"]');
    if (ve) ve.addEventListener("input", function () { ve.dataset.touched = "1"; });
  }
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  render();
})();
