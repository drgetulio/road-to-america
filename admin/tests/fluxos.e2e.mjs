/* Road to America | fluxos da área administrativa no navegador (Playwright).
   Sobe um servidor estático da raiz do repositório, abre o modo demonstração em
   Chromium sem janela e confere:
   1. admin vê a turma, a lista e a ficha, sem erro no console;
   2. participante e visitante caem na tela de acesso negado;
   3. edição de presença na ficha;
   4. verificação de NBME;
   5. exportação CSV (com e sem e-mails);
   6. participante lança NBME em "Meu progresso" e o admin vê na ficha;
   7. nenhuma tela com rolagem horizontal em 390 px, nos temas claro e escuro;
   8. a data da prova apagada em "Meu progresso" não volta pelos Ajustes do app.
   Uso, na raiz:  node admin/tests/fluxos.e2e.mjs [pasta-das-capturas]
   Requer o pacote playwright (global ou local) e o Chromium dele instalado.
   Variável opcional PLAYWRIGHT_MODULE com o caminho do pacote. */
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const saida = resolve(process.argv[2] || join(tmpdir(), "r2a-admin-capturas"));
await mkdir(saida, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
for (const cand of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
  try { playwright = require(cand); break; } catch { /* tenta o próximo */ }
}
if (!playwright) { console.error("Playwright não encontrado. Instale com npm i -g playwright ou defina PLAYWRIGHT_MODULE."); process.exit(2); }

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
  catch (e) { resultados.push(["falhou", nome, e.message]); console.log("FALHOU " + nome + "\n       " + e.message.split("\n").join("\n       ")); }
}

/* contexto novo com papel de demonstração pré-definido */
async function abrir(papel, { largura = 1280, altura = 900, tema = "light" } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema, locale: "pt-BR", acceptDownloads: true });
  await ctx.addInitScript((papel) => {
    if (!papel || sessionStorage.getItem("__papel")) return;
    sessionStorage.setItem("__papel", "1");
    const k = "r2a-anki-demo-v1";
    let o = {};
    try { o = JSON.parse(localStorage.getItem(k) || "{}"); } catch { /* vazio */ }
    o.papel = papel;
    localStorage.setItem(k, JSON.stringify(o));
  }, papel);
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(e.message));
  return { ctx, page, erros };
}
const semRolagem = async (page) => {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= w, "rolagem horizontal: " + sw + " > " + w);
};

await etapa("1. admin vê a turma, a lista e a ficha", async () => {
  const { ctx, page, erros } = await abrir("admin");
  await page.goto(base + "/admin/#/");
  await page.getByRole("heading", { name: "Rendimento da turma" }).waitFor();
  assert.equal(await page.locator(".tiles--adm .tile").count(), 8);
  assert.ok(await page.locator("[data-demo-banner]").isVisible(), "faixa de demonstração visível");
  assert.match(await page.locator("[data-demo-banner]").innerText(), /dados de demonstração/i);
  await page.screenshot({ path: join(saida, "01-turma.png"), fullPage: true });
  await page.getByRole("link", { name: /Em risco/ }).first().click();
  await page.getByRole("heading", { name: "Participantes" }).waitFor();
  const nRisco = await page.locator("tbody tr").count();
  assert.ok(nRisco >= 3, "filtro de risco traz pelo menos 3 linhas");
  assert.equal(await page.locator("tbody .st--risco").count(), nRisco, "todas as linhas filtradas estão em risco");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  assert.equal(await page.locator("tbody tr").count(), 17);
  assert.equal(await page.locator("tbody").getByText("@demo.local").count(), 0, "lista não mostra e-mails");
  await page.locator("#f-q").fill("bruno");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.locator("#f-q").fill("carla.modelo@demo");
  assert.equal(await page.locator("tbody tr").count(), 1, "busca por e-mail");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.locator('[data-ordem="nome"]').click();
  const nomes = await page.locator("tbody .ptab__nome").allInnerTexts();
  assert.deepEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })), "ordem por nome");
  assert.equal(await page.locator('th[aria-sort="ascending"]').count(), 1);
  await page.screenshot({ path: join(saida, "02-participantes.png"), fullPage: true });
  await page.getByRole("link", { name: "Marina Exemplo" }).click();
  await page.getByRole("heading", { name: "Marina Exemplo" }).waitFor();
  for (const t of ["Sinais de risco", "Sugestões de ação", "Checklist da garantia", "Prontidão para manter a data (EXIT 18)", "Linha do tempo de estudo, 26 semanas", "Anotações do mentor"]) {
    assert.ok(await page.getByRole("heading", { name: t }).isVisible(), "seção " + t);
  }
  assert.ok(await page.locator(".sug").count() >= 3, "sugestões com motivo");
  await page.locator("#n-txt").fill("Conversa marcada para quinta.");
  await page.getByRole("button", { name: "Salvar anotação" }).click();
  await page.getByText("Anotação salva.").waitFor();
  await page.screenshot({ path: join(saida, "03-ficha.png"), fullPage: true });
  assert.deepEqual(erros, []);
  await ctx.close();
});

await etapa("2. participante e visitante veem acesso negado", async () => {
  const { ctx, page, erros } = await abrir("participante");
  await page.goto(base + "/admin/#/participantes");
  await page.getByRole("heading", { name: "Área da equipe" }).waitFor();
  assert.equal(await page.locator("table").count(), 0, "nenhuma tabela");
  assert.equal(await page.getByText("Ana Exemplo").count(), 0, "nenhum participante exposto");
  assert.equal(await page.getByRole("link", { name: "Ver meu progresso" }).getAttribute("href"), "../anki/#/progresso");
  assert.deepEqual(await page.locator("[data-nav] a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))), ["../anki/#/", "../questoes/", "../simulado/", "../conteudo-step1.html"], "menu só com links externos");
  await page.screenshot({ path: join(saida, "04-acesso-negado.png"), fullPage: true });
  await page.goto(base + "/admin/#/p/demo-sint-ana-exemplo");
  await page.getByRole("heading", { name: "Área da equipe" }).waitFor();
  assert.deepEqual(erros, []);
  await ctx.close();

  /* visitante no modo Supabase: config preenchido e cliente sem sessão (simulado) */
  const v = await abrir(null);
  await v.page.route("**/anki/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'export default { supabaseUrl: "https://exemplo.supabase.co", supabaseAnonKey: "chave-publica-de-teste" };' }));
  await v.page.route("**/anki/vendor/supabase.umd.js", (r) => r.fulfill({ contentType: "text/javascript", body: "window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {}, signOut: async () => {} } }) };" }));
  await v.page.goto(base + "/admin/#/participantes");
  await v.page.getByRole("heading", { name: "Área da equipe" }).waitFor();
  assert.equal(await v.page.getByRole("link", { name: "Entrar pela área do aluno" }).getAttribute("href"), "../anki/#/entrar");
  assert.equal(await v.page.locator("[data-demo-banner]").isVisible(), false, "sem faixa de demonstração no modo Supabase");
  assert.equal(await v.page.locator("table").count(), 0);
  await v.page.screenshot({ path: join(saida, "04b-visitante.png"), fullPage: true });
  assert.deepEqual(v.erros, []);
  await v.ctx.close();
});

await etapa("3. edição de presença na ficha", async () => {
  const { ctx, page, erros } = await abrir("admin");
  await page.goto(base + "/admin/#/p/demo-participante");
  await page.getByRole("heading", { name: "Participante (demonstração)" }).waitFor();
  await page.locator("#p-a").fill("41");
  await page.locator("#p-t").fill("40");
  await page.getByRole("button", { name: "Salvar presença" }).click();
  await page.getByText("Aulas assistidas não podem passar do total.").waitFor();
  assert.equal(await page.locator("#p-a").getAttribute("aria-invalid"), "true");
  await page.locator("#p-a").fill("30");
  await page.getByRole("button", { name: "Salvar presença" }).click();
  await page.getByText("Presença salva: 30 de 40 aulas.").waitFor();
  await page.getByText("30 de 40 aulas (75%); faltam 2 aulas").waitFor();
  await page.goto(base + "/admin/#/participantes?q=participante");
  assert.match(await page.locator("tbody tr").first().innerText(), /75%[\s\S]*30\/40 aulas/);
  /* importação CSV pelo diálogo */
  await page.getByRole("button", { name: "Importar presença (CSV)" }).click();
  await page.locator("#imp-txt").fill("email;aulas_assistidas;aulas_totais\nparticipante@demo.local;36;40\nninguem@exemplo.com;1;2");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page.getByRole("heading", { name: "Resultado da importação" }).waitFor();
  assert.match(await page.locator("dialog").innerText(), /ninguem@exemplo\.com/);
  await page.locator("dialog[open] .modal__foot").getByRole("button", { name: "Fechar" }).click();
  await page.waitForTimeout(400);
  assert.match(await page.locator("tbody tr").first().innerText(), /90%[\s\S]*36\/40 aulas/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

await etapa("4. verificação de NBME", async () => {
  const { ctx, page, erros } = await abrir("admin");
  await page.goto(base + "/admin/#/p/demo-sint-bruno-ficticio");
  await page.getByRole("heading", { name: "Autoavaliações NBME lançadas" }).waitFor();
  const antes = await page.locator(".mini-tab--nbme .gar--ok").count();
  await page.getByRole("button", { name: "Marcar como verificada" }).first().click();
  await page.getByText("Autoavaliação marcada como verificada.").waitFor();
  assert.equal(await page.locator(".mini-tab--nbme .gar--ok").count(), antes + 1);
  assert.equal(await page.getByRole("button", { name: "Marcar como verificada" }).count(), 0);
  await page.getByText("3 lançadas (mínimo 2), 3 verificadas pela equipe.").waitFor();
  await page.screenshot({ path: join(saida, "05-nbme-verificada.png"), fullPage: true });
  await page.getByRole("button", { name: "Desfazer verificação" }).first().click();
  await page.getByText("Verificação desfeita.").waitFor();
  assert.equal(await page.locator(".mini-tab--nbme .gar--ok").count(), antes);
  assert.deepEqual(erros, []);
  await ctx.close();
});

await etapa("5. exportação CSV com e sem e-mails", async () => {
  const { ctx, page, erros } = await abrir("admin");
  await page.goto(base + "/admin/#/participantes?status=risco");
  await page.getByRole("heading", { name: "Participantes" }).waitFor();
  const n = await page.locator("tbody tr").count();
  const baixar = async () => {
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar CSV" }).click()]);
    assert.match(d.suggestedFilename(), /^rendimento-participantes-\d{4}-\d{2}-\d{2}\.csv$/);
    return readFileSync(await d.path(), "utf8");
  };
  const sem = await baixar();
  assert.ok(sem.startsWith("﻿nome;situacao;motivos;"), "BOM e cabeçalho");
  const linhas = sem.trim().split(/\r\n/);
  assert.equal(linhas.length, n + 1, "uma linha por participante filtrado");
  assert.ok(!sem.includes("@demo.local"), "sem e-mail por padrão");
  assert.ok(linhas.slice(1).every((l) => l.includes(";Em risco;")));
  await page.getByLabel("Incluir e-mails no CSV").check();
  const com = await baixar();
  assert.ok(com.split(/\r\n/)[0].startsWith("﻿nome;email;"));
  assert.ok(com.includes("@demo.local"));
  assert.deepEqual(erros, []);
  await ctx.close();
});

await etapa("6. participante lança NBME em Meu progresso e o admin vê", async () => {
  const { ctx, page, erros } = await abrir("participante");
  await page.goto(base + "/anki/#/progresso");
  await page.getByRole("heading", { name: "Meu progresso" }).waitFor();
  assert.ok(await page.getByRole("link", { name: "Simulado" }).first().isVisible());
  assert.equal(await page.getByRole("link", { name: "Rendimento" }).count(), 0, "participante não vê o link do painel");
  await page.getByRole("button", { name: "Lançar autoavaliação" }).click();
  await page.getByText("Confira antes de salvar:").waitFor();
  await page.locator("#nb-form").fill("CBSSA Form 30");
  await page.locator("#nb-data").fill("2026-10-20");
  await page.locator("#nb-esc").fill("214");
  await page.locator("#nb-prob").fill("88");
  await page.getByLabel("Sim", { exact: true }).check();
  await page.getByRole("button", { name: "Lançar autoavaliação" }).click();
  await page.getByText("Aguardando verificação").waitFor();
  await page.getByText("1 lançada (mínimo 2)").count();
  await page.screenshot({ path: join(saida, "06-meu-progresso.png"), fullPage: true });
  await page.locator("#papel-demo").selectOption("admin");
  await page.getByRole("link", { name: "Rendimento" }).waitFor();
  await page.goto(base + "/admin/#/p/demo-participante");
  await page.locator(".mini-tab--nbme").getByText("CBSSA Form 30").waitFor();
  assert.deepEqual(erros, []);
  await ctx.close();
});

await etapa("7. sem rolagem horizontal em 390 px, temas claro e escuro", async () => {
  for (const tema of ["light", "dark"]) {
    const { ctx, page, erros } = await abrir("admin", { largura: 390, altura: 844, tema });
    for (const [rota, titulo, arq] of [["/admin/#/", "Rendimento da turma", "turma"], ["/admin/#/participantes", "Participantes", "lista"], ["/admin/#/p/demo-sint-bruno-ficticio", "Bruno Fictício", "ficha"], ["/admin/#/metas", "Metas e critérios", "metas"], ["/anki/#/progresso", "Meu progresso", "progresso"]]) {
      await page.goto(base + rota);
      await page.getByRole("heading", { name: titulo }).waitFor();
      await page.waitForTimeout(150);
      await semRolagem(page);
      await page.screenshot({ path: join(saida, "07-390-" + tema + "-" + arq + ".png"), fullPage: true });
    }
    assert.deepEqual(erros, []);
    await ctx.close();
  }
});

await etapa("8. participante apaga a data da prova do Step 1 e ela não volta", async () => {
  const { ctx, page, erros } = await abrir("participante");
  await page.goto(base + "/anki/#/progresso");
  await page.locator("#d-s1").waitFor();
  await page.fill("#d-s1", "2027-02-10");
  await page.getByRole("button", { name: "Salvar datas" }).click();
  await page.waitForFunction(() => document.querySelector("#d-s1")?.value === "2027-02-10");
  await page.fill("#d-s1", "");
  await page.getByRole("button", { name: "Salvar datas" }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.inputValue("#d-s1"), "", "data apagada continua apagada");
  await page.reload();
  await page.locator("#d-s1").waitFor();
  assert.equal(await page.inputValue("#d-s1"), "", "data apagada continua apagada depois de recarregar");
  assert.deepEqual(erros, []);
  await ctx.close();
});

await navegador.close();
servidor.close();
const falhas = resultados.filter((r) => r[0] !== "ok");
console.log("\n" + (resultados.length - falhas.length) + " de " + resultados.length + " fluxos passaram. Capturas em " + saida);
process.exit(falhas.length ? 1 : 0);
