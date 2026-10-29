#!/usr/bin/env node
// Gera instagram/reels-semanais.json: um Reel nativo por semana (52), de 15 a 30 segundos,
// ligado a uma questão de segunda a quarta da mesma semana (o gabarito já saiu quando o Reel
// vai ao ar, na sexta às 19h). O texto vem do que já foi escrito para o dia (pergunta do
// story, opções curtas, macete, pegadinha, personagem); este script só monta as cenas.
// O projeto Remotion de reels/ lê o JSON e renderiza (reels/src/semanais.ts).
//
//   node instagram/ferramentas/gerar-reels-semanais.mjs
//
// Texto por semana em ferramentas/reels-roteiro.json: o gancho de cada uma das 52 semanas (único e
// da questão da semana), a troca de dado da Pegadinha e o gancho com número do formato Resultado.
// Números reais da enquete: instagram/resultados-enquete.json ({"dias": {"23": {"A": 12, ...}}}).
// Sem números, o Reel de Resultado sai no plano B (vota nos comentários), pronto para renderizar.
// As ilustrações do carrossel entram no Reel quando existirem em instagram/imagens/ (o render
// copia para reels/public/semanais/; ver reels/scripts/render-semanais.mjs).
// Para ajustar um Reel à mão, edite AJUSTES abaixo (por semana) e rode de novo: o JSON é saída.
import fs from 'node:fs';
import path from 'node:path';
import { todosOsDias, semMarca, num3, PASTA_INSTAGRAM } from './lib-dias.mjs';
import { conversao, somarDias, pacoteNaData, diasDoPacote, remixQueRevisa } from '../templates/lib/conversao.mjs';

const DIAS = todosOsDias();
const dia = (n) => DIAS[n - 1];
const C = conversao();
const curta = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const SEM = { 'segunda-feira': 'segunda', 'terça-feira': 'terça', 'quarta-feira': 'quarta' };

// Ajustes manuais por semana: { formato, dia, cenas: { indice: { texto_tela } } }
const AJUSTES = {};
const ROTEIRO = JSON.parse(fs.readFileSync(path.join(PASTA_INSTAGRAM, 'ferramentas', 'reels-roteiro.json'), 'utf8')).semanas;
const arqRes = path.join(PASTA_INSTAGRAM, 'resultados-enquete.json');
const RESULTADOS = fs.existsSync(arqRes) ? JSON.parse(fs.readFileSync(arqRes, 'utf8')).dias || {} : {};
const temNumeros = (r) => r && ['A', 'B', 'C', 'D'].every((l) => typeof r[l] === 'number');
const existeImagem = (f) => fs.existsSync(path.join(PASTA_INSTAGRAM, 'imagens', f));

const FORMATOS = {
  pov: {
    nome: 'POV',
    descricao: 'POV de quem está na prova: a pergunta do story, as quatro opções, a letra carimbada e o macete na voz do personagem.',
    audio: 'Narração na voz do médico, gravada no celular, lendo o texto das cenas, com um tique-taque de relógio gravado no próprio celular. Se quiser trilha, só da Biblioteca de Áudio Comercial do Instagram (faixas liberadas para conta profissional), em volume baixo.',
  },
  macete: {
    nome: 'Personagem explica o macete',
    descricao: 'O personagem do dia explica o macete em 20 segundos, com o termo-chave carimbado no fim.',
    audio: 'Grave a fala do personagem no celular, num tom de desenho animado próprio (sem imitar ator, dublador ou personagem conhecido). Fundo opcional da Biblioteca de Áudio Comercial do Instagram.',
  },
  pegadinha: {
    nome: 'A pegadinha da semana',
    descricao: 'Troque um dado e a resposta muda: pergunta, opções, a linha que decide, a letra certa e o contraste com um dado trocado, que leva a outra alternativa.',
    audio: 'Narração própria e dois efeitos gravados por você: um "erro" (caneta batendo na mesa) na alternativa tentadora e um estalo de dedo no carimbo.',
  },
  resultado: {
    nome: 'Resultado da enquete',
    descricao: 'O resultado real da enquete de uma questão da semana, letra por letra, e a explicação de quem errou. Os números entram em resultados-enquete.json na sexta; sem eles, sai o plano B (a pessoa comenta a letra antes do carimbo).',
    audio: 'Rufar feito com as mãos na mesa antes do carimbo e narração própria. Nada de música do top 50: conta profissional não tem licença para isso.',
  },
  desafio: {
    nome: 'Chamada do desafio',
    descricao: 'Convite para o Desafio 30 Dias de Embarque, na semana de inscrição.',
    audio: 'Narração própria com uma batida instrumental da Biblioteca de Áudio Comercial do Instagram.',
  },
};
const ROTACAO = ['pov', 'macete', 'pegadinha', 'resultado'];
const PREFERENCIA = { pov: [2, 3, 1], macete: [1, 3, 2], pegadinha: [3, 2, 1], resultado: [2, 1, 3] }; // posição na semana (1 = segunda)

const sensivel = (d) => d.tom === 'acolhedor' || d.cvv;
const quem = (d) => d.personagem || d.anfitriao || null;

// primeira frase do texto que caiba em max caracteres (sem cortar no meio)
function curto(t, max) {
  const limpo = String(t || '').trim();
  if (semMarca(limpo).length <= max) return limpo;
  const frases = limpo.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const f of frases) {
    if (semMarca(out ? `${out} ${f}` : f).length > max) break;
    out = out ? `${out} ${f}` : f;
  }
  if (out) return out;
  const partes = limpo.split(/(?<=[:;])\s+/);
  if (semMarca(partes[0]).length <= max) return partes[0].replace(/[:;]$/, '.');
  return null;
}
// macete que cabe na tela: a primeira frase, ou o título da explicação
const maceteCurto = (d) => curto(d.explicacao.macete.frase, 150) || curto(d.explicacao.macete.frase, 190) || d.explicacao.macete.fala || d.explicacao.titulo;
// asteriscos sempre em pares
const fecharMarcas = (t) => ((t.match(/\*/g) || []).length % 2 ? t.replace(/\*/g, '') : t);

function escolherDia(semana, formato) {
  const base = 7 * (semana - 1);
  const cand = PREFERENCIA[formato].map((p) => dia(base + p));
  const bons = cand.filter((d) => !sensivel(d) && !d.remix_de);
  if (formato === 'pegadinha') return bons.find((d) => d.explicacao_pt?.pegadinha_de_prova && curto(d.explicacao_pt.pegadinha_de_prova, 150)) || bons[0] || null;
  if (formato === 'macete') {
    const ok = bons.filter((d) => quem(d) && curto(d.explicacao.macete.frase, 150));
    return ok.find((d) => remixQueRevisa(d.dia, DIAS)) || ok[0] || bons[0] || null;
  }
  return bons[0] || null;
}

function palavraDoReel(formato, d, semana) {
  if (formato === 'desafio') return 'DESAFIO';
  if (formato === 'pegadinha' || formato === 'resultado') return 'SIMULADO';
  if (formato === 'pov') return /2/.test(d.step) ? 'SIMULADO' : 'MACETE';
  return semana === 1 ? 'SIMULADO' : 'MACETE';
}
const FECHO = { SIMULADO: 'Chega no *direct*', MACETE: 'Os 7 macetes mais recentes, *este incluído*', DESAFIO: 'Chega no *direct*' };
const NARRA_FECHO = { SIMULADO: 'A resposta automática chega em segundos.', MACETE: 'Chegam os sete macetes mais recentes, com este incluído.', DESAFIO: 'A resposta automática chega em segundos.' };

function cenasDe(formato, d, semana, extra) {
  const rt = extra.roteiro;
  const opcoes = Object.values(d?.questao.alternativas || {}).map((a) => semMarca(a.quiz || a.texto));
  const correta = d?.questao.correta;
  const certaCurta = d ? semMarca(d.questao.alternativas[correta].quiz || d.questao.alternativas[correta].texto) : '';
  const nome = d ? quem(d) : null;
  const macete = d ? maceteCurto(d) : null;
  const palavra = palavraDoReel(formato, d, semana);
  const fim = (t0) => [
    { inicio_s: t0, fim_s: t0 + 2.5, tipo_visual: 'legenda_cinetica', texto_tela: `Comente *${palavra}*`, narracao: `Comente ${palavra} que eu mando no seu direct.` },
    { inicio_s: t0 + 2.5, fim_s: t0 + 5, tipo_visual: 'carimbo', texto_tela: FECHO[palavra], narracao: NARRA_FECHO[palavra] },
  ];
  const ilustr = d && existeImagem(`dia-${num3(d.dia)}-macete.png`) ? `dia-${num3(d.dia)}-macete.png` : null;
  const fala = (t0, t1, texto) => (nome
    ? { inicio_s: t0, fim_s: t1, tipo_visual: 'personagem', personagem: nome, ...(ilustr ? { ilustracao: ilustr } : {}), texto_tela: fecharMarcas(texto), narracao: semMarca(texto) }
    : { inicio_s: t0, fim_s: t1, tipo_visual: 'legenda_cinetica', texto_tela: fecharMarcas(texto), narracao: semMarca(texto) });
  // depois do gabarito, a pergunta pode trazer o achado da vinheta (quiz.resumo); a enquete do dia D não traz
  const textoPergunta = d ? d.quiz.resumo || d.quiz.pergunta : '';
  const pergunta = (t0, t1) => ({ inicio_s: t0, fim_s: t1, tipo_visual: 'legenda_cinetica', texto_tela: textoPergunta, narracao: textoPergunta });
  const gancho = { inicio_s: 0, fim_s: 2, tipo_visual: 'legenda_cinetica', texto_tela: rt?.gancho || '', narracao: semMarca(rt?.gancho || '') };

  if (formato === 'pov') {
    return { virada: 12, cenas: [
      gancho,
      pergunta(2, 6.5),
      { inicio_s: 6.5, fim_s: 12, tipo_visual: 'alternativas', texto_tela: 'Qual é a *sua letra?*', opcoes, narracao: 'Pausa o vídeo e escolhe.' },
      { inicio_s: 12, fim_s: 15, tipo_visual: 'carimbo', texto_tela: `Letra *${correta}*`, narracao: `Letra ${correta}: ${certaCurta}.` },
      fala(15, 20.5, macete),
      ...fim(20.5),
    ] };
  }
  if (formato === 'macete') {
    const termo = semMarca((d.explicacao.termos || [])[0] || certaCurta);
    // só promete a volta no Remix quando o conceito volta de fato (remix_de de um domingo depois)
    const volta = remixQueRevisa(d.dia, DIAS);
    const promessa = volta
      ? { inicio_s: 16, fim_s: 18.5, tipo_visual: 'legenda_cinetica', texto_tela: `Volta no *Remix* de ${curta(volta.data)}`, narracao: `Ele volta no Remix de domingo, dia ${curta(volta.data)}.`, remix_dia: volta.dia }
      : { inicio_s: 16, fim_s: 18.5, tipo_visual: 'legenda_cinetica', texto_tela: 'Este *não volta* no Remix: salve agora', narracao: 'Este não volta no Remix. Salve agora.', remix_dia: null };
    return { virada: 13, cenas: [
      gancho,
      pergunta(2, 5.5),
      fala(5.5, 13, macete),
      { inicio_s: 13, fim_s: 16, tipo_visual: 'carimbo', texto_tela: `*${termo}*`, narracao: termo },
      promessa,
      ...fim(18.5),
    ] };
  }
  if (formato === 'pegadinha') {
    const peg = curto(d.explicacao_pt.pegadinha_de_prova, 150);
    const tr = rt.troca;
    return { virada: 14, cenas: [
      gancho,
      pergunta(2, 5.5),
      { inicio_s: 5.5, fim_s: 10, tipo_visual: 'alternativas', texto_tela: 'Qual você *marcaria?*', opcoes, narracao: 'Qual você marcaria?' },
      { inicio_s: 10, fim_s: 14, tipo_visual: 'legenda_cinetica', texto_tela: peg, narracao: semMarca(peg) },
      { inicio_s: 14, fim_s: 16.5, tipo_visual: 'carimbo', texto_tela: `Letra *${correta}*: ${certaCurta}`, narracao: `Letra ${correta}: ${certaCurta}.` },
      { inicio_s: 16.5, fim_s: 20.5, tipo_visual: 'legenda_cinetica', texto_tela: `Troque *um dado*: ${tr.dado}`, narracao: `Agora troque um dado: ${semMarca(tr.dado)}.`, contraste: 'troca' },
      { inicio_s: 20.5, fim_s: 23.5, tipo_visual: 'carimbo', texto_tela: `A resposta vira *${tr.resposta}*`, narracao: `E a resposta vira ${semMarca(tr.resposta)}.`, contraste: 'nova_resposta' },
      ...fim(23.5),
    ] };
  }
  if (formato === 'resultado') {
    if (extra.comNumeros) {
      return { virada: 12, cenas: [
        { inicio_s: 0, fim_s: 2, tipo_visual: 'legenda_cinetica', texto_tela: rt.gancho_resultado, narracao: semMarca(rt.gancho_resultado).replace('{erro}', 'tantos') },
        pergunta(2, 6),
        { inicio_s: 6, fim_s: 12, tipo_visual: 'alternativas', texto_tela: 'Como a turma *votou*', opcoes, percentuais_de: 'resultado', narracao: 'Olha como a turma votou.' },
        { inicio_s: 12, fim_s: 15, tipo_visual: 'carimbo', texto_tela: `Era a *${correta}*`, narracao: `Era a ${correta}: ${certaCurta}.` },
        fala(15, 19.5, macete),
        ...fim(19.5),
      ] };
    }
    // plano B: sem os números da enquete, a votação vai para os comentários
    return { virada: 11, cenas: [
      gancho,
      pergunta(2, 6),
      { inicio_s: 6, fim_s: 11, tipo_visual: 'alternativas', texto_tela: 'Sua letra vai *nos comentários*', opcoes, narracao: 'Pausa e comenta a sua letra antes do carimbo.' },
      { inicio_s: 11, fim_s: 14, tipo_visual: 'carimbo', texto_tela: `Era a *${correta}*`, narracao: `Era a ${correta}: ${certaCurta}.` },
      fala(14, 18.5, macete),
      ...fim(18.5),
    ] };
  }
  // desafio
  const des = extra.desafio;
  return { virada: 12, cenas: [
    gancho,
    { inicio_s: 2, fim_s: 5, tipo_visual: 'checklist', texto_tela: 'Vote na *enquete* às 12h06', narracao: 'Vote na enquete do meio-dia, sem consultar.' },
    { inicio_s: 5, fim_s: 8.5, tipo_visual: 'checklist', texto_tela: 'Abra o *gabarito* no dia seguinte', narracao: 'No dia seguinte, a resposta é o primeiro slide.' },
    { inicio_s: 8.5, fim_s: 12, tipo_visual: 'checklist', texto_tela: 'Marque a *cartela*', narracao: 'E marque a cartela.' },
    { inicio_s: 12, fim_s: 15, tipo_visual: 'carimbo', texto_tela: `Começa *${curta(des.inicio)}*`, narracao: `Começa em ${curta(des.inicio)}.` },
    { inicio_s: 15, fim_s: 18, tipo_visual: 'legenda_cinetica', texto_tela: 'Sem prêmio. Sem ranking. *Só o hábito.*', narracao: 'Sem prêmio e sem ranking. Só o hábito.' },
    ...fim(18),
  ] };
}

function legendaDoReel(r, d, palavra) {
  const ass = 'Dr. Getúlio Bernardo Morato Filho, CRM-DF 13610.';
  const aviso = 'Conteúdo educacional para a prova. Condutas seguem as diretrizes dos EUA cobradas no USMLE e podem diferir das brasileiras.';
  const step = d && /2/.test(d.step) ? '#USMLEStep2CK' : '#USMLEStep1';
  const linhas = [semMarca(r.gancho_0a2s).replace('{erro}', String(r.resultado?.erro ?? 'Quase metade'))];
  if (d) linhas.push('', `Questão do dia ${num3(d.dia)} (${d.quadro}, ${SEM[d.dia_semana] || d.dia_semana} ${curta(d.data)}). O gabarito completo, com as erradas e o macete, está no post de ${curta(d.explicacao_em)}.`);
  else linhas.push('', `${C.desafio.nome}, edição ${r.desafio.edicao}: de ${curta(r.desafio.inicio)} a ${curta(r.desafio.fim)}.`);
  const frase = (C.frases_cta[{ SIMULADO: 'simulado', MACETE: 'macete', DESAFIO: 'desafio' }[palavra]] || [])[0] || '';
  linhas.push('', frase.replaceAll('{inicio}', r.desafio ? `em ${curta(r.desafio.inicio)}` : ''));
  linhas.push('', ass, aviso, '', ['#USMLE', step, '#MedicinaNosEUA', '#RoadToAmerica', '#IMG', '#QuestaoDoDia'].join(' '));
  return linhas.join('\n');
}

const reels = [];
for (let semana = 1; semana <= 52; semana++) {
  const sexta = somarDias('2026-11-02', 7 * (semana - 1) + 4);
  const aj = AJUSTES[semana] || {};
  // semana de inscrição do desafio: o Reel é a chamada
  const desInsc = C.desafio.edicoes.find((e) => sexta >= e.inscricao[0] && sexta <= e.inscricao[1]);
  let formato = aj.formato || (desInsc ? 'desafio' : ROTACAO[(semana - 1) % ROTACAO.length]);
  let d = formato === 'desafio' ? null : aj.dia ? dia(aj.dia) : escolherDia(semana, formato);
  if (formato !== 'desafio' && !d) {
    // semana só com datas sensíveis de segunda a quarta: macete em tom calmo, sem piada
    formato = 'macete';
    d = dia(7 * (semana - 1) + 3);
  }
  const rt = ROTEIRO[String(semana)];
  if (!rt || !rt.gancho) throw new Error(`semana ${semana}: falta o gancho em reels-roteiro.json`);
  if (rt.dia !== (d ? d.dia : null)) throw new Error(`semana ${semana}: reels-roteiro.json foi escrito para o dia ${rt.dia}, mas o Reel usa o dia ${d ? d.dia : null}`);
  if (formato === 'pegadinha' && !(rt.troca?.dado && rt.troca?.resposta)) throw new Error(`semana ${semana}: Pegadinha sem a troca de dado`);
  if (formato === 'resultado' && !rt.gancho_resultado) throw new Error(`semana ${semana}: Resultado sem gancho_resultado`);
  const numeros = d ? RESULTADOS[String(d.dia)] : null;
  const comNumeros = formato === 'resultado' && temNumeros(numeros);
  const { virada, cenas } = cenasDe(formato, d, semana, { desafio: desInsc, roteiro: rt, comNumeros });
  for (const [i, c] of Object.entries(aj.cenas || {})) Object.assign(cenas[i], c);
  const duracao = cenas.at(-1).fim_s;
  const palavra = palavraDoReel(formato, d, semana);
  const r = {
    id: `semana-${String(semana).padStart(2, '0')}`,
    semana,
    publicar_em: sexta,
    horario: '19h00',
    formato,
    formato_nome: FORMATOS[formato].nome,
    dia_questao: d ? d.dia : null,
    quadro: d ? d.quadro : null,
    step: d ? d.step : null,
    personagem: d ? quem(d) : null,
    tom: d && sensivel(d) ? 'acolhedor' : 'normal',
    gabarito_publicado_em: d ? d.explicacao_em : null,
    titulo: semMarca(cenas[0].texto_tela).replace('{erro}', '??'),
    gancho_0a2s: cenas[0].texto_tela,
    duracao_s: duracao,
    virada_s: virada,
    palavra_chave: palavra,
    cenas,
    texto_na_tela: cenas.map((c) => semMarca(c.texto_tela)),
    audio: { sugestao: FORMATOS[formato].audio, musica_embutida: false, observacao: 'O Remotion renderiza o vídeo sem áudio. O som entra no Instagram, na hora de publicar.' },
    desafio: desInsc ? { edicao: desInsc.edicao, inicio: desInsc.inicio, fim: desInsc.fim } : undefined,
    resultado: formato === 'resultado'
      ? { fonte: `Enquete do story das 12h06 do dia ${num3(d.dia)} (${curta(d.data)}); números em instagram/resultados-enquete.json`, A: comNumeros ? numeros.A : null, B: comNumeros ? numeros.B : null, C: comNumeros ? numeros.C : null, D: comNumeros ? numeros.D : null,
        erro: comNumeros ? Math.round(100 - numeros[d.questao.correta] / (numeros.A + numeros.B + numeros.C + numeros.D) * 100) : null }
      : undefined,
    // Resultado sem números sai no plano B (comentários), que também está pronto para renderizar
    status: formato === 'resultado' && !comNumeros ? 'pronto_plano_b' : 'pronto',
    plano_b: formato === 'resultado' && !comNumeros ? 'Sem os números da enquete: o Reel pede a letra nos comentários antes do carimbo. Para a versão com as barras, preencha instagram/resultados-enquete.json e gere de novo.' : undefined,
    contraste: formato === 'pegadinha' ? { dado: rt.troca.dado, resposta: rt.troca.resposta } : undefined,
    macete_dm: palavra === 'MACETE' ? (() => { const k = pacoteNaData(sexta, '19h00'); return { pacote: k, dias: diasDoPacote(k), inclui_este_dia: d ? d.dia >= diasDoPacote(k)[0] && d.dia <= diasDoPacote(k)[1] : null }; })() : undefined,
    ilustracoes: d ? { questao: `dia-${num3(d.dia)}.png`, macete: `dia-${num3(d.dia)}-macete.png`, existem: existeImagem(`dia-${num3(d.dia)}.png`) && existeImagem(`dia-${num3(d.dia)}-macete.png`), observacao: 'Quando as imagens existem em instagram/imagens/, a cena do personagem mostra a ilustração do macete do carrossel no lugar do avatar.' } : undefined,
    capa: `reels/out/semanais/capas/semana-${String(semana).padStart(2, '0')}.jpg`,
    video: `reels/out/semanais/semana-${String(semana).padStart(2, '0')}.mp4`,
  };
  r.legenda = legendaDoReel(r, d, palavra);
  reels.push(r);
}

const saida = {
  programa: 'Questão de Embarque',
  descricao: 'Um Reel nativo por semana, de 15 a 30 segundos, publicado na sexta às 19h00 e ligado a uma questão de segunda a quarta da mesma semana (o gabarito já saiu). Gancho nos 2 primeiros segundos, texto na tela do começo ao fim, legível sem som. O vídeo sai mudo; o áudio sugerido entra no Instagram.',
  gerado_por: 'instagram/ferramentas/gerar-reels-semanais.mjs',
  render: 'cd reels && npm run render:semanais -- semana-01,semana-02 (ver reels/README.md)',
  regras: [
    'Gancho de até 2 segundos, em texto na tela, que funcione sem som.',
    'Nada de música protegida dentro do vídeo. Trilha só da Biblioteca de Áudio Comercial do Instagram, ou voz e efeitos gravados por você.',
    'Legenda sem endereço escrito: a conversão é pela palavra-chave do comentário (resposta automática no direct).',
    'O Reel só mostra questão cujo gabarito já saiu; nunca adianta a resposta de uma questão em aberto.',
    'Formato Resultado: os números reais da enquete entram em instagram/resultados-enquete.json e o script gera de novo; sem eles, sai o plano B, que pede a letra nos comentários e não mostra número nenhum.',
    'Cada uma das 52 semanas tem gancho próprio, escrito para a questão daquela semana (reels-roteiro.json).',
    'Pegadinha: depois da letra certa, troque um dado da vinheta e mostre a alternativa que passa a ser a certa.',
    'Macete: só promete a volta no Remix quando o conceito está no remix_de de um domingo depois; senão, pede para salvar.',
    'MACETE no direct: o pacote dos sete macetes mais recentes troca toda sexta às 12h, então o Reel das 19h já está nele.',
    'As ilustrações do carrossel entram no Reel quando existirem; a voz pode ser a do médico, gravada no celular.',
    'Datas sensíveis ficam fora dos formatos com piada; se a semana inteira for sensível, o Reel vira o macete em tom calmo.',
  ],
  formatos: FORMATOS,
  numeros: Object.fromEntries(Object.keys(FORMATOS).map((f) => [f, reels.filter((r) => r.formato === f).length])),
  reels,
};
const destino = path.join(PASTA_INSTAGRAM, 'reels-semanais.json');
fs.writeFileSync(destino, JSON.stringify(saida, null, 1) + '\n');
console.log(`${path.relative(process.cwd(), destino)}: ${reels.length} reels`, JSON.stringify(saida.numeros));
const avisos = reels.filter((r) => r.cenas.some((c) => !c.texto_tela)).map((r) => r.id);
if (avisos.length) console.log('cenas sem texto (ajuste em AJUSTES):', avisos.join(', '));
