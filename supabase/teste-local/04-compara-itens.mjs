/* Road to America | confere se as estatísticas de itens calculadas no banco
   (r2a_admin_estatisticas_itens e r2a_admin_respostas_calibracao) são iguais às do
   JavaScript (LocalStore.getEstatisticasItens e listRespostasCalibracao, que usam
   plataforma/js/psicometria.js), com as mesmas regras: primeira resposta de cada
   pessoa, tutor fora, só a versão atual do item. Também confere a importação:
   as linhas de tools/importar-banco.mjs entram pelo upsert por id, o gatilho
   deriva gabarito e Angoff, e a versão só sobe quando o conteúdo muda.

   Só para teste local (Postgres puro). Uso, na raiz do repositório:
     node supabase/teste-local/04-compara-itens.mjs
   Variáveis opcionais: R2A_DB (padrão r2a_itens; o banco é recriado) e R2A_PSQL
   (padrão: su postgres -c "psql ..."). Sai com código 1 se houver diferença. */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { LocalStore } = await import(join(raiz, "anki/js/store-local.js"));
const { normalizarItem } = await import(join(raiz, "plataforma/js/banco.js"));
const { itemParaDados } = await import(join(raiz, "tools/importar-banco.mjs"));
const { gerarBancoSintetico } = await import(join(raiz, "plataforma/tests/sintetico.mjs"));
const { rng } = await import(join(raiz, "plataforma/js/simulado.js"));
const { expit, normalAleatoria } = await import(join(raiz, "plataforma/js/psicometria.js"));

const DB = process.env.R2A_DB || "r2a_itens";
function rodar(cmd, entrada) {
  const r = process.env.R2A_PSQL
    ? spawnSync("sh", ["-c", cmd.replace(/^psql/, process.env.R2A_PSQL)], { encoding: "utf8", input: entrada, maxBuffer: 1 << 28 })
    : spawnSync("su", ["postgres", "-c", cmd], { encoding: "utf8", input: entrada, maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); throw new Error("falhou: " + cmd); }
  return r.stdout;
}
const psql = (sql) => rodar("psql -X -q -At -v ON_ERROR_STOP=1 -d " + DB, sql);
const lit = (v) => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");

rodar("dropdb --if-exists " + DB + " && createdb " + DB);
rodar("psql -X -q -v ON_ERROR_STOP=1 -d " + DB + " -f " + join(raiz, "supabase/teste-local/01-simula-supabase.sql") + " -f " + join(raiz, "supabase/schema.sql") + " -c 'set client_min_messages=warning'");

const diferencas = [];
const confere = (nome, cond, detalhe = "") => { if (!cond) diferencas.push(nome + (detalhe ? ": " + detalhe : "")); };

/* ---------- usuários e questões (linhas do importador, upsert por id) ---------- */
const random = rng(4242);
const ADM = "20000000-0000-0000-0000-000000000000";
const users = Array.from({ length: 45 }, (_, i) => "20000000-0000-0000-0000-" + String(i + 1).padStart(12, "0"));
let sql = "set client_min_messages = warning;\ninsert into auth.users (id, email) values (" + lit(ADM) + ", 'adm@x.com')" + users.map((u, i) => ", (" + lit(u) + ", 'p" + i + "@x.com')").join("") + ";\n";
sql += "update public.profiles set papel = 'admin' where id = " + lit(ADM) + ";\n";
const brutos = gerarBancoSintetico({ porStep: 40, semente: 5 }).map((q, i) => (i % 5 === 0 ? { ...q, angoff: undefined } : q));
const linhas = brutos.map((b) => { const n = normalizarItem(b); return { id: n.id, step: n.step, dados: itemParaDados(n) }; });
const upsert = (ls) => "insert into public.questoes (id, step, dados) values " + ls.map((l) => "(" + lit(l.id) + "," + lit(l.step) + "," + lit(JSON.stringify(l.dados)) + "::jsonb)").join(",") + " on conflict (id) do update set step = excluded.step, dados = excluded.dados;\n";
sql += upsert(linhas);
psql(sql);
psql(upsert(linhas)); /* reimportação idêntica não muda versão */
confere("reimportação idêntica mantém a versão 1", psql("select count(*) from public.questoes where versao <> 1").trim() === "0");
const semAngoff = linhas.find((l) => !("angoff" in l.dados));
const difPadrao = { facil: "0.8000", media: "0.6500", dificil: "0.4500" }[semAngoff.dados.dificuldade];
confere("Angoff padrão aplicado pelo gatilho", psql("select angoff from public.questoes where id = " + lit(semAngoff.id)).trim() === difPadrao);
confere("gabarito derivado dos dados", psql("select count(*) from public.questoes where correta <> dados->>'correta'").trim() === "0");

/* ---------- respostas (Rasch com theta conhecido), algumas repetidas, tutor e em branco ---------- */
const itensS1 = linhas.filter((l) => l.step === "step1");
const itensCk = linhas.filter((l) => l.step === "step2ck");
const respostas = [];
let minuto = 0;
const gerar = (fase) => {
  users.forEach((u, j) => {
    const theta = normalAleatoria(rng(j + 1));
    const pool = j % 3 === 0 ? itensCk : itensS1;
    const escolha = pool.filter(() => random() < (fase === 1 ? 0.6 : 0.3));
    for (const l of escolha) {
      const letras = l.dados.alternativas.map((a) => a.letra);
      const acerto = random() < expit(theta - (-Math.log(l.dados.angoff ?? 0.65) + Math.log(1 - (l.dados.angoff ?? 0.65))));
      const branco = random() < 0.05;
      const resposta = branco ? null : acerto ? l.dados.correta : letras.filter((x) => x !== l.dados.correta)[Math.floor(random() * 4)];
      const n = 1 + (random() < 0.15 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        minuto++;
        respostas.push({ user_id: u, questao_id: l.id, step: l.step, resposta: k ? l.dados.correta : resposta, modo: random() < 0.2 ? "tutor" : "cronometrado", origem: branco ? "simulado" : "banco", tempo_ms: 2 * Math.floor(20000 + random() * 50000), respondida_em: new Date(Date.UTC(2026, 9, 1) + fase * 864e5 * 10 + minuto * 60000).toISOString() });
      }
    }
  });
};
const inserirRespostas = (rs) => {
  for (let i = 0; i < rs.length; i += 1000) {
    psql("insert into public.respostas_item (user_id, questao_id, step, resposta, modo, origem, tempo_ms, respondida_em) values " +
      rs.slice(i, i + 1000).map((r) => "(" + [r.user_id, r.questao_id, r.step, r.resposta, r.modo, r.origem, r.tempo_ms, r.respondida_em].map(lit).join(",") + ")").join(",") + ";");
  }
};
gerar(1);
inserirRespostas(respostas.splice(0));
/* conteúdo de 3 itens muda (versão 2): as respostas antigas deles saem das estatísticas padrão */
const mudados = itensS1.slice(0, 3).map((l) => ({ ...l, dados: { ...l.dados, vinheta: l.dados.vinheta + " Revised." } }));
psql(upsert(mudados));
confere("conteúdo novo sobe a versão", psql("select string_agg(versao::text, ',' order by id) from public.questoes where id in (" + mudados.map((m) => lit(m.id)).join(",") + ")").trim() === "2,2,2");
gerar(2);
inserirRespostas(respostas.splice(0));

/* ---------- leitura do banco ---------- */
const comoAdmin = (q) => JSON.parse(psql("set role authenticated; select set_config('request.jwt.claim.sub', " + lit(ADM) + ", false); select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (" + q + ") t;").trim().split("\n").pop());
const linhasBanco = JSON.parse(psql("select jsonb_agg(to_jsonb(r)) from (select id, user_id, questao_id, step, resposta, correta, modo, origem, tempo_ms, versao_item, respondida_em from public.respostas_item) r;").trim());
const questoesBanco = JSON.parse(psql("select jsonb_agg(dados) from public.questoes;").trim());
confere("gatilho corrigiu o acerto pelo gabarito", linhasBanco.every((r) => r.correta === (r.resposta !== null && r.resposta === questoesBanco.find((q) => q.id === r.questao_id).correta)));

/* ---------- mesmo cálculo no JavaScript ---------- */
const mem = new Map();
const store = new LocalStore({ storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }, bancosSimulado: { step1: [], step2ck: [] }, questoes: questoesBanco });
await store.init({ seeds: [] });
store.setDemoRole("admin");
store._respostasSinteticas = async () => [];
store.db.respostas = linhasBanco.map((r) => ({ ...r, respondida_em: new Date(r.respondida_em).toISOString() }));

const proximo = (a, b, tol) => (a === null || b === null ? a === b : Math.abs(Number(a) - Number(b)) <= tol);
const igualObj = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());
let comparados = 0;
for (const [step, incluirTutor, todasVersoes] of [["step1", false, false], ["step2ck", false, false], [null, true, false], [null, false, true]]) {
  const rotulo = (step || "todos") + (incluirTutor ? "+tutor" : "") + (todasVersoes ? "+versoes" : "");
  const sqlEst = comoAdmin("select * from public.r2a_admin_estatisticas_itens(" + lit(step) + ", " + incluirTutor + ", " + todasVersoes + ")");
  const jsEst = await store.getEstatisticasItens({ step, incluirTutor, todasVersoes });
  confere(rotulo + ": mesmo conjunto de itens", sqlEst.length === jsEst.length, sqlEst.length + " contra " + jsEst.length);
  const porId = new Map(jsEst.map((x) => [x.questao_id, x]));
  for (const s of sqlEst) {
    const j = porId.get(s.questao_id);
    if (!j) { confere(rotulo + " " + s.questao_id + " ausente no JS", false); continue; }
    comparados++;
    for (const k of ["n", "acertos", "em_branco", "n_superior", "n_inferior"]) confere(rotulo + " " + s.questao_id + " " + k, s[k] === j[k], s[k] + " contra " + j[k]);
    confere(rotulo + " " + s.questao_id + " p", proximo(s.p, j.p, 1e-6));
    confere(rotulo + " " + s.questao_id + " pbis", proximo(s.pbis, j.pbis, 1e-6), s.pbis + " contra " + j.pbis);
    confere(rotulo + " " + s.questao_id + " tempo mediano", proximo(s.tempo_mediano_ms, j.tempo_mediano_ms, 1));
    for (const k of ["opcoes", "opcoes_superior", "opcoes_inferior"]) confere(rotulo + " " + s.questao_id + " " + k, igualObj(s[k], j[k]), JSON.stringify(s[k]) + " contra " + JSON.stringify(j[k]));
  }
  const sqlMat = comoAdmin("select * from public.r2a_admin_respostas_calibracao(" + lit(step) + ", " + incluirTutor + ", " + todasVersoes + ")");
  const jsMat = await store.listRespostasCalibracao({ step, incluirTutor, todasVersoes });
  const chave = (r) => [r.pessoa, r.questao_id, r.resposta, r.correta, r.modo, r.origem, r.tempo_ms].join("|");
  const a = sqlMat.map(chave).sort(), b = jsMat.map(chave).sort();
  confere(rotulo + ": matriz pseudonimizada igual", JSON.stringify(a) === JSON.stringify(b), a.length + " contra " + b.length);
}
console.log("Itens comparados: " + comparados + "; respostas no banco: " + linhasBanco.length + ".");
console.log("Diferenças: " + diferencas.length);
for (const d of diferencas.slice(0, 30)) console.log("  " + d);
process.exit(diferencas.length ? 1 : 0);
