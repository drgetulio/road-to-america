// Renderiza os Reels semanais da Questão de Embarque (instagram/reels-semanais.json) em
// out/semanais/semana-XX.mp4 (H.264, CRF 20, sem áudio) e as capas em out/semanais/capas/.
// Uso: node scripts/render-semanais.mjs                      -> as 52 semanas
//      node scripts/render-semanais.mjs semana-01,semana-02  -> só essas
// Reels do formato Resultado com status "preencher_resultado" são pulados (os números da
// enquete entram no JSON antes); FORCAR=1 renderiza assim mesmo, com "??".
import path from "node:path";
import fs from "node:fs";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { ARQ_SEMANAIS, NAVEGADOR, RAIZ, empacotar, idsSemanais } from "./comum.mjs";

const alvo = process.argv[2];
const ids = alvo ? alvo.split(",") : idsSemanais();
const dados = JSON.parse(fs.readFileSync(ARQ_SEMANAIS, "utf8"));
const porId = new Map(dados.reels.map((r) => [r.id, r]));
const concurrency = Number(process.env.CONCORRENCIA ?? 2);
const saida = path.join(RAIZ, "out", "semanais");
fs.mkdirSync(path.join(saida, "capas"), { recursive: true });

// Ilustrações do carrossel: as que já existem em instagram/imagens/ vão para public/semanais/ e
// entram na cena do personagem no lugar do avatar (src/semanais.ts lê a lista gerada aqui).
const pastaImgs = path.join(RAIZ, "..", "instagram", "imagens");
const pastaPub = path.join(RAIZ, "public", "semanais");
const usadas = [...new Set(dados.reels.flatMap((r) => r.cenas.map((c) => c.ilustracao).filter(Boolean)))];
const prontas = usadas.filter((f) => fs.existsSync(path.join(pastaImgs, f)));
if (prontas.length) fs.mkdirSync(pastaPub, { recursive: true });
for (const f of prontas) fs.copyFileSync(path.join(pastaImgs, f), path.join(pastaPub, f));
fs.writeFileSync(path.join(RAIZ, "src", "ilustracoes-disponiveis.json"), JSON.stringify(prontas.sort(), null, 1) + "\n");
console.log(`ilustrações do carrossel no Reel: ${prontas.length} de ${usadas.length}`);

const serveUrl = await empacotar();
const browser = await openBrowser("chrome", { browserExecutable: NAVEGADOR });
for (const id of ids) {
  const r = porId.get(id);
  if (!r) throw new Error(`${id} não existe em instagram/reels-semanais.json`);
  if (r.status === "preencher_resultado" && process.env.FORCAR !== "1") {
    console.log(`${id}: formato Resultado sem os números da enquete; preencha "resultado" no JSON (ou FORCAR=1)`);
    continue;
  }
  const t = Date.now();
  const composition = await selectComposition({ serveUrl, id, puppeteerInstance: browser, browserExecutable: NAVEGADOR });
  const arquivo = path.join(saida, `${id}.mp4`);
  let ultimo = -1;
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    crf: 20,
    pixelFormat: "yuv420p",
    x264Preset: "medium",
    muted: true,
    imageFormat: "jpeg",
    jpegQuality: 92,
    concurrency,
    outputLocation: arquivo,
    overwrite: true,
    puppeteerInstance: browser,
    browserExecutable: NAVEGADOR,
    ffmpegOverride: ({ type, args }) => {
      if (type !== "pre-stitcher") return args;
      const i = args.indexOf("-c:v");
      return [...args.slice(0, i), "-vf", "scale=in_range=pc:out_range=tv", "-color_range", "tv", ...args.slice(i)];
    },
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== ultimo) {
        ultimo = p;
        process.stdout.write(`\r${id} ${p * 10}%   `);
      }
    },
  });
  if (process.env.CAPAS !== "0") {
    const capa = await selectComposition({ serveUrl, id: `capa-${id}`, puppeteerInstance: browser, browserExecutable: NAVEGADOR });
    await renderStill({ serveUrl, composition: capa, output: path.join(saida, "capas", `${id}.jpg`), imageFormat: "jpeg", jpegQuality: 90, puppeteerInstance: browser, browserExecutable: NAVEGADOR });
  }
  console.log(`\r${id} pronto em ${((Date.now() - t) / 1000).toFixed(0)} s, ${(fs.statSync(arquivo).size / 1024 / 1024).toFixed(2)} MB`);
}
await browser.close({ silent: true });
