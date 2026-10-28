// Revisão: um quadro perto do fim de cada cena (estado já animado) para cada reel.
// Uso: node scripts/quadros-cenas.mjs <pasta-saida> <reel-01,reel-02|todos> [recuo_s=0.4]
import path from "node:path";
import fs from "node:fs";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { NAVEGADOR, RAIZ, empacotar, idsDosRoteiros } from "./comum.mjs";

const [saida, lista, recuoTxt] = process.argv.slice(2);
const recuo = Number(recuoTxt ?? 0.4);
const ids = lista === "todos" ? idsDosRoteiros() : lista.split(",");
const dados = JSON.parse(fs.readFileSync(path.join(RAIZ, "roteiros.json"), "utf8"));
const serveUrl = await empacotar();
const browser = await openBrowser("chrome", { browserExecutable: NAVEGADOR });
for (const id of ids) {
  const r = dados.roteiros.find((x) => x.id === id);
  const pasta = path.join(saida, id);
  fs.mkdirSync(pasta, { recursive: true });
  const composition = await selectComposition({ serveUrl, id, puppeteerInstance: browser, browserExecutable: NAVEGADOR });
  for (const c of r.cenas) {
    const frame = Math.min(composition.durationInFrames - 1, Math.round((c.fim_s - recuo) * 30));
    await renderStill({ serveUrl, composition, frame, output: path.join(pasta, `${String(frame).padStart(4, "0")}.png`), puppeteerInstance: browser, browserExecutable: NAVEGADOR, imageFormat: "png" });
  }
  console.log(id, "ok");
}
await browser.close({ silent: true });
