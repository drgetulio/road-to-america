/* Road to America | página "Conteúdo do Step 1"
   Busca, filtros, categorias recolhíveis e marcação de tópicos estudados.
   As marcações ficam no localStorage deste navegador (se disponível). */
(function () {
  "use strict";

  var KEY = "r2a-step1-estudados-v1";
  var state = load();

  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* armazenamento indisponível: a página segue funcionando */ }
  }

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- normalização para busca sem acento ---------- */
  function fold(ch) {
    var f = ch;
    try { f = ch.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* navegador antigo */ }
    f = (f || ch).toLowerCase();
    return f.charAt(0) || " ";
  }
  function foldStr(s) { var out = ""; for (var i = 0; i < s.length; i++) out += fold(s.charAt(i)); return out; }
  function escHtml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ---------- índice ---------- */
  var systems = $$(".sys").map(function (el) {
    var title = $(".sys__title", el).textContent;
    return { el: el, id: el.getAttribute("data-sys"), norm: foldStr(title), cats: [], topics: [],
      done: $("[data-done]", el), meter: $("[data-meter]", el),
      toc: $('[data-toc="' + el.getAttribute("data-sys") + '"]') };
  });
  var allCats = [];
  var allTopics = [];
  systems.forEach(function (s) {
    $$("[data-cat]", s.el).forEach(function (cel) {
      var btn = $(".cat__btn", cel);
      var body = $(".cat__body", cel);
      var ctx = foldStr($(".cat__name", cel).textContent + " " + $(".official", cel).textContent);
      var c = { el: cel, btn: btn, body: body, norm: s.norm + " " + ctx, sys: s, topics: [], count: $("[data-cat-count]", cel), userOpen: false };
      $$(".topic", cel).forEach(function (tel) {
        var txt = $(".topic__txt", tel);
        var t = { el: tel, id: tel.getAttribute("data-id"), txt: txt, raw: txt.textContent, box: $("input", tel),
          disc: (tel.getAttribute("data-disc") || "").split(" "), cat: c, sys: s };
        t.norm = foldStr(t.raw);
        c.topics.push(t); s.topics.push(t); allTopics.push(t);
      });
      s.cats.push(c); allCats.push(c);
    });
  });
  if (!allTopics.length) return;

  /* ---------- abrir e fechar categorias ---------- */
  function setOpen(c, open) {
    c.btn.setAttribute("aria-expanded", open ? "true" : "false");
    c.body.hidden = !open;
  }
  allCats.forEach(function (c) {
    setOpen(c, false);
    c.btn.addEventListener("click", function () {
      var open = c.btn.getAttribute("aria-expanded") !== "true";
      setOpen(c, open);
      if (!filtering()) c.userOpen = open;
    });
  });
  $$("[data-expand]").forEach(function (b) {
    b.addEventListener("click", function () {
      var open = b.getAttribute("data-expand") === "1";
      allCats.forEach(function (c) {
        if (c.el.classList.contains("is-off")) return;
        setOpen(c, open);
        if (!filtering()) c.userOpen = open;
      });
    });
  });

  /* ---------- progresso ---------- */
  var totalDone = $("[data-total-done]");
  var totalPct = $("[data-total-pct]");
  var totalMeter = $("[data-total-meter]");

  function refreshProgress() {
    var all = 0;
    systems.forEach(function (s) {
      var d = 0;
      s.cats.forEach(function (c) {
        var cd = 0;
        c.topics.forEach(function (t) { if (state[t.id]) cd++; });
        d += cd;
        c.count.textContent = cd + "/" + c.topics.length;
        c.el.classList.toggle("is-complete", cd === c.topics.length);
      });
      all += d;
      var n = s.topics.length;
      if (s.done) s.done.textContent = d;
      if (s.meter) s.meter.style.width = (n ? (d / n) * 100 : 0) + "%";
      s.el.classList.toggle("is-complete", d === n);
      if (s.toc) {
        var tc = $("[data-toc-count]", s.toc);
        if (tc) tc.textContent = d + "/" + n;
        s.toc.classList.toggle("is-complete", d === n);
        s.toc.setAttribute("aria-label", $(".toc__name", s.toc).textContent + ", " + d + " de " + n + " tópicos estudados");
      }
    });
    var pct = Math.round((all / allTopics.length) * 100);
    if (totalDone) totalDone.textContent = all;
    if (totalPct) totalPct.textContent = pct;
    if (totalMeter) totalMeter.style.width = (all / allTopics.length) * 100 + "%";
  }

  allTopics.forEach(function (t) {
    t.box.checked = !!state[t.id];
    t.el.classList.toggle("is-done", t.box.checked);
    t.box.addEventListener("change", function () {
      if (t.box.checked) state[t.id] = 1; else delete state[t.id];
      t.el.classList.toggle("is-done", t.box.checked);
      save();
      refreshProgress();
    });
  });
  /* remove marcações de tópicos que não existem mais */
  var known = {};
  allTopics.forEach(function (t) { known[t.id] = 1; });
  Object.keys(state).forEach(function (k) { if (!known[k]) delete state[k]; });
  refreshProgress();

  var reset = $("[data-reset]");
  if (reset) reset.addEventListener("click", function () {
    if (!window.confirm("Desmarcar todos os tópicos estudados? Esta ação não pode ser desfeita.")) return;
    state = {};
    save();
    allTopics.forEach(function (t) { t.box.checked = false; t.el.classList.remove("is-done"); });
    refreshProgress();
    if (fStatus && fStatus.value) apply();
  });

  /* ---------- busca e filtros ---------- */
  var q = $("#q"), fSys = $("#f-sys"), fDisc = $("#f-disc"), fStatus = $("#f-status");
  var statusEl = $("[data-status]"), emptyEl = $("[data-empty]"), clearBtn = $("[data-clear]");
  var lastWords = [];

  function words() {
    return foldStr((q && q.value) || "").split(/\s+/).filter(function (w) { return w.length > 0; });
  }
  function filtering() {
    return !!(words().length || (fSys && fSys.value) || (fDisc && fDisc.value) || (fStatus && fStatus.value));
  }

  function highlight(t, ws) {
    if (!ws.length) { if (t.marked) { t.txt.textContent = t.raw; t.marked = false; } return; }
    var flags = new Array(t.raw.length);
    var any = false;
    ws.forEach(function (w) {
      var from = 0, i;
      while ((i = t.norm.indexOf(w, from)) !== -1) {
        for (var k = i; k < i + w.length; k++) flags[k] = true;
        any = true;
        from = i + w.length;
      }
    });
    if (!any) { if (t.marked) { t.txt.textContent = t.raw; t.marked = false; } return; }
    var html = "", open = false;
    for (var j = 0; j < t.raw.length; j++) {
      if (flags[j] && !open) { html += "<mark>"; open = true; }
      if (!flags[j] && open) { html += "</mark>"; open = false; }
      html += escHtml(t.raw.charAt(j));
    }
    if (open) html += "</mark>";
    t.txt.innerHTML = html;
    t.marked = true;
  }

  function apply() {
    var ws = words();
    var sysV = fSys ? fSys.value : "";
    var discV = fDisc ? fDisc.value : "";
    var stV = fStatus ? fStatus.value : "";
    var active = !!(ws.length || sysV || discV || stV);
    var nTopics = 0, nSys = 0;

    systems.forEach(function (s) {
      var sysOk = !sysV || s.id === sysV;
      var sysVisible = false;
      s.cats.forEach(function (c) {
        var catVisible = false;
        c.topics.forEach(function (t) {
          var ok = sysOk;
          if (ok && discV) ok = t.disc.indexOf(discV) !== -1;
          if (ok && stV) ok = stV === "done" ? !!state[t.id] : !state[t.id];
          if (ok && ws.length) {
            for (var i = 0; i < ws.length; i++) {
              if (t.norm.indexOf(ws[i]) === -1 && c.norm.indexOf(ws[i]) === -1) { ok = false; break; }
            }
          }
          t.el.classList.toggle("is-off", !ok);
          highlight(t, ok ? ws : []);
          if (ok) { catVisible = true; nTopics++; }
        });
        c.el.classList.toggle("is-off", !catVisible);
        if (active) setOpen(c, catVisible);
        else setOpen(c, c.userOpen);
        if (catVisible) sysVisible = true;
      });
      s.el.classList.toggle("is-off", !sysVisible);
      if (s.toc) s.toc.classList.toggle("is-off", !sysVisible);
      if (sysVisible) nSys++;
    });

    if (emptyEl) emptyEl.hidden = nTopics > 0;
    if (clearBtn) clearBtn.hidden = !active;
    if (statusEl) {
      statusEl.textContent = active
        ? (nTopics ? nTopics + (nTopics === 1 ? " tópico" : " tópicos") + " em " + nSys + (nSys === 1 ? " sistema" : " sistemas") : "Nenhum tópico encontrado")
        : allTopics.length + " tópicos em " + systems.length + " sistemas";
    }
    lastWords = ws;
  }

  var timer = null;
  if (q) q.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(apply, 160); });
  [fSys, fDisc, fStatus].forEach(function (el) { if (el) el.addEventListener("change", apply); });
  if (clearBtn) clearBtn.addEventListener("click", function () {
    if (q) q.value = "";
    if (fSys) fSys.value = "";
    if (fDisc) fDisc.value = "";
    if (fStatus) fStatus.value = "";
    apply();
    if (q) q.focus();
  });
  apply();

  /* ---------- sumário: recolhível em telas estreitas, destaque do sistema atual ---------- */
  var tocToggle = $("[data-toc-toggle]");
  var tocList = $("#toc-list");
  var tocLabel = $("[data-toc-toggle-label]");
  var mq = window.matchMedia ? window.matchMedia("(max-width: 1099px)") : null;
  function setToc(open) {
    if (!tocToggle || !tocList) return;
    tocToggle.setAttribute("aria-expanded", open ? "true" : "false");
    tocList.hidden = !open;
    if (tocLabel) tocLabel.textContent = open ? "Ocultar sistemas" : "Ver sistemas";
  }
  function syncToc() {
    if (!tocToggle || !tocList) return;
    var narrow = mq && mq.matches;
    tocToggle.hidden = !narrow;
    setToc(!narrow);
  }
  if (tocToggle) tocToggle.addEventListener("click", function () { setToc(tocToggle.getAttribute("aria-expanded") !== "true"); });
  syncToc();
  if (mq) {
    if (mq.addEventListener) mq.addEventListener("change", syncToc);
    else if (mq.addListener) mq.addListener(syncToc);
  }
  $$("[data-toc]").forEach(function (a) {
    a.addEventListener("click", function () { if (mq && mq.matches) setToc(false); });
  });

  if ("IntersectionObserver" in window) {
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var s = systems.filter(function (x) { return x.el === en.target; })[0];
        if (!s || !s.toc) return;
        if (current) { current.classList.remove("is-current"); current.removeAttribute("aria-current"); }
        current = s.toc;
        current.classList.add("is-current");
        current.setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    systems.forEach(function (s) { io.observe(s.el); });
  }

  /* ---------- impressão: tudo aberto e sem filtros ---------- */
  var saved = null;
  function preparePrint() {
    if (saved) return;
    saved = { q: q ? q.value : "", sys: fSys ? fSys.value : "", disc: fDisc ? fDisc.value : "", st: fStatus ? fStatus.value : "",
      open: allCats.map(function (c) { return c.btn.getAttribute("aria-expanded") === "true"; }) };
    if (q) q.value = "";
    if (fSys) fSys.value = "";
    if (fDisc) fDisc.value = "";
    if (fStatus) fStatus.value = "";
    apply();
    allCats.forEach(function (c) { setOpen(c, true); });
  }
  function restorePrint() {
    if (!saved) return;
    var s = saved; saved = null;
    if (q) q.value = s.q;
    if (fSys) fSys.value = s.sys;
    if (fDisc) fDisc.value = s.disc;
    if (fStatus) fStatus.value = s.st;
    apply();
    if (!filtering()) allCats.forEach(function (c, i) { setOpen(c, s.open[i]); });
  }
  window.addEventListener("beforeprint", preparePrint);
  window.addEventListener("afterprint", restorePrint);
  window.R2A_conteudoPrint = preparePrint;
})();
