/* Road to America | simulado: busca na tabela de valores laboratoriais.
   Pura: recebe o JSON de simulado/data/valores-laboratoriais.json e um termo. */

export function normalizar(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* Texto em que a busca procura: nome em inglês, nome em português, seção e linhas */
function indice(item, secao) {
  return normalizar([item.nome, item.pt, secao.titulo, secao.titulo_pt, ...(item.linhas || []).map((l) => l[0])].join(" "));
}

/* Filtra a tabela. Sem termo, devolve as seções inteiras (ou só a seção pedida).
   Cada palavra do termo precisa aparecer (busca "e" lógico). */
export function filtrarLabs(dados, termo = "", secaoId = null) {
  const palavras = normalizar(termo).split(" ").filter(Boolean);
  const out = [];
  for (const secao of dados?.secoes || []) {
    if (secaoId && !palavras.length && secao.id !== secaoId) continue;
    const itens = palavras.length ? secao.itens.filter((it) => { const t = indice(it, secao); return palavras.every((p) => t.includes(p)); }) : secao.itens;
    if (itens.length) out.push({ ...secao, itens });
  }
  return out;
}

export const contarItens = (secoes) => secoes.reduce((s, x) => s + x.itens.length, 0);
