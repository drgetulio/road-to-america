// Número gigante com odômetro. Variante "placa": placa branca de limite de velocidade.
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import { AREA, COR, FONTE } from "../tema";
import { ajustar, caixaAlta, lerUnidades, separarNumero, textoUnidade } from "../texto";
import { Odometro } from "./Odometro";
import { TextoRico } from "./TextoRico";

type Props = { texto: string; duracao: number };

export const NumeroGigante: React.FC<Props> = ({ texto, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, direcao, segmento } = useCena();
  const gancho = segmento.gancho;
  const placa = direcao.numero === "placa";
  const partes = useMemo(() => separarNumero(texto), [texto]);

  const largHeroi = placa ? AREA.largura - 150 : AREA.largura - 20;
  const heroi = useMemo(
    () =>
      ajustar(lerUnidades(partes.heroi), {
        fonte: "bc800",
        largura: largHeroi,
        altura: 640,
        max: partes.numerico ? 400 : 260,
        min: 110,
        entrelinha: 0.92,
        maxLinhas: 2,
        maiusculas: true,
        tabular: true,
      }),
    [partes.heroi, partes.numerico, largHeroi],
  );
  const opRotulo = {
    fonte: "bc700" as const,
    largura: placa ? AREA.largura - 140 : AREA.largura,
    altura: 240,
    max: 104,
    min: 60,
    entrelinha: 1,
    maxLinhas: 2,
    maiusculas: true,
  };
  const antes = useMemo(() => (partes.antes ? ajustar(lerUnidades(partes.antes), opRotulo) : null), [partes.antes]); // eslint-disable-line
  const depois = useMemo(() => (partes.depois ? ajustar(lerUnidades(partes.depois), opRotulo) : null), [partes.depois]); // eslint-disable-line

  const a0 = gancho ? -12 : 3; // no gancho o número já aparece quase parado no primeiro quadro
  const entra = mola(frame, fps, a0 - 2, "pop");
  const zoom = interp(frame, [0, duracao], [1, 1.04]);
  const corHeroi = placa ? COR.tinta : tom.destaque;
  const linhasHeroi = heroi.linhas.map((l) => l.map((u) => textoUnidade(u, true)).join(" "));

  const conteudoHeroi = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {linhasHeroi.map((l, i) => (
        <Odometro key={i} texto={l} tamanho={heroi.tamanho} cor={corHeroi} atraso={a0 + 4 + i * 6} entrelinha={0.92} />
      ))}
    </div>
  );

  // contorno gigante ao fundo, em parallax
  const eco = caixaAlta(partes.heroi.replace(/\*/g, ""));

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: -200,
          right: -200,
          top: 700 + interp(frame, [0, duracao], [40, -40]),
          textAlign: "center",
          fontFamily: FONTE.titulo,
          fontWeight: 800,
          fontSize: Math.min(760, heroi.tamanho * 1.9),
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `4px ${tom.linha}`,
          whiteSpace: "nowrap",
          opacity: interp(frame, [a0, a0 + 20], [0, 1]),
          transform: `scale(${interp(frame, [0, duracao], [1.08, 1])})`,
        }}
      >
        {eco}
      </div>
      <div
        style={{
          position: "absolute",
          left: AREA.x,
          top: AREA.y,
          width: AREA.largura,
          height: AREA.altura,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 34,
          transform: `scale(${zoom})`,
        }}
      >
        {placa ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: 34,
              padding: "50px 60px 56px",
              boxShadow: `inset 0 0 0 12px #ffffff, inset 0 0 0 22px ${COR.tinta}, 0 40px 80px -30px rgba(0,0,0,0.55)`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
              transform: `translateY(${(1 - entra) * -260}px) rotate(${(1 - entra) * -6}deg)`,
              opacity: interp(frame, [a0 - 2, a0 + 3], [0, 1]),
              minWidth: 560,
              maxWidth: AREA.largura,
            }}
          >
            {antes ? (
              <TextoRico ajuste={antes} cor={COR.tinta} corDestaque={COR.vermelho} peso={700} atraso={a0} passo={2} entrada="subir" />
            ) : null}
            {conteudoHeroi}
          </div>
        ) : (
          <>
            {antes ? (
              <TextoRico ajuste={antes} cor={tom.suave} corDestaque={tom.destaque} peso={700} atraso={a0} passo={2} entrada="subir" />
            ) : null}
            <div style={{ transform: `scale(${0.9 + 0.1 * entra})` }}>{conteudoHeroi}</div>
          </>
        )}
        {depois ? (
          <TextoRico
            ajuste={depois}
            cor={tom.tinta}
            corDestaque={tom.destaque}
            peso={700}
            atraso={a0 + 14}
            passo={2.5}
            entrada="subir"
            sombra={!tom.claro}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
