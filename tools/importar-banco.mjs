#!/usr/bin/env node
/* Road to America | importa o banco de questões para o Supabase.

   Lê banco-privado/**\/*.json (arrays de itens no contrato de
   plataforma/CONTRATO-ITEM.md), normaliza e valida com plataforma/js/banco.js e
   faz upsert por id na tabela questoes. As credenciais vêm SÓ de variáveis de
   ambiente e nunca são gravadas em arquivo nem impressas:
     SUPABASE_URL                 https://xxxx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY    chave service_role (Settings > API); ignora a RLS

   Uso (na raiz do repositório):
     node tools/importar-banco.mjs --dry-run              valida e mostra o relatório, sem rede
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/importar-banco.mjs
   Opções:
     --dir <pasta>            pasta do banco (padrão: banco-privado)
     --dry-run                não envia nada
     --status <s>             grava este status em todos os itens (ativo, rascunho, suspenso,
                              aposentado). Sem a opção, itens novos entram como ativo e os que
                              já existem mantêm o status atual (uma suspensão feita pelo admin
                              não é desfeita pela reimportação)
     --incluir-publicos       importa também os 80 itens de simulado/data/ (assim o banco
                              corrige no servidor as respostas do simulado de 30 minutos)
     --lote <n>               itens por requisição (padrão 200)
     --relatorio <arquivo>    grava o relatório em JSON (sem credenciais)
     --gerar-manifest [arq]   grava a lista de arquivos de itens (padrão: <dir>/manifest.json),
                              que o modo demonstração lê no servidor local
     --ignorar-invalidos      termina com código 0 mesmo com itens inválidos (eles nunca
                              são enviados)
     --sem-formularios        não envia <dir>/formularios.json (por padrão, quando o arquivo
                              existe, os formulários fixos vão para a tabela formularios_fixos,
                              e a plataforma abre exatamente a composição e a ordem gravadas)
     --sem-blueprint          não completa os itens com banco-privado/blueprint-*.json (por
                              padrão, o que o item não repete da especificação de mesmo spec_id,
                              como disciplinas secundárias e disciplinas clínicas oficiais, vem
                              do blueprint, e as divergências de classificação vão para o relatório)
   Código de saída: 0 sem problemas; 1 com itens inválidos ou erro de envio; 2 com uso errado. */
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizarItem, validarItem, nomesLaboratoriais, contarPor, enriquecerComBlueprint, STATUS_QUESTAO, normalizarFormulariosGravados } from "../plataforma/js/banco.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORAR = /^(manifest|formularios|referencia-.*|blueprint-.*|.*\.relatorio)\.json$/i;
/* pastas de apoio dos autores (geradores, versões antigas do blueprint, cópias da auditoria, fontes) */
const PASTAS_IGNORADAS = /^(ferramentas|versoes|auditoria|fontes-.*|node_modules|\..*)$/i;
const DERIVADOS = ["b_angoff", "angoff_origem", "legado", "taxonomia_desconhecida", "b_calibrado", "ep_calibrado", "n_calibracao", "calibrado_em", "status", "angoff_item", "angoff_painel", "angoff_painel_juizes", "angoff_painel_ep", "revisao_tipo"];

export function lerArgs(argv) {
  const o = { dir: "banco-privado", dryRun: false, status: null, incluirPublicos: false, lote: 200, relatorio: null, manifest: null, ignorarInvalidos: false, blueprint: true, formularios: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const prox = () => { const v = argv[++i]; if (v === undefined || v.startsWith("--")) throw new Error("Falta o valor de " + a + "."); return v; };
    if (a === "--dir") o.dir = prox();
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--status") { o.status = prox(); if (!STATUS_QUESTAO.includes(o.status)) throw new Error("Status inválido: " + o.status + "."); }
    else if (a === "--incluir-publicos") o.incluirPublicos = true;
    else if (a === "--lote") { o.lote = Number(prox()); if (!Number.isInteger(o.lote) || o.lote < 1 || o.lote > 1000) throw new Error("--lote precisa ser um inteiro de 1 a 1000."); }
    else if (a === "--relatorio") o.relatorio = prox();
    else if (a === "--gerar-manifest") { const v = argv[i + 1]; o.manifest = v && !v.startsWith("--") ? (i++, v) : true; }
    else if (a === "--ignorar-invalidos") o.ignorarInvalidos = true;
    else if (a === "--sem-blueprint") o.blueprint = false;
    else if (a === "--sem-formularios") o.formularios = false;
    else if (/key|token|senha|secret/i.test(a)) throw new Error("Credenciais só por variável de ambiente (SUPABASE_SERVICE_ROLE_KEY).");
    else throw new Error("Opção desconhecida: " + a + ".");
  }
  return o;
}

async function listarJson(dir) {
  const out = [];
  const entradas = await readdir(dir, { withFileTypes: true });
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!PASTAS_IGNORADAS.test(e.name)) out.push(...(await listarJson(p))); }
    else if (e.isFile() && e.name.endsWith(".json") && !IGNORAR.test(e.name)) out.push(p);
  }
  return out;
}

/* Item no formato gravado em questoes.dados: contrato atual, chaves canônicas, sem
   os campos derivados; o Angoff só vai quando o item tem um próprio. */
export function itemParaDados(n) {
  const d = { ...n };
  for (const k of DERIVADOS) delete d[k];
  /* o Angoff do painel fica nas colunas angoff_painel*; em dados vai o do item */
  if (n.angoff_origem === "painel") d.angoff = n.angoff_item;
  else if (n.angoff_origem !== "item") delete d.angoff;
  if (n.step === "step2ck") delete d.disciplina;
  if (n.step === "step1") { delete d.area; delete d.tarefa; }
  return d;
}

/* Lê e valida; não usa rede. Devolve o relatório e as linhas prontas para envio. */
export async function prepararImportacao(o, { raiz = RAIZ } = {}) {
  const dir = resolve(raiz, o.dir);
  const rel = { versao: 1, gerado_em: new Date().toISOString(), dir: relative(raiz, dir) || ".", arquivos: [], itens: 0, validos: 0, invalidos: [], avisos: [], duplicados: [], divergencias_blueprint: [], blueprints: [], por_step: {}, por_sistema: {}, angoff_padrao: 0 };
  let labs = null;
  try { labs = nomesLaboratoriais(JSON.parse(await readFile(join(raiz, "simulado/data/valores-laboratoriais.json"), "utf8"))); } catch { labs = null; }
  let arquivos = [];
  try { if ((await stat(dir)).isDirectory()) arquivos = await listarJson(dir); } catch { throw new Error("Pasta não encontrada: " + dir); }
  if (o.incluirPublicos) arquivos.push(join(raiz, "simulado/data/step1-questoes.json"), join(raiz, "simulado/data/step2ck-questoes.json"));
  const blueprints = [];
  const arquivosBlueprint = [];
  if (o.blueprint) {
    try {
      for (const nome of (await readdir(dir)).filter((n) => /^blueprint-.*\.json$/i.test(n)).sort()) {
        try { blueprints.push(JSON.parse(await readFile(join(dir, nome), "utf8"))); arquivosBlueprint.push(nome); } catch (e) { rel.arquivos.push({ arquivo: nome, itens: 0, erro: "Blueprint ilegível: " + e.message }); }
      }
    } catch { /* sem pasta */ }
  }
  rel.blueprints = arquivosBlueprint;
  const porId = new Map();
  const arquivosDeItens = [];
  for (const arq of arquivos) {
    const nome = relative(raiz, arq).split(sep).join("/");
    let dados;
    try { dados = JSON.parse(await readFile(arq, "utf8")); }
    catch (e) { rel.arquivos.push({ arquivo: nome, itens: 0, erro: "JSON inválido: " + e.message }); continue; }
    const lista = Array.isArray(dados) ? dados : Array.isArray(dados?.itens) ? dados.itens : null;
    if (!lista || !lista.length || !lista.every((x) => x && typeof x === "object" && Array.isArray(x.alternativas))) {
      rel.arquivos.push({ arquivo: nome, itens: 0, erro: "Não é um lote de itens (ignorado)." });
      continue;
    }
    rel.arquivos.push({ arquivo: nome, itens: lista.length, erro: "" });
    if (arq.startsWith(dir + sep)) arquivosDeItens.push(relative(dir, arq).split(sep).join("/"));
    const enr = blueprints.length ? enriquecerComBlueprint(lista, blueprints) : { itens: lista, divergencias: [] };
    for (const d of enr.divergencias) rel.divergencias_blueprint.push({ arquivo: nome, ...d });
    for (const bruto of enr.itens) {
      rel.itens++;
      const n = normalizarItem(bruto);
      const v = validarItem(n, { labs });
      if (v.erros.length) { rel.invalidos.push({ arquivo: nome, id: n.id || "(sem id)", erros: v.erros }); continue; }
      if (v.avisos.length) rel.avisos.push({ arquivo: nome, id: n.id, avisos: v.avisos });
      if (porId.has(n.id)) {
        rel.duplicados.push({ id: n.id, arquivos: [porId.get(n.id).arquivo, nome] });
        if ((n.versao || 1) < (porId.get(n.id).item.versao || 1)) continue;
      }
      porId.set(n.id, { item: n, arquivo: nome });
    }
  }
  const itens = [...porId.values()].map((x) => x.item).sort((a, b) => (a.id < b.id ? -1 : 1));
  rel.validos = itens.length;
  rel.por_step = contarPor(itens, "step");
  for (const step of ["step1", "step2ck"]) rel.por_sistema[step] = contarPor(itens.filter((q) => q.step === step), "sistema");
  rel.angoff_padrao = itens.filter((q) => q.angoff_origem !== "item").length;
  const linhas = itens.map((n) => ({ id: n.id, step: n.step, ...(o.status ? { status: o.status } : {}), dados: itemParaDados(n) }));
  return { relatorio: rel, linhas, arquivosDeItens, arquivosBlueprint, dir };
}

/* Linhas da tabela formularios_fixos a partir de formularios.json (sem gabarito) */
export function linhasFormularios(dados, gerado_em = null) {
  const n = normalizarFormulariosGravados(dados);
  const out = [];
  for (const step of ["step1", "step2ck"]) for (const f of Object.values(n[step])) out.push({ step, codigo: f.codigo, tipo: f.tipo || "completo", nome: f.nome || "", parcial: !!f.parcial, ...(typeof f.reservado === "boolean" ? { reservado: f.reservado } : {}), blocos: f.blocos, gerado_em });
  return out;
}
export async function enviarFormularios(linhas, { url, chave, fetch: f = globalThis.fetch }) {
  const base = String(url).replace(/\/+$/, "");
  const r = await f(base + "/rest/v1/formularios_fixos?on_conflict=step,codigo,tipo", { method: "POST", headers: { apikey: chave, Authorization: "Bearer " + chave, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(linhas) });
  if (!r.ok) { let c = ""; try { c = (await r.text()).slice(0, 500); } catch { c = ""; } throw new Error("Falha no envio dos formulários fixos (HTTP " + r.status + "): " + c.replaceAll(chave, "***")); }
  return linhas.length;
}

export async function enviar(linhas, { url, chave, lote = 200, fetch: f = globalThis.fetch, log = () => {} }) {
  const base = String(url).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new Error("SUPABASE_URL inválida.");
  const cab = { apikey: chave, Authorization: "Bearer " + chave, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
  let enviados = 0;
  for (let i = 0; i < linhas.length; i += lote) {
    const parte = linhas.slice(i, i + lote);
    const r = await f(base + "/rest/v1/questoes?on_conflict=id", { method: "POST", headers: cab, body: JSON.stringify(parte) });
    if (!r.ok) {
      let corpo = "";
      try { corpo = (await r.text()).slice(0, 500); } catch { corpo = ""; }
      throw new Error("Falha no envio do lote " + (i / lote + 1) + " (HTTP " + r.status + "): " + corpo.replaceAll(chave, "***"));
    }
    enviados += parte.length;
    log("Enviados " + enviados + " de " + linhas.length + ".");
  }
  const contagem = {};
  for (const step of ["step1", "step2ck"]) {
    try {
      const r = await f(base + "/rest/v1/questoes?select=id&step=eq." + step, { method: "HEAD", headers: { apikey: chave, Authorization: "Bearer " + chave, Prefer: "count=exact" } });
      const cr = r.headers?.get?.("content-range") || "";
      contagem[step] = cr.includes("/") ? Number(cr.split("/")[1]) : null;
    } catch { contagem[step] = null; }
  }
  return { enviados, contagem_no_banco: contagem };
}

export async function executar(argv, { env = process.env, fetch: f = globalThis.fetch, log = console.log, raiz = RAIZ } = {}) {
  let o;
  try { o = lerArgs(argv); } catch (e) { log("Erro: " + e.message); return 2; }
  let prep;
  try { prep = await prepararImportacao(o, { raiz }); } catch (e) { log("Erro: " + e.message); return 2; }
  const { relatorio: rel, linhas, arquivosDeItens, arquivosBlueprint, dir } = prep;
  log("Arquivos lidos: " + rel.arquivos.filter((a) => a.itens).length + " (" + rel.arquivos.filter((a) => !a.itens).length + " ignorados).");
  log("Itens: " + rel.itens + "; válidos: " + rel.validos + "; inválidos: " + rel.invalidos.length + "; com avisos: " + rel.avisos.length + "; duplicados: " + rel.duplicados.length + ".");
  log("Por Step: " + JSON.stringify(rel.por_step) + ". Sem Angoff próprio (padrão da dificuldade): " + rel.angoff_padrao + ".");
  if (rel.blueprints.length) log("Blueprints usados: " + rel.blueprints.join(", ") + "; divergências de classificação: " + rel.divergencias_blueprint.length + ".");
  for (const x of rel.invalidos.slice(0, 50)) log("  inválido " + x.id + " (" + x.arquivo + "): " + x.erros.join(" "));
  if (rel.invalidos.length > 50) log("  ... e mais " + (rel.invalidos.length - 50) + ".");
  if (o.manifest) {
    const destino = o.manifest === true ? join(dir, "manifest.json") : resolve(raiz, o.manifest);
    const temFormularios = await stat(join(dir, "formularios.json")).then(() => true, () => false);
    await writeFile(destino, JSON.stringify({ versao: new Date().toISOString().slice(0, 10), arquivos: arquivosDeItens, blueprints: arquivosBlueprint, ...(temFormularios ? { formularios: "formularios.json" } : {}) }, null, 2) + "\n");
    log("Manifesto gravado em " + relative(raiz, destino) + " (" + arquivosDeItens.length + " arquivos).");
  }
  /* formulários fixos gravados (banco-privado/formularios.json) */
  let forms = [];
  if (o.formularios) {
    try { const d = JSON.parse(await readFile(join(dir, "formularios.json"), "utf8")); forms = linhasFormularios(d, d.gerado_em || null); } catch { forms = []; }
    if (forms.length) log("Formulários fixos: " + forms.map((x) => x.codigo + " (" + x.blocos.flat().length + " itens" + (x.parcial ? ", parcial" : "") + ")").join(", ") + ".");
    rel.formularios = forms.map((x) => ({ step: x.step, codigo: x.codigo, itens: x.blocos.flat().length, parcial: x.parcial }));
  }
  let codigo = rel.invalidos.length && !o.ignorarInvalidos ? 1 : 0;
  if (o.dryRun) {
    rel.envio = { dry_run: true };
    log("Simulação (--dry-run): nada foi enviado.");
  } else {
    const url = env.SUPABASE_URL, chave = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !chave) { log("Erro: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (ou use --dry-run)."); return 2; }
    try {
      rel.envio = await enviar(linhas, { url, chave, lote: o.lote, fetch: f, log });
      log("Contagem no banco: " + JSON.stringify(rel.envio.contagem_no_banco) + ".");
      if (forms.length) { rel.envio.formularios = await enviarFormularios(forms, { url, chave, fetch: f }); log("Formulários fixos enviados: " + forms.map((x) => x.codigo).join(", ") + "."); }
    }
    catch (e) { rel.envio = { erro: e.message }; log("Erro: " + e.message); codigo = 1; }
  }
  if (o.relatorio) { await writeFile(resolve(raiz, o.relatorio), JSON.stringify(rel, null, 2) + "\n"); log("Relatório gravado em " + o.relatorio + "."); }
  return codigo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executar(process.argv.slice(2)).then((c) => process.exit(c));
}
