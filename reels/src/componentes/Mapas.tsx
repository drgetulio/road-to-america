// RotaBrasilEUA (globo_rota) e MapaEUA (mapa_eua): mapas pontilhados animados.
import React, { useMemo } from "react";
import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, lerp, mola } from "../anim";
import { useCena } from "../contexto";
import { pontilhar, projetar, type Ponto, type Projecao } from "../geografia";
import type { Item } from "../segmentos";
import { AREA, COR } from "../tema";
import { ajustar, lerUnidades, separarNumero } from "../texto";
import { Aviao } from "./CartaoEmbarque";
import { Odometro } from "./Odometro";
import { TextoRico } from "./TextoRico";

const PR_ROTA: Projecao = { lon0: -80, lat0: 8, escala: 8.9, x0: AREA.x + AREA.largura / 2, y0: 392 };
const LIM_ROTA = { lonMin: -128, lonMax: -32, latMin: -36, latMax: 52 };
const ORIGEM: Ponto = [-47.9, -15.8]; // Brasília
const DESTINO: Ponto = [-87.6, 41.9];

const bezier = (p0: number[], p1: number[], p2: number[], t: number) => [
  (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
  (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
];

export const RotaBrasilEUA: React.FC<{ itens: Item[]; duracao: number }> = ({ itens, duracao }) => {
  const frame = useCurrentFrame();
  const { tom, segmento } = useCena();
  const a0 = segmento.gancho ? -10 : 2;
  const pontos = useMemo(() => pontilhar(PR_ROTA, LIM_ROTA, 1.9, { eua: true, brasil: true, outros: true }), []);
  const o = projetar(PR_ROTA, ORIGEM);
  const d = projetar(PR_ROTA, DESTINO);
  const c = [lerp(o[0], d[0], 0.5) - 330, lerp(o[1], d[1], 0.5) + 40];

  // avanço do avião: cada etapa leva a rota até k/N
  const n = itens.length;
  let t = 0;
  itens.forEach((it, k) => {
    const p = interp(frame, [it.inicio + a0 + 6, it.inicio + a0 + 40], [0, 1], Easing.bezier(0.45, 0, 0.2, 1));
    t = Math.max(t, lerp(k / n, (k + 1) / n, p));
  });
  const passos = 60;
  let caminho = "";
  for (let i = 0; i <= passos; i++) {
    const [x, y] = bezier(o, c, d, (i / passos) * t);
    caminho += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  const [ax, ay] = bezier(o, c, d, t);
  const [bx, by] = bezier(o, c, d, Math.min(1, t + 0.01));
  const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI + 90;

  const textos = useMemo(
    () =>
      itens.map((it) =>
        ajustar(lerUnidades(it.cena.texto_tela), {
          fonte: "bc800",
          largura: AREA.largura,
          altura: n > 1 ? 130 : 240,
          max: n > 1 ? 100 : 116,
          min: 64,
          entrelinha: 0.95,
          maxLinhas: n > 1 ? 1 : 2,
          maiusculas: true,
        }),
      ),
    [itens, n],
  );

  const cam = interp(frame, [0, duracao], [1.0, 1.06]);
  const corEua = tom.claro ? COR.navy : "#ffffff";
  const corOutro = tom.claro ? "rgba(13,26,43,0.16)" : "rgba(255,255,255,0.16)";
  const chegou = interp(t, [0.97, 1], [0, 1], (x) => x);

  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, transform: `scale(${cam})`, transformOrigin: `${ax}px ${AREA.y + ay}px` }}>
        <g transform={`translate(0 ${AREA.y})`}>
          {pontos.map((p, i) => {
            const dist = Math.hypot(p.x - o[0], p.y - o[1]);
            const atraso = a0 + (dist / 900) * 18;
            const op = interp(frame, [atraso, atraso + 8], [0, 1]);
            const cor = p.regiao === "brasil" ? ((Math.round(p.lon / 1.9) + Math.round(p.lat / 1.9)) % 2 === 0 ? COR.verdeClaro : COR.amarelo) : p.regiao === "eua" ? corEua : corOutro;
            const r = p.regiao === "outro" ? 2.8 : 3.6;
            return <circle key={i} cx={p.x} cy={p.y} r={r} fill={cor} opacity={op * (p.regiao === "eua" ? 0.55 + 0.45 * chegou : 1)} />;
          })}
          <path d={caminho} fill="none" stroke={tom.destaque} strokeWidth={8} strokeLinecap="round" strokeDasharray="2 18" />
          <circle cx={o[0]} cy={o[1]} r={14} fill={COR.amarelo} />
          <circle cx={o[0]} cy={o[1]} r={14 + 26 * ((frame % 40) / 40)} fill="none" stroke={COR.amarelo} strokeWidth={4} opacity={1 - (frame % 40) / 40} />
          <circle cx={d[0]} cy={d[1]} r={16} fill={COR.vermelho} opacity={0.4 + 0.6 * chegou} />
          <circle cx={d[0]} cy={d[1]} r={16 + 40 * chegou} fill="none" stroke={COR.vermelho} strokeWidth={5} opacity={chegou * (1 - chegou * 0.6)} />
          <g transform={`translate(${ax - 40} ${ay - 40}) rotate(${ang} 40 40)`}>
            <Aviao cor={tom.tinta} tamanho={80} />
          </g>
        </g>
      </svg>
      <div style={{ position: "absolute", left: AREA.x, top: AREA.y + 800, width: AREA.largura, display: "flex", flexDirection: "column", gap: 18 }}>
        {itens.map((it, k) => {
          const atual = k === itens.length - 1 || frame < itens[k + 1].inicio + a0;
          return (
            <div key={k} style={{ opacity: atual ? 1 : 0.55 }}>
              <TextoRico ajuste={textos[k]} cor={tom.tinta} corDestaque={tom.destaque} alinhar="left" atraso={it.inicio + a0 + 2} passo={2.5} sombra={!tom.claro} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const PR_EUA: Projecao = { lon0: -95.5, lat0: 37, escala: 18.2, x0: AREA.x + AREA.largura / 2, y0: 0 };
const LIM_EUA = { lonMin: -125, lonMax: -66, latMin: 24.5, latMax: 49.5 };

export const MapaEUA: React.FC<{ texto: string; duracao: number }> = ({ texto, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, segmento } = useCena();
  const a0 = segmento.gancho ? -8 : 2;
  const pontos = useMemo(() => pontilhar(PR_EUA, LIM_EUA, 0.95, { eua: true }), []);
  const ys = pontos.map((p) => p.y);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const partes = useMemo(() => separarNumero(texto), [texto]);
  // "*27 estados* com via alternativa": 27 vira número grande, o resto continua destacado
  const mNum = partes.numerico ? partes.heroi.trim().match(/^(\d+)\s*(.*)$/) : null;
  const numero = mNum ? mNum[1] : null;
  const resto = mNum ? [mNum[2] ? `*${mNum[2]}*` : "", partes.depois].filter(Boolean).join(" ") : texto;
  const ajuste = useMemo(
    () => ajustar(lerUnidades(resto), { fonte: "bc800", largura: AREA.largura, altura: 300, max: 118, min: 64, entrelinha: 0.95, maxLinhas: 3, maiusculas: true }),
    [resto],
  );
  const varre = interp(frame, [a0 + 4, Math.min(duracao, a0 + 50)], [-130, -60], (x) => x);
  const entra = mola(frame, fps, a0, "firme");
  const alturaMapa = yMax - yMin;
  const topoMapa = numero ? 330 : 120;

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: AREA.x, top: AREA.y, width: AREA.largura, height: AREA.altura }}>
        {numero ? (
          <div style={{ position: "absolute", top: 0, left: 0, width: AREA.largura, display: "flex", justifyContent: "center" }}>
            <Odometro texto={numero} tamanho={320} cor={tom.destaque} atraso={a0 + 4} entrelinha={0.95} />
          </div>
        ) : null}
        <svg
          width={AREA.largura}
          height={alturaMapa + 20}
          style={{ position: "absolute", top: topoMapa, left: 0, transform: `scale(${0.9 + 0.1 * entra}) translateY(${interp(frame, [0, duracao], [10, -10])}px)`, opacity: interp(frame, [a0, a0 + 8], [0, 1]) }}
        >
          <g transform={`translate(${-AREA.x} ${-yMin + 10})`}>
            {pontos.map((p, i) => {
              const luz = Math.max(0, 1 - Math.abs(p.lon - varre) / 9);
              const depois = p.lon < varre ? 1 : 0;
              const cor = luz > 0.25 ? tom.destaque : tom.claro ? COR.navy : "#ffffff";
              return <circle key={i} cx={p.x} cy={p.y} r={4.6 + 2.4 * luz} fill={cor} opacity={0.22 + 0.5 * depois + 0.28 * luz} />;
            })}
          </g>
        </svg>
        <div style={{ position: "absolute", top: topoMapa + alturaMapa + 70, left: 0, width: AREA.largura }}>
          <TextoRico ajuste={ajuste} cor={tom.tinta} corDestaque={tom.destaque} alinhar="center" atraso={a0 + 10} passo={2.5} sombra={!tom.claro} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
