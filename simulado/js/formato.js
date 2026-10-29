/* Road to America | simulados: formatação de números, tempos e rótulos (puro) */

/* Percentual com vírgula: 0,9051 -> "90,5%" */
export function pct(x, casas = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "sem dados";
  return (x * 100).toFixed(casas).replace(".", ",") + "%";
}

/* Probabilidade de aprovação: o mesmo texto do banco, de "Meu progresso" e da área
   administrativa (textoProbabilidade, em plataforma/js/psicometria.js) */
export function prob(p) {
  return textoProbabilidade(p);
}

export function num(x, casas = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "sem dados";
  return (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(casas).replace(".", ",");
}

/* Duração legível: "8 h", "1 h 05 min", "25 min", "40 s" */
export function duracao(ms) {
  const t = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (h && m) return h + " h " + String(m).padStart(2, "0") + " min";
  if (h) return h + " h";
  if (m) return m + " min" + (s && m < 5 ? " " + s + " s" : "");
  return s + " s";
}

export const plural = (n, um, varios) => n + " " + (n === 1 ? um : varios);
