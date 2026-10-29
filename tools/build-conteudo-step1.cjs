#!/usr/bin/env node
/* Road to America | gera conteudo-step1.html a partir de tools/conteudo-step1-dados.txt
   Uso: node tools/build-conteudo-step1.cjs
   O HTML gerado é estático (funciona sem JavaScript); assets/js/conteudo.js
   acrescenta busca, filtros, recolhimento e marcação de estudo. */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(__dirname, "conteudo-step1-dados.txt");
const OUT = path.join(ROOT, "conteudo-step1.html");

const DISC = {
  pat: "Patologia", fis: "Fisiologia", nut: "Nutrição", ana: "Anatomia e embriologia",
  mic: "Microbiologia", far: "Farmacologia", com: "Ciências do comportamento",
  bio: "Bioquímica", his: "Histologia e biologia celular", imu: "Imunologia", gen: "Genética"
};
const DISC_ORDER = ["pat", "fis", "nut", "ana", "mic", "far", "com", "bio", "his", "imu", "gen"];

/* Faixas oficiais (usmle.org, Step 1 Exam Content; consulta em 28/10/2026) */
const SPEC_SYS = [
  { key: "dev", pt: "Desenvolvimento humano", en: "Human Development", min: 1, max: 3 },
  { key: "heme", pt: "Sangue, sistema linforreticular e sistema imune", en: "Blood & Lymphoreticular/Immune Systems", min: 9, max: 13 },
  { key: "neuro", pt: "Saúde comportamental, sistema nervoso e órgãos dos sentidos", en: "Behavioral Health & Nervous Systems/Special Senses", min: 10, max: 14 },
  { key: "msk", pt: "Musculoesquelético, pele e tecido subcutâneo", en: "Musculoskeletal, Skin & Subcutaneous Tissue", min: 8, max: 12 },
  { key: "cv", pt: "Cardiovascular", en: "Cardiovascular System", min: 7, max: 11 },
  { key: "resp", pt: "Respiratório, renal e urinário", en: "Respiratory & Renal/Urinary Systems", min: 11, max: 15 },
  { key: "gi", pt: "Gastrointestinal", en: "Gastrointestinal System", min: 6, max: 10 },
  { key: "repro", pt: "Reprodutor e endócrino", en: "Reproductive & Endocrine Systems", min: 12, max: 16, note: "inclui gestação, parto e puerpério, sistema reprodutor feminino e mama e sistema reprodutor masculino" },
  { key: "multi", pt: "Processos e distúrbios multissistêmicos", en: "Multisystem Processes & Disorders", min: 8, max: 12 },
  { key: "bioest", pt: "Bioestatística, epidemiologia e saúde populacional", en: "Biostatistics & Epidemiology/Population Health", min: 4, max: 6 },
  { key: "social", pt: "Ciências sociais: comunicação e habilidades interpessoais", en: "Social Sciences: Communication and Interpersonal Skills", min: 6, max: 9 }
];
const SPEC_DISC = [
  { pt: "Patologia", en: "Pathology", min: 45, max: 55 },
  { pt: "Fisiologia", en: "Physiology", min: 30, max: 40 },
  { pt: "Nutrição", en: "Nutrition", min: 15, max: 20, note: "linha nova, ligada ao reforço de nutrição de 2026; sobrepõe-se às outras disciplinas" },
  { pt: "Anatomia macroscópica e embriologia", en: "Gross Anatomy & Embryology", min: 10, max: 20 },
  { pt: "Microbiologia", en: "Microbiology", min: 10, max: 20 },
  { pt: "Farmacologia", en: "Pharmacology", min: 10, max: 20 },
  { pt: "Ciências do comportamento", en: "Behavioral Sciences", min: 10, max: 15 },
  { pt: "Bioquímica", en: "Biochemistry", min: 5, max: 15 },
  { pt: "Histologia e biologia celular", en: "Histology & Cell Biology", min: 5, max: 15 },
  { pt: "Imunologia", en: "Immunology", min: 5, max: 15 },
  { pt: "Genética", en: "Genetics", min: 5, max: 10 }
];
const SPEC_COMP = [
  { pt: "Conhecimento médico: aplicar conceitos de ciência fundamental", en: "Medical Knowledge: Applying Foundational Science Concepts", min: 60, max: 70 },
  { pt: "Cuidado ao paciente: diagnóstico", en: "Patient Care: Diagnosis", min: 20, max: 25, note: "anamnese, exame físico e diagnóstico" },
  { pt: "Comunicação e habilidades interpessoais", en: "Communication and Interpersonal Skills", min: 6, max: 9 },
  { pt: "Aprendizado e aprimoramento baseados na prática", en: "Practice-based Learning & Improvement", min: 4, max: 6 }
];
const SPEC_BY_KEY = Object.fromEntries(SPEC_SYS.map(s => [s.key, s]));

/* ---------- leitura dos dados ---------- */
function parse(txt) {
  const systems = [];
  let sys = null, cat = null;
  txt.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const fail = (m) => { throw new Error(`linha ${i + 1}: ${m}\n${raw}`); };
    if (line.startsWith("@sys ")) {
      const [id, pt, en, spec] = line.slice(5).split("|").map(s => s.trim());
      if (!id || !pt || !en || !spec) fail("@sys incompleto");
      sys = { id, pt, en, spec, intro: "", cats: [] }; systems.push(sys); cat = null; return;
    }
    if (!sys) fail("conteúdo fora de @sys");
    if (line.startsWith("% ")) { sys.intro = line.slice(2).trim(); return; }
    if (line.startsWith("@cat ")) {
      const [pt, en] = line.slice(5).split("|").map(s => s.trim());
      if (!pt || !en) fail("@cat incompleto");
      cat = { pt, en, official: [], topics: [] }; sys.cats.push(cat); return;
    }
    if (!cat) fail("conteúdo fora de @cat");
    if (line.startsWith("= ")) { cat.official.push(line.slice(2).trim()); return; }
    if (line.startsWith("- ")) {
      const m = line.slice(2).match(/^(.*?)\s*\{([a-z,]+)\}$/);
      if (!m) fail("tópico sem {disciplinas}");
      const disc = m[2].split(",");
      disc.forEach(d => { if (!DISC[d]) fail("disciplina desconhecida: " + d); });
      cat.topics.push({ text: m[1].trim(), disc }); return;
    }
    fail("linha não reconhecida");
  });
  return systems;
}

function hash(s) { /* djb2, base 36 */
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad = (n) => String(n).padStart(2, "0");

/* ---------- checagens de redação ---------- */
function lint(txt) {
  const bad = [];
  if (/[\u2013\u2014]/.test(txt)) bad.push("travessão ou meia-risca");
  ["jornada", "mergulh", "desbloque", "potencializ", "alavanc", "robust", "transformador", "vale ressaltar", "em suma", "no cenário atual"].forEach(w => {
    if (new RegExp(w, "i").test(txt)) bad.push("termo proibido: " + w);
  });
  return bad;
}

/* ---------- partes do HTML ---------- */
function bar(min, max, scale) {
  const l = (min / scale) * 100, w = ((max - min) / scale) * 100;
  return `<span class="range" aria-hidden="true"><span class="range__fill" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%"></span></span>`;
}
function specTable(id, caption, colLabel, rows, scale, scaleLabel) {
  const body = rows.map(r => `
            <tr>
              <th scope="row"><span class="spec__pt">${esc(r.pt)}</span> <span class="en">(${esc(r.en)})</span>${r.note ? `<span class="spec__note">${esc(r.note)}</span>` : ""}${bar(r.min, r.max, scale)}</th>
              <td class="spec__val mono">${r.min}-${r.max}%</td>
            </tr>`).join("");
  return `
        <figure class="spec" id="${id}">
          <figcaption class="spec__cap"><span class="spec__title">${esc(caption)}</span><span class="spec__scale mono">${esc(scaleLabel)}</span></figcaption>
          <table>
            <thead><tr><th scope="col">${esc(colLabel)}</th><th scope="col" class="spec__valh">Faixa oficial</th></tr></thead>
            <tbody>${body}
            </tbody>
          </table>
        </figure>`;
}

function specLine(sys) {
  if (sys.spec === "gp") return "Sem faixa própria desde 2024: os temas são cobrados dentro dos sistemas.";
  const s = SPEC_BY_KEY[sys.spec];
  if (!s) throw new Error("faixa desconhecida: " + sys.spec);
  const shared = {
    heme: "na linha que soma sangue, sistema linforreticular e sistema imune",
    neuro: "na linha que soma saúde comportamental, sistema nervoso e órgãos dos sentidos",
    msk: "na linha que soma sistema musculoesquelético, pele e tecido subcutâneo",
    resp: "na linha que soma sistema respiratório e sistema renal e urinário",
    repro: "na linha que soma os sistemas reprodutores, a gestação e o sistema endócrino"
  }[sys.spec];
  return `Faixa oficial: ${s.min}-${s.max}% das questões${shared ? ", " + shared : ""}.`;
}

function renderSystems(systems) {
  let topicCount = 0;
  const ids = new Set();
  const html = systems.map((sys, si) => {
    const nTopics = sys.cats.reduce((a, c) => a + c.topics.length, 0);
    const cats = sys.cats.map((cat, ci) => {
      const cid = `c-${sys.id}-${ci + 1}`;
      const items = cat.topics.map(t => {
        let id = sys.id + "-" + hash(sys.id + "|" + t.text);
        if (ids.has(id)) throw new Error("id repetido: " + t.text);
        ids.add(id); topicCount++;
        const chips = t.disc.map(d => `<span class="chip">${esc(DISC[d])}</span>`).join("");
        return `
              <li class="topic" data-id="${id}" data-disc="${t.disc.join(" ")}">
                <input type="checkbox" id="t-${id}" class="topic__box">
                <label for="t-${id}"><span class="topic__txt">${esc(t.text)}</span> <span class="chips"><span class="sr-only">Disciplinas: </span>${chips}</span></label>
              </li>`;
      }).join("");
      return `
          <div class="cat" data-cat>
            <h3 class="cat__h">
              <button class="cat__btn" type="button" aria-expanded="true" aria-controls="${cid}">
                <span class="cat__name">${esc(cat.pt)} <span class="en">(${esc(cat.en)})</span></span>
                <span class="cat__count mono" data-cat-count>${cat.topics.length} tópicos</span>
                <i class="ph ph-caret-right cat__caret" aria-hidden="true"></i>
              </button>
            </h3>
            <div class="cat__body" id="${cid}">
              <div class="official">
                <p class="label label--usmle">Outline USMLE <span class="label__sub">tradução adaptada da estrutura oficial</span></p>
                <ul>${cat.official.map(o => `<li>${esc(o)}</li>`).join("")}</ul>
              </div>
              <div class="extra">
                <p class="label label--r2a"><span class="fita" aria-hidden="true"></span>Complemento Road to America <span class="label__sub">tópicos de alto rendimento, fora do texto oficial</span></p>
                <ul class="topics">${items}
                </ul>
              </div>
            </div>
          </div>`;
    }).join("");
    return `
        <section class="sys" id="s-${sys.id}" data-sys="${sys.id}" aria-labelledby="h-${sys.id}">
          <header class="sys__head">
            <span class="exit" aria-hidden="true"><small>EXIT</small><b>${pad(si + 1)}</b></span>
            <div class="sys__meta">
              <h2 class="sys__title" id="h-${sys.id}">${esc(sys.pt)} <span class="en">(${esc(sys.en)})</span></h2>
              <p class="sys__spec mono">${esc(specLine(sys))}</p>
              <p class="sys__intro">${esc(sys.intro)}</p>
            </div>
            <div class="sys__prog" data-sys-prog>
              <p class="sys__prog-txt mono"><span data-done>0</span> de <span data-total>${nTopics}</span> estudados</p>
              <span class="meter" aria-hidden="true"><span class="meter__fill" data-meter></span></span>
            </div>
          </header>${cats}
        </section>`;
  }).join("");
  return { html, topicCount };
}

function renderToc(systems) {
  return systems.map((sys, si) => {
    const n = sys.cats.reduce((a, c) => a + c.topics.length, 0);
    return `
              <li><a href="#s-${sys.id}" data-toc="${sys.id}"><span class="toc__n mono">${pad(si + 1)}</span><span class="toc__name">${esc(sys.pt)}</span><span class="toc__count mono" data-toc-count>0/${n}</span></a></li>`;
  }).join("");
}

function page(systems) {
  const { html: sysHtml, topicCount } = renderSystems(systems);
  const catCount = systems.reduce((a, s) => a + s.cats.length, 0);
  const sysOptions = systems.map((s, i) => `<option value="${s.id}">${pad(i + 1)}. ${esc(s.pt)}</option>`).join("");
  const discOptions = DISC_ORDER.map(d => `<option value="${d}">${esc(DISC[d])}</option>`).join("");
  const SRC_CONTENT = "https://www.usmle.org/exam-resources/step-1-materials/step-1-content-outline-and-specifications";
  const SRC_FORMAT = "https://www.usmle.org/test-delivery-software-updates-step-2-ck-and-step-1-coming-may-2026";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Conteúdo do Step 1 | Road to America</title>
  <meta name="description" content="Todo o conteúdo do USMLE Step 1 segundo o Content Outline oficial, em português, com as faixas de questões por sistema, disciplina e competência e ${topicCount} tópicos de alto rendimento para marcar como estudados.">
  <meta name="theme-color" content="#0f2747">
  <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="assets/fonts/barlow-condensed-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="assets/fonts/barlow-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="assets/icons/icons.css">
  <link rel="stylesheet" href="assets/css/base.css">
  <link rel="stylesheet" href="assets/css/conteudo.css">
  <script>
    try { var t = localStorage.getItem("r2a-theme"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch (e) {}
  </script>
</head>
<body>
  <!-- Gerado por tools/build-conteudo-step1.cjs a partir de tools/conteudo-step1-dados.txt. Edite os dados e rode o script de novo. -->
  <a class="skip" href="#conteudo">Pular para o conteúdo</a>

  <header class="nav">
    <div class="wrap nav__inner">
      <a class="brand" href="index.html" aria-label="Road to America, página inicial">
        <svg class="brand__shield" viewBox="0 0 34 38" aria-hidden="true">
          <path d="M3 2.5h28c.9 3.4.9 6.6 0 9.3 2.6 7.6 1.4 15.3-5.4 20.7-3.6 2.8-6.6 3.9-8.6 4.6-2-.7-5-1.8-8.6-4.6C1.6 27.1.4 19.4 3 11.8c-.9-2.7-.9-5.9 0-9.3z" fill="#0f2747" stroke="#f3f5f2" stroke-width="1.6"/>
          <path d="M3.4 3.3h27.2c.6 2.6.6 5 0 7.2H3.4c-.6-2.2-.6-4.6 0-7.2z" fill="#b0243a"/>
          <text x="17" y="26" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="12.5" fill="#f3f5f2">R2A</text>
        </svg>
        <span class="brand__name">Road to <span>America</span></span>
      </a>
      <div class="c-nav__right">
        <a class="c-nav__link" href="#estrutura">Estrutura da prova</a>
        <a class="c-nav__link" href="#lista">Conteúdo</a>
        <a class="c-nav__link" href="anki/">Flashcards</a>
        <a class="c-nav__link" href="questoes/">Questões</a>
        <a class="c-nav__link" href="simulado/">Simulado</a>
        <button class="theme-btn" type="button" data-theme-toggle aria-label="Alternar tema claro e escuro"><i class="ph ph-circle-half" aria-hidden="true"></i></button>
      </div>
    </div>
  </header>

  <main id="conteudo">
    <section class="c-hero">
      <div class="wrap">
        <p class="eyebrow"><span class="fita" aria-hidden="true"></span>USMLE Step 1 · Content Outline</p>
        <h1 class="display h1 c-hero__title">Tudo o que cai no <em>Step 1</em></h1>
        <p class="lead">Os sistemas, as categorias e os temas do Content Outline oficial do Step 1, em tradução adaptada para o português. Os termos em inglês entre parênteses são os usados nos documentos do USMLE e no relatório de desempenho. Embaixo de cada categoria há uma lista de tópicos de alto rendimento escolhidos pela equipe da Road to America, identificada como complemento.</p>
        <ul class="c-hero__meta mono">
          <li><i class="ph ph-book-open-text" aria-hidden="true"></i>${systems.length} sistemas e blocos</li>
          <li><i class="ph ph-list" aria-hidden="true"></i>${catCount} categorias do outline</li>
          <li><i class="ph ph-check-square-offset" aria-hidden="true"></i>${topicCount} tópicos para marcar</li>
        </ul>
        <div class="c-hero__actions">
          <a class="btn" href="#lista">Ver o conteúdo <i class="ph ph-arrow-down" aria-hidden="true"></i></a>
          <a class="btn btn--ghost" href="materiais/conteudo-step1.pdf" download>Baixar PDF <i class="ph ph-download-simple" aria-hidden="true"></i></a>
        </div>

        <div class="c-signs" aria-label="Formato da prova">
          <div class="c-sign">
            <span class="c-sign__value">280</span>
            <p class="c-sign__label">questões no máximo, em um único dia de 8 horas.</p>
          </div>
          <div class="c-sign">
            <span class="c-sign__value">14</span>
            <p class="c-sign__label">blocos de 30 minutos com até 20 questões cada, nas provas a partir de 14/05/2026.</p>
          </div>
          <div class="c-sign">
            <span class="c-sign__value">90 s</span>
            <p class="c-sign__label">por questão, em média. Não é possível voltar a um bloco já encerrado.</p>
          </div>
          <div class="c-sign c-sign--red">
            <span class="c-sign__value">P/F</span>
            <p class="c-sign__label">Resultado só aprovado ou reprovado (Pass/Fail) desde 26/01/2022.</p>
          </div>
        </div>
        <p class="c-src mono">Fontes: <a href="${SRC_FORMAT}" target="_blank" rel="noopener">USMLE, mudanças de maio de 2026</a> · <a href="https://www.usmle.org/step-exams/step-1" target="_blank" rel="noopener">USMLE, Step 1</a> · <a href="https://www.usmle.org/step-1-passfail-score-reporting-implementation-date" target="_blank" rel="noopener">USMLE, Pass/Fail</a></p>
      </div>
    </section>

    <section class="section section--tint c-spec" id="estrutura" aria-labelledby="h-estrutura">
      <div class="wrap">
        <p class="eyebrow"><span class="fita" aria-hidden="true"></span>Como a prova é montada</p>
        <h2 class="display h2" id="h-estrutura">Três classificações para cada questão</h2>
        <div class="c-spec__intro body">
          <p>O USMLE classifica cada questão do Step 1 de três formas ao mesmo tempo: pelo sistema do corpo, pela disciplina e pela competência do médico que ela avalia. Para cada classificação, publica a faixa de questões que a prova traz. Uma questão sobre o mecanismo de ação da metformina, por exemplo, conta em Reprodutor e endócrino, em Farmacologia e em Conhecimento médico.</p>
          <p>Em 29 de janeiro de 2024, a categoria General Principles of Foundational Science deixou de existir como linha própria e surgiu a categoria Human Development. Os temas de ciência básica passaram a ser cobrados dentro dos sistemas, e o USMLE informa que o peso desse conteúdo não mudou. Relatórios de nota de 2021 e 2022 ainda mostram General Principles com 12-16%, faixa que não vale mais.</p>
        </div>
        <div class="c-spec__grid">${specTable("tab-sistemas", "Por sistema (System)", "Sistema", SPEC_SYS, 20, "escala 0 a 20%")}${specTable("tab-disciplinas", "Por disciplina (Discipline)", "Disciplina", SPEC_DISC, 60, "escala 0 a 60%")}${specTable("tab-competencias", "Por competência (Physician Task/Competency)", "Competência", SPEC_COMP, 80, "escala 0 a 80%")}
        </div>
        <div class="c-spec__notes">
          <p><i class="ph ph-info" aria-hidden="true"></i>A soma das disciplinas passa de 100% porque muitas questões recebem mais de uma disciplina. O USMLE avisa que as faixas podem mudar a qualquer momento. Consulta feita em 28/10/2026.</p>
          <p class="mono">Fontes: <a href="${SRC_CONTENT}" target="_blank" rel="noopener">USMLE, Step 1 Content Outline and Specifications</a> · <a href="https://www.usmle.org/usmle-program-updates-content-outlines-all-step-exams" target="_blank" rel="noopener">USMLE, atualização dos outlines (2024)</a> · <a href="https://www.usmle.org/enhancements-nutrition-content-usmle-step-exams-coming-june-2026" target="_blank" rel="noopener">USMLE, reforço de nutrição (2026)</a></p>
        </div>
      </div>
    </section>

    <section class="section c-list" id="lista" aria-labelledby="h-lista">
      <div class="wrap">
        <p class="eyebrow"><span class="fita" aria-hidden="true"></span>O conteúdo, sistema por sistema</p>
        <h2 class="display h2" id="h-lista">Lista completa do Step 1</h2>
        <div class="legend">
          <div class="legend__item legend__item--usmle">
            <p class="label label--usmle">Outline USMLE</p>
            <p>Tradução adaptada e resumida das categorias e subcategorias do Content Outline. A redação oficial em inglês está no <a href="${SRC_CONTENT}" target="_blank" rel="noopener">documento do USMLE</a>, que prevalece em caso de diferença.</p>
          </div>
          <div class="legend__item legend__item--r2a">
            <p class="label label--r2a"><span class="fita" aria-hidden="true"></span>Complemento Road to America</p>
            <p>Doenças, mecanismos, fármacos, microrganismos e genes que costumam aparecer nas questões. Marque cada tópico quando terminar de estudar; o progresso fica salvo neste navegador.</p>
          </div>
        </div>

        <div class="c-layout">
          <div class="toc" role="region" aria-labelledby="h-toc">
            <div class="toc__inner">
              <div class="toc__top">
                <h2 class="toc__title" id="h-toc">Seu progresso</h2>
                <button class="toc__toggle" type="button" aria-expanded="true" aria-controls="toc-list" data-toc-toggle hidden><span data-toc-toggle-label>Ver sistemas</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
              </div>
              <p class="toc__total mono"><span data-total-done>0</span> de ${topicCount} tópicos estudados · <span data-total-pct>0</span>%</p>
              <span class="meter meter--lg" aria-hidden="true"><span class="meter__fill" data-total-meter></span></span>
              <nav aria-label="Sistemas">
                <ol class="toc__list" id="toc-list">${renderToc(systems)}
                </ol>
              </nav>
              <button class="toc__reset" type="button" data-reset>Desmarcar todos os tópicos</button>
            </div>
          </div>

          <div class="c-main">
            <div class="tools" role="search" aria-label="Buscar e filtrar tópicos">
              <div class="tools__search">
                <label class="sr-only" for="q">Buscar no conteúdo</label>
                <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
                <input class="input tools__input" id="q" type="search" placeholder="Buscar: doença, fármaco, gene, microrganismo" autocomplete="off" spellcheck="false">
              </div>
              <div class="tools__row">
                <div class="tools__field">
                  <label for="f-sys">Sistema</label>
                  <select class="input tools__select" id="f-sys"><option value="">Todos os sistemas</option>${sysOptions}</select>
                </div>
                <div class="tools__field">
                  <label for="f-disc">Disciplina</label>
                  <select class="input tools__select" id="f-disc"><option value="">Todas as disciplinas</option>${discOptions}</select>
                </div>
                <div class="tools__field">
                  <label for="f-status">Situação</label>
                  <select class="input tools__select" id="f-status"><option value="">Todos os tópicos</option><option value="pend">Ainda não estudados</option><option value="done">Já estudados</option></select>
                </div>
              </div>
              <div class="tools__actions">
                <button class="btn btn--ghost btn--sm" type="button" data-expand="1">Abrir todas as categorias</button>
                <button class="btn btn--ghost btn--sm" type="button" data-expand="0">Fechar todas</button>
                <button class="btn btn--ghost btn--sm" type="button" data-clear hidden>Limpar busca e filtros</button>
                <a class="btn btn--sm" href="materiais/conteudo-step1.pdf" download><i class="ph ph-download-simple" aria-hidden="true"></i> Baixar PDF</a>
              </div>
              <p class="tools__status mono" data-status role="status" aria-live="polite"></p>
            </div>

            <p class="c-empty" data-empty hidden>Nenhum tópico corresponde à busca e aos filtros escolhidos.</p>
${sysHtml}
          </div>
        </div>
      </div>
    </section>

    <section class="section section--tint c-end" aria-labelledby="h-fim">
      <div class="wrap c-end__inner">
        <h2 class="display h3" id="h-fim">Como usar esta lista</h2>
        <ul class="c-end__list">
          <li>Comece pelos sistemas de faixa mais alta e volte aos de faixa baixa perto da prova.</li>
          <li>Use o filtro de disciplina para revisar um eixo inteiro, como toda a Farmacologia, depois de estudar os sistemas.</li>
          <li>As marcações ficam guardadas só neste navegador. Em outro aparelho, a lista começa vazia.</li>
          <li>O PDF traz a mesma lista, com caixas para marcar à mão.</li>
        </ul>
        <p class="c-end__legal">USMLE® é programa conjunto da Federation of State Medical Boards (FSMB) e do National Board of Medical Examiners (NBME). A Road to America não tem vínculo com essas instituições. As faixas e a estrutura do outline seguem as páginas oficiais citadas, consultadas em 28/10/2026; os tópicos do complemento são material didático da Road to America.</p>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="wrap">
      <div class="footer__legal" style="margin-top:0;padding-top:0;border-top:0">
        <p style="margin:0"><a href="index.html">Página inicial</a> · <a href="anki/">Área do aluno: flashcards</a> · <a href="questoes/">Banco de questões</a> · <a href="simulado/">Simulado de 30 minutos</a> · <a href="simulado/#/completos">Simulados</a> · <a href="garantia.html">Termo da Garantia</a> · <a href="privacidade.html">Política de Privacidade</a></p>
        <p style="margin:0" data-empresa hidden></p>
        <p style="margin:0">© <span data-year>2026</span> Road to America.</p>
      </div>
    </div>
  </footer>

  <script src="assets/js/config.js"></script>
  <script src="assets/js/main.js"></script>
  <script src="assets/js/conteudo.js"></script>
</body>
</html>
`;
}

const txt = fs.readFileSync(SRC, "utf8");
const problems = lint(txt);
if (problems.length) { console.error("Problemas de redação nos dados:", problems.join("; ")); process.exit(1); }
const systems = parse(txt);
const out = page(systems);
const problemsOut = lint(out.replace(/robust/gi, ""));
if (/[\u2013\u2014]/.test(out)) { console.error("O HTML gerado contém travessão."); process.exit(1); }
fs.writeFileSync(OUT, out);
const topics = systems.reduce((a, s) => a + s.cats.reduce((b, c) => b + c.topics.length, 0), 0);
const cats = systems.reduce((a, s) => a + s.cats.length, 0);
console.log(`ok: ${systems.length} sistemas, ${cats} categorias, ${topics} tópicos -> ${path.relative(ROOT, OUT)}`);
systems.forEach(s => console.log("  " + s.id.padEnd(14) + s.cats.reduce((b, c) => b + c.topics.length, 0)));
if (problemsOut.length) console.warn("aviso:", problemsOut.join("; "));
