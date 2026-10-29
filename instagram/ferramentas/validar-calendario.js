#!/usr/bin/env node
// Valida instagram/calendario.json e instagram/PROGRAMA.md.
// Uso: node instagram/ferramentas/validar-calendario.js
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const CAL = path.join(RAIZ, 'instagram', 'calendario.json');
const PROG = path.join(RAIZ, 'instagram', 'PROGRAMA.md');
const OUTLINE = path.join(RAIZ, 'banco-privado', 'referencia-outline.json');

const erros = [];
const avisos = [];
const ok = (cond, msg) => { if (!cond) erros.push(msg); };
const pct = (n, d) => (100 * n / d).toFixed(1) + '%';

const cal = JSON.parse(fs.readFileSync(CAL, 'utf8'));
const dias = cal.dias;

// ---------- 1. datas ----------
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wd = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
const NOMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const QUADRO = ['Remix de Domingo', 'Bicho de Segunda', 'Plantão de Terça', 'Quarta do Porquê', 'Rodízio de Quinta', 'Sextou na Farmácia', 'Sábado Sem Viés'];
ok(dias.length === 365, `Esperados 365 dias, há ${dias.length}`);
ok(dias[0].data === '2026-11-02' && wd('2026-11-02') === 1, 'O calendário deve começar na segunda-feira 2026-11-02');
ok(dias[dias.length - 1].data === '2027-11-01' && wd('2027-11-01') === 1, 'O calendário deve terminar na segunda-feira 2027-11-01');
dias.forEach((d, i) => {
  ok(d.dia === i + 1, `Dia ${i + 1} numerado como ${d.dia}`);
  ok(d.data === addDias('2026-11-02', i), `Dia ${i + 1}: data ${d.data} fora da sequência`);
  ok(d.dia_semana === NOMES[wd(d.data)], `Dia ${d.dia}: dia_semana errado (${d.dia_semana})`);
  ok(d.quadro === QUADRO[wd(d.data)], `Dia ${d.dia}: quadro errado (${d.quadro})`);
  ok(d.explicacao_em === addDias(d.data, 1), `Dia ${d.dia}: explicação não está em D+1`);
});

// ---------- 2. campos ----------
const TIPOS = ['mecanismo', 'diagnóstico', 'próximo passo', 'farmaco', 'ética', 'bioestatística', 'imagem mental'];
const PERS = new Set(cal.personagens);
ok(PERS.size >= 4 && PERS.size <= 6, `Devem existir 4 a 6 personagens, há ${PERS.size}`);
const CAMPOS = ['dia', 'data', 'dia_semana', 'quadro', 'step', 'sistema', 'disciplina_ou_area', 'topico', 'conceito', 'tipo_pergunta', 'personagem', 'gancho_data', 'remix_de'];
dias.forEach((d) => {
  CAMPOS.forEach((c) => ok(c in d, `Dia ${d.dia}: falta o campo ${c}`));
  ok(['Step 1', 'Step 2 CK'].includes(d.step), `Dia ${d.dia}: step inválido`);
  ok(TIPOS.includes(d.tipo_pergunta), `Dia ${d.dia}: tipo_pergunta inválido (${d.tipo_pergunta})`);
  ok(d.personagem === null || PERS.has(d.personagem), `Dia ${d.dia}: personagem desconhecido (${d.personagem})`);
  ok(/^[\x20-\x7E]+$/.test(d.conceito), `Dia ${d.dia}: conceito deve estar em inglês (ASCII): ${d.conceito}`);
  if (d.dia_semana === 'domingo') ok(Array.isArray(d.remix_de) && d.remix_de.length >= 2, `Dia ${d.dia}: domingo sem remix`);
  else ok(d.remix_de === null, `Dia ${d.dia}: remix fora do domingo`);
});

// ---------- 3. proporção de Steps ----------
const s1 = dias.filter((d) => d.step === 'Step 1');
const s2 = dias.filter((d) => d.step === 'Step 2 CK');
const p1 = s1.length / 365;
ok(p1 >= 0.52 && p1 <= 0.58, `Step 1 deveria ficar perto de 55%, está em ${pct(s1.length, 365)}`);
// intercalação semanal: toda semana completa tem os dois Steps
for (let i = 0; i + 7 <= 365; i += 7) {
  const sem = dias.slice(i, i + 7);
  ok(sem.some((d) => d.step === 'Step 1') && sem.some((d) => d.step === 'Step 2 CK'), `Semana que começa em ${sem[0].data} não intercala os Steps`);
}

// ---------- 4. sistemas (dias de conteúdo, sem os remixes) ----------
const outline = JSON.parse(fs.readFileSync(OUTLINE, 'utf8'));
const faixa = (s) => { const m = String(s).match(/(\d+)\s*-\s*(\d+)/); return m ? [Number(m[1]), Number(m[2])] : null; };
const FAIXA_S1 = {};
outline.step1_systems.forEach((s) => { const f = faixa(s.range_pct); if (f) FAIXA_S1[s.name_pt] = f; });
const FAIXA_S2 = {
  'Ciências sociais: ética, aspectos legais, profissionalismo, prática baseada em sistemas e segurança do paciente': [10, 15],
  'Sistemas renal/urinário e reprodutor (masculino, feminino e mama)': [7, 13],
  'Sistema cardiovascular': [6, 12],
  'Sistema musculoesquelético, pele e tecido subcutâneo': [6, 12],
  'Saúde comportamental': [5, 10],
  'Sangue e sistemas linforreticular e imune': [5, 10],
  'Sistema gastrointestinal': [5, 10],
  'Sistema nervoso e órgãos dos sentidos': [5, 10],
  'Sistema respiratório': [5, 10],
  'Processos e doenças multissistêmicos': [4, 8],
  'Sistema endócrino': [3, 7],
  'Gestação, parto e puerpério': [3, 7],
  'Bioestatística, epidemiologia, saúde populacional e interpretação da literatura médica': [3, 5],
  'Desenvolvimento humano (achados normais por idade e cuidado do paciente saudável)': [2, 4],
};
// confere com o texto do outline do Step 2 CK
['10-15%', '7-13%', '6-12%', '5-10%', '4-8%', '3-7%', '3-5%', '2-4%'].forEach((t) => ok(outline.step2ck_disciplines.includes(t), `Faixa ${t} não encontrada no outline do Step 2 CK`));
const relatorio = [];
function conferir(lista, faixas, rotulo) {
  const conteudo = lista.filter((d) => !d.remix_de);
  const cont = {};
  conteudo.forEach((d) => { cont[d.sistema] = (cont[d.sistema] || 0) + 1; });
  Object.keys(cont).forEach((s) => ok(faixas[s], `${rotulo}: sistema fora do outline: ${s}`));
  relatorio.push(`\n${rotulo}: ${conteudo.length} dias de conteúdo + ${lista.length - conteudo.length} remixes`);
  Object.entries(faixas).forEach(([s, [a, b]]) => {
    const n = cont[s] || 0;
    const v = (100 * n) / conteudo.length;
    const dentro = v >= a && v <= b;
    ok(dentro, `${rotulo}: ${s} com ${v.toFixed(1)}% (faixa ${a}-${b}%)`);
    relatorio.push(`  ${dentro ? 'ok ' : 'FORA'} ${String(n).padStart(3)}  ${v.toFixed(1).padStart(5)}%  (${a}-${b}%)  ${s}`);
  });
  return conteudo;
}
const c1 = conferir(s1, FAIXA_S1, 'Step 1 por sistema');
const c2 = conferir(s2, FAIXA_S2, 'Step 2 CK por sistema');

// ---------- 5. disciplinas (principal + secundárias, como no USMLE) ----------
const DISC_S1 = {
  'Patologia': [45, 55], 'Fisiologia': [30, 40], 'Anatomia macroscópica e embriologia': [10, 20], 'Microbiologia': [10, 20],
  'Farmacologia': [10, 20], 'Ciências do comportamento': [10, 15], 'Bioquímica e nutrição': [5, 15],
  'Histologia e biologia celular': [5, 15], 'Imunologia': [5, 15], 'Genética': [5, 10],
};
const DISC_S2 = {
  'Clínica médica (Medicine)': [55, 65], 'Pediatria (Pediatrics)': [17, 27], 'Ginecologia e obstetrícia (Obstetrics & Gynecology)': [10, 20],
  'Psiquiatria (Psychiatry)': [10, 15], 'Cirurgia (Surgery)': [5, 30],
};
function conferirDisc(conteudo, faixas, rotulo) {
  const cont = {};
  conteudo.forEach((d) => [d.disciplina_ou_area, ...(d.disciplinas_secundarias || [])].forEach((x) => { cont[x] = (cont[x] || 0) + 1; }));
  relatorio.push(`\n${rotulo} (principal + secundárias; a soma passa de 100%, como no outline)`);
  Object.entries(faixas).forEach(([s, [a, b]]) => {
    const n = cont[s] || 0;
    const v = (100 * n) / conteudo.length;
    const dentro = v >= a && v <= b;
    ok(dentro, `${rotulo}: ${s} com ${v.toFixed(1)}% (faixa ${a}-${b}%)`);
    relatorio.push(`  ${dentro ? 'ok ' : 'FORA'} ${String(n).padStart(3)}  ${v.toFixed(1).padStart(5)}%  (${a}-${b}%)  ${s}`);
  });
}
conferirDisc(c1, DISC_S1, 'Step 1 por disciplina');
conferirDisc(c2, DISC_S2, 'Step 2 CK por disciplina (Cirurgia com faixa ampla por conflito entre fontes oficiais)');

// ---------- 6. unicidade ----------
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const vistos = new Map();
dias.forEach((d) => {
  const k = norm(d.conceito);
  ok(!vistos.has(k), `Conceito repetido nos dias ${vistos.get(k)} e ${d.dia}: ${d.conceito}`);
  vistos.set(k, d.dia);
});
const rotulos = new Map();
dias.filter((d) => !d.remix_de).forEach((d) => {
  const k = norm(d.conceito.split(':')[0]);
  ok(!rotulos.has(k), `Rótulo de conceito repetido nos dias ${rotulos.get(k)} e ${d.dia}: ${d.conceito}`);
  rotulos.set(k, d.dia);
});
const chaves = new Set();
dias.forEach((d) => { ok(!chaves.has(d.chave), `Chave repetida: ${d.chave}`); chaves.add(d.chave); });

// ---------- 7. remix e espaçamento ----------
const porDia = new Map(dias.map((d) => [d.dia, d]));
const revisoes = {}; // dia original -> [dias de remix]
dias.filter((d) => d.remix_de).forEach((d) => {
  d.remix_de.forEach((r) => {
    const o = porDia.get(r);
    ok(o && r < d.dia, `Remix do dia ${d.dia} aponta para dia inválido ${r}`);
    ok(o && !o.remix_de, `Remix do dia ${d.dia} aponta para outro remix (${r})`);
    ok(o && o.step === d.step, `Remix do dia ${d.dia} mistura Steps (dia ${r})`);
    (revisoes[r] = revisoes[r] || []).push(d.dia);
  });
});
const intervalos = [[], [], []];
let crescentes = 0; let cadeias = 0;
Object.entries(revisoes).forEach(([o, rs]) => {
  const pontos = [Number(o), ...rs.sort((a, b) => a - b)];
  const gaps = pontos.slice(1).map((x, i) => x - pontos[i]);
  gaps.forEach((g, i) => { if (i < 3) intervalos[i].push(g); });
  if (gaps.length >= 2) { cadeias++; if (gaps.every((g, i) => i === 0 || g >= gaps[i - 1])) crescentes++; }
});
const mediana = (a) => { if (!a.length) return '-'; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
ok(cadeias === 0 || crescentes / cadeias >= 0.9, `Só ${crescentes} de ${cadeias} cadeias de revisão têm intervalos crescentes`);
relatorio.push(`\nRemix de domingo: ${dias.filter((d) => d.remix_de).length} domingos, ${Object.keys(revisoes).length} conceitos revisados ao menos uma vez`);
relatorio.push(`  mediana do intervalo até a 1a revisão: ${mediana(intervalos[0])} dias; 1a para 2a: ${mediana(intervalos[1])} dias; 2a para 3a: ${mediana(intervalos[2])} dias`);
relatorio.push(`  cadeias com 2 ou mais revisões: ${cadeias}; com intervalos crescentes: ${crescentes}`);

// intercalação de sistemas: mesmo sistema em dias de conteúdo seguidos do mesmo Step
let repet = 0;
[c1, c2].forEach((c) => c.forEach((d, i) => { if (i && c[i - 1].sistema === d.sistema) repet++; }));
relatorio.push(`  dias de conteúdo seguidos (mesmo Step) com o mesmo sistema: ${repet}`);
if (repet > 15) avisos.push(`Muitos sistemas repetidos em sequência: ${repet}`);
// maior intervalo sem um sistema voltar
[[c1, 'Step 1'], [c2, 'Step 2 CK']].forEach(([c, rot]) => {
  const ult = {}; const maior = {};
  c.forEach((d) => { const t = new Date(d.data).getTime() / 864e5; if (ult[d.sistema] !== undefined) maior[d.sistema] = Math.max(maior[d.sistema] || 0, t - ult[d.sistema]); ult[d.sistema] = t; });
  const pior = Object.entries(maior).sort((a, b) => b[1] - a[1])[0];
  relatorio.push(`  ${rot}: maior intervalo sem um sistema voltar = ${pior[1]} dias (${pior[0]})`);
});

// ---------- 8. datas especiais ----------
function pascoa(y) { // algoritmo de Meeus/Jones/Butcher
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
const nesimo = (y, m, w, n) => { let d = `${y}-${String(m).padStart(2, '0')}-01`; let c = 0; while (true) { if (wd(d) === w && ++c === n) return d; d = addDias(d, 1); } };
const ultimo = (y, m, w) => { let d = addDias(`${y}-${String(m + 1).padStart(2, '0')}-01`, -1); while (wd(d) !== w) d = addDias(d, -1); return d; };
const P = pascoa(2027);
const esperadas = {
  [P]: /Páscoa/, [addDias(P, -2)]: /Sexta-feira Santa/, [addDias(P, -47)]: /Carnaval/, [addDias(P, -48)]: /Carnaval/, [addDias(P, -46)]: /Cinzas/,
  [nesimo(2026, 11, 3, 3)]: /DPOC/, [nesimo(2026, 11, 4, 4)]: /Thanksgiving/, [ultimo(2027, 1, 0)]: /Hanseníase/,
  [nesimo(2027, 3, 4, 2)]: /Rim/, [nesimo(2027, 3, 5, 3)]: /Match Day/, [nesimo(2027, 5, 2, 1)]: /Asma/, [nesimo(2027, 5, 0, 2)]: /Mães/,
  [nesimo(2027, 8, 0, 2)]: /Pais/, [nesimo(2027, 10, 4, 2)]: /Visão/,
  '2026-11-02': /Novembro Azul/, '2026-11-14': /Diabetes/, '2026-12-01': /AIDS/, '2026-12-25': /Natal/, '2027-01-01': /Ano Novo/,
  '2027-02-28': /Doenças Raras/, '2027-03-08': /Mulher/, '2027-03-21': /Down/, '2027-03-24': /Tuberculose/, '2027-04-01': /Mentira/,
  '2027-04-02': /Autismo/, '2027-04-07': /Saúde \(7\/4\)/, '2027-04-21': /Tiradentes/, '2027-04-25': /Malária/, '2027-06-14': /Doador/,
  '2027-07-04': /Independence/, '2027-07-28': /Hepatites/, '2027-09-10': /Suicídio/, '2027-09-29': /Coração/, '2027-10-01': /Outubro Rosa/,
  '2027-10-12': /Crianças/, '2027-10-18': /Dia do Médico/, '2027-10-31': /Halloween/, '2027-11-01': /Novembro Azul/,
};
ok(P === '2027-03-28', `Páscoa 2027 calculada como ${P}`);
ok(nesimo(2027, 3, 5, 3) === '2027-03-19', 'Match Day 2027 deveria cair em 19/3 (terceira sexta de março)');
const porData = new Map(dias.map((d) => [d.data, d]));
Object.entries(esperadas).forEach(([dt, re]) => {
  const d = porData.get(dt);
  ok(d && d.gancho_data && re.test(d.gancho_data), `Data especial ${dt} sem o gancho esperado (${re}); encontrado: ${d && d.gancho_data}`);
});
// nenhum gancho fora da sua data: confere datas citadas no texto "(d/m)"
dias.filter((d) => d.gancho_data).forEach((d) => {
  const m = d.gancho_data.match(/\((\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\)/);
  if (m && !/Semana|Prepara|Prazo|Match Week/.test(d.gancho_data)) {
    const [dd, mm] = [Number(m[1]), Number(m[2])];
    const [, M, Dd] = d.data.split('-').map(Number);
    ok(dd === Dd && mm === M, `Dia ${d.dia} (${d.data}): gancho cita ${dd}/${mm}`);
  }
});
relatorio.push(`\nDatas especiais conferidas: ${Object.keys(esperadas).length} (Páscoa 2027 = ${P}, Carnaval = ${addDias(P, -47)}, Cinzas = ${addDias(P, -46)}, Sexta-feira Santa = ${addDias(P, -2)}, Match Day = 2027-03-19)`);
relatorio.push(`Dias com gancho de data: ${dias.filter((d) => d.gancho_data).length}`);

// ---------- 9. texto: sem travessões ----------
const textoCal = fs.readFileSync(CAL, 'utf8');
ok(!/[\u2014\u2013]/.test(textoCal), 'calendario.json contém travessão ou meia-risca');
if (fs.existsSync(PROG)) {
  const prog = fs.readFileSync(PROG, 'utf8');
  ok(!/[\u2014\u2013]/.test(prog), 'PROGRAMA.md contém travessão ou meia-risca');
  ['salvamentos', 'compartilhamentos', 'quiz', 'simulado', 'pre-inscricao', 'D+1', '2.336/2023'].forEach((t) => ok(prog.includes(t), `PROGRAMA.md não menciona "${t}"`));
  cal.personagens.forEach((p) => ok(prog.includes(p), `PROGRAMA.md não descreve o personagem ${p}`));
  Object.values(cal.quadros).forEach((q) => ok(prog.includes(q.nome), `PROGRAMA.md não descreve o quadro ${q.nome}`));
} else erros.push('PROGRAMA.md não encontrado');

// ---------- 10. banco privado: nenhum conceito copiado ----------
let banco = '';
['step1', 'step2ck'].forEach((p) => {
  const dir = path.join(RAIZ, 'banco-privado', p);
  if (fs.existsSync(dir)) fs.readdirSync(dir).filter((f) => f.endsWith('.json')).forEach((f) => { banco += fs.readFileSync(path.join(dir, f), 'utf8').toLowerCase(); });
});
if (banco) {
  const iguais = dias.filter((d) => !d.remix_de && banco.includes(d.conceito.toLowerCase()));
  ok(iguais.length === 0, `Conceitos idênticos a trechos do banco privado: ${iguais.map((d) => d.dia).join(', ')}`);
  relatorio.push(`\nBanco privado: ${iguais.length} conceitos com texto idêntico a algum trecho do banco (esperado 0)`);
}

// ---------- saída ----------
console.log(`Dias: ${dias.length} | Step 1: ${s1.length} (${pct(s1.length, 365)}) | Step 2 CK: ${s2.length} (${pct(s2.length, 365)})`);
console.log(relatorio.join('\n'));
avisos.forEach((a) => console.log('AVISO: ' + a));
if (erros.length) { console.log(`\n${erros.length} ERRO(S):`); erros.forEach((e) => console.log(' - ' + e)); process.exit(1); }
console.log('\nVALIDAÇÃO OK');
