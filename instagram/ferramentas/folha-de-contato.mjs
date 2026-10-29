#!/usr/bin/env node
// Folha de contato dos posts renderizados: uma linha por dia com o carrossel do feed
// (post-do-dia/, na ordem em que vai ao ar) e o story do quiz.
//
//   node instagram/ferramentas/folha-de-contato.mjs 1 14 entregas/instagram-amostra-dias-1-14.png
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PASTA_INSTAGRAM, RAIZ, num3 } from './lib-dias.mjs';

const require = createRequire(import.meta.url);
const [ini, fim, saida] = [Number(process.argv[2] || 1), Number(process.argv[3] || 14), path.resolve(process.argv[4] || 'entregas/instagram-amostra-dias-1-14.png')];
const prog = JSON.parse(fs.readFileSync(path.join(PASTA_INSTAGRAM, 'programa-365.json'), 'utf8'));
const fontes = path.join(RAIZ, 'assets', 'fonts');
const b64 = (f) => fs.readFileSync(f).toString('base64');
const ff = (fam, arq, peso) => `@font-face{font-family:"${fam}";font-weight:${peso};src:url(data:font/woff2;base64,${b64(path.join(fontes, arq))}) format("woff2")}`;
const uri = (f) => `data:image/png;base64,${b64(f)}`;
const br = (iso) => iso.split('-').reverse().slice(0, 2).join('/');

const linhas = [];
for (let n = ini; n <= fim; n++) {
  const dir = path.join(PASTA_INSTAGRAM, 'saida', `dia-${num3(n)}`);
  const post = path.join(dir, 'post-do-dia');
  if (!fs.existsSync(post)) continue;
  const d = prog.dias[n - 1];
  const slides = fs.readdirSync(post).filter((f) => f.endsWith('.png')).sort();
  const cel = slides.map((f) => `<figure class="${f.includes('gabarito') ? 'gab' : 'q'}"><img src="${uri(path.join(post, f))}"><figcaption>${f.slice(0, 2)} ${f.includes('gabarito') ? 'gabarito ' + f.match(/gabarito-(\d+)/)[1] : 'questão'}</figcaption></figure>`);
  // dia 1: não há gabarito de ontem; o espaço dos slides 1 a 4 fica marcado
  if (cel.length < 8) cel.unshift(`<figure class="vazio" style="grid-column: span ${8 - cel.length}"><div>Dia 1: a estreia tem só a questão (capa, vinheta, responda e CTA). O gabarito do dia 1 abre o post do dia 2.</div></figure>`);
  const stGab = path.join(PASTA_INSTAGRAM, 'saida', `dia-${num3(n - 1)}`, 'story-gabarito.png');
  const stories = [
    n > 1 && fs.existsSync(stGab) ? `<figure class="story"><img src="${uri(stGab)}"><figcaption>12h05 gabarito ${num3(n - 1)} (quiz)</figcaption></figure>` : '<figure class="story vazio"><div>sem gabarito de ontem</div></figure>',
    `<figure class="story"><img src="${uri(path.join(dir, 'story-enquete.png'))}"><figcaption>12h06 enquete ${num3(n)}</figcaption></figure>`,
  ];
  linhas.push(`<section class="linha">
    <div class="rot"><b>DIA ${num3(n)}</b><span>${d.dia_semana.replace('-feira', '')} ${br(d.data)}</span><i>${d.quadro}</i><em>${d.step} · letra ${d.questao.correta}${d.tom === 'acolhedor' ? ' · tom acolhedor' : ''}</em></div>
    ${cel.join('')}
    ${stories.join('')}
  </section>`);
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${ff('Barlow Condensed', 'barlow-condensed-latin-800-normal.woff2', 800)}${ff('Barlow', 'barlow-latin-500-normal.woff2', 500)}${ff('Overpass Mono', 'overpass-mono-latin-600-normal.woff2', 600)}
*{box-sizing:border-box;margin:0}
body{background:#f3f5f2;color:#0d1a2b;font-family:Barlow;padding:48px;width:2620px}
header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:6px solid #0f2747;padding-bottom:18px;margin-bottom:26px}
h1{font-family:"Barlow Condensed";font-weight:800;font-size:64px;color:#0f2747;text-transform:uppercase;line-height:.95}
h1 em{font-style:normal;color:#b0243a}
header p{font-size:22px;max-width:1100px;text-align:right;color:#3a4859}
.fita{height:8px;background:linear-gradient(90deg,#1d8a4b 0 50%,#f1c232 50%);margin:-26px 0 26px}
.linha{display:grid;grid-template-columns:170px repeat(8,236px) 150px 150px;gap:10px;align-items:start;padding:12px 0;border-bottom:1px solid #dde3de}
.rot{display:flex;flex-direction:column;gap:4px;padding-top:6px}
.rot b{font-family:"Barlow Condensed";font-weight:800;font-size:40px;color:#0f2747;line-height:1}
.rot span{font-family:"Overpass Mono";font-size:15px;text-transform:uppercase}
.rot i{font-style:normal;font-weight:500;font-size:18px;color:#b0243a}
.rot em{font-style:normal;font-family:"Overpass Mono";font-size:13px;color:#5b6878}
figure img{width:100%;display:block;border-radius:6px;box-shadow:0 4px 10px rgba(13,26,43,.18)}
figure.gab img{outline:3px solid #f1c232;outline-offset:-3px}
figcaption{font-family:"Overpass Mono";font-size:12px;color:#5b6878;margin-top:4px;text-transform:uppercase}
.story.vazio div{height:266px;font-size:15px}
.vazio div{height:295px;border:2px dashed #b3bdca;border-radius:6px;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;color:#5b6878;font-size:22px;font-family:Barlow}
footer{margin-top:22px;font-size:18px;color:#3a4859}
</style></head><body>
<header><h1>Questão de Embarque<br><em>dias ${ini} a ${fim}</em></h1><p>Carrossel do feed de cada dia na ordem em que vai ao ar: a recompensa primeiro (slides 1 a 4, com borda amarela: gabarito de ontem, abrindo com a letra) e depois a questão de hoje (5 a 8, com o CTA da palavra-chave). À direita, os stories: o quiz do gabarito de ontem às 12h05 e a enquete sem gabarito de hoje às 12h06. As imagens anedóticas ainda não foram geradas: os slides mostram a marca de imagem pendente.</p></header>
<div class="fita"></div>
${linhas.join('\n')}
<footer>Gerado por instagram/ferramentas/folha-de-contato.mjs a partir de instagram/saida/. Dr. Getúlio Bernardo Morato Filho, CRM-DF 13610.</footer>
</body></html>`;
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2620, height: 1000 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
fs.mkdirSync(path.dirname(saida), { recursive: true });
await page.screenshot({ path: saida, fullPage: true });
await browser.close();
console.log(`${path.relative(RAIZ, saida)}: ${linhas.length} dias`);
