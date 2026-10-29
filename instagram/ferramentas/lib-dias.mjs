// Leitura dos 365 dias escritos em instagram/dias/dias-XXX-YYY.json e
// exportação para o formato do render (instagram/questoes/dia-NNN.json).
import fs from 'node:fs';
import path from 'node:path';

export const PASTA_INSTAGRAM = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const RAIZ = path.resolve(PASTA_INSTAGRAM, '..');
export const PASTA_DIAS = path.join(PASTA_INSTAGRAM, 'dias');
export const num3 = (n) => String(n).padStart(3, '0');
export const semMarca = (t) => String(t ?? '').replace(/\*([^*\n]+)\*/g, '$1');

export function blocos() {
  return fs
    .readdirSync(PASTA_DIAS)
    .filter((f) => /^dias-\d{3}-\d{3}\.json$/.test(f))
    .sort()
    .map((f) => {
      const [, ini, fim] = /^dias-(\d{3})-(\d{3})\.json$/.exec(f).map(Number);
      return { arquivo: path.join(PASTA_DIAS, f), nome: f, ini, fim, dias: JSON.parse(fs.readFileSync(path.join(PASTA_DIAS, f), 'utf8')) };
    });
}

export function todosOsDias() {
  const out = [];
  for (const b of blocos()) for (const d of b.dias) out.push({ ...d, _bloco: b.nome });
  return out.sort((a, b) => a.dia - b.dia);
}

// Mantém a indentação original de cada bloco (cada redator usou a sua).
export function salvarBloco(b) {
  const atual = fs.readFileSync(b.arquivo, 'utf8');
  const m = /^\[\s*\n( +)\{/.exec(atual);
  const indent = m ? m[1].length : 1;
  const final = atual.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(b.arquivo, JSON.stringify(b.dias, null, indent) + final);
}

export function calendario() {
  return JSON.parse(fs.readFileSync(path.join(PASTA_INSTAGRAM, 'calendario.json'), 'utf8'));
}

// Campos que o render lê (templates/README.md, "Campos do JSON").
const CAMPOS_RENDER = ['dia', 'data', 'dia_semana', 'quadro', 'step', 'sistema', 'topico', 'conceito', 'personagem', 'anfitriao', 'gancho_data',
  'remix_de', 'explicacao_em', 'tom', 'cvv', 'gancho', 'gancho_apoio', 'imagem', 'imagem_macete', 'questao', 'explicacao', 'legenda',
  'quiz', 'cta', 'cta_forcado', 'reel', 'exemplo'];

export function paraRender(d) {
  const o = {};
  for (const k of CAMPOS_RENDER) if (d[k] !== undefined) o[k] = d[k];
  o.exemplo = false;
  return o;
}

export function exportarQuestoes(dias, pasta = path.join(PASTA_INSTAGRAM, 'questoes')) {
  fs.mkdirSync(pasta, { recursive: true });
  for (const d of dias) fs.writeFileSync(path.join(pasta, `dia-${num3(d.dia)}.json`), JSON.stringify(paraRender(d), null, 2) + '\n');
  return pasta;
}
