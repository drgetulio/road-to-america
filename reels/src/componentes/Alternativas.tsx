// Quatro alternativas da questão (A a D) em cartões. Com percentuais, cada cartão vira a barra
// do resultado da enquete; com a letra certa, o cartão dela acende em verde no fim da cena.
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import { AREA, COR, FONTE } from "../tema";
import { ajustar, lerUnidades } from "../texto";
import { TextoRico } from "./TextoRico";

type Props = {
  texto: string;
  duracao: number;
  opcoes: string[];
  correta?: string;
  percentuais?: (number | null)[];
};

const LETRAS = ["A", "B", "C", "D"];
const ALT = 172;
const VAO = 28;

export const Alternativas: React.FC<Props> = ({ texto, duracao, opcoes, correta, percentuais }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom } = useCena();
  const titulo = useMemo(
    () => ajustar(lerUnidades(texto), { fonte: "bc800", largura: AREA.largura, altura: 210, max: 112, min: 70, entrelinha: 0.95, maxLinhas: 2, maiusculas: true }),
    [texto],
  );
  const ajustes = useMemo(
    () => opcoes.map((o) => ajustar(lerUnidades(o), { fonte: "bc700", largura: AREA.largura - 190 - (percentuais ? 150 : 0), altura: ALT - 30, max: 72, min: 44, entrelinha: 0.98, maxLinhas: 2, maiusculas: false })),
    [opcoes, percentuais],
  );
  const comNumeros = !!percentuais && percentuais.every((p) => typeof p === "number");
  const revela = correta ? interp(frame, [duracao * 0.72, duracao * 0.72 + 8], [0, 1]) : 0;
  const cartao = tom.claro ? "#ffffff" : "rgba(243,245,242,0.96)";
  // barra de tempo: "pausa o vídeo e escolhe"
  const tempo = interp(frame, [10, duracao - 6], [1, 0]);
  const topo = AREA.y + titulo.linhas.length * titulo.tamanho * 0.95 + 50;

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: AREA.x, top: AREA.y, width: AREA.largura }}>
        <TextoRico ajuste={titulo} cor={tom.tinta} corDestaque={tom.destaque} alinhar="left" atraso={-2} passo={2} sombra={!tom.claro} />
      </div>
      {opcoes.map((_, i) => {
        const p = mola(frame, fps, 4 + i * 4, "pop");
        const pct = comNumeros ? (percentuais![i] as number) : null;
        const cresce = interp(frame, [14 + i * 4, 40 + i * 4], [0, 1]);
        const certa = correta === LETRAS[i];
        const borda = certa && revela > 0 ? `0 0 0 ${8 * revela}px ${COR.verdeClaro}` : "none";
        const apaga = correta && !certa ? 1 - 0.45 * revela : 1;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: AREA.x,
              top: topo + i * (ALT + VAO),
              width: AREA.largura,
              height: ALT,
              borderRadius: 26,
              background: cartao,
              boxShadow: `${borda}, 0 26px 40px -24px rgba(0,0,0,0.55)`,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              opacity: interp(frame, [2 + i * 4, 6 + i * 4], [0, 1]) * apaga,
              transform: `translateX(${(1 - p) * -60}px) scale(${0.94 + 0.06 * p})`,
            }}
          >
            {pct != null ? (
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct * cresce}%`, background: certa ? "rgba(29,138,75,0.22)" : "rgba(176,36,58,0.14)" }} />
            ) : null}
            <div style={{ position: "relative", width: 130, height: ALT - 40, marginLeft: 20, borderRadius: 18, background: certa && revela > 0.5 ? COR.verde : COR.vermelho, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 96, flex: "none" }}>
              {LETRAS[i]}
            </div>
            <div style={{ position: "relative", flex: 1, padding: "0 26px 0 30px" }}>
              <TextoRico ajuste={ajustes[i]} peso={700} maiusculas={false} cor={COR.tinta} corDestaque={COR.vermelho} alinhar="left" entrada="nenhuma" />
            </div>
            {pct != null ? (
              <div style={{ position: "relative", width: 150, paddingRight: 28, textAlign: "right", fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 70, color: certa ? COR.verde : COR.tinta2, flex: "none" }}>
                {Math.round(pct * cresce)}%
              </div>
            ) : null}
          </div>
        );
      })}
      {!comNumeros && !correta ? (
        <div style={{ position: "absolute", left: AREA.x, top: topo + 4 * (ALT + VAO) + 6, width: AREA.largura, height: 14, borderRadius: 7, background: tom.linha }}>
          <div style={{ width: `${tempo * 100}%`, height: "100%", borderRadius: 7, background: tom.destaque }} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
