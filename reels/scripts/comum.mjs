// Utilidades compartilhadas pelos scripts de render.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Navegador já instalado nesta máquina; em outra, defina REMOTION_BROWSER ou deixe vazio
// para o Remotion baixar o Chrome Headless Shell dele.
const PADRAO = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
export const NAVEGADOR = process.env.REMOTION_BROWSER ?? (fs.existsSync(PADRAO) ? PADRAO : null);

export const empacotar = () =>
  bundle({
    entryPoint: path.join(RAIZ, "src/index.ts"),
    publicDir: path.join(RAIZ, "public"),
    onProgress: () => undefined,
  });

export const idsDosRoteiros = () => {
  const dados = JSON.parse(fs.readFileSync(path.join(RAIZ, "roteiros.json"), "utf8"));
  return dados.roteiros.map((r) => r.id);
};

// Reels semanais da Questão de Embarque (instagram/reels-semanais.json)
export const ARQ_SEMANAIS = path.join(RAIZ, "..", "instagram", "reels-semanais.json");
export const idsSemanais = () => JSON.parse(fs.readFileSync(ARQ_SEMANAIS, "utf8")).reels.map((r) => r.id);
