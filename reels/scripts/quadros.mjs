// Gera quadros PNG de um ou mais reels para revisão.
// Uso: node scripts/quadros.mjs <pasta-saida> <reel-01,reel-02|todos> <seg1,seg2,...>
import path from "node:path";
import fs from "node:fs";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { NAVEGADOR, empacotar, idsDosRoteiros } from "./comum.mjs";

const [saida, lista, tempos] = process.argv.slice(2);
const ids = lista === "todos" ? idsDosRoteiros() : lista.split(",");
const segundos = tempos.split(",").map(Number);
fs.mkdirSync(saida, { recursive: true });
const serveUrl = await empacotar();
const browser = await openBrowser("chrome", { browserExecutable: NAVEGADOR });
for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id, puppeteerInstance: browser, browserExecutable: NAVEGADOR });
  for (const s of segundos) {
    const frame = Math.min(composition.durationInFrames - 1, Math.round(s * composition.fps));
    const output = path.join(saida, `${id}-${String(frame).padStart(4, "0")}.png`);
    await renderStill({ serveUrl, composition, frame, output, puppeteerInstance: browser, browserExecutable: NAVEGADOR, imageFormat: "png" });
  }
  console.log(id, "ok");
}
await browser.close({ silent: true });
