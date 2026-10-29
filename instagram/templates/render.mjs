#!/usr/bin/env node
// Renderiza as peças de um dia (ou de um intervalo) da Questão de Embarque.
//
//   node instagram/templates/render.mjs --dia 8
//   node instagram/templates/render.mjs --intervalo 1-28
//   node instagram/templates/render.mjs --intervalo 7-9 --fonte instagram/templates/exemplos
//
// Saída: instagram/saida/dia-NNN/ (ver README.md).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PASTA_INSTAGRAM, RAIZ, num3, carregarConfig, montarDia, conferir } from './lib/dados.mjs';
import { conferirBanco, bancoDisponivel } from './lib/banco.mjs';
import * as S from './lib/slides.mjs';
import { legenda, roteiroStories, ctaDoDia } from './lib/legenda.mjs';
import { desafioDoDia } from './lib/conversao.mjs';

const require = createRequire(import.meta.url);

// ---------- argumentos ----------
function lerArgs(argv) {
  const a = { fonte: path.join(PASTA_INSTAGRAM, 'questoes'), imagens: path.join(PASTA_INSTAGRAM, 'imagens'), saida: path.join(PASTA_INSTAGRAM, 'saida') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) sair(`Falta o valor de ${k}`);
      return x;
    };
    if (k === '--dia') a.dias = [Number(v())];
    else if (k === '--intervalo') {
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(v());
      if (!m) sair('Use --intervalo A-B, por exemplo --intervalo 1-28');
      const [ini, fim] = [Number(m[1]), Number(m[2])];
      if (fim < ini) sair('No --intervalo A-B, B precisa ser maior ou igual a A');
      a.dias = Array.from({ length: fim - ini + 1 }, (_, j) => ini + j);
      a.intervalo = true;
    } else if (k === '--fonte') a.fonte = path.resolve(v());
    else if (k === '--imagens') a.imagens = path.resolve(v());
    else if (k === '--saida') a.saida = path.resolve(v());
    else if (k === '--reel') a.reel = true;
    else if (k === '--html') a.html = true;
    else if (k === '--forcar') a.forcar = true;
    else if (k === '--so-conferir') a.soConferir = true;
    else if (k === '--help' || k === '-h') a.ajuda = true;
    else sair(`Opção desconhecida: ${k}`);
  }
  return a;
}

function sair(msg) {
  console.error(msg);
  console.error('Uso: node instagram/templates/render.mjs (--dia N | --intervalo A-B) [--fonte DIR] [--imagens DIR] [--saida DIR] [--reel] [--html] [--forcar] [--so-conferir]');
  process.exit(2);
}

const args = lerArgs(process.argv.slice(2));
if (args.ajuda) {
  console.log(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'README.md'), 'utf8').split('\n## ')[0]);
  process.exit(0);
}
if (!args.dias || args.dias.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) sair('Informe --dia N ou --intervalo A-B, com dias de 1 a 365.');

const config = carregarConfig();
const rel = (p) => path.relative(RAIZ, p) || '.';

// ---------- peças ----------
const FEED = { largura: 1080, altura: 1350 };
const STORY = { largura: 1080, altura: 1920 };

// proximo: o dia N+1 (a capa do gabarito de N anuncia a questão de N+1, publicada no mesmo post)
function pecasDoDia(dia, comReel, proximo) {
  const p = [
    ['questao-1-capa.png', FEED, () => S.questaoCapa(dia)],
    ['questao-2-enunciado.png', FEED, () => S.questaoEnunciado(dia)],
    ['questao-3-responda.png', FEED, () => S.questaoResponda(dia, config)],
    ['questao-4-cta.png', FEED, () => S.questaoCTA(dia, config)],
    ['explicacao-1-resposta.png', FEED, () => S.explicacaoResposta(dia, proximo)],
    ['explicacao-2-certa.png', FEED, () => S.explicacaoCerta(dia)],
    ['explicacao-3-erradas.png', FEED, () => S.explicacaoErradas(dia)],
    ['explicacao-4-macete.png', FEED, () => S.explicacaoMacete(dia)],
    ['explicacao-4-macete-enxuto.png', FEED, () => S.explicacaoMacete(dia, { enxuto: true })],
    ['story-enquete.png', STORY, () => S.storyEnquete(dia)],
    ['story-enquete-guia.png', STORY, () => S.storyEnquete(dia, { guia: true })],
    ['story-gabarito.png', STORY, () => S.storyGabarito(dia)],
    ['story-gabarito-guia.png', STORY, () => S.storyGabarito(dia, { guia: true })],
  ];
  const des = desafioDoDia(dia.data || '');
  if (des && des.fase === 'em_andamento') {
    p.push(['story-desafio.png', STORY, () => S.storyDesafio(dia, des)]);
    if (des.dia_do_desafio === 1) p.push(['desafio-cartela.png', STORY, () => S.desafioCartela(des)]);
  }
  if (comReel) p.push(['capa-reel.png', STORY, () => S.capaReel(dia)]);
  return p;
}

const pastaDia = (n) => path.join(args.saida, `dia-${num3(n)}`);

// Post do feed do dia N: a recompensa primeiro. Gabarito do dia N-1 (slides 1 a 4) e depois a
// questão do dia N (slides 5 a 8). No modo enxuto: resposta, porquê e macete sem imagem nova,
// depois capa, vinheta e responda (6 slides). No dia 1, só a questão.
const MODOS = {
  'post-do-dia': {
    gabarito: ['explicacao-1-resposta.png', 'explicacao-2-certa.png', 'explicacao-3-erradas.png', 'explicacao-4-macete.png'],
    questao: ['questao-1-capa.png', 'questao-2-enunciado.png', 'questao-3-responda.png', 'questao-4-cta.png'],
  },
  'post-do-dia-enxuto': {
    gabarito: ['explicacao-1-resposta.png', 'explicacao-2-certa.png', 'explicacao-4-macete-enxuto.png'],
    questao: ['questao-1-capa.png', 'questao-2-enunciado.png', 'questao-3-responda.png'],
  },
};
function montarPost(n) {
  const dir = pastaDia(n);
  if (!fs.existsSync(path.join(dir, 'questao-1-capa.png'))) return null;
  const ontem = pastaDia(n - 1);
  const r = {};
  for (const [pasta, m] of Object.entries(MODOS)) {
    const destino = path.join(dir, pasta);
    fs.rmSync(destino, { recursive: true, force: true });
    fs.mkdirSync(destino, { recursive: true });
    if (!m.questao.every((f) => fs.existsSync(path.join(dir, f)))) return null; // pasta de uma versão antiga do render
    const exp = m.gabarito.map((f) => path.join(ontem, f));
    const temOntem = n > 1 && exp.every((f) => fs.existsSync(f));
    const lista = [...(temOntem ? exp.map((f) => ['gabarito-' + num3(n - 1), f]) : []), ...m.questao.map((f) => ['questao-' + num3(n), path.join(dir, f)])];
    lista.forEach(([rot, f], i) => {
      const nome = `${String(i + 1).padStart(2, '0')}-${rot}-${path.basename(f).replace(/^(questao|explicacao)-\d-/, '')}`;
      fs.copyFileSync(f, path.join(destino, nome));
    });
    r[pasta] = { slides: lista.length, gabaritoDe: temOntem ? n - 1 : null, faltaGabarito: n > 1 && !temOntem };
  }
  return r;
}

// ---------- execução ----------
let falhas = 0;
const resumo = [];

async function main() {
  if (!fs.existsSync(args.fonte)) {
    console.error(`Pasta de JSON não encontrada: ${rel(args.fonte)}`);
    console.error('Crie os arquivos dia-NNN.json lá (modelo em instagram/templates/modelo-dia.json) ou use --fonte instagram/templates/exemplos para testar.');
    process.exit(2);
  }
  if (!bancoDisponivel()) console.warn('Aviso: banco privado não encontrado; a conferência de cópia foi pulada.');

  const preparados = [];
  for (const n of args.dias) {
    let dia;
    try {
      dia = montarDia(n, args.fonte, args.imagens);
    } catch (e) {
      console.error(`x ${e.message}`);
      falhas++;
      continue;
    }
    if (!dia) {
      if (!args.intervalo) {
        console.error(`x dia ${num3(n)}: não existe ${rel(path.join(args.fonte, `dia-${num3(n)}.json`))}`);
        falhas++;
      }
      continue;
    }
    const { erros, avisos } = conferir(dia, config);
    erros.push(...conferirBanco(dia).map((t) => `dia ${num3(n)}: ${t}`));
    for (const t of avisos) console.warn(`! ${t}`);
    for (const t of erros) console.error(`x ${t}`);
    if (erros.length && !args.forcar) {
      falhas++;
      resumo.push({ dia: n, status: 'bloqueado', erros });
      continue;
    }
    preparados.push({ dia, avisos, erros });
  }

  if (args.soConferir) return;
  if (!preparados.length) return;

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const paginas = {};
  const pagina = async (tam) => {
    const k = `${tam.largura}x${tam.altura}`;
    if (!paginas[k]) {
      const ctx = await browser.newContext({ viewport: { width: tam.largura, height: tam.altura }, deviceScaleFactor: 1 });
      paginas[k] = await ctx.newPage();
    }
    return paginas[k];
  };

  try {
    for (const { dia, avisos, erros } of preparados) {
      const dir = pastaDia(dia.n);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of fs.readdirSync(dir)) if (/\.(png|html)$/.test(f)) fs.rmSync(path.join(dir, f));
      const comReel = args.reel || !!dia.reel;
      const avisosLayout = [];
      const arquivos = [];
      const proximo = dia.n < 365 ? safeMontar(dia.n + 1) : null;
      for (const [nome, tam, construir] of pecasDoDia(dia, comReel, proximo)) {
        const { html, token } = S.pagina(construir(), tam);
        if (args.html) fs.writeFileSync(path.join(dir, nome.replace(/\.png$/, '.html')), html);
        const page = await pagina(tam);
        await page.setContent(html, { waitUntil: 'load' });
        await page.waitForFunction((t) => window.__pronto === t, token, { timeout: 15000 });
        const av = await page.evaluate('window.__avisos || []');
        for (const t of av) avisosLayout.push(`${nome}: ${t}`);
        await page.screenshot({ path: path.join(dir, nome), type: 'png' });
        arquivos.push(nome);
      }
      for (const t of avisosLayout) console.warn(`! dia ${num3(dia.n)}: ${t} (encurte o texto)`);

      const ontem = dia.n > 1 ? safeMontar(dia.n - 1) : null;
      fs.writeFileSync(path.join(dir, 'legenda.txt'), legenda(dia, ontem, config));
      fs.writeFileSync(path.join(dir, 'stories.txt'), roteiroStories(dia, config, ontem));
      arquivos.push('legenda.txt', 'stories.txt');

      const pendentes = [dia.imagem, dia.imagem_macete].filter((i) => i && !i.caminho).map((i) => i.esperado);
      const manifesto = {
        dia: dia.n,
        data: dia.data,
        dia_semana: dia.dia_semana,
        quadro: dia.quadro,
        step: dia.step,
        topico: dia.topico,
        tom: dia.tom,
        exemplo: dia.exemplo,
        publicar: {
          questao: `${dia.data} ${config.horario_feed} (feed: slides 5 a 8 do post-do-dia/ deste dia; 4 a 6 no enxuto)`,
          explicacao: `${dia.explicacao_em} ${config.horario_feed} (feed: slides 1 a 4 do post-do-dia/ do dia ${num3(dia.n + 1)}; 1 a 3 no enxuto)`,
          story_enquete: `${dia.data} 12h06 (enquete A, B, C, D, sem gabarito)`,
          story_gabarito: `${dia.explicacao_em} 12h05 (resultado da enquete e quiz com a letra certa)`,
        },
        cta: ctaDoDia(dia),
        correta: dia.questao.correta,
        imagens_pendentes: pendentes,
        avisos: [...avisos, ...avisosLayout],
        erros_ignorados_com_forcar: erros,
        arquivos,
        gerado_em: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(dir, 'manifesto.json'), JSON.stringify(manifesto, null, 2) + '\n');
      resumo.push({ dia: dia.n, status: pendentes.length ? 'ok, com imagem pendente' : 'ok', pasta: rel(dir) });
      console.log(`ok dia ${num3(dia.n)} -> ${rel(dir)} (${arquivos.length} arquivos${pendentes.length ? `, ${pendentes.length} imagem pendente` : ''})`);
    }
  } finally {
    await browser.close();
  }

  // monta o post do feed de cada dia afetado (o gabarito de N entra no post de N+1)
  const afetados = new Set();
  for (const { dia } of preparados) {
    afetados.add(dia.n);
    if (dia.n < 365) afetados.add(dia.n + 1);
  }
  for (const n of [...afetados].sort((x, y) => x - y)) {
    const rr = montarPost(n);
    if (!rr) continue;
    const r = rr['post-do-dia'];
    const det = r.gabaritoDe ? `gabarito ${num3(r.gabaritoDe)} + questão ${num3(n)}` : `só a questão ${num3(n)}`;
    console.log(`   post-do-dia ${num3(n)}: ${r.slides} slides, enxuto ${rr['post-do-dia-enxuto'].slides} (${det})${r.faltaGabarito ? '; gabarito de ontem ainda não renderizado' : ''}`);
  }
}

function safeMontar(n) {
  try {
    return montarDia(n, args.fonte, args.imagens);
  } catch {
    return null;
  }
}

main()
  .then(() => {
    if (falhas) {
      console.error(`\n${falhas} dia(s) com erro. Nada foi renderizado para eles.${args.forcar ? '' : ' Corrija o JSON ou use --forcar para renderizar assim mesmo.'}`);
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
