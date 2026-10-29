#!/usr/bin/env node
// Correções pontuais apontadas por validar-dias.mjs (tom, prompts, sincronia de textos).
import { blocos, salvarBloco } from './lib-dias.mjs';

const RESPEITO = 'Light, friendly and respectful mood; the visual metaphor explains the mechanism and never makes fun of the disease or the patient.';
const HUMOR = /(Playful, witty and friendly mood\.|Clever, friendly, (educational|respectful) humor\.)/g;
const BS = blocos();
const dia = (n) => BS.flatMap((b) => b.dias).find((d) => d.dia === n);
const log = [];

// temas sensíveis (câncer, esquizofrenia, transtorno alimentar): humor sai do prompt
for (const n of [6, 137, 193, 226, 262, 263]) {
  const d = dia(n);
  for (const k of ['imagem_questao', 'imagem_explicacao']) {
    const p = d[k].prompt_nano_banana_pro;
    let novo = p.replace(HUMOR, '').replace(/\s+/g, ' ');
    if (!novo.includes(RESPEITO)) novo = novo.replace(' Vertical 4:5 composition', ` ${RESPEITO} Vertical 4:5 composition`);
    if (novo !== p) { d[k].prompt_nano_banana_pro = novo.replace(/\s+\./g, '.'); log.push(`dia ${n}: ${k} sem pedido de humor`); }
  }
}
// dia 365: festa de formatura do programa (tom normal, como pede o README dos templates)
{
  const d = dia(365);
  if (d.tom !== 'normal') { d.tom = 'normal'; log.push('dia 365: tom normal (formatura)'); }
}
// dia 70: a explicação do template fica igual à revisada em explicacao_pt (limiar de potássio)
{
  const d = dia(70);
  const certa = 'É *diabetic ketoacidosis* (dia 37) com potássio de 3,0 e onda U no ECG. A insulina empurra o potássio para dentro da célula e poderia derrubá-lo a ponto de causar arritmia, então a regra é repor *IV potassium*, manter o soro e só iniciar a insulina quando o K passar do limiar (3,3 nas fontes clássicas, 3,5 no consenso ADA de 2024). Sem supra de ST, não há *primary PCI* (dia 2), e sem déficit neurológico, não há por que pedir a TC do *acute stroke* (dia 65).';
  if (d.explicacao.certa.join(' ') !== certa) { d.explicacao.certa = [certa]; log.push('dia 70: explicação sincronizada com a revisão'); }
}
// vinhetas que repetiam outra de outro bloco
const VINHETAS = {
  // 112 e 182 revisitavam a doença do soro com o mesmo caso do antiveneno; 182 passa a usar a globulina antitimócito equina
  182: 'A 41-year-old man with severe aplastic anemia was treated with equine antithymocyte globulin 10 days ago. He now has fever, a pruritic rash along the sides of his hands and feet, and painful swelling of the knees and wrists. Urinalysis shows mild proteinuria. Serum C3 and C4 are low.',
  // os remixes 189 e 266 usavam o mesmo enunciado-modelo de flashcards; viraram vinhetas clínicas nas rodadas de humor
  // (dias 184 a 244 e 245 a 305) e a fonte de verdade deles fica só em instagram/dias
  // remix da cetoacidose (dia 37): mesmo caso, outra redação
  70: 'A 24-year-old woman with type 1 diabetes has had 2 days of vomiting and abdominal pain; her neurologic examination is normal. Labs: glucose 520 mg/dL, arterial pH 7.12, anion gap 24, serum potassium 3.0 mEq/L. ECG shows U waves and sinus tachycardia without ST elevation. IV normal saline is running.',
};
Object.assign(VINHETAS, {
  // repetia 8 palavras seguidas de um item do banco privado (R2A-CK-0326)
  88: "At a routine prenatal visit at 28 weeks' gestation, a 29-year-old woman in her second pregnancy has blood group O, Rh(D)-negative, with a negative antibody screen. Her first child was born at term. The father of the baby is Rh(D)-positive. The pregnancy has been uncomplicated.",
});
const PERGUNTAS = {};
for (const [n, v] of Object.entries(VINHETAS)) {
  const d = dia(Number(n));
  if (d.questao.vinheta !== v) { d.questao.vinheta = v; log.push(`dia ${n}: vinheta reescrita`); }
  if (PERGUNTAS[n] && d.questao.pergunta !== PERGUNTAS[n]) { d.questao.pergunta = PERGUNTAS[n]; log.push(`dia ${n}: pergunta reescrita`); }
}
// pistas da resposta no dia D (gancho, contexto, imagem da questão e texto alternativo)
const troca = (d, caminho, de, para) => {
  const partes = caminho.split('.');
  let o = d;
  for (const k of partes.slice(0, -1)) o = o[k];
  const k = partes.at(-1);
  if (o[k] === para) return;
  if (de !== null && !String(o[k]).includes(de) && String(o[k]).includes(para)) return;
  if (de !== null && !String(o[k]).includes(de)) throw new Error(`dia ${d.dia}: "${de}" não está em ${caminho}`);
  o[k] = de === null ? para : String(o[k]).replace(de, para);
  log.push(`dia ${d.dia}: ${caminho} sem pista`);
};
{
  const d = dia(16);
  // gancho e alt reescritos no roteiro de humor de 29/10/2026 (sem pista da angio-TC)
  troca(d, 'gancho', null, 'Prótese de quadril, panturrilha inchada e um *caminhão* atravessado no túnel');
  troca(d, 'imagem.alt', null, 'Prótese de quadril, panturrilha inchada e um caminhão atravessado no túnel');
}
troca(dia(32), 'legenda.contexto', 'e só um espeto salva o membro.', 'e só um espeto é a conduta certa.');
// dia 144: gancho e contexto agora vivem só em instagram/dias (rodada de humor dos dias 123 a 183, 29/10/2026)
troca(dia(197), 'imagem.alt', null, 'A Capitã Plaqueta, espantada, diante de uma fila de plaquetinhas do tamanho de botões');
{
  const d = dia(204);
  troca(d, 'imagem.cena', null, 'Macrô, na porta do boteco dos micróbios, olha intrigado um vírus redondo de espinhos que chegou com uma roupa totalmente nova, que ninguém ali conhece. Na mesa de fora há um álbum de figurinhas aberto com uma página vazia e, de enfeite, um porquinho, um passarinho e um bonequinho.');
  troca(d, 'imagem.alt', null, 'Macrô não reconhece o vírus que chegou de cara nova');
  troca(d, 'imagem_questao.prompt_nano_banana_pro',
    'watching three round spiky virus characters at an outdoor table: two of them are swapping blank colorful sticker cards between their open sticker albums, like kids trading World Cup stickers, while the third quietly retouches an old sticker with a small pen;',
    'puzzled, looking at one round spiky virus character who has just arrived wearing a completely new and unfamiliar outfit; on an outdoor table lies an open sticker album with one empty page;');
}
{
  const d = dia(216);
  troca(d, 'imagem.cena', null, 'Uma praia tranquila ao entardecer, com um barquinho navy descansando na areia, um banco de madeira de frente para o mar e um farol ao longe. Tom sereno e acolhedor, sem personagens.');
  troca(d, 'imagem_questao.prompt_nano_banana_pro', 'a calm beach at dusk with gentle waves; a small navy rowboat rocks softly on the water and a red and white lighthouse stands in the distance.',
    'a calm beach at dusk; a small navy rowboat rests on the sand next to a wooden bench that faces the sea, and a red and white lighthouse stands in the distance with a soft warm light.');
}
{
  const d = dia(269);
  troca(d, 'imagem.cena', 'com fitinhas amarelas nas janelas', 'com fitinhas amarelas nas varandas');
  troca(d, 'imagem_questao.prompt_nano_banana_pro', 'small yellow ribbons tied on the windows', 'small yellow ribbons tied on the balcony railings');
}
{
  const d = dia(339);
  troca(d, 'gancho', null, 'Outubro Rosa: a costureira do DNA perdeu *um dos kits*. Qual?');
  troca(d, 'gancho_apoio', null, 'Um gene que cuida de um tipo específico de conserto do DNA.');
  troca(d, 'imagem.alt', null, 'Outubro Rosa: a costureira do DNA perdeu um dos kits. Qual?');
}
{
  const d = dia(365);
  troca(d, 'imagem.cena', 'um bacilo em bastão de capelo pede a última questão', 'um micróbio misterioso, coberto por capelo e beca, pede a última questão');
  troca(d, 'imagem_questao.prompt_nano_banana_pro', 'a small pink rod-shaped bacterium in a tiny graduation cap peeks from behind him', 'a tiny mystery microbe, completely hidden under a small graduation cap and gown, peeks from behind him');
}
troca(dia(20), 'legenda.contexto', 'Um tema delicado, que pede respeito e conhecimento da regra.', 'Um tema delicado, e a prova cobra a regra com precisão.');
// dia 123: a cena dos quatro espetos (sem prato à parte para o aspirador) foi reescrita direto em instagram/dias
// na rodada de humor dos dias 123 a 183 (29/10/2026); não há mais troca a fazer aqui.
// texto alternativo que repetia o tópico do calendário (no remix, a lista dos conceitos)
for (const d of BS.flatMap((b) => b.dias)) {
  const alt = (d.imagem.alt || '').trim();
  if (alt === d.topico || /^Remix (de domingo|do pré-natal)?:? .*\(dia \d+\)/.test(alt)) {
    d.imagem.alt = d.gancho.replace(/\*([^*\n]+)\*/g, '$1');
    log.push(`dia ${d.dia}: imagem.alt trocado pelo gancho`);
  }
}
for (const b of BS) salvarBloco(b);
console.log(log.join('\n') || 'nada a mudar');
