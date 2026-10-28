// Dígitos que rolam como um odômetro até o valor final.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { FONTE } from "../tema";

type Props = {
  texto: string;
  tamanho: number;
  cor: string;
  atraso?: number;
  peso?: number;
  entrelinha?: number;
};

export const Odometro: React.FC<Props> = ({ texto, tamanho, cor, atraso = 0, peso = 800, entrelinha = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = [...texto];
  let digito = 0;
  return (
    <div
      style={{
        fontFamily: FONTE.titulo,
        fontWeight: peso,
        fontSize: tamanho,
        lineHeight: entrelinha,
        color: cor,
        whiteSpace: "nowrap",
        fontFeatureSettings: '"tnum" 1',
        display: "inline-flex",
        alignItems: "flex-start",
      }}
    >
      {chars.map((c, i) => {
        if (/\d/.test(c)) {
          const k = digito++;
          const alvo = Number(c);
          const ciclos = 1 + (k % 2);
          const final = ciclos * 10 + alvo;
          const d = atraso + k * 2.5;
          const p = mola(frame, fps, d, "firme");
          const pos = p * final;
          const op = interp(frame, [d - 2, d + 3], [0, 1]);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                height: `${entrelinha}em`,
                overflow: "hidden",
                opacity: op,
              }}
            >
              <span style={{ display: "block", transform: `translateY(${-pos * entrelinha}em)` }}>
                {new Array(final + 1).fill(0).map((_, j) => (
                  <span key={j} style={{ display: "block", height: `${entrelinha}em` }}>
                    {j % 10}
                  </span>
                ))}
              </span>
            </span>
          );
        }
        const d = atraso + Math.max(0, digito - 1) * 2.5 + 2;
        const p = mola(frame, fps, d, "pop");
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: interp(frame, [d - 2, d + 3], [0, 1]),
              transform: `translateY(${(1 - p) * 0.3}em)`,
            }}
          >
            {c}
          </span>
        );
      })}
    </div>
  );
};
