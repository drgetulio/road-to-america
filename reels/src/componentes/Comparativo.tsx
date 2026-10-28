// Comparativo honesto: duas marcas numa régua com escala visível (sem eixo truncado escondido).
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import type { Troca } from "../schema";
import { AREA, FONTE } from "../tema";
import { ajustar, larguraTexto, lerUnidades } from "../texto";
import { Odometro } from "./Odometro";
import { TextoRico } from "./TextoRico";

type Props = { texto: string; duracao: number; troca: Troca };

export const Comparativo: React.FC<Props> = ({ texto, duracao, troca }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, segmento } = useCena();
  const a0 = segmento.gancho ? -6 : 3;
  const [min, max, passo] = troca.escala;
  const titulo = useMemo(
    () => ajustar(lerUnidades(texto), { fonte: "bc800", largura: AREA.largura, altura: 230, max: 112, min: 72, entrelinha: 0.95, maxLinhas: 2, maiusculas: true }),
    [texto],
  );
  const margem = 40;
  const largRegua = AREA.largura - margem * 2;
  const xDe = (v: number) => margem + ((v - min) / (max - min)) * largRegua;
  const yRegua = 640;
  const desenha = interp(frame, [a0 + 2, a0 + 14], [0, 1]);
  const pa = mola(frame, fps, a0 + 10, "pop");
  const pb = mola(frame, fps, a0 + 20, "pop");
  const vao = interp(frame, [a0 + 30, a0 + 46], [0, 1]);
  const xa = xDe(troca.a.valor);
  const xb = xDe(troca.b.valor);

  const ticks: number[] = [];
  for (let v = min; v <= max + 0.001; v += passo) ticks.push(v);

  const rotulo = (txt: string, x: number, y: number, cor: string, op: number) => {
    const w = larguraTexto(txt, "bc700", 62);
    const left = Math.max(0, Math.min(AREA.largura - 20 - w, x - w / 2));
    return (
      <div style={{ position: "absolute", left, top: y, fontFamily: FONTE.titulo, fontWeight: 700, fontSize: 62, color: cor, whiteSpace: "nowrap", opacity: op }}>
        {txt}
      </div>
    );
  };

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: AREA.x, top: AREA.y, width: AREA.largura, height: AREA.altura, transform: `scale(${interp(frame, [0, duracao], [1, 1.03])})` }}>
        <TextoRico ajuste={titulo} cor={tom.tinta} corDestaque={tom.destaque} alinhar="left" atraso={a0} passo={2.5} sombra={!tom.claro} />
        {/* régua */}
        <div style={{ position: "absolute", top: yRegua - 5, left: margem, width: largRegua, height: 10, borderRadius: 5, background: tom.suave, opacity: 0.5, transform: `scaleX(${desenha})`, transformOrigin: "0 50%" }} />
        <div style={{ position: "absolute", top: yRegua - 9, left: xa, width: (xb - xa) * vao, height: 18, borderRadius: 9, background: tom.destaque }} />
        {ticks.map((v, i) => (
          <React.Fragment key={v}>
            <div style={{ position: "absolute", top: yRegua - 22, left: xDe(v) - 3, width: 6, height: 44, background: tom.suave, opacity: 0.6 * interp(frame, [a0 + 4 + i, a0 + 8 + i], [0, 1]) }} />
            <div style={{ position: "absolute", top: yRegua + 34, left: xDe(v) - 60, visibility: Math.abs(xDe(v) - xb) < 40 ? "hidden" : "visible", width: 120, textAlign: "center", fontFamily: FONTE.mono, fontWeight: 600, fontSize: 48, color: tom.suave, opacity: interp(frame, [a0 + 4 + i, a0 + 8 + i], [0, 1]) }}>
              {v}
            </div>
          </React.Fragment>
        ))}
        {/* marca A, acima */}
        <div style={{ position: "absolute", left: xa - 14, top: yRegua - 14 - 110 * pa, width: 28, height: 28 + 110 * pa, borderRadius: 14, background: tom.tinta, opacity: interp(frame, [a0 + 10, a0 + 13], [0, 1]) }} />
        <div style={{ position: "absolute", left: xa - 200, width: 400, top: yRegua - 330, display: "flex", justifyContent: "center", opacity: interp(frame, [a0 + 10, a0 + 13], [0, 1]) }}>
          <Odometro texto={String(troca.a.valor)} tamanho={180} cor={tom.tinta} atraso={a0 + 10} />
        </div>
        {rotulo(troca.a.rotulo, xa, yRegua - 400, tom.suave, interp(frame, [a0 + 14, a0 + 20], [0, 1]))}
        {/* marca B, abaixo */}
        <div style={{ position: "absolute", left: xb - 14, top: yRegua - 14, width: 28, height: 28 + 130 * pb, borderRadius: 14, background: tom.destaque, opacity: interp(frame, [a0 + 20, a0 + 23], [0, 1]) }} />
        <div style={{ position: "absolute", left: xb - 200, width: 400, top: yRegua + 140, display: "flex", justifyContent: "center", opacity: interp(frame, [a0 + 20, a0 + 23], [0, 1]) }}>
          <Odometro texto={String(troca.b.valor)} tamanho={180} cor={tom.destaque} atraso={a0 + 20} />
        </div>
        {rotulo(troca.b.rotulo, xb, yRegua + 330, tom.tinta, interp(frame, [a0 + 24, a0 + 30], [0, 1]))}
      </div>
    </AbsoluteFill>
  );
};
