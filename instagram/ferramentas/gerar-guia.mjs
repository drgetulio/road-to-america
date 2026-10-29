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
    <p class="lead">Todo dia, às 12h, uma questão no formato do USMLE: vinheta curta em inglês, quatro alternativas e uma imagem que conta a história com humor. No dia seguinte, no mesmo horário, o post abre com o gabarito (a letra, o porquê, as erradas e o macete) e depois traz a questão nova. Toda sexta sai um Reel, todo mês uma live de correção.</p>
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
  <div class="amostra">${amostras.slice(0, 4).map((f) => `<img src="${img(path.join(s8, f))}">`).join('')}<p class="leg">Post do dia 9 (amostra renderizada, imagem anedótica ainda pendente): os quatro primeiros slides são o gabarito do dia 8, com a letra carimbada logo na capa.</p></div>
</div>`);

// 2. quadros
const quadros = Object.entries(P.quadros).map(([dia, q]) => {
  const ex = dias.find((d) => d.dia_semana === dia && !d.gancho_data && d.dia > 7) || dias.find((d) => d.dia_semana === dia);
  return `<tr><td class="dsem">${CURTO[dia]}</td><td><b>${esc(q.nome)}</b><br><small>${esc(q.step)}</small></td><td>${esc(q.foco)}</td><td><i>“${esc(ex.gancho)}”</i><br><small>dia ${num3(ex.dia)}, ${esc(ex.topico)}</small></td></tr>`;
}).join('');
pg('', `${placa('Os quadros da semana', '02')}
<p class="lead">Cada dia da semana tem um quadro fixo, com cenário próprio. O seguidor aprende o ritmo: segunda é micro, terça é plantão, domingo é revisão.</p>
<table class="tab"><thead><tr><th></th><th>Quadro</th><th>Conteúdo</th><th>Exemplo de capa</th></tr></thead><tbody>${quadros}</tbody></table>
<div class="caixa"><b>Remix de Domingo.</b> Três conceitos do mesmo Step, um de cada janela (da semana, de 2 a 5 semanas atrás e de 2 a 4 meses atrás), numa vinheta nova. As alternativas que vêm de dias revisados levam o selo "visto no dia X"; a resposta certa é o intruso, sem selo, em ${dias.filter((d) => d.remix_de && !d.questao.alternativas.find((a) => a.letra === d.questao.correta).visto_no_dia).length} dos ${N.remix} domingos, para o selo não virar pista, e nenhum remix repete a pergunta e a resposta do dia revisado.</div>`);

// 3. personagens
const pers = P.personagens.map((p) => `<div class="pers"><div class="pers__av">${avatar(p.nome)}</div><div><h3>${esc(p.nome)}</h3><p class="quem">${esc(p.quem)}</p><p>${esc(p.pt)}</p><p class="onde"><b>Onde:</b> ${esc(p.onde)} · ${p.dias.length} dias como personagem do dia</p><p class="bordao">“${esc(p.bordao)}”</p></div></div>`).join('');
pg('', `${placa('Os personagens', '03')}
<p class="lead" style="margin-bottom:3.5mm">Seis personagens com desenho fixo. Eles são a célula, o órgão ou a ideia, e o humor sai da burocracia, do cansaço ou da teimosia deles. Nenhum adoece, sofre ou faz piada com paciente.</p>
<div class="grade-pers">${pers}</div>
<p class="nota">A descrição fixa em inglês de cada um e o prompt-base estão na aba "Personagens" da planilha. Apoios: o garçom do Rodízio (mascote de cabeça redonda, colete vermelho, gravata-borboleta navy) e o ônibus Road to America, que leva os seis nas datas especiais e no dia 365.</p>`);

// 3b. consistência do elenco e cena enxuta
const REF = P.referencias_personagens || { personagens: [] };
const quem = (d) => d.personagem || d.anfitriao || 'sem personagem';
const elenco = {};
for (const d of dias) elenco[quem(d)] = (elenco[quem(d)] || 0) + 1;
const linhasElenco = Object.entries(elenco).filter(([n]) => n !== 'sem personagem').sort((a, b) => b[1] - a[1])
  .map(([n, c]) => `<tr><td><b>${esc(n)}</b></td><td>${c}</td><td>${((100 * c) / dias.length).toFixed(1).replace('.', ',')}%</td><td><small>${esc((REF.personagens.find((r) => r.nome === n) || {}).arquivo || '')}</small></td></tr>`).join('');
pg('', `${placa('Elenco consistente, cena enxuta', '03b')}
<p class="lead" style="margin-bottom:3mm">O mesmo personagem precisa sair igual em 40 imagens, e a cena precisa caber no tamanho de um polegar na tela do celular.</p>
<div class="duas">
  <div><h3>Folha de referência de cada personagem</h3><ol class="num">
    <li>Uma vez, antes da estreia: gerar a folha (model sheet) dos ${REF.personagens.length} personagens no Nano Banana Pro, 2k, 16:9, com frente, perfil, três quartos e quatro expressões. O prompt de cada um está em <code>personagens-referencia.json</code> e na aba "Personagens" da planilha.</li>
    <li>Salvar em <code>instagram/imagens/referencias/</code>, subir no Higgsfield e anotar o <code>media_id</code>.</li>
    <li>Em toda imagem do dia, anexar a folha de cada personagem da cena em <code>medias</code>, com o papel <code>image_references</code>. O campo <code>personagem_referencia</code> do dia e a coluna "Referência do personagem" da planilha dizem quais folhas usar; o prompt já pede o personagem idêntico à folha.</li></ol>
  <h3>Cena enxuta</h3><ul class="pontos">
    <li>No máximo 3 elementos principais, um personagem em ação e fundo limpo.</li>
    <li>As quatro alternativas nunca viram quatro objetos na cena.</li>
    <li>Nenhum personagem, seta ou objeto aponta a resposta; as setinhas da quarta ficam num canto.</li>
    <li>O validador estima os elementos de cada cena e bloqueia as carregadas demais.</li></ul></div>
  <div><h3>Rodízio: ninguém passa de 15% do ano</h3>
  <table class="tab mini"><thead><tr><th>Personagem do dia</th><th>Dias</th><th>Ano</th><th>Folha</th></tr></thead><tbody>${linhasElenco}</tbody></table>
  <p class="nota">Teto de ${Math.floor(0.15 * dias.length)} dias por personagem, conferido pelo <code>validar-dias.mjs</code> no personagem do dia e nas imagens de questão. Os anfitriões dos quadros (Dona Térmica, Seu Allen, Garçom Espetinho e Dona Bússola) dividem o ano com os seis personagens de órgão e de ideia.</p></div>
</div>`);

// 4. rotina D e D+1
const CV = P.conversao;
const slidesPost = P.carrossel.completo.map((t, i) => [String(i + 1), t]);
pg('', `${placa('A rotina D e D+1', '04')}
<div class="linha-tempo">
  <div class="lt forte"><b>12h00</b><span>Feed: o gabarito de ontem abre o carrossel; a questão de hoje vem depois</span></div>
  <div class="lt"><b>12h01</b><span>Comentário fixado: a explicação completa de ontem</span></div>
  <div class="lt forte"><b>12h05</b><span>Story do gabarito: resultado da enquete de ontem e quiz de segunda chance, agora com o achado da vinheta</span></div>
  <div class="lt forte"><b>12h06</b><span>Story da questão: enquete "Qual é a sua letra?", A a D em inglês, sem gabarito e sem pista</span></div>
  <div class="lt"><b>12h07</b><span>Controle deslizante: quanta certeza você tem?</span></div>
  <div class="lt"><b>20h30</b><span>Resultado parcial sem revelar a letra, link para o post</span></div>
</div>
<div class="duas">
  <div><h3>O carrossel: a recompensa primeiro</h3><table class="tab mini"><tbody>${slidesPost.map(([n, a]) => `<tr><td class="dsem ${Number(n) <= 4 ? 'gab' : ''}">${n}</td><td>${esc(a)}</td></tr>`).join('')}</tbody></table>
  <p class="nota">Slides 1 a 4 são o gabarito de D-1; 5 a 8, a questão de D. Modo enxuto: ${esc(P.carrossel.enxuto.join(', ').toLowerCase())}. ${esc(P.carrossel.dia_1)}</p></div>
  <div><h3>Por que um post, e não dois</h3><ul class="pontos">
    <li><b>Recompensa rápida.</b> Quem respondeu ontem vê a letra no primeiro slide e, no mesmo gesto de arrastar, chega à questão de hoje.</li>
    <li><b>Cabe numa pessoa.</b> Dois posts por dia seriam 730 publicações e o dobro de comentários para responder.</li>
    <li><b>Comentários juntos.</b> A discussão de ontem e o palpite de hoje somam no mesmo post.</li>
    <li><b>A capa ainda chama quem não segue.</b> Ela usa a imagem do macete (a revelação da cena) e anuncia o gancho da questão de hoje no pé do cartão.</li></ul>
  <h3>A legenda</h3><ol class="num">
    <li>"Ontem deu C. A de hoje:" e o gancho.</li><li>Gabarito de ontem: letra, resposta e termos da resposta (só aqui, no D+1).</li>
    <li>Questão de hoje: contexto sem a resposta e palavras-chave neutras em inglês.</li><li>"Vote na enquete ou comente a letra. Gabarito amanhã, no primeiro slide."</li>
    <li>CTA com palavra-chave, sem endereço escrito.</li><li>${esc(P.assinatura.nome)}, ${esc(P.assinatura.crm)}, aviso e hashtags.</li></ol></div>
</div>`);

// 5. stories e conversão
const pal = CV.automacao_dm.palavras;
pg('', `${placa('Stories e conversão ativa', '05')}
<div class="duas">
  <div><h3>Enquete no dia D, quiz no D+1</h3>
  <p>${esc(P.stories.por_que)}</p>
  <div class="stories">${['dia-008/story-gabarito.png', 'dia-009/story-enquete.png'].map((f) => `<img src="${img(path.join(PASTA_INSTAGRAM, 'saida', f))}">`).join('')}<p class="leg">12h05 do dia 9: resultado da enquete do dia 8 e quiz com a letra certa. 12h06: a enquete do dia 9, sem gabarito.</p></div></div>
  <div><h3>Palavra-chave no comentário, link no direct</h3>
  <table class="tab mini"><thead><tr><th>Palavra</th><th>O que chega no direct</th><th>Dias</th></tr></thead><tbody>
    ${pal.map((w) => `<tr><td><b>${esc(w.palavra)}</b></td><td>${esc(w.entrega)}</td><td>${w.dias_com_cta}</td></tr>`).join('')}
  </tbody></table>
  <p class="nota">${esc(CV.regra_dos_links)} Ferramenta: ${esc(CV.automacao_dm.ferramenta.o_que_usar)} Cada mensagem termina com o aviso de privacidade e a palavra SAIR para parar. Textos completos na aba "Automação de DM" da planilha.</p>
  <div class="caixa"><b>CTA por quadro.</b> Segunda e sexta MACETE; terça e quinta SIMULADO; quarta compartilhar (primeira quarta do mês, FACULDADE); sábado debate; domingo EMBARQUE. Na semana de inscrição do desafio, DESAFIO; no dia da live e no sábado antes, LIVE.</div></div>
</div>`);

// 5b. desafio e live
pg('', `${placa('Desafio de 30 dias e live do mês', '05b')}
<div class="duas">
  <div><h3>${esc(CV.desafio.nome)}</h3>
  <table class="tab mini"><thead><tr><th>Edição</th><th>Inscrição</th><th>Desafio</th><th>Encerramento</th></tr></thead><tbody>
    ${CV.desafio.edicoes.map((e) => `<tr><td><b>${e.edicao}</b></td><td>${brc(e.inscricao[0])} a ${brc(e.inscricao[1])}</td><td><b>${br(e.inicio)} a ${br(e.fim)}</b><br><small>dias ${e.dia_inicio} a ${e.dia_fim}</small></td><td>live ${brc(e.live_de_encerramento)}</td></tr>`).join('')}
  </tbody></table>
  <ol class="num">${CV.desafio.regras.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
  <p class="nota">${esc(CV.desafio.por_que_sem_premio)}</p>
  <div class="stories">${['dia-015/story-desafio.png', 'dia-015/desafio-cartela.png'].map((f) => `<img src="${img(path.join(PASTA_INSTAGRAM, 'saida', f))}">`).join('')}<p class="leg">Story do dia 1 do desafio e a cartela que vai no direct.</p></div></div>
  <div><h3>${esc(CV.lives.nome)}: uma por mês</h3>
  <p>${esc(CV.lives.regra_da_data)}</p>
  <div class="chips">${CV.lives.datas.map((d) => `<span><b>${brc(d)}</b> ${esc(CV.lives.horario)}</span>`).join('')}</div>
  <h3>Roteiro de ${CV.lives.duracao_min} minutos</h3><ul class="pontos">${CV.lives.roteiro.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
  <h3>Preparo</h3><ul class="pontos">${CV.lives.preparo.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>
</div>`);

// 5c. Reels semanais
const RS = P.reels_semanais;
const fq = path.join(PASTA_INSTAGRAM, '..', 'reels', 'out', 'semanais', 'capas');
const capasR = ['semana-03.jpg', 'semana-04.jpg'].map((f) => path.join(fq, f)).filter((f) => fs.existsSync(f));
const rDemo = RS.reels.find((r) => r.semana === 3) || RS.reels[0];
const imgJ = (f) => `data:image/jpeg;base64,${b64(f)}`;
pg('', `${placa('Reels semanais', '05c')}
<p class="lead" style="font-size:10.5pt;margin-bottom:3mm">${esc(RS.descricao)}</p>
<div class="duas" style="font-size:9pt">
  <div><table class="tab mini" style="font-size:8pt"><thead><tr><th>Formato</th><th>Semanas</th><th>Como é</th></tr></thead><tbody>
    ${Object.entries(RS.formatos).map(([k, f]) => `<tr><td><b>${esc(f.nome)}</b></td><td>${RS.numeros[k]}</td><td>${esc(f.descricao)}</td></tr>`).join('')}
  </tbody></table>
  <ul class="pontos" style="font-size:7.5pt;line-height:1.22;margin-top:1mm">${RS.regras.map((r) => `<li style="margin-bottom:1mm">${esc(r)}</li>`).join('')}</ul></div>
  <div><div class="stories">${capasR.map((f) => `<img src="${imgJ(f)}" style="height:58mm;object-fit:cover;object-position:top">`).join('')}<p class="leg">Capas das amostras renderizadas: semana 3 (Pegadinha com o dado trocado, questão do dia 17) e semana 4 (Resultado no plano B, questão do dia 23). Também em reels/out/semanais/: semana 1 (POV) e semana 6 (Macete com a volta no Remix de 13/12).</p></div>
  <h3 style="margin-top:2mm">Roteiro da semana ${rDemo.semana}: troque um dado e a resposta muda</h3><table class="tab mini" style="font-size:7.6pt;margin-bottom:2mm"><tbody>${rDemo.cenas.map((c) => `<tr><td class="dsem" style="font-size:10pt;padding:1mm 2mm">${c.inicio_s}s</td><td style="padding:1mm 2mm">${esc(c.texto_tela.replace(/\*/g, ''))}${c.opcoes ? `<br><small>${esc(c.opcoes.join(' · '))}</small>` : ''}</td></tr>`).join('')}</tbody></table>
  <p class="nota" style="font-size:7.6pt">${RS.reels.length} ganchos diferentes, um por questão. Ilustrações do carrossel entram no lugar do avatar quando a imagem existe. Áudio: ${esc(rDemo.audio.sugestao)}</p></div>
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
  ['Volta no D+1', 'quiz das 12h05 / votos na enquete de ontem', 'Mede se a recompensa primeiro funciona.'],
  ['Reels', 'alcance de não seguidores e retenção aos 3 s, por formato', 'Escolher o formato que mais traz gente nova.'],
  ['Palavras-chave', 'comentários com cada palavra e cliques com utm_medium=dm', 'Qual CTA converte.'],
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
const H = P.rotina.horas;
pg('', `${placa('Produção para uma pessoa', '08')}
<p class="lead">O conteúdo do ano já está escrito e validado. Toda semana sobra gerar as imagens, renderizar, agendar e aparecer nos stories. O que dá para fazer de uma vez vai para um dia de lote: a ${esc(P.rotina.dia_do_lote)}. ${esc(P.rotina.antecedencia)}</p>
<table class="tab mini" style="font-size:8.2pt"><thead><tr><th>Dia</th><th>Modo completo</th><th>Modo enxuto</th></tr></thead><tbody>
  ${P.rotina.semana.map((x) => `<tr><td class="dsem">${CURTO[x.dia]}</td><td>${x.completo.map(esc).join('<br>')}</td><td>${x.enxuto.map(esc).join('<br>')}</td></tr>`).join('')}
</tbody></table>
<div class="nums-prod"><div><b>${(H.completo.total_min / 60).toFixed(1).replace('.', ',')} h</b><span>por semana no completo</span></div><div><b>${(H.enxuto.total_min / 60).toFixed(1).replace('.', ',')} h</b><span>por semana no enxuto</span></div><div><b>${H.completo.imagens_por_semana} / ${H.enxuto.imagens_por_semana}</b><span>imagens por semana</span></div><div><b>${H.completo.stories_por_dia} / ${H.enxuto.stories_por_dia}</b><span>stories por dia</span></div></div>
<p class="nota" style="margin-top:3mm">${esc(P.rotina.quando_usar_o_enxuto)} ${esc(H.implantacao_texto || '')} ${esc(H.primeiras_semanas || '')} A conta minuto a minuto está na aba "Rotina semanal" da planilha.</p>`);

// 9. calendário mês a mês
const reelPorData = new Map((P.reels_semanais?.reels || []).map((r) => [r.publicar_em, r]));
const marcas = (d) => {
  const m = [];
  const r = reelPorData.get(d.data);
  if (r) m.push(`<span class="tag rl">reel ${esc(r.formato_nome.toLowerCase())}</span>`);
  if (d.live) m.push('<span class="tag lv">live 20h30</span>');
  if (d.desafio && d.desafio.dia_do_desafio === 1) m.push(`<span class="tag ds">desafio ${d.desafio.edicao} começa</span>`);
  else if (d.desafio && d.desafio.dia_do_desafio === 30) m.push(`<span class="tag ds">desafio ${d.desafio.edicao}: dia 30</span>`);
  return m.length ? ' ' + m.join(' ') : '';
};
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
const capaCal = `${placa('Calendário resumido', '09')}<p class="lead">Um mês por página. <span class="tag s1">S1</span> Step 1, <span class="tag s2">CK</span> Step 2 CK, <span class="tag rx">remix</span> revisão de domingo, <span class="tag ac">acolhedor</span> data sensível sem piada (linhas cinza e azuis); a estrela marca o gancho de data. <span class="tag rl">reel</span> Reel da sexta, <span class="tag lv">live</span> live do mês, <span class="tag ds">desafio</span> começo e fim de cada edição do desafio. A letra certa não aparece aqui, para o guia poder circular na equipe sem gabarito.</p>`;
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
  const linhas = lista.map((d) => `<tr class="${d.remix_de ? 'rx' : ''} ${d.tom === 'acolhedor' ? 'ac' : ''}"><td class="dt">${brc(d.data)}</td><td class="ds">${CURTO[d.dia_semana]}</td><td class="nd">${num3(d.dia)}</td><td class="qd">${QCURTO[d.quadro]}</td><td><span class="tag ${/2/.test(d.step) ? 's2' : 's1'}">${/2/.test(d.step) ? 'CK' : 'S1'}</span></td><td class="tp">${esc(d.remix_de ? 'Remix: ' + d.remix_de.map((x) => dias[x - 1].topico).join(', ') : d.topico)}${d.personagem ? ` <small>· ${esc(d.personagem)}</small>` : ''}${marcas(d)}</td><td class="gd">${d.gancho_data ? `★ ${esc(d.gancho_data.split(/[.(:]/)[0].slice(0, 46))}` : ''}</td></tr>`).join('');
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
.tag{display:inline-block;white-space:nowrap;font-family:"Overpass Mono";font-weight:600;font-size:6.6pt;padding:.2mm 1.2mm;border-radius:1mm;color:#fff;background:var(--navy)}
.tag.s2{background:var(--vermelho)}.tag.rx{background:#8c98a8}.tag.ac{background:#5b7fb0}.tag.rl{background:#8a6a00}.tag.lv{background:var(--verde)}.tag.ds{background:#00643a}
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
