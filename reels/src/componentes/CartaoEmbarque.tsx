// Cartão de embarque BRA → EUA com o texto da cena no campo principal.
import React, { useMemo } from "react";
import { AbsoluteFill, Img, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import { AREA, COR, FONTE } from "../tema";
import { ajustar, lerUnidades } from "../texto";
import { TextoRico } from "./TextoRico";

type Props = { texto: string; duracao: number; foto?: boolean; atraso?: number; compacto?: boolean };

export const Aviao: React.FC<{ cor: string; tamanho: number; style?: React.CSSProperties }> = ({ cor, tamanho, style }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 100 100" style={style}>
    <path
      d="M50 6c4 0 6 5 6 10v24l34 20v9l-34-10v19l10 8v7l-16-5-16 5v-7l10-8V59L10 69v-9l34-20V16c0-5 2-10 6-10z"
      fill={cor}
    />
  </svg>
);

export const CartaoEmbarque: React.FC<Props> = ({ texto, duracao, foto = false, atraso = 2, compacto = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, segmento, direcao, fundoAtual } = useCena();
  const a0 = segmento.gancho ? -6 : atraso;
  const largura = AREA.largura;
  const larguraTexto = foto ? largura - 120 - 250 : largura - 120;

  const ajuste = useMemo(
    () =>
      ajustar(lerUnidades(texto), {
        fonte: "bc800",
        largura: larguraTexto,
        altura: 340,
        max: compacto ? 96 : 116,
        min: 60,
        entrelinha: 0.98,
        maxLinhas: 3,
        maiusculas: true,
      }),
    [texto, larguraTexto, compacto],
  );

  const barras = useMemo(() => {
    const id = `${direcao.semente}-bar-${segmento.indice}`;
    const out: { x: number; w: number }[] = [];
    let x = 0;
    let i = 0;
    while (x < 720) {
      const w = 4 + Math.floor(random(`${id}-${i}`) * 4) * 4;
      out.push({ x, w });
      x += w + 6 + Math.floor(random(`${id}-g-${i}`) * 3) * 4;
      i++;
    }
    return out;
  }, [direcao.semente, segmento.indice]);

  const p = mola(frame, fps, a0, "pop");
  const dy = (1 - p) * 1200;
  const giro = -2.5 + (1 - p) * -12;
  const voo = interp(frame, [a0 + 10, a0 + 40], [0, 1]);
  const cod = interp(frame, [a0 + 14, a0 + 34], [0, 1]);
  const brilho = interp(frame, [a0 + 20, a0 + 44], [-0.3, 1.3]);
  const respira = interp(frame, [a0 + 10, duracao], [1, 1.03]);
  const faixa = tom.claro || tom.fundo === COR.vermelho ? COR.navy : COR.vermelho;

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
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: largura,
            background: "#fbfbf8",
            borderRadius: 34,
            overflow: "hidden",
            position: "relative",
            transform: `translateY(${dy}px) rotate(${giro}deg) scale(${respira})`,
            boxShadow: "0 60px 120px -50px rgba(0,0,0,0.7)",
          }}
        >
          <div
            style={{
              background: faixa,
              color: "#fff",
              padding: "30px 50px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: FONTE.mono,
              fontWeight: 600,
              fontSize: 48,
              letterSpacing: "0.08em",
            }}
          >
            <span>CARTÃO DE EMBARQUE</span>
            <Aviao cor="#fff" tamanho={64} style={{ transform: "rotate(90deg)" }} />
          </div>
          <div style={{ padding: "40px 60px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 150, lineHeight: 0.9, color: COR.navy }}>BRA</div>
            <div style={{ flex: 1, position: "relative", height: 80, margin: "0 30px" }}>
              <div style={{ position: "absolute", top: 39, left: 0, right: 0, borderTop: `6px dashed ${COR.tinta2}`, opacity: 0.35 }} />
              <div style={{ position: "absolute", top: 39, left: 0, width: `${voo * 100}%`, borderTop: `6px solid ${COR.vermelho}` }} />
              <Aviao
                cor={COR.vermelho}
                tamanho={80}
                style={{ position: "absolute", top: 0, left: `calc(${voo * 100}% - 40px)`, transform: "rotate(90deg)" }}
              />
            </div>
            <div style={{ fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 150, lineHeight: 0.9, color: COR.navy }}>EUA</div>
          </div>
          {/* picote */}
          <div style={{ position: "relative", height: 60 }}>
            <div style={{ position: "absolute", left: -30, top: 0, width: 60, height: 60, borderRadius: 30, background: fundoAtual }} />
            <div style={{ position: "absolute", right: -30, top: 0, width: 60, height: 60, borderRadius: 30, background: fundoAtual }} />
            <div style={{ position: "absolute", left: 50, right: 50, top: 28, borderTop: `5px dashed rgba(13,26,43,0.25)` }} />
          </div>
          <div style={{ padding: "16px 60px 30px", display: "flex", alignItems: "center", gap: 40 }}>
            {foto ? (
              <Img
                src={staticFile("img/fundador.webp")}
                style={{ width: 210, height: 210, borderRadius: 24, objectFit: "cover", boxShadow: `0 0 0 6px ${COR.amarelo}` }}
              />
            ) : null}
            <TextoRico
              ajuste={ajuste}
              cor={COR.navy}
              corDestaque={COR.vermelho}
              alinhar="left"
              atraso={a0 + 10}
              passo={2.5}
              entrada="subir"
            />
          </div>
          <div style={{ padding: "0 60px 46px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <svg width={560} height={110} style={{ clipPath: `inset(0 ${(1 - cod) * 100}% 0 0)` }}>
              {barras.map((b, i) => (b.x + b.w < 560 ? <rect key={i} x={b.x} y={0} width={b.w} height={110} fill={COR.tinta} /> : null))}
            </svg>
            <div style={{ display: "flex", gap: 10, height: 110, alignItems: "flex-end" }}>
              <div style={{ width: 26, height: 110, borderRadius: 6, background: COR.verde }} />
              <div style={{ width: 26, height: 110, borderRadius: 6, background: COR.amarelo }} />
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: `linear-gradient(110deg, rgba(255,255,255,0) ${brilho * 100 - 14}%, rgba(255,255,255,0.55) ${brilho * 100}%, rgba(255,255,255,0) ${brilho * 100 + 14}%)`,
              mixBlendMode: "soft-light",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
