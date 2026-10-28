/* Anotações do mentor (acréscimo da área administrativa, admin/):
   só o admin lê e grava, nos dois modos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LocalStore, CHAVE_COORTE } from "../../anki/js/store-local.js";
import { SupabaseStore } from "../../anki/js/store-supabase.js";
import { PermissionError } from "../../anki/js/permissions.js";
import { PREFIXO_SINTETICO } from "../js/coorte-demo.js";

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("anotações: participante não lê nem grava; admin grava em participante real e fictício; reset apaga", async () => {
  const storage = memoria();
  const s = new LocalStore({ storage, bancosSimulado: { step1: [], step2ck: [] } });
  await s.init({ seeds: [] });
  s.setDemoRole("participante");
  await assert.rejects(() => s.getAnotacao("demo-participante"), PermissionError);
  await assert.rejects(() => s.saveAnotacao("demo-participante", "x"), PermissionError);
  s.setDemoRole("admin");
  assert.equal(await s.getAnotacao("demo-participante"), null);
  const a = await s.saveAnotacao("demo-participante", "Conversa EXIT 18 marcada");
  assert.equal(a.atualizado_por, "demo-admin");
  assert.equal((await s.getAnotacao("demo-participante")).texto, "Conversa EXIT 18 marcada");
  const fic = PREFIXO_SINTETICO + "carla-modelo";
  await s.saveAnotacao(fic, "Sem estudo há 9 dias");
  assert.ok(storage.getItem(CHAVE_COORTE).includes("Sem estudo"), "fictício vai para a chave da coorte");
  assert.ok(!storage.getItem("r2a-anki-demo-v1").includes("Sem estudo"), "fictício não entra na chave principal");
  await assert.rejects(() => s.saveAnotacao(fic, "x".repeat(5001)), /5000/);
  await s.resetDemo();
  assert.equal(await s.getAnotacao(fic), null);
  assert.equal(await s.getAnotacao("demo-participante"), null);
});

test("anotações no Supabase: tabela e coluna existem no schema; participante é barrado antes da rede", async () => {
  const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /create table if not exists public\.anotacoes_mentor \(/);
  assert.match(schema, /create policy anotacoes_mentor_admin on public\.anotacoes_mentor for all to authenticated\s+using \(\(select public\.is_admin\(\)\)\)/);
  const chamadas = [];
  const q = new Proxy({}, {
    get(_, p) {
      if (p === "then") return (ok) => ok({ data: { user_id: "u2", texto: "t" }, error: null });
      return (...a) => { chamadas.push([p, ...a]); return q; };
    }
  });
  const s = new SupabaseStore({ url: "x", anonKey: "y" });
  s.client = { from: (t) => { chamadas.push(["from", t]); return q; } };
  s._user = { id: "u1", papel: "participante" };
  await assert.rejects(() => s.getAnotacao("u2"), PermissionError);
  assert.equal(chamadas.length, 0);
  s._user = { id: "u1", papel: "admin" };
  assert.equal((await s.getAnotacao("u2")).texto, "t");
  await s.saveAnotacao("u2", "t");
  assert.deepEqual(chamadas.filter((c) => c[0] === "from").map((c) => c[1]), ["anotacoes_mentor", "anotacoes_mentor"]);
  assert.ok(chamadas.some((c) => c[0] === "upsert" && c[2]?.onConflict === "user_id"));
});
