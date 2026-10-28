// Fechamento: "Comente PALAVRA" e o CTA final com carimbo, ação e endereço do site.
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import { AREA, COR, FONTE } from "../tema";
import { ajustar, caixaAlta, larguraTexto, lerUnidades, semMarcas } from "../texto";
import { Carimbo } from "./Carimbo";
import { Fita } from "./Marca";
import { Escudo } from "./TelaApp";
import { TextoRico } from "./TextoRico";

export const URL_SITE = ["drgetulio.github.io/", "road-to-america"];

const SetaCurva: React.FC<{ de: [number, number]; para: [number, number]; cor: string; progresso: number }> = ({ de, para, cor, progresso }) => {
  const c: [number, number] = [para[0] - 40, de[1] - 30];
  const d = `M ${de[0]} ${de[1]} Q ${c[0]} ${c[1]} ${para[0]} ${para[1]}`;
  const ang = (Math.atan2(para[1] - c[1], para[0] - c[0]) * 180) / Math.PI;
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <path d={d} fill="none" stroke={cor} strokeWidth={10} strokeLinecap="round" strokeDasharray={900} strokeDashoffset={900 * (1 - progresso)} />
      <g transform={`translate(${para[0]} ${para[1]}) rotate(${ang})`} opacity={progresso > 0.95 ? 1 : 0}>
        <path d="M -34 -22 L 0 0 L -34 22" fill="none" stroke={cor} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
};

/** "Comente *INGLÊS*": caixa de comentário digitando a palavra, com seta para o ícone de comentários. */
export const Comente: React.FC<{ texto: string; duracao: number }> = ({ texto, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom } = useCena();
  const palavra = caixaAlta((texto.match(/\*([^*]+)\*/)?.[1] ?? texto.replace(/^Comente\s+/i, "")).trim());
  const antes = texto.slice(0, texto.indexOf("*")).trim() || "Comente";
  const tam = Math.min(210, (AREA.largura - 220) / Math.max(0.01, larguraTexto(palavra, "bc800", 1)));
  const n = Math.round(interp(frame, [10, 10 + palavra.length * 2.4], [0, palavra.length]));
  const p = mola(frame, fps, 2, "pop");
  const envia = mola(frame, fps, 14 + palavra.length * 2.4, "pop");
  const seta = interp(frame, [24 + palavra.length * 2.4, 40 + palavra.length * 2.4], [0, 1]);
  const cursor = Math.floor(frame / 7) % 2 === 0 && n < palavra.length;
  const yBalao = AREA.y + 430;
  const ajusteAntes = useMemo(() => ajustar(lerUnidades(antes), { fonte: "bc800", largura: AREA.largura, altura: 200, max: 150, min: 80, entrelinha: 1, maxLinhas: 1, maiusculas: true }), [antes]);

  return (
    <AbsoluteFill style={{ transform: `scale(${interp(frame, [0, duracao], [1, 1.03])})` }}>
      <div style={{ position: "absolute", left: AREA.x, top: AREA.y + 200, width: AREA.largura }}>
        <TextoRico ajuste={ajusteAntes} cor={tom.tinta} corDestaque={tom.destaque} alinhar="left" atraso={0} passo={2} sombra={!tom.claro} />
      </div>
      <div
        style={{
          position: "absolute",
          left: AREA.x,
          top: yBalao,
          width: AREA.largura,
          height: tam * 1.25 + 60,
          borderRadius: 60,
          background: "#ffffff",
          boxShadow: `0 0 0 ${8 * (1 - envia)}px ${tom.destaque}, 0 40px 80px -30px rgba(0,0,0,0.6)`,
          display: "flex",
          alignItems: "center",
          padding: "0 40px 0 50px",
          transform: `scale(${0.7 + 0.3 * p})`,
          transformOrigin: "0% 50%",
          opacity: interp(frame, [0, 4], [0, 1]),
        }}
      >
        <div style={{ flex: 1, fontFamily: FONTE.titulo, fontWeight: 800, fontSize: tam, color: COR.vermelho, whiteSpace: "nowrap", lineHeight: 1 }}>
          {palavra.slice(0, n)}
          <span style={{ color: COR.tinta, opacity: cursor ? 1 : 0 }}>|</span>
        </div>
        <div style={{ width: 130, height: 130, borderRadius: 65, background: n >= palavra.length ? COR.verde : "rgba(13,26,43,0.15)", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${1 + 0.15 * interp(frame, [12 + palavra.length * 2.4, 16 + palavra.length * 2.4, 24 + palavra.length * 2.4], [0, 1, 0])})` }}>
          <svg width={70} height={70} viewBox="0 0 100 100">
            <path d="M14 50 L86 18 L64 86 L50 58 Z" fill="#fff" />
          </svg>
        </div>
      </div>
      <SetaCurva de={[AREA.x + AREA.largura - 120, yBalao + tam * 1.25 + 90]} para={[995, 1330]} cor={tom.destaque} progresso={seta} />
    </AbsoluteFill>
  );
};

/** Cena final: carimbo com o texto do roteiro, ação (comentar ou link na bio) e endereço. */
export const CTAFinal: React.FC<{ texto: string; duracao: number }> = ({ texto, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, palavraComentario } = useCena();
  const ehMarca = /road to america/i.test(texto);
  const logo = mola(frame, fps, 0, "pop");
  const acao = mola(frame, fps, 14, "pop");
  const url = interp(frame, [20, 30], [0, 1]);
  const seta = interp(frame, [30, 46], [0, 1]);
  const corUrl = tom.claro ? COR.navy : "#ffffff";

  const linkNaBio = /link na bio/i.test(semMarcas(texto));
  return (
    <AbsoluteFill>
      {!ehMarca ? (
        <div style={{ position: "absolute", left: AREA.x, top: AREA.y + 10, width: AREA.largura, display: "flex", alignItems: "center", gap: 24, opacity: interp(frame, [0, 6], [0, 1]), transform: `translateY(${(1 - logo) * -40}px)` }}>
          <Escudo tamanho={140} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 92, lineHeight: 0.9, color: tom.tinta }}>ROAD TO</div>
            <div style={{ fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 92, lineHeight: 0.9, color: tom.tinta }}>AMERICA</div>
            <Fita largura={200} altura={10} />
          </div>
        </div>
      ) : (
        <div style={{ position: "absolute", left: AREA.x, top: AREA.y + 20, width: AREA.largura, display: "flex", justifyContent: "center", opacity: interp(frame, [0, 6], [0, 1]), transform: `scale(${0.6 + 0.4 * logo})` }}>
          <Escudo tamanho={200} />
        </div>
      )}
      <Carimbo texto={texto} duracao={duracao} atraso={2} caixa={{ top: AREA.y + 270, height: 470 }} maxFonte={ehMarca ? 140 : 170} />
      {!linkNaBio ? (
        <div style={{ position: "absolute", left: AREA.x, top: AREA.y + 760, width: AREA.largura, display: "flex", justifyContent: "center", transform: `scale(${acao})`, opacity: interp(frame, [14, 18], [0, 1]) }}>
          <div style={{ padding: "18px 40px", borderRadius: 24, background: tom.destaque, color: tom.claro ? "#ffffff" : COR.tinta, fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 84, lineHeight: 1, whiteSpace: "nowrap" }}>
            {palavraComentario ? `COMENTE ${caixaAlta(palavraComentario)}` : "LINK NA BIO"}
          </div>
        </div>
      ) : null}
      <div style={{ position: "absolute", left: AREA.x, top: AREA.y + (linkNaBio ? 800 : 920), width: AREA.largura, textAlign: "center", fontFamily: FONTE.mono, fontWeight: 600, fontSize: 48, lineHeight: 1.2, color: corUrl, opacity: url * 0.9 }}>
        {URL_SITE[0]}
        <br />
        {URL_SITE[1]}
      </div>
      {!palavraComentario ? <SetaCurva de={[AREA.x + 330, AREA.y + (linkNaBio ? 950 : 1060)]} para={[AREA.x + 80, 1560]} cor={tom.destaque} progresso={seta} /> : null}
      {palavraComentario ? <SetaCurva de={[AREA.x + AREA.largura - 60, AREA.y + 830]} para={[995, 1330]} cor={tom.destaque} progresso={seta} /> : null}
    </AbsoluteFill>
  );
};
