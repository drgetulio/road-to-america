// Checklist que acumula itens; cada item entra no início da sua cena e recebe o check.
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import type { Item } from "../segmentos";
import { AREA } from "../tema";
import { ajustar, lerUnidades, type Ajuste } from "../texto";
import { TextoRico } from "./TextoRico";

type Props = { itens: Item[]; duracao: number };

const CAIXA = 112;
const VAO = 56;

export const Checklist: React.FC<Props> = ({ itens, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, segmento } = useCena();
  const largTexto = AREA.largura - CAIXA - 44;

  const ajustes = useMemo(() => {
    const opcoes = {
      fonte: "bc700" as const,
      largura: largTexto,
      altura: 380,
      max: itens.length > 3 ? 98 : 124,
      min: 60,
      entrelinha: 1.02,
      maxLinhas: 3,
      maiusculas: false,
    };
    const prim = itens.map((it) => ajustar(lerUnidades(it.cena.texto_tela), opcoes));
    const t = Math.min(...prim.map((a) => a.tamanho));
    return itens.map((it) => ajustar(lerUnidades(it.cena.texto_tela), { ...opcoes, max: t, min: Math.min(t, 60) }));
  }, [itens, largTexto]);

  const altura = (a: Ajuste) => Math.max(CAIXA, a.linhas.length * a.tamanho * 1.02);
  const alturas = ajustes.map(altura);
  const total = alturas.reduce((s, h) => s + h, 0) + VAO * (alturas.length - 1);

  const a0 = segmento.gancho ? -6 : 3;
  const ps = itens.map((it) => mola(frame, fps, it.inicio + a0, "pop"));
  // o bloco sobe conforme os itens entram, para ficar sempre centralizado
  const falta = ps.reduce((s, p, i) => s + (alturas[i] + (i ? VAO : 0)) * (1 - Math.min(1, p)), 0);
  const topo = AREA.y + (AREA.altura - total) / 2 + falta / 2;
  const ultimo = itens.reduce((acc, it, i) => (frame >= it.inicio + a0 ? i : acc), 0);

  let y = 0;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: AREA.x, top: topo, width: AREA.largura, transform: `scale(${interp(frame, [0, duracao], [1, 1.03])})` }}>
        {itens.map((it, i) => {
          const h = alturas[i];
          const top = y;
          y += h + VAO;
          const d = it.inicio + a0;
          const p = ps[i];
          const op = interp(frame, [d, d + 5], [0, 1]);
          const marca = interp(frame, [d + 7, d + 17], [0, 1]);
          const enche = interp(frame, [d + 5, d + 10], [0, 1]);
          const atual = i === ultimo;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top,
                left: 0,
                width: AREA.largura,
                height: h,
                display: "flex",
                alignItems: "center",
                gap: 44,
                opacity: op * (atual ? 1 : 0.62),
                transform: `translateX(${(1 - p) * 160}px)`,
              }}
            >
              <div
                style={{
                  flex: `0 0 ${CAIXA}px`,
                  height: CAIXA,
                  borderRadius: 22,
                  border: `9px solid ${enche > 0.5 ? tom.destaque2 : tom.tinta}`,
                  background: enche > 0 ? tom.destaque2 : "transparent",
                  opacity: 1,
                  transform: `scale(${1 + 0.12 * interp(frame, [d + 7, d + 11, d + 18], [0, 1, 0])})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width={78} height={78} viewBox="0 0 100 100">
                  <path
                    d="M18 54 L42 76 L84 26"
                    fill="none"
                    stroke={tom.claro ? "#ffffff" : "#0d1a2b"}
                    strokeWidth={16}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={110}
                    strokeDashoffset={110 * (1 - marca)}
                  />
                </svg>
              </div>
              <TextoRico
                ajuste={ajustes[i]}
                peso={700}
                maiusculas={false}
                cor={tom.tinta}
                corDestaque={tom.destaque}
                alinhar="left"
                atraso={d + 2}
                passo={1.5}
                entrada="subir"
                entrelinha={1.02}
                sombra={!tom.claro}
              />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
