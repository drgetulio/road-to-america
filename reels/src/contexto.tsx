import React, { createContext, useContext } from "react";
import type { Direcao } from "./schema";
import type { Segmento } from "./segmentos";
import type { Tom } from "./tema";

export type CtxCena = {
  tom: Tom;
  direcao: Direcao;
  segmento: Segmento;
  /** frame global em que o segmento começa (para parallax contínuo) */
  inicioGlobal: number;
  /** cor de fundo da cena atual */
  fundoAtual: string;
  /** ação final do roteiro: palavra para comentar ou null (link na bio) */
  palavraComentario: string | null;
};

const Ctx = createContext<CtxCena | null>(null);

export const ProvedorCena: React.FC<{ valor: CtxCena; children: React.ReactNode }> = ({ valor, children }) => (
  <Ctx.Provider value={valor}>{children}</Ctx.Provider>
);

export const useCena = (): CtxCena => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCena fora de ProvedorCena");
  return v;
};
