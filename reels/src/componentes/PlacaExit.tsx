// Placa verde de saída de rodovia, pendurada no pórtico, com balanço amortecido.
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import { AREA, COR, FONTE, W } from "../tema";
import { ajustar, caixaAlta, lerUnidades, separarRotulo } from "../texto";
import { TextoRico } from "./TextoRico";

type Props = { texto: string; duracao: number; compacta?: boolean; atraso?: number };

export const PlacaExit: React.FC<Props> = ({ texto, duracao, compacta = false, atraso = 2 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { segmento } = useCena();
  const a0 = segmento.gancho ? -6 : atraso;
  const { rotulo, corpo } = useMemo(() => separarRotulo(texto), [texto]);
  const largura = compacta ? 760 : AREA.largura;

  const ajuste = useMemo(
    () =>
      ajustar(lerUnidades(corpo), {
        fonte: "bc700",
        largura: largura - 120,
        altura: compacta ? 300 : 460,
        max: compacta ? 110 : 136,
        min: 70,
        entrelinha: 1,
        maxLinhas: 3,
        maiusculas: true,
      }),
    [corpo, largura, compacta],
  );

  const p = mola(frame, fps, a0, "firme");
  const dy = (1 - p) * -1100;
  const t = Math.max(0, frame - a0 - 8);
  const balanco = 3.2 * Math.sin(t * 0.32) * Math.exp(-t / 14) * (frame > a0 + 8 ? 1 : 0);
  const brilho = interp(frame, [a0 + 14, a0 + 34], [-0.4, 1.4]);
  const seta = interp(frame, [a0 + 16, a0 + 28], [0, 1]);
  const topoPortico = compacta ? 0 : AREA.y + 30;

  const zoom = interp(frame, [0, duracao], [1, 1.03]);

  return (
    <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: "100%", transform: `translateY(${dy}px)` }}>
        {/* pórtico */}
        {!compacta ? (
          <>
            <div style={{ position: "absolute", left: -40, width: W + 80, top: topoPortico, height: 34, background: "#8a96a3", boxShadow: "0 10px 0 #5f6b78" }} />
            <div style={{ position: "absolute", left: AREA.x + 150, top: topoPortico + 34, width: 20, height: 70, background: "#6f7b88" }} />
            <div style={{ position: "absolute", left: AREA.x + largura - 170, top: topoPortico + 34, width: 20, height: 70, background: "#6f7b88" }} />
          </>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: compacta ? (W - 140 - largura) / 2 + 35 : AREA.x,
            top: compacta ? AREA.y + 60 : topoPortico + 100,
            width: largura,
            transform: `rotate(${balanco}deg)`,
            transformOrigin: "50% 0%",
          }}
        >
          {rotulo ? (
            <div
              style={{
                position: "absolute",
                right: 40,
                top: -96,
                height: 104,
                padding: "0 34px",
                display: "flex",
                alignItems: "center",
                background: COR.placa,
                color: "#fff",
                borderRadius: "18px 18px 0 0",
                boxShadow: "inset 0 0 0 6px #00643a, inset 0 0 0 11px #ffffff",
                fontFamily: FONTE.mono,
                fontWeight: 600,
                fontSize: 60,
                letterSpacing: "0.04em",
              }}
            >
              {caixaAlta(rotulo)}
            </div>
          ) : null}
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              background: COR.placa,
              borderRadius: 26,
              padding: "56px 60px 40px",
              boxShadow: "inset 0 0 0 8px #00643a, inset 0 0 0 15px #ffffff, 0 50px 90px -40px rgba(0,0,0,0.7)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 26,
            }}
          >
            <TextoRico ajuste={ajuste} cor="#ffffff" corDestaque={COR.amarelo} peso={700} atraso={a0 + 8} passo={2.5} entrada="subir" />
            <svg width={150} height={150} viewBox="0 0 100 100" style={{ opacity: seta, transform: `translate(${(1 - seta) * -30}px, ${(1 - seta) * 30}px)` }}>
              <path d="M22 80 L72 30 M40 26 H76 V62" fill="none" stroke="#ffffff" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(105deg, rgba(255,255,255,0) ${brilho * 100 - 18}%, rgba(255,255,255,0.22) ${brilho * 100}%, rgba(255,255,255,0) ${brilho * 100 + 18}%)`,
              }}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
