// Carrega o JSON de um dia, junta com o calendário e confere as regras do programa.
import fs from 'node:fs';
import path from 'node:path';

export const PASTA_TEMPLATES = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const PASTA_INSTAGRAM = path.resolve(PASTA_TEMPLATES, '..');
export const RAIZ = path.resolve(PASTA_INSTAGRAM, '..');

export const LETRAS = ['A', 'B', 'C', 'D'];
const EXT_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

export const num3 = (n) => String(n).padStart(3, '0');

let _calendario = null;
export function calendario() {
  if (!_calendario) {
    const arq = path.join(PASTA_INSTAGRAM, 'calendario.json');
    _calendario = JSON.parse(fs.readFileSync(arq, 'utf8'));
  }
  return _calendario;
}

export function diaDoCalendario(n) {
  return calendario().dias.find((d) => d.dia === n) || null;
}

export function carregarConfig() {
  return JSON.parse(fs.readFileSync(path.join(PASTA_TEMPLATES, 'config.json'), 'utf8'));
}

export function arquivoDoDia(pastaFonte, n) {
  return path.join(pastaFonte, `dia-${num3(n)}.json`);
}

// Procura a imagem: caminho do JSON (relativo à pasta do JSON, à pasta de imagens
// ou absoluto) e, sem caminho, o nome padrão dia-NNN[-sufixo].ext.
function acharImagem(campo, n, sufixo, pastaFonte, pastaImagens) {
  const candidatos = [];
  const arquivo = campo && campo.arquivo;
  if (arquivo) {
    if (path.isAbsolute(arquivo)) candidatos.push(arquivo);
    else {
      candidatos.push(path.join(pastaFonte, arquivo));
      candidatos.push(path.join(pastaImagens, arquivo));
      candidatos.push(path.join(RAIZ, arquivo));
    }
  } else {
    const base = `dia-${num3(n)}${sufixo}`;
    for (const pasta of [pastaImagens, path.join(pastaFonte, 'imagens')]) {
      for (const ext of EXT_IMAGEM) candidatos.push(path.join(pasta, base + ext));
    }
  }
  const achado = candidatos.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  const esperado = arquivo || `dia-${num3(n)}${sufixo}.png`;
  return {
    caminho: achado || null,
    esperado: path.relative(RAIZ, arquivo && path.isAbsolute(arquivo) ? arquivo : path.join(pastaImagens, path.basename(esperado))),
    cena: (campo && campo.cena) || null,
    foco: (campo && campo.foco) || '50% 40%',
    alt: (campo && campo.alt) || null,
  };
}

function normalizarAlternativas(bruto) {
  if (!bruto) return [];
  const lista = Array.isArray(bruto)
    ? bruto.map((a, i) => (typeof a === 'string' ? { letra: LETRAS[i], texto: a } : { letra: a.letra || LETRAS[i], ...a }))
    : Object.entries(bruto).map(([letra, v]) => (typeof v === 'string' ? { letra, texto: v } : { letra, ...v }));
  return lista.map((a) => ({
    letra: String(a.letra).toUpperCase(),
    texto: a.texto,
    quiz: a.quiz || null,
    dia: a.dia ?? a.visto_no_dia ?? null,
  }));
}

// Datas em que o humor sai e entra o acolhimento (PROGRAMA.md, seção 6): Finados,
// AIDS, Janeiro Branco, Câncer, Síndrome de Down (semana e dia), Autismo, Setembro
// Amarelo, Alzheimer, Saúde Mental e o início do Outubro Rosa e do Novembro Azul.
const DATAS_ACOLHEDORAS = ['11-02', '12-01', '01-14', '02-04', '03-17', '03-21', '04-02', '09-10', '09-21', '10-10', '10-01', '11-01'];
function tomDoDia(json, cal, data) {
  if (json.tom) return json.tom;
  const g = (cal && cal.gancho_data) || '';
  if (/sem humor|sem piada|acolhedor|respeitoso|CVV/i.test(g)) return 'acolhedor';
  return data && DATAS_ACOLHEDORAS.includes(data.slice(5)) ? 'acolhedor' : 'normal';
}

export const DIAS_CURTOS = { 'segunda-feira': 'SEG', 'terça-feira': 'TER', 'quarta-feira': 'QUA', 'quinta-feira': 'QUI', 'sexta-feira': 'SEX', 'sábado': 'SÁB', domingo: 'DOM' };

export function dataCurta(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
export function dataLonga(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
export function diaSemanaDe(iso) {
  const nomes = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const [a, m, d] = iso.split('-').map(Number);
  return nomes[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

// Junta o JSON do dia com o calendário. O JSON pode sobrescrever qualquer campo.
export { tomDoDia };
export function montarDia(n, pastaFonte, pastaImagens) {
  const arq = arquivoDoDia(pastaFonte, n);
  if (!fs.existsSync(arq)) return null;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch (e) {
    throw new Error(`${path.relative(RAIZ, arq)}: JSON inválido (${e.message})`);
  }
  const cal = diaDoCalendario(n) || {};
  const q = json.questao || {};
  const ex = json.explicacao || {};
  const data = json.data || cal.data;
  const dia = {
    n,
    dia_no_json: json.dia ?? null,
    arquivo: arq,
    exemplo: !!json.exemplo,
    data,
    dia_semana: json.dia_semana || cal.dia_semana || (data ? diaSemanaDe(data) : ''),
    dia_curto: DIAS_CURTOS[json.dia_semana || cal.dia_semana] || '',
    explicacao_em: json.explicacao_em || cal.explicacao_em,
    quadro: json.quadro || cal.quadro || '',
    step: json.step || cal.step || '',
    sistema: json.sistema || cal.sistema || '',
    area: json.area || cal.disciplina_ou_area || '',
    topico: json.topico || cal.topico || '',
    conceito: json.conceito || cal.conceito || '',
    personagem: json.personagem !== undefined ? json.personagem : cal.personagem || null,
    gancho_data: json.gancho_data !== undefined ? json.gancho_data : cal.gancho_data || null,
    remix_de: json.remix_de || cal.remix_de || null,
    tom: tomDoDia(json, cal, data),
    cvv: /CVV/i.test((cal && cal.gancho_data) || '') || !!json.cvv,
    gancho: json.gancho || '',
    gancho_apoio: json.gancho_apoio || null,
    imagem: acharImagem(json.imagem, n, '', path.dirname(arq), pastaImagens),
    imagem_macete: json.imagem_macete ? acharImagem(json.imagem_macete, n, '-macete', path.dirname(arq), pastaImagens) : null,
    questao: {
      vinheta: q.vinheta || '',
      pergunta: q.pergunta || '',
      alternativas: normalizarAlternativas(q.alternativas),
      correta: String(q.correta || '').toUpperCase(),
    },
    explicacao: {
      titulo: ex.titulo || '',
      certa: Array.isArray(ex.certa) ? ex.certa : ex.certa ? [ex.certa] : [],
      termos: ex.termos || [],
      erradas: ex.erradas || {},
      macete: ex.macete || {},
    },
    legenda: json.legenda || {},
    quiz: json.quiz || {},
    reel: json.reel || null,
    cta: json.cta || null,
  };
  // Sem imagem própria, o macete reaproveita a imagem da questão se o JSON pedir.
  return dia;
}

// ---------- conferências ----------
const TRAVESSOES = /[\u2014\u2013]/;
const JARGAO = [
  'vale ressaltar', 'é importante ressaltar', 'é importante destacar', 'mergulhar', 'mergulhe', 'desvendar', 'desvende',
  'no mundo de', 'no universo de', 'jornada de aprendizado', 'potencializar', 'alavancar', 'em suma', 'além disso,',
  'não é apenas', 'mais do que nunca', 'sem dúvida', 'crucial', 'fundamental para', 'robusto',
];
const PROMESSAS = ['aprovação garantida', 'garanta sua aprovação', 'passe no step', 'garantia de aprovação', 'você vai passar', 'o melhor curso', 'nota garantida', 'match garantido'];

export function contarPalavras(t) {
  return (t || '').trim().split(/\s+/).filter(Boolean).length;
}

function textosDoDia(dia) {
  const pt = [dia.gancho, dia.gancho_apoio, dia.explicacao.titulo, ...dia.explicacao.certa, ...Object.values(dia.explicacao.erradas),
    dia.explicacao.macete.frase, dia.explicacao.macete.apoio, dia.legenda.contexto, dia.legenda.cta_texto,
    dia.reel && dia.reel.titulo].filter(Boolean);
  const en = [dia.questao.vinheta, dia.questao.pergunta, ...dia.questao.alternativas.map((a) => a.texto)].filter(Boolean);
  return { pt, en };
}

export function conferir(dia, config) {
  const erros = [];
  const avisos = [];
  const lim = config.limites;
  const q = dia.questao;
  const rot = `dia ${num3(dia.n)}`;

  if (dia.dia_no_json != null && dia.dia_no_json !== dia.n) erros.push(`${rot}: o arquivo é dia-${num3(dia.n)}.json, mas o campo "dia" diz ${dia.dia_no_json}`);
  if (!dia.gancho) erros.push(`${rot}: falta "gancho" (frase da capa, em português)`);
  if (!q.vinheta) erros.push(`${rot}: falta questao.vinheta`);
  if (!q.pergunta) erros.push(`${rot}: falta questao.pergunta (lead-in em inglês)`);
  const palavras = contarPalavras(q.vinheta) + contarPalavras(q.pergunta);
  if (palavras > lim.palavras_vinheta) erros.push(`${rot}: vinheta + pergunta com ${palavras} palavras (máximo ${lim.palavras_vinheta})`);
  if (q.alternativas.length !== 4) erros.push(`${rot}: são ${q.alternativas.length} alternativas; o quiz dos stories aceita exatamente 4 (A a D)`);
  const letras = q.alternativas.map((a) => a.letra).join('');
  if (q.alternativas.length === 4 && letras !== 'ABCD') erros.push(`${rot}: alternativas fora da ordem A, B, C, D (${letras})`);
  if (!LETRAS.includes(q.correta)) erros.push(`${rot}: questao.correta precisa ser A, B, C ou D`);
  for (const a of q.alternativas) {
    const curto = a.quiz || a.texto || '';
    if (curto.length > lim.caracteres_quiz) {
      (a.quiz ? erros : avisos).push(`${rot}: alternativa ${a.letra} com ${curto.length} caracteres para o quiz (máximo ${lim.caracteres_quiz}); ${a.quiz ? 'encurte "quiz"' : 'preencha "quiz" com a versão curta'}`);
    }
  }
  if (!dia.explicacao.certa.length) erros.push(`${rot}: falta explicacao.certa (por que a certa está certa)`);
  for (const a of q.alternativas) {
    if (a.letra !== q.correta && !dia.explicacao.erradas[a.letra]) erros.push(`${rot}: falta explicacao.erradas.${a.letra}`);
  }
  if (!dia.explicacao.macete.frase) avisos.push(`${rot}: sem explicacao.macete.frase; o slide do macete fica só com o conceito`);
  if (dia.remix_de) {
    const dias = q.alternativas.map((a) => a.dia).filter((x) => x != null);
    const faltam = dia.remix_de.filter((d) => !dias.includes(d));
    if (faltam.length) avisos.push(`${rot}: remix sem a marca "dia" nas alternativas dos dias ${faltam.join(', ')}`);
  }
  if (dia.cvv) {
    const temCVV = /188/.test(JSON.stringify(dia.legenda));
    if (!temCVV) avisos.push(`${rot}: data com CVV; a legenda recebe a linha do CVV 188 automaticamente`);
  }
  if (!dia.imagem.caminho) avisos.push(`${rot}: imagem pendente (${dia.imagem.esperado})`);
  if (dia.imagem_macete && !dia.imagem_macete.caminho) avisos.push(`${rot}: imagem do macete pendente (${dia.imagem_macete.esperado})`);

  const { pt, en } = textosDoDia(dia);
  for (const t of [...pt, ...en]) {
    if (TRAVESSOES.test(t)) erros.push(`${rot}: travessão ou meia-risca em "${t.slice(0, 60)}"`);
  }
  for (const t of pt) {
    const baixo = t.toLowerCase();
    for (const j of JARGAO) if (baixo.includes(j)) avisos.push(`${rot}: jargão "${j}" em "${t.slice(0, 50)}"`);
    for (const p of PROMESSAS) if (baixo.includes(p)) erros.push(`${rot}: promessa proibida (CFM 2.336/2023): "${p}"`);
  }
  if (/\[número\]/.test(config.assinatura.crm)) avisos.push(`config.json: CRM ainda é "${config.assinatura.crm}"; preencha antes de postar`);
  if (dia.exemplo) avisos.push(`${rot}: JSON marcado como exemplo; os PNG saem com a tarja "EXEMPLO, NÃO POSTAR"`);
  return { erros, avisos };
}
