// Configuração do Remotion Studio e da CLI (npx remotion ...).
// O render em lote usa scripts/render.mjs, que repete estes valores.
import fs from "node:fs";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setCodec("h264");
Config.setCrf(20);
Config.setPixelFormat("yuv420p");
Config.setMuted(true);
Config.setConcurrency(2);
Config.setOverwriteOutput(true);

// Chromium já instalado nesta máquina (evita baixar outro navegador).
// Sem ele, o Remotion baixa o Chrome Headless Shell automaticamente.
const navegador =
  process.env.REMOTION_BROWSER ?? "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
if (fs.existsSync(navegador)) {
  Config.setBrowserExecutable(navegador);
}
