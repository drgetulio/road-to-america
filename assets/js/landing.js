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
        "Escolas brasileiras reconhecidas costumam ter a nota, mas cursos novos podem ter anos restritos. A <a href=\"verificar.html\">ferramenta de verificação</a> guia a conferência em poucos minutos e, se restar dúvida, um mentor confere por você."
      ],
      s: ["sponsor", "wdoms"]
    },
    {
      q: "Minha escola não tem acreditação SAEME. Estou fora?",
      a: [
        "<strong>Não.</strong> A política de acreditação reconhecida da Intealth começou em novembro de 2024 como medida apenas informativa. A própria instituição afirma que o médico pode seguir com a certificação ECFMG mesmo que a escola não atenda à política.",
        "A acreditação SAEME pesa somente em um dos Pathways de certificação, o Pathway 3. As demais vias continuam abertas para formados em escolas não acreditadas."
      ],
      s: ["rap", "rapNews", "pathways"]
    },
    {
      q: "Meu inglês ainda não é fluente.",
      a: [
        "O Step 1 e o Step 2 CK são provas escritas, de leitura clínica, sem parte oral. O vocabulário médico em inglês se constrói desde o primeiro dia, com o Anki e com as questões comentadas.",
        "A fala entra mais adiante: a certificação ECFMG exige o OET Medicine, com mínimo de 350 em Listening, Reading e Speaking e 300 em Writing, em uma única aplicação. O seu plano já prevê essa etapa no momento certo."
      ],
      s: ["oet"]
    },
    {
      q: "Trabalho em plantões e tenho pouco tempo.",
      a: [
        "O plano parte da sua escala de plantões. Na prática, isso significa revisão diária curta no Anki, blocos de questões nos dias de folga e simulados em datas combinadas com o mentor.",
        "O formato da prova também mudou: desde maio de 2026, o Step 1 e o Step 2 CK são aplicados em <strong>blocos de 30 minutos</strong>, o que favorece quem treina em sessões curtas e frequentes."
      ],
      s: ["format"]
    },
    {
      q: "Já passei dos 35 anos. Ainda faz sentido?",
      a: [
        "<strong>Não existe idade máxima</strong> para a residência nos EUA. O que alguns programas observam é o tempo desde a formatura, e cada um informa essa preferência na base FREIDA, da American Medical Association.",
        "Experiência clínica, cartas de recomendação e uma nota competitiva no Step 2 CK contam a seu favor. Entre IMGs não americanos que conseguiram a especialidade desejada em 2026, a mediana no Step 2 CK foi 248."
      ],
      s: ["freida", "charting"]
    },
    {
      q: "Vou precisar refazer a residência?",
      a: [
        "Na maioria dos estados, sim: a licença plena exige residência credenciada nos EUA. Desde 2023, porém, <strong>mais de 20 estados</strong> aprovaram leis de licenciamento alternativo para médicos formados no exterior com experiência prévia.",
        "Quase todas essas leis exigem a certificação ECFMG, que inclui o Step 1 e o Step 2 CK, e uma oferta de emprego nos EUA."
      ],
      s: ["fsmb", "wes"]
    },
    {
      q: "E o visto de trabalho?",
      a: [
        "A maioria dos residentes estrangeiros usa o <strong>J-1</strong>, patrocinado pelo próprio ECFMG. Ao final, há a exigência de dois anos no país de origem, que pode ser dispensada, por exemplo, pelo programa Conrad 30, em troca de atuação em áreas com falta de médicos.",
        "Alguns programas oferecem o H-1B, que costuma exigir o Step 3. Orientamos cada etapa, mas a decisão migratória é individual e deve ser confirmada com o programa e com um advogado de imigração."
      ],
      s: ["evsp"]
    },
    {
      q: "E se eu não for aprovado?",
      a: [
        "Você recebe de volta o valor integral pago ao curso, conforme as regras da <a href=\"#garantia\">garantia de três anos</a>.",
        "Como cada Step permite no máximo quatro tentativas na vida, a prova só é agendada quando os simulados mostram margem de segurança."
      ],
      s: ["attempts"]
    },
    {
      q: "Ainda estou na faculdade. Posso começar?",
      a: [
        "<strong>Sim.</strong> Estudantes regularmente matriculados em escola cuja Sponsor Note indica Current, com o ciclo básico concluído, podem fazer o Step 1 e o Step 2 CK antes da formatura. O certificado ECFMG é emitido depois, com o diploma verificado.",
        "Quem começa durante o curso pode chegar à formatura com as duas provas feitas."
      ],
      s: ["students"]
    },
    {
      q: "Quanto custa o caminho, além do curso?",
      a: [
        "Taxas oficiais em 2026: Step 1, US$ 695 mais US$ 210 de taxa regional para prova fora dos EUA; Step 2 CK, US$ 695 mais US$ 235; inscrição na certificação ECFMG, US$ 580; OET Medicine, cerca de AU$ 587.",
        "Somando a conta MyIntealth, a verificação do diploma e a inscrição no Pathway, o total oficial costuma ficar <strong>entre US$ 3.000 e US$ 4.000</strong>. Esses valores são pagos diretamente às instituições, e o seu plano já os distribui no tempo."
      ],
      s: ["fees", "ecfmgFees"]
    },
    {
      q: "Preciso viajar para fazer a prova?",
      a: [
        "<strong>Não.</strong> O Step 1 e o Step 2 CK são aplicados pela Prometric em centros no Brasil. Confira a lista atualizada de cidades no site da Prometric antes de agendar.",
        "Desde janeiro de 2026, a inscrição de formados fora dos EUA é feita pela FSMB. A certificação continua com o ECFMG."
      ],
      s: ["prometric", "fsmbMove"]
    },
    {
      q: "Por que R$ 12.000, se pacotes completos custam bem mais?",
      a: [
        "O modelo é enxuto: o conteúdo é produzido pelos próprios mentores, sem intermediários, e entregue em plataforma digital.",
        "Os alunos da <strong>turma fundadora</strong> também serão os primeiros resultados públicos da Road to America, e o preço reflete essa parceria."
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
          b.removeAttribute("aria-selected");
          b.removeAttribute("tabindex");
          b.setAttribute("aria-controls", "qa-inline-" + i);
          b.setAttribute("aria-expanded", document.getElementById("qa-inline-" + i).hidden ? "false" : "true");
        } else {
          b.setAttribute("role", "tab");
          b.setAttribute("aria-controls", "qa-panel");
          b.removeAttribute("aria-expanded");
        }
      });
      panel.id = "qa-panel";
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
          "<div><dt>Atuação</dt><dd>" + (real ? esc(m.atuacao) : "Perfil enviado aos pré-inscritos") + "</dd></div>" +
          (real && m.resultado ? "<div><dt>Resultado</dt><dd>" + esc(m.resultado) + "</dd></div>" : "") +
        "</dl>" +
      "</div>" +
      '<div class="pass__stub" aria-hidden="true">' +
        "<span>De</span><b>BSB</b><span>Para</span><b>" + (real && m.destino ? esc(m.destino).slice(0, 10) : "EUA") + "</b><span>Assento</span><b>" + seat + "</b>" +
      "</div>" +
    "</article>";
  }
  if (box) {
    var list = mentores.length ? mentores : [null, null, null];
    box.innerHTML = list.map(pass).join("");
    if (mentores.length) { var empty = document.querySelector("[data-mentores-vazio]"); if (empty) empty.hidden = true; }
    if (window.R2A_observeReveals) window.R2A_observeReveals(box.querySelectorAll(".reveal"));
  }
  var fotoBox = document.querySelector("[data-fundador-foto]");
  if (fotoBox && CFG.fotoFundador) {
    var mono = fotoBox.querySelector(".founder__mono");
    var img = document.createElement("img");
    img.src = CFG.fotoFundador; img.alt = "Dr. Getúlio"; img.className = "founder__photo"; img.width = 600; img.height = 750;
    if (mono) mono.replaceWith(img);
  }

  /* ---------- Autocompletar escolas ---------- */
  if (window.R2A_fillSchoolList) {
    window.R2A_fillSchoolList("lista-escolas");
    window.R2A_fillSchoolList("lista-escolas-form");
  }
})();
