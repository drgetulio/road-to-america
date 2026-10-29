// Conferência contra o banco privado de 1000 questões (produto pago).
// Nenhum texto do banco é lido para a tela: só sequências de 8 palavras
// normalizadas (minúsculas, sem acento, números trocados por #), para avisar
// se a vinheta, a pergunta ou a explicação do Instagram repetem um trecho
// de um item específico do banco.
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './dados.mjs';

const N = 8;
// Sequência que aparece em 3 ou mais itens diferentes do banco é linguagem padrão
// de vinheta ("year old man comes to the emergency department"), não cópia.
const FORMULA = 3;
let _indice = null;

function normalizar(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%./ ]+/g, ' ')
    .replace(/\d+([.,/]\d+)*/g, '#')
    .split(/\s+/)
    .filter(Boolean);
}

function sequencias(t) {
  const p = normalizar(t);
  const out = [];
  for (let i = 0; i + N <= p.length; i++) out.push(p.slice(i, i + N).join(' '));
  return out;
}

function indice() {
  if (_indice) return _indice;
  _indice = new Map();
  for (const sub of ['step1', 'step2ck']) {
    const dir = path.join(RAIZ, 'banco-privado', sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      let itens;
      try {
        itens = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch {
        continue;
      }
      if (!Array.isArray(itens)) continue;
      for (const it of itens) {
        const textos = [it.vinheta, it.pergunta, it.explicacao, it.explicacao_pt, it.objetivo_educacional,
          ...Object.values(it.explicacoes_alternativas || {})];
        const id = it.id || f;
        for (const t of textos) {
          for (const s of sequencias(t)) {
            const ids = _indice.get(s);
            if (!ids) _indice.set(s, new Set([id]));
            else if (ids.size < FORMULA) ids.add(id);
          }
        }
      }
    }
  }
  return _indice;
}

export function bancoDisponivel() {
  return indice().size > 0;
}

// Devolve a lista de trechos repetidos (só os ids do banco, nunca o texto dele).
export function conferirBanco(dia) {
  const idx = indice();
  if (!idx.size) return [];
  const campos = {
    vinheta: dia.questao.vinheta,
    pergunta: dia.questao.pergunta,
    'explicação': dia.explicacao.certa.join(' '),
    erradas: Object.values(dia.explicacao.erradas).join(' '),
    macete: [dia.explicacao.macete.frase, dia.explicacao.macete.apoio].join(' '),
  };
  const achados = [];
  for (const [campo, texto] of Object.entries(campos)) {
    const ids = new Set();
    const trechos = [];
    for (const s of sequencias(texto)) {
      const doBanco = idx.get(s);
      if (!doBanco || doBanco.size >= FORMULA) continue;
      for (const id of doBanco) ids.add(id);
      // o trecho mostrado é o do JSON do Instagram (o banco nunca é impresso)
      if (!trechos.some((t) => t.split(' ').slice(1).join(' ') === s.split(' ').slice(0, -1).join(' '))) trechos.push(s);
    }
    if (ids.size) {
      achados.push(`${campo} repete ${N} ou mais palavras seguidas do banco privado (itens ${[...ids].slice(0, 5).join(', ')}). Reescreva: "${trechos.slice(0, 3).join('" / "')}"`);
    }
  }
  return achados;
}
