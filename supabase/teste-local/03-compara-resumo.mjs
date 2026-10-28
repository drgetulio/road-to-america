/* Road to America | confere se o resumo calculado no banco (r2a_resumo_interno,
   usado por r2a_admin_resumo_participantes e r2a_meu_resumo) é igual ao calculado
   em JavaScript (resumirParticipante, usado no modo demonstração), e se as duas
   linhas levam à mesma avaliação de risco, garantia e prontidão.

   Só para teste local (Postgres puro). Uso, na raiz do repositório:
     node supabase/teste-local/03-compara-resumo.mjs
   Variáveis opcionais: R2A_DB (padrão r2a_compara; o banco é recriado) e
   R2A_PSQL (padrão: su postgres -c "psql ..."; use "psql" se o seu usuário já
   tiver acesso). Sai com código 1 se alguma diferença aparecer. */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TZ = "America/Sao_Paulo";
if (process.env.TZ !== TZ) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { stdio: "inherit", env: { ...process.env, TZ } });
  process.exit(r.status ?? 1);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { gerarCoorte } = await import(join(raiz, "plataforma/js/coorte-demo.js"));
const { resumirParticipante, avaliarParticipante, atividadeDiaria } = await import(join(raiz, "plataforma/js/desempenho.js"));

const DB = process.env.R2A_DB || "r2a_compara";
function psql(args, entrada = null) {
  const cmd = (process.env.R2A_PSQL || "psql") + " " + args;
  const r = process.env.R2A_PSQL
    ? spawnSync("sh", ["-c", cmd], { encoding: "utf8", input: entrada ?? undefined, maxBuffer: 1 << 28 })
    : spawnSync("su", ["postgres", "-c", cmd], { encoding: "utf8", input: entrada ?? undefined, maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); throw new Error("psql falhou: " + args); }
  return r.stdout;
}
function sh(cmd) {
  const r = process.env.R2A_PSQL ? spawnSync("sh", ["-c", cmd], { encoding: "utf8" }) : spawnSync("su", ["postgres", "-c", cmd], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout) + "\nfalhou: " + cmd);
}

const lit = (v) => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const arr = (xs, tipo) => "array[" + xs.map(lit).join(",") + "]::" + tipo + "[]";

const agora = new Date();
const bancos = {
  step1: JSON.parse(readFileSync(join(raiz, "simulado/data/step1-questoes.json"), "utf8")),
  step2ck: JSON.parse(readFileSync(join(raiz, "simulado/data/step2ck-questoes.json"), "utf8"))
};
const coorte = gerarCoorte({ agora, bancos });
const escolhidos = coorte.participantes; /* todos os 16 perfis */
const uuid = new Map(escolhidos.map((p, i) => [p.id, "10000000-0000-0000-0000-" + String(i + 1).padStart(12, "0")]));

/* ---------- carga ---------- */
let sql = "set client_min_messages = warning;\nbegin;\n";
sql += "insert into auth.users (id, email, raw_user_meta_data) values\n" +
  escolhidos.map((p) => "(" + lit(uuid.get(p.id)) + "," + lit(p.email) + ",jsonb_build_object('nome'," + lit(p.nome) + "))").join(",\n") + ";\n";
for (const p of escolhidos) sql += "update public.profiles set criado_em = " + lit(p.criado_em) + " where id = " + lit(uuid.get(p.id)) + ";\n";
sql += "insert into public.cards (id, tipo, frente, verso, sistema, disciplina, baralho, status, origem) select x, 'basico', 'Q ' || x, 'A', 'cardiovascular', 'fisiologia', 'oficial', 'aprovado', 'seed' from unnest(" + arr(coorte.oficiais, "text") + ") as x;\n";
/* um card pessoal visto, que não entra na cobertura */
sql += "insert into public.cards (id, tipo, frente, verso, sistema, disciplina, baralho, status) values ('pessoal-1', 'basico', 'P', 'A', 'cardiovascular', 'fisiologia', 'pessoal', 'rascunho');\n";
sql += "\\copy public.revlog (user_id, card_id, ord, rating, state, elapsed_days, scheduled_days, review, duracao_ms) from stdin\n";
for (const p of escolhidos) for (const r of coorte.revlog[p.id]) {
  sql += [uuid.get(p.id), r.card_id, r.ord, r.rating, r.state, r.elapsed_days, r.scheduled_days, r.review, r.duracao_ms].join("\t") + "\n";
}
sql += "\\.\n";
const estadosExtra = { [escolhidos[0].id]: [{ key: "pessoal-1#1", card_id: "pessoal-1", ord: 1, state: 2, scheduled_days: 30, suspenso: false, leech: false }] };
for (const p of escolhidos) {
  const est = coorte.estados[p.id].concat(estadosExtra[p.id] || []);
  if (!est.length) continue;
  sql += "insert into public.srs_estado (user_id, card_id, ord, due, state, scheduled_days, stability, suspenso, leech) values\n" +
    est.map((e) => "(" + [lit(uuid.get(p.id)), lit(e.card_id), e.ord, "now()", e.state, e.scheduled_days, e.scheduled_days, e.suspenso, e.leech].join(",") + ")").join(",\n") + ";\n";
}
for (const s of coorte.simulados.filter((x) => uuid.has(x.user_id))) {
  sql += "insert into public.simulados (user_id, step, questoes, respostas, marcadas, tempos_ms, inicio, fim, duracao_ms, total, acertos, em_branco, por_sistema, por_disciplina, encerramento) values (" +
    [lit(uuid.get(s.user_id)), lit(s.step), arr(s.questoes, "text"), arr(s.respostas, "text"), arr(s.marcadas, "boolean"), arr(s.tempos_ms, "integer"),
      lit(s.inicio), lit(s.fim), s.duracao_ms, s.total, s.acertos, s.em_branco, lit(JSON.stringify(s.por_sistema)), lit(JSON.stringify(s.por_disciplina)), lit(s.encerramento)].join(",") + ");\n";
}
for (const n of coorte.nbme.filter((x) => uuid.has(x.user_id))) {
  sql += "insert into public.nbme_autoavaliacoes (user_id, step, formulario, modo, data, escore, probabilidade, faixa_acima_aprovacao_baixa, verificada, criado_em) values (" +
    [lit(uuid.get(n.user_id)), lit(n.step), lit(n.formulario), lit(n.modo), lit(n.data), lit(n.escore), lit(n.probabilidade), lit(n.faixa_acima_aprovacao_baixa), n.verificada, lit(n.criado_em)].join(",") + ");\n";
}
for (const p of escolhidos) {
  const pr = coorte.presenca[p.id];
  sql += "insert into public.presenca (user_id, aulas_assistidas, aulas_totais, origem) values (" + [lit(uuid.get(p.id)), pr.aulas_assistidas, pr.aulas_totais, "'csv'"].join(",") + ");\n";
  const pl = coorte.planos[p.id];
  /* a data do Step 1 do primeiro perfil vem dos ajustes do app (fallback) */
  const d1 = p === escolhidos[0] ? null : pl.data_prova_step1;
  sql += "insert into public.plano_participante (user_id, data_prova_step1, data_prova_step2ck, step1_aprovado, step2ck_aprovado, data_matricula) values (" +
    [lit(uuid.get(p.id)), lit(d1), lit(pl.data_prova_step2ck), pl.step1_aprovado, pl.step2ck_aprovado, lit(pl.data_matricula)].join(",") + ");\n";
}
sql += "insert into public.configuracoes (user_id, dados) values (" + lit(uuid.get(escolhidos[0].id)) + ", jsonb_build_object('dataProva', " + lit(coorte.planos[escolhidos[0].id].data_prova_step1) + "));\n";
sql += "commit;\n";
sql += "select jsonb_agg(r) from public.r2a_resumo_interno(" + arr([...uuid.values()], "uuid") + ", '" + TZ + "', " + lit(agora.toISOString()) + ") as r;\n";

const dir = mkdtempSync(join(tmpdir(), "r2a-"));
chmodSync(dir, 0o755);
const arq = join(dir, "carga.sql");
writeFileSync(arq, sql);
chmodSync(arq, 0o644);

sh("dropdb --if-exists " + DB + " && createdb " + DB);
psql("-q -v ON_ERROR_STOP=1 -d " + DB + " -f " + join(raiz, "supabase/teste-local/01-simula-supabase.sql") + " -f " + join(raiz, "supabase/schema.sql") + " >/dev/null");
const saida = psql("-q -At -v ON_ERROR_STOP=1 -d " + DB + " -f " + arq);
const linhasSql = JSON.parse(saida.trim().split("\n").pop());

/* ---------- comparação ---------- */
const porId = new Map(linhasSql.map((l) => [l.user_id, l]));
let falhas = 0;
const quase = (a, b, tol = 1e-5) => (a === null || b === null ? a === b : Math.abs(Number(a) - Number(b)) <= tol);
function confere(nome, cond, det = "") {
  if (!cond) { falhas++; console.log("FALHOU " + nome + (det ? " | " + det : "")); }
}
function chaves(o, pre = "") {
  if (!o || typeof o !== "object" || Array.isArray(o)) return [];
  return Object.keys(o).flatMap((k) => [pre + k, ...chaves(o[k], pre + k + ".")]).sort();
}
const oficiaisOk = coorte.oficiais;
for (const p of escolhidos) {
  const id = uuid.get(p.id);
  const js = resumirParticipante({
    perfil: { ...p, id }, revlog: coorte.revlog[p.id], estados: coorte.estados[p.id].concat(estadosExtra[p.id] || []), oficiais: oficiaisOk,
    simulados: coorte.simulados.filter((s) => s.user_id === p.id), nbme: coorte.nbme.filter((n) => n.user_id === p.id),
    presenca: coorte.presenca[p.id],
    plano: p === escolhidos[0] ? { ...coorte.planos[p.id], data_prova_step1: null } : coorte.planos[p.id],
    configuracoes: p === escolhidos[0] ? { dataProva: coorte.planos[p.id].data_prova_step1 } : null,
    agora
  });
  const db = porId.get(id);
  const n = p.nome;
  if (!db) { confere(n + ": linha ausente no banco", false); continue; }
  const kj = chaves(js).filter((k) => !k.startsWith("simulados.step") || k.split(".").length <= 3);
  const kd = chaves(db).filter((k) => !k.startsWith("simulados.step") || k.split(".").length <= 3);
  confere(n + ": mesmas chaves", JSON.stringify(kj) === JSON.stringify(kd), "só JS: " + kj.filter((k) => !kd.includes(k)) + " | só SQL: " + kd.filter((k) => !kj.includes(k)));
  const f1 = js.flashcards, f2 = db.flashcards;
  for (const k of ["revisoes_hoje", "revisoes_7d", "revisoes_30d", "dias_estudados_30d", "sequencia_atual", "maior_sequencia", "vistos", "vistos_itens", "maduros", "jovens", "aprendendo", "leeches", "suspensos", "total_oficial"]) {
    confere(n + ": flashcards." + k, f1[k] === f2[k], f1[k] + " x " + f2[k]);
  }
  confere(n + ": por_dia_30", JSON.stringify(f1.por_dia_30) === JSON.stringify(f2.por_dia_30), JSON.stringify(f1.por_dia_30) + " x " + JSON.stringify(f2.por_dia_30));
  confere(n + ": retenção", f1.retencao_30d.total === f2.retencao_30d.total && f1.retencao_30d.acertos === f2.retencao_30d.acertos && quase(f1.retencao_30d.taxa, f2.retencao_30d.taxa));
  confere(n + ": cobertura", quase(f1.cobertura, f2.cobertura), f1.cobertura + " x " + f2.cobertura);
  confere(n + ": última revisão", (f1.ultima_revisao === null && f2.ultima_revisao === null) || Date.parse(f1.ultima_revisao) === Date.parse(f2.ultima_revisao));
  confere(n + ": última atividade", (js.ultima_atividade === null && db.ultima_atividade === null) || Date.parse(js.ultima_atividade) === Date.parse(db.ultima_atividade), js.ultima_atividade + " x " + db.ultima_atividade);
  for (const st of ["step1", "step2ck"]) {
    const a = js.simulados[st], b = db.simulados[st];
    confere(n + ": simulados." + st, a.n === b.n && a.ultimos.length === b.ultimos.length && a.ultimos.every((x, i) => quase(x.percentual, b.ultimos[i].percentual, 1e-4) && x.total === b.ultimos[i].total));
  }
  confere(n + ": nbme", js.nbme.length === db.nbme.length && js.nbme.every((x, i) => x.data === db.nbme[i].data && quase(x.probabilidade, db.nbme[i].probabilidade) && x.verificada === db.nbme[i].verificada));
  confere(n + ": presença", js.presenca.aulas_assistidas === db.presenca.aulas_assistidas && quase(js.presenca.percentual, db.presenca.percentual));
  confere(n + ": plano", Object.keys(js.plano).every((k) => js.plano[k] === db.plano[k]), JSON.stringify(js.plano) + " x " + JSON.stringify(db.plano));
  const a1 = avaliarParticipante(js, { agora }), a2 = avaliarParticipante(db, { agora });
  confere(n + ": status", a1.status === a2.status, a1.status + " x " + a2.status);
  confere(n + ": riscos", JSON.stringify(a1.riscos.map((r) => r.codigo)) === JSON.stringify(a2.riscos.map((r) => r.codigo)));
  confere(n + ": garantia", a1.garantia.cumpre === a2.garantia.cumpre && JSON.stringify(a1.garantia.prazo) === JSON.stringify(a2.garantia.prazo));
  confere(n + ": prontidão", a1.prontidao.step1.status === a2.prontidao.step1.status && a1.prontidao.step2ck.status === a2.prontidao.step2ck.status);
  console.log((falhas ? "" : "ok ") + n.padEnd(18) + " status " + a2.status.padEnd(8) + " riscos " + (a2.riscos.map((r) => r.codigo).join(",") || "-"));
}
/* série diária (r2a_atividade_diaria x atividadeDiaria) nos três primeiros perfis */
for (const p of escolhidos.slice(0, 3)) {
  const q = "select jsonb_agg(t) from public.r2a_atividade_diaria(" + lit(uuid.get(p.id)) + "::uuid, 120, '" + TZ + "', " + lit(agora.toISOString()) + ") as t;";
  const db = JSON.parse(psql("-q -At -v ON_ERROR_STOP=1 -d " + DB + " -c " + JSON.stringify(q)).trim());
  const js = atividadeDiaria(coorte.revlog[p.id], { dias: 120, agora });
  confere(p.nome + ": atividade diária", db.length === js.length && js.every((x, i) => x.dia === db[i].dia && x.revisoes === db[i].revisoes && x.revisao_total === db[i].revisao_total && x.revisao_acertos === db[i].revisao_acertos));
}
const totalRev = escolhidos.reduce((s, p) => s + coorte.revlog[p.id].length, 0);
console.log("\n" + escolhidos.length + " participantes, " + totalRev + " revisões comparadas. Diferenças: " + falhas);
process.exit(falhas ? 1 : 0);
