import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalStore } from "../js/store-local.js";
import { canView, canEdit, canDelete, applyInsertRules, applyUpdateRules, PermissionError } from "../js/permissions.js";
import { isStudyable } from "../js/cards.js";

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const seed = { id: "r2a-cardiovascular-001", tipo: "basico", frente: "Oficial?", verso: "Sim", sistema: "cardiovascular", disciplina: "fisiologia", tags: ["step1"] };
const base = { tipo: "basico", frente: "Which nerve?", verso: "Axillary", sistema: "musculoesqueletico_pele", disciplina: "anatomia" };

async function novaLoja() {
  const s = new LocalStore({ storage: memoria() });
  await s.init({ seeds: [seed] });
  return s;
}

test("seeds entram como oficiais aprovados", async () => {
  const s = await novaLoja();
  const lista = await s.listCards();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].baralho, "oficial");
  assert.equal(lista[0].status, "aprovado");
});

test("participante: card pessoal é estudável na hora e invisível para outros", async () => {
  const s = await novaLoja();
  s.setDemoRole("participante");
  await assert.rejects(() => s.saveCard({ ...base, baralho: "pessoal", status: "aprovado" }), PermissionError);
  const c = await s.saveCard({ ...base, baralho: "pessoal" });
  assert.equal(c.status, "rascunho");
  assert.equal(c.autor_id, "demo-participante");
  assert.ok(isStudyable(c, "demo-participante"));
  assert.ok(!isStudyable(c, "outra-pessoa"));
  assert.equal(canView(c, { id: "outra-pessoa", papel: "participante" }), false);
});

test("participante: envio à comunidade entra em revisão e não pode ser aprovado por ele", async () => {
  const s = await novaLoja();
  s.setDemoRole("participante");
  const c = await s.saveCard({ ...base, baralho: "comunidade", status: "em_revisao" });
  assert.equal(c.status, "em_revisao");
  const rasc = await s.saveCard({ ...base, frente: "Draft?", baralho: "comunidade", status: "rascunho" });
  assert.equal(rasc.status, "rascunho", "rascunho explícito continua rascunho, como no banco");
  await assert.rejects(() => s.saveCard({ ...c, status: "aprovado" }), PermissionError);
  await assert.rejects(() => s.reviewCard(c.id, { decisao: "aprovar" }), PermissionError);
  await assert.rejects(() => s.saveCard({ ...base, baralho: "oficial" }), PermissionError);
});

test("participante não edita oficial nem card de outro", async () => {
  const s = await novaLoja();
  s.setDemoRole("participante");
  await assert.rejects(() => s.saveCard({ ...seed, frente: "hack" }), PermissionError);
  s.setDemoRole("admin");
  const doAdmin = await s.saveCard({ ...base, baralho: "comunidade" });
  s.setDemoRole("participante");
  await assert.rejects(() => s.saveCard({ ...doAdmin, frente: "hack" }), PermissionError);
  await assert.rejects(() => s.deleteCard(seed.id), PermissionError);
});

test("admin aprova, e edição do autor devolve à revisão com nova versão e histórico", async () => {
  const s = await novaLoja();
  s.setDemoRole("participante");
  const c = await s.saveCard({ ...base, baralho: "comunidade" });
  s.setDemoRole("admin");
  const ap = await s.reviewCard(c.id, { decisao: "aprovar", comentario: "ok" });
  assert.equal(ap.status, "aprovado");
  assert.equal(ap.revisor_id, "demo-admin");
  s.setDemoRole("participante");
  const visto = (await s.listCards()).find((x) => x.id === c.id);
  assert.ok(visto, "aprovado aparece para o participante");
  const ed = await s.saveCard({ ...visto, verso: "Axillary nerve (C5-C6)" });
  assert.equal(ed.status, "em_revisao");
  assert.equal(ed.versao, 2);
  assert.equal(ed.revisor_id, "demo-admin", "participante não mexe no revisor");
  await assert.rejects(() => s.saveCard({ ...ap, baralho: "pessoal" }).then(() => s.saveCard({ ...ed, status: "aprovado" })), PermissionError);
  const h = await s.listHistory(c.id);
  assert.ok(h.length >= 3);
});

test("rejeição exige comentário; promoção a oficial só por admin", async () => {
  const s = await novaLoja();
  s.setDemoRole("participante");
  const c = await s.saveCard({ ...base, baralho: "comunidade" });
  await assert.rejects(() => s.promoteCard(c.id), PermissionError);
  s.setDemoRole("admin");
  await assert.rejects(() => s.reviewCard(c.id, { decisao: "rejeitar", comentario: " " }));
  const rj = await s.reviewCard(c.id, { decisao: "rejeitar", comentario: "Separe em dois cards." });
  assert.equal(rj.status, "rejeitado");
  const pr = await s.promoteCard(c.id);
  assert.equal(pr.baralho, "oficial");
  assert.equal(pr.status, "aprovado");
});

test("estado SRS, revlog e configurações são por usuário", async () => {
  const s = await novaLoja();
  s.setDemoRole("participante");
  await s.saveState({ key: "x#1", card_id: "x", ord: 1, state: 2 });
  await s.addRevlog({ card_id: "x", ord: 1, rating: 3, state: 2, review: new Date().toISOString() });
  await s.saveSettings({ retencao: 0.92 });
  s.setDemoRole("admin");
  assert.equal((await s.listStates()).length, 0);
  assert.equal((await s.listRevlog()).length, 0);
  assert.deepEqual(await s.getSettings(), {});
  s.setDemoRole("participante");
  assert.equal((await s.listStates()).length, 1);
  const [r] = await s.listRevlog();
  await s.deleteRevlog(r.id);
  assert.equal((await s.listRevlog()).length, 0);
});

test("sinalizações: participante cria e vê as suas; só admin resolve", async () => {
  const s = await novaLoja();
  s.setDemoRole("participante");
  const f = await s.addFlag({ card_id: seed.id, motivo: "erro_factual", texto: "Dose errada" });
  assert.equal(f.status, "aberta");
  await assert.rejects(() => s.resolveFlag(f.id, { status: "resolvida" }), PermissionError);
  s.setDemoRole("admin");
  assert.equal((await s.listFlags()).length, 1);
  await s.resolveFlag(f.id, { status: "resolvida", resposta: "Corrigido" });
  s.setDemoRole("participante");
  assert.equal((await s.listFlags())[0].status, "resolvida");
});

test("regras puras: exclusão e edição", () => {
  const p = { id: "p", papel: "participante" };
  const adm = { id: "a", papel: "admin" };
  const aprovado = { autor_id: "p", baralho: "comunidade", status: "aprovado" };
  assert.equal(canDelete(aprovado, p), false);
  assert.equal(canDelete({ ...aprovado, baralho: "pessoal" }, p), true);
  assert.equal(canEdit({ autor_id: "p", baralho: "oficial" }, p), false);
  assert.equal(canEdit({ autor_id: "x", baralho: "oficial" }, adm), true);
  assert.throws(() => applyInsertRules({ baralho: "pessoal", status: "rejeitado" }, p), PermissionError);
  const ins = applyInsertRules({ baralho: "comunidade", status: "em_revisao", autor_id: "outro", revisor_id: "z" }, p);
  assert.equal(ins.autor_id, "p");
  assert.equal(ins.revisor_id, null);
  const { card } = applyUpdateRules({ ...aprovado, id: "1", frente: "a", versao: 1, tags: [] }, { frente: "a", tags: [] }, p);
  assert.equal(card.status, "aprovado", "sem mudança de conteúdo, continua aprovado");
});

test("seed alterada atualiza a cópia não editada", async () => {
  const st = memoria();
  const s1 = new LocalStore({ storage: st });
  await s1.init({ seeds: [seed] });
  const s2 = new LocalStore({ storage: st });
  await s2.init({ seeds: [{ ...seed, verso: "Sim, corrigido" }] });
  const c = (await s2.listCards())[0];
  assert.equal(c.verso, "Sim, corrigido");
  assert.equal(c.versao, 2);
});
