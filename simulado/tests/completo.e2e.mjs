/* Road to America | simulados completos no navegador (Playwright), modo demonstração.
   O banco completo vem de itens sintéticos (plataforma/tests/sintetico.mjs) servidos
   como se fossem banco-privado/ (?banco=completo em 127.0.0.1), para que os
   formulários saiam no tamanho oficial: 14 blocos e 280 itens no Step 1.
   Percursos:
   A. 1440 px, tema claro: Step 1 completo com tutorial, bloco 1 com as ferramentas,
      pausa com saldo, parar e continuar depois, retomada após recarregar no meio do
      bloco, blocos seguintes encerrados pelo tempo, fim do dia, relatório, revisão
      item a item, "criar flashcard" no app de flashcards e "reportar erro no item".
   B. 390 px, tema escuro: Step 2 CK, avaliação de prontidão (4 blocos), relatório sem
      nota de três dígitos.
   Em cada tela: axe-core (WCAG 2 A e AA) nos temas claro e escuro, sem rolagem
   horizontal, e captura de tela.
   Uso, na raiz:  node simulado/tests/completo.e2e.mjs [pasta-das-capturas]
   Variáveis opcionais: PLAYWRIGHT_MODULE e AXE_CORE ou AXE_PATH (caminho do axe.min.js). */
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { gerarBancoSintetico } from "../../plataforma/tests/sintetico.mjs";
import { prepararRede, vigiarErros } from "../../plataforma/tests/e2e-rede.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const saida = resolve(process.argv[2] || join(tmpdir(), "r2a-completo-capturas"));
await mkdir(saida, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
for (const cand of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
  try { playwright = require(cand); break; } catch { /* tenta o próximo */ }
}
if (!playwright) { console.error("Playwright não encontrado. Instale com npm i -g playwright ou defina PLAYWRIGHT_MODULE."); process.exit(2); }
let axeFonte = null;
for (const cand of [process.env.AXE_CORE, process.env.AXE_PATH].filter(Boolean)) {
  if (existsSync(cand)) { axeFonte = await readFile(cand, "utf8"); break; }
}
if (!axeFonte) { try { axeFonte = await readFile(require.resolve("axe-core/axe.min.js"), "utf8"); } catch { /* sem axe */ } }
if (!axeFonte) { console.error("axe-core não encontrado. Instale com npm i axe-core ou defina AXE_CORE."); process.exit(2); }

/* Banco sintético servido como banco-privado/ (com tabela de exames em alguns itens) */
const sint = gerarBancoSintetico({ porStep: 620, semente: 2026 });
for (const q of sint.slice(0, 600)) if (Number(q.id.slice(-4)) % 7 === 0) q.tabela = { titulo: "Laboratory studies", linhas: [["Hemoglobin", "9.1 g/dL"], ["Sodium", "128 mEq/L"], ["Creatinine", "1.9 mg/dL"]] };
const VIRTUAIS = {
  "/banco-privado/manifest.json": JSON.stringify({ arquivos: ["sint-step1.json", "sint-step2ck.json"] }),
  "/banco-privado/sint-step1.json": JSON.stringify(sint.filter((q) => q.step === "step1")),
  "/banco-privado/sint-step2ck.json": JSON.stringify(sint.filter((q) => q.step === "step2ck"))
};

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp" };
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
const violacoes = [];
let nCapturas = 0;
/* axe nos dois temas, sem rolagem horizontal, captura no tema do percurso */
async function conferir(page, nome, { tema }) {
  await page.waitForTimeout(150);
  for (const t of [tema, tema === "light" ? "dark" : "light"]) {
    await page.emulateMedia({ colorScheme: t });
    await page.waitForTimeout(450); /* deixa terminar as transições de cor */
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axeFonte });
    const r = await page.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
      return res.violations.map((v) => v.id + ": " + v.nodes.slice(0, 3).map((n) => n.target.join(" ") + (v.id === "color-contrast" ? " (" + (n.any[0]?.message || "") + ")" : "")).join(" | "));
    });
    for (const v of r) violacoes.push(nome + " [" + t + "] " + v);
    const larg = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
    if (larg.doc > larg.vw + 1) violacoes.push(nome + " [" + t + "] rolagem horizontal: " + larg.doc + " > " + larg.vw);
    if (t === tema) await page.screenshot({ path: join(saida, String(++nCapturas).padStart(2, "0") + "-" + nome + ".png"), fullPage: !(await page.locator("[data-prova]").count()) });
  }
  await page.emulateMedia({ colorScheme: tema });
}

async function novaPagina({ largura, altura, tema }) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema, locale: "pt-BR" });
  await prepararRede(ctx, base);
  const page = await ctx.newPage();
  const erros = [];
  vigiarErros(page, base, erros, { esperados: [/\/banco-privado\//, /\/favicon\.ico$/] });
  await page.clock.install({ time: new Date("2026-10-29T11:00:00Z") });
  return { ctx, page, erros };
}
/* o relógio falso do Playwright anda junto com o real: compara com folga de 20 s */
const seg = (t) => t.trim().split(":").map(Number).reduce((a, x) => a * 60 + x, 0);
const perto = (txt, esperado, nome = "relógio") => assert.ok(Math.abs(seg(txt) - seg(esperado)) <= 20, nome + ": " + txt + " (esperado perto de " + esperado + ")");
/* no modal de início, as condições do dia: "estudo" por padrão nestes testes, porque
   eles param e continuam o dia; o teste das condições oficiais escolhe "oficiais" */
const confirmar = async (page, { condicoes = "estudo" } = {}) => { const c = page.locator('.modal[open] input[name="condicoes"][value="' + condicoes + '"]'); if (await c.count()) await c.check(); await page.locator(".modal[open] .modal__foot button").last().click(); };

/* ===================== A. Step 1 completo, 1440 px, claro ===================== */
const A = await novaPagina({ largura: 1440, altura: 900, tema: "light" });
let idA = null;

await etapa("A1. escolha: Step 1, simulado completo, formulário A, com banco de 280 itens ou mais", async () => {
  const { page } = A;
  await page.goto(base + "/simulado/?banco=completo#/completos");
  await page.locator("[data-iniciar]").waitFor();
  assert.match(await page.locator("[data-resumo-inicio]").innerText(), /14 blocos de 30 minutos, 280 itens, 55 min de pausa e tutorial opcional de 5 minutos, dia de 8 h/);
  await conferir(page, "a-completos", { tema: "light" });
  assert.match(await page.locator("[data-formularios]").innerText(), /S1-B, reservado para você/, "o formulário B fica reservado até o aluno fazê-lo");
  await page.locator('[data-vistos="S1-A"]').filter({ hasText: /respondeu|Nenhum item/ }).waitFor();
  assert.match(await page.locator("[data-aviso-midia]").innerText(), /Sem itens com imagem/);
  await page.locator("[data-iniciar]").click();
  const modal = await page.locator(".modal[open]").innerText();
  assert.match(modal, /14 blocos, 280 itens/);
  assert.match(modal, /Condições do dia[\s\S]*Condições oficiais[\s\S]*Estudo/);
  assert.match(modal, /Nenhum item deste formulário foi respondido por você antes|Você já respondeu \d+ de 280 itens/);
  assert.ok(await page.locator('.modal[open] input[name="condicoes"][value="oficiais"]').isChecked(), "condições oficiais por padrão");
  await confirmar(page);
  await page.locator(".dia").waitFor();
  idA = decodeURIComponent(page.url().split("#/dia/")[1]);
  assert.ok(idA, "abriu o dia de prova");
  await conferir(page, "a-checkin", { tema: "light" });
});

await etapa("A2. tutorial de 5 minutos: o que sobra vai para a pausa", async () => {
  const { page } = A;
  await page.locator("[data-tutorial]").click();
  await page.getByRole("heading", { name: /A tela do bloco/ }).waitFor();
  assert.equal(await page.locator("[data-tut-t]").innerText(), "05:00");
  await page.clock.fastForward(2 * MIN);
  await page.waitForTimeout(700);
  perto(await page.locator("[data-tut-t]").innerText(), "03:00", "tutorial");
  await conferir(page, "a-tutorial", { tema: "light" });
  await page.locator("[data-bloco]").click();
  await page.locator("[data-prova]").waitFor();
});

await etapa("A3. bloco 1: mesma tela do bloco de 30 minutos, com tabela do item e as ferramentas", async () => {
  const { page } = A;
  assert.equal(await page.locator("[data-t]").innerText(), "30:00");
  assert.equal(await page.locator("[data-ir]").count(), 20);
  assert.match(await page.locator(".pbar__marca").innerText(), /Bloco 1 de 14/i);
  for (let i = 0; i < 6; i++) { await page.keyboard.press(String((i % 5) + 1)); await page.keyboard.press("n"); }
  await page.keyboard.press("m");
  await page.locator("[data-riscar]").first().click();
  await page.keyboard.press("o");
  await page.locator("[data-nota]").fill("rever hiponatremia");
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await page.locator("[data-lab-busca]").fill("sodium");
  await page.keyboard.press("Escape");
  /* procura um item com tabela de exames no bloco */
  let comTabela = false;
  for (let i = 0; i < 20 && !comTabela; i++) { await page.locator('[data-ir="' + i + '"]').click(); comTabela = (await page.locator(".pquestao .qtab").count()) > 0; }
  await page.clock.fastForward(5 * MIN);
  await page.waitForTimeout(400);
  await conferir(page, "a-bloco1", { tema: "light" });
  await page.keyboard.press("r");
  await page.getByRole("heading", { name: "Revisão do bloco" }).waitFor();
  assert.match(await page.locator(".prev").innerText(), /6 de 20 respondidas/);
  await page.locator("[data-fim]").click();
  await confirmar(page);
  await page.locator(".pausa").waitFor();
  if (!comTabela) console.log("       (nenhum item com tabela no bloco 1 deste formulário)");
});

await etapa("A4. pausa: saldo = 55 min + 3 do tutorial + sobra do bloco; o bloco 1 não reabre", async () => {
  const { page } = A;
  /* bloco durou 5 min: sobra de 25; saldo 55 + 3 + 25 = 83 min */
  perto(await page.locator("[data-pausa-t]").innerText(), "1:23:00", "saldo de pausa");
  await page.clock.fastForward(3 * MIN);
  await page.waitForTimeout(700);
  perto(await page.locator("[data-pausa-t]").innerText(), "1:20:00", "saldo depois de 3 min");
  assert.equal(await page.locator(".trilha__b").count(), 14);
  assert.equal(await page.locator(".trilha__b.is-feito").count(), 1);
  await conferir(page, "a-pausa", { tema: "light" });
});

await etapa("A5. parar e continuar depois: o tempo parado não gasta a pausa", async () => {
  const { page } = A;
  await page.locator("[data-parar]").click();
  await page.getByRole("heading", { name: "Em andamento" }).waitFor();
  await page.clock.fastForward(26 * 60 * MIN);
  await page.locator('a[href^="#/dia/"]').first().click();
  await page.locator("[data-retomar]").waitFor();
  perto(await page.locator(".pausa__t").innerText(), "1:20:00", "saldo congelado");
  await conferir(page, "a-parado", { tema: "light" });
  await page.locator("[data-retomar]").click();
  await page.locator("[data-pausa-t]").waitFor();
  perto(await page.locator("[data-pausa-t]").innerText(), "1:20:00", "saldo depois de retomar");
});

await etapa("A6. bloco 2 retoma depois de recarregar a página; blocos seguintes encerram pelo tempo", async () => {
  const { page } = A;
  await page.locator("[data-bloco]").click();
  await page.locator("[data-prova]").waitFor();
  assert.match(await page.locator(".pbar__marca").innerText(), /Bloco 2 de 14/i);
  await page.keyboard.press("3");
  await page.clock.fastForward(4 * MIN);
  await page.waitForTimeout(3500); /* gravação com intervalo */
  await page.reload();
  await page.locator("[data-prova]").waitFor();
  assert.match(await page.locator(".pbar__marca").innerText(), /Bloco 2 de 14/i);
  assert.equal(await page.locator('.alt.is-escolhida').count(), 1, "a resposta voltou depois de recarregar");
  perto(await page.locator("[data-t]").innerText(), "26:00", "relógio do bloco depois de recarregar");
  for (let b = 2; b <= 14; b++) {
    await page.clock.fastForward(30 * MIN + 1000);
    if (b < 14) {
      await page.locator("[data-bloco]").waitFor({ timeout: 15000 });
      await page.locator("[data-bloco]").click();
      await page.locator("[data-prova]").waitFor();
      await page.keyboard.press("1");
    }
  }
  await page.getByRole("link", { name: "Ver o relatório de desempenho" }).waitFor({ timeout: 20000 });
  await conferir(page, "a-fim", { tema: "light" });
});

await etapa("A7. relatório do Step 1: resultado estimado, confiança, perfil nas três dimensões e blocos", async () => {
  const { page } = A;
  await page.getByRole("link", { name: "Ver o relatório de desempenho" }).click();
  await page.locator(".rel").waitFor();
  const txt = await page.locator(".rel").innerText();
  assert.match(txt, /Resultado estimado(?: pelo limiar do banco)?: indefinido, perto do limiar|Acima do limiar do banco|Abaixo do limiar do banco/);
  /* com o padrão provisório, nada de Pass ou Fail no selo nem no título */
  assert.doesNotMatch(await page.locator(".rel__stub b").innerText(), /^(Pass|Fail)$/i);
  assert.doesNotMatch(await page.locator("#t-resultado").innerText(), /\b(Pass|Fail)\b/);
  assert.match(txt, /Se o padrão provisório estiver errado\.[\s\S]*15 pontos percentuais/, "análise de sensibilidade");
  assert.match(txt, /indicador do banco junta as respostas de todas as sessões/, "explica a diferença entre os dois números");
  assert.match(txt, /Estimativa preliminar|Precisão alta/);
  assert.match(txt, /Não é documento do USMLE nem do NBME/);
  for (const h of ["Sistemas", "Disciplinas", "Competências"]) assert.ok(await page.getByRole("heading", { name: h, exact: true }).isVisible(), h);
  assert.equal(await page.locator(".perfil__tab").count(), 3);
  assert.match(txt, /O dia foi parado 1 vez/);
  assert.match(txt, /Condições padronizadas: não\.[\s\S]*leitura de estudo|Condições padronizadas: não\./, "o dia em condições de estudo não é padronizado");
  assert.match(txt, /Não há imagem clínica real licenciada/, "aviso de mídia: sem imagem clínica real licenciada");
  assert.match(txt, /(Nenhum|\d+) dos \d+ itens deste formulário (tem|têm) figura/, "aviso de mídia: quantos itens têm figura");
  assert.match(txt, /Probabilidade de estar acima do limiar do banco/i);
  assert.equal(await page.locator('[data-rot="Encerramento"]:text("tempo esgotado")').count(), 13);
  await page.locator("[data-qrev] details summary").first().click();
  await page.locator(".qrev__corpo").first().waitFor();
  assert.match(await page.locator(".qrev__corpo").first().innerText(), /Explanation[\s\S]*Resumo em português[\s\S]*Tempo neste item/i);
  const sintetico = page.locator('[data-qrev] details[data-id^="R2A-S1-"]').first();
  /* o primeiro item do formulário pode já ser sintético (e já estar aberto): clicar de novo o fecharia */
  if (!(await sintetico.evaluate((d) => d.open))) await sintetico.locator("summary").click();
  await sintetico.locator(".qrev__corpo").waitFor();
  const corpo = await sintetico.locator(".qrev__corpo").innerText();
  assert.match(corpo, /Why [A-E]\./, "explicação por alternativa");
  assert.match(corpo, /Objetivo educacional[\s\S]*Synthetic objective/i);
  await conferir(page, "a-relatorio", { tema: "light" });
});

await etapa("A8. reportar erro no item e criar flashcard pré-preenchido", async () => {
  const { page } = A;
  await page.locator("[data-reportar]").first().click();
  await page.locator(".modal[open] [data-form-reporte]").waitFor();
  await conferir(page, "a-reportar", { tema: "light" });
  await page.locator('.modal[open] input[value="explicacao"]').check({ force: true });
  await page.locator(".modal[open] [data-rep-txt]").fill("A explicação da alternativa B está incompleta.");
  await confirmar(page);
  await page.getByText("Reporte enviado").waitFor();
  const reportes = await page.evaluate(() => JSON.parse(localStorage.getItem("r2a-anki-demo-v1") || "{}").reportes || []);
  assert.equal(reportes.length, 1);
  assert.equal(reportes[0].motivo, "explicacao");
  assert.equal(reportes[0].status, "aberto");
  const href = await page.getByRole("link", { name: "Criar flashcard" }).first().getAttribute("href");
  assert.match(href, /^\.\.\/anki\/#\/criar\?frente=/);
  await page.getByRole("link", { name: "Criar flashcard" }).first().click();
  await page.locator("#f-frente").waitFor();
  assert.ok((await page.locator("#f-frente").inputValue()).length > 5, "frente preenchida");
  assert.ok((await page.locator("#f-verso").inputValue()).length > 0, "verso preenchido");
  assert.match(await page.locator(".alert--info").innerText(), /preenchido a partir do item/);
  await conferir(page, "a-flashcard", { tema: "light" });
  await page.getByRole("link", { name: "Voltar ao relatório" }).click();
  await page.locator(".rel").waitFor();
});

await etapa("A9. histórico de simulados completos e estimativa com todas as respostas", async () => {
  const { page } = A;
  await page.goto(base + "/simulado/#/completos");
  await page.getByRole("heading", { name: "Histórico de simulados completos" }).waitFor();
  assert.equal(await page.locator('a[href^="#/relatorio/"]').count(), 1);
  await page.locator(".indicador").waitFor();
  assert.match(await page.locator(".indicador").innerText(), /de estar acima do limiar do banco/);
  assert.match(await page.locator(".indicador").innerText(), /EXIT 18/);
  await conferir(page, "a-historico", { tema: "light" });
});

await etapa("A10. nenhum erro de console no percurso A", async () => { assert.deepEqual(A.erros, []); });
await A.ctx.close();

/* ===================== B. Step 2 CK, prontidão, 390 px, escuro ===================== */
const B = await novaPagina({ largura: 390, altura: 844, tema: "dark" });
await etapa("B1. 390 px: Step 2 CK, avaliação de prontidão, formulário personalizado", async () => {
  const { page } = B;
  await page.goto(base + "/simulado/?banco=completo#/completos");
  await page.locator("[data-iniciar]").waitFor();
  await page.locator('label.passe:has(input[value="step2ck"])').click();
  await page.locator('label.passe:has(input[value="prontidao"])').click();
  await page.locator('label.opcao:has(input[value="personalizado"])').click();
  assert.match(await page.locator("[data-resumo-inicio]").innerText(), /Step 2 CK, avaliação de prontidão: 4 blocos de 30 minutos, 80 itens, 15 min de pausa, dia de 2 h 15 min/);
  await conferir(page, "b-completos", { tema: "dark" });
  await page.locator("[data-iniciar]").click();
  await confirmar(page);
  await page.locator("[data-bloco]").waitFor();
  assert.equal(await page.locator("[data-tutorial]").count(), 0, "prontidão sem tutorial");
  await conferir(page, "b-checkin", { tema: "dark" });
  await page.locator("[data-bloco]").click();
  await page.locator("[data-prova]").waitFor();
  for (let i = 0; i < 4; i++) { await page.keyboard.press("2"); await page.keyboard.press("n"); }
  await page.locator("[data-abrir-lista]").click();
  await page.locator(".plista.is-aberta").waitFor();
  await page.keyboard.press("Escape");
  await conferir(page, "b-bloco", { tema: "dark" });
  await page.locator("[data-fim]").click();
  await confirmar(page);
  await page.locator(".pausa").waitFor();
  /* saldo: 15 min do formato + a sobra do bloco 1 (encerrado logo no começo) */
  await page.clock.fastForward(50 * MIN);
  await page.waitForTimeout(700);
  assert.match(await page.locator(".pausa__rot").innerText(), /além do saldo/i, "pausa de 50 min passa do saldo");
  await conferir(page, "b-pausa-excedente", { tema: "dark" });
  await page.locator("[data-bloco]").click();
  await page.locator("[data-prova]").waitFor();
  assert.notEqual(await page.locator("[data-t]").innerText(), "30:00", "o excedente saiu do bloco seguinte");
  for (let b = 2; b <= 4; b++) {
    await page.clock.fastForward(30 * MIN + 1000);
    if (b === 2) {
      /* pausa esquecida com a página aberta: passa 10 minutos do saldo e o dia para sozinho */
      await page.locator("[data-bloco]").waitFor({ timeout: 15000 });
      await page.clock.fastForward(3 * 60 * MIN);
      await page.locator("[data-retomar]").waitFor({ timeout: 15000 });
      assert.match(await page.locator(".dia").innerText(), /passou 10 minutos do saldo/);
      await page.locator("[data-retomar]").click();
      await page.locator("[data-bloco]").click();
      await page.locator("[data-prova]").waitFor();
      perto(await page.locator("[data-t]").innerText(), "20:00", "só os 10 minutos além do saldo saíram do bloco 3");
      continue;
    }
    if (b < 4) {
      /* o bloco 3 tinha 20 minutos: os 30 do relógio deixam 10 além do saldo, e o dia para de novo */
      await page.locator("[data-bloco], [data-retomar]").first().waitFor({ timeout: 15000 });
      if (await page.locator("[data-retomar]").count()) await page.locator("[data-retomar]").click();
      await page.locator("[data-bloco]").click(); await page.locator("[data-prova]").waitFor();
    }
  }
  await page.getByRole("link", { name: "Ver o relatório de desempenho" }).waitFor({ timeout: 20000 });
  await conferir(page, "b-fim", { tema: "dark" });
});

await etapa("B2. relatório do Step 2 CK: probabilidade do padrão, 218 e nenhuma nota de três dígitos", async () => {
  const { page } = B;
  await page.getByRole("link", { name: "Ver o relatório de desempenho" }).click();
  await page.locator(".rel").waitFor();
  const txt = await page.locator(".rel").innerText();
  assert.match(txt, /(Acima|Abaixo) do limiar do banco para o padrão mínimo|Perto do limiar do banco: resultado indefinido/);
  assert.match(txt, /Sem nota de três dígitos/);
  assert.match(txt, /218/);
  assert.match(txt, /Tarefas do médico/);
  assert.doesNotMatch(await page.locator(".rel__titulo").innerText() + " " + await page.locator(".rel__stub b").innerText(), /\d/, "o resultado não mostra nota");
  await page.locator("[data-qrev] details summary").first().click();
  await page.locator(".qrev__corpo").first().waitFor();
  await conferir(page, "b-relatorio", { tema: "dark" });
});

await etapa("B3. 30 minutos continua a abrir e leva aos simulados completos", async () => {
  const { page } = B;
  await page.goto(base + "/simulado/#/");
  await page.getByRole("link", { name: "Simulados completos" }).click();
  await page.getByRole("heading", { name: /O dia da prova/ }).waitFor();
  await conferir(page, "b-inicio-30", { tema: "dark" });
});

await etapa("B4. nenhum erro de console no percurso B", async () => { assert.deepEqual(B.erros, []); });
await B.ctx.close();

await etapa("C. axe-core sem violações WCAG A e AA e nenhuma rolagem horizontal, nos dois temas", async () => {
  assert.deepEqual(violacoes, []);
});

await navegador.close();
servidor.close();
const falhas = resultados.filter((r) => r[0] !== "ok");
console.log("\n" + (resultados.length - falhas.length) + " de " + resultados.length + " etapas passaram. Capturas em " + saida);
process.exit(falhas.length ? 1 : 0);
