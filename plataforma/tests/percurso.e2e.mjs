/* Road to America | percurso completo no modo demonstração (Playwright).
   Um único navegador, com o mesmo armazenamento local do começo ao fim:
   1. participante estuda 5 flashcards;
   2. participante faz um simulado de 30 minutos do Step 1 (relógio acelerado),
      responde parte das questões, abre a tabela de valores laboratoriais e deixa
      o tempo acabar;
   3. participante lança uma autoavaliação NBME em "Meu progresso" e vê o simulado;
   4. o papel muda para administrador e a ficha do participante no painel mostra
      as revisões, o simulado e a NBME; a lista da turma também;
   5. navegação: cada página (site, conteúdo do Step 1, flashcards, simulado,
      admin) tem a mesma marca, o botão de tema e os links cruzados, e a escolha
      de tema passa de uma página para a outra.
   Uso, na raiz:  node plataforma/tests/percurso.e2e.mjs [pasta-das-capturas]
   Requer o pacote playwright (global ou local) e o Chromium dele instalado.
   Variável opcional PLAYWRIGHT_MODULE com o caminho do pacote. */
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { prepararRede, vigiarErros } from "./e2e-rede.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const saida = resolve(process.argv[2] || join(tmpdir(), "r2a-percurso-capturas"));
await mkdir(saida, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
for (const cand of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
  try { playwright = require(cand); break; } catch { /* tenta o próximo */ }
}
if (!playwright) { console.error("Playwright não encontrado. Instale com npm i -g playwright ou defina PLAYWRIGHT_MODULE."); process.exit(2); }

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp" };
const naoEncontrados = [];
const servidor = http.createServer(async (req, res) => {
  let p = "";
  try {
    p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const arq = join(raiz, p);
    if (!arq.startsWith(raiz)) { res.writeHead(403).end(); return; }
    const dados = await readFile(arq);
    res.writeHead(200, { "content-type": TIPOS[extname(arq)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(dados);
  } catch { naoEncontrados.push(p); res.writeHead(404).end("não encontrado"); }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + servidor.address().port;

const navegador = await playwright.chromium.launch();
const resultados = [];
async function etapa(nome, fn) {
  try { await fn(); resultados.push(["ok", nome]); console.log("OK     " + nome); }
  catch (e) { resultados.push(["falhou", nome, e.message]); console.log("FALHOU " + nome + "\n       " + e.message.split("\n").join("\n       ")); }
}

const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", locale: "pt-BR" });

await prepararRede(ctx, base);
await ctx.addInitScript(() => {
  if (sessionStorage.getItem("__papel")) return;
  sessionStorage.setItem("__papel", "1");
  const k = "r2a-anki-demo-v1";
  let o = {};
  try { o = JSON.parse(localStorage.getItem(k) || "{}"); } catch { /* vazio */ }
  o.papel = "participante";
  localStorage.setItem(k, JSON.stringify(o));
});
const page = await ctx.newPage();
const erros = [];
vigiarErros(page, base, erros, { esperados: [/\/banco-privado\//, /\/favicon\.ico$/] });
page.on("dialog", (d) => d.accept());
await page.clock.install();

const demo = () => page.evaluate(() => JSON.parse(localStorage.getItem("r2a-anki-demo-v1") || "{}"));
const REVISOES = 5;
let tentativa = null;

await etapa("1. participante estuda 5 flashcards", async () => {
  await page.goto(base + "/anki/#/");
  await page.locator("[data-comecar]").click();
  for (let i = 0; i < REVISOES; i++) {
    await page.locator("[data-reveal]").click();
    await page.locator('[data-grade="3"]').click();
    await page.waitForTimeout(120);
  }
  const db = await demo();
  const revlog = Object.values(db.revlog || {}).flat();
  assert.ok(revlog.length >= REVISOES, "revlog com pelo menos " + REVISOES + " respostas (tem " + revlog.length + ")");
  await page.screenshot({ path: join(saida, "01-flashcards.png") });
});

await etapa("2. simulado de 30 minutos do Step 1 até o tempo acabar", async () => {
  await page.goto(base + "/simulado/");
  await page.locator("[data-iniciar]").click();
  await page.locator("[data-prova]").waitFor();
  assert.match(await page.locator("[data-t]").innerText(), /^30:00$/, "relógio começa em 30:00");
  for (let i = 0; i < 8; i++) { await page.keyboard.press(String((i % 4) + 1)); await page.keyboard.press("n"); }
  await page.keyboard.press("l");
  await page.locator("[data-lab-busca]").fill("sodio");
  assert.ok(await page.getByText(/Sódio/i).first().isVisible(), "tabela de valores laboratoriais abre e busca");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: join(saida, "02-simulado-prova.png") });
  await page.clock.runFor(30 * 60 * 1000 + 1000);
  await page.locator(".res").waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(saida, "03-simulado-resultado.png"), fullPage: true });
  tentativa = (await demo()).simulados.at(-1);
  assert.equal(tentativa.step, "step1");
  assert.equal(tentativa.total, 20, "20 questões no bloco");
  assert.equal(tentativa.encerramento, "tempo");
  assert.equal(tentativa.em_branco, 12, "12 em branco");
  assert.ok(tentativa.duracao_ms >= 30 * 60 * 1000 - 1000 && tentativa.duracao_ms <= 30 * 60 * 1000, "duração de 30 minutos (" + tentativa.duracao_ms + ")");
});

await etapa("3. participante lança NBME em Meu progresso e vê o simulado", async () => {
  await page.goto(base + "/anki/#/progresso");
  await page.getByRole("heading", { name: "Meu progresso" }).waitFor();
  await page.getByRole("button", { name: "Lançar autoavaliação" }).click();
  await page.locator("#nb-form").fill("Form 31");
  await page.locator("#nb-data").fill("2026-10-21");
  await page.locator("#nb-esc").fill("221");
  await page.locator("#nb-prob").fill("91");
  await page.getByLabel("Sim", { exact: true }).check();
  await page.getByRole("button", { name: "Lançar autoavaliação" }).click();
  await page.getByText("Aguardando verificação").waitFor();
  const meus = page.locator('section[aria-labelledby="s-t"]');
  assert.match(await meus.innerText(), new RegExp(tentativa.acertos + "/20"), "Meus simulados mostra a tentativa");
  await page.screenshot({ path: join(saida, "04-meu-progresso.png"), fullPage: true });
});

await etapa("4. admin vê revisões, simulado e NBME do participante", async () => {
  await page.locator("#papel-demo").selectOption("admin");
  await page.getByRole("link", { name: "Rendimento" }).waitFor();
  await page.goto(base + "/admin/#/p/demo-participante");
  await page.getByRole("heading", { name: "Participante (demonstração)" }).waitFor();
  const rev = Number((await page.locator('dt:text-is("Revisões, 7 dias") + dd').innerText()).replace(/\D/g, ""));
  assert.ok(rev >= REVISOES, "revisões nos 7 dias: " + rev);
  const sim = page.locator(".mini-tab--sim tbody tr");
  assert.equal(await sim.count(), 1, "uma tentativa de simulado na ficha");
  const linha = await sim.first().innerText();
  assert.match(linha, /Step 1/);
  assert.match(linha, new RegExp(tentativa.acertos + "/20"));
  assert.match(linha, /tempo esgotado/);
  assert.match(await page.locator(".mini-tab--nbme").innerText(), /Form 31[\s\S]*221/);
  await page.screenshot({ path: join(saida, "05-admin-ficha.png"), fullPage: true });
  await page.goto(base + "/admin/#/participantes?q=participante");
  await page.getByRole("heading", { name: "Participantes" }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.screenshot({ path: join(saida, "06-admin-lista.png"), fullPage: true });
});

const PAGINAS = [
  { url: "/index.html", nome: "site" },
  { url: "/conteudo-step1.html", nome: "conteúdo", links: ["anki/", "simulado/", "index.html"] },
  { url: "/anki/#/", nome: "flashcards", links: ["../simulado/", "../conteudo-step1.html", "../admin/", "../index.html"] },
  { url: "/simulado/", nome: "simulado", links: ["../anki/", "../conteudo-step1.html", "../index.html"] },
  { url: "/admin/#/", nome: "admin", links: ["../anki/#/", "../simulado/", "../conteudo-step1.html", "../index.html"] }
];

await etapa("5. rodapé do site com os links da área do aluno", async () => {
  await page.goto(base + "/index.html");
  const rodape = page.locator("footer");
  for (const [txt, href] of [["Área do aluno: flashcards", "anki/"], ["Simulado de 30 minutos", "simulado/"], ["Conteúdo do Step 1", "conteudo-step1.html"]]) {
    assert.equal(await rodape.getByRole("link", { name: txt }).getAttribute("href"), href, txt);
  }
});

await etapa("6. mesma marca, botão de tema e links cruzados em todas as páginas", async () => {
  for (const p of PAGINAS) {
    await page.goto(base + p.url);
    await page.locator("header .brand .brand__shield").first().waitFor();
    assert.match(await page.locator("header .brand .brand__name").first().innerText(), /road to\s*america/i, p.nome + ": marca");
    assert.equal(await page.locator("header [data-theme-toggle]").count(), 1, p.nome + ": um botão de tema");
    if (p.nome === "admin" || p.nome === "flashcards") await page.locator("[data-nav] a").first().waitFor();
    const hrefs = await page.locator("header a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const l of p.links || []) assert.ok(hrefs.includes(l), p.nome + ": falta link " + l + " (tem " + hrefs.join(", ") + ")");
  }
});

await etapa("7. tema escolhido numa página vale nas outras", async () => {
  await page.goto(base + "/index.html");
  const antes = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  await page.locator("header [data-theme-toggle]").click();
  const depois = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  assert.notEqual(depois, antes, "botão troca o tema");
  for (const p of PAGINAS.slice(1)) {
    await page.goto(base + p.url);
    await page.locator("header [data-theme-toggle]").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), depois, p.nome + " herda o tema");
    await page.screenshot({ path: join(saida, "07-tema-" + p.nome.replace(/\W/g, "") + ".png") });
  }
});

await etapa("8. links internos das cinco páginas respondem", async () => {
  const alvos = new Set();
  for (const p of PAGINAS) {
    await page.goto(base + p.url);
    await page.waitForTimeout(300);
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.href));
    for (const h of hrefs) if (h.startsWith(base)) alvos.add(h.split("#")[0]);
  }
  const quebrados = [];
  for (const u of alvos) { const r = await page.request.get(u); if (r.status() !== 200) quebrados.push(u + " " + r.status()); }
  assert.deepEqual(quebrados, [], "links quebrados");
});

await etapa("9. nenhum erro de console no percurso", async () => {
  assert.deepEqual(erros, []);
});

await ctx.close();
await navegador.close();
servidor.close();
const falhas = resultados.filter((r) => r[0] !== "ok");
console.log("\n" + (resultados.length - falhas.length) + " de " + resultados.length + " etapas passaram. Capturas em " + saida);
process.exit(falhas.length ? 1 : 0);
