// Pilha de valor estilo Brunson: cada item entra como um cartão numerado e a pilha cresce.
// Sem preços: o roteiro não traz valor por item.
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import type { Item } from "../segmentos";
import { AREA, COR, FONTE } from "../tema";
import { ajustar, lerUnidades } from "../texto";
import { TextoRico } from "./TextoRico";

type Props = { itens: Item[]; duracao: number };

const VAO = 22;
const PAD = 30;
const BADGE = 96;

export const ListaStack: React.FC<Props> = ({ itens, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, segmento } = useCena();

  // primeiro item sem número, seguido de itens numerados, vira título da pilha
  const temTitulo = itens.length >= 3 && !/^\d+\./.test(itens[0].cena.texto_tela) && /^\d+\./.test(itens[1].cena.texto_tela);
  const titulo = temTitulo ? itens[0] : null;
  const lista = temTitulo ? itens.slice(1) : itens;

  const dados = useMemo(() => {
    const larg = AREA.largura - BADGE - PAD * 2 - 30 - 70;
    const textos = lista.map((it) => {
      const m = it.cena.texto_tela.match(/^(\d+)\.\s*(.+)$/);
      return { num: m ? m[1] : null, texto: m ? m[2] : it.cena.texto_tela };
    });
    const opc = { fonte: "bc700" as const, largura: larg, altura: 200, max: lista.length > 5 ? 74 : 86, min: 54, entrelinha: 1.02, maxLinhas: 2, maiusculas: false };
    const t = Math.min(...textos.map((x) => ajustar(lerUnidades(x.texto), opc).tamanho));
    return textos.map((x, i) => ({
      num: x.num ?? String(i + 1),
      ajuste: ajustar(lerUnidades(x.texto), { ...opc, max: t, min: Math.min(t, 54) }),
    }));
  }, [lista]);

  const ajTitulo = useMemo(
    () =>
      titulo
        ? ajustar(lerUnidades(titulo.cena.texto_tela), { fonte: "bc800", largura: AREA.largura, altura: 260, max: 116, min: 70, entrelinha: 0.95, maxLinhas: 2, maiusculas: true })
        : null,
    [titulo],
  );

  const a0 = segmento.gancho ? -6 : 3;
  const altTitulo = ajTitulo ? ajTitulo.linhas.length * ajTitulo.tamanho * 0.95 + 50 : 0;
  const alturas = dados.map((d) => Math.max(BADGE, d.ajuste.linhas.length * d.ajuste.tamanho * 1.02) + PAD * 2);
  const visivel = AREA.altura - altTitulo;

  // rolagem: mantém o cartão mais novo dentro da área visível
  const ps = lista.map((it) => mola(frame, fps, it.inicio + a0, "pop"));
  let acumulado = 0;
  let rolagem = 0;
  lista.forEach((_, i) => {
    acumulado += alturas[i] + (i ? VAO : 0);
    const excesso = Math.max(0, acumulado - visivel);
    rolagem = Math.max(rolagem, excesso * Math.min(1, ps[i]));
  });
  // centraliza a pilha conforme os cartões entram
  const totalAtual = lista.reduce((acc, _, i) => acc + (alturas[i] + (i ? VAO : 0)) * Math.min(1, ps[i]), 0);
  const sobra = Math.max(0, visivel - Math.max(totalAtual, 0));
  const pTitulo = titulo ? mola(frame, fps, titulo.inicio + a0, "pop") : 1;

  let y = 0;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: AREA.x, top: AREA.y, width: AREA.largura, height: AREA.altura, transform: `scale(${interp(frame, [0, duracao], [1, 1.02])})` }}>
        {ajTitulo && titulo ? (
          <div style={{ position: "absolute", top: 0, left: 0, width: AREA.largura, opacity: interp(frame, [titulo.inicio + a0, titulo.inicio + a0 + 5], [0, 1]), transform: `translateY(${(1 - pTitulo) * -60}px)` }}>
            <TextoRico ajuste={ajTitulo} cor={tom.tinta} corDestaque={tom.destaque} alinhar="left" atraso={titulo.inicio + a0} passo={2} sombra={!tom.claro} />
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            top: altTitulo,
            left: 0,
            width: AREA.largura,
            height: visivel,
            overflow: "hidden",
            maskImage: rolagem > 0 ? "linear-gradient(180deg, transparent 0, #000 120px)" : undefined,
          }}
        >
          <div style={{ position: "absolute", top: sobra / 2 - rolagem, left: 0, width: AREA.largura }}>
            {dados.map((d, i) => {
              const it = lista[i];
              const top = y;
              y += alturas[i] + VAO;
              const ini = it.inicio + a0;
              const p = ps[i];
              const novo = i === lista.length - 1 ? frame >= ini : frame >= ini && frame < lista[i + 1].inicio + a0;
              const op = interp(frame, [ini, ini + 4], [0, 1]);
              const brilho = interp(frame, [ini + 4, ini + 16], [1, 0]);
              const fundoCartao = novo ? (tom.claro ? COR.navy : "#ffffff") : tom.claro ? "rgba(13,26,43,0.06)" : "rgba(255,255,255,0.07)";
              const corTexto = novo ? (tom.claro ? "#ffffff" : COR.tinta) : tom.tinta;
              const corDest = novo ? (tom.claro ? COR.amarelo : COR.vermelho) : tom.destaque;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top,
                    left: 0,
                    width: AREA.largura,
                    height: alturas[i],
                    borderRadius: 26,
                    background: fundoCartao,
                    border: novo ? "none" : `3px solid ${tom.linha}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 30,
                    padding: `0 ${PAD}px`,
                    opacity: op,
                    transform: `translateX(${(1 - p) * 700}px) rotate(${(1 - p) * 4}deg)`,
                    boxShadow: novo ? `0 0 0 ${brilho * 14}px ${tom.destaque}55, 0 30px 60px -30px rgba(0,0,0,0.6)` : "none",
                  }}
                >
                  <div
                    style={{
                      flex: `0 0 ${BADGE}px`,
                      height: BADGE,
                      borderRadius: BADGE / 2,
                      background: novo ? COR.vermelho : "transparent",
                      border: novo ? "none" : `4px solid ${tom.suave}`,
                      color: novo ? "#fff" : tom.suave,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: FONTE.titulo,
                      fontWeight: 800,
                      fontSize: 60,
                    }}
                  >
                    {d.num}
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextoRico ajuste={d.ajuste} peso={700} maiusculas={false} cor={corTexto} corDestaque={corDest} alinhar="left" atraso={ini + 3} passo={1.5} entrada="subir" entrelinha={1.02} />
                  </div>
                  <svg width={70} height={70} viewBox="0 0 100 100" style={{ flex: "0 0 70px", opacity: interp(frame, [ini + 8, ini + 14], [0, 1]) }}>
                    <circle cx={50} cy={50} r={46} fill={COR.verde} />
                    <path d="M28 52 L44 67 L72 35" fill="none" stroke="#fff" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
