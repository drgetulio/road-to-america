// Registra um reel e uma capa por roteiro de roteiros.json.
import React from "react";
import { Composition, Folder, Still, type CalculateMetadataFunction } from "remotion";
import dados from "../roteiros.json";
import { Capa } from "./Capa";
import { direcaoDe } from "./direcao";
import { Reel } from "./Reel";
import { reelSchema, roteiroSchema, type ReelProps } from "./schema";
import { FPS, H, W } from "./tema";
import { direcaoSemanal, reelsSemanais, roteiroSemanal } from "./semanais";

// Valida o JSON na carga: erro de digitação no roteiro aparece no Studio e no render.
const roteiros = (dados as { roteiros: unknown[] }).roteiros.map((r) => roteiroSchema.parse(r));

const calcular: CalculateMetadataFunction<ReelProps> = ({ props }) => {
  const r = props.roteiro;
  const fim = r.cenas[r.cenas.length - 1].fim_s;
  if (Math.abs(fim - r.duracao_s) > 0.001) {
    throw new Error(`${r.id}: a última cena termina em ${fim}s, mas duracao_s é ${r.duracao_s}s`);
  }
  return { durationInFrames: Math.round(r.duracao_s * FPS) };
};

export const Root: React.FC = () => (
  <>
    <Folder name="Reels">
      {roteiros.map((r) => (
        <Composition
          key={r.id}
          id={r.id}
          component={Reel}
          schema={reelSchema}
          defaultProps={{ roteiro: r, direcao: direcaoDe(r.id) }}
          calculateMetadata={calcular}
          durationInFrames={Math.round(r.duracao_s * FPS)}
          fps={FPS}
          width={W}
          height={H}
        />
      ))}
    </Folder>
    <Folder name="Semanais">
      {reelsSemanais.map((r) => (
        <Composition
          key={r.id}
          id={r.id}
          component={Reel}
          schema={reelSchema}
          defaultProps={{ roteiro: roteiroSemanal(r), direcao: direcaoSemanal(r) }}
          calculateMetadata={calcular}
          durationInFrames={Math.round(r.duracao_s * FPS)}
          fps={FPS}
          width={W}
          height={H}
        />
      ))}
    </Folder>
    <Folder name="CapasSemanais">
      {reelsSemanais.map((r) => (
        <Still key={r.id} id={`capa-${r.id}`} component={Capa} schema={reelSchema} defaultProps={{ roteiro: roteiroSemanal(r), direcao: direcaoSemanal(r) }} width={W} height={H} />
      ))}
    </Folder>
    <Folder name="Capas">
      {roteiros.map((r) => (
        <Still key={r.id} id={`capa-${r.id.slice(-2)}`} component={Capa} schema={reelSchema} defaultProps={{ roteiro: r, direcao: direcaoDe(r.id) }} width={W} height={H} />
      ))}
    </Folder>
  </>
);
