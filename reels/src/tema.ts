// Identidade visual da Road to America aplicada ao vídeo vertical.
// Cores tiradas de assets/css/base.css; o verde de placa de rodovia
// segue o padrão das placas americanas.

export const W = 1080;
export const H = 1920;
export const FPS = 30;

// Zonas seguras do Instagram Reels: nada essencial nos 250 px de cima,
// nos 420 px de baixo nem nos 140 px da direita.
export const SEGURA = {
  topo: 250,
  base: 420,
  direita: 140,
  esquerda: 70,
} as const;

// Área de conteúdo usada pelos componentes.
export const AREA = {
  x: SEGURA.esquerda,
  y: 370,
  largura: W - SEGURA.esquerda - SEGURA.direita - 10, // 860
  altura: H - SEGURA.base - 370 - 20, // 1110
} as const;

export const COR = {
  papel: "#f3f5f2",
  papel2: "#e7ebe6",
  papel3: "#dde3de",
  tinta: "#0d1a2b",
  tinta2: "#3a4859",
  navy: "#0f2747",
  navyEscuro: "#0a1b33",
  noite: "#07111f",
  noite2: "#0d1a2b",
  vermelho: "#b0243a",
  vermelhoEscuro: "#8a1a2d",
  vermelhoClaro: "#ef6276",
  verde: "#1d8a4b",
  verdeClaro: "#2fbf6b",
  amarelo: "#f1c232",
  placa: "#00643a",
  asfalto: "#1b2027",
  asfalto2: "#12161b",
  branco: "#ffffff",
} as const;

export const FONTE = {
  titulo: "Barlow Condensed",
  texto: "Barlow",
  mono: "Overpass Mono",
} as const;

export type Tom = {
  fundo: string;
  fundo2: string;
  tinta: string;
  suave: string; // texto secundário
  destaque: string; // palavra-chave
  destaque2: string; // segunda cor de destaque
  carimbo: string; // tinta do carimbo
  linha: string; // linhas decorativas
  claro: boolean; // fundo claro?
};

export type NomePaleta = "navy" | "noite" | "vermelho" | "papel" | "asfalto";

export const PALETAS: Record<NomePaleta, Tom> = {
  navy: {
    fundo: COR.navy,
    fundo2: COR.navyEscuro,
    tinta: COR.branco,
    suave: "rgba(243,245,242,0.78)",
    destaque: COR.amarelo,
    destaque2: COR.verdeClaro,
    carimbo: "#ff5a6e",
    linha: "rgba(243,245,242,0.10)",
    claro: false,
  },
  noite: {
    fundo: COR.noite,
    fundo2: COR.noite2,
    tinta: COR.branco,
    suave: "rgba(243,245,242,0.76)",
    destaque: COR.amarelo,
    destaque2: COR.verdeClaro,
    carimbo: "#ff5a6e",
    linha: "rgba(243,245,242,0.09)",
    claro: false,
  },
  vermelho: {
    fundo: COR.vermelho,
    fundo2: COR.vermelhoEscuro,
    tinta: COR.branco,
    suave: "rgba(255,255,255,0.86)",
    destaque: COR.amarelo,
    destaque2: COR.branco,
    carimbo: COR.branco,
    linha: "rgba(255,255,255,0.12)",
    claro: false,
  },
  papel: {
    fundo: COR.papel,
    fundo2: COR.papel2,
    tinta: COR.tinta,
    suave: COR.tinta2,
    destaque: COR.vermelho,
    destaque2: COR.verde,
    carimbo: COR.vermelho,
    linha: "rgba(13,26,43,0.09)",
    claro: true,
  },
  asfalto: {
    fundo: COR.asfalto,
    fundo2: COR.asfalto2,
    tinta: COR.branco,
    suave: "rgba(243,245,242,0.76)",
    destaque: COR.amarelo,
    destaque2: COR.verdeClaro,
    carimbo: "#ff5a6e",
    linha: "rgba(241,194,50,0.10)",
    claro: false,
  },
};
// Paleta de contraste usada na cena da virada de cada roteiro.
export const CONTRASTE: Record<NomePaleta, NomePaleta> = {
  navy: "vermelho",
  noite: "vermelho",
  vermelho: "navy",
  papel: "navy",
  asfalto: "vermelho",
};
