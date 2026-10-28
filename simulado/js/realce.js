/* Road to America | simulado: realce de trechos do texto da questão.
   Os realces são intervalos [inicio, fim) sobre o texto puro da vinheta ou da
   pergunta. Funções puras: a tela converte a seleção do navegador em
   deslocamentos e pede aqui os segmentos para desenhar. */

/* Ordena e funde intervalos que se tocam ou se sobrepõem; descarta vazios */
export function mesclar(intervalos, tamanho = Infinity) {
  const lista = (intervalos || [])
    .map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(tamanho, Math.max(a, b))])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = [];
  for (const [a, b] of lista) {
    const ult = out[out.length - 1];
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b);
    else out.push([a, b]);
  }
  return out;
}

/* Acrescenta um realce. Se o trecho já estiver todo realçado, remove o realce
   desse trecho (o mesmo gesto liga e desliga, como no software da prova). */
export function alternar(intervalos, a, b, tamanho = Infinity) {
  const [ini, fim] = [Math.min(a, b), Math.max(a, b)];
  if (fim <= ini) return mesclar(intervalos, tamanho);
  const atual = mesclar(intervalos, tamanho);
  const coberto = atual.some(([x, y]) => x <= ini && y >= fim);
  if (!coberto) return mesclar([...atual, [ini, fim]], tamanho);
  return remover(atual, ini, fim);
}

/* Tira o trecho [a, b) de todos os realces */
export function remover(intervalos, a, b) {
  const out = [];
  for (const [x, y] of mesclar(intervalos)) {
    if (y <= a || x >= b) { out.push([x, y]); continue; }
    if (x < a) out.push([x, a]);
    if (y > b) out.push([b, y]);
  }
  return out;
}

/* Intervalo realçado que contém a posição p (ou null) */
export function realceEm(intervalos, p) {
  return mesclar(intervalos).find(([x, y]) => p >= x && p < y) || null;
}

/* Quebra o texto em segmentos { texto, realce, inicio } para desenhar */
export function segmentos(texto, intervalos) {
  const t = String(texto || "");
  const lista = mesclar(intervalos, t.length);
  const out = [];
  let p = 0;
  for (const [a, b] of lista) {
    if (a > p) out.push({ texto: t.slice(p, a), realce: false, inicio: p });
    out.push({ texto: t.slice(a, b), realce: true, inicio: a });
    p = b;
  }
  if (p < t.length) out.push({ texto: t.slice(p), realce: false, inicio: p });
  return out;
}
