// Transições: fade, slide e wipe do @remotion/transitions, mais a "faixa de estrada",
// uma apresentação própria em que um trecho de asfalto com faixa amarela cruza a tela na diagonal.
import React from "react";
import { AbsoluteFill } from "remotion";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { COR, H, W } from "./tema";

type FaixaProps = { inclinacao: number };

const K = 0.55; // deslocamento horizontal por pixel de altura
const LARG = 210; // largura da faixa de asfalto

const FaixaEstrada: React.FC<TransitionPresentationComponentProps<FaixaProps>> = ({ children, presentationDirection, presentationProgress }) => {
  if (presentationDirection === "exiting") {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }
  const total = W + H * K + LARG * 2;
  const s = -LARG + presentationProgress * total; // borda de revelação na base
  const corte = `polygon(-3000px 0px, ${s - H * K}px 0px, ${s}px ${H}px, -3000px ${H}px)`;
  const faixa = `${s - H * K - LARG},0 ${s - H * K + 4},0 ${s + 4},${H} ${s - LARG},${H}`;
  const meio = (y: number) => s - LARG / 2 - (H - y) * K;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: corte }}>{children}</AbsoluteFill>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <polygon points={faixa} fill={COR.asfalto} />
        <line x1={s - H * K - LARG + 10} y1={0} x2={s - LARG + 10} y2={H} stroke="#ffffff" strokeOpacity={0.5} strokeWidth={6} />
        <line x1={s - H * K - 6} y1={0} x2={s - 6} y2={H} stroke="#ffffff" strokeOpacity={0.5} strokeWidth={6} />
        <line
          x1={meio(0)}
          y1={0}
          x2={meio(H)}
          y2={H}
          stroke={COR.amarelo}
          strokeWidth={14}
          strokeDasharray="70 50"
          strokeDashoffset={-presentationProgress * 600}
        />
      </svg>
    </AbsoluteFill>
  );
};

export const faixaEstrada = (): TransitionPresentation<FaixaProps> => ({
  component: FaixaEstrada,
  props: { inclinacao: K },
});

export type NomeTransicao = "faixa" | "fade" | "slide" | "wipe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apresentacao = (nome: NomeTransicao, i: number): TransitionPresentation<any> => {
  switch (nome) {
    case "faixa":
      return faixaEstrada();
    case "fade":
      return fade();
    case "slide":
      return slide({ direction: i % 2 === 0 ? "from-right" : "from-bottom" });
    case "wipe":
      return wipe({ direction: i % 2 === 0 ? "from-bottom-left" : "from-top-right" });
  }
};
