// Tela de aplicativo estilizada (sem copiar interface de terceiros): busca, questão,
// flashcard, gráfico, documento, vídeo ou conversa no direct, conforme o texto da cena.
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { interp, mola } from "../anim";
import { useCena } from "../contexto";
import { AREA, COR, FONTE } from "../tema";
import { ajustar, caixaAlta, lerUnidades, semMarcas } from "../texto";
import { TextoRico } from "./TextoRico";

type Props = { texto: string; duracao: number };

type Modo = "busca" | "questao" | "flashcard" | "grafico" | "documento" | "video" | "direct";

export const modoDaTela = (texto: string): Modo => {
  const t = texto.toLowerCase();
  if (/\bdirect\b|links? oficiais|lista com/.test(t)) return "direct";
  if (/anki|cartão/.test(t)) return "flashcard";
  if (/aulas/.test(t)) return "video";
  if (/nbme|estimativa|simulados com/.test(t)) return "grafico";
  if (/questões|múltipla|simulado|correção|inglês/.test(t)) return "questao";
  if (/termo|guia passo|bulletin|passo a passo/.test(t)) return "documento";
  return "busca";
};

const Barra: React.FC<{ w: number | string; h?: number; cor: string; style?: React.CSSProperties }> = ({ w, h = 26, cor, style }) => (
  <div style={{ width: w, height: h, borderRadius: h / 2, background: cor, ...style }} />
);

export const TelaApp: React.FC<Props> = ({ texto, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { tom, segmento, palavraComentario } = useCena();
  const a0 = segmento.gancho ? -6 : 3;
  const modo = modoDaTela(texto);

  const titulo = useMemo(
    () => ajustar(lerUnidades(texto), { fonte: "bc800", largura: AREA.largura, altura: 300, max: 118, min: 72, entrelinha: 0.95, maxLinhas: 2, maiusculas: true, folgaDestaque: 0.1 }),
    [texto],
  );
  const altTitulo = titulo.linhas.length * titulo.tamanho * 0.95;

  const p = mola(frame, fps, a0 + 4, "pop");
  const dy = (1 - p) * 700;
  const respira = interp(frame, [a0, duracao], [1, 1.03]);
  const tela = COR.papel;
  const tinta = COR.tinta;
  const cinza = "rgba(13,26,43,0.12)";
  const cinza2 = "rgba(13,26,43,0.2)";
  const destaqueTxt = (texto.match(/\*([^*]+)\*/)?.[1] ?? semMarcas(texto)).trim();
  const dominio = texto.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}|[a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?/i)?.[0] ?? null;
  const t = (a: number, b: number) => interp(frame, [a0 + a, a0 + b], [0, 1]);

  const corpo = (() => {
    switch (modo) {
      case "busca": {
        // só digita quando a cena fala de digitar/buscar; senão mostra o resultado direto
        const digita = !!dominio || /digite|busque|aba|site/i.test(texto);
        const alvo = dominio ? dominio : digita ? destaqueTxt : "";
        const fimDigitacao = digita ? 8 + alvo.length * 1.3 : 4;
        const n = digita && alvo.length > 0 ? Math.round(interp(frame, [a0 + 8, a0 + fimDigitacao], [0, alvo.length])) : 0;
        const cursor = Math.floor(frame / 8) % 2 === 0;
        const res = t(fimDigitacao + 1, fimDigitacao + 11);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 22, height: 110, borderRadius: 55, background: "#fff", boxShadow: `inset 0 0 0 4px ${cinza2}`, padding: "0 36px" }}>
              <svg width={56} height={56} viewBox="0 0 100 100">
                <circle cx={42} cy={42} r={28} fill="none" stroke={tinta} strokeWidth={10} />
                <path d="M63 63 L86 86" stroke={tinta} strokeWidth={12} strokeLinecap="round" />
              </svg>
              <div style={{ fontFamily: dominio ? FONTE.mono : FONTE.titulo, fontWeight: dominio ? 600 : 700, fontSize: dominio ? 52 : 64, color: tinta, whiteSpace: "nowrap", overflow: "hidden" }}>
                {digita ? alvo.slice(0, n) : null}
                {digita ? <span style={{ opacity: cursor ? 1 : 0, color: COR.vermelho }}>|</span> : <Barra w={320} h={30} cor={cinza2} />}
              </div>
            </div>
            {[0, 1, 2].map((i) => {
              const certo = i === 0;
              const op = interp(res, [i * 0.25, i * 0.25 + 0.5], [0, 1]);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, padding: "28px 30px", borderRadius: 24, background: certo ? "#fff" : "transparent", boxShadow: certo ? `0 0 0 4px ${COR.verde}` : `inset 0 0 0 3px ${cinza}`, opacity: op, transform: `translateY(${(1 - op) * 30}px)` }}>
                  <div style={{ width: 70, height: 70, borderRadius: 18, background: certo ? COR.verde : cinza, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {certo ? (
                      <svg width={46} height={46} viewBox="0 0 100 100">
                        <path d="M18 54 L42 76 L84 26" fill="none" stroke="#fff" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
                    <Barra w={certo ? "80%" : "64%"} cor={certo ? "rgba(13,26,43,0.55)" : cinza2} />
                    <Barra w={certo ? "52%" : "40%"} h={20} cor={cinza} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      case "questao": {
        const relogio = /relógio|30 minutos/.test(texto);
        const restante = Math.max(0, 30 * 60 - Math.floor(Math.max(0, frame - a0) * 2));
        const mm = String(Math.floor(restante / 60)).padStart(2, "0");
        const ss = String(restante % 60).padStart(2, "0");
        const escolha = t(26, 32);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Barra w={300} h={30} cor={cinza2} />
              {relogio ? (
                <div style={{ fontFamily: FONTE.mono, fontWeight: 600, fontSize: 54, color: COR.vermelho, padding: "4px 20px", borderRadius: 14, boxShadow: `inset 0 0 0 4px ${COR.vermelho}` }}>
                  {mm}:{ss}
                </div>
              ) : null}
            </div>
            <Barra w="96%" h={22} cor={cinza} />
            <Barra w="88%" h={22} cor={cinza} />
            <Barra w="60%" h={22} cor={cinza} style={{ marginBottom: 10 }} />
            {["A", "B", "C", "D", "E"].map((l, i) => {
              const op = t(8 + i * 3, 14 + i * 3);
              const certa = i === 2;
              const marcada = certa && escolha > 0;
              return (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 24, padding: "10px 22px", borderRadius: 20, background: marcada ? COR.verde : "#fff", boxShadow: `inset 0 0 0 3px ${marcada ? COR.verde : cinza}`, opacity: op, transform: `translateX(${(1 - op) * 40}px) scale(${1 + 0.04 * interp(frame, [a0 + 26, a0 + 30, a0 + 38], [0, 1, 0])})` }}>
                  <div style={{ width: 64, height: 64, borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 50, color: marcada ? COR.verde : tinta, background: marcada ? "#fff" : cinza }}>
                    {l}
                  </div>
                  <Barra w={`${50 + ((i * 17) % 35)}%`} h={22} cor={marcada ? "rgba(255,255,255,0.75)" : cinza2} />
                </div>
              );
            })}
          </div>
        );
      }
      case "flashcard": {
        const giro = interp(frame, [a0 + 14, a0 + 30], [0, 180]);
        const verso = giro > 90;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 34, alignItems: "center" }}>
            <div style={{ width: "100%", height: 400, perspective: 1600 }}>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 30,
                  background: verso ? COR.navy : "#fff",
                  boxShadow: `inset 0 0 0 4px ${cinza2}`,
                  transform: `rotateY(${verso ? giro - 180 : giro}deg)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 22,
                }}
              >
                <Barra w="62%" h={30} cor={verso ? "rgba(255,255,255,0.5)" : cinza2} />
                <Barra w="44%" h={30} cor={verso ? "rgba(255,255,255,0.3)" : cinza} />
                {verso ? <Barra w="30%" h={30} cor={COR.amarelo} /> : null}
              </div>
            </div>
            <div style={{ display: "flex", gap: 18, width: "100%" }}>
              {[COR.vermelho, "#e08a2c", COR.verde, "#2f7fd1"].map((c, i) => {
                const op = t(32 + i * 2, 38 + i * 2);
                const toque = i === 2 ? interp(frame, [a0 + 44, a0 + 48, a0 + 56], [0, 1, 0]) : 0;
                return <div key={i} style={{ flex: 1, height: 100, borderRadius: 22, background: c, opacity: op, transform: `scale(${1 - 0.08 * toque})` }} />;
              })}
            </div>
          </div>
        );
      }
      case "grafico": {
        const alturas = [0.38, 0.52, 0.47, 0.66, 0.74, 0.86];
        return (
          <div style={{ height: 600, display: "flex", alignItems: "flex-end", gap: 26, padding: "0 10px", borderBottom: `6px solid ${cinza2}`, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 600 * 0.7, borderTop: `5px dashed ${COR.verde}`, opacity: t(30, 36) }} />
            {alturas.map((h, i) => {
              const g = mola(frame, fps, a0 + 8 + i * 4, "firme");
              const ultima = i === alturas.length - 1;
              return <div key={i} style={{ flex: 1, height: 600 * h * g, borderRadius: "18px 18px 0 0", background: ultima ? COR.verde : i >= 4 ? "rgba(29,138,75,0.55)" : cinza2 }} />;
            })}
          </div>
        );
      }
      case "documento": {
        const selo = mola(frame, fps, a0 + 26, "batida");
        return (
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 24, padding: "10px 0" }}>
            <Barra w="55%" h={40} cor="rgba(13,26,43,0.5)" />
            {new Array(9).fill(0).map((_, i) => {
              const op = t(6 + i * 1.6, 12 + i * 1.6);
              return <Barra key={i} w={`${[92, 86, 95, 70, 90, 82, 94, 60, 78][i]}%`} h={22} cor={i === 3 || i === 7 ? "rgba(241,194,50,0.8)" : cinza} style={{ opacity: op }} />;
            })}
            <div style={{ position: "absolute", right: 10, bottom: -10, width: 210, height: 210, borderRadius: 105, border: `10px solid ${COR.verde}`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${interp(selo, [0, 1], [2.2, 1], (x) => x)}) rotate(-12deg)`, opacity: interp(frame, [a0 + 26, a0 + 29], [0, 1]) }}>
              <svg width={110} height={110} viewBox="0 0 100 100">
                <path d="M18 54 L42 76 L84 26" fill="none" stroke={COR.verde} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        );
      }
      case "video": {
        const prog = interp(frame, [a0 + 10, duracao], [0.1, 0.62], (x) => x);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ height: 420, borderRadius: 26, background: COR.navy, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${COR.navy}, #1b3c6b)` }} />
              <div style={{ position: "relative", width: 150, height: 150, borderRadius: 75, background: COR.vermelho, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${1 + 0.06 * Math.sin(frame * 0.2)})` }}>
                <svg width={70} height={70} viewBox="0 0 100 100">
                  <path d="M30 18 L84 50 L30 82 Z" fill="#fff" />
                </svg>
              </div>
              <div style={{ position: "absolute", left: 30, right: 30, bottom: 30, height: 14, borderRadius: 7, background: "rgba(255,255,255,0.25)" }}>
                <div style={{ width: `${prog * 100}%`, height: "100%", borderRadius: 7, background: COR.amarelo }} />
              </div>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", gap: 22, alignItems: "center", opacity: t(12 + i * 4, 18 + i * 4) }}>
                <div style={{ width: 150, height: 90, borderRadius: 16, background: i === 0 ? COR.vermelho : cinza2 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                  <Barra w="78%" cor={cinza2} />
                  <Barra w="45%" h={20} cor={cinza} />
                </div>
              </div>
            ))}
          </div>
        );
      }
      case "direct": {
        const palavra = palavraComentario ? caixaAlta(palavraComentario) : null;
        const b1 = mola(frame, fps, a0 + 8, "pop");
        const digitando = frame > a0 + 16 && frame < a0 + 30;
        const b2 = mola(frame, fps, a0 + 30, "pop");
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 26, minHeight: 520 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20, paddingBottom: 20, borderBottom: `3px solid ${cinza}` }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, background: COR.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Escudo tamanho={54} />
              </div>
              <Barra w={260} h={30} cor={cinza2} />
            </div>
            {palavra ? (
              <div style={{ alignSelf: "flex-end", padding: "22px 36px", borderRadius: "40px 40px 10px 40px", background: "#3b5bdb", color: "#fff", fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 72, transform: `scale(${b1})`, transformOrigin: "100% 100%" }}>
                {palavra}
              </div>
            ) : null}
            {digitando ? (
              <div style={{ alignSelf: "flex-start", display: "flex", gap: 12, padding: "26px 30px", borderRadius: 40, background: "#fff", boxShadow: `inset 0 0 0 3px ${cinza}` }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 22, height: 22, borderRadius: 11, background: tinta, opacity: 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(frame * 0.5 - i)) }} />
                ))}
              </div>
            ) : null}
            {frame >= a0 + 30 ? (
              <div style={{ alignSelf: "flex-start", width: "82%", padding: 28, borderRadius: "40px 40px 40px 10px", background: "#fff", boxShadow: `inset 0 0 0 3px ${cinza}`, display: "flex", flexDirection: "column", gap: 18, transform: `scale(${b2})`, transformOrigin: "0% 100%" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    <svg width={56} height={56} viewBox="0 0 100 100">
                      <path d="M42 58 L58 42 M36 48 L24 60 A15 15 0 0 0 40 76 L52 64 M64 52 L76 40 A15 15 0 0 0 60 24 L48 36" fill="none" stroke={COR.verde} strokeWidth={10} strokeLinecap="round" />
                    </svg>
                    <Barra w={`${70 - i * 12}%`} h={24} cor={cinza2} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      }
    }
  })();

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: AREA.x, top: AREA.y, width: AREA.largura, height: AREA.altura, display: "flex", flexDirection: "column", gap: 44, justifyContent: "center" }}>
        <div style={{ minHeight: altTitulo }}>
          <TextoRico ajuste={titulo} cor={tom.tinta} corDestaque={tom.destaque} alinhar="left" atraso={a0} passo={2.5} sombra={!tom.claro} variante={tom.claro ? "cor" : "pop"} />
        </div>
        <div
          style={{
            background: tela,
            borderRadius: 40,
            padding: "26px 40px 44px",
            boxShadow: tom.claro ? `0 40px 90px -40px rgba(13,26,43,0.55), inset 0 0 0 3px ${cinza}` : "0 50px 100px -40px rgba(0,0,0,0.75)",
            transform: `translateY(${dy}px) scale(${respira})`,
            transformOrigin: "50% 0%",
          }}
        >
          <div style={{ display: "flex", gap: 14, marginBottom: 30 }}>
            {[COR.vermelho, COR.amarelo, COR.verde].map((c) => (
              <div key={c} style={{ width: 26, height: 26, borderRadius: 13, background: c }} />
            ))}
          </div>
          {corpo}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Escudo: React.FC<{ tamanho: number }> = ({ tamanho }) => (
  <svg width={tamanho * (34 / 38)} height={tamanho} viewBox="0 0 34 38">
    <path d="M3 2.5h28c.9 3.4.9 6.6 0 9.3 2.6 7.6 1.4 15.3-5.4 20.7-3.6 2.8-6.6 3.9-8.6 4.6-2-.7-5-1.8-8.6-4.6C1.6 27.1.4 19.4 3 11.8c-.9-2.7-.9-5.9 0-9.3z" fill="#0f2747" stroke="#ffffff" strokeWidth={1.2} />
    <path d="M3.4 3.3h27.2c.6 2.6.6 5 0 7.2H3.4c-.6-2.2-.6-4.6 0-7.2z" fill="#b0243a" />
    <path d="M11 17h12M11 22h12M11 27h12" stroke="#f1c232" strokeWidth={2.4} strokeLinecap="round" strokeDasharray="4 3" />
  </svg>
);
