// Carimbo que bate na tela, com tinta falhada (máscara gerada com random()).
import React, { useMemo } from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import { AREA, FONTE } from "../tema";
import { ajustar, lerUnidades } from "../texto";
import { TextoRico } from "./TextoRico";

type Props = {
  texto: string;
  duracao: number;
  atraso?: number;
  cor?: string;
  corDestaque?: string;
  largura?: number;
  rotulo?: string | null; // linha mono acima do texto (ex.: "GARANTIA")
  caixa?: { top: number; height: number };
  maxFonte?: number;
};

export const Carimbo: React.FC<Props> = ({ texto, duracao, atraso = 4, cor, corDestaque, largura = AREA.largura - 90, rotulo, caixa, maxFonte = 170 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, segmento, direcao, fundoAtual } = useCena();
  const tinta = cor ?? tom.carimbo;
  const dest = corDestaque ?? (tom.claro ? "#0f2747" : tom.destaque);
  const a0 = segmento.gancho ? -6 : atraso;

  const ajuste = useMemo(
    () =>
      ajustar(lerUnidades(texto), {
        fonte: "bc800",
        largura: largura - 130,
        altura: 620,
        max: maxFonte,
        min: 72,
        entrelinha: 0.95,
        maxLinhas: 4,
        maiusculas: true,
      }),
    [texto, largura, maxFonte],
  );

  const id = `${direcao.semente}-${segmento.indice}-${texto.length}`;
  const furos = useMemo(
    () =>
      new Array(70).fill(0).map((_, i) => ({
        x: random(`${id}-fx-${i}`) * 100,
        y: random(`${id}-fy-${i}`) * 100,
        r: 0.3 + random(`${id}-fr-${i}`) * 1.6,
      })),
    [id],
  );

  const p = mola(frame, fps, a0, "batida");
  const escala = interp(p, [0, 1], [2.6, 1], (t) => t);
  const op = interp(frame, [a0, a0 + 3], [0, 1]);
  const giro = -7 + (1 - p) * 10;
  // anel de impacto
  const anel = interp(frame, [a0 + 3, a0 + 18], [0, 1]);
  const tremor = frame >= a0 + 3 && frame < a0 + 9 ? Math.sin(frame * 2.7) * (a0 + 9 - frame) * 2.2 : 0;
  const respira = interp(frame, [a0 + 10, duracao], [1, 1.035]);

  return (
    <AbsoluteFill style={{ transform: `translate(${tremor}px, ${-tremor * 0.6}px)` }}>
      <div
        style={{
          position: "absolute",
          left: AREA.x,
          top: caixa?.top ?? AREA.y,
          width: AREA.largura,
          height: caixa?.height ?? AREA.altura,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: largura * 1.1,
            height: largura * 1.1,
            borderRadius: "50%",
            border: `6px solid ${tinta}`,
            opacity: (1 - anel) * 0.5 * (anel > 0 ? 1 : 0),
            transform: `scale(${0.5 + anel * 0.7})`,
          }}
        />
        <div
          style={{
            position: "relative",
            width: largura,
            padding: "56px 60px 60px",
            border: `14px solid ${tinta}`,
            borderRadius: 26,
            boxShadow: `inset 0 0 0 10px transparent, inset 0 0 0 16px ${tinta}`,
            transform: `rotate(${giro}deg) scale(${escala * respira})`,
            opacity: op,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          {rotulo ? (
            <div style={{ fontFamily: FONTE.mono, fontWeight: 600, fontSize: 48, letterSpacing: "0.18em", color: tinta }}>
              {rotulo}
            </div>
          ) : null}
          <TextoRico ajuste={ajuste} cor={tinta} corDestaque={dest} entrada="nenhuma" variante="cor" />
          {/* falhas de tinta */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: -14, width: "calc(100% + 28px)", height: "calc(100% + 28px)" }}>
            {furos.map((f, i) => (
              <ellipse key={i} cx={f.x} cy={f.y} rx={f.r} ry={f.r * 0.6} fill={fundoAtual} opacity={0.9} />
            ))}
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};
