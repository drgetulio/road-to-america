// Legenda cinética estilo Hormozi: caixa alta, palavra a palavra, destaque com pop.
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { interp } from "../anim";
import { useCena } from "../contexto";
import { AREA } from "../tema";
import { ajustar, lerUnidades } from "../texto";
import { TextoRico, contarUnidades } from "./TextoRico";

type Props = { texto: string; duracao: number };

export const LegendaCinetica: React.FC<Props> = ({ texto, duracao }) => {
  const frame = useCurrentFrame();
  const { tom, direcao, segmento } = useCena();
  const gancho = segmento.gancho;
  const esquerda = direcao.alinhamento === "esquerda";
  const variante = direcao.legenda;

  const ajuste = useMemo(
    () =>
      ajustar(lerUnidades(texto), {
        fonte: "bc800",
        largura: AREA.largura,
        altura: AREA.altura * 0.78,
        max: gancho ? 168 : 150,
        min: 84,
        entrelinha: 0.96,
        maxLinhas: 5,
        maiusculas: true,
        folgaDestaque: variante === "bloco" ? 0.18 : variante === "pop" ? 0.1 : 0,
      }),
    [texto, gancho, variante],
  );
  const n = contarUnidades(ajuste);
  const janela = Math.min(duracao * 0.4, gancho ? 14 : 24);
  const passo = Math.max(1.5, Math.min(5, janela / Math.max(1, n)));
  const atraso = gancho ? -4 : 3;

  const zoom = gancho ? interp(frame, [0, 14], [1.14, 1]) * interp(frame, [14, duracao], [1, 1.03]) : interp(frame, [0, duracao], [1, 1.035]);
  const barra = interp(frame, [atraso, atraso + 12], [0, 1]);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: AREA.x,
          top: AREA.y,
          width: AREA.largura,
          height: AREA.altura,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: esquerda ? "flex-start" : "center",
          transform: `scale(${zoom})`,
          transformOrigin: esquerda ? "0% 50%" : "50% 50%",
        }}
      >
        {esquerda ? (
          <div
            style={{
              width: 150,
              height: 16,
              borderRadius: 8,
              background: `linear-gradient(90deg, ${tom.destaque2} 0 50%, ${tom.destaque} 50% 100%)`,
              marginBottom: 40,
              transform: `scaleX(${barra})`,
              transformOrigin: "0% 50%",
            }}
          />
        ) : null}
        <TextoRico
          ajuste={ajuste}
          cor={tom.tinta}
          corDestaque={tom.destaque}
          corDestaque2={tom.destaque2}
          corSobreBloco={tom.claro ? "#ffffff" : "#0d1a2b"}
          alinhar={esquerda ? "left" : "center"}
          variante={variante}
          atraso={atraso}
          passo={passo}
          sombra={!tom.claro}
        />
      </div>
    </AbsoluteFill>
  );
};
