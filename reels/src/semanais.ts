// Reels semanais da Questão de Embarque: lê instagram/reels-semanais.json (gerado por
// instagram/ferramentas/gerar-reels-semanais.mjs) e converte cada um no roteiro e na direção
// de arte que o Reel já usa. O texto vem só do JSON.
import dados from "../../instagram/reels-semanais.json";
// Ilustrações do carrossel já copiadas para public/semanais/ por scripts/render-semanais.mjs
import disponiveis from "./ilustracoes-disponiveis.json";
import type { Direcao, Roteiro } from "./schema";
import { roteiroSchema } from "./schema";

type CenaSemanal = {
  inicio_s: number;
  fim_s: number;
  tipo_visual: string;
  texto_tela: string;
  narracao?: string;
  opcoes?: string[];
  percentuais_de?: string;
  personagem?: string;
  ilustracao?: string;
};
type Resultado = { A: number | null; B: number | null; C: number | null; D: number | null; erro: number | null };
export type ReelSemanal = {
  id: string;
  semana: number;
  formato: "pov" | "macete" | "pegadinha" | "resultado" | "desafio";
  tom: "normal" | "acolhedor";
  titulo: string;
  gancho_0a2s: string;
  duracao_s: number;
  virada_s: number;
  palavra_chave: string;
  cenas: CenaSemanal[];
  resultado?: Resultado;
  legenda: string;
  correta?: string;
};

export const reelsSemanais = (dados as unknown as { reels: ReelSemanal[] }).reels;

const LETRAS = ["A", "B", "C", "D"] as const;

// Formato Resultado: os números reais da enquete entram no JSON antes do render; sem eles, "??".
const comResultado = (t: string, r?: Resultado) => t.replaceAll("{erro}", r && typeof r.erro === "number" ? String(Math.round(r.erro)) : "??");

export const roteiroSemanal = (r: ReelSemanal): Roteiro => {
  const cenas = r.cenas.map((c) => {
    const base = {
      inicio_s: c.inicio_s,
      fim_s: c.fim_s,
      tipo_visual: c.tipo_visual,
      texto_tela: comResultado(c.texto_tela, r.resultado),
      narracao: c.narracao,
      opcoes: c.opcoes,
      personagem: c.personagem,
      imagem: c.ilustracao && (disponiveis as string[]).includes(c.ilustracao) ? `semanais/${c.ilustracao}` : undefined,
    } as Record<string, unknown>;
    if (c.percentuais_de === "resultado" && r.resultado) {
      base.percentuais = LETRAS.map((l) => r.resultado![l]);
      // no resultado a letra certa acende no fim da cena (o carimbo seguinte confirma)
      const carimbo = r.cenas.find((x) => x.tipo_visual === "carimbo" && /\*[ABCD]\*/.test(x.texto_tela));
      const m = carimbo?.texto_tela.match(/\*([ABCD])\*/);
      if (m) base.correta = m[1];
    }
    return base;
  });
  return roteiroSchema.parse({
    id: r.id,
    titulo: comResultado(r.titulo, r.resultado),
    gancho_0a3s: comResultado(r.gancho_0a2s, r.resultado),
    virada_s: r.virada_s,
    duracao_s: r.duracao_s,
    cenas,
    cta: r.palavra_chave,
  });
};

const DIRECOES: Record<ReelSemanal["formato"], Omit<Direcao, "semente" | "trocas" | "url">> = {
  pov: { paleta: "noite", decor: "grade", legenda: "pop", alinhamento: "centro", numero: "gigante", transicoes: ["faixa", "slide"] },
  macete: { paleta: "navy", decor: "ondas", legenda: "bloco", alinhamento: "esquerda", numero: "gigante", transicoes: ["slide", "fade"] },
  pegadinha: { paleta: "vermelho", decor: "listras", legenda: "sublinhado", alinhamento: "centro", numero: "gigante", transicoes: ["wipe", "faixa"] },
  resultado: { paleta: "papel", decor: "grade", legenda: "bloco", alinhamento: "esquerda", numero: "gigante", transicoes: ["slide", "wipe"] },
  desafio: { paleta: "asfalto", decor: "estrada", legenda: "pop", alinhamento: "centro", numero: "placa", transicoes: ["faixa", "slide"] },
};

export const direcaoSemanal = (r: ReelSemanal): Direcao => {
  const base = r.tom === "acolhedor"
    ? { paleta: "navy" as const, decor: "ondas" as const, legenda: "sublinhado" as const, alinhamento: "esquerda" as const, numero: "gigante" as const, transicoes: ["fade" as const] }
    : DIRECOES[r.formato];
  return { ...base, trocas: {}, semente: r.id, url: false };
};
