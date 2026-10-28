// Assinatura discreta, barra de progresso e fitinha verde e amarela.
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { interp } from "../anim";
import { COR, FONTE, SEGURA, W } from "../tema";
import { Escudo } from "./TelaApp";

export const Fita: React.FC<{ largura: number; altura?: number; style?: React.CSSProperties }> = ({ largura, altura = 10, style }) => (
  <div style={{ display: "flex", width: largura, height: altura, borderRadius: altura / 2, overflow: "hidden", ...style }}>
    <div style={{ flex: 1, background: COR.verde }} />
    <div style={{ flex: 1, background: COR.amarelo }} />
  </div>
);

/** Logotipo pequeno no canto superior esquerdo, abaixo da zona do Instagram. */
export const MarcaR2A: React.FC<{ claro: boolean; opacidade?: number }> = ({ claro, opacidade = 0.82 }) => {
  const frame = useCurrentFrame();
  const entra = interp(frame, [4, 18], [0, 1]);
  return (
    <div
      style={{
        position: "absolute",
        left: SEGURA.esquerda,
        top: SEGURA.topo + 18,
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: opacidade * entra,
        transform: `translateX(${(1 - entra) * -20}px)`,
      }}
    >
      <Escudo tamanho={62} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontFamily: FONTE.titulo, fontWeight: 700, fontSize: 48, lineHeight: 1, letterSpacing: "0.1em", color: claro ? COR.navy : "#ffffff" }}>
          ROAD TO AMERICA
        </div>
        <Fita largura={120} altura={7} />
      </div>
    </div>
  );
};

/** Barra fina no topo mostrando quanto do reel já passou. */
export const BarraProgresso: React.FC<{ claro: boolean }> = ({ claro }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interp(frame, [0, durationInFrames - 1], [0, 1], (x) => x);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: W, height: 12, background: claro ? "rgba(13,26,43,0.12)" : "rgba(255,255,255,0.14)" }} />
      <div style={{ position: "absolute", top: 0, left: 0, width: W * p, height: 12, background: `linear-gradient(90deg, ${COR.verde}, ${COR.amarelo})` }} />
    </AbsoluteFill>
  );
};
