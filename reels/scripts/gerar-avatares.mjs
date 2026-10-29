// Copia os avatares dos personagens dos templates do Instagram (instagram/templates/lib/slides.mjs)
// para src/avatares.ts, para o Reel usar o mesmo desenho do carrossel.
// Uso: node scripts/gerar-avatares.mjs
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./comum.mjs";
import { avatar } from "../../instagram/templates/lib/slides.mjs";

const NOMES = ["Macrô", "Mito", "Seu Néfron", "Capitã Plaqueta", "Tia Meia-Vida", "Viés", "Dona Térmica", "Seu Allen", "Garçom Espetinho", "Dona Bússola"];
const mapa = Object.fromEntries(NOMES.map((n) => [n, avatar(n).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")]));
const ts = `// Gerado por scripts/gerar-avatares.mjs a partir de instagram/templates/lib/slides.mjs. Não edite à mão.\nexport const AVATARES: Record<string, string> = ${JSON.stringify(mapa, null, 2)};\n`;
fs.writeFileSync(path.join(RAIZ, "src", "avatares.ts"), ts);
console.log("src/avatares.ts:", NOMES.length, "avatares");
