// Configuração do Remotion Studio e da CLI (npx remotion ...).
// O render em lote usa scripts/render.mjs, que repete estes valores.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setCodec("h264");
Config.setCrf(20);
Config.setPixelFormat("yuv420p");
Config.setMuted(true);
Config.setConcurrency(2);
Config.setOverwriteOutput(true);
// Chromium já instalado na máquina (evita baixar outro navegador).
// Em outra máquina, apague a linha abaixo e o Remotion baixa o dele.
Config.setBrowserExecutable(
  "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
);
