// Capa do reel (imagem estática) com o título do roteiro.
import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { ProvedorCena } from "./contexto";
import { Fundo } from "./componentes/Fundo";
import { Fita } from "./componentes/Marca";
import { Escudo } from "./componentes/TelaApp";
import { TextoRico } from "./componentes/TextoRico";
import type { ReelProps } from "./schema";
import { montarSegmentos } from "./segmentos";
import { COR, FONTE, PALETAS } from "./tema";
import { ajustar, lerUnidades } from "./texto";
import "./fontes";

const limpar = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}%$]/gu, "");

/** Marca no título as palavras destacadas no gancho do roteiro (e números). */
export const tituloComDestaque = (r: ReelProps["roteiro"]): string => {
  const gancho = r.cenas[0].texto_tela;
  const marcadas = new Set((gancho.match(/\*([^*]+)\*/g) ?? []).flatMap((m) => m.replace(/\*/g, "").split(/\s+/)).map(limpar));
  const palavras = r.titulo.split(" ");
  let algum = false;
  const out = palavras.map((p) => {
    if (/\d/.test(p) || marcadas.has(limpar(p))) {
      algum = true;
      return `*${p}*`;
    }
    return p;
  });
  if (!algum) {
    // destaca o que vem depois de "?" ou ".", ou a última palavra
    const i = r.titulo.search(/[?.]\s/);
    if (i > 0) return `${r.titulo.slice(0, i + 1)} *${r.titulo.slice(i + 2)}*`;
    out[out.length - 1] = `*${out[out.length - 1]}*`;
  }
  return out.join(" ");
};

export const Capa: React.FC<ReelProps> = ({ roteiro, direcao }) => {
  const tom = PALETAS[direcao.paleta];
  const n = Number(roteiro.id.slice(-2));
  const placa = n % 2 === 0;
  const titulo = tituloComDestaque(roteiro);
  const ajuste = useMemo(
    () =>
      ajustar(lerUnidades(titulo), {
        fonte: "bc800",
        largura: placa ? 760 : 900,
        altura: 760,
        max: 210,
        min: 90,
        entrelinha: 0.94,
        maxLinhas: 5,
        maiusculas: true,
      }),
    [titulo, placa],
  );
  const segs = useMemo(() => montarSegmentos(roteiro, direcao), [roteiro, direcao]);
  const ctx = { tom, direcao, segmento: segs[0], inicioGlobal: 0, fundoAtual: tom.fundo, palavraComentario: null };

  return (
    <ProvedorCena valor={ctx}>
      <AbsoluteFill>
        <Fundo tom={tom} decor={direcao.decor} g={45} semente={direcao.semente} />
        {/* área central 1080x1350 aparece no grade do perfil */}
        <div style={{ position: "absolute", left: 90, right: 90, top: 330, display: "flex", alignItems: "center", gap: 20 }}>
          <Escudo tamanho={90} />
          <div style={{ fontFamily: FONTE.titulo, fontWeight: 700, fontSize: 60, letterSpacing: "0.1em", color: tom.tinta }}>ROAD TO AMERICA</div>
        </div>
        <div style={{ position: "absolute", left: 90, right: 90, top: 470, height: 980, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {placa ? (
            <div style={{ background: COR.placa, borderRadius: 34, padding: "70px 70px 80px", boxShadow: "inset 0 0 0 10px #00643a, inset 0 0 0 19px #ffffff, 0 50px 100px -40px rgba(0,0,0,0.7)" }}>
              <TextoRico ajuste={ajuste} cor="#ffffff" corDestaque={COR.amarelo} entrada="nenhuma" variante="cor" />
            </div>
          ) : (
            <TextoRico ajuste={ajuste} cor={tom.tinta} corDestaque={tom.destaque} entrada="nenhuma" variante="cor" sombra={!tom.claro} />
          )}
        </div>
        <div style={{ position: "absolute", left: 90, right: 90, top: 1490, display: "flex", justifyContent: "center" }}>
          <Fita largura={260} altura={14} />
        </div>
      </AbsoluteFill>
    </ProvedorCena>
  );
};
