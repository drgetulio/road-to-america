/* Road to America | percurso do produto inteiro no modo demonstração (Playwright).
   Um navegador e um armazenamento local do começo ao fim, com o banco completo
   substituído por itens sintéticos (plataforma/tests/sintetico.mjs) servidos no lugar de
   banco-privado/ (que fica fora do git), para que o Step 1 saia no tamanho oficial.
   1. Site: o rodapé leva ao banco de questões e aos simulados.
   2. Banco: o aluno monta um bloco personalizado pelo formulário (Step 1, dois
      sistemas, não vistas, cronometrado, 10 itens), responde parte e encerra.
   3. Simulado completo do Step 1: bloco 1, pausa com saldo, bloco 2 até o tempo
      acabar, parar no intervalo; "Meu progresso" mostra o dia parado e leva de volta;
      retomar, blocos 3 a 14 pelo tempo (relógio acelerado) e relatório.
   4. A probabilidade de aprovação é a mesma no banco, em "Meu progresso" e na página
      dos simulados completos, com os 290 itens respondidos.
   5. Administrador: análise de itens com as respostas do aluno, ficha do item, ficha
      do participante com a mesma probabilidade e o simulado completo, e o relatório
      aberto pela equipe com os dados do participante.
   6. Navegação: as cinco áreas apontam para o banco e para os simulados; links
      internos respondem; axe-core (WCAG 2.1 A e AA) e sem rolagem horizontal nas
      telas mudadas, em 1440 e 390 px, nos dois temas; nenhum erro de console.
   Uso, na raiz:  AXE_PATH=.../axe.min.js node plataforma/tests/produto.e2e.mjs [pasta-das-capturas]
   Requer playwright (global, local ou PLAYWRIGHT_MODULE) e axe-core (AXE_PATH ou AXE_CORE). */
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { gerarBancoSintetico } from "./sintetico.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const saida = resolve(process.argv[2] || join(tmpdir(), "r2a-produto-capturas"));
await mkdir(saida, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
  try { playwright = require(c); break; } catch { /* próximo */ }
}
if (!playwright) { console.error("Playwright não encontrado. Instale com npm i -g playwright ou defina PLAYWRIGHT_MODULE."); process.exit(2); }
let axeFonte = null;
for (const c of [process.env.AXE_PATH, process.env.AXE_CORE].filter(Boolean)) if (existsSync(c)) { axeFonte = await readFile(c, "utf8"); break; }
if (!axeFonte) { try { axeFonte = await readFile(require.resolve("axe-core/axe.min.js"), "utf8"); } catch { /* sem axe */ } }
if (!axeFonte) { console.error("axe-core não encontrado. Defina AXE_PATH com o caminho de axe.min.js."); process.exit(2); }

/* banco sintético servido como banco-privado/ */
const sint = gerarBancoSintetico({ porStep: 620, semente: 2026 });
const VIRTUAIS = {
  "/banco-privado/manifest.json": JSON.stringify({ arquivos: ["sint-step1.json", "sint-step2ck.json"] }),
  "/banco-privado/sint-step1.json": JSON.stringify(sint.filter((q) => q.step === "step1")),
  "/banco-privado/sint-step2ck.json": JSON.stringify(sint.filter((q) => q.step === "step2ck"))
};
/* o banco de demonstração junta os sintéticos aos 80 itens públicos de simulado/data/ */
const publicos = [];
for (const f of ["step1-questoes.json", "step2ck-questoes.json"]) publicos.push(...JSON.parse(await readFile(join(raiz, "simulado", "data", f), "utf8")));
const porId = new Map([...sint, ...publicos].map((q) => [q.id, q]));

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };
const servidor = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (VIRTUAIS[p]) { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(VIRTUAIS[p]); return; }
    if (p.startsWith("/banco-privado/")) { res.writeHead(404).end(); return; }
    if (p.endsWith("/")) p += "index.html";
    const arq = join(raiz, p);
    if (!arq.startsWith(raiz)) { res.writeHead(403).end(); return; }
    const dados = await readFile(arq);
    res.writeHead(200, { "content-type": TIPOS[extname(arq)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(dados);
  } catch { res.writeHead(404).end("não encontrado"); }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + servidor.address().port;

const navegador = await playwright.chromium.launch();
const resultados = [];
async function etapa(nome, fn) {
  try { await fn(); resultados.push(["ok", nome]); console.log("OK     " + nome); }
  catch (e) { resultados.push(["falhou", nome, e.message]); console.log("FALHOU " + nome + "\n       " + String(e.message).split("\n").join("\n       ")); }
}

const MIN = 60000;
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", locale: "pt-BR", reducedMotion: "reduce" });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem("__ini")) return;
  sessionStorage.setItem("__ini", "1");
  if (!localStorage.getItem("r2a-anki-demo-v1")) localStorage.setItem("r2a-anki-demo-v1", JSON.stringify({ papel: "participante" }));
  localStorage.setItem("r2a-questoes-prefs-v1", JSON.stringify({ banner: true }));
  localStorage.setItem("r2a-anki-banner", "1");
});
const page = await ctx.newPage();
const erros = [];
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on("pageerror", (e) => erros.push(e.message));
page.on("dialog", (d) => d.accept());
await page.clock.install({ time: new Date("2026-10-29T11:00:00Z") });

const demo = () => page.evaluate(() => JSON.parse(localStorage.getItem("r2a-anki-demo-v1") || "{}"));
let nFoto = 0;
const foto = (nome, fullPage = true) => page.screenshot({ path: join(saida, String(++nFoto).padStart(2, "0") + "-" + nome + ".png"), fullPage });
const seg = (t) => t.trim().split(":").map(Number).reduce((a, x) => a * 60 + x, 0);
const perto = (txt, esperado, nome) => assert.ok(Math.abs(seg(txt) - seg(esperado)) <= 20, nome + ": " + txt + " (esperado perto de " + esperado + ")");
const confirmarDia = async () => { await page.locator(".modal[open] .modal__foot button").last().click(); };
/* texto da probabilidade, sem espaços nas pontas: "37%", "< 1%", "> 99%" ou "89,7%" */
const pTxt = async (loc) => {
  const t = (await loc.innerText()).trim();
  assert.match(t, /^(< 1%|> 99%|\d{1,2}(,\d)?%)$/, "formato único da probabilidade: " + t);
  return t;
};
const violacoes = [];
async function conferir(nome) {
  const tema = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  for (const t of ["light", "dark"]) {
    await page.evaluate((x) => document.documentElement.setAttribute("data-theme", x), t);
    await page.waitForTimeout(350);
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axeFonte });
    const r = await page.evaluate(async () => {
      const x = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
      return x.violations.map((v) => v.id + ": " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | "));
    });
    for (const v of r) violacoes.push(nome + " [" + t + "] " + v);
    const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    if (w.s > w.c + 1) violacoes.push(nome + " [" + t + "] rolagem horizontal: " + w.s + " > " + w.c);
  }
  await page.evaluate((x) => { if (x) document.documentElement.setAttribute("data-theme", x); else document.documentElement.removeAttribute("data-theme"); }, tema);
}

/* ---------------- 1. site ---------------- */
await etapa("1. rodapé do site leva ao banco de questões e aos simulados", async () => {
  await page.goto(base + "/index.html");
  const rodape = page.locator("footer");
  assert.equal(await rodape.getByRole("link", { name: "Banco de questões", exact: true }).getAttribute("href"), "questoes/");
  assert.equal(await rodape.getByRole("link", { name: "Simulados", exact: true }).getAttribute("href"), "simulado/#/completos");
  assert.equal(await rodape.getByRole("link", { name: "Simulado de 30 minutos" }).getAttribute("href"), "simulado/", "o link antigo continua");
  await rodape.getByRole("link", { name: "Simulados", exact: true }).click();
  await page.getByRole("heading", { name: /O dia da prova/ }).waitFor();
  await page.goto(base + "/index.html");
  await page.locator("footer").getByRole("link", { name: "Banco de questões", exact: true }).click();
  await page.getByRole("heading", { name: "Banco de questões", level: 1 }).waitFor();
});

/* ---------------- 2. banco: bloco personalizado ---------------- */
const SISTEMAS = ["cardiovascular", "respiratorio_renal"];
let blocoBanco = null;
await etapa("2. banco: bloco personalizado pelo formulário (Step 1, dois sistemas, não vistas, cronometrado, 10 itens)", async () => {
  /* o banco completo de demonstração vale para todas as páginas deste navegador */
  await page.goto(base + "/questoes/?banco=completo#/criar");
  await page.locator("[data-criar]").waitFor();
  await page.locator('input[name="step"][value="step1"]').check({ force: true });
  await page.locator('[data-limpar="sistema"]').click();
  for (const s of SISTEMAS) await page.locator('input[name="sistema"][value="' + s + '"]').check({ force: true });
  await page.locator('input[name="situacao"][value="nao_vistas"]').check({ force: true });
  await page.locator('input[name="modo"][value="cronometrado"]').check({ force: true });
  await page.locator("#cr-qtd").fill("10");
  await page.locator("#cr-qtd").dispatchEvent("input");
  await page.locator("[data-resumo]").filter({ hasText: /\d/ }).waitFor();
  await foto("banco-criar");
  await page.getByRole("button", { name: "Começar bloco" }).click();
  await page.locator("[data-prova]").waitFor();
  assert.equal(await page.locator("[data-t]").innerText(), "15:00", "10 itens x 90 s");
  assert.equal(await page.locator("[data-ir]").count(), 10);
  for (let i = 0; i < 6; i++) { await page.keyboard.press(String((i % 5) + 1)); await page.keyboard.press("n"); }
  await page.clock.fastForward(4 * MIN);
  await page.locator("[data-fim]").click();
  await page.locator(".modal [data-acao='1']").click();
  await page.locator(".embarque").waitFor({ timeout: 10000 });
  const r = ((await demo()).respostas || []).filter((x) => x.origem === "banco");
  assert.equal(r.length, 10, "dez linhas do banco");
  assert.ok(r.every((x) => x.modo === "cronometrado" && x.step === "step1"), "modo e Step");
  assert.ok(r.every((x) => SISTEMAS.includes(porId.get(x.questao_id)?.sistema)), "todos os itens nos dois sistemas escolhidos");
  assert.equal(r.filter((x) => x.resposta !== null).length, 6, "seis respondidas, quatro em branco");
  blocoBanco = r.map((x) => x.questao_id);
  await foto("banco-resultado");
});

/* ---------------- 3. simulado completo do Step 1 ---------------- */
let idDia = null;
let relatorio = null;
await etapa("3a. Step 1 completo, personalizado: 14 blocos e 280 itens, bloco 1 e pausa com saldo", async () => {
  await page.goto(base + "/simulado/#/completos");
  await page.locator("[data-iniciar]").waitFor();
  await page.locator('label.passe:has(input[value="step1"])').first().click();
  await page.locator('label.passe:has(input[value="completo"])').click();
  await page.locator('label.opcao:has(input[value="personalizado"])').click();
  assert.match(await page.locator("[data-resumo-inicio]").innerText(), /14 blocos de 30 minutos, 280 itens, 55 min de pausa/);
  await page.locator("[data-iniciar]").click();
  await confirmarDia();
  await page.locator(".dia").waitFor();
  idDia = decodeURIComponent(page.url().split("#/dia/")[1]);
  assert.ok(idDia, "abriu o dia de prova");
  /* o personalizado evita os itens já respondidos no banco */
  const reg = (await demo()).simuladosCompletos.find((s) => s.id === idDia);
  const itensDia = new Set(reg.formulario.blocos.flat().map((x) => (typeof x === "string" ? x : x.id)));
  assert.equal(itensDia.size, 280, "280 itens no formulário");
  assert.equal(blocoBanco.filter((id) => itensDia.has(id)).length, 0, "nenhum item do bloco do banco no formulário personalizado");
  /* sem tutorial: os 5 minutos dele vão para a pausa */
  await page.locator("[data-bloco]").click();
  await page.locator("[data-prova]").waitFor();
  assert.match(await page.locator(".pbar__marca").innerText(), /Bloco 1 de 14/i);
  for (let i = 0; i < 12; i++) { await page.keyboard.press(String((i % 5) + 1)); await page.keyboard.press("n"); }
  await page.clock.fastForward(10 * MIN);
  await page.locator("[data-fim]").click();
  await confirmarDia();
  await page.locator(".pausa").waitFor();
  /* 55 de pausa + 5 do tutorial + 20 que sobraram do bloco 1 */
  perto(await page.locator("[data-pausa-t]").innerText(), "1:20:00", "saldo de pausa");
  await page.clock.fastForward(5 * MIN);
  await page.waitForTimeout(700);
  perto(await page.locator("[data-pausa-t]").innerText(), "1:15:00", "saldo depois de 5 min");
  await foto("dia-pausa", false);
});

await etapa("3b. bloco 2 até o tempo acabar e parar no intervalo", async () => {
  await page.locator("[data-bloco]").click();
  await page.locator("[data-prova]").waitFor();
  assert.match(await page.locator(".pbar__marca").innerText(), /Bloco 2 de 14/i);
  assert.equal(await page.locator("[data-t]").innerText(), "30:00");
  for (let i = 0; i < 8; i++) { await page.keyboard.press(String((i % 5) + 1)); await page.keyboard.press("n"); }
  await page.clock.fastForward(30 * MIN + 1000);
  await page.locator(".pausa").waitFor({ timeout: 15000 });
  await page.locator("[data-parar]").click();
  await page.getByRole("heading", { name: "Em andamento" }).waitFor();
});

await etapa("3c. Meu progresso mostra o dia parado e leva de volta; retomar e terminar pelo tempo", async () => {
  await page.clock.fastForward(20 * 60 * MIN);
  await page.goto(base + "/anki/#/progresso");
  const sc = page.locator('section[aria-labelledby="sc-t"]');
  await sc.waitFor();
  assert.match(await sc.innerText(), /Step 1, simulado completo[\s\S]*Parado[\s\S]*bloco 3 de 14/i);
  await sc.getByRole("link", { name: "Continuar" }).click();
  await page.locator("[data-retomar]").waitFor();
  /* o tempo parado não gastou a pausa */
  perto(await page.locator(".pausa__t").innerText(), "1:15:00", "saldo congelado");
  await page.locator("[data-retomar]").click();
  await page.locator("[data-bloco]").waitFor();
  for (let b = 3; b <= 14; b++) {
    await page.locator("[data-bloco]").click();
    await page.locator("[data-prova]").waitFor();
    assert.match(await page.locator(".pbar__marca").innerText(), new RegExp("Bloco " + b + " de 14", "i"));
    await page.keyboard.press(String((b % 5) + 1));
    await page.clock.fastForward(30 * MIN + 1000);
    if (b < 14) await page.locator("[data-bloco]").waitFor({ timeout: 15000 });
  }
  await page.getByRole("link", { name: "Ver o relatório de desempenho" }).waitFor({ timeout: 20000 });
  const linhas = ((await demo()).respostas || []).filter((x) => x.origem === "simulado" && x.sessao_id === idDia);
  assert.equal(linhas.length, 280, "280 linhas do simulado gravadas no banco de respostas");
  assert.equal(linhas.filter((x) => x.resposta !== null).length, 12 + 8 + 12, "respostas dadas: 12, 8 e uma em cada bloco de 3 a 14");
});

await etapa("3d. relatório: resultado, confiança, perfil, blocos e parada registrada", async () => {
  await page.getByRole("link", { name: "Ver o relatório de desempenho" }).click();
  await page.locator(".rel").waitFor();
  const txt = await page.locator(".rel").innerText();
  assert.match(txt, /Resultado estimado: (Pass|Fail|indefinido, perto do limiar)/);
  assert.match(txt, /Estimativa preliminar|Alta confiança/);
  assert.match(txt, /Não é documento do USMLE nem do NBME/);
  assert.match(txt, /O dia foi parado 1 vez/);
  assert.equal(await page.locator('[data-rot="Encerramento"]:text("tempo esgotado")').count(), 13, "13 blocos pelo tempo");
  assert.doesNotMatch(txt, /itens deste formulário você já tinha respondido/i, "personalizado sem itens já vistos");
  assert.equal(await page.locator("[data-relatorio-alheio]").count(), 0);
  const reg = (await demo()).simuladosCompletos.find((s) => s.id === idDia);
  relatorio = { acertos: reg.resultado.acertos, total: reg.resultado.total, p: reg.resultado.estimativa.p_aprovacao, titulo: await page.locator(".rel h1").first().innerText() };
  assert.equal(relatorio.total, 280);
  await foto("simulado-relatorio");
});

/* ---------------- 4. a mesma probabilidade em três lugares ---------------- */
let pBanco = null;
await etapa("4. probabilidade igual no banco, em Meu progresso e nos simulados completos, com 290 itens", async () => {
  await page.goto(base + "/questoes/#/aprovacao?step=step1");
  await page.getByRole("heading", { name: "Probabilidade de aprovação", level: 1 }).waitFor();
  const placa = page.locator(".q-placa").first();
  pBanco = await pTxt(placa.locator(".q-placa__p b"));
  assert.match(await page.locator("main").innerText(), /290 itens/, "o painel conta os 10 do banco e os 280 do simulado");
  await foto("banco-aprovacao");
  await page.goto(base + "/anki/#/progresso");
  const bq = page.locator('section[aria-labelledby="bq-t"]');
  await bq.waitFor();
  const s1 = bq.locator(".prog-pr").first();
  assert.match(await s1.innerText(), /Step 1[\s\S]*290 itens respondidos/i);
  assert.equal(await pTxt(s1.locator(".prog-banco__p")), pBanco, "Meu progresso igual ao banco");
  const sc = page.locator('section[aria-labelledby="sc-t"]');
  const linha = await sc.locator("li").first().innerText();
  assert.match(linha, new RegExp(relatorio.acertos + "/280"), "Meu progresso mostra os acertos do dia");
  assert.match(linha, /Relatório/);
  await foto("meu-progresso");
  await conferir("meu-progresso-1440");
  await page.goto(base + "/simulado/#/completos");
  await page.locator(".indicador").waitFor();
  assert.equal(await pTxt(page.locator(".indicador__p b")), pBanco, "simulados completos igual ao banco");
  assert.match(await page.locator(".indicador").innerText(), /290 itens respondidos/);
});

/* ---------------- 5. administrador ---------------- */
await etapa("5a. admin: análise de itens com as respostas do aluno e ficha do item", async () => {
  await page.goto(base + "/anki/#/");
  await page.locator("#papel-demo").selectOption("admin");
  await page.getByRole("link", { name: "Rendimento" }).waitFor();
  const alvo = blocoBanco[0];
  await page.goto(base + "/admin/#/itens");
  await page.getByRole("heading", { name: "Análise de itens", level: 1 }).waitFor();
  assert.ok(await page.locator("tbody tr").count() >= 20, "tabela de itens");
  await foto("admin-itens");
  await page.goto(base + "/admin/#/item/" + encodeURIComponent(alvo));
  await page.getByRole("heading", { name: alvo, level: 1 }).waitFor();
  const ficha = await page.locator("main").innerText();
  assert.match(ficha, /Índices do item/);
  assert.match(ficha, /Dificuldade p/i);
  assert.match(ficha, /Ponto-bisserial/i);
  assert.match(ficha, /Infit/i);
  assert.ok(await page.locator(".dq tbody tr").count() >= 4, "tabela de distratores");
  await foto("admin-item");
});

await etapa("5b. admin: ficha do participante com a mesma probabilidade, o simulado completo e o relatório", async () => {
  await page.goto(base + "/admin/#/p/demo-participante");
  await page.getByRole("heading", { name: "Participante (demonstração)" }).waitFor();
  /* quem só resolveu questões não aparece como inativo (banco e simulado contam como estudo) */
  const ultima = await page.locator('dt:text-is("Última atividade") + dd').innerText();
  assert.doesNotMatch(ultima, /Nunca estudou/, "última atividade: " + ultima);
  assert.doesNotMatch(await page.locator('section[aria-labelledby="mot-t"]').innerText(), /Sem estudo registrado|Nenhum estudo registrado/, "sem risco de inatividade");
  const bq = page.locator('section[aria-labelledby="bq-t"]');
  await bq.locator(".bq__card").first().waitFor();
  const card = bq.locator(".bq__card").first();
  assert.match(await card.innerText(), /Step 1[\s\S]*290 itens respondidos/i);
  assert.equal(await pTxt(card.locator(".bq__p b")), pBanco, "ficha do admin igual ao que o aluno vê");
  const sc = page.locator(".mini-tab--completos tbody tr");
  assert.equal(await sc.count(), 1, "um simulado completo na ficha");
  const linha = await sc.first().innerText();
  assert.match(linha, /Step 1, simulado completo/i);
  assert.match(linha, /encerrado/);
  assert.match(linha, new RegExp(relatorio.acertos + "/280"));
  await conferir("admin-ficha-1440");
  await foto("admin-ficha");
  await sc.first().getByRole("link", { name: /Relatório/ }).click();
  await page.locator(".rel").waitFor();
  await page.locator("[data-relatorio-alheio]").waitFor();
  assert.equal(await page.locator(".rel h1").first().innerText(), relatorio.titulo, "mesmo relatório");
  await foto("admin-relatorio");
  /* a estimativa geral do relatório aberto pela equipe usa as respostas do participante */
  assert.doesNotMatch(await page.locator(".rel").innerText(), /ainda não respondeu itens/i);
});

/* ---------------- 6. navegação, acessibilidade e console ---------------- */
await etapa("6a. as cinco áreas apontam para o banco de questões e para os simulados", async () => {
  const PAGINAS = [
    { url: "/anki/#/", nome: "flashcards", sel: "[data-nav]", links: ["../questoes/", "../simulado/"] },
    { url: "/questoes/#/", nome: "questões", sel: "[data-nav]", links: ["../anki/#/", "../simulado/"] },
    { url: "/simulado/", nome: "simulado", sel: "header", links: ["../anki/", "../questoes/"] },
    { url: "/admin/#/", nome: "admin", sel: "[data-nav]", links: ["../questoes/", "../simulado/", "../anki/#/"] },
    { url: "/conteudo-step1.html", nome: "conteúdo", sel: "header", links: ["questoes/", "simulado/", "anki/"] }
  ];
  for (const p of PAGINAS) {
    await page.goto(base + p.url);
    await page.locator(p.sel + " a").first().waitFor();
    const hrefs = await page.locator(p.sel + " a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const l of p.links) assert.ok(hrefs.includes(l), p.nome + ": falta " + l + " (tem " + hrefs.join(", ") + ")");
  }
  const rodape = await page.locator("footer a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  for (const l of ["questoes/", "simulado/#/completos"]) assert.ok(rodape.includes(l), "rodapé do conteúdo: falta " + l);
});

await etapa("6b. links internos do site, do conteúdo e das áreas respondem", async () => {
  const alvos = new Set();
  for (const u of ["/index.html", "/conteudo-step1.html", "/anki/#/progresso", "/questoes/#/", "/simulado/#/completos", "/admin/#/p/demo-participante"]) {
    await page.goto(base + u);
    await page.waitForTimeout(500);
    for (const h of await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.href))) if (h.startsWith(base)) alvos.add(h.split("#")[0]);
  }
  const quebrados = [];
  for (const u of alvos) { const r = await page.request.get(u); if (r.status() !== 200) quebrados.push(u + " " + r.status()); }
  assert.deepEqual(quebrados, [], "links quebrados");
});

await etapa("6c. 390 px: Meu progresso, ficha do admin, rodapé e conteúdo sem violações nem rolagem horizontal", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/admin/#/p/demo-participante");
  await page.locator(".mini-tab--completos").waitFor();
  await conferir("admin-ficha-390");
  await page.locator("#papel-demo").selectOption("participante");
  await page.goto(base + "/anki/#/progresso");
  await page.locator('section[aria-labelledby="sc-t"] li').first().waitFor();
  await conferir("meu-progresso-390");
  await foto("meu-progresso-390");
  for (const [u, w] of [["/index.html", 390], ["/conteudo-step1.html", 390], ["/conteudo-step1.html", 700], ["/conteudo-step1.html", 1024]]) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.goto(base + u);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    assert.ok(r.s <= r.c + 1, u + " em " + w + " px: rolagem horizontal (" + r.s + " > " + r.c + ")");
  }
  assert.deepEqual(violacoes, [], "axe ou rolagem horizontal");
});

await etapa("6d. nenhum erro de console no percurso", async () => { assert.deepEqual(erros, []); });

await ctx.close();
await navegador.close();
servidor.close();
const falhas = resultados.filter((r) => r[0] !== "ok");
console.log("\n" + (resultados.length - falhas.length) + " de " + resultados.length + " etapas passaram. Capturas em " + saida);
process.exit(falhas.length ? 1 : 0);
