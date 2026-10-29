/* Road to America | fluxos do banco de questões na área administrativa (Playwright e axe-core).
   Sobe um servidor estático da raiz, abre o modo demonstração como administrador e confere:
   1. análise de itens: tabela, filtros, ficha do item com distratores por quartil,
      reporte, marca de revisão, retirada do banco e correção de gabarito com versão;
   2. recalibração: prévia, gravação e volta ao Angoff; desfecho real lançado e
      regressão ajustada e salva;
   3. blueprint: faixas oficiais e conferência dos formulários fixos;
   4. turma e ficha com um banco sintético grande (servido no lugar de
      banco-privado/, que fica fora do git): o critério "probabilidade baixa com alta
      confiança" acende e aparece na turma, na lista e na ficha;
   5. axe-core sem violações e nenhuma rolagem horizontal em 1440 e 390 px, nos temas
      claro e escuro, em todas as telas novas;
   6. nenhum erro de console.
   Uso, na raiz:  node admin/tests/banco.e2e.mjs [pasta-das-capturas]
   Requer playwright (global, local ou PLAYWRIGHT_MODULE) e axe-core (AXE_PATH com o
   caminho de axe.min.js, ou o pacote axe-core instalado). */
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { gerarBancoSintetico } from "../../plataforma/tests/sintetico.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const saida = resolve(process.argv[2] || join(tmpdir(), "r2a-admin-banco-capturas"));
await mkdir(saida, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
  try { playwright = require(c); break; } catch { /* próximo */ }
}
if (!playwright) { console.error("Playwright não encontrado. Defina PLAYWRIGHT_MODULE."); process.exit(2); }
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
    if (!arq.startsWith(raiz) || p.startsWith("/banco-privado/")) { res.writeHead(404).end(); return; }
    const dados = await readFile(arq);
    res.writeHead(200, { "content-type": TIPOS[extname(arq)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(dados);
  } catch { res.writeHead(404).end("não encontrado"); }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + servidor.address().port;
/* banco sintético grande, servido no lugar de banco-privado/ (o real fica fora do git) */
const bancoGrande = JSON.stringify(gerarBancoSintetico({ porStep: 320, semente: 77 }));

const navegador = await playwright.chromium.launch();
const resultados = [];
async function etapa(nome, fn) {
  try { await fn(); resultados.push(["ok", nome]); console.log("OK     " + nome); }
  catch (e) { resultados.push(["falhou", nome, e.message]); console.log("FALHOU " + nome + "\n       " + e.message.split("\n").join("\n       ")); }
}
async function abrir({ largura = 1440, altura = 900, tema = "light", grande = false } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema, locale: "pt-BR" });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem("__papel")) return;
    sessionStorage.setItem("__papel", "1");
    const k = "r2a-anki-demo-v1";
    let o = {};
    try { o = JSON.parse(localStorage.getItem(k) || "{}"); } catch { /* vazio */ }
    o.papel = "admin";
    localStorage.setItem(k, JSON.stringify(o));
  });
  if (grande) {
    await ctx.route("**/banco-privado/manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ arquivos: ["sintetico.json"] }) }));
    await ctx.route("**/banco-privado/sintetico.json", (r) => r.fulfill({ contentType: "application/json", body: bancoGrande }));
  }
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("dialog", (d) => d.accept());
  return { ctx, page, erros };
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
const confirmarDialogo = async (page, rotulo) => { await page.locator("dialog[open]").getByRole("button", { name: rotulo }).click(); };

await etapa("1. análise de itens, ficha do item e ações da equipe", async () => {
  const { ctx, page, erros } = await abrir();
  await page.goto(base + "/admin/#/itens");
  await page.getByRole("heading", { name: "Análise de itens", level: 1 }).waitFor();
  assert.match(await page.locator(".demo-banco").innerText(), /dados de demonstração/i);
  assert.equal(await page.locator("tbody tr").count(), 40, "40 itens públicos do Step 1");
  await page.locator("#i-al").selectOption("revisar");
  const nRev = await page.locator("tbody tr").count();
  assert.ok(nRev >= 4 && nRev < 40, "filtro de alerta: " + nRev);
  assert.match(page.url(), /alerta=revisar/);
  await page.locator("#i-sit").selectOption("reportes");
  assert.ok(await page.locator("tbody tr").count() >= 1, "item com reporte aberto");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.screenshot({ path: join(saida, "01-itens.png"), fullPage: true });
  /* primeiro da fila: reporte aberto e alertas de revisão */
  const primeiro = await page.locator("tbody .ptab__nome").first().innerText();
  await page.locator("tbody .ptab__nome").first().click();
  await page.getByRole("heading", { name: primeiro, level: 1 }).waitFor();
  assert.match(await page.locator(".alert--info").innerText(), /Defeito plantado pela simulação/);
  assert.equal(await page.locator(".dq tbody tr").count() >= 5, true, "tabela de distratores");
  assert.equal(await page.locator(".dq thead th").filter({ hasText: /^Q[1-4]/ }).count(), 4, "quatro quartis");
  assert.equal(await page.locator("svg .opc--ruim").count() >= 1, true, "distrator que supera a correta destacado");
  await page.getByRole("heading", { name: "Reportes dos alunos" }).waitFor();
  await axe(page, "ficha do item");
  await page.screenshot({ path: join(saida, "02-item.png"), fullPage: true });
  /* reporte: em análise */
  const rep = page.locator("[data-rep]").first();
  await rep.locator("select").selectOption("em_analise");
  await rep.locator("input[name=resposta]").fill("Conferindo a referência.");
  await rep.getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Reporte atualizado.").waitFor();
  /* marca de revisão */
  await page.locator("#rv-nota").fill("Gabarito em discussão na reunião de itens.");
  await page.getByRole("button", { name: "Marcar para revisão" }).click();
  await page.getByText("Item marcado para revisão.").waitFor();
  assert.ok(await page.locator(".ficha__nome").getByText("Em revisão").isVisible());
  /* gabarito: sem motivo não passa; com motivo, confirma e sobe a versão */
  const letras = await page.locator("[data-gabarito] input[name=correta]").evaluateAll((xs) => xs.map((x) => [x.value, x.checked]));
  const nova = letras.find(([, c]) => !c)[0];
  await page.locator('[data-gabarito] input[value="' + nova + '"]').check();
  await page.getByRole("button", { name: "Corrigir o gabarito" }).click();
  await page.getByText("Explique o motivo da mudança").waitFor();
  await page.locator("#gb-mot").fill("Teste do fluxo: troca de gabarito com recorreção");
  await page.getByRole("button", { name: "Corrigir o gabarito" }).click();
  await confirmarDialogo(page, "Corrigir o gabarito");
  await page.getByText(/Gabarito corrigido: versão 2/).waitFor();
  assert.equal(await page.locator(".ficha__stub b").innerText(), nova);
  const hist = await page.locator(".hist").innerText();
  assert.match(hist, /Gabarito corrigido/);
  assert.match(hist, /Teste do fluxo/);
  assert.match(hist, /Marca de revisão/);
  /* retirar do banco */
  await page.locator("#st-sel").selectOption("suspenso");
  await page.locator("#st-mot").fill("Fora até a reunião");
  await page.getByRole("button", { name: "Salvar situação" }).click();
  await confirmarDialogo(page, "Retirar do banco");
  await page.getByText("Item retirado do banco.").waitFor();
  assert.ok(await page.locator(".ficha__nome").getByText("Retirado").isVisible());
  await page.goto(base + "/admin/#/itens?situacao=fora");
  await page.getByRole("heading", { name: "Análise de itens", level: 1 }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  assert.equal(await page.locator("tbody .ptab__nome").innerText(), primeiro);
  await page.goto(base + "/admin/#/itens?step=step2ck");
  await page.locator('nav.tabs a[aria-current="page"]', { hasText: "Step 2 CK" }).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 40);
  assert.deepEqual(erros, []);
  await ctx.close();
});

await etapa("2. recalibração, desfecho real e regressão", async () => {
  const { ctx, page, erros } = await abrir();
  await page.goto(base + "/admin/#/calibracao");
  await page.getByRole("heading", { name: "Recalibração e desfechos", level: 1 }).waitFor();
  await page.getByRole("button", { name: "Calcular a prévia com os dados da turma" }).click();
  await page.locator(".previa svg").waitFor();
  /* o botão da prévia volta a ficar ativo (o handler não pode usar ev.currentTarget depois do await) */
  await page.waitForFunction(() => !document.querySelector("[data-previa]").disabled);
  const botao = page.getByRole("button", { name: /Gravar os b novos/ });
  const n = Number((await botao.innerText()).match(/\((\d+) itens\)/)[1]);
  assert.ok(n >= 30, "itens com respostas suficientes: " + n);
  await botao.click();
  await confirmarDialogo(page, "Gravar");
  await page.getByText(/itens recalibrados/).waitFor();
  await page.getByText("Calibrados hoje").waitFor();
  assert.match(await page.locator(".mini").first().innerText(), new RegExp("calibrados hoje\\s+" + n, "i"));
  /* a tabela de itens passa a mostrar o b calibrado */
  await page.goto(base + "/admin/#/itens");
  await page.getByRole("heading", { name: "Análise de itens", level: 1 }).waitFor();
  assert.ok(await page.locator("tbody").getByText(/^calibrado/).count() >= 30);
  await page.goto(base + "/admin/#/calibracao");
  await page.getByRole("button", { name: "Voltar todos ao Angoff" }).click();
  await confirmarDialogo(page, "Voltar ao Angoff");
  await page.getByText("Calibração desfeita.").waitFor();
  /* desfecho real do participante de demonstração */
  await page.locator("#df-u").selectOption("demo-participante");
  await page.locator("#df-d").fill("2026-09-30");
  await page.locator("#df-r").selectOption("pass");
  await page.getByRole("button", { name: "Lançar desfecho" }).click();
  await page.getByText("Desfecho lançado.").waitFor();
  assert.ok(await page.locator("table").getByText("Participante (demonstração)").isVisible());
  await page.getByRole("button", { name: "Ajustar os modelos" }).click();
  await page.locator(".reg svg").waitFor();
  await page.waitForFunction(() => !document.querySelector("[data-ajustar]").disabled);
  assert.match(await page.locator(".reg").innerText(), /área sob a curva ROC/);
  await axe(page, "calibração");
  await page.screenshot({ path: join(saida, "03-calibracao.png"), fullPage: true });
  await page.getByRole("button", { name: "Salvar o modelo para as telas dos alunos" }).click();
  await confirmarDialogo(page, "Salvar o modelo");
  await page.getByText("Modelo salvo.").waitFor();
  assert.match(await page.locator("[aria-labelledby=rg-t]").innerText(), /dados de demonstração[\s\S]*Pass\/Fail com/i);
  /* Step 2 CK: campo de nota e aviso dos três dígitos */
  await page.goto(base + "/admin/#/calibracao?step=step2ck");
  await page.locator("#df-n").waitFor();
  await page.getByRole("button", { name: "Ajustar os modelos" }).click();
  await page.locator(".reg").getByText(/só aparece para o aluno quando o modelo da nota oficial for suficiente/).waitFor();
  assert.deepEqual(erros, []);
  await ctx.close();
});

await etapa("3. blueprint e formulários fixos", async () => {
  const { ctx, page, erros } = await abrir();
  await page.goto(base + "/admin/#/blueprint");
  await page.getByRole("heading", { name: "Blueprint e cobertura do banco", level: 1 }).waitFor();
  assert.equal(await page.locator(".bp").count(), 3, "sistemas, disciplinas e competências");
  assert.equal(await page.locator(".bp").first().locator(".bp__row").count(), 11, "11 sistemas do Step 1");
  await page.getByRole("button", { name: "Conferir os formulários fixos" }).click();
  await page.locator("[data-ff-out] .sinal").nth(2).waitFor();
  assert.match(await page.locator("[data-ff-out]").innerText(), /Formulário A[\s\S]*Formulário B[\s\S]*Formulário C/);
  await axe(page, "blueprint");
  await page.goto(base + "/admin/#/blueprint?step=step2ck");
  await page.locator('nav.tabs a[aria-current="page"]', { hasText: "Step 2 CK" }).waitFor();
  assert.equal(await page.locator(".bp").first().locator(".bp__row").count(), 14, "14 sistemas do Step 2 CK");
  assert.match(await page.locator("main").innerText(), /Tarefas do médico/);
  assert.deepEqual(erros, []);
  await ctx.close();
});

await etapa("4. banco grande: risco de probabilidade baixa com alta confiança na turma, na lista e na ficha", async () => {
  const { ctx, page, erros } = await abrir({ grande: true });
  await page.goto(base + "/admin/?banco=completo#/");
  await page.getByRole("heading", { name: "Rendimento da turma", level: 1 }).waitFor();
  const painel = page.locator("[aria-labelledby=pb-t]");
  await painel.waitFor();
  const lista = painel.locator(".sinais .sinal");
  const n = await lista.count();
  assert.ok(n >= 1, "alguém com probabilidade baixa e alta confiança");
  const nome = await lista.first().locator("a").innerText();
  assert.match(await lista.first().innerText(), /alta confiança/);
  await axe(page, "turma com banco grande");
  await page.screenshot({ path: join(saida, "04-turma-banco.png"), fullPage: true });
  await page.goto(base + "/admin/#/participantes?status=risco");
  await page.getByRole("heading", { name: "Participantes", level: 1 }).waitFor();
  const linha = page.locator("tbody tr", { hasText: nome });
  assert.match(await linha.innerText(), /Probabilidade baixa no banco, com alta confiança \(alto\)/);
  await linha.locator(".ptab__nome").click();
  await page.getByRole("heading", { name: nome, level: 1 }).waitFor();
  const card = page.locator(".bq__card--risco");
  await card.waitFor();
  assert.match(await card.innerText(), /Alta confiança/);
  assert.match(await card.innerText(), /intervalo de 90%/);
  assert.match(await page.locator(".sinais").first().innerText(), /Probabilidade baixa no banco/);
  assert.match(await page.locator(".sugs").innerText(), /Rever com o aluno o plano e a data/);
  await axe(page, "ficha com banco grande");
  await page.screenshot({ path: join(saida, "05-ficha-banco.png"), fullPage: true });
  assert.deepEqual(erros, []);
  await ctx.close();
});

await etapa("5. axe e sem rolagem horizontal em 1440 e 390 px, temas claro e escuro", async () => {
  const telas = [
    ["/admin/#/", "Rendimento da turma", "turma"],
    ["/admin/#/itens", "Análise de itens", "itens"],
    ["/admin/#/item/s1-022", "s1-022", "item"],
    ["/admin/#/calibracao", "Recalibração e desfechos", "calibracao"],
    ["/admin/#/blueprint?step=step2ck", "Blueprint e cobertura do banco", "blueprint"],
    ["/admin/#/p/demo-sint-hugo-ficticio", "Hugo Fictício", "ficha"],
    ["/admin/#/participantes", "Participantes", "participantes"]
  ];
  for (const largura of [1440, 390]) {
    for (const tema of ["light", "dark"]) {
      const { ctx, page, erros } = await abrir({ largura, altura: largura === 390 ? 844 : 900, tema });
      for (const [rota, titulo, arq] of telas) {
        await page.goto(base + rota);
        await page.getByRole("heading", { name: titulo, level: 1 }).waitFor();
        await page.waitForTimeout(150);
        const nome = arq + " " + largura + " " + tema;
        await semRolagem(page, nome);
        await axe(page, nome);
        await page.screenshot({ path: join(saida, "06-" + largura + "-" + tema + "-" + arq + ".png"), fullPage: true });
      }
      assert.deepEqual(erros, []);
      await ctx.close();
    }
  }
});

await navegador.close();
servidor.close();
const falhas = resultados.filter((r) => r[0] !== "ok");
console.log("\n" + (resultados.length - falhas.length) + " de " + resultados.length + " fluxos passaram. Capturas em " + saida);
process.exit(falhas.length ? 1 : 0);
