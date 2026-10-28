// Mostrador circular com contagem numérica. Sem número no texto, vira um medidor com ponteiro.
import React, { useMemo } from "react";
import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import { AREA, FONTE } from "../tema";
import { ajustar, caixaAltaFrase, larguraTexto, lerUnidades } from "../texto";
import { TextoRico } from "./TextoRico";

type Props = { texto: string; duracao: number };

const formatar = (n: number, comMilhar: boolean) => (comMilhar ? Math.round(n).toLocaleString("pt-BR") : String(Math.round(n)));

export const Contador: React.FC<Props> = ({ texto, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, segmento } = useCena();
  const a0 = segmento.gancho ? -10 : 3;

  // trecho destacado: "30 a 40 min", "US$ 3.000 a 4.000", "12 h" (+ "/semana" colado)
  const partes = useMemo(() => {
    const m = texto.match(/\*([^*]+)\*/);
    if (!m || m.index === undefined) return { antes: texto, destaque: "", depois: "" };
    let destaque = m[1];
    let depois = texto.slice(m.index + m[0].length);
    const colado = depois.match(/^\/\S+/);
    if (colado) {
      destaque += colado[0];
      depois = depois.slice(colado[0].length);
    }
    const limpa = (x: string) => x.replace(/^[\s:.,]+|[\s:,]+$/g, "").trim();
    return { antes: limpa(texto.slice(0, m.index)), destaque, depois: limpa(depois) };
  }, [texto]);
  const destaque = partes.destaque;
  const numeros = useMemo(() => [...destaque.matchAll(/\d{1,3}(?:\.\d{3})+|\d+/g)].map((m) => ({ txt: m[0], idx: m.index ?? 0 })), [destaque]);
  const temNumero = numeros.length > 0;
  const minutos = /min/.test(destaque);

  const opRotulo = { fonte: "bc700" as const, largura: AREA.largura, altura: 220, max: 100, min: 60, entrelinha: 1, maxLinhas: 2, maiusculas: true };
  const textoTopo = temNumero ? partes.antes : texto;
  const topo = useMemo(() => (textoTopo ? ajustar(lerUnidades(textoTopo), opRotulo) : null), [textoTopo]); // eslint-disable-line
  const textoBase = temNumero ? partes.depois : "";
  const base = useMemo(() => (textoBase ? ajustar(lerUnidades(textoBase), opRotulo) : null), [textoBase]); // eslint-disable-line

  const t = interp(frame, [a0 + 2, a0 + 34], [0, 1], Easing.bezier(0.33, 1, 0.68, 1));
  // texto do mostrador com a contagem
  let mostrador = destaque;
  if (temNumero) {
    let out = "";
    let pos = 0;
    numeros.forEach((n, i) => {
      const alvo = Number(n.txt.replace(/\./g, ""));
      const anterior = i > 0 ? Number(numeros[i - 1].txt.replace(/\./g, "")) : 0;
      const ti = numeros.length > 1 ? interp(t, [i / numeros.length, (i + 1) / numeros.length], [0, 1], (x) => x) : t;
      const v = i === 0 ? alvo * ti : anterior + (alvo - anterior) * ti;
      out += destaque.slice(pos, n.idx) + formatar(v, n.txt.includes("."));
      pos = n.idx + n.txt.length;
    });
    mostrador = out + destaque.slice(pos);
  }
  // número grande em cima; unidade (min, h, minutos) menor embaixo
  const final = caixaAltaFrase(destaque);
  const atual = caixaAltaFrase(mostrador);
  const tokensFinal = final.split(" ");
  const ultimoEhUnidade = tokensFinal.length > 1 && /^[A-Za-zÀ-ú/]+$/.test(tokensFinal[tokensFinal.length - 1]);
  const dividir = (s: string): [string, string] => {
    const tk = s.split(" ");
    if (tk.length < 2) return [s, ""];
    if (ultimoEhUnidade) return [tk.slice(0, -1).join(" "), tk[tk.length - 1]];
    if (s.length <= 8) return [s, ""];
    let melhor = 1;
    let dif = 1e9;
    for (let i = 1; i < tk.length; i++) {
      const d = Math.abs(tk.slice(0, i).join(" ").length - tk.slice(i).join(" ").length);
      if (d < dif) {
        dif = d;
        melhor = i;
      }
    }
    return [tk.slice(0, melhor).join(" "), tk.slice(melhor).join(" ")];
  };
  const [l1Final, l2Final] = dividir(final);
  const [l1, l2] = dividir(atual);

  const R = 330;
  const C = 2 * Math.PI * R;
  const maxNum = temNumero ? Number(numeros[numeros.length - 1].txt.replace(/\./g, "")) : 0;
  const fracao = minutos ? Math.min(1, maxNum / 60) : 1;
  const arco = fracao * t;
  const pEntra = mola(frame, fps, a0, "pop");

  // medidor: ponteiro com mola amortecida
  const ponteiro = -110 + 200 * mola(frame, fps, a0 + 6, "balanco");

  const caixa = 2 * R - 150;
  const tamMostrador = Math.min(210, caixa / Math.max(0.01, larguraTexto(l1Final, "bc800", 1)));
  const tamUnidade = ultimoEhUnidade ? Math.min(tamMostrador * 0.5, caixa / Math.max(0.01, larguraTexto(l2Final, "bc700", 1))) : Math.min(tamMostrador, caixa / Math.max(0.01, larguraTexto(l2Final || "0", "bc800", 1)));

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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 50,
          transform: `scale(${interp(frame, [0, duracao], [1, 1.035])})`,
        }}
      >
        {topo && temNumero ? (
          <TextoRico ajuste={topo} peso={700} cor={tom.suave} corDestaque={tom.destaque} atraso={a0} passo={2} entrada="subir" variante="cor" />
        ) : null}
        <div style={{ position: "relative", width: 2 * R + 60, height: 2 * R + 60, transform: `scale(${0.6 + 0.4 * pEntra})`, opacity: interp(frame, [a0, a0 + 5], [0, 1]) }}>
          <svg width={2 * R + 60} height={2 * R + 60} style={{ position: "absolute", inset: 0 }}>
            <g transform={`translate(${R + 30} ${R + 30})`}>
              {new Array(60).fill(0).map((_, i) => {
                const ang = (i / 60) * Math.PI * 2;
                const longo = i % 5 === 0;
                const aceso = i / 60 <= arco;
                return (
                  <line
                    key={i}
                    x1={Math.sin(ang) * (R - 40)}
                    y1={-Math.cos(ang) * (R - 40)}
                    x2={Math.sin(ang) * (R - (longo ? 78 : 58))}
                    y2={-Math.cos(ang) * (R - (longo ? 78 : 58))}
                    stroke={aceso && temNumero ? tom.destaque : tom.linha}
                    strokeWidth={longo ? 8 : 4}
                    strokeLinecap="round"
                    opacity={aceso || !temNumero ? 1 : 0.9}
                  />
                );
              })}
              <circle r={R} fill="none" stroke={tom.linha} strokeWidth={26} />
              {temNumero ? (
                <circle
                  r={R}
                  fill="none"
                  stroke={tom.destaque2}
                  strokeWidth={26}
                  strokeLinecap="round"
                  strokeDasharray={`${C * arco} ${C}`}
                  transform="rotate(-90)"
                />
              ) : (
                <>
                  {["#ef6276", "#f1c232", "#2fbf6b"].map((cor, k) => (
                    <circle
                      key={cor}
                      r={R}
                      fill="none"
                      stroke={cor}
                      strokeWidth={26}
                      strokeDasharray={`${C * (78 / 360) * interp(frame, [a0 + k * 4, a0 + 10 + k * 4], [0, 1])} ${C}`}
                      transform={`rotate(${-90 - 120 + k * 80 + 1})`}
                    />
                  ))}
                <g transform={`rotate(${ponteiro})`}>
                  <path d={`M -16 0 L 0 ${-(R - 90)} L 16 0 Z`} fill={tom.destaque} />
                  <circle r={30} fill={tom.destaque} />
                </g>
                </>
              )}
            </g>
          </svg>
          {temNumero ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONTE.titulo,
                fontWeight: 800,
                color: tom.tinta,
                fontFeatureSettings: '"tnum" 1',
                whiteSpace: "nowrap",
                lineHeight: 0.92,
              }}
            >
              <div style={{ fontSize: tamMostrador }}>{l1}</div>
              {l2 ? (
                <div style={{ fontSize: Math.max(60, tamUnidade), fontWeight: ultimoEhUnidade ? 700 : 800, color: ultimoEhUnidade ? tom.destaque : tom.tinta, marginTop: 8 }}>
                  {l2}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {(temNumero ? base : topo) ? (
          <TextoRico
            ajuste={(temNumero ? base : topo)!}
            peso={temNumero ? 700 : 800}
            cor={tom.tinta}
            corDestaque={tom.destaque}
            atraso={a0 + 10}
            passo={2.5}
            entrada="subir"
            variante="cor"
            sombra={!tom.claro}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
