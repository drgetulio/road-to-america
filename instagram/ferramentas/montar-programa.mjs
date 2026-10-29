#!/usr/bin/env node
// Junta os 365 dias, o calendário, os personagens e as legendas geradas pelo render
// num só arquivo: instagram/programa-365.json (fonte da planilha e do guia em PDF).
//
//   node instagram/ferramentas/montar-programa.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { todosOsDias, calendario, exportarQuestoes, semMarca, num3, PASTA_INSTAGRAM } from './lib-dias.mjs';
import { ESTILO, COMPOSICAO, PROIBICOES, PERSONAGENS, APOIO } from './normalizar-dias.mjs';
import { montarDia, carregarConfig } from '../templates/lib/dados.mjs';
import { legenda, legendaSoQuestao, blocoGabarito, roteiroStories, ctaDoDia } from '../templates/lib/legenda.mjs';

const cal = calendario();
const CAL = new Map(cal.dias.map((d) => [d.dia, d]));
const DIAS = todosOsDias();
const config = carregarConfig();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-programa-'));
exportarQuestoes(DIAS, tmp);
const pastaImagens = path.join(PASTA_INSTAGRAM, 'imagens');
const montado = new Map(DIAS.map((d) => [d.dia, montarDia(d.dia, tmp, pastaImagens)]));

const QUEM = {
  'Macrô': { quem: 'Macrófago guloso e generoso: "come" o invasor e apresenta o pedaço aos linfócitos como quem mostra a comanda.', pt: 'Bolha arredondada lilás clara com pseudópodes curtos, olhos grandes e simpáticos, guardanapo xadrez vermelho e branco no pescoço, crachá em branco num cordão.', onde: 'Bicho de Segunda, remix de micro e imuno', bordao: 'Comi, mostrei, avisei.' },
  Mito: { quem: 'Mitocôndria cansada de plantão, faz ATP sem parar.', pt: 'Feijão alaranjado com cristas internas aparentes, olheiras, jaleco branco amassado, copo de café sem rótulo, crachá em branco.', onde: 'Metabolismo, bioquímica, apoptose, estatinas e metformina', bordao: 'Sem oxigênio eu não trabalho.' },
  'Seu Néfron': { quem: 'Rim burocrata que confere tudo antes de liberar.', pt: 'Feijão vinho com gravata navy, óculos de leitura na ponta do nariz, carimbo na mão, pilha de formulários em branco.', onde: 'Renal, ácido-base, diuréticos, eletrólitos', bordao: 'Sem carimbo, não sai.' },
  'Capitã Plaqueta': { quem: 'Agente de trânsito do sangue, organiza a coagulação como um cruzamento.', pt: 'Disco amarelo sorridente com colete refletivo verde, apito, quepe navy e cones de trânsito ao lado; os fatores da coagulação são carrinhos.', onde: 'Hematologia, coagulação, anticoagulantes, transfusão', bordao: 'Parou, colou, coagulou.' },
  'Tia Meia-Vida': { quem: 'Farmacêutica de balcão de interior, divide tudo pela metade.', pt: 'Ampulheta simpática com braços, óculos de armação vermelha, avental branco com canetas no bolso e coque grisalho; a areia é o remédio indo embora.', onde: 'Sextou na Farmácia', bordao: 'Cinco meias-vidas e ninguém lembra mais.' },
  'Viés': { quem: 'Fantasminha da estatística, distorce resultados quando ninguém está olhando.', pt: 'Lençol branco com bainha em zigue-zague, olhos navy, lupa na mão, sempre meio escondido atrás de uma tabela 2x2 ou de um gráfico em branco.', onde: 'Sábado Sem Viés, Halloween', bordao: 'Se você não randomizou, eu entrei.' },
};
const NOME_EN = { 'Macrô': 'Macrô', Mito: 'Mito', 'Seu Néfron': 'Seu Néfron', 'Capitã Plaqueta': 'Capitã Plaqueta', 'Tia Meia-Vida': 'Tia Meia-Vida', 'Viés': 'Viés' };
const promptBase = (nome, desc) => `${ESTILO} Recurring character: ${nome}, ${desc}. Scene: [cena do dia]. ${COMPOSICAO} ${PROIBICOES}`;

const personagens = Object.entries(PERSONAGENS).map(([nome, en]) => ({
  nome,
  ...QUEM[nome],
  descricao_en: en,
  prompt_base: promptBase(NOME_EN[nome], en),
  dias: DIAS.filter((d) => d.personagem === nome || d.anfitriao === nome).map((d) => d.dia),
}));
const apoio = [
  { nome: 'Garçom Espetinho', quem: 'Anfitrião do Rodízio de Quinta; serve as condutas em espetos.', pt: 'Mascote de cabeça redonda, camisa branca, colete vermelho e gravata-borboleta navy, nunca uma pessoa real. A plaquinha verde e vermelha fica de lado na questão.', descricao_en: APOIO.garcom, onde: 'Rodízio de Quinta', bordao: 'Vai uma conduta aí, doutor?' },
  { nome: 'Dona Térmica', quem: 'Anfitriã do Plantão de Terça: a garrafa térmica de café do plantão, que já viu de tudo às 3 da manhã.', pt: 'Garrafa térmica vermelha de pressão, tampa navy, olhos de sono mas espertos, estetoscópio no pescoço, prancheta em branco.', descricao_en: APOIO.termica, onde: 'Plantão de Terça, remix de Step 2 CK', bordao: 'Já vi esse caso às 3 da manhã.' },
  { nome: 'Seu Allen', quem: 'Anfitrião da Quarta do Porquê quando nenhum órgão combina: a chave Allen do manual de montagem.', pt: 'Chavinha Allen prateada em forma de L, olhos grandes e redondos, avental navy de marceneiro, lápis vermelho atrás da orelha.', descricao_en: APOIO.allen, onde: 'Quarta do Porquê', bordao: 'Sobrou peça? Então faltou mecanismo.' },
  { nome: 'Dona Bússola', quem: 'Anfitriã do Sábado Sem Viés nos dias de ética e comunicação: a bússola de bolso que sempre aponta para o paciente.', pt: 'Bússola de bolso redonda, caixa amarela com aro navy, ponteiro vermelho no mostrador claro, olhos grandes e simpáticos, lencinho verde no pescoço e um caderninho em branco.', descricao_en: APOIO.bussola, onde: 'Sábado Sem Viés (ética e comunicação), remix acolhedor', bordao: 'Meu norte é o paciente.' },
  { nome: 'Ônibus Road to America', quem: 'O ônibus da viagem; leva os seis personagens nas datas especiais e no dia 365.', pt: 'Ônibus navy arredondado de desenho, com faixa verde e amarela na lateral.', descricao_en: APOIO.onibus, onde: 'Datas especiais e encerramento', bordao: null },
].map((a) => ({ ...a, prompt_base: `${ESTILO} Recurring ${a.bordao ? `character: ${a.nome},` : 'scene element:'} ${a.descricao_en}. Scene: [cena do dia]. ${COMPOSICAO} ${PROIBICOES}`, dias: DIAS.filter((d) => d.anfitriao === a.nome).map((d) => d.dia) }));

const alts = (d) => Object.entries(d.questao.alternativas).map(([letra, v]) => ({ letra, texto: semMarca(v.texto), quiz: semMarca(v.quiz || v.texto), visto_no_dia: v.dia ?? null }));

const dias = DIAS.map((d) => {
  const m = montado.get(d.dia);
  const ontem = d.dia > 1 ? montado.get(d.dia - 1) : null;
  const c = CAL.get(d.dia);
  const certa = alts(d).find((a) => a.letra === d.questao.correta);
  return {
    dia: d.dia,
    data: d.data,
    dia_semana: d.dia_semana,
    explicacao_em: d.explicacao_em,
    quadro: d.quadro,
    step: d.step,
    sistema: d.sistema,
    area: c.disciplina_ou_area,
    topico: d.topico,
    conceito: d.conceito,
    tipo_pergunta: d.tipo_pergunta,
    personagem: d.personagem,
    anfitriao: d.anfitriao ?? null,
    gancho_data: d.gancho_data,
    remix_de: d.remix_de,
    tom: m.tom,
    cvv: m.cvv,
    cta: ctaDoDia(m),
    gancho: semMarca(d.gancho),
    gancho_apoio: d.gancho_apoio ? semMarca(d.gancho_apoio) : null,
    questao: { vinheta: semMarca(d.questao.vinheta), pergunta: semMarca(d.questao.pergunta), alternativas: alts(d), correta: d.questao.correta, resposta: certa.texto },
    explicacao: {
      titulo: semMarca(d.explicacao.titulo),
      certa: d.explicacao.certa.map(semMarca).join('\n\n'),
      erradas: Object.fromEntries(Object.entries(d.explicacao.erradas).map(([k, v]) => [k, semMarca(v)])),
      termos: d.explicacao.termos,
      macete: semMarca(d.explicacao.macete.frase),
      macete_apoio: d.explicacao.macete.apoio ? semMarca(d.explicacao.macete.apoio) : null,
      pegadinha: d.explicacao_pt?.pegadinha_de_prova || null,
    },
    legendas: {
      palavras_chave: d.legenda.palavras_chave,
      questao_D: d.legenda_questao_pt,
      post_D: legenda(m, ontem, config).trimEnd(),
      gabarito_no_post_D1: blocoGabarito(m),
      explicacao_D1: d.legenda_explicacao_pt,
    },
    story: { pergunta: d.story_quiz.pergunta_curta_pt, opcoes: d.story_quiz.opcoes, correta: d.story_quiz.correta, roteiro: roteiroStories(m, config).trimEnd() },
    imagens: {
      questao: { arquivo: `instagram/imagens/dia-${num3(d.dia)}.png`, cena: d.imagem.cena, alt: d.imagem.alt, prompt: d.imagem_questao.prompt_nano_banana_pro, ...d.imagem_questao.parametros },
      explicacao: { arquivo: `instagram/imagens/dia-${num3(d.dia)}-macete.png`, cena: d.imagem_macete.cena, alt: d.imagem_macete.alt, prompt: d.imagem_explicacao.prompt_nano_banana_pro, ...d.imagem_explicacao.parametros },
    },
    fonte: d.fonte,
    revisao: d.revisao,
  };
});
fs.rmSync(tmp, { recursive: true, force: true });

const conta = (f) => dias.reduce((o, d) => ((o[f(d)] = (o[f(d)] || 0) + 1), o), {});
const programa = {
  programa: config.programa,
  marca: config.marca,
  gerado_em: new Date().toISOString().slice(0, 10),
  periodo: cal.periodo,
  horarios: { feed: config.horario_feed, story_quiz: '12h05', enquete: '12h06', resultado_parcial: '20h30', aviso_gabarito: '11h50 do dia seguinte', placar_domingo: '18h00' },
  assinatura: config.assinatura,
  links: config.links,
  utm: config.utm,
  aviso: config.aviso,
  quadros: cal.quadros,
  personagens,
  apoio,
  prompt: { estilo: ESTILO, composicao: COMPOSICAO, proibicoes: PROIBICOES, modelo: 'Nano Banana Pro (Higgsfield)', resolucao: '2k', proporcao: '4:5' },
  numeros: {
    dias: dias.length,
    imagens: dias.length * 2,
    por_step: conta((d) => d.step),
    por_quadro: conta((d) => d.quadro),
    letras: conta((d) => d.questao.correta),
    remix: dias.filter((d) => d.remix_de).length,
    tom_acolhedor: dias.filter((d) => d.tom === 'acolhedor').length,
  },
  dias,
};
const destino = path.join(PASTA_INSTAGRAM, 'programa-365.json');
fs.writeFileSync(destino, JSON.stringify(programa, null, 1) + '\n');
console.log(`${path.relative(process.cwd(), destino)}: ${dias.length} dias, ${dias.length * 2} imagens, ${(fs.statSync(destino).size / 1e6).toFixed(1)} MB`);
console.log(JSON.stringify(programa.numeros));
