import { test } from "node:test";
import assert from "node:assert/strict";
import { toAnkiTsv, tsvField, parseDelimited, importDelimited, detectSeparator, toBackup, parseBackup, templateTsv } from "../js/tsv.js";

const tax = { sistemas: new Set(["cardiovascular", "geral"]), disciplinas: new Set(["farmacologia", "patologia"]) };
const cards = [
  { id: "r2a-cardiovascular-001", tipo: "basico", frente: 'Which "classic" drug?', verso: "Spironolactone", extra: "Blocks\taldosterone", nota_pt: "Aldactone", sistema: "cardiovascular", disciplina: "farmacologia", tags: ["step1", "diureticos"], rendimento: "alto", baralho: "oficial" },
  { id: "u-1", tipo: "cloze", frente: "{{c1::Furosemide}} acts on the TAL\nof the loop", verso: "", extra: "NKCC2", nota_pt: "", sistema: "cardiovascular", disciplina: "farmacologia", tags: [], rendimento: "medio", baralho: "pessoal" }
];

test("cabeçalhos do Anki e colunas", () => {
  const out = toAnkiTsv(cards, { nomesSistema: { cardiovascular: "Cardiovascular" } });
  const linhas = out.trim().split("\n");
  assert.deepEqual(linhas.slice(0, 6), ["#separator:tab", "#html:true", "#notetype column:1", "#deck column:2", "#tags column:5", "#guid column:6"]);
  const l1 = parseDelimited(linhas[6], "\t")[0];
  assert.equal(l1.length, 6);
  assert.equal(l1[0], "Basic");
  assert.equal(l1[1], "Road to America::Step 1::Cardiovascular");
  assert.equal(l1[2], 'Which "classic" drug?');
  assert.match(l1[3], /Spironolactone<hr><div class="r2a-extra">Blocks\taldosterone<\/div>/);
  assert.match(l1[4], /R2A::sistema::cardiovascular/);
  assert.match(l1[4], /R2A::alto_rendimento/);
  assert.equal(l1[5], "r2a:r2a-cardiovascular-001");
  const l2 = parseDelimited(linhas[7], "\t")[0];
  assert.equal(l2[0], "Cloze");
  assert.equal(l2[2], "{{c1::Furosemide}} acts on the TAL<br>of the loop");
  assert.equal(linhas.length, 8, "quebra de linha não cria linha nova");
});

test("campo com aspas e tabulação vai entre aspas duplas", () => {
  assert.equal(tsvField('a"b'), '"a""b"');
  assert.equal(tsvField("a\tb"), '"a\tb"');
  assert.equal(tsvField("a\nb"), "a<br>b");
  assert.equal(tsvField("simples"), "simples");
});

test("ida e volta: exportar e importar preserva o conteúdo", () => {
  const { cards: lidos, erros } = importDelimited(toAnkiTsv(cards), { taxonomia: tax });
  assert.deepEqual(erros, []);
  assert.equal(lidos.length, 2);
  assert.equal(lidos[0].id, "r2a-cardiovascular-001");
  assert.equal(lidos[0].verso, "Spironolactone");
  assert.equal(lidos[0].extra, "Blocks\taldosterone");
  assert.equal(lidos[0].nota_pt, "Aldactone");
  assert.equal(lidos[0].sistema, "cardiovascular");
  assert.equal(lidos[0].disciplina, "farmacologia");
  assert.deepEqual(lidos[0].tags, ["step1", "diureticos"]);
  assert.equal(lidos[1].tipo, "cloze");
  assert.equal(lidos[1].rendimento, "medio");
});

test("importa CSV com cabeçalho, aspas e vírgulas no texto", () => {
  const csv = 'frente,verso,sistema,disciplina,tags\n"Which drug, if any?","Atropine, IV",cardiovascular,farmacologia,"a b"\nSem sistema,x,,patologia,\n';
  assert.equal(detectSeparator(csv), ",");
  const { cards: lidos, erros } = importDelimited(csv, { taxonomia: tax });
  assert.equal(lidos.length, 1);
  assert.equal(lidos[0].frente, "Which drug, if any?");
  assert.equal(lidos[0].verso, "Atropine, IV");
  assert.deepEqual(lidos[0].tags, ["a", "b"]);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].linha, 3);
});

test("planilha-modelo é importável", () => {
  const { cards: lidos, erros } = importDelimited(templateTsv(), { taxonomia: { sistemas: new Set(["gastrointestinal"]), disciplinas: new Set(["bioquimica"]) } });
  assert.equal(erros.length, 0);
  assert.equal(lidos.length, 1);
});

test("backup JSON", () => {
  const txt = toBackup({ cards, estados: [], revlog: [], configuracoes: { retencao: 0.9 }, usuario: { id: "u" } });
  const o = parseBackup(txt);
  assert.equal(o.cards.length, 2);
  assert.throws(() => parseBackup('{"x":1}'));
});
