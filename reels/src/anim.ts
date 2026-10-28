// Atalhos de animação: tudo deriva do frame atual, sempre com clamp.
import { Easing, interpolate, spring } from "remotion";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** interpolate com clamp nas duas pontas. */
export const interp = (
  frame: number,
  entrada: number[],
  saida: number[],
  easing: (t: number) => number = Easing.bezier(0.16, 1, 0.3, 1),
) => interpolate(frame, entrada, saida, { ...clamp, easing });

/** Mola com leve overshoot, usada nas entradas. */
export const mola = (frame: number, fps: number, atraso = 0, tipo: keyof typeof MOLAS = "pop") =>
  spring({ frame: frame - atraso, fps, config: MOLAS[tipo] });

export const MOLAS = {
  pop: { damping: 11, stiffness: 190, mass: 0.6 }, // overshoot leve
  firme: { damping: 18, stiffness: 160, mass: 0.8 }, // quase sem overshoot
  batida: { damping: 9, stiffness: 320, mass: 0.7 }, // carimbo
  lenta: { damping: 20, stiffness: 60, mass: 1 }, // movimentos de câmera
  balanco: { damping: 5, stiffness: 90, mass: 0.9 }, // placa balançando
} as const;

/** Mistura linear entre dois números. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
