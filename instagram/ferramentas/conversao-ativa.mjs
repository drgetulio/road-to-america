#!/usr/bin/env node
// Aplica a conversão ativa (instagram/conversao.json) nos 365 dias de instagram/dias/:
//  - tira o campo antigo "cta" (o CTA agora sai do quadro, do desafio e da live; para trocar
//    um dia, use "cta_forcado");
//  - tira legenda.cta_texto quando ele traz endereço escrito;
//  - troca, na legenda_explicacao_pt (comentário fixado do D+1), o parágrafo do CTA com
//    endereço pela frase com palavra-chave do dia em que ela é publicada (D+1).
// Idempotente: rodar de novo não muda nada.
//
//   node instagram/ferramentas/conversao-ativa.mjs [--conferir]
import { blocos, salvarBloco } from './lib-dias.mjs';
import { textoCta, conversao } from '../templates/lib/conversao.mjs';

const CONFERIR = process.argv.includes('--conferir');
const URL = /github\.io|https?:\/\/|www\.|\.com\.br|link na bio/i;
const BS = blocos();
const todos = BS.flatMap((b) => b.dias).sort((a, b) => a.dia - b.dia);
const porDia = new Map(todos.map((d) => [d.dia, d]));
const semMarca = (t) => String(t ?? '').replace(/\*([^*\n]+)\*/g, '$1');
const conta = { cta: 0, cta_texto: 0, explicacao: 0 };
// parágrafo de CTA já gerado por esta ferramenta (para refazer quando conversao.json muda)
const PALAVRA = /\bComente (SIMULADO|MACETE|FACULDADE|EMBARQUE|DESAFIO|LIVE)\b/;
const SEM_PALAVRA = new Set(['compartilhar', 'debate', 'salvar'].flatMap((k) => conversao().frases_cta[k]));
const ehCta = (p) => URL.test(p) || PALAVRA.test(p) || SEM_PALAVRA.has(p);

for (const d of todos) {
  if ('cta' in d) { delete d.cta; conta.cta++; }
  if (d.legenda?.cta_texto && URL.test(d.legenda.cta_texto)) { delete d.legenda.cta_texto; conta.cta_texto++; }
}
for (const d of todos) {
  const pub = porDia.get(d.dia + 1) || d; // o comentário fixado sai no post de D+1
  const frase = semMarca(textoCta({ ...pub, n: pub.dia }));
  const partes = d.legenda_explicacao_pt.split('\n\n');
  let mudou = false;
  const novas = partes.map((p) => {
    if (/cvv/i.test(p)) return p; // a linha do CVV fica
    if (ehCta(p) && p !== frase) { mudou = true; return frase; }
    return p;
  });
  if (mudou) { d.legenda_explicacao_pt = novas.join('\n\n'); conta.explicacao++; }
}
if (!CONFERIR) for (const b of BS) salvarBloco(b);
console.log(`${CONFERIR ? '[só conferência] ' : ''}campo cta retirado em ${conta.cta} dias; cta_texto com endereço retirado em ${conta.cta_texto}; CTA da legenda D+1 trocado em ${conta.explicacao}`);
