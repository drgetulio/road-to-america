/* Road to America | banco de questões: fluxos no navegador (Playwright), modo demonstração.
   Em 1440 px e 390 px, nos temas claro e escuro:
   1. criar bloco no modo tutor, responder, confirmar, ver a explicação, encerrar e revisar;
   2. bloco cronometrado (90 s por item) até o tempo acabar, com o relógio acelerado;
   3. desempenho por área e curva de evolução;
   4. painel de probabilidade de aprovação do Step 1 e do Step 2 CK;
   5. cartão resumido em "Meu progresso" e links para o banco no menu dos flashcards e no simulado;
   6. axe-core sem violações e nenhuma rolagem horizontal, em cada tela e tema;
   7. nenhum erro de console.
   Uso, na raiz:  node questoes/tests/fluxos.e2e.mjs [pasta-das-capturas]
   Requer playwright (global, local ou PLAYWRIGHT_MODULE) e axe-core (AXE_PATH com o
   caminho de axe.min.js, ou o pacote axe-core instalado). */
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const saida = resolve(process.argv[2] || join(tmpdir(), "r2a-questoes-capturas"));
await mkdir(saida, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
  try { playwright = require(c); break; } catch { /* próximo */ }
}
if (!playwright) { console.error("Playwright não encontrado."); process.exit(2); }
let axeFonte = null;
for (const c of [process.env.AXE_PATH, "axe-core/axe.min.js"].filter(Boolean)) {
  try { axeFonte = await readFile(c.startsWith("/") ? c : require.resolve(c), "utf8"); break; } catch { /* próximo */ }
}
if (!axeFonte) { console.error("axe-core não encontrado. Defina AXE_PATH com o caminho de axe.min.js."); process.exit(2); }

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp" };
const servidor = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
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
  catch (e) { resultados.push(["falhou", nome, e.message]); console.log("FALHOU " + nome + "\n       " + String(e.message).split("\n").slice(0, 12).join("\n       ")); }
}

async function axe(page, nome) {
  await page.addScriptTag({ content: axeFonte });
  const r = await page.evaluate(async () => {
    const x = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return x.violations.map((v) => v.id + " (" + v.impact + "): " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | "));
  });
  assert.deepEqual(r, [], nome + ": violações do axe");
}
async function semRolagem(page, nome) {
  const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  assert.ok(w.s <= w.c, nome + ": rolagem horizontal (" + w.s + " > " + w.c + ")");
}

for (const [largura, tema] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
  const tag = largura + "-" + tema;
  const ctx = await navegador.newContext({ viewport: { width: largura, height: largura > 500 ? 900 : 844 }, colorScheme: tema, locale: "pt-BR", reducedMotion: "reduce" });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem("__ini")) return;
    sessionStorage.setItem("__ini", "1");
    localStorage.setItem("r2a-anki-demo-v1", JSON.stringify({ papel: "participante" }));
    localStorage.setItem("r2a-questoes-prefs-v1", JSON.stringify({ banner: true }));
    localStorage.setItem("r2a-anki-banner", "1");
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(e.message));
  await page.clock.install();
  const demo = () => page.evaluate(() => JSON.parse(localStorage.getItem("r2a-anki-demo-v1") || "{}"));
  const foto = (n) => page.screenshot({ path: join(saida, tag + "-" + n + ".png"), fullPage: false });

  await etapa(tag + " · início, axe e sem rolagem", async () => {
    await page.goto(base + "/questoes/");
    await page.getByRole("heading", { name: "Banco de questões", level: 1 }).waitFor();
    assert.equal(await page.locator(".q-placa").count(), 2, "placas dos dois Steps");
    await semRolagem(page, "início");
    await axe(page, "início");
    await foto("01-inicio");
  });

  await etapa(tag + " · bloco tutor: confirmar, explicação, encerrar e revisar", async () => {
    await page.goto(base + "/questoes/#/criar?step=step1&modo=tutor&n=4&situacao=nao_vistas");
    await page.locator("[data-criar]").waitFor();
    await semRolagem(page, "criar");
    await axe(page, "criar");
    await foto("02-criar");
    await page.getByRole("button", { name: "Começar bloco" }).click();
    await page.locator("[data-prova]").waitFor();
    assert.match(await page.locator("[data-t]").innerText(), /^00:00$/, "tutor: relógio conta para a frente");
    await page.keyboard.press("2");
    await page.locator("[data-confirmar]").waitFor();
    await axe(page, "bloco tutor antes de confirmar");
    await page.locator("[data-confirmar]").click();
    await page.locator(".texp").waitFor();
    assert.equal(await page.locator('.alts input[type="radio"]:disabled').count() > 0, true, "alternativas travadas depois de confirmar");
    assert.equal(await page.locator(".alt.is-certa").count(), 1, "a correta aparece marcada");
    await page.keyboard.press("1");
    assert.equal(await page.locator('.alts input[type="radio"]:checked').getAttribute("value"), "B", "a resposta confirmada não muda");
    await semRolagem(page, "bloco tutor");
    await axe(page, "bloco tutor com explicação");
    await foto("03-tutor-explicacao");
    await page.locator("[data-proxima]").click();
    await page.keyboard.press("3");
    await page.locator("[data-fim]").click();
    await page.locator(".modal [data-acao='1']").click();
    await page.locator(".embarque").waitFor({ timeout: 10000 });
    const r = (await demo()).respostas || [];
    assert.equal(r.length, 4, "quatro respostas gravadas");
    assert.ok(r.every((x) => x.origem === "banco" && x.modo === "tutor" && x.sessao_id), "origem, modo e sessão");
    assert.equal(r.filter((x) => x.resposta !== null).length, 2, "duas respondidas, duas em branco");
    await page.locator(".qrev details summary").first().click();
    await page.locator(".qrev .texp").first().waitFor();
    await semRolagem(page, "resultado");
    await axe(page, "resultado");
    await foto("04-resultado");
  });

  await etapa(tag + " · bloco cronometrado até o tempo acabar", async () => {
    await page.goto(base + "/questoes/#/criar?step=step2ck&modo=cronometrado&n=5&situacao=nao_vistas");
    await page.getByRole("button", { name: "Começar bloco" }).click();
    await page.locator("[data-prova]").waitFor();
    assert.match(await page.locator("[data-t]").innerText(), /^07:30$/, "5 itens x 90 s = 7:30");
    for (let i = 0; i < 3; i++) { await page.keyboard.press(String(i + 1)); await page.keyboard.press("n"); }
    await axe(page, "bloco cronometrado");
    await foto("05-cronometrado");
    await page.clock.runFor(7.5 * 60 * 1000 + 1000);
    await page.locator(".embarque").waitFor({ timeout: 10000 });
    const r = ((await demo()).respostas || []).filter((x) => x.step === "step2ck");
    assert.equal(r.length, 5);
    assert.ok(r.every((x) => x.modo === "cronometrado"));
    const soma = r.reduce((s, x) => s + x.tempo_ms, 0);
    /* o tempo entre criar o bloco e a tela abrir conta no relógio, mas não em nenhuma questão */
    assert.ok(soma <= 7.5 * 60 * 1000 && soma >= 7.5 * 60 * 1000 - 1000, "tempo somado perto do limite do bloco: " + soma);
    assert.match(await page.locator(".alert").first().innerText(), /tempo do bloco acabou/i);
  });

  await etapa(tag + " · desempenho e curva de evolução", async () => {
    await page.goto(base + "/questoes/#/desempenho?step=step1");
    await page.getByRole("heading", { name: "Desempenho", level: 1 }).waitFor();
    assert.equal(await page.locator("svg.q-evo .q-evo__pt").count(), 1, "um ponto na curva (um bloco do Step 1)");
    await semRolagem(page, "desempenho");
    await axe(page, "desempenho");
    await foto("06-desempenho");
  });

  await etapa(tag + " · painel de aprovação dos dois Steps", async () => {
    /* respostas erradas em itens de cardiologia: garantem uma área que derruba a probabilidade */
    await page.evaluate(async () => {
      const db = JSON.parse(localStorage.getItem("r2a-anki-demo-v1") || "{}");
      const itens = (await (await fetch("/simulado/data/step1-questoes.json")).json()).filter((q) => q.sistema === "cardiovascular").slice(0, 4);
      const quando = new Date(Date.now() - 3600000).toISOString();
      db.respostas = (db.respostas || []).filter((r) => !itens.some((q) => q.id === r.questao_id)).concat(itens.map((q, i) => ({
        id: "ri-e2e-" + i, user_id: "demo-participante", criado_em: quando, questao_id: q.id, step: "step1", resposta: q.correta === "A" ? "B" : "A", correta: false,
        tempo_ms: 80000, marcada: false, modo: "cronometrado", origem: "banco", sessao_id: "bq-e2e", bloco: null, posicao: i, versao_item: 1, respondida_em: quando
      })));
      localStorage.setItem("r2a-anki-demo-v1", JSON.stringify(db));
    });
    await page.goto(base + "/questoes/#/aprovacao?step=step1");
    await page.reload();
    await page.getByRole("heading", { name: "Probabilidade de aprovação", level: 1 }).waitFor();
    assert.match(await page.locator(".q-placa__p b").innerText(), /%/);
    assert.match(await page.locator(".q-placa").innerText(), /Estimativa preliminar/);
    assert.ok(await page.locator(".q-rec").count() >= 1, "recomendações");
    assert.ok(await page.locator('.q-link[href^="../conteudo-step1.html#s-"]').count() >= 1, "link para o Conteúdo do Step 1");
    assert.ok(await page.locator('.q-link[href^="../anki/#/estudar?"]').count() >= 1, "link para os flashcards");
    await semRolagem(page, "aprovação step 1");
    await axe(page, "aprovação step 1");
    await foto("07-aprovacao-s1");
    await page.getByRole("radio", { name: "Step 2 CK" }).check();
    await page.locator("#ap-t", { hasText: "Step 2 CK" }).waitFor();
    assert.match(await page.locator(".q-avisos").innerText(), /três dígitos/);
    assert.match(await page.locator(".q-placa__p").innerText(), /218/);
    await axe(page, "aprovação step 2 ck");
    await foto("08-aprovacao-ck");
  });

  await etapa(tag + " · Meu progresso e links para o banco", async () => {
    await page.goto(base + "/anki/#/progresso");
    await page.locator("#bq-t").waitFor();
    assert.match(await page.locator('section[aria-labelledby="bq-t"]').innerText(), /Step 1[\s\S]*Step 2 CK/);
    assert.equal(await page.locator('[data-nav] a[href="../questoes/"]').count(), 1, "link no menu dos flashcards");
    await semRolagem(page, "meu progresso");
    await foto("09-meu-progresso");
    await page.goto(base + "/simulado/");
    await page.locator('header a[href="../questoes/"]').waitFor();
    await semRolagem(page, "simulado");
  });

  await etapa(tag + " · bloco cronometrado que vence fora da tela é encerrado e gravado", async () => {
    await page.goto(base + "/questoes/#/criar?step=step1&modo=cronometrado&n=2&situacao=nao_vistas");
    await page.getByRole("button", { name: "Começar bloco" }).click();
    await page.locator("[data-prova]").waitFor();
    await page.keyboard.press("1");
    const sid = await page.evaluate(() => JSON.parse(localStorage.getItem("r2a-questoes-andamento-v1")).id);
    await page.evaluate(() => { location.hash = "#/"; });
    await page.locator("[data-inicio]").waitFor();
    assert.ok(await page.locator(".q-and").count() === 1, "bloco em andamento no início");
    await page.clock.runFor(3 * 60 * 1000 + 1000);
    await page.evaluate(() => { location.hash = "#/blocos"; });
    await page.locator("[data-blocos]").waitFor();
    await page.locator(".toast", { hasText: "acabou enquanto você estava fora" }).waitFor({ timeout: 5000 });
    assert.equal(await page.evaluate(() => localStorage.getItem("r2a-questoes-andamento-v1")), null, "andamento apagado");
    const r = ((await demo()).respostas || []).filter((x) => x.sessao_id === sid);
    assert.equal(r.length, 2, "as duas linhas do bloco foram gravadas");
    assert.equal(r.filter((x) => x.resposta === null).length, 1, "o item sem resposta fica gravado em branco");
    assert.ok(await page.locator('.q-bloco a[href="#/resultado/' + sid + '"]').count() === 1, "bloco no histórico");
  });

  await etapa(tag + " · nenhum erro de console", async () => { assert.deepEqual(erros, []); });
  await ctx.close();
}

await navegador.close();
servidor.close();
const falhas = resultados.filter((r) => r[0] !== "ok");
console.log("\n" + (resultados.length - falhas.length) + " de " + resultados.length + " etapas passaram. Capturas em " + saida);
process.exit(falhas.length ? 1 : 0);
