// Fundo com textura animada pelo frame global (parallax contínuo entre cenas).
import React, { useMemo } from "react";
import { AbsoluteFill, random } from "remotion";
import { COR, H, W, type Tom } from "../tema";
import type { Direcao } from "../schema";

type Props = {
  tom: Tom;
  decor: Direcao["decor"];
  g: number; // frame global
  semente: string;
  usarFundo2?: boolean;
};

const Estrada: React.FC<{ g: number; tom: Tom }> = ({ g, tom }) => {
  const vx = W * 0.46;
  const vy = 980;
  const baseL = -420;
  const baseR = W + 260;
  const n = 9;
  const tracos = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n + g * 0.011) % 1;
    const t2 = Math.min(1, t + 0.05);
    const y1 = vy + (H - vy) * t * t;
    const y2 = vy + (H - vy) * t2 * t2;
    const x = (y: number) => vx + ((y - vy) / (H - vy)) * -60;
    const w1 = 4 + 22 * t;
    const w2 = 4 + 22 * t2;
    tracos.push(
      <polygon
        key={k}
        points={`${x(y1) - w1},${y1} ${x(y1) + w1},${y1} ${x(y2) + w2},${y2} ${x(y2) - w2},${y2}`}
        fill={COR.amarelo}
        opacity={0.12 + 0.2 * t}
      />,
    );
  }
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="asf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tom.claro ? "rgba(13,26,43,0)" : "rgba(255,255,255,0)"} />
          <stop offset="1" stopColor={tom.claro ? "rgba(13,26,43,0.08)" : "rgba(255,255,255,0.06)"} />
        </linearGradient>
      </defs>
      <polygon points={`${vx - 6},${vy} ${vx + 6},${vy} ${baseR},${H} ${baseL},${H}`} fill="url(#asf)" />
      <line x1={vx - 6} y1={vy} x2={baseL} y2={H} stroke={tom.linha} strokeWidth={10} />
      <line x1={vx + 6} y1={vy} x2={baseR} y2={H} stroke={tom.linha} strokeWidth={10} />
      {tracos}
      <line x1={0} y1={vy} x2={W} y2={vy} stroke={tom.linha} strokeWidth={2} />
    </svg>
  );
};

const CRUZEIRO = [
  { x: 0, y: -190, r: 9 }, // Gacrux
  { x: 18, y: 190, r: 11 }, // Acrux
  { x: -130, y: -10, r: 10 }, // Mimosa
  { x: 120, y: -50, r: 7 }, // Delta
  { x: 62, y: 70, r: 5 }, // Epsilon (Intrometida)
];

const Cruzeiro: React.FC<{ g: number; tom: Tom; semente: string }> = ({ g, tom, semente }) => {
  const estrelas = useMemo(
    () =>
      new Array(90).fill(0).map((_, i) => ({
        x: random(`${semente}-ex-${i}`) * W,
        y: random(`${semente}-ey-${i}`) * H,
        r: 1.2 + random(`${semente}-er-${i}`) * 2.6,
        f: random(`${semente}-ef-${i}`) * Math.PI * 2,
        p: 0.2 + random(`${semente}-ep-${i}`) * 0.8,
      })),
    [semente],
  );
  const cor = tom.claro ? COR.navy : "#ffffff";
  const cx = 820;
  const cy = 560 - g * 0.05;
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      {estrelas.map((e, i) => {
        const y = (((e.y - g * 0.35 * e.p) % H) + H) % H;
        const brilho = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(g * 0.09 + e.f));
        return <circle key={i} cx={e.x} cy={y} r={e.r} fill={cor} opacity={brilho * (tom.claro ? 0.35 : 0.7)} />;
      })}
      <g transform={`translate(${cx} ${cy}) rotate(${-14 + g * 0.01})`} opacity={tom.claro ? 0.4 : 0.85}>
        <line x1={CRUZEIRO[0].x} y1={CRUZEIRO[0].y} x2={CRUZEIRO[1].x} y2={CRUZEIRO[1].y} stroke={cor} strokeOpacity={0.18} strokeWidth={3} />
        <line x1={CRUZEIRO[2].x} y1={CRUZEIRO[2].y} x2={CRUZEIRO[3].x} y2={CRUZEIRO[3].y} stroke={cor} strokeOpacity={0.18} strokeWidth={3} />
        {CRUZEIRO.map((s, i) => {
          const b = 0.75 + 0.25 * Math.sin(g * 0.07 + i * 1.7);
          return (
            <g key={i}>
              <circle cx={s.x} cy={s.y} r={s.r * 3.2} fill={COR.amarelo} opacity={0.1 * b} />
              <circle cx={s.x} cy={s.y} r={s.r} fill={cor} opacity={b} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

// Ondas do calçadão de Copacabana.
const Ondas: React.FC<{ g: number; tom: Tom }> = ({ g, tom }) => {
  const lambda = 300;
  const amp = 46;
  const passo = 150;
  const desloc = (g * 0.8) % lambda;
  const linhas = [];
  for (let r = -1; r < H / passo + 2; r++) {
    const y0 = r * passo + ((g * 0.25) % passo);
    let d = `M ${-lambda * 2 + desloc} ${y0}`;
    for (let x = -lambda * 2; x < W + lambda * 2; x += lambda / 2) {
      const dir = Math.round((x + lambda * 2) / (lambda / 2)) % 2 === 0 ? 1 : -1;
      d += ` q ${lambda / 4} ${amp * dir * 2} ${lambda / 2} 0`;
    }
    linhas.push(<path key={r} d={d} fill="none" stroke={tom.linha} strokeWidth={38} strokeLinecap="round" />);
  }
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.9 }}>
      {linhas}
    </svg>
  );
};

const Grade: React.FC<{ g: number; tom: Tom }> = ({ g, tom }) => {
  const passo = 108;
  const dy = (g * 0.6) % passo;
  const dx = (g * 0.2) % passo;
  const els = [];
  for (let x = -passo; x <= W + passo; x += passo) {
    els.push(<line key={`v${x}`} x1={x + dx} y1={0} x2={x + dx} y2={H} stroke={tom.linha} strokeWidth={2} />);
  }
  for (let y = -passo; y <= H + passo; y += passo) {
    els.push(<line key={`h${y}`} x1={0} y1={y + dy} x2={W} y2={y + dy} stroke={tom.linha} strokeWidth={2} />);
  }
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      {els}
      <circle cx={W * 0.5} cy={H * 0.46} r={720 + Math.sin(g * 0.01) * 20} fill="none" stroke={tom.linha} strokeWidth={3} />
      <ellipse cx={W * 0.5} cy={H * 0.46} rx={300} ry={720} fill="none" stroke={tom.linha} strokeWidth={3} />
    </svg>
  );
};

const Listras: React.FC<{ g: number; tom: Tom }> = ({ g, tom }) => {
  const passo = 140;
  const d = (g * 1.2) % passo;
  const els = [];
  for (let k = -H / passo - 2; k < W / passo + 2; k++) {
    const x = k * passo + d;
    els.push(<polygon key={k} points={`${x},0 ${x + 54},0 ${x + 54 + H * 0.58},${H} ${x + H * 0.58},${H}`} fill={tom.linha} />);
  }
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.8 }}>
      {els}
    </svg>
  );
};

export const Fundo: React.FC<Props> = ({ tom, decor, g, semente, usarFundo2 }) => {
  const base = usarFundo2 ? tom.fundo2 : tom.fundo;
  return (
    <AbsoluteFill style={{ backgroundColor: base }}>
      {decor === "estrada" ? <Estrada g={g} tom={tom} /> : null}
      {decor === "cruzeiro" ? <Cruzeiro g={g} tom={tom} semente={semente} /> : null}
      {decor === "ondas" ? <Ondas g={g} tom={tom} /> : null}
      {decor === "grade" ? <Grade g={g} tom={tom} /> : null}
      {decor === "listras" ? <Listras g={g} tom={tom} /> : null}
      <AbsoluteFill
        style={{
          background: tom.claro
            ? "radial-gradient(120% 80% at 50% 42%, rgba(255,255,255,0) 55%, rgba(13,26,43,0.10) 100%)"
            : "radial-gradient(120% 80% at 50% 42%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.38) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
