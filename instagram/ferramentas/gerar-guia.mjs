#!/usr/bin/env node
// Guia em PDF da Questão de Embarque (identidade da Road to America, fontes de assets/fonts).
//
//   node instagram/ferramentas/gerar-guia.mjs [entregas/instagram-programa-guia.pdf]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PASTA_INSTAGRAM, RAIZ, num3 } from './lib-dias.mjs';
import { avatar, escudo } from '../templates/lib/slides.mjs';

const require = createRequire(import.meta.url);
const SAIDA = path.resolve(process.argv[2] || path.join(RAIZ, 'entregas', 'instagram-programa-guia.pdf'));
const P = JSON.parse(fs.readFileSync(path.join(PASTA_INSTAGRAM, 'programa-365.json'), 'utf8'));
const b64 = (f) => fs.readFileSync(f).toString('base64');
const FONTES = path.join(RAIZ, 'assets', 'fonts');
const ff = (fam, arq, peso, estilo = 'normal') => `@font-face{font-family:"${fam}";font-weight:${peso};font-style:${estilo};src:url(data:font/woff2;base64,${b64(path.join(FONTES, arq))}) format("woff2")}`;
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const br = (iso) => iso.split('-').reverse().join('/');
const brc = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const img = (f) => (fs.existsSync(f) ? `data:image/png;base64,${b64(f)}` : '');
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CURTO = { 'segunda-feira': 'SEG', 'terça-feira': 'TER', 'quarta-feira': 'QUA', 'quinta-feira': 'QUI', 'sexta-feira': 'SEX', 'sábado': 'SÁB', domingo: 'DOM' };
const QCURTO = { 'Bicho de Segunda': 'Bicho', 'Plantão de Terça': 'Plantão', 'Quarta do Porquê': 'Porquê', 'Rodízio de Quinta': 'Rodízio', 'Sextou na Farmácia': 'Farmácia', 'Sábado Sem Viés': 'Sem Viés', 'Remix de Domingo': 'Remix' };
const N = P.numeros;
const dias = P.dias;
const sensiveis = dias.filter((d) => d.tom === 'acolhedor');
const especiais = dias.filter((d) => d.gancho_data);
// mesmo critério da aba Como usar da planilha (frases dos revisores que pedem reconferir a fonte)
const PEND = /(re)?conferir|estiver vigente|vers[aã]o vigente|edi[cç][aã]o vigente/i;
const nFontes = dias.filter((d) => Object.entries(d.revisao || {}).some(([k, v]) => k !== 'letras' && String(v).split(/(?<=[.;])\s+/).some((s) => PEND.test(s) && !/gancho dizia|^IRT|^Conferid/i.test(s)))).length;

// ---------------------------------------------------------------- páginas
const paginas = [];
const pg = (classe, corpo) => paginas.push(`<section class="pg ${classe}">${corpo}<footer class="rod"><span class="marca">ROAD TO AMERICA</span><span>Questão de Embarque · guia do programa</span><span class="num"></span></footer></section>`);
const placa = (txt, aba = '') => `<div class="placa">${aba ? `<span class="aba">${aba}</span>` : ''}<h2>${txt}</h2></div>`;

// capa
paginas.push(`<section class="pg capa">
  <div class="capa__fita"></div>
  <div class="capa__topo">${escudo('Step 1', 'esc')}${escudo('Step 2 CK', 'esc')}<span>INSTAGRAM · ${br(P.periodo.inicio)} A ${br(P.periodo.fim)}</span></div>
  <h1>Questão<br><em>de Embarque</em></h1>
  <p class="capa__sub">Uma questão de USMLE por dia, com imagem anedótica que ajuda a lembrar e a explicação no dia seguinte. 365 dias de Step 1 e Step 2 CK.</p>
  <div class="capa__nums">
    <div><b>${N.dias}</b><span>questões</span></div>
    <div><b>${N.por_step['Step 1']}</b><span>Step 1</span></div>
    <div><b>${N.por_step['Step 2 CK']}</b><span>Step 2 CK</span></div>
    <div><b>${N.imagens}</b><span>imagens</span></div>
    <div><b>${N.remix}</b><span>remixes</span></div>
  </div>
  <div class="capa__bilhete"><div><small>PASSAGEIRO</small><b>VOCÊ</b></div><div><small>DE</small><b>BRA</b></div><div class="aviao">✈</div><div><small>PARA</small><b>USMLE</b></div><div><small>EMBARQUE</small><b>12H00</b></div><div><small>PORTÃO</small><b>FEED</b></div></div>
  <p class="capa__ass">${esc(P.assinatura.nome)} · ${esc(P.assinatura.crm)}</p>
</section>`);

// 1. conceito
const s8 = path.join(PASTA_INSTAGRAM, 'saida', 'dia-009', 'post-do-dia');
const amostras = fs.existsSync(s8) ? fs.readdirSync(s8).filter((f) => f.endsWith('.png')).sort() : [];
pg('', `${placa('O conceito', '01')}
<div class="duas">
  <div>
    <p class="lead">Todo dia, às 12h, uma questão no formato do USMLE: vinheta curta em inglês, quatro alternativas e uma imagem que conta a história com humor. No dia seguinte, no mesmo horário, vem o gabarito com o porquê, as erradas e o macete, junto com a questão nova.</p>
    <p>O humor existe para fixar o conceito. Cada piada carrega um mnemônico, uma analogia ou um personagem que o seguidor vai lembrar na hora da prova: o rim que carimba tudo, a plaqueta que organiza o trânsito, o fantasma do viés escondido atrás da tabela 2x2.</p>
    <p>A imagem da questão mostra a situação e nunca entrega a resposta. A imagem da explicação usa a mesma cena e revela o macete, como um antes e depois. Os domingos revisam três conceitos já vistos, com intervalos que aumentam, para o conteúdo voltar quando está quase esquecido.</p>
    <ul class="pontos">
      <li><b>Início</b> ${br(P.periodo.inicio)} (segunda-feira, estreia no Novembro Azul)</li>
      <li><b>Fim</b> ${br(P.periodo.fim)}; o gabarito do dia 365 sai em ${br(P.periodo.ultima_explicacao)}</li>
      <li><b>Divisão</b> ${N.por_step['Step 1']} questões de Step 1 (${((100 * N.por_step['Step 1']) / N.dias).toFixed(0)}%) e ${N.por_step['Step 2 CK']} de Step 2 CK, nas faixas do outline oficial</li>
      <li><b>Gabarito equilibrado</b> A ${N.letras.A}, B ${N.letras.B}, C ${N.letras.C}, D ${N.letras.D}; de 7 a 8 de cada letra por mês</li>
      <li><b>Questões originais</b> escritas do zero e conferidas contra o banco privado de 1000 itens</li>
    </ul>
  </div>
  <div class="amostra">${amostras.slice(0, 4).map((f) => `<img src="${img(path.join(s8, f))}">`).join('')}<p class="leg">Post do dia 9 (amostra renderizada, imagem anedótica ainda pendente): capa, vinheta, chamada para responder e o gabarito do dia 8.</p></div>
</div>`);

// 2. quadros
const quadros = Object.entries(P.quadros).map(([dia, q]) => {
  const ex = dias.find((d) => d.dia_semana === dia && !d.gancho_data && d.dia > 7) || dias.find((d) => d.dia_semana === dia);
  return `<tr><td class="dsem">${CURTO[dia]}</td><td><b>${esc(q.nome)}</b><br><small>${esc(q.step)}</small></td><td>${esc(q.foco)}</td><td><i>“${esc(ex.gancho)}”</i><br><small>dia ${num3(ex.dia)}, ${esc(ex.topico)}</small></td></tr>`;
}).join('');
pg('', `${placa('Os quadros da semana', '02')}
<p class="lead">Cada dia da semana tem um quadro fixo, com cenário próprio. O seguidor aprende o ritmo: segunda é micro, terça é plantão, domingo é revisão.</p>
<table class="tab"><thead><tr><th></th><th>Quadro</th><th>Conteúdo</th><th>Exemplo de capa</th></tr></thead><tbody>${quadros}</tbody></table>
<div class="caixa"><b>Remix de Domingo.</b> Três conceitos do mesmo Step, um de cada janela (da semana, de 2 a 5 semanas atrás e de 2 a 4 meses atrás), mais um intruso. Cada alternativa leva o selo "visto no dia X", e o remix repete o mnemônico original para o seguidor reconhecer.</div>`);

// 3. personagens
const pers = P.personagens.map((p) => `<div class="pers"><div class="pers__av">${avatar(p.nome)}</div><div><h3>${esc(p.nome)}</h3><p class="quem">${esc(p.quem)}</p><p>${esc(p.pt)}</p><p class="onde"><b>Onde:</b> ${esc(p.onde)} · ${p.dias.length} dias como personagem do dia</p><p class="bordao">“${esc(p.bordao)}”</p></div></div>`).join('');
pg('', `${placa('Os personagens', '03')}
<p class="lead" style="margin-bottom:3.5mm">Seis personagens com desenho fixo. Eles são a célula, o órgão ou a ideia, e o humor sai da burocracia, do cansaço ou da teimosia deles. Nenhum adoece, sofre ou faz piada com paciente.</p>
<div class="grade-pers">${pers}</div>
<p class="nota">A descrição fixa em inglês de cada um e o prompt-base estão na aba "Personagens" da planilha. Apoios: o garçom do Rodízio (mascote de cabeça redonda, colete vermelho, gravata-borboleta navy) e o ônibus Road to America, que leva os seis nas datas especiais e no dia 365.</p>`);

// 4. rotina D e D+1
const slidesPost = [
  ['1', 'Capa', 'imagem da questão, quadro, Step, dia e gancho na placa verde'], ['2', 'Vinheta', 'caso em inglês e alternativas A a D'],
  ['3', 'Responda', 'comente a letra ou responda no quiz; cartão do gabarito'], ['4', 'Resposta de ontem', 'carimbo com a letra de ontem'],
  ['5', 'Por que está certa', 'explicação em português e termos-chave em inglês'], ['6', 'E as outras?', 'uma linha por alternativa errada'],
  ['7', 'Macete', 'imagem do macete, cartão de revisão e o personagem'], ['8', 'CTA', 'cartão de embarque do simulado grátis e assinatura'],
];
pg('', `${placa('A rotina D e D+1', '04')}
<div class="linha-tempo">
  <div class="lt"><b>11h50</b><span>Story "gabarito em 10 minutos" com o macete de ontem desfocado</span></div>
  <div class="lt forte"><b>12h00</b><span>Feed: carrossel de 8 slides, questão de hoje e gabarito de ontem</span></div>
  <div class="lt"><b>12h01</b><span>Comentário fixado: a explicação completa de ontem</span></div>
  <div class="lt forte"><b>12h05</b><span>Story com adesivo de quiz, quatro opções curtas</span></div>
  <div class="lt"><b>12h06</b><span>Enquete "Você sabia ou chutou?"</span></div>
  <div class="lt"><b>20h30</b><span>Resultado parcial sem revelar a letra, link para o post</span></div>
</div>
<div class="duas">
  <div><h3>O carrossel do dia</h3><table class="tab mini"><tbody>${slidesPost.map(([n, a, b]) => `<tr><td class="dsem ${Number(n) > 3 ? 'gab' : ''}">${n}</td><td><b>${a}</b></td><td>${b}</td></tr>`).join('')}</tbody></table>
  <p class="nota">Slides 1 a 3 são do dia D; 4 a 8 são o gabarito de D-1. No dia 1 o post tem só a questão. O render monta a pasta post-do-dia/ já nessa ordem.</p></div>
  <div><h3>A legenda</h3><ol class="num">
    <li>Gancho em uma linha, ligado à imagem.</li><li>Contexto em duas ou três linhas, sem dar a resposta.</li>
    <li>"Comente A, B, C ou D. O gabarito sai amanhã às 12h."</li><li>Três a cinco palavras-chave neutras, em inglês, tiradas da vinheta.</li>
    <li>Gabarito de ontem: a letra, a resposta e os termos da resposta (só aqui, no D+1).</li><li>CTA do dia.</li>
    <li>${esc(P.assinatura.nome)}, ${esc(P.assinatura.crm)}.</li><li>Aviso: condutas dos EUA cobradas no USMLE, que podem diferir das brasileiras.</li><li>Cinco a oito hashtags.</li></ol>
  <p class="nota">O horário das 12h pega o almoço de quem está no plantão ou no internato. Nas quatro primeiras semanas, teste 20h30 nas terças e quintas e fique com o horário de mais salvamentos por alcance.</p></div>
</div>`);

// 5. stories e CTA
pg('', `${placa('Stories e CTA', '05')}
<div class="duas">
  <div><h3>O quiz dos stories</h3>
  <p>O adesivo de quiz aceita no máximo quatro opções, por isso toda questão tem A a D, com versão curta de até 30 caracteres para o adesivo. O story do quiz já sai pronto (story-quiz.png) com a área livre para o adesivo e um guia de posicionamento.</p>
  <p>O quiz mostra a resposta certa para quem responde. Por isso a explicação completa fica para o D+1, e o story só confirma a letra. A enquete "Você sabia ou chutou?" faz o seguidor perceber o que não sabe.</p>
  <p><b>Domingo, 18h:</b> placar da semana com as três questões de menor acerto e o link do simulado grátis.</p>
  <p><b>Destaques fixos:</b> Step 1, Step 2 CK, Remix, Simulado grátis, Pré-inscrição.</p>
  <div class="stories">${['story-quiz.png', 'story-quiz-guia.png'].map((f) => `<img src="${img(path.join(PASTA_INSTAGRAM, 'saida', 'dia-009', f))}">`).join('')}<p class="leg">Story do quiz do dia 9 e o guia de onde encaixar o adesivo (o guia não é postado).</p></div></div>
  <div><h3>CTA por dia</h3><table class="tab mini"><thead><tr><th>Quando</th><th>CTA</th></tr></thead><tbody>
    <tr><td>Terça, quinta e domingo</td><td><b>Simulado grátis de 30 minutos</b>: "Gostou do formato? Faça um bloco inteiro, grátis."</td></tr>
    <tr><td>Domingo e datas do Match</td><td><b>Pré-inscrição</b>: "Quer estudar com método e acompanhamento?" Sem promessa de vaga, preço ou aprovação.</td></tr>
    <tr><td>Primeira quarta do mês</td><td><b>Verificador de faculdade</b>: "Sua escola está habilitada para o USMLE? Confira em 1 minuto."</td></tr>
    <tr><td>Outros dias</td><td><b>Salvar e compartilhar</b>: "Salve para o Remix de domingo e mande para quem vai fazer o Step com você."</td></tr>
  </tbody></table>
  <p class="nota">Links nunca na legenda: só na bio e no adesivo de link, sempre com UTM (utm_source=instagram, utm_campaign=questao_de_embarque, utm_content=dia_NNN). O roteiro de cada dia, com os links prontos, está na coluna "Roteiro dos stories" da planilha e no stories.txt do render.</p></div>
</div>`);

// 6. métricas
const met = [
  ['Taxa de salvamentos', 'salvamentos / alcance', 'Principal sinal de conteúdo útil. Os 10% melhores viram reels e voltam nos remixes.'],
  ['Taxa de compartilhamentos', 'compartilhamentos / alcance', 'Mede o humor que funciona; compare personagens e quadros.'],
  ['Respostas no quiz', 'respostas / visualizações do story', 'Queda por três semanas seguidas pede ajuste de horário ou de capa.'],
  ['Acerto no quiz', 'certas / respostas', 'Ideal entre 40% e 70%. Acima de 85%, ficou fácil; abaixo de 25%, revise a ambiguidade.'],
  ['Cliques no link', 'toques no adesivo e na bio, por UTM', 'Ponte para o site.'],
  ['Conversão', 'sessões, simulados e pré-inscrições com a UTM', 'Resultado do programa no funil.'],
  ['Alcance de não seguidores', '% do alcance', 'Crescimento do perfil.'],
  ['Comentários com letra', 'comentários com A, B, C ou D', 'Sinal para o algoritmo e termômetro de dúvida.'],
];
pg('', `${placa('Métricas', '06')}
<p class="lead">Planilha semanal, toda segunda antes do post, uma linha por dia (a aba Calendário já tem as colunas de alcance, salvamentos, respostas e acerto; a taxa de salvamento se calcula sozinha).</p>
<table class="tab"><thead><tr><th>Métrica</th><th>Cálculo</th><th>Para que serve</th></tr></thead><tbody>${met.map((m) => `<tr><td><b>${m[0]}</b></td><td>${m[1]}</td><td>${m[2]}</td></tr>`).join('')}</tbody></table>
<div class="caixa"><b>Revisão mensal.</b> Acerto por sistema e por Step (vira tema de reel e de live), quadro com mais salvamentos, personagem com mais compartilhamentos e conferência das condutas que mudaram nas diretrizes.</div>`);

// 7. humor e compliance
pg('', `${placa('Regras de humor e compliance', '07')}
<div class="caixa forte" style="margin-top:0"><b>Duas perguntas antes de aprovar uma imagem:</b> a piada aponta para a resposta certa? Ela continuaria engraçada se uma pessoa com essa doença estivesse lendo? Se a resposta a qualquer uma for não, troque a piada.</div>
<div class="duas">
  <div><h3 class="ok">Pode</h3><ul class="pontos"><li>Personificar órgãos, células, moléculas, remédios e conceitos.</li><li>Analogia absurda que vira mnemônico.</li><li>Rir da prova, da rotina de estudo e das siglas.</li><li>Cultura brasileira: rodízio, feira, Carnaval, festa junina, futebol, novela.</li></ul>
  <h3 class="nao">Não pode</h3><ul class="pontos"><li>Piada com paciente, sofrimento, corpo, idade ou deficiência.</li><li>Piada com doença grave ou estigmatizada: câncer, HIV, transtornos mentais, suicídio, demência, autismo, síndrome de Down, hanseníase.</li><li>Piada com grupos, profissões ou colegas.</li><li>Apologia a álcool, drogas ou automedicação.</li><li>Personagens, músicas ou memes de terceiros.</li></ul></div>
  <div><h3>Compliance</h3><ul class="pontos"><li><b>CFM 2.336/2023:</b> sem promessa de aprovação, nota ou Match, sem "o melhor curso", sem antes e depois. Nome e CRM em toda legenda; especialidade só com RQE conferido.</li><li><b>Imagens:</b> só ilustração própria, sem paciente, exame real ou pessoa reconhecível, sem texto dentro da imagem.</li><li><b>Banco privado:</b> os 1000 itens são produto pago; o Instagram usa conceitos do outline escritos do zero, e o render compara cada dia com o banco.</li><li><b>LGPD:</b> respostas do quiz analisadas de forma agregada; nada de nome ou foto de seguidor sem autorização escrita.</li><li><b>Fontes:</b> condutas conferidas na diretriz americana vigente; a planilha lista os ${nFontes} dias que os revisores marcaram para reconferir antes de postar.</li></ul></div>
</div>
<h3>Datas em que o humor sai e entra o acolhimento (${sensiveis.length} dias)</h3>
<div class="chips">${sensiveis.map((d) => `<span><b>${brc(d.data)}</b> ${esc(((d.gancho_data || d.topico).split(/[.:(]/)[0]).replace(/^(Dia Mundial|Dia Internacional) (de |da |do |das |dos )?/, '').replace(/^Semana do Dia Mundial da /, '').replace(/^(.{0,34})(\s.*)?$/, '$1'))}</span>`).join('')}</div>
<p class="nota">Nesses dias a capa troca a placa verde por navy, os personagens explicam sem gag e os prompts pedem tom calmo e respeitoso. No Setembro Amarelo, o CVV 188 entra na legenda e nos stories.</p>`);

// 8. produção
pg('', `${placa('Produção: imagens e posts', '08')}
<div class="passos">
  <div><b>1</b><h3>Validar</h3><p><code>node instagram/ferramentas/validar-dias.mjs</code> confere os 365 dias: calendário, duplicidade, letras, pistas da resposta, quiz, datas sensíveis, promessas, prompts e o render com o banco privado.</p></div>
  <div><b>2</b><h3>Gerar as imagens</h3><p>Higgsfield, modelo Nano Banana Pro, 2k, 4:5. Copie o prompt pronto da aba "Prompts das imagens" (730 linhas) e salve como <code>dia-NNN.png</code> e <code>dia-NNN-macete.png</code> em <code>instagram/imagens/</code>.</p></div>
  <div><b>3</b><h3>Conferir</h3><p>Sem texto na imagem, personagem igual ao da aba Personagens, terço de baixo liso (a placa do gancho cobre essa área) e nenhuma pista da resposta na imagem da questão.</p></div>
  <div><b>4</b><h3>Renderizar</h3><p><code>node instagram/templates/render.mjs --intervalo 15-21</code> gera o carrossel, a legenda, o roteiro dos stories e o manifesto de cada dia em <code>instagram/saida/</code>.</p></div>
  <div><b>5</b><h3>Agendar</h3><p>Poste a pasta <code>post-do-dia/</code> com a legenda.txt, fixe a explicação de ontem como comentário e siga o stories.txt. Marque os status na planilha.</p></div>
</div>
<div class="caixa"><b>Ritmo sugerido.</b> Toda segunda: gerar e conferir as imagens da semana seguinte, renderizar e agendar. Uma semana de antecedência dá tempo para refazer imagem e reconferir fonte. Datas móveis de 2027 (Carnaval 09/02, Páscoa 28/03, Match Day 19/03) e condutas de rastreamento são reconferidas uma semana antes do post.</div>
<div class="nums-prod"><div><b>${N.dias}</b><span>dias escritos e validados</span></div><div><b>${N.imagens}</b><span>prompts prontos</span></div><div><b>${especiais.length}</b><span>dias com gancho de data</span></div><div><b>${N.remix}</b><span>remixes de domingo</span></div></div>`);

// 9. calendário mês a mês
const porMes = new Map();
for (const d of dias) {
  const k = d.data.slice(0, 7);
  if (!porMes.has(k)) porMes.set(k, []);
  porMes.get(k).push(d);
}
const meses = [...porMes.entries()];
// novembro de 2027 (só o dia 365) vai junto com outubro
const ult = meses.pop();
meses[meses.length - 1][1].push(...ult[1]);
const capaCal = `${placa('Calendário resumido', '09')}<p class="lead">Um mês por página. <span class="tag s1">S1</span> Step 1, <span class="tag s2">CK</span> Step 2 CK, <span class="tag rx">remix</span> revisão de domingo, <span class="tag ac">acolhedor</span> data sensível sem piada (linhas cinza e azuis); a estrela marca o gancho de data. A letra certa não aparece aqui, para o guia poder circular na equipe sem gabarito.</p>`;
{
  const resumo = meses.map(([k, lista]) => {
    const [a, m] = k.split('-');
    const c = (f) => lista.filter(f).length;
    return `<tr><td><b>${MESES[Number(m) - 1]} ${a}</b></td><td>${lista.length}</td><td>${c((d) => !/2/.test(d.step))}</td><td>${c((d) => /2/.test(d.step))}</td><td>${c((d) => d.remix_de)}</td><td>${c((d) => d.gancho_data)}</td><td>${c((d) => d.tom === 'acolhedor')}</td></tr>`;
  }).join('');
  pg('', `${capaCal}<table class="tab"><thead><tr><th>Mês</th><th>Dias</th><th>Step 1</th><th>Step 2 CK</th><th>Remix</th><th>Gancho de data</th><th>Tom acolhedor</th></tr></thead><tbody>${resumo}<tr><td><b>Total</b></td><td><b>${dias.length}</b></td><td><b>${N.por_step['Step 1']}</b></td><td><b>${N.por_step['Step 2 CK']}</b></td><td><b>${N.remix}</b></td><td><b>${especiais.length}</b></td><td><b>${sensiveis.length}</b></td></tr></tbody></table>
  <div class="caixa"><b>Como ler as próximas páginas.</b> Cada linha é um dia: data, dia da semana, número do dia, quadro, Step, tópico (com o personagem do dia) e o gancho de data, quando houver. O conteúdo completo de cada dia, com vinheta, alternativas, gabarito, legendas e prompts, está na planilha.</div>`);
}
meses.forEach(([k, lista], i) => {
  const [a, m] = k.split('-');
  const titulo = `${MESES[Number(m) - 1]} de ${a}${lista.some((d) => d.data.startsWith('2027-11')) ? ' e 01/11/2027' : ''}`;
  const linhas = lista.map((d) => `<tr class="${d.remix_de ? 'rx' : ''} ${d.tom === 'acolhedor' ? 'ac' : ''}"><td class="dt">${brc(d.data)}</td><td class="ds">${CURTO[d.dia_semana]}</td><td class="nd">${num3(d.dia)}</td><td class="qd">${QCURTO[d.quadro]}</td><td><span class="tag ${/2/.test(d.step) ? 's2' : 's1'}">${/2/.test(d.step) ? 'CK' : 'S1'}</span></td><td class="tp">${esc(d.remix_de ? 'Remix: ' + d.remix_de.map((x) => dias[x - 1].topico).join(', ') : d.topico)}${d.personagem ? ` <small>· ${esc(d.personagem)}</small>` : ''}</td><td class="gd">${d.gancho_data ? `★ ${esc(d.gancho_data.split(/[.(:]/)[0].slice(0, 46))}` : ''}</td></tr>`).join('');
  pg('cal', `<div class="mes"><h2>${titulo}</h2><span>${lista.length} dias · Step 1 ${lista.filter((d) => /1/.test(d.step) && !/2/.test(d.step)).length} · Step 2 CK ${lista.filter((d) => /2/.test(d.step)).length}</span></div><table class="caltab"><tbody>${linhas}</tbody></table>`);
});

// ---------------------------------------------------------------- HTML
const css = `
${ff('Barlow Condensed', 'barlow-condensed-latin-700-normal.woff2', 700)}${ff('Barlow Condensed', 'barlow-condensed-latin-800-normal.woff2', 800)}${ff('Barlow Condensed', 'barlow-condensed-latin-600-normal.woff2', 600)}
${ff('Barlow', 'barlow-latin-400-normal.woff2', 400)}${ff('Barlow', 'barlow-latin-500-normal.woff2', 500)}${ff('Barlow', 'barlow-latin-600-normal.woff2', 600)}
${ff('Overpass Mono', 'overpass-mono-latin-400-normal.woff2', 400)}${ff('Overpass Mono', 'overpass-mono-latin-600-normal.woff2', 600)}
:root{--navy:#0f2747;--vermelho:#b0243a;--papel:#f3f5f2;--papel2:#e7ebe6;--verde:#1d8a4b;--amarelo:#f1c232;--tinta:#0d1a2b;--tinta2:#3a4859;--tinta3:#5b6878}
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Barlow;color:var(--tinta);font-size:10.5pt;line-height:1.45;counter-reset:pg}
.pg{width:210mm;height:297mm;padding:16mm 16mm 20mm;position:relative;overflow:hidden;background:var(--papel);page-break-after:always;counter-increment:pg}
.pg::before{content:"";position:absolute;left:0;top:0;right:0;height:3mm;background:linear-gradient(90deg,var(--verde) 0 50%,var(--amarelo) 50%)}
.rod{position:absolute;left:16mm;right:16mm;bottom:9mm;display:flex;justify-content:space-between;font-family:"Overpass Mono";font-size:7.5pt;color:var(--tinta3);border-top:1px solid #cfd6cf;padding-top:2.5mm}
.rod .marca{font-weight:600;color:var(--navy);letter-spacing:.08em}
.rod .num::after{content:counter(pg)}
h2,h3{font-family:"Barlow Condensed";line-height:1.05}
h3{font-weight:700;font-size:14pt;color:var(--navy);margin:5mm 0 2mm;text-transform:uppercase;letter-spacing:.01em}
h3.ok{color:var(--verde)}h3.nao{color:var(--vermelho)}
p{margin-bottom:2.6mm}
.lead{font-size:12pt;color:var(--tinta2);margin-bottom:5mm}
.nota{font-size:9pt;color:var(--tinta3)}
code{font-family:"Overpass Mono";font-size:8.2pt;background:var(--papel2);padding:.3mm 1.2mm;border-radius:1mm}
.placa{position:relative;background:var(--verde);border:1.2mm solid #fff;outline:.6mm solid var(--verde);border-radius:3mm;padding:4mm 6mm;margin:3mm 0 6mm;box-shadow:0 2mm 4mm rgba(13,26,43,.15)}
.placa h2{color:#fff;font-weight:800;font-size:28pt;text-transform:uppercase}
.placa .aba{position:absolute;right:6mm;top:-5.5mm;background:var(--verde);color:#fff;font-family:"Overpass Mono";font-weight:600;font-size:9pt;padding:1mm 3mm;border:.8mm solid #fff;border-radius:1.5mm}
.duas{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
.pontos{list-style:none;margin:2mm 0 3mm}
.pontos li{padding-left:5mm;position:relative;margin-bottom:1.8mm}
.pontos li::before{content:"";position:absolute;left:0;top:2mm;width:2.2mm;height:2.2mm;background:var(--vermelho);border-radius:50%}
ol.num{margin:1mm 0 3mm 5mm}ol.num li{margin-bottom:1.2mm}
.amostra{display:grid;grid-template-columns:1fr 1fr;gap:3mm;align-content:start}
.amostra img{width:100%;border-radius:2mm;box-shadow:0 1.5mm 3mm rgba(13,26,43,.25)}
.stories{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:3mm}.stories img{width:100%;border-radius:2mm;box-shadow:0 1.5mm 3mm rgba(13,26,43,.25)}
.leg{grid-column:1/3;font-size:8.5pt;color:var(--tinta3)}
.tab{width:100%;border-collapse:collapse;margin:2mm 0 5mm;font-size:9.6pt}
.tab th{background:var(--navy);color:#fff;font-family:"Overpass Mono";font-weight:600;font-size:7.8pt;text-transform:uppercase;text-align:left;padding:2mm 2.5mm}
.tab td{padding:2.4mm 2.5mm;border-bottom:1px solid #d5dbd5;vertical-align:top}
.tab td small{color:var(--tinta3)}
.tab.mini{font-size:9pt}.tab.mini td{padding:1.6mm 2mm}
.dsem{font-family:"Barlow Condensed";font-weight:800;font-size:13pt;color:var(--vermelho);width:12mm}
.dsem.gab{color:#a77b00}
.caixa{background:#fff;border-left:2mm solid var(--amarelo);padding:4mm 5mm;border-radius:1.5mm;margin:4mm 0;box-shadow:0 1mm 2mm rgba(13,26,43,.08)}
.caixa.forte{border-left-color:var(--vermelho);font-size:11pt}
.grade-pers{display:grid;grid-template-columns:1fr 1fr;gap:3mm 5mm}
.pers{display:grid;grid-template-columns:20mm 1fr;gap:3mm;background:#fff;border-radius:2.5mm;padding:3mm;box-shadow:0 1mm 2mm rgba(13,26,43,.08)}
.pers__av{width:22mm;height:22mm;border-radius:50%;background:var(--papel2);display:flex;align-items:center;justify-content:center;border:.7mm solid var(--navy)}
.pers__av svg{width:17mm;height:17mm}
.pers h3{margin:0 0 1mm;font-size:15pt}
.pers p{font-size:8.2pt;margin-bottom:1mm;line-height:1.3}
.pers .quem{color:var(--tinta2);font-weight:500}
.pers .onde{color:var(--tinta3)}
.pers .bordao{font-family:"Barlow Condensed";font-weight:700;font-size:11.5pt;color:var(--vermelho)}
.linha-tempo{display:grid;grid-template-columns:repeat(6,1fr);gap:2mm;margin:0 0 6mm}
.lt{background:#fff;border-top:1.5mm solid var(--navy);border-radius:1.5mm;padding:2.5mm;font-size:8.4pt;line-height:1.3}
.lt.forte{border-top-color:var(--vermelho)}
.lt b{display:block;font-family:"Barlow Condensed";font-weight:800;font-size:16pt;color:var(--navy)}
.chips{display:flex;flex-wrap:wrap;gap:1.6mm;margin:2mm 0 3mm}
.chips span{background:#e6eef8;border:1px solid #c4d3e6;border-radius:5mm;padding:.5mm 2.2mm;font-size:7.6pt}
.chips b{font-family:"Overpass Mono";font-weight:600;color:var(--navy)}
.passos{display:grid;grid-template-columns:1fr;gap:3mm}
.passos>div{display:grid;grid-template-columns:12mm 1fr;grid-template-rows:auto auto;column-gap:4mm;background:#fff;border-radius:2mm;padding:3.5mm 4mm}
.passos b{grid-row:1/3;font-family:"Barlow Condensed";font-weight:800;font-size:28pt;color:var(--vermelho);line-height:1}
.passos h3{margin:0 0 1mm}.passos p{margin:0}
.nums-prod,.capa__nums{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-top:4mm}
.nums-prod div{background:var(--navy);color:#fff;border-radius:2mm;padding:3mm 4mm}
.nums-prod b,.capa__nums b{display:block;font-family:"Barlow Condensed";font-weight:800;font-size:26pt;line-height:1;color:var(--amarelo)}
.nums-prod span,.capa__nums span{font-family:"Overpass Mono";font-size:7.5pt;text-transform:uppercase}
.capa{background:var(--navy);color:#fff;padding:22mm 18mm}
.capa::before{display:none}
.capa__fita{position:absolute;left:0;right:0;top:0;height:6mm;background:linear-gradient(90deg,var(--verde) 0 50%,var(--amarelo) 50%)}
.capa__topo{display:flex;align-items:center;gap:4mm;font-family:"Overpass Mono";font-size:9pt;letter-spacing:.1em;color:#c9d3e0}
.capa__topo .esc{width:15mm;height:18mm}
.capa h1{font-family:"Barlow Condensed";font-weight:800;font-size:88pt;line-height:.86;text-transform:uppercase;margin:30mm 0 8mm}
.capa h1 em{font-style:normal;color:var(--amarelo)}
.capa__sub{font-size:15pt;max-width:150mm;color:#e3e8ef;line-height:1.35}
.capa__nums{grid-template-columns:repeat(5,1fr);margin:16mm 0 14mm;border-top:1px solid #2c4568;padding-top:7mm}
.capa__nums span{color:#c9d3e0}
.capa__bilhete{display:grid;grid-template-columns:repeat(2,1fr) 10mm repeat(3,1fr);align-items:end;background:var(--papel);color:var(--navy);border-radius:3mm;padding:6mm 7mm;border-left:4mm dashed var(--vermelho)}
.capa__bilhete small{display:block;font-family:"Overpass Mono";font-size:7pt;color:var(--tinta3)}
.capa__bilhete b{font-family:"Barlow Condensed";font-weight:800;font-size:22pt}
.capa__bilhete .aviao{font-size:18pt;color:var(--vermelho);text-align:center}
.capa__ass{position:absolute;left:18mm;bottom:16mm;font-family:"Overpass Mono";font-size:9pt;color:#c9d3e0}
.mes{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.2mm solid var(--navy);margin-bottom:2mm;padding-bottom:1mm}
.mes h2{font-weight:800;font-size:24pt;color:var(--navy);text-transform:uppercase}
.mes span{font-family:"Overpass Mono";font-size:8pt;color:var(--tinta3)}
.caltab{width:100%;border-collapse:collapse;font-size:8.3pt;line-height:1.22}
.caltab td{padding:1.25mm 1.4mm;border-bottom:1px solid #dde3de;vertical-align:top}
.caltab tr.rx{background:var(--papel2)}
.caltab tr.ac{background:#e6eef8}
.caltab .dt{font-family:"Overpass Mono";font-weight:600;color:var(--navy);width:11mm}
.caltab .ds{font-family:"Overpass Mono";font-size:7.2pt;color:var(--tinta3);width:9mm}
.caltab .nd{font-family:"Overpass Mono";font-size:7.2pt;color:var(--vermelho);width:8mm}
.caltab .qd{font-family:"Barlow Condensed";font-weight:700;font-size:9.5pt;width:15mm}
.caltab .tp small{color:var(--tinta3)}
.caltab .gd{font-size:7.4pt;color:#8a6a00;width:44mm}
.tag{display:inline-block;font-family:"Overpass Mono";font-weight:600;font-size:6.6pt;padding:.2mm 1.2mm;border-radius:1mm;color:#fff;background:var(--navy)}
.tag.s2{background:var(--vermelho)}.tag.rx{background:#8c98a8}.tag.ac{background:#5b7fb0}
.cal .lead{font-size:10pt;margin-bottom:4mm}
.cal .placa{margin-bottom:4mm}
`;
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Questão de Embarque: guia do programa</title><style>${css}</style></head><body>${paginas.join('\n')}</body></html>`;
fs.writeFileSync(SAIDA.replace(/\.pdf$/, '.html'), html);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: SAIDA, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
fs.rmSync(SAIDA.replace(/\.pdf$/, '.html'));
console.log(`${path.relative(RAIZ, SAIDA)}: ${paginas.length} páginas`);
