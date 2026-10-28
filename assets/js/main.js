/* Road to America | comportamento compartilhado entre as páginas */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var CONFIG = window.R2A_CONFIG || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Tema (claro, escuro ou sistema) ---------- */
  var root = document.documentElement;
  function readTheme() {
    try { return localStorage.getItem("r2a-theme"); } catch (e) { return null; }
  }
  function saveTheme(v) {
    try { localStorage.setItem("r2a-theme", v); } catch (e) { /* armazenamento indisponível */ }
  }
  var stored = readTheme();
  if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);
  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      if (!current) current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      saveTheme(next);
    });
  });

  /* ---------- Menu móvel ---------- */
  var nav = document.querySelector(".nav");
  var toggle = document.querySelector(".nav__toggle");
  if (nav && toggle) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll(".nav__links a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Revelação ao entrar na tela ---------- */
  var io = null;
  if (!reduceMotion && "IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.01 });
  }
  window.R2A_observeReveals = function (els) {
    Array.prototype.forEach.call(els, function (el) {
      if (io) io.observe(el); else el.classList.add("is-in");
    });
  };
  window.R2A_observeReveals(document.querySelectorAll(".reveal"));

  /* ---------- Lista de escolas para autocompletar ---------- */
  window.R2A_schoolLabel = function (s) {
    return s.nome + (s.sigla ? " - " + s.sigla : "") + (s.uf ? " (" + s.uf + ")" : "");
  };
  window.R2A_fillSchoolList = function (datalistId) {
    var dl = document.getElementById(datalistId);
    var list = window.R2A_ESCOLAS || [];
    if (!dl || !list.length || dl.children.length) return;
    var frag = document.createDocumentFragment();
    list.forEach(function (s) {
      var o = document.createElement("option");
      o.value = window.R2A_schoolLabel(s);
      frag.appendChild(o);
    });
    dl.appendChild(frag);
  };

  /* ---------- Máscara de telefone ---------- */
  function maskPhone(v) {
    if (/^\s*\+/.test(v) && !/^\s*\+55/.test(v)) return v.replace(/[^\d+ ()-]/g, "").slice(0, 20);
    var d = v.replace(/\D/g, "");
    if (d.indexOf("55") === 0 && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }
  document.querySelectorAll("input[data-phone]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var pos = inp.value.length;
      inp.value = maskPhone(inp.value);
      if (document.activeElement === inp && pos === inp.value.length) inp.setSelectionRange(pos, pos);
    });
  });

  /* ---------- Formulário de pré-inscrição ---------- */
  var RULES = {
    nome: function (v) {
      var parts = v.trim().split(/\s+/).filter(Boolean);
      if (!v.trim()) return "Informe seu nome completo.";
      if (parts.length < 2) return "Inclua nome e sobrenome, como no diploma.";
      return "";
    },
    escola: function (v) { return v.trim().length < 3 ? "Informe a escola médica em que você se formou ou estuda." : ""; },
    telefone: function (v) {
      var d = v.replace(/\D/g, "");
      if (!d) return "Informe um telefone com DDD.";
      if (/^\s*\+/.test(v) && !/^\s*\+55/.test(v)) return d.length >= 8 ? "" : "Confira o número internacional.";
      return d.length >= 10 ? "" : "Confira o DDD e o número.";
    },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "Informe um e-mail válido."; },
    ingles: function (v) { return v ? "" : "Escolha a opção que melhor descreve seu inglês hoje."; },
    consentimento: function (v) { return v ? "" : "Precisamos do seu consentimento para entrar em contato."; }
  };

  function fieldValue(form, name) {
    var el = form.elements[name];
    if (!el) return "";
    if (el.type === "checkbox") return el.checked ? "sim" : "";
    if (el instanceof RadioNodeList || (el.length && el[0] && el[0].type === "radio")) {
      var checked = form.querySelector('input[name="' + name + '"]:checked');
      return checked ? checked.value : "";
    }
    return el.value || "";
  }

  function setError(form, name, msg) {
    var box = form.querySelector('[data-error-for="' + name + '"]');
    if (box) box.textContent = msg;
    var inputs = form.querySelectorAll('[name="' + name + '"]');
    inputs.forEach(function (i) {
      if (msg) i.setAttribute("aria-invalid", "true");
      else i.removeAttribute("aria-invalid");
    });
  }

  function validate(form) {
    var firstBad = null;
    Object.keys(RULES).forEach(function (name) {
      if (!form.querySelector('[name="' + name + '"]')) return;
      var msg = RULES[name](fieldValue(form, name));
      setError(form, name, msg);
      if (msg && !firstBad) firstBad = form.querySelector('[name="' + name + '"]');
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  function utm() {
    var out = {};
    try {
      var p = new URLSearchParams(location.search);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
        if (p.get(k)) out[k] = p.get(k);
      });
    } catch (e) { /* navegador antigo */ }
    return out;
  }

  function encode(data) {
    return Object.keys(data).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(data[k]);
    }).join("&");
  }

  function send(form, data) {
    if (CONFIG.leadEndpoint) {
      return fetch(CONFIG.leadEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data)
      }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); });
    }
    /* Netlify Forms: funciona automaticamente quando o site é publicado na Netlify */
    var payload = Object.assign({ "form-name": form.getAttribute("name") }, data);
    return fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encode(payload)
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); });
  }

  document.querySelectorAll("form[data-lead]").forEach(function (form) {
    var btn = form.querySelector('button[type="submit"]');
    var status = form.querySelector("[data-form-status]");
    var label = btn ? btn.innerHTML : "";

    form.querySelectorAll("input, select, textarea").forEach(function (el) {
      el.addEventListener("blur", function () {
        if (RULES[el.name] && el.value) setError(form, el.name, RULES[el.name](fieldValue(form, el.name)));
      });
      el.addEventListener("change", function () {
        if (RULES[el.name] && (el.type === "radio" || el.type === "checkbox")) setError(form, el.name, RULES[el.name](fieldValue(form, el.name)));
      });
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (status) { status.textContent = ""; status.className = "form-status"; }
      if (form.elements["bot-field"] && form.elements["bot-field"].value) return;
      if (!validate(form)) return;

      var data = {
        nome: fieldValue(form, "nome").trim(),
        escola: fieldValue(form, "escola").trim(),
        telefone: fieldValue(form, "telefone").trim(),
        email: fieldValue(form, "email").trim(),
        ingles: fieldValue(form, "ingles"),
        consentimento: fieldValue(form, "consentimento"),
        origem: form.getAttribute("data-lead"),
        pagina: location.pathname
      };
      if (form.elements["ano_formatura"]) data.ano_formatura = form.elements["ano_formatura"].value;
      if (form.elements["resultado_verificacao"]) data.resultado_verificacao = form.elements["resultado_verificacao"].value;
      Object.assign(data, utm());

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-circle-notch spin" aria-hidden="true"></i> Enviando'; }
      send(form, data).then(function () {
        var ok = form.parentElement.querySelector("[data-form-success]");
        var first = data.nome.split(/\s+/)[0];
        if (ok) {
          var nameSlot = ok.querySelector("[data-first-name]");
          if (nameSlot) nameSlot.textContent = first;
          var grupo = ok.querySelector("[data-grupo]");
          var grupoAviso = ok.querySelector("[data-grupo-aviso]");
          if (grupo && CONFIG.grupoWhatsapp) {
            grupo.href = CONFIG.grupoWhatsapp; grupo.hidden = false;
            if (grupoAviso) grupoAviso.hidden = true;
            var gt = ok.querySelector("[data-grupo-texto]");
            if (gt && gt.getAttribute("data-com-link")) gt.textContent = gt.getAttribute("data-com-link");
          }
          form.hidden = true;
          ok.hidden = false;
          ok.focus();
        }
        try { localStorage.removeItem("r2a-draft-" + form.getAttribute("data-lead")); } catch (e) { /* ok */ }
        if (typeof window.gtag === "function") window.gtag("event", "generate_lead", { form: data.origem });
        if (typeof window.fbq === "function") window.fbq("track", "Lead");
      }).catch(function () {
        if (status) {
          status.className = "form-status is-error";
          var fallback = CONFIG.whatsapp ? ' Se preferir, fale conosco pelo <a href="https://wa.me/' + CONFIG.whatsapp + '" target="_blank" rel="noopener">WhatsApp</a>.' : "";
          status.innerHTML = "Não conseguimos enviar agora. Verifique sua conexão e tente de novo." + fallback;
        }
      }).finally(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
      });
    });

    /* rascunho local, apenas por conveniência do próprio visitante */
    var key = "r2a-draft-" + form.getAttribute("data-lead");
    try {
      var draft = JSON.parse(localStorage.getItem(key) || "{}");
      ["nome", "escola", "telefone", "email"].forEach(function (n) {
        if (draft[n] && form.elements[n] && !form.elements[n].value) form.elements[n].value = draft[n];
      });
    } catch (e) { /* sem rascunho */ }
    form.addEventListener("input", function () {
      try {
        var d = {};
        ["nome", "escola", "telefone", "email"].forEach(function (n) { if (form.elements[n]) d[n] = form.elements[n].value; });
        localStorage.setItem(key, JSON.stringify(d));
      } catch (e) { /* ok */ }
    });
  });

  /* ---------- Empresa responsável no rodapé ---------- */
  var E = CONFIG.empresa || {};
  document.querySelectorAll("[data-empresa]").forEach(function (el) {
    var parts = [E.razao, E.cnpj ? "CNPJ " + E.cnpj : "", E.cidade, E.email].filter(Boolean);
    if (E.razao || E.cnpj) { el.textContent = parts.join(" · "); el.hidden = false; }
  });

  /* ---------- Ano no rodapé ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
