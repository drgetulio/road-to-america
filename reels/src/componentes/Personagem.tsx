// Personagem fixo da Questão de Embarque (mesmo avatar do carrossel) falando num balão.
// Quando a ilustração do macete do carrossel já existe (imagem), ela entra no lugar do avatar.
import React, { useMemo } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { AVATARES } from "../avatares";
import { useCena } from "../contexto";
import { AREA, COR, FONTE } from "../tema";
import { ajustar, caixaAlta, lerUnidades } from "../texto";
import { TextoRico, contarUnidades } from "./TextoRico";

type Props = { texto: string; duracao: number; nome: string; imagem?: string };

export const Personagem: React.FC<Props> = ({ texto, duracao, nome, imagem }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom } = useCena();
  const av = AVATARES[nome];
  // ilustração 4:5 (360 x 450) no lugar do avatar redondo de 280
  const topo = imagem ? 480 : 330;
  const yBalao = AREA.y + topo;
  const ajuste = useMemo(
    () => ajustar(lerUnidades(texto), { fonte: "b600", largura: AREA.largura - 110, altura: AREA.altura - topo - 100, max: 76, min: 46, entrelinha: 1.16, maxLinhas: imagem ? 7 : 9, maiusculas: false }),
    [texto, topo, imagem],
  );
  const n = contarUnidades(ajuste);
  const passo = Math.max(1.2, Math.min(3.2, (duracao * 0.55) / Math.max(1, n)));
  const entra = mola(frame, fps, 0, "pop");
  const balao = mola(frame, fps, 6, "firme");
  const boia = Math.sin(frame / 9) * 6;
  const altBalao = ajuste.linhas.length * ajuste.tamanho * 1.16 + 100;

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: AREA.x, top: AREA.y, display: "flex", alignItems: "center", gap: 34, transform: `translateY(${(1 - entra) * 80 + boia}px)`, opacity: interp(frame, [0, 5], [0, 1]) }}>
        {imagem ? (
          <div style={{ width: 360, height: 450, borderRadius: 28, overflow: "hidden", background: COR.papel, boxShadow: `0 0 0 10px ${tom.destaque}, 0 30px 50px -20px rgba(0,0,0,0.55)`, flex: "none" }}>
            <Img src={staticFile(imagem)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : (
          <div style={{ width: 280, height: 280, borderRadius: 140, background: COR.papel, boxShadow: `0 0 0 10px ${tom.destaque}, 0 30px 50px -20px rgba(0,0,0,0.55)`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            {av ? <svg viewBox="0 0 100 100" width={220} height={220} dangerouslySetInnerHTML={{ __html: av }} /> : null}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontFamily: FONTE.mono, fontWeight: 600, fontSize: 30, letterSpacing: "0.16em", color: tom.destaque }}>EXPLICA</div>
          <div style={{ fontFamily: FONTE.titulo, fontWeight: 800, fontSize: nome.length > 12 ? 74 : 92, lineHeight: 0.92, color: tom.tinta }}>{caixaAlta(nome)}</div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: AREA.x,
          top: yBalao,
          width: AREA.largura,
          minHeight: altBalao,
          borderRadius: 34,
          background: "#ffffff",
          padding: "50px 55px",
          boxShadow: "0 40px 70px -30px rgba(0,0,0,0.6)",
          transform: `scale(${0.85 + 0.15 * balao})`,
          transformOrigin: "20% 0%",
          opacity: interp(frame, [6, 10], [0, 1]),
        }}
      >
        <svg width={90} height={60} style={{ position: "absolute", left: 90, top: -48 }} viewBox="0 0 90 60">
          <path d="M10 60 L40 0 L70 60 Z" fill="#ffffff" />
        </svg>
        <TextoRico ajuste={ajuste} familia={FONTE.texto} peso={600} maiusculas={false} entrelinha={1.16} cor={COR.tinta} corDestaque={COR.vermelho} alinhar="left" atraso={10} passo={passo} entrada="subir" />
      </div>
    </AbsoluteFill>
  );
};
