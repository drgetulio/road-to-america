/* Road to America | página de vendas: dúvidas, mentores e listas de escolas */
(function () {
  "use strict";

  var SRC = {
    sponsor: ["ECFMG, Sponsor Notes", "https://www.ecfmg.org/resources/sponsor-notes.html"],
    wdoms: ["World Directory of Medical Schools", "https://search.wdoms.org/"],
    rap: ["Intealth, política de acreditação", "https://www.intealth.org/accreditation/"],
    rapNews: ["Intealth, novembro de 2024", "https://www.intealth.org/news/2024/11/20/intealth-implements-recognized-accreditation-policy/"],
    pathways: ["ECFMG Pathways", "https://www.ecfmg.org/certification-pathways/"],
    oet: ["ECFMG Pathways, perguntas frequentes", "https://www.ecfmg.org/certification-pathways/faqs.html"],
    format: ["USMLE, novo formato 2026", "https://www.usmle.org/test-delivery-software-updates-step-2-ck-and-step-1-coming-may-2026"],
    freida: ["AMA FREIDA", "https://freida.ama-assn.org/"],
    charting: ["NRMP Charting Outcomes 2026", "https://www.nrmp.org/match-data/"],
    fsmb: ["FSMB, licenciamento de IMGs", "https://www.fsmb.org/advocacy/policies/"],
    wes: ["WES, maio de 2026", "https://www.wes.org/resource-library/blog/welcoming-communities-in-action/27-states-expand-pathways-for-internationally-trained-physicians-in-2026/"],
    evsp: ["ECFMG, visto J-1", "https://www.ecfmg.org/evsp/"],
    attempts: ["USMLE, limite de tentativas", "https://www.usmle.org/attemptlimit.html"],
    fees: ["USMLE, inscrição e taxas", "https://www.usmle.org/apply-exams"],
    ecfmgFees: ["ECFMG, taxas a partir de abril de 2026", "https://www.ecfmg.org/news/2026/03/19/fee-increases-beginning-april-1-2026/"],
    students: ["ECFMG, Information Booklet 2026", "https://www.ecfmg.org/2026ib/students.html"],
    fsmbMove: ["ECFMG, transição para a FSMB", "https://www.ecfmg.org/news/2026/01/12/phase-one-of-usmle-service-transition-is-complete-all-usmle-step-exam-services-for-imgs-now-managed-by-fsmb/"],
    prometric: ["Prometric, localizar centro", "https://www.prometric.com/test-takers/search/usmle"]
  };

  var QA = [
    {
      q: "Minha faculdade permite fazer o USMLE?",
      a: [
        "Depende de um registro objetivo: a <strong>ECFMG Sponsor Note</strong> da sua escola no World Directory of Medical Schools, com o seu ano de formatura incluído no campo Graduation Years.",
        "Escolas brasileiras reconhecidas em geral têm a nota, mas cursos novos podem ter anos restritos. A <a href=\"verificar.html\">ferramenta de verificação</a> guia a conferência em poucos minutos e, se restar dúvida, um mentor confere por você."
      ],
      s: ["sponsor", "wdoms"]
    },
    {
      q: "Minha escola não tem acreditação SAEME. Estou fora?",
      a: [
        "<strong>Não.</strong> A Recognized Accreditation Policy da Intealth entrou em vigor em novembro de 2024 apenas como medida informativa. A própria instituição afirma que o médico pode seguir com a certificação ECFMG mesmo que a escola não atenda à política.",
        "A acreditação SAEME pesa somente em um dos Pathways de certificação, o Pathway 3. Quem já tem CRM ativo usa, na maioria dos casos, o Pathway 1, baseado na licença para exercer a medicina no Brasil. As regras de cada ciclo estão no site do ECFMG."
      ],
      s: ["rap", "rapNews", "pathways"]
    },
    {
      q: "Meu inglês ainda não é fluente.",
      a: [
        "O Step 1 e o Step 2 CK são provas de múltipla escolha no computador, sem parte oral. O vocabulário médico em inglês se constrói desde o primeiro dia, com o Anki e com as questões comentadas.",
        "A parte oral vem depois, na certificação: o ECFMG exige o OET Medicine, com mínimo de 350 em Listening, Reading e Speaking e 300 em Writing, em uma única aplicação. O OET está previsto no cronograma para depois do Step 2 CK."
      ],
      s: ["oet"]
    },
    {
      q: "Trabalho em plantões e tenho pouco tempo.",
      a: [
        "O plano é montado a partir da sua escala. A carga mínima é de cerca de 12 horas por semana: 30 a 40 minutos de Anki por dia (cerca de 4 horas), as aulas gravadas da semana e dois ou três blocos de questões com revisão dos erros em cada folga.",
        "Nesse ritmo, o planejamento prevê de 10 a 14 meses até o Step 1 e mais 8 a 12 até o Step 2 CK, dentro dos três anos de acesso. Para quem está há mais de cinco anos longe das ciências básicas, o mentor em geral indica 15 horas ou mais por semana, ou um prazo maior até o Step 1. Se você tiver menos de 12 horas livres por semana, avisamos já na pré-inscrição que os três anos podem não bastar. As provas usam <strong>blocos de 30 minutos</strong> desde maio de 2026, e os blocos de questões do plano seguem esse formato."
      ],
      s: ["format"]
    },
    {
      q: "Já passei dos 35 anos. Ainda faz sentido?",
      a: [
        "<strong>Não existe idade máxima</strong> para a residência nos EUA. O que alguns programas observam é o tempo desde a formatura: muitos preferem candidatos formados há menos de 5 a 10 anos, outros não têm corte. Muitos programas informam esse critério na base FREIDA, da American Medical Association. Quando não informam, vale perguntar direto ao programa.",
        "Experiência clínica nos EUA, cartas de recomendação e uma nota competitiva no Step 2 CK compensam parte desse tempo. Entre IMGs não americanos que conseguiram a especialidade desejada em 2026, a mediana no Step 2 CK foi 248. No diagnóstico, o mentor indica os programas compatíveis com o seu ano de formatura."
      ],
      s: ["freida", "charting"]
    },
    {
      q: "Vou precisar refazer a residência?",
      a: [
        "Na prática, sim. A residência credenciada nos EUA continua sendo o caminho habitual para a licença plena. Desde 2023, <strong>27 estados</strong> aprovaram leis de licenciamento alternativo para médicos formados no exterior com experiência prévia (WES, maio de 2026), mas muitas ainda estão em regulamentação e oferecem poucas vagas.",
        "Quase todas essas leis exigem a certificação ECFMG, que inclui o Step 1 e o Step 2 CK, e uma oferta de emprego nos EUA."
      ],
      s: ["fsmb", "wes"]
    },
    {
      q: "E o visto para a residência?",
      a: [
        "A maioria dos residentes estrangeiros usa o <strong>J-1</strong>, visto de intercâmbio patrocinado pelo próprio ECFMG. Ao final, há a exigência de dois anos no país de origem, que pode ser dispensada, por exemplo, pelo programa Conrad 30, em troca de atuação em áreas com falta de médicos.",
        "Alguns programas oferecem o H-1B, que geralmente exige o Step 3. Explicamos as opções de visto nas mentorias, mas a decisão migratória é individual e deve ser confirmada com o programa e com um advogado de imigração."
      ],
      s: ["evsp"]
    },
    {
      q: "E se eu não for aprovado?",
      a: [
        "Se, ao fim de três anos, ainda faltar aprovação no Step 1 ou no Step 2 CK e você tiver assistido a pelo menos 80% das aulas e feito no mínimo duas autoavaliações do NBME por Step que faltar, devolvemos o valor integral pago ao curso. Não é preciso ter feito nenhuma tentativa da prova para pedir o reembolso. Veja o <a href=\"garantia.html\">termo completo</a>.",
        "Como cada Step aceita no máximo quatro tentativas na vida, recomendamos agendar só quando os simulados mostrarem folga, mas quem escolhe a data é você."
      ],
      s: ["attempts"]
    },
    {
      q: "Ainda estou na faculdade. Posso começar?",
      a: [
        "<strong>Sim.</strong> Estudantes regularmente matriculados em escola cuja Sponsor Note indica Current, com o ciclo básico concluído, podem fazer o Step 1 e o Step 2 CK antes da formatura. O certificado ECFMG é emitido depois, com o diploma verificado.",
        "Quem começa durante o curso pode chegar à formatura com as duas provas feitas. Se você ainda não concluiu os dois primeiros anos da faculdade, o prazo da garantia e o acesso ao conteúdo começam a contar quando concluir."
      ],
      s: ["students"]
    },
    {
      q: "Quanto custa o caminho, além do curso?",
      a: [
        "Taxas oficiais em 2026: Step 1, US$ 695 mais US$ 210 de taxa regional para prova fora dos EUA; Step 2 CK, US$ 695 mais US$ 235; inscrição na certificação ECFMG, US$ 580; OET Medicine, cerca de AU$ 587.",
        "Somando a conta MyIntealth, a verificação do diploma e a inscrição no Pathway, o total oficial fica <strong>entre US$ 3.000 e US$ 4.000</strong>. Esses valores são pagos diretamente às instituições, e o cronograma indica quando pagar cada taxa."
      ],
      s: ["fees", "ecfmgFees"]
    },
    {
      q: "Preciso viajar para fazer a prova?",
      a: [
        "<strong>Não para fora do país.</strong> O Step 1 e o Step 2 CK são aplicados pela Prometric em centros no Brasil, que ficam em algumas capitais. Dependendo de onde você mora, será preciso ir até uma delas. A lista atualizada de cidades está no site da Prometric.",
        "Desde janeiro de 2026, a inscrição de estudantes e formados de escolas fora dos EUA é feita pela FSMB. A certificação continua com o ECFMG."
      ],
      s: ["prometric", "fsmbMove"]
    },
    {
      q: "O curso ajuda com ERAS, estágio nos EUA e entrevistas?",
      a: [
        "O foco desta turma está no Step 1, no Step 2 CK e na certificação ECFMG, que são pré-requisitos de qualquer candidatura.",
        "O acompanhamento de ERAS, cartas de recomendação, estágio nos EUA e entrevistas não faz parte do pacote da turma fundadora."
      ],
      s: ["pathways"]
    },
    {
      q: "Por que R$ 12.000, se outros pacotes custam mais?",
      a: [
        "O curso é todo online, e as aulas e o material são feitos pela própria equipe. Não pagamos estúdio, licença de conteúdo nem estrutura física.",
        "O valor pode ser pago à vista ou em até 12 vezes de R$ 1.000 no cartão de crédito.",
        "A <strong>turma fundadora</strong> tem preço especial por ser a primeira. Pelo mesmo motivo, ainda não temos taxa de aprovação para mostrar, e a garantia de três anos cobre esse risco. Pedimos sugestões ao longo do curso e, de quem autorizar, um depoimento depois da prova, publicado com a indicação de condição especial de preço."
      ],
      s: []
    }
  ];

  function sources(keys) {
    if (!keys.length) return "";
    return '<div class="qa__src"><span>Fontes:</span>' + keys.map(function (k) {
      return '<a href="' + SRC[k][1] + '" target="_blank" rel="noopener">' + SRC[k][0] + "</a>";
    }).join("") + "</div>";
  }
  function answer(item) {
    return item.a.map(function (p) { return "<p>" + p + "</p>"; }).join("") + sources(item.s);
  }

  var qa = document.querySelector("[data-qa]");
  if (qa) {
    var list = qa.querySelector(".qa__list");
    var panel = qa.querySelector(".qa__panel");
    var mobile = window.matchMedia("(max-width: 860px)");
    var buttons = [];

    QA.forEach(function (item, i) {
      var wrap = document.createElement("div");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qa__q";
      btn.id = "qa-tab-" + i;
      btn.innerHTML = "<span>" + item.q + '</span><i class="ph ph-caret-right" aria-hidden="true"></i>';
      var inline = document.createElement("div");
      inline.className = "qa__inline";
      inline.id = "qa-inline-" + i;
      inline.hidden = true;
      inline.innerHTML = answer(item);
      wrap.appendChild(btn);
      wrap.appendChild(inline);
      list.appendChild(wrap);
      buttons.push(btn);

      btn.addEventListener("click", function () { select(i, true); });
      btn.addEventListener("keydown", function (e) {
        if (mobile.matches) return;
        var next = null;
        if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % QA.length;
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + QA.length) % QA.length;
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = QA.length - 1;
        if (next !== null) { e.preventDefault(); select(next, true); buttons[next].focus(); }
      });
    });

    function applyRoles() {
      buttons.forEach(function (b, i) {
        if (mobile.matches) {
          b.removeAttribute("role");
          b.parentElement.removeAttribute("role");
          b.removeAttribute("aria-selected");
          b.removeAttribute("tabindex");
          b.setAttribute("aria-controls", "qa-inline-" + i);
          b.setAttribute("aria-expanded", document.getElementById("qa-inline-" + i).hidden ? "false" : "true");
        } else {
          b.setAttribute("role", "tab");
          b.setAttribute("aria-controls", "qa-panel");
          b.removeAttribute("aria-expanded");
          b.parentElement.setAttribute("role", "presentation");
        }
      });
      panel.id = "qa-panel";
      if (mobile.matches) { list.removeAttribute("role"); list.removeAttribute("aria-orientation"); panel.removeAttribute("role"); }
      else { list.setAttribute("role", "tablist"); list.setAttribute("aria-orientation", "vertical"); panel.setAttribute("role", "tabpanel"); }
    }

    var current = 0;
    function select(i, user) {
      if (mobile.matches) {
        var box = document.getElementById("qa-inline-" + i);
        box.hidden = !box.hidden;
        buttons[i].setAttribute("aria-expanded", box.hidden ? "false" : "true");
        return;
      }
      current = i;
      buttons.forEach(function (b, j) {
        b.setAttribute("aria-selected", j === i ? "true" : "false");
        b.setAttribute("tabindex", j === i ? "0" : "-1");
      });
      panel.setAttribute("aria-labelledby", "qa-tab-" + i);
      panel.innerHTML = '<h3 class="display h3">' + QA[i].q + "</h3>" + answer(QA[i]);
      if (user) {
        panel.removeAttribute("data-anim");
        void panel.offsetWidth;
        panel.setAttribute("data-anim", "");
      }
    }

    applyRoles();
    select(0, false);
    document.querySelectorAll("[data-qa-abrir]").forEach(function (a) {
      a.addEventListener("click", function () {
        var i = Number(a.getAttribute("data-qa-abrir"));
        if (mobile.matches) { var box = document.getElementById("qa-inline-" + i); if (box && box.hidden) select(i, true); }
        else select(i, true);
      });
    });
    var onChange = function () { applyRoles(); if (!mobile.matches) select(current, false); };
    if (mobile.addEventListener) mobile.addEventListener("change", onChange);
    else if (mobile.addListener) mobile.addListener(onChange);
  }

  /* ---------- Mentores vindos da configuração (cartões de embarque) ---------- */
  var CFG = window.R2A_CONFIG || {};
  var mentores = CFG.mentores || [];
  var box = document.querySelector("[data-mentores]");
  function esc(t) { return String(t || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pass(m, i) {
    var seat = String(i + 1).padStart(2, "0");
    var real = !!m;
    return '<article class="pass' + (real ? "" : " pass--reserved") + ' reveal" style="--i:' + i + '">' +
      '<div class="pass__main">' +
        '<p class="pass__top">Embarque <span>Turma fundadora</span></p>' +
        (real && m.foto ? '<img class="pass__photo" src="' + esc(m.foto) + '" alt="' + esc(m.nome) + '" loading="lazy" width="72" height="72">' : "") +
        '<h3 class="pass__name">' + (real ? esc(m.nome) : "Mentor " + seat) + "</h3>" +
        '<dl class="pass__data">' +
          "<div><dt>Formação</dt><dd>" + (real ? esc(m.formacao) : "Medicina no Brasil") + "</dd></div>" +
          "<div><dt>Atuação</dt><dd>" + (real ? esc(m.atuacao) : "Perfil publicado aqui antes das matrículas") + "</dd></div>" +
          (real && m.resultado ? "<div><dt>Resultado</dt><dd>" + esc(m.resultado) + "</dd></div>" : "") +
        "</dl>" +
      "</div>" +
      '<div class="pass__stub" aria-hidden="true">' +
        "<span>De</span><b>" + (real && m.origem ? esc(m.origem).slice(0, 4) : "BRA") + "</b><span>Para</span><b>" + (real && m.destino ? esc(m.destino).slice(0, 4) : "EUA") + "</b><span>Assento</span><b>" + seat + "</b>" +
      "</div>" +
    "</article>";
  }
  if (box) {
    var passList = mentores.length ? mentores : [null, null, null];
    box.innerHTML = passList.map(pass).join("");
    if (mentores.length) { var empty = document.querySelector("[data-mentores-vazio]"); if (empty) empty.hidden = true; }
    if (window.R2A_observeReveals) window.R2A_observeReveals(box.querySelectorAll(".reveal"));
  }
  /* ---------- Fundador, empresa e oferta vindos da configuração ---------- */
  var F = CFG.fundador || {};
  if (F.nome) document.querySelectorAll("[data-fundador-nome]").forEach(function (el) { el.textContent = F.nome; });
  if (!F.rqe) document.querySelectorAll("[data-requer-rqe]").forEach(function (el) { el.hidden = true; });
  var reg = document.querySelector("[data-fundador-registro]");
  if (reg && (F.crm || F.rqe)) {
    /* um registro por linha: CRM e cada RQE */
    var regs = [F.crm].concat(String(F.rqe || "").split("·")).map(function (t) { return t.trim(); }).filter(Boolean);
    reg.innerHTML = regs.map(esc).join("<br>");
    reg.hidden = false;
  }
  var lat = document.querySelector("[data-fundador-lattes]");
  if (lat && F.lattes) { lat.querySelector("a").href = F.lattes; lat.hidden = false; }
  var fotoBox = document.querySelector("[data-fundador-foto]");
  if (fotoBox && (F.foto || CFG.fotoFundador)) {
    var img = document.createElement("img");
    img.src = F.foto || CFG.fotoFundador; img.alt = F.nome || "Fundador da Road to America"; img.className = "founder__avatar"; img.width = 460; img.height = 460;
    var cap = fotoBox.querySelector("figcaption");
    if (cap) cap.insertBefore(img, cap.firstChild);
  }

  var O = CFG.oferta || {};
  var pg = document.querySelector("[data-pagamento]");
  if (pg && O.pagamento) pg.textContent = O.pagamento;
  var facts = document.querySelector("[data-oferta]");
  var rows = [["Início", O.inicio], ["Vagas", O.vagas], ["Aulas", O.aulas], ["Mentoria", O.mentoria]].filter(function (r) { return r[1]; });
  if (facts && rows.length) {
    facts.innerHTML = rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("");
    facts.hidden = false;
  }
  var A = CFG.amostras || {};
  [["anki", "Baixar amostra do baralho"], ["apostila", "Ver páginas da apostila"]].forEach(function (k) {
    var tile = document.querySelector("[data-amostra=\"" + k[0] + "\"]");
    if (tile && A[k[0]]) {
      var link = document.createElement("a");
      link.className = "tile__sample"; link.href = A[k[0]]; link.target = "_blank"; link.rel = "noopener";
      link.innerHTML = '<i class="ph ph-download-simple" aria-hidden="true"></i>' + k[1];
      tile.appendChild(link);
    }
  });

  /* ---------- Autocompletar escolas ---------- */
  if (window.R2A_fillSchoolList) {
    window.R2A_fillSchoolList("lista-escolas");
    window.R2A_fillSchoolList("lista-escolas-form");
  }
})();
