// Direção de arte de cada reel: paleta, textura de fundo, estilo de legenda,
// transições e trocas pontuais de componente. O texto vem só de roteiros.json.
import type { Direcao } from "./schema";

type Base = Omit<Direcao, "semente" | "trocas" | "url"> & { trocas?: Direcao["trocas"] };

const D: Record<string, Base> = {
  "reel-01": { paleta: "navy", decor: "estrada", legenda: "pop", alinhamento: "centro", numero: "placa", transicoes: ["faixa", "slide", "wipe"] },
  "reel-02": { paleta: "noite", decor: "cruzeiro", legenda: "bloco", alinhamento: "esquerda", numero: "gigante", transicoes: ["fade", "slide"] },
  "reel-03": { paleta: "vermelho", decor: "listras", legenda: "sublinhado", alinhamento: "centro", numero: "gigante", transicoes: ["wipe", "faixa"] },
  "reel-04": { paleta: "papel", decor: "grade", legenda: "bloco", alinhamento: "esquerda", numero: "gigante", transicoes: ["slide", "wipe"] },
  "reel-05": { paleta: "navy", decor: "ondas", legenda: "pop", alinhamento: "centro", numero: "gigante", transicoes: ["faixa", "fade"] },
  "reel-06": { paleta: "asfalto", decor: "estrada", legenda: "sublinhado", alinhamento: "esquerda", numero: "placa", transicoes: ["wipe", "slide"] },
  "reel-07": {
    // navy com cruzeiro: o 06 já usa asfalto com estrada e o mesmo fechamento do simulado
    paleta: "navy",
    decor: "cruzeiro",
    legenda: "pop",
    alinhamento: "centro",
    numero: "placa",
    transicoes: ["faixa", "wipe"],
    // "Viu a diferença?" vira a régua com as duas notas das cenas anteriores
    trocas: {
      "2": { tipo: "comparativo", a: { valor: 218, rotulo: "passa" }, b: { valor: 248, rotulo: "mediana dos IMGs" }, escala: [200, 260, 10] },
    },
  },
  "reel-08": { paleta: "papel", decor: "listras", legenda: "sublinhado", alinhamento: "esquerda", numero: "gigante", transicoes: ["slide", "fade"] },
  "reel-09": { paleta: "asfalto", decor: "estrada", legenda: "bloco", alinhamento: "centro", numero: "placa", transicoes: ["faixa", "slide"] },
  "reel-10": { paleta: "navy", decor: "grade", legenda: "sublinhado", alinhamento: "esquerda", numero: "gigante", transicoes: ["wipe", "fade"] },
  "reel-11": {
    paleta: "noite",
    decor: "grade",
    legenda: "pop",
    alinhamento: "centro",
    numero: "gigante",
    transicoes: ["slide", "faixa"],
    // "Distância de 30 pontos" vira a régua com as notas das duas cenas anteriores
    trocas: {
      "10": { tipo: "comparativo", a: { valor: 218, rotulo: "mínima para passar" }, b: { valor: 248, rotulo: "mediana no Step 2 CK" }, escala: [200, 260, 10] },
    },
  },
  "reel-12": { paleta: "papel", decor: "ondas", legenda: "pop", alinhamento: "centro", numero: "placa", transicoes: ["wipe", "faixa"] },
  "reel-13": { paleta: "vermelho", decor: "ondas", legenda: "bloco", alinhamento: "esquerda", numero: "gigante", transicoes: ["fade", "slide"] },
  "reel-14": { paleta: "noite", decor: "cruzeiro", legenda: "sublinhado", alinhamento: "centro", numero: "gigante", transicoes: ["faixa", "fade"] },
  "reel-15": { paleta: "navy", decor: "listras", legenda: "bloco", alinhamento: "esquerda", numero: "gigante", transicoes: ["slide", "wipe"] },
  "reel-16": { paleta: "vermelho", decor: "grade", legenda: "pop", alinhamento: "centro", numero: "gigante", transicoes: ["faixa", "slide"] },
  "reel-17": { paleta: "papel", decor: "estrada", legenda: "sublinhado", alinhamento: "esquerda", numero: "placa", transicoes: ["wipe", "slide"] },
  "reel-18": { paleta: "noite", decor: "ondas", legenda: "sublinhado", alinhamento: "esquerda", numero: "gigante", transicoes: ["fade", "faixa"] },
  "reel-19": { paleta: "noite", decor: "listras", legenda: "bloco", alinhamento: "centro", numero: "gigante", transicoes: ["slide", "faixa"] },
  "reel-20": { paleta: "asfalto", decor: "cruzeiro", legenda: "pop", alinhamento: "esquerda", numero: "gigante", transicoes: ["wipe", "faixa"] },
};

const PADRAO: Base = { paleta: "navy", decor: "estrada", legenda: "pop", alinhamento: "centro", numero: "gigante", transicoes: ["faixa", "fade"] };

export const direcaoDe = (id: string): Direcao => {
  const b = D[id] ?? PADRAO;
  return { ...b, trocas: b.trocas ?? {}, semente: id, url: true };
};
