// Texto: leitura dos *destaques*, caixa alta inteligente e medição
// com as larguras reais dos glifos (extraídas das fontes em src/metricas.json).
import metricas from "./metricas.json";

export type Palavra = {
  texto: string;
  destaque: boolean;
};

export type ChaveFonte = "bc800" | "bc700" | "bc600" | "b600" | "b500" | "om600";

const TABELA = metricas as Record<ChaveFonte, Record<string, number>>;

// Glifos ausentes nas fontes recebem tratamento especial no desenho.
export const SETA = "→";

/** "Sem SAEME, *sem USMLE*?" vira unidades (palavras) com trechos destacados. */
export type Unidade = Palavra[];
export const lerUnidades = (bruto: string): Unidade[] => {
  const res: Unidade[] = [];
  let destaque = false;
  for (const pedaco of bruto.split(/\s+/)) {
    if (!pedaco) continue;
    const u: Unidade = [];
    let atual = "";
    for (const ch of pedaco) {
      if (ch === "*") {
        if (atual) u.push({ texto: atual, destaque });
        atual = "";
        destaque = !destaque;
        continue;
      }
      atual += ch;
    }
    if (atual) u.push({ texto: atual, destaque });
    if (u.length) res.push(u);
  }
  return res;
};

const ehDominio = (t: string) => /[a-z]\.[a-z]{2,}/.test(t);
const ehSiglaPlural = (t: string) => /^[A-Z]{2,}s[.,:;!?]*$/.test(t);

/** Caixa alta no estilo Hormozi, preservando domínios, siglas no plural e a unidade "h". */
export const caixaAlta = (t: string): string => {
  if (ehDominio(t) || ehSiglaPlural(t)) return t;
  if (/^h([/.,:;!?]|$)/.test(t)) return t;
  return t.toLocaleUpperCase("pt-BR");
};

const digitoMaisLargo = (fonte: ChaveFonte) => Math.max(...[..."0123456789"].map((d) => TABELA[fonte][d] ?? 0.55));

/** Largura em px. Com tabular, cada dígito ocupa a largura do mais largo (tnum, usado no odômetro). */
export const larguraTexto = (t: string, fonte: ChaveFonte, tamanho: number, espacamento = 0, tabular = false): number => {
  const tab = TABELA[fonte];
  const dig = tabular ? digitoMaisLargo(fonte) : 0;
  let w = 0;
  for (const ch of t) {
    if (tabular && ch >= "0" && ch <= "9") {
      w += dig;
      continue;
    }
    if (ch === SETA) {
      w += 0.9;
      continue;
    }
    w += tab[ch] ?? 0.55;
  }
  return w * tamanho + espacamento * tamanho * [...t].length;
};

export type Linha = Unidade[];

export type Ajuste = {
  tamanho: number;
  linhas: Linha[];
};

type OpcoesAjuste = {
  fonte: ChaveFonte;
  largura: number;
  altura: number;
  max: number;
  min: number;
  entrelinha: number;
  maxLinhas?: number;
  maiusculas?: boolean;
  espacamento?: number; // letter-spacing em em
  folgaDestaque?: number; // largura extra (em) por unidade destacada (caixas)
  tabular?: boolean; // dígitos com largura fixa
};

export const textoUnidade = (u: Unidade, maiusculas: boolean) =>
  u.map((p) => (maiusculas ? caixaAlta(p.texto) : p.texto)).join("");

const quebrar = (us: Unidade[], tamanho: number, o: OpcoesAjuste): Linha[] => {
  const esp = larguraTexto(" ", o.fonte, tamanho);
  const linhas: Linha[] = [];
  let atual: Linha = [];
  let w = 0;
  for (const u of us) {
    const extra = u.some((p) => p.destaque) ? (o.folgaDestaque ?? 0) * tamanho : 0;
    const uw = larguraTexto(textoUnidade(u, o.maiusculas ?? false), o.fonte, tamanho, o.espacamento, o.tabular) + extra;
    if (atual.length === 0) {
      atual.push(u);
      w = uw;
    } else if (w + esp + uw <= o.largura) {
      atual.push(u);
      w += esp + uw;
    } else {
      linhas.push(atual);
      atual = [u];
      w = uw;
    }
  }
  if (atual.length) linhas.push(atual);
  return linhas;
};

const larguraLinha = (l: Linha, tamanho: number, o: OpcoesAjuste) => {
  const esp = larguraTexto(" ", o.fonte, tamanho);
  return l.reduce((acc, u, i) => {
    const extra = u.some((p) => p.destaque) ? (o.folgaDestaque ?? 0) * tamanho : 0;
    return acc + (i ? esp : 0) + larguraTexto(textoUnidade(u, o.maiusculas ?? false), o.fonte, tamanho, o.espacamento, o.tabular) + extra;
  }, 0);
};

/** Maior tamanho de fonte em que o texto cabe na caixa. */
export const ajustar = (us: Unidade[], o: OpcoesAjuste): Ajuste => {
  for (let t = o.max; t >= o.min; t -= 2) {
    const linhas = quebrar(us, t, o);
    const cabeLargura = linhas.every((l) => larguraLinha(l, t, o) <= o.largura + 0.5);
    const cabeAltura = linhas.length * t * o.entrelinha <= o.altura;
    const cabeLinhas = linhas.length <= (o.maxLinhas ?? 99);
    if (cabeLargura && cabeAltura && cabeLinhas) {
      return { tamanho: t, linhas: equilibrar(linhas, us, t, o) };
    }
  }
  return { tamanho: o.min, linhas: quebrar(us, o.min, o) };
};

// Evita a última linha com uma palavra só ("viúva") quando dá para equilibrar.
const equilibrar = (linhas: Linha[], us: Unidade[], t: number, o: OpcoesAjuste): Linha[] => {
  if (linhas.length < 2) return linhas;
  const ultima = linhas[linhas.length - 1];
  if (ultima.length > 1) return linhas;
  // tenta largura menor até a contagem de linhas mudar
  let melhor = linhas;
  for (let f = 0.95; f >= 0.6; f -= 0.05) {
    const tentativa = quebrar(us, t, { ...o, largura: o.largura * f });
    if (tentativa.length !== linhas.length) break;
    melhor = tentativa;
    if (tentativa[tentativa.length - 1].length > 1) break;
  }
  return melhor;
};

/** Separa "EXIT 01: *verificar faculdade*" em rótulo e corpo. */
export const separarRotulo = (texto: string): { rotulo: string | null; corpo: string } => {
  const m = texto.match(/^((?:EXIT|Passo)\s*\d*)\s*:\s*(.+)$/i);
  if (m) return { rotulo: m[1].trim(), corpo: m[2] };
  if (/^EXIT\s*:/i.test(texto)) return { rotulo: "EXIT", corpo: texto.replace(/^EXIT\s*:\s*/i, "") };
  return { rotulo: null, corpo: texto };
};

/** Texto sem a marcação. */
export const semMarcas = (t: string) => t.replace(/\*/g, "");

/** Partes do número gigante: antes, herói e depois (com marcações preservadas). */
export const separarNumero = (texto: string): { antes: string; heroi: string; depois: string; numerico: boolean } => {
  const m = texto.match(/\*([^*]+)\*/);
  if (m && /\d/.test(m[1])) {
    const i = texto.indexOf(m[0]);
    return {
      antes: limparBorda(texto.slice(0, i)),
      heroi: m[1],
      depois: limparBorda(texto.slice(i + m[0].length)),
      numerico: true,
    };
  }
  const plano = texto;
  const re = /((?:jan|fev|mar|abr|maio|mai|jun|jul|ago|set|out|nov|dez)\.?\s)?(?:R\$|US\$|AU\$)?\s?\d[\d.,/]*(?:\s?(?:%|h\b|x\b))?/i;
  const n = plano.match(re);
  if (n && n.index !== undefined && !/^(Step|Pathway)\s$/i.test(plano.slice(Math.max(0, n.index - 5), n.index))) {
    // ignora números que fazem parte de nomes ("Step 1", "Pathway 3")
    const antesTrecho = plano.slice(0, n.index);
    if (!/(Step|Pathway|PGY-)\s?$/i.test(antesTrecho)) {
      return {
        antes: limparBorda(antesTrecho),
        heroi: n[0].trim(),
        depois: limparBorda(plano.slice(n.index + n[0].length)),
        numerico: true,
      };
    }
  }
  if (m) {
    const i = texto.indexOf(m[0]);
    return {
      antes: limparBorda(texto.slice(0, i)),
      heroi: m[1],
      depois: limparBorda(texto.slice(i + m[0].length)),
      numerico: false,
    };
  }
  return { antes: "", heroi: texto, depois: "", numerico: /\d/.test(texto) };
};

// tira pontuação solta nas bordas (": ", ", "), mas mantém "?" e "." finais
const limparBorda = (t: string) =>
  t
    .replace(/^[\s:,.]+/, "")
    .replace(/[\s:,]+$/, "")
    .trim();

/** caixaAlta aplicada palavra a palavra (respeita "h", domínios e siglas no plural). */
export const caixaAltaFrase = (t: string) => t.split(" ").map(caixaAlta).join(" ");
