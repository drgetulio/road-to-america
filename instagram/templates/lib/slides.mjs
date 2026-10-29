// Monta o HTML de cada peça. Tudo vai embutido (fontes, CSS e imagens em data URI)
// para o Chromium renderizar sem depender de servidor nem de rede.
import fs from 'node:fs';
import path from 'node:path';
import { PASTA_TEMPLATES, RAIZ, num3, dataCurta } from './dados.mjs';

// ---------- texto ----------
export const esc = (t) =>
  String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// *destaque* vira <em>; quebra de linha vira <br>
// termos curtos com hífen (pré-B, 10-month-old, fast-growing) não quebram no meio
const semQuebra = (h) =>
  h.replace(/(^|[\s(>])([\p{L}\p{N}]+(?:-[\p{L}\p{N}+]+)+)(?=[\s.,;:!?)<]|$)/gu, (m, a, b) => (b.length <= 18 ? `${a}<span class="nw">${b}</span>` : m));
export const rico = (t) => semQuebra(esc(t).replace(/\*([^*]+)\*/g, '<em>$1</em>')).replace(/\n/g, '<br>');
export const semMarca = (t) => String(t ?? '').replace(/\*/g, '');

// ---------- recursos embutidos ----------
let _fontes = null;
function cssFontes() {
  if (_fontes) return _fontes;
  const dir = path.join(RAIZ, 'assets', 'fonts');
  const f = (familia, arq, peso, estilo = 'normal') => {
    const b64 = fs.readFileSync(path.join(dir, arq)).toString('base64');
    return `@font-face{font-family:"${familia}";font-style:${estilo};font-weight:${peso};src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
  };
  _fontes = [
    f('Barlow Condensed', 'barlow-condensed-latin-600-normal.woff2', 600),
    f('Barlow Condensed', 'barlow-condensed-latin-700-normal.woff2', 700),
    f('Barlow Condensed', 'barlow-condensed-latin-800-normal.woff2', 800),
    f('Barlow Condensed', 'barlow-condensed-latin-700-italic.woff2', 700, 'italic'),
    f('Barlow', 'barlow-latin-400-normal.woff2', 400),
    f('Barlow', 'barlow-latin-500-normal.woff2', 500),
    f('Barlow', 'barlow-latin-600-normal.woff2', 600),
    f('Overpass Mono', 'overpass-mono-latin-400-normal.woff2', 400),
    f('Overpass Mono', 'overpass-mono-latin-600-normal.woff2', 600),
  ].join('\n');
  return _fontes;
}

let _css = null;
const cssBase = () => (_css ??= fs.readFileSync(path.join(PASTA_TEMPLATES, 'estilo.css'), 'utf8'));

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const _imgs = new Map();
function dataURI(arq) {
  if (!_imgs.has(arq)) {
    const mime = MIME[path.extname(arq).toLowerCase()] || 'application/octet-stream';
    _imgs.set(arq, `data:${mime};base64,${fs.readFileSync(arq).toString('base64')}`);
  }
  return _imgs.get(arq);
}

// Ajusta a fonte de cada [data-fit] até o conteúdo caber; informa o que não coube.
const SCRIPT_AJUSTE = (token) => `
(async () => {
  await document.fonts.ready;
  const avisos = [];
  for (const el of document.querySelectorAll('[data-fit]')) {
    const min = parseFloat(el.dataset.min || '14');
    let fs = parseFloat(getComputedStyle(el).fontSize);
    // títulos com entrelinha menor que 1 sempre "vazam" alguns px de tinta; a folga cobre isso
    const passa = () => el.scrollHeight > el.clientHeight + Math.max(2, fs * 0.14) || el.scrollWidth > el.clientWidth + 1;
    while (passa() && fs > min) { fs -= 1; el.style.fontSize = fs + 'px'; }
    if (passa()) avisos.push(el.dataset.fit + ' não coube nem com ' + min + ' px');
    el.dataset.final = fs;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__avisos = avisos;
  window.__pronto = ${JSON.stringify(token)};
})();`;

let _token = 0;
export function pagina(corpo, { largura, altura }) {
  const token = `p${++_token}`;
  return { token, html: paginaHTML(corpo, { largura, altura }, token) };
}
function paginaHTML(corpo, { largura, altura }, token) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>${cssFontes()}</style><style>${cssBase()}</style>
<style>html,body{width:${largura}px;height:${altura}px}</style></head>
<body>${corpo}<script>${SCRIPT_AJUSTE(token)}</script></body></html>`;
}

// ---------- personagens ----------
const OLHOS = (y = 46, dx = 13) => `<circle cx="${50 - dx}" cy="${y}" r="8" fill="#fff" stroke="#0f2747" stroke-width="4"/><circle cx="${50 + dx}" cy="${y}" r="8" fill="#fff" stroke="#0f2747" stroke-width="4"/><circle cx="${51 - dx}" cy="${y + 1}" r="3.5" fill="#0f2747"/><circle cx="${51 + dx}" cy="${y + 1}" r="3.5" fill="#0f2747"/>`;
const PERSONAGENS = {
  'Macrô': { bordao: 'Comi, mostrei, avisei.', svg: `<path d="M28 84c-14-2-20-14-16-25-8-7-5-20 6-22 1-14 15-22 28-17 9-9 24-6 28 6 13 2 18 15 12 25 7 8 3 21-8 24 0 10-12 15-22 11-9 4-20 3-28-2z" fill="#c9b8e8" stroke="#0f2747" stroke-width="4.5" stroke-linejoin="round"/>${OLHOS(46, 12)}<path d="M38 70h26l-13 13z" fill="#fff" stroke="#0f2747" stroke-width="3.5" stroke-linejoin="round"/><path d="M42 70h5l-2.5 3zM52 70h5l-2.5 3zM47 75h5l-2.5 3z" fill="#b0243a"/>` },
  'Mito': { bordao: 'Sem oxigênio eu não trabalho.', svg: `<ellipse cx="50" cy="52" rx="38" ry="28" transform="rotate(-18 50 52)" fill="#f29a4a" stroke="#0f2747" stroke-width="4.5"/><path d="M22 64c6-10 10 6 16-4s10 6 16-4 10 6 16-4 8 4 10 0" fill="none" stroke="#0f2747" stroke-width="3.5" stroke-linecap="round"/>${OLHOS(42, 12)}<path d="M33 52q5 3 10 0M57 52q5 3 10 0" fill="none" stroke="#0f2747" stroke-width="2.5" stroke-linecap="round"/>` },
  'Seu Néfron': { bordao: 'Sem carimbo, não sai.', svg: `<path d="M50 14c22-6 38 12 34 34s-16 40-36 38S12 72 18 58c4-9 14-6 14-16S30 19 50 14z" fill="#8a2a42" stroke="#0f2747" stroke-width="4.5" stroke-linejoin="round"/><circle cx="40" cy="44" r="9" fill="#fff" stroke="#0f2747" stroke-width="3.5"/><circle cx="62" cy="44" r="9" fill="#fff" stroke="#0f2747" stroke-width="3.5"/><path d="M49 44h4" stroke="#0f2747" stroke-width="3.5"/><circle cx="41" cy="45" r="3.2" fill="#0f2747"/><circle cx="63" cy="45" r="3.2" fill="#0f2747"/><path d="M47 62l4-4 4 4-4 20z" fill="#0f2747"/>` },
  'Capitã Plaqueta': { bordao: 'Parou, colou, coagulou.', svg: `<circle cx="50" cy="56" r="32" fill="#f1c232" stroke="#0f2747" stroke-width="4.5"/><path d="M22 34c4-14 52-14 56 0z" fill="#0f2747"/><rect x="18" y="32" width="64" height="7" rx="3.5" fill="#0f2747"/><circle cx="50" cy="26" r="4" fill="#f1c232"/>${OLHOS(54, 12)}<path d="M24 74q26 14 52 0" fill="none" stroke="#1d8a4b" stroke-width="7" stroke-linecap="round"/>` },
  'Tia Meia-Vida': { bordao: 'Cinco meias-vidas e ninguém lembra mais.', svg: `<path d="M24 12h52M24 88h52" stroke="#0f2747" stroke-width="6" stroke-linecap="round"/><path d="M29 14h42c0 18-14 26-21 36 7 10 21 18 21 36H29c0-18 14-26 21-36-7-10-21-18-21-36z" fill="#fff" stroke="#0f2747" stroke-width="4.5" stroke-linejoin="round"/><path d="M36 82c4-10 10-12 14-14 4 2 10 4 14 14z" fill="#f1c232"/><path d="M38 26h24c-3 6-8 10-12 14-4-4-9-8-12-14z" fill="#f1c232"/><circle cx="41" cy="30" r="6" fill="none" stroke="#b0243a" stroke-width="3"/><circle cx="59" cy="30" r="6" fill="none" stroke="#b0243a" stroke-width="3"/><path d="M47 30h6" stroke="#b0243a" stroke-width="3"/>` },
  'Viés': { bordao: 'Se você não randomizou, eu entrei.', svg: `<path d="M20 86V44c0-18 13-30 30-30s30 12 30 30v42l-7.5-7-7.5 7-7.5-7-7.5 7-7.5-7-7.5 7-7.5-7z" fill="#fff" stroke="#0f2747" stroke-width="4.5" stroke-linejoin="round"/><ellipse cx="40" cy="44" rx="5" ry="7" fill="#0f2747"/><ellipse cx="60" cy="44" rx="5" ry="7" fill="#0f2747"/><circle cx="74" cy="66" r="9" fill="#dde3de" stroke="#0f2747" stroke-width="4"/><path d="M80 73l7 8" stroke="#0f2747" stroke-width="5" stroke-linecap="round"/>` },
};
export const avatar = (nome) => (PERSONAGENS[nome] ? `<svg class="avatar" viewBox="0 0 100 100">${PERSONAGENS[nome].svg}</svg>` : '');

// ---------- peças de identidade ----------
const passoDoStep = (step) => (/2/.test(step) ? { n: '2', sub: 'CK' } : { n: '1', sub: '' });

export function escudo(step, classe = '') {
  const { n, sub } = passoDoStep(step);
  return `<svg class="escudo ${classe}" viewBox="0 0 100 112" aria-label="${esc(step)}">
  <path d="M9 6H91C93.8 16.5 93.8 26.3 91 34.6C98.8 57.4 95.2 80.4 74.8 96.4C64.3 104.6 55.4 107.9 50 110C44.6 107.9 35.7 104.6 25.2 96.4C4.8 80.4 1.2 57.4 9 34.6C6.2 26.3 6.2 16.5 9 6Z" fill="#0f2747"/>
  <path d="M12.2 10.2H87.8C89.6 17 89.6 24 87.8 30.2H12.2C10.4 24 10.4 17 12.2 10.2Z" fill="#b0243a"/>
  <path d="M12.2 10.2H87.8C89.6 17 89.6 24 87.8 30.2C94.6 53 91 74.6 72.6 89.6C63 97.4 55 100.6 50 102.6C45 100.6 37 97.4 27.4 89.6C9 74.6 5.4 53 12.2 30.2C10.4 24 10.4 17 12.2 10.2Z" fill="none" stroke="#f3f5f2" stroke-width="2.4"/>
  <text x="50" y="25.4" text-anchor="middle" font-family="Overpass Mono" font-weight="600" font-size="12.5" letter-spacing="2.2" fill="#fff">STEP</text>
  <text x="50" y="${sub ? 75 : 84}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="${sub ? 50 : 60}" fill="#fff">${n}</text>
  ${sub ? '<text x="50" y="93" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="19" letter-spacing="2" fill="#f1c232">CK</text>' : ''}
</svg>`;
}

// Escudo pequeno do logotipo (o mesmo do favicon do site)
const LOGO = `<svg class="logo" viewBox="0 0 34 38"><path d="M3 2.5h28c.9 3.4.9 6.6 0 9.3 2.6 7.6 1.4 15.3-5.4 20.7-3.6 2.8-6.6 3.9-8.6 4.6-2-.7-5-1.8-8.6-4.6C1.6 27.1.4 19.4 3 11.8c-.9-2.7-.9-5.9 0-9.3z" fill="#0f2747" stroke="#f3f5f2" stroke-width="1.2"/><path d="M3.4 3.3h27.2c.6 2.6.6 5 0 7.2H3.4c-.6-2.2-.6-4.6 0-7.2z" fill="#b0243a"/><path d="M11 17h12M11 22h12M11 27h12" stroke="#f1c232" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="4 3"/></svg>`;

export const fita = (classe = '') => `<span class="fita ${classe}"></span>`;

export function marca(claro = false) {
  return `<div class="marca ${claro ? 'marca--clara' : ''}">${LOGO}<div class="marca__txt"><b>ROAD TO AMERICA</b>${fita()}</div></div>`;
}

function linhasDoQuadro(quadro) {
  const p = semMarca(quadro).toUpperCase().split(/\s+/);
  if (p.length <= 1) return [p[0] || '', ''];
  if (['DE', 'DO', 'DA', 'NA', 'NO'].includes(p[1])) return [p.slice(0, 2).join(' '), p.slice(2).join(' ')];
  return [p[0], p.slice(1).join(' ')];
}

let _seloId = 0;
// Selo circular do quadro, com tinta falhada (feTurbulence)
export function selo(dia, classe = '') {
  const id = `s${++_seloId}`;
  const [l1, l2] = linhasDoQuadro(dia.quadro);
  const step = /2/.test(dia.step) ? 'STEP 2 CK' : 'STEP 1';
  return `<svg class="selo ${classe}" viewBox="0 0 300 300" aria-label="${esc(dia.quadro)}">
  <defs>
    <path id="${id}a" d="M150 150 m-112 0 a112 112 0 1 1 224 0"/>
    <path id="${id}b" d="M150 150 m-122 0 a122 122 0 0 0 244 0"/>
    <filter id="${id}f" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${dia.n % 97}" result="r"/>
      <feColorMatrix in="r" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.75" result="m"/>
      <feComposite in="SourceGraphic" in2="m" operator="in"/>
    </filter>
  </defs>
  <circle cx="150" cy="150" r="146" fill="rgba(243,245,242,0.94)"/>
  <g filter="url(#${id}f)" fill="none" stroke="#b0243a">
    <circle cx="150" cy="150" r="140" stroke-width="7"/>
    <circle cx="150" cy="150" r="96" stroke-width="3"/>
    <g fill="#b0243a" stroke="none" font-family="Overpass Mono" font-weight="600">
      <text font-size="21" letter-spacing="3.2"><textPath href="#${id}a" startOffset="50%" text-anchor="middle">QUESTÃO DE EMBARQUE</textPath></text>
      <text font-size="21" letter-spacing="3.2"><textPath href="#${id}b" startOffset="50%" text-anchor="middle" dominant-baseline="hanging">${step} · DIA ${num3(dia.n)}</textPath></text>
      <text x="150" y="${l2 ? 140 : 162}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="${l1.length > 9 ? 40 : 46}" letter-spacing="0.5">${esc(l1)}</text>
      ${l2 ? `<text x="150" y="186" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="${l2.length > 8 ? 46 : 54}" letter-spacing="0.5">${esc(l2)}</text>` : ''}
      <circle cx="40" cy="150" r="5"/><circle cx="260" cy="150" r="5"/>
    </g>
  </g>
</svg>`;
}

const ICONES = {
  balao: '<svg viewBox="0 0 48 48" class="ico"><path d="M8 10h32a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H22l-9 8v-8H8a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M14 20h20M14 26h12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  quiz: '<svg viewBox="0 0 48 48" class="ico"><rect x="5" y="6" width="38" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M13 18l4 4 7-8M13 32h22" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  salvar: '<svg viewBox="0 0 48 48" class="ico"><path d="M12 6h24a2 2 0 0 1 2 2v34l-14-9-14 9V8a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
  enviar: '<svg viewBox="0 0 48 48" class="ico"><path d="M43 5L4 21l15 6 6 15z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M43 5L19 27" stroke="currentColor" stroke-width="4"/></svg>',
  certo: '<svg viewBox="0 0 48 48" class="ico"><path d="M9 25l10 10L40 13" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  errado: '<svg viewBox="0 0 48 48" class="ico"><path d="M12 12l24 24M36 12L12 36" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>',
  seta: '<svg viewBox="0 0 48 48" class="ico"><path d="M8 24h30M26 12l12 12-12 12" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  saida: '<svg viewBox="0 0 100 100" class="ico"><path d="M22 80 L72 30 M40 26 H76 V62" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  aviao: '<svg viewBox="0 0 48 48" class="ico"><path d="M44 22c0-2-2-3-4-3H30L19 4h-5l6 15H11l-4-5H3l3 10-3 10h4l4-5h9l-6 15h5l11-15h10c2 0 4-1 4-3z" fill="currentColor"/></svg>',
  relogio: '<svg viewBox="0 0 48 48" class="ico"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 13v12l8 5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
};

function imagem(img, classe = '') {
  if (img && img.caminho) {
    return `<img class="foto ${classe}" src="${dataURI(img.caminho)}" style="object-position:${esc(img.foco)}" alt="${esc(img.alt || '')}">`;
  }
  return `<div class="pendente ${classe}">
    <div class="pendente__miolo">
      <div class="pendente__tag">IMAGEM PENDENTE</div>
      <div class="pendente__arq">${esc(img ? img.esperado : 'sem campo imagem')}</div>
      ${img && img.cena ? `<p class="pendente__cena">${esc(img.cena)}</p>` : ''}
      <div class="pendente__dica">Gere com o prompt base do PROGRAMA.md, seção 3, e salve com este nome.</div>
    </div>
  </div>`;
}

const tarja = (dia) => (dia.exemplo ? '<div class="tarja">EXEMPLO DE TESTE · NÃO POSTAR</div>' : '');
const cvv = (dia) => (dia.cvv ? '<div class="cvv">Precisa conversar? CVV 188, 24 horas, ligação gratuita.</div>' : '');

function topo(dia, rotulo, claro = true) {
  const area = semMarca(dia.area).replace(/\s*\(.*\)\s*/, '').toUpperCase();
  return `<header class="topo ${claro ? '' : 'topo--escuro'}">
    ${escudo(dia.step, 'escudo--mini')}
    <div class="topo__txt"><b>${esc(rotulo)}</b><span>${esc(area)}</span></div>
    <div class="topo__data">${esc(dia.dia_curto)} ${esc(dataCurta(dia.data))}</div>
  </header>`;
}

function rodape(direita, claro = false) {
  return `<footer class="rodape ${claro ? 'rodape--claro' : ''}">${marca(claro)}<div class="rodape__dir">${direita}</div></footer>`;
}
const arraste = (txt = 'ARRASTE') => `<span class="arraste">${txt} ${ICONES.seta}</span>`;

const alternativa = (dia, letra) => dia.questao.alternativas.find((a) => a.letra === letra) || { texto: '' };

// =====================================================================
// QUESTÃO (1080x1350, 3 slides)
// =====================================================================
export function questaoCapa(dia) {
  const tom = dia.tom === 'acolhedor' ? 'capa--acolhedor' : '';
  return `<div class="tela capa ${tom}">
    <div class="capa__img">${imagem(dia.imagem)}</div>
    <div class="capa__veu"></div>
    <header class="capa__topo">
      ${escudo(dia.step, 'escudo--capa')}
      <div class="chip-data"><b>${esc(dia.dia_curto)} ${esc(dataCurta(dia.data))}</b><span>QUESTÃO DO DIA</span></div>
    </header>
    ${selo(dia, 'selo--capa')}
    <section class="placa capa__placa">
      <div class="placa__aba">DIA ${num3(dia.n)}</div>
      <h1 class="placa__texto" data-fit="gancho da capa" data-min="60">${rico(dia.gancho)}</h1>
      ${dia.gancho_apoio ? `<p class="placa__apoio" data-fit="apoio da capa" data-min="26">${rico(dia.gancho_apoio)}</p>` : ''}
      <div class="placa__pe">
        <span class="placa__marca">${LOGO}ROAD TO AMERICA</span>
        <span class="placa__seta">QUESTÃO EM INGLÊS ${ICONES.saida}</span>
      </div>
    </section>
    ${tarja(dia)}
  </div>`;
}

export function questaoEnunciado(dia) {
  const q = dia.questao;
  const alts = q.alternativas
    .map((a) => `<li class="alt"><span class="alt__letra">${a.letra}</span><span class="alt__txt">${esc(a.texto)}</span>${a.dia != null ? `<span class="alt__visto">VISTO NO<br>DIA ${num3(a.dia)}</span>` : ''}</li>`)
    .join('');
  return `<div class="tela papel q2">
    ${topo(dia, `DIA ${num3(dia.n)} · ${semMarca(dia.quadro).toUpperCase()}`)}
    <main class="q2__corpo" data-fit="vinheta e alternativas" data-min="30">
      <p class="vinheta">${rico(q.vinheta)}</p>
      <p class="pergunta">${rico(q.pergunta)}</p>
      <ol class="alts">${alts}</ol>
    </main>
    ${rodape(arraste('SUA LETRA'), true)}
    ${cvv(dia)}${tarja(dia)}
  </div>`;
}

export function questaoResponda(dia, config) {
  const teclas = ['A', 'B', 'C', 'D'].map((l) => `<span class="tecla">${l}</span>`).join('');
  const quando = dia.explicacao_em ? dataCurta(dia.explicacao_em) : 'amanhã';
  const ctaDia = dia.legenda.cta_slide || 'Salve o post: este conceito volta no Remix de domingo.';
  return `<div class="tela noite q3 copacabana-fundo">
    <h2 class="q3__titulo">E aí, qual é a <em>letra?</em></h2>
    <div class="teclas">${teclas}</div>
    <ul class="passos">
      <li>${ICONES.balao}<div><b>Comente a letra aqui embaixo</b><span>Errar aqui é de graça. Na prova, não.</span></div></li>
      <li>${ICONES.quiz}<div><b>Ou responda no quiz dos stories</b><span>O resultado parcial sai às 20h30.</span></div></li>
    </ul>
    <div class="bilhete">
      <div class="bilhete__main">
        <div class="bilhete__rot">CARTÃO DE EMBARQUE</div>
        <div class="bilhete__grande">GABARITO</div>
        <dl class="bilhete__campos">
          <div><dt>DATA</dt><dd>${esc(quando)}</dd></div>
          <div><dt>HORA</dt><dd>${esc(config.horario_feed.toUpperCase())}</dd></div>
          <div><dt>PORTÃO</dt><dd>FEED</dd></div>
        </dl>
      </div>
      <div class="bilhete__canhoto">
        <span>DIA</span><b>${num3(dia.n)}</b><span>${/2/.test(dia.step) ? 'STEP 2 CK' : 'STEP 1'}</span>
      </div>
    </div>
    <p class="q3__cta">${ICONES.salvar}<span>${rico(ctaDia)}</span></p>
    ${rodape('', false)}
    ${cvv(dia)}${tarja(dia)}
  </div>`;
}

// =====================================================================
// EXPLICAÇÃO (1080x1350, 5 slides; sai no dia seguinte)
// =====================================================================
export function explicacaoResposta(dia) {
  const c = dia.questao.correta;
  const alt = alternativa(dia, c);
  return `<div class="tela capa e1">
    <div class="capa__img">${imagem(dia.imagem)}</div>
    <div class="capa__veu"></div>
    <header class="capa__topo">
      <div class="chip-ontem"><span>RESPOSTA DE ONTEM</span><b>DIA ${num3(dia.n)} · ${esc(semMarca(dia.quadro).toUpperCase())}</b></div>
    </header>
    <div class="carimbo">
      <svg viewBox="0 0 300 300"><defs><filter id="cf" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${dia.n}" result="r"/><feColorMatrix in="r" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.75" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>
      <path id="ca" d="M150 150 m-114 0 a114 114 0 1 1 228 0"/></defs>
      <circle cx="150" cy="150" r="146" fill="rgba(243,245,242,0.95)"/>
      <g filter="url(#cf)" fill="#b0243a"><circle cx="150" cy="150" r="138" fill="none" stroke="#b0243a" stroke-width="8"/><circle cx="150" cy="150" r="104" fill="none" stroke="#b0243a" stroke-width="3"/>
      <text font-family="Overpass Mono" font-weight="600" font-size="22" letter-spacing="4"><textPath href="#ca" startOffset="50%" text-anchor="middle">GABARITO OFICIAL</textPath></text>
      <text x="150" y="214" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="190">${esc(c)}</text></g>
      </svg>
    </div>
    <section class="resposta">
      <div class="resposta__rot">${ICONES.certo}<span>RESPOSTA ${esc(c)}</span></div>
      <h1 class="resposta__txt" data-fit="texto da resposta" data-min="48">${esc(alt.texto)}</h1>
      ${dia.explicacao.titulo ? `<p class="resposta__sub" data-fit="título da explicação" data-min="28">${rico(dia.explicacao.titulo)}</p>` : ''}
      <div class="resposta__pe">${marca(false)}${arraste('O PORQUÊ')}</div>
    </section>
    ${tarja(dia)}
  </div>`;
}

export function explicacaoCerta(dia) {
  const c = dia.questao.correta;
  const termos = dia.explicacao.termos.length
    ? `<div class="termos"><span class="termos__rot">TERMOS-CHAVE</span>${dia.explicacao.termos.map((t) => `<span class="termo">${esc(t)}</span>`).join('')}</div>`
    : '';
  return `<div class="tela papel e2">
    ${topo(dia, `GABARITO · DIA ${num3(dia.n)}`)}
    <div class="selo-letra selo-letra--certa"><span class="selo-letra__l">${esc(c)}</span>${ICONES.certo}</div>
    <div class="eyebrow eyebrow--verde">POR QUE A ${esc(c)} ESTÁ CERTA</div>
    <main class="e2__corpo" data-fit="explicação da certa" data-min="28">
      ${dia.explicacao.titulo ? `<h2 class="e2__titulo">${rico(dia.explicacao.titulo)}</h2>` : ''}
      ${dia.explicacao.certa.map((p) => `<p>${rico(p)}</p>`).join('')}
    </main>
    ${termos}
    ${rodape(arraste('E AS OUTRAS?'), true)}
    ${cvv(dia)}${tarja(dia)}
  </div>`;
}

export function explicacaoErradas(dia) {
  const c = dia.questao.correta;
  const erradas = dia.questao.alternativas.filter((a) => a.letra !== c);
  const lista = erradas
    .map((a) => `<li class="errada">
        <span class="errada__letra">${a.letra}${ICONES.errado}</span>
        <div><b class="errada__opc">${esc(a.texto)}</b><p>${rico(dia.explicacao.erradas[a.letra] || '')}</p></div>
      </li>`)
    .join('');
  const letras = erradas.map((a) => a.letra);
  const titulo = `Por que não é ${letras.slice(0, -1).join(', ')} nem ${letras.slice(-1)}`;
  return `<div class="tela papel2 e3">
    ${topo(dia, `GABARITO · DIA ${num3(dia.n)}`)}
    <div class="eyebrow eyebrow--verm">E AS OUTRAS?</div>
    <h2 class="e3__titulo">${esc(titulo)}</h2>
    <div class="e3__certa">${ICONES.certo}<b>${esc(c)}</b><span>${esc(alternativa(dia, c).texto)}</span></div>
    <ol class="erradas" data-fit="alternativas erradas" data-min="26">${lista}</ol>
    ${rodape(arraste('O MACETE'), true)}
    ${cvv(dia)}${tarja(dia)}
  </div>`;
}

export function explicacaoMacete(dia) {
  const m = dia.explicacao.macete;
  const p = dia.personagem && PERSONAGENS[dia.personagem];
  const fala = m.fala || (p ? p.bordao : null);
  const blocoImg = dia.imagem_macete ? `<div class="e4__img">${imagem(dia.imagem_macete)}</div>` : '';
  const personagem = p
    ? `<div class="persona"><span class="persona__av">${avatar(dia.personagem)}</span><div><b class="persona__nome">${esc(dia.personagem.toUpperCase())}</b>${fala ? `<span class="persona__fala">“${esc(fala)}”</span>` : ''}</div></div>`
    : '';
  return `<div class="tela noite e4 ${dia.imagem_macete ? 'e4--com-img' : ''} copacabana-fundo">
    <section class="placa placa--macete">
      <div class="placa__aba">ATALHO</div>
      <div class="placa__linha"><span>MACETE PARA A PROVA</span>${ICONES.saida}</div>
    </section>
    ${blocoImg}
    <main class="e4__corpo" data-fit="macete" data-min="40">
      <div class="ficha">
        <span class="ficha__fita"></span>
        <div class="ficha__rot"><span>CARTÃO DE REVISÃO</span><span>DIA ${num3(dia.n)} · ${/2/.test(dia.step) ? 'STEP 2 CK' : 'STEP 1'}</span></div>
        <p class="e4__frase">${rico(m.frase || semMarca(dia.conceito))}</p>
      </div>
      ${m.apoio ? `<p class="e4__apoio">${rico(m.apoio)}</p>` : ''}
    </main>
    ${personagem}
    ${rodape(arraste(), false)}
    ${cvv(dia)}${tarja(dia)}
  </div>`;
}

export function explicacaoCTA(dia, config) {
  const step = /2/.test(dia.step) ? 'STEP 2 CK' : 'STEP 1';
  const ass = config.assinatura;
  const assinatura = [ass.nome, ass.crm, ass.rqe && ass.especialidade ? `${ass.especialidade}, RQE ${ass.rqe}` : null].filter(Boolean).join(' · ');
  const barras = Array.from({ length: 22 }, (_, i) => `<i style="height:${[3, 6, 2, 4, 7, 3, 5][(i * 5 + dia.n) % 7]}px"></i>`).join('');
  return `<div class="tela papel e5">
    <div class="e5__topo">${marca(true)}<span class="e5__dia">DIA ${num3(dia.n)}</span></div>
    <h2 class="e5__titulo">Gostou do <em>formato?</em></h2>
    <p class="e5__sub">Faça um bloco inteiro de 30 minutos, grátis, no simulado da Road to America.</p>
    <div class="passagem">
      <div class="passagem__main">
        <div class="passagem__cab"><span>CARTÃO DE EMBARQUE</span><b>SIMULADO GRÁTIS</b></div>
        <div class="passagem__rota">
          <div><small>DE</small><b>BRA</b><span>Sua rotina</span></div>
          <div class="passagem__voo"><i></i>${ICONES.aviao}<i></i></div>
          <div><small>PARA</small><b>${/2/.test(dia.step) ? 'CK' : 'S1'}</b><span>USMLE ${esc(step)}</span></div>
        </div>
        <dl class="passagem__campos">
          <div><dt>PASSAGEIRO</dt><dd>VOCÊ</dd></div>
          <div><dt>DURAÇÃO</dt><dd>30 MIN</dd></div>
          <div><dt>TARIFA</dt><dd class="amarelo">GRÁTIS</dd></div>
          <div><dt>PORTÃO</dt><dd>LINK NA BIO</dd></div>
        </dl>
      </div>
      <div class="passagem__canhoto"><div class="barras">${barras}</div><span>EMBARQUE LIVRE</span></div>
    </div>
    <ul class="e5__lista">
      <li>${ICONES.salvar}<span><b>Salve.</b> Este conceito volta no Remix de domingo.</span></li>
      <li>${ICONES.enviar}<span><b>Mande</b> para quem vai fazer o Step com você.</span></li>
    </ul>
    <footer class="e5__ass">${esc(assinatura)}<span>Conteúdo educacional. Condutas conforme as diretrizes dos EUA cobradas no USMLE.</span></footer>
    ${cvv(dia)}${tarja(dia)}
  </div>`;
}

// =====================================================================
// STORY DO QUIZ (1080x1920)
// =====================================================================
export function storyQuiz(dia, { guia = false } = {}) {
  const q = dia.questao;
  return `<div class="tela tela--story story copacabana-fundo">
    <header class="story__topo">
      ${escudo(dia.step, 'escudo--story')}
      <div class="story__rot"><b>DIA ${num3(dia.n)}</b><span>${esc(semMarca(dia.quadro).toUpperCase())}</span></div>
    </header>
    <figure class="story__foto">${imagem(dia.imagem)}</figure>
    <section class="story__card">
      <h2 class="story__gancho" data-fit="gancho do story" data-min="40">${rico(dia.gancho)}</h2>
      <div class="story__q" data-fit="vinheta do story" data-min="27">
        <p class="vinheta">${rico(q.vinheta)}</p>
        <p class="pergunta">${rico(q.pergunta)}</p>
      </div>
    </section>
    <div class="story__dica">TOQUE NA SUA LETRA ${ICONES.seta}</div>
    <div class="story__adesivo ${guia ? 'story__adesivo--guia' : ''}">${guia ? '<span>ADESIVO DE QUIZ AQUI<br><small>4 opções: A, B, C, D</small></span>' : ''}</div>
    <footer class="story__pe">${ICONES.relogio}<span>Gabarito completo amanhã, ${esc(dia.explicacao_em ? dataCurta(dia.explicacao_em) : '')}, às 12h no feed</span></footer>
    ${cvv(dia)}${tarja(dia)}
  </div>`;
}

// =====================================================================
// CAPA DE REEL (1080x1920, opcional)
// =====================================================================
export function capaReel(dia) {
  const titulo = (dia.reel && dia.reel.titulo) || dia.gancho;
  return `<div class="tela tela--story reel">
    <svg class="reel__estrada" viewBox="0 0 1080 1920">
      <path d="M470 1440H610L1380 1920H-300Z" fill="rgba(255,255,255,0.05)"/>
      <path d="M470 1440L-300 1920M610 1440L1380 1920" stroke="rgba(243,245,242,0.25)" stroke-width="7"/>
      <g fill="rgba(241,194,50,0.8)"><path d="M535 1620h10l2 34h-14z"/><path d="M531 1700h18l4 64h-26z"/><path d="M525 1820h30l6 100h-42z"/></g>
    </svg>
    <div class="reel__zona">
      <div class="reel__topo">${escudo(dia.step, 'escudo--reel')}<div class="story__rot"><b>DIA ${num3(dia.n)}</b><span>${esc(semMarca(dia.quadro).toUpperCase())}</span></div></div>
      <h1 class="reel__titulo" data-fit="título do reel" data-min="72">${rico(titulo)}</h1>
      <div class="reel__quadro">${imagem(dia.imagem)}${selo(dia, 'selo--reel')}</div>
      <div class="reel__pe">${marca(false)}</div>
    </div>
    ${tarja(dia)}
  </div>`;
}
