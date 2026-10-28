import { z } from "zod";

export const tiposVisuais = [
  "legenda_cinetica",
  "carimbo",
  "tela_app",
  "checklist",
  "numero_gigante",
  "lista_stack",
  "placa_exit",
  "cartao_embarque",
  "contador",
  "globo_rota",
  "mapa_eua",
] as const;

export const cenaSchema = z.object({
  inicio_s: z.number().min(0),
  fim_s: z.number().positive(),
  tipo_visual: z.enum(tiposVisuais),
  texto_tela: z.string().min(1),
  narracao: z.string().optional(),
});

export const roteiroSchema = z.object({
  id: z.string().regex(/^reel-\d{2}$/),
  titulo: z.string(),
  gancho_0a3s: z.string().optional(),
  virada_s: z.number(),
  duracao_s: z.number().positive(),
  cenas: z.array(cenaSchema).min(3),
  cta: z.string(),
});

const valorComparado = z.object({ valor: z.number(), rotulo: z.string() });

export const trocaSchema = z.object({
  tipo: z.literal("comparativo"),
  a: valorComparado,
  b: valorComparado,
  escala: z.tuple([z.number(), z.number(), z.number()]), // mínimo, máximo, passo da régua
});

export const direcaoSchema = z.object({
  paleta: z.enum(["navy", "noite", "vermelho", "papel", "asfalto"]),
  decor: z.enum(["estrada", "cruzeiro", "ondas", "grade", "listras"]),
  legenda: z.enum(["pop", "bloco", "sublinhado"]),
  alinhamento: z.enum(["centro", "esquerda"]),
  numero: z.enum(["gigante", "placa"]),
  transicoes: z.array(z.enum(["faixa", "fade", "slide", "wipe"])).min(1),
  semente: z.string(),
  trocas: z.record(z.string(), trocaSchema).default({}),
});

export const reelSchema = z.object({
  roteiro: roteiroSchema,
  direcao: direcaoSchema,
});

export const capaSchema = reelSchema;

export type Cena = z.infer<typeof cenaSchema>;
export type Roteiro = z.infer<typeof roteiroSchema>;
export type Direcao = z.infer<typeof direcaoSchema>;
export type Troca = z.infer<typeof trocaSchema>;
export type ReelProps = z.infer<typeof reelSchema>;
export type TipoVisual = (typeof tiposVisuais)[number];
