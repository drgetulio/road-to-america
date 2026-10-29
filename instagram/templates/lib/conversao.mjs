// Conversão ativa (instagram/conversao.json): CTA de cada dia com palavra-chave, desafio de
// 30 dias, live mensal de correção e textos da resposta automática no direct.
import fs from 'node:fs';
import path from 'node:path';
import { PASTA_INSTAGRAM, num3, diaSemanaDe } from './dados.mjs';

let _c = null;
export function conversao() {
  if (!_c) _c = JSON.parse(fs.readFileSync(path.join(PASTA_INSTAGRAM, 'conversao.json'), 'utf8'));
  return _c;
}

const INICIO = '2026-11-02';
const msDia = 86400000;
const paraData = (iso) => Date.UTC(...iso.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));
export const somarDias = (iso, n) => new Date(paraData(iso) + n * msDia).toISOString().slice(0, 10);
export const numeroDoDia = (iso) => Math.round((paraData(iso) - paraData(INICIO)) / msDia) + 1;
export const semanaDoDia = (n) => Math.ceil(n / 7);
const curta = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const SEM = { 'segunda-feira': 'segunda', 'terça-feira': 'terça', 'quarta-feira': 'quarta', 'quinta-feira': 'quinta', 'sexta-feira': 'sexta', 'sábado': 'sábado', domingo: 'domingo' };
export const dataFalada = (iso) => `${SEM[diaSemanaDe(iso)]}, ${curta(iso)}`;

// ---------- desafio ----------
export function desafioDoDia(data) {
  for (const e of conversao().desafio.edicoes) {
    if (data >= e.inicio && data <= e.fim) return { ...e, dia_do_desafio: numeroDoDia(data) - e.dia_inicio + 1, fase: 'em_andamento' };
    if (data >= e.inscricao[0] && data <= e.inscricao[1]) return { ...e, dia_do_desafio: null, fase: 'inscricao' };
  }
  return null;
}
// próxima edição a partir de uma data (para o texto do CTA "começa em ...")
export function proximoDesafio(data) {
  return conversao().desafio.edicoes.find((e) => e.inicio >= data) || null;
}

// ---------- live ----------
export const proximaLive = (data) => conversao().lives.datas.find((d) => d >= data) || null;
export function ehDiaDeLive(data) {
  return conversao().lives.datas.includes(data);
}
// sábado anterior à live (5 dias antes de uma quinta)
const ehSabadoAntesDaLive = (data) => conversao().lives.datas.some((d) => somarDias(d, -5) === data);

// ---------- CTA ----------
// Ordem: cta_forcado do JSON do dia > inscrição do desafio > dia da live e sábado antes >
// primeira quarta do mês (verificador) > CTA do quadro (conversao.json, cta_por_quadro).
export function ctaDoDia(dia) {
  if (dia.cta_forcado) return dia.cta_forcado;
  const c = conversao();
  const data = dia.data || '';
  const des = desafioDoDia(data);
  if (des && des.fase === 'inscricao') return 'desafio';
  if (ehDiaDeLive(data) || ehSabadoAntesDaLive(data)) return 'live';
  if (dia.dia_semana === 'quarta-feira' && Number(data.slice(8, 10)) <= 7) return 'verificador';
  const tipo = c.cta_por_quadro[dia.quadro] || 'salvar';
  // MACETE manda os sete macetes mais recentes (pacote de sexta a quinta, trocado na sexta às 12h):
  // o primeiro pacote só existe a partir da sexta do dia 5
  if (tipo === 'macete' && (dia.n ?? dia.dia ?? 99) < 5) return 'salvar';
  return tipo;
}

function preencher(t, dia) {
  const data = dia.data || INICIO;
  const des = proximoDesafio(data) || conversao().desafio.edicoes.at(-1);
  const live = proximaLive(data) || conversao().lives.datas.at(-1);
  return t
    .replaceAll('{inicio}', `em ${curta(des.inicio)}`)
    .replaceAll('{inicio_curto}', curta(des.inicio))
    .replaceAll('{data_live}', dataFalada(live))
    .replaceAll('{data_live_curta}', curta(live))
    .replaceAll('{hora_live}', conversao().lives.horario);
}

// Frase do CTA na legenda (varia por semana para não repetir a mesma todo dia).
export function textoCta(dia) {
  if (dia.legenda && dia.legenda.cta_texto) return dia.legenda.cta_texto;
  const tipo = ctaDoDia(dia);
  const lista = conversao().frases_cta[tipo] || conversao().frases_cta.salvar;
  return preencher(lista[(semanaDoDia(dia.n || dia.dia || 1) + (dia.n || dia.dia || 1)) % lista.length], dia);
}

export function palavraDoCta(tipo) {
  return (conversao().slide_cta[tipo] || {}).palavra || null;
}

export function slideCta(dia) {
  const tipo = ctaDoDia(dia);
  const s = conversao().slide_cta[tipo] || conversao().slide_cta.salvar;
  return {
    tipo,
    ...s,
    campos: (s.campos || []).map(([k, v]) => [k, preencher(v, dia)]),
  };
}

// Linha do desafio na legenda e no roteiro dos stories.
export function linhaDesafio(dia) {
  const des = desafioDoDia(dia.data || '');
  if (!des) return null;
  const nome = conversao().desafio.nome;
  if (des.fase === 'inscricao') return `${nome}: a edição ${des.edicao} começa em ${curta(des.inicio)}. Comente DESAFIO e receba as regras e a cartela no direct.`;
  return `${nome}, edição ${des.edicao}: dia ${des.dia_do_desafio} de 30. Vote na enquete das 12h06 e marque a cartela amanhã, quando sair o gabarito.`;
}

// ---------- direct ----------
export function linkDm(palavra) {
  const c = conversao();
  const p = c.palavras[palavra];
  if (!p || !p.link) return null;
  const u = new URL(c.links[p.link]);
  const hash = u.hash;
  u.hash = '';
  const q = new URLSearchParams({ utm_source: 'instagram', utm_medium: 'dm', utm_campaign: 'questao_de_embarque', utm_content: palavra.toLowerCase() });
  return `${u.toString()}${u.search ? '&' : '?'}${q.toString()}${hash}`;
}

export function textoDm(palavra, extra = {}) {
  const c = conversao();
  const p = c.palavras[palavra];
  let t = p.dm
    .replaceAll('{link}', linkDm(palavra) || '')
    .replaceAll('{assinatura}', c.assinatura_dm)
    .replaceAll('{aviso}', c.aviso_privacidade.replaceAll('{privacidade}', c.links.privacidade));
  for (const [k, v] of Object.entries(extra)) t = t.replaceAll(`{${k}}`, v);
  return t;
}

// ---------- pacote do MACETE ----------
// O MACETE do direct manda os sete macetes mais recentes com gabarito publicado: de sexta a quinta.
// O pacote k fica ativo da sexta da semana k às 12h (quando sai o gabarito da quinta) até a sexta
// seguinte às 12h, então o Reel das 19h de sexta (questão de segunda a quarta) já está nele.
// O pacote 53 (dias 362 a 365) fecha o programa, a partir de 02/11/2027.
export const PACOTES_MACETE = 53;
export function diasDoPacote(k) {
  const fim = Math.min(365, 7 * (k - 1) + 4);
  const ini = Math.max(1, 7 * (k - 1) - 2);
  return k === 53 ? [362, 365] : [ini, fim];
}
// sexta da semana k, dia em que o pacote k entra (às 12h)
export const entradaDoPacote = (k) => (k === 53 ? somarDias(INICIO, 365) : somarDias(INICIO, 7 * (k - 1) + 4));
// pacote ativo numa data e hora ('HHhMM'); null antes do primeiro
export function pacoteNaData(iso, hora = '12h00') {
  let ativo = null;
  for (let k = 1; k <= PACOTES_MACETE; k++) {
    const e = entradaDoPacote(k);
    if (e < iso || (e === iso && hora >= '12h00')) ativo = k;
  }
  return ativo;
}
// data do próximo Remix de domingo que revisa o dia n (remix_de), ou null
export function remixQueRevisa(n, dias) {
  const r = dias.filter((x) => (x.remix_de || []).includes(n) && (x.dia ?? x.n) > n).sort((a, b) => (a.dia ?? a.n) - (b.dia ?? b.n))[0];
  return r ? { dia: r.dia ?? r.n, data: r.data } : null;
}
export function macetesDoPacote(k, dias, semMarca) {
  const [ini, fim] = diasDoPacote(k);
  const linhas = [];
  for (let n = ini; n <= fim; n++) {
    const d = dias.find((x) => (x.dia ?? x.n) === n);
    if (!d) continue;
    const frase = semMarca(d.explicacao?.macete?.frase || d.explicacao?.macete || '');
    const volta = remixQueRevisa(n, dias);
    if (frase) linhas.push(`${SEM[d.dia_semana]} (dia ${num3(n)}): ${frase}${volta ? ` (volta no Remix de ${curta(volta.data)})` : ''}`);
  }
  return linhas.join('\n');
}

// Texto da palavra MACETE de uma semana (dias 7k-6 a 7k): um macete por dia.
export function macetesDaSemana(semana, dias, semMarca) {
  const ini = 7 * (semana - 1) + 1;
  const linhas = [];
  for (let n = ini; n < ini + 7 && n <= 365; n++) {
    const d = dias.find((x) => (x.dia ?? x.n) === n);
    if (!d) continue;
    const frase = semMarca(d.explicacao?.macete?.frase || d.explicacao?.macete || '');
    if (frase) linhas.push(`${SEM[d.dia_semana]} (dia ${num3(n)}): ${frase}`);
  }
  return linhas.join('\n');
}
