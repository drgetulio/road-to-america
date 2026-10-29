#!/usr/bin/env node
// Palavras-chave neutras na legenda do dia D e legenda_questao_pt gerada pelo mesmo
// código do render (templates/lib/legenda.mjs), para a planilha mostrar o que vai ao ar.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { blocos, salvarBloco, exportarQuestoes, PASTA_INSTAGRAM } from './lib-dias.mjs';
import { montarDia, carregarConfig } from '../templates/lib/dados.mjs';
import { legendaSoQuestao } from '../templates/lib/legenda.mjs';

const pk = JSON.parse(fs.readFileSync(path.join(PASTA_INSTAGRAM, 'ferramentas', 'palavras-chave-neutras.json'), 'utf8')).dias;
const REMIX = (step) => ['Sunday remix', 'spaced repetition', /2/.test(step) ? 'Step 2 CK review' : 'Step 1 review'];
const BS = blocos();
let n = 0;
for (const b of BS) {
  for (const d of b.dias) {
    const novo = d.remix_de ? REMIX(d.step) : pk[String(d.dia)];
    if (!novo) throw new Error(`dia ${d.dia} sem palavras-chave neutras`);
    d.legenda.palavras_chave = novo;
  }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-legendas-'));
exportarQuestoes(BS.flatMap((b) => b.dias), tmp);
const config = carregarConfig();
for (const b of BS) {
  for (const d of b.dias) {
    const dd = montarDia(d.dia, tmp, path.join(PASTA_INSTAGRAM, 'imagens'));
    const leg = legendaSoQuestao(dd, config).trimEnd();
    if (leg !== d.legenda_questao_pt) { d.legenda_questao_pt = leg; n++; }
  }
  salvarBloco(b);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`palavras-chave neutras em 365 dias; ${n} legendas da questão regeneradas`);
