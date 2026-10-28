// Renderiza os reels em out/reel-XX.mp4 (H.264, CRF 20, sem áudio) e as capas em out/capas/.
// Uso: node scripts/render.mjs            -> todos
//      node scripts/render.mjs reel-01    -> só um (ou vários separados por vírgula)
//      CAPAS=0 node scripts/render.mjs    -> pula as capas
import path from "node:path";
import fs from "node:fs";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { NAVEGADOR, RAIZ, empacotar, idsDosRoteiros } from "./comum.mjs";

const alvo = process.argv[2];
const ids = alvo ? alvo.split(",") : idsDosRoteiros();
const concurrency = Number(process.env.CONCORRENCIA ?? 2);
const saida = path.join(RAIZ, "out");
fs.mkdirSync(path.join(saida, "capas"), { recursive: true });

const t0 = Date.now();
const serveUrl = await empacotar();
const browser = await openBrowser("chrome", { browserExecutable: NAVEGADOR });
const tempos = [];
for (const id of ids) {
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
    // os quadros JPEG chegam em faixa completa (yuvj420p); converte para a faixa de vídeo (tv),
    // que é o que Instagram e players esperam
    ffmpegOverride: ({ type, args }) => {
      if (type !== "pre-stitcher") return args;
      const i = args.indexOf("-c:v");
      return [...args.slice(0, i), "-vf", "scale=in_range=pc:out_range=tv", "-color_range", "tv", ...args.slice(i)];
    },
    frameRange: process.env.TRECHO ? process.env.TRECHO.split("-").map(Number) : undefined,
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== ultimo) {
        ultimo = p;
        process.stdout.write(`\r${id} ${p * 10}%   `);
      }
    },
  });
  if (process.env.CAPAS !== "0") {
    const capa = await selectComposition({ serveUrl, id: `capa-${id.slice(-2)}`, puppeteerInstance: browser, browserExecutable: NAVEGADOR });
    await renderStill({ serveUrl, composition: capa, output: path.join(saida, "capas", `${id}.jpg`), imageFormat: "jpeg", jpegQuality: 90, puppeteerInstance: browser, browserExecutable: NAVEGADOR });
  }
  const seg = (Date.now() - t) / 1000;
  const mb = fs.statSync(arquivo).size / 1024 / 1024;
  tempos.push({ id, seg, mb });
  console.log(`\r${id} pronto em ${seg.toFixed(0)} s, ${mb.toFixed(2)} MB`);
}
await browser.close({ silent: true });
console.log(`Total: ${((Date.now() - t0) / 60000).toFixed(1)} min`);
fs.writeFileSync(path.join(RAIZ, "out", "render-log.json"), JSON.stringify({ quando: new Date().toISOString(), concurrency, tempos }, null, 2));
