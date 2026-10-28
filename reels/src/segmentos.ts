// Converte as cenas do roteiro em segmentos de vídeo. Cenas seguidas de
// checklist, lista_stack e globo_rota viram um segmento só, que acumula itens.
import type { Cena, Direcao, Roteiro, TipoVisual, Troca } from "./schema";
import { FPS } from "./tema";

export type TipoSegmento = TipoVisual | "comparativo" | "comente" | "cta_final";

export type Item = {
  cena: Cena;
  indice: number; // posição da cena no roteiro
  inicio: number; // frame relativo ao começo do segmento
};

export type Segmento = {
  tipo: TipoSegmento;
  itens: Item[];
  inicio: number; // frame global
  duracao: number; // frames
  indice: number; // índice do segmento
  primeiraCena: number;
  virada: boolean;
  gancho: boolean; // primeiro segmento
  troca?: Troca;
};

const AGRUPA: TipoVisual[] = ["checklist", "lista_stack", "globo_rota"];

export const quadro = (s: number) => Math.round(s * FPS);

export const montarSegmentos = (r: Roteiro, d: Direcao): Segmento[] => {
  const segs: Segmento[] = [];
  const ultima = r.cenas.length - 1;
  // cena da virada: a que começa em virada_s (ou a última que começa antes dele)
  let iVirada = 0;
  r.cenas.forEach((c, i) => {
    if (c.inicio_s <= r.virada_s + 0.01) iVirada = i;
  });

  r.cenas.forEach((cena, i) => {
    const inicio = quadro(cena.inicio_s);
    const fim = quadro(cena.fim_s);
    const troca = d.trocas[String(i)];
    let tipo: TipoSegmento = cena.tipo_visual;
    if (troca) tipo = troca.tipo;
    else if (i === ultima) tipo = "cta_final";
    else if (/^Comente\s/i.test(cena.texto_tela)) tipo = "comente";

    const anterior = segs[segs.length - 1];
    const podeAgrupar =
      anterior &&
      !troca &&
      i !== ultima &&
      i !== iVirada &&
      AGRUPA.includes(cena.tipo_visual) &&
      anterior.tipo === cena.tipo_visual;

    if (podeAgrupar) {
      anterior.itens.push({ cena, indice: i, inicio: inicio - anterior.inicio });
      anterior.duracao = fim - anterior.inicio;
      return;
    }
    segs.push({
      tipo,
      itens: [{ cena, indice: i, inicio: 0 }],
      inicio,
      duracao: fim - inicio,
      indice: segs.length,
      primeiraCena: i,
      virada: i === iVirada,
      gancho: i === 0,
      troca,
    });
  });
  return segs;
};

export const DURACAO_TRANSICAO = 10;
