// Fontes locais (public/fonts) carregadas com @remotion/fonts.
// loadFont() segura o render com delayRender() até cada arquivo carregar.
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import { FONTE } from "./tema";

const arquivos: { familia: string; arquivo: string; peso: string; estilo?: string }[] = [
  { familia: FONTE.titulo, arquivo: "barlow-condensed-latin-600-normal.woff2", peso: "600" },
  { familia: FONTE.titulo, arquivo: "barlow-condensed-latin-700-normal.woff2", peso: "700" },
  { familia: FONTE.titulo, arquivo: "barlow-condensed-latin-800-normal.woff2", peso: "800" },
  { familia: FONTE.titulo, arquivo: "barlow-condensed-latin-700-italic.woff2", peso: "700", estilo: "italic" },
  { familia: FONTE.texto, arquivo: "barlow-latin-500-normal.woff2", peso: "500" },
  { familia: FONTE.texto, arquivo: "barlow-latin-600-normal.woff2", peso: "600" },
  { familia: FONTE.mono, arquivo: "overpass-mono-latin-600-normal.woff2", peso: "600" },
];

export const fontesCarregadas = Promise.all(
  arquivos.map((f) =>
    loadFont({
      family: f.familia,
      url: staticFile(`fonts/${f.arquivo}`),
      weight: f.peso,
      style: f.estilo ?? "normal",
      display: "block",
    }),
  ),
);
