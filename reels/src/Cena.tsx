// Escolhe o componente de cada segmento a partir do tipo_visual do roteiro.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ProvedorCena, type CtxCena } from "./contexto";
import type { Segmento } from "./segmentos";
import { Carimbo } from "./componentes/Carimbo";
import { CartaoEmbarque } from "./componentes/CartaoEmbarque";
import { Checklist } from "./componentes/Checklist";
import { Comparativo } from "./componentes/Comparativo";
import { Contador } from "./componentes/Contador";
import { CTAFinal, Comente } from "./componentes/CTA";
import { Fundo } from "./componentes/Fundo";
import { LegendaCinetica } from "./componentes/LegendaCinetica";
import { ListaStack } from "./componentes/ListaStack";
import { MapaEUA, RotaBrasilEUA } from "./componentes/Mapas";
import { NumeroGigante } from "./componentes/NumeroGigante";
import { PlacaExit } from "./componentes/PlacaExit";
import { TelaApp } from "./componentes/TelaApp";

const Conteudo: React.FC<{ s: Segmento }> = ({ s }) => {
  const texto = s.itens[0].cena.texto_tela;
  const duracao = s.duracao;
  switch (s.tipo) {
    case "legenda_cinetica":
      return <LegendaCinetica texto={texto} duracao={duracao} />;
    case "carimbo":
      return <Carimbo texto={texto} duracao={duracao} />;
    case "tela_app":
      return <TelaApp texto={texto} duracao={duracao} />;
    case "checklist":
      return <Checklist itens={s.itens} duracao={duracao} />;
    case "numero_gigante":
      return <NumeroGigante texto={texto} duracao={duracao} />;
    case "lista_stack":
      return <ListaStack itens={s.itens} duracao={duracao} />;
    case "placa_exit":
      return <PlacaExit texto={texto} duracao={duracao} />;
    case "cartao_embarque":
      return <CartaoEmbarque texto={texto} duracao={duracao} foto={/Getúlio/.test(texto)} />;
    case "contador":
      return <Contador texto={texto} duracao={duracao} />;
    case "globo_rota":
      return <RotaBrasilEUA itens={s.itens} duracao={duracao} />;
    case "mapa_eua":
      return <MapaEUA texto={texto} duracao={duracao} />;
    case "comparativo":
      return s.troca ? <Comparativo texto={texto} duracao={duracao} troca={s.troca} /> : <LegendaCinetica texto={texto} duracao={duracao} />;
    case "comente":
      return <Comente texto={texto} duracao={duracao} />;
    case "cta_final":
      return <CTAFinal texto={texto} duracao={duracao} />;
  }
};

export const Cena: React.FC<{ ctx: CtxCena; usarFundo2: boolean }> = ({ ctx, usarFundo2 }) => {
  const frame = useCurrentFrame();
  return (
    <ProvedorCena valor={ctx}>
      <AbsoluteFill>
        <Fundo tom={ctx.tom} decor={ctx.direcao.decor} g={frame + ctx.inicioGlobal} semente={ctx.direcao.semente} usarFundo2={usarFundo2} />
        <Conteudo s={ctx.segmento} />
      </AbsoluteFill>
    </ProvedorCena>
  );
};
