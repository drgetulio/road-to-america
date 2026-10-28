// Desenha texto já ajustado (linhas e tamanho) com destaque e entrada palavra a palavra.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { FONTE } from "../tema";
import { SETA, caixaAlta, type Ajuste } from "../texto";

export type VarianteDestaque = "cor" | "pop" | "bloco" | "sublinhado";

type Props = {
  ajuste: Ajuste;
  peso?: number;
  familia?: string;
  maiusculas?: boolean;
  cor: string;
  corDestaque: string;
  corDestaque2?: string;
  corSobreBloco?: string;
  alinhar?: "center" | "left";
  entrelinha?: number;
  variante?: VarianteDestaque;
  atraso?: number; // frame da primeira palavra
  passo?: number; // frames entre palavras
  entrada?: "pop" | "subir" | "nenhuma";
  espacamento?: number; // letter-spacing em em
  sombra?: boolean;
  style?: React.CSSProperties;
};

const Seta: React.FC<{ cor: string }> = ({ cor }) => (
  <svg viewBox="0 0 90 60" style={{ width: "0.82em", height: "0.6em", display: "inline-block", verticalAlign: "0.02em" }}>
    <path d="M4 30 H70 M50 8 L78 30 L50 52" fill="none" stroke={cor} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TextoRico: React.FC<Props> = ({
  ajuste,
  peso = 800,
  familia = FONTE.titulo,
  maiusculas = true,
  cor,
  corDestaque,
  corDestaque2,
  corSobreBloco = "#0d1a2b",
  alinhar = "center",
  entrelinha = 0.96,
  variante = "cor",
  atraso = 0,
  passo = 3,
  entrada = "pop",
  espacamento = 0,
  sombra = false,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let n = 0;
  return (
    <div
      style={{
        fontFamily: familia,
        fontWeight: peso,
        fontSize: ajuste.tamanho,
        lineHeight: entrelinha,
        color: cor,
        textAlign: alinhar,
        letterSpacing: `${espacamento}em`,
        fontFeatureSettings: '"tnum" 1',
        textShadow: sombra ? "0 0.04em 0.12em rgba(0,0,0,0.28)" : undefined,
        ...style,
      }}
    >
      {ajuste.linhas.map((linha, li) => (
        <div key={li} style={{ whiteSpace: "nowrap" }}>
          {linha.map((u, ui) => {
            const k = n++;
            const d = atraso + k * passo;
            const p = entrada === "nenhuma" ? 1 : mola(frame, fps, d, "pop");
            const op = entrada === "nenhuma" ? 1 : interp(frame, [d, d + 4], [0, 1]);
            const temDestaque = u.some((s) => s.destaque);
            const pulso = temDestaque && variante === "pop" ? interp(frame, [d + 3, d + 8, d + 18], [0, 1, 0]) : 0;
            const escala = (entrada === "pop" ? 0.78 + 0.22 * p : 1) * (1 + 0.07 * pulso);
            const dy = entrada === "nenhuma" ? 0 : (1 - p) * 0.32;
            const giro = temDestaque && variante === "pop" ? -2.5 * pulso : 0;
            const barra = interp(frame, [d + 4, d + 14], [0, 1]);
            return (
              <React.Fragment key={ui}>
                {ui > 0 ? " " : null}
                <span
                  style={{
                    display: "inline-block",
                    position: "relative",
                    opacity: op,
                    transform: `translateY(${dy}em) scale(${escala}) rotate(${giro}deg)`,
                    transformOrigin: "50% 80%",
                    margin: temDestaque && variante === "pop" ? "0 0.05em" : undefined,
                  }}
                >
                  {temDestaque && variante === "bloco" ? (
                    <span
                      style={{
                        position: "absolute",
                        left: "-0.08em",
                        right: "-0.08em",
                        top: "0.04em",
                        bottom: "-0.02em",
                        background: corDestaque,
                        borderRadius: 8,
                        transform: `scaleX(${barra}) skewX(-6deg)`,
                        transformOrigin: "0% 50%",
                      }}
                    />
                  ) : null}
                  {temDestaque && variante === "sublinhado" ? (
                    <span
                      style={{
                        position: "absolute",
                        left: "-0.02em",
                        right: "-0.02em",
                        bottom: "-0.02em",
                        height: "0.13em",
                        background: corDestaque2 ?? corDestaque,
                        borderRadius: 6,
                        transform: `scaleX(${barra})`,
                        transformOrigin: "0% 50%",
                      }}
                    />
                  ) : null}
                  {u.map((s, si) => {
                    const t = maiusculas ? caixaAlta(s.texto) : s.texto;
                    const corSeg = s.destaque ? (variante === "bloco" ? corSobreBloco : corDestaque) : cor;
                    const partes = t.split(SETA);
                    return (
                      <span key={si} style={{ position: "relative", color: corSeg }}>
                        {partes.map((pt, pi) => (
                          <React.Fragment key={pi}>
                            {pi > 0 ? <Seta cor={corSeg} /> : null}
                            {pt}
                          </React.Fragment>
                        ))}
                      </span>
                    );
                  })}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Quantas unidades (palavras) o texto ajustado tem. */
export const contarUnidades = (a: Ajuste) => a.linhas.reduce((s, l) => s + l.length, 0);
