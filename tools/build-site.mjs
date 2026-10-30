// Monta o site estático em dist/ para hospedagens com etapa de build (Hostinger).
// O site não precisa de compilação: este script só copia as páginas e os recursos
// públicos e deixa de fora o que não é do site (reels, Instagram, ferramentas, testes).
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const raiz = process.cwd();
const saida = join(raiz, "dist");
const fora = new Set(["dist", "node_modules", ".git", ".github", "reels", "instagram", "tools", "supabase", "banco-privado", "entregas"]);
const pastasFora = new Set(["tests", "teste-local"]);

rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });

let n = 0;
for (const nome of readdirSync(raiz)) {
  if (fora.has(nome) || nome === "package.json" || nome === "package-lock.json") continue;
  cpSync(join(raiz, nome), join(saida, nome), {
    recursive: true,
    filter: (origem) => {
      const partes = relative(raiz, origem).split(sep);
      if (partes.some((p) => pastasFora.has(p))) return false;
      if (statSync(origem).isFile()) n++;
      return true;
    },
  });
}
console.log(`Site copiado para dist/ (${n} arquivos).`);
