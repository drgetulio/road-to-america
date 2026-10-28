// Composição de um reel: segmentos em TransitionSeries + camadas fixas (marca, progresso, flash da virada).
import React, { useMemo } from "react";
import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { interp } from "./anim";
import { Cena } from "./Cena";
import type { CtxCena } from "./contexto";
import { BarraProgresso, MarcaR2A } from "./componentes/Marca";
import type { ReelProps } from "./schema";
import { DURACAO_TRANSICAO, montarSegmentos, quadro, type Segmento } from "./segmentos";
import { CONTRASTE, PALETAS, type Tom } from "./tema";
import { apresentacao } from "./transicoes";
import "./fontes";

const tomDoSegmento = (s: Segmento, paleta: ReelProps["direcao"]["paleta"]): Tom => {
  if (s.virada || s.tipo === "cta_final") return PALETAS[CONTRASTE[paleta]];
  if (s.tipo === "carimbo" && paleta !== "papel") return PALETAS.papel;
  return PALETAS[paleta];
};

export const palavraDoComentario = (r: ReelProps["roteiro"]): string | null => {
  const c = r.cenas.find((x) => /^Comente\s/i.test(x.texto_tela));
  if (!c) return null;
  return (c.texto_tela.match(/\*([^*]+)\*/)?.[1] ?? c.texto_tela.replace(/^Comente\s+/i, "")).trim();
};

export const Reel: React.FC<ReelProps> = ({ roteiro, direcao }) => {
  const frame = useCurrentFrame();
  const segs = useMemo(() => montarSegmentos(roteiro, direcao), [roteiro, direcao]);
  const palavra = useMemo(() => palavraDoComentario(roteiro), [roteiro]);
  const T = DURACAO_TRANSICAO;

  // muda a cor da assinatura no meio da transição, quando o fundo novo já domina
  const atual = segs.reduce((acc, s) => (frame >= s.inicio + T / 2 ? s : acc), segs[0]);
  const tomAtual = tomDoSegmento(atual, direcao.paleta);
  const vF = quadro(roteiro.virada_s);
  const flash = interp(frame, [vF, vF + 2, vF + 12], [0, 0.6, 0], Easing.out(Easing.quad));
  const inicioCta = segs[segs.length - 1].inicio;
  const marcaOp = interp(frame, [inicioCta, inicioCta + 6], [1, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: PALETAS[direcao.paleta].fundo }}>
      <TransitionSeries>
        {segs.map((s, i) => {
          const tom = tomDoSegmento(s, direcao.paleta);
          const usarFundo2 = i % 2 === 1;
          const ctx: CtxCena = {
            tom,
            direcao,
            segmento: s,
            inicioGlobal: s.inicio,
            fundoAtual: usarFundo2 ? tom.fundo2 : tom.fundo,
            palavraComentario: palavra,
          };
          const ultimo = i === segs.length - 1;
          const prox = segs[i + 1];
          const nome = prox?.virada ? "faixa" : direcao.transicoes[i % direcao.transicoes.length];
          const pres = prox && (prox.tipo === "comente" || prox.tipo === "cta_final") ? apresentacao("slide", 1) : apresentacao(nome, i);
          return (
            <React.Fragment key={s.indice}>
              <TransitionSeries.Sequence durationInFrames={s.duracao + (ultimo ? 0 : T)} premountFor={30} name={`${s.indice + 1}. ${s.tipo}`}>
                <Cena ctx={ctx} usarFundo2={usarFundo2} />
              </TransitionSeries.Sequence>
              {!ultimo ? (
                <TransitionSeries.Transition presentation={pres} timing={linearTiming({ durationInFrames: T, easing: Easing.bezier(0.7, 0, 0.3, 1) })} />
              ) : null}
            </React.Fragment>
          );
        })}
      </TransitionSeries>
      <AbsoluteFill style={{ opacity: marcaOp, pointerEvents: "none" }}>
        <MarcaR2A claro={tomAtual.claro} />
      </AbsoluteFill>
      <BarraProgresso claro={tomAtual.claro} />
      <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: flash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
