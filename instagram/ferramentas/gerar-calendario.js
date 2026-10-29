#!/usr/bin/env node
// Gera instagram/calendario.json a partir de dados-calendario.js.
// Uso: node instagram/ferramentas/gerar-calendario.js
'use strict';
const fs = require('fs');
const path = require('path');
const D = require('./dados-calendario.js');

const INICIO = '2026-11-02';
const TOTAL = 365;
const SAIDA = path.join(__dirname, '..', 'calendario.json');

// ---------- tabelas ----------
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const QUADROS = {
  1: 'Bicho de Segunda',
  2: 'Plantão de Terça',
  3: 'Quarta do Porquê',
  4: 'Rodízio de Quinta',
  5: 'Sextou na Farmácia',
  6: 'Sábado Sem Viés',
  0: 'Remix de Domingo',
};
const STEP_NOME = { 1: 'Step 1', 2: 'Step 2 CK' };
const TIPOS = { me: 'mecanismo', dx: 'diagnóstico', pp: 'próximo passo', fa: 'farmaco', et: 'ética', bi: 'bioestatística', im: 'imagem mental' };
const PERSONAGENS = { X: 'Macrô', M: 'Mito', N: 'Seu Néfron', P: 'Capitã Plaqueta', T: 'Tia Meia-Vida', V: 'Viés' };
const SIS1 = {
  HD: 'Desenvolvimento humano',
  SI: 'Sangue e sistemas linforreticular e imune',
  CN: 'Saúde comportamental, sistema nervoso e órgãos dos sentidos',
  ME: 'Sistema musculoesquelético, pele e tecido subcutâneo',
  CV: 'Sistema cardiovascular',
  RR: 'Sistemas respiratório e renal/urinário',
  GI: 'Sistema gastrointestinal',
  RE: 'Sistemas reprodutor e endócrino',
  MU: 'Processos e doenças multissistêmicos',
  BE: 'Bioestatística, epidemiologia e saúde populacional',
  CS: 'Ciências sociais: comunicação e habilidades interpessoais',
};
const SIS2 = {
  ET: 'Ciências sociais: ética, aspectos legais, profissionalismo, prática baseada em sistemas e segurança do paciente',
  BS: 'Bioestatística, epidemiologia, saúde populacional e interpretação da literatura médica',
  RU: 'Sistemas renal/urinário e reprodutor (masculino, feminino e mama)',
  CV: 'Sistema cardiovascular',
  MP: 'Sistema musculoesquelético, pele e tecido subcutâneo',
  CO: 'Saúde comportamental',
  SG: 'Sangue e sistemas linforreticular e imune',
  GI: 'Sistema gastrointestinal',
  NS: 'Sistema nervoso e órgãos dos sentidos',
  RP: 'Sistema respiratório',
  MS: 'Processos e doenças multissistêmicos',
  EN: 'Sistema endócrino',
  PG: 'Gestação, parto e puerpério',
  DH: 'Desenvolvimento humano (achados normais por idade e cuidado do paciente saudável)',
};
const DISC = {
  Pat: 'Patologia', Fis: 'Fisiologia', Ana: 'Anatomia macroscópica e embriologia', Mic: 'Microbiologia',
  Far: 'Farmacologia', Com: 'Ciências do comportamento', Bio: 'Bioquímica e nutrição', His: 'Histologia e biologia celular',
  Imu: 'Imunologia', Gen: 'Genética',
  Med: 'Clínica médica (Medicine)', Ped: 'Pediatria (Pediatrics)', GO: 'Ginecologia e obstetrícia (Obstetrics & Gynecology)',
  Psi: 'Psiquiatria (Psychiatry)', Cir: 'Cirurgia (Surgery)',
};

// ---------- utilidades ----------
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();

function parse(str, step, origem) {
  const [sis, discs, tipo, pers, topico, conceito, chave] = str.split('|');
  const tabela = step === 1 ? SIS1 : SIS2;
  if (!tabela[sis]) throw new Error(`Sistema ${sis} inválido para Step ${step}: ${chave}`);
  if (!TIPOS[tipo]) throw new Error(`Tipo ${tipo} inválido: ${chave}`);
  if (pers && !PERSONAGENS[pers]) throw new Error(`Personagem ${pers} inválido: ${chave}`);
  const ds = discs.split(',');
  ds.forEach((x) => { if (!DISC[x]) throw new Error(`Disciplina ${x} inválida: ${chave}`); });
  if (!chave) throw new Error(`Item sem chave: ${str}`);
  return { sis, ds, tipo, pers, topico, conceito, chave, step, origem };
}

// Espalha os itens de cada grupo ao longo da fila (intercalação), preservando a ordem interna de cada grupo.
function intercalar(itens, grupoDe) {
  const grupos = {};
  itens.forEach((it) => { (grupos[grupoDe(it)] = grupos[grupoDe(it)] || []).push(it); });
  const nomes = Object.keys(grupos);
  const comPos = [];
  nomes.forEach((g, gi) => {
    const lista = grupos[g];
    lista.forEach((it, i) => comPos.push({ it, pos: (i + 0.5) / lista.length + gi * 1e-4 }));
  });
  return comPos.sort((a, b) => a.pos - b.pos).map((x) => x.it);
}

// Distribui r ocorrências de "true" em m posições de forma uniforme.
const distribuir = (r, m) => Array.from({ length: m }, (_, j) => Math.floor(((j + 1) * r) / m) > Math.floor((j * r) / m));

// ---------- datas ----------
const datas = Array.from({ length: TOTAL }, (_, i) => addDias(INICIO, i));

// Passo 1: Step de cada dia
const ALVO = { 5: 31, 6: 22, 0: 39 }; // quantos dias do Step 1 em sexta, sábado e domingo
const stepDia = {};
datas.forEach((iso) => {
  const w = diaSemana(iso);
  if (w === 1 || w === 3) stepDia[iso] = 1;
  if (w === 2 || w === 4) stepDia[iso] = 2;
});
[5, 6, 0].forEach((w) => {
  const doDia = datas.filter((iso) => diaSemana(iso) === w);
  const fixos = doDia.filter((iso) => D.especiais[iso]);
  fixos.forEach((iso) => { stepDia[iso] = D.especiais[iso].step; });
  const livres = doDia.filter((iso) => !D.especiais[iso]);
  const r1 = ALVO[w] - fixos.filter((iso) => D.especiais[iso].step === 1).length;
  const marca = distribuir(r1, livres.length);
  livres.forEach((iso, j) => { stepDia[iso] = marca[j] ? 1 : 2; });
});

// Passo 2: filas de conteúdo regular por quadro e Step
const filas = {
  '1-1': intercalar(D.segunda.map((s) => parse(s, 1, 'segunda')), (it) => it.sis),
  '3-1': intercalar(D.quarta.map((s) => parse(s, 1, 'quarta')), (it) => it.sis),
  '5-1': intercalar(D.sextaS1.map((s) => parse(s, 1, 'sexta')), (it) => it.sis),
  '6-1': intercalar(D.sabadoS1.map((s) => parse(s, 1, 'sabado')), (it) => it.sis),
  '2-2': intercalar(D.terca.map((s) => parse(s, 2, 'terca')), (it) => it.sis),
  '4-2': intercalar(D.quinta.map((s) => parse(s, 2, 'quinta')), (it) => it.ds[0]),
  '5-2': intercalar(D.sextaS2.map((s) => parse(s, 2, 'sexta')), (it) => it.sis),
  '6-2': intercalar(D.sabadoS2.map((s) => parse(s, 2, 'sabado')), (it) => it.sis),
};
// Ajuste fino: evita o mesmo sistema em dois dias seguidos do mesmo Step, trocando com o próximo item da fila.
function puxar(fila, ultimoSis) {
  if (!fila.length) return null;
  let idx = fila.findIndex((it, i) => i < 4 && it.sis !== ultimoSis);
  if (idx < 0) idx = 0;
  return fila.splice(idx, 1)[0];
}

// Passo 3: monta os dias de conteúdo
const dias = [];
const porChave = {};
const ultimoSisStep = { 1: null, 2: null };
datas.forEach((iso, i) => {
  const w = diaSemana(iso);
  const step = stepDia[iso];
  const esp = D.especiais[iso];
  const base = { dia: i + 1, data: iso, dia_semana: DIAS_SEMANA[w], quadro: QUADROS[w], step: STEP_NOME[step] };
  if (w === 0) { dias.push({ ...base, _remix: true, _step: step, _esp: esp }); return; }
  let it;
  if (esp && esp.item) it = parse(esp.item, step, 'especial');
  else {
    const fila = filas[`${w}-${step}`];
    if (!fila) throw new Error(`Sem fila para ${w}-${step}`);
    it = puxar(fila, ultimoSisStep[step]);
    if (!it) throw new Error(`Fila ${w}-${step} acabou em ${iso}`);
  }
  if (porChave[it.chave]) throw new Error(`Chave repetida: ${it.chave}`);
  ultimoSisStep[step] = it.sis;
  const tabela = step === 1 ? SIS1 : SIS2;
  const reg = {
    ...base,
    sistema: tabela[it.sis],
    disciplina_ou_area: DISC[it.ds[0]],
    disciplinas_secundarias: it.ds.slice(1).map((x) => DISC[x]),
    topico: it.topico,
    conceito: it.conceito,
    tipo_pergunta: TIPOS[it.tipo],
    personagem: it.pers ? PERSONAGENS[it.pers] : null,
    gancho_data: (esp && esp.gancho) || D.ganchosExtras[iso] || null,
    remix_de: null,
    explicacao_em: addDias(iso, 1),
    chave: it.chave,
    _sis: it.sis,
  };
  porChave[it.chave] = reg;
  dias.push(reg);
});
Object.entries(filas).forEach(([k, f]) => { if (f.length) throw new Error(`Fila ${k} sobrou ${f.length} itens: ${f.map((x) => x.chave).join(', ')}`); });

// Passo 4: remix de domingo com intervalos crescentes
// Cada conceito passa por até três revisões: janela A (1 a 6 dias depois), B (14 a 35 dias) e C (50 a 130 dias).
const estagio = {}; // chave -> número de remixes já recebidos
const historico = {}; // chave -> { ultimo, intervalo }
const JANELAS = [[1, 6], [14, 35], [50, 130]];
const rotulo = (c) => c.split(':')[0].trim();
dias.forEach((d) => {
  if (!d._remix) return;
  const step = d._step;
  const N = d.dia;
  const conteudo = dias.filter((x) => !x._remix && !String(x.chave).startsWith('remix-') && x.dia < N && x.step === STEP_NOME[step]);
  let escolhidos = [];
  if (d._esp && d._esp.remix) {
    escolhidos = d._esp.remix.map((k) => {
      const r = porChave[k];
      if (!r) throw new Error(`Remix ${d.data}: chave ${k} inexistente`);
      if (r.dia >= N) throw new Error(`Remix ${d.data}: chave ${k} só aparece no dia ${r.dia}`);
      if (r.step !== d.step) throw new Error(`Remix ${d.data}: chave ${k} é de outro Step`);
      return r;
    });
  } else {
    JANELAS.forEach(([a, b], s) => {
      const cand = conteudo.filter((x) => N - x.dia >= a && N - x.dia <= b && !escolhidos.includes(x));
      if (!cand.length) return;
      const pontua = (x) => {
        const e = estagio[x.chave] || 0;
        const h = historico[x.chave];
        if (h && N - h.ultimo < h.intervalo) return 1000; // o próximo intervalo precisa ser maior que o anterior
        let p = e === s ? 0 : e < s ? 10 * (s - e) : 100; // prefere quem está no estágio certo
        if (escolhidos.some((y) => y._sis === x._sis)) p += 5; // prefere sistemas diferentes no mesmo remix
        return p;
      };
      cand.sort((x, y) => pontua(x) - pontua(y) || x.dia - y.dia);
      if (pontua(cand[0]) < 1000) escolhidos.push(cand[0]);
    });
    // começo do calendário: completa com o que já existe
    const resto = conteudo.filter((x) => !escolhidos.includes(x)).sort((x, y) => y.dia - x.dia);
    while (escolhidos.length < 3 && resto.length) escolhidos.push(resto.shift());
  }
  escolhidos.sort((x, y) => x.dia - y.dia);
  escolhidos.forEach((x) => {
    estagio[x.chave] = (estagio[x.chave] || 0) + 1;
    const ant = historico[x.chave] ? historico[x.chave].ultimo : x.dia;
    historico[x.chave] = { ultimo: N, intervalo: N - ant };
  });
  const tema = d._esp && d._esp.tema;
  const temaEn = d._esp && d._esp.tema_en;
  const tabela = step === 1 ? SIS1 : SIS2;
  Object.assign(d, {
    sistema: 'Revisão cumulativa (remix)',
    disciplina_ou_area: 'Integração de conceitos já vistos',
    disciplinas_secundarias: [],
    sistemas_revisados: [...new Set(escolhidos.map((x) => tabela[x._sis]))],
    topico: `${tema ? tema + ': ' : 'Remix de domingo: '}${escolhidos.map((x) => `${x.topico} (dia ${x.dia})`).join(', ')}`,
    conceito: `${temaEn ? temaEn + ' remix' : 'Remix'}: ${escolhidos.map((x) => rotulo(x.conceito)).join(' + ')}`,
    tipo_pergunta: step === 1 ? 'imagem mental' : 'próximo passo',
    personagem: d._esp && d._esp.personagem ? PERSONAGENS[d._esp.personagem] : (D.personagensRemix || {})[d.data] ? PERSONAGENS[D.personagensRemix[d.data]] : null,
    gancho_data: (d._esp && d._esp.gancho) || D.ganchosExtras[d.data] || null,
    remix_de: escolhidos.map((x) => x.dia),
    explicacao_em: addDias(d.data, 1),
    chave: `remix-${d.data}`,
  });
  delete d._remix; delete d._step; delete d._esp;
});
dias.forEach((d) => { delete d._sis; });

// ---------- metadados ----------
const out = {
  programa: 'Road to America: Questão do Dia no Instagram',
  versao: 1,
  gerado_em: new Date().toISOString().slice(0, 10),
  periodo: { inicio: datas[0], fim: datas[TOTAL - 1], dias: TOTAL, ultima_explicacao: addDias(datas[TOTAL - 1], 1) },
  regras: {
    rotina: 'Questão no dia D; explicação no dia D+1, publicada junto com a nova questão.',
    formato_questao: 'Em inglês, vinheta de até 60 palavras, 4 alternativas (A a D) para caber no adesivo de quiz dos stories.',
    idioma_legenda: 'Português, com os termos-chave em inglês.',
    fonte: 'Conceitos escritos do zero a partir do outline oficial. Nenhum item do banco privado é copiado ou adaptado.',
  },
  quadros: {
    'segunda-feira': { nome: QUADROS[1], step: 'Step 1', foco: 'Microbiologia e imunologia' },
    'terça-feira': { nome: QUADROS[2], step: 'Step 2 CK', foco: 'Clínica médica: diagnóstico e próximo passo' },
    'quarta-feira': { nome: QUADROS[3], step: 'Step 1', foco: 'Mecanismos: patologia, fisiologia, anatomia, bioquímica, genética e histologia' },
    'quinta-feira': { nome: QUADROS[4], step: 'Step 2 CK', foco: 'Pediatria, ginecologia e obstetrícia, psiquiatria e cirurgia em rodízio' },
    'sexta-feira': { nome: QUADROS[5], step: 'Step 1 (31 sextas) e Step 2 CK (21 sextas)', foco: 'Farmacologia (Step 1) e farmacoterapia (Step 2 CK)' },
    'sábado': { nome: QUADROS[6], step: 'Step 1 (22 sábados) e Step 2 CK (30 sábados)', foco: 'Ética, comunicação, segurança do paciente e bioestatística' },
    domingo: { nome: QUADROS[0], step: 'Step 1 (39 domingos) e Step 2 CK (13 domingos)', foco: 'Revisão cumulativa com conceitos já vistos, nos intervalos de 1 semana, 2 a 5 semanas e 2 a 4 meses' },
  },
  personagens: Object.values(PERSONAGENS),
  dias,
};
fs.writeFileSync(SAIDA, JSON.stringify(out, null, 1) + '\n');
console.log(`OK: ${dias.length} dias gravados em ${SAIDA}`);
