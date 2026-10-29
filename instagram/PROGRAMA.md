# Questão de Embarque: uma questão por dia no Instagram

Programa de 365 dias de questões de USMLE Step 1 e Step 2 CK no Instagram da Road to America, de segunda-feira 02/11/2026 a segunda-feira 01/11/2027. Cada dia tem uma questão (D) e a explicação sai no dia seguinte (D+1), abrindo o post que traz a questão nova. Toda sexta sai um Reel, todo mês uma live de correção, e duas edições do Desafio 30 Dias puxam o hábito. O humor existe para fixar o conceito: cada piada carrega um mnemônico, uma analogia ou um personagem que o seguidor vai lembrar na hora da prova.

- Calendário completo: `instagram/calendario.json` (365 dias, um objeto por dia).
- Banco de conceitos e datas especiais: `instagram/ferramentas/dados-calendario.js`.
- Gerar de novo: `node instagram/ferramentas/gerar-calendario.js`.
- Validar o calendário: `node instagram/ferramentas/validar-calendario.js` (datas, proporções, unicidade, remix, datas especiais, travessões e comparação com o banco privado).
- Os 365 dias escritos: `instagram/dias/dias-XXX-YYY.json`. Validar o ano inteiro: `node instagram/ferramentas/validar-dias.mjs` (calendário, duplicidade, letras, pistas da resposta, quiz, enquete sem achado da vinheta, alternativa certa que não pode ser a única mais longa, intruso e repetição nos remixes, teto de 15% por personagem, cenas carregadas, datas sensíveis, promessas, prompts, Reels, MACETE do direct e `render.mjs --so-conferir` com o banco privado).
- Folhas de referência dos personagens: `instagram/personagens-referencia.json` (seção 3.1).
- Texto por semana dos Reels: `instagram/ferramentas/reels-roteiro.json`; números reais da enquete para o formato Resultado: `instagram/resultados-enquete.json` (seção 13).
- Programa consolidado: `instagram/programa-365.json`; planilha de produção: `entregas/instagram-365-dias.xlsx`; guia: `entregas/instagram-programa-guia.pdf`.
- Conversão ativa (palavras-chave, resposta automática, CTA por quadro, desafio, lives, stories, carrossel e rotina): `instagram/conversao.json`; para aplicar nos dias: `node instagram/ferramentas/conversao-ativa.mjs`.
- Reels semanais: `instagram/reels-semanais.json` (`node instagram/ferramentas/gerar-reels-semanais.mjs`), renderizados em `reels/` (`npm run render:semanais`).

## 1. Números do calendário

| | Step 1 | Step 2 CK | Total |
|---|---|---|---|
| Dias de conteúdo novo | 158 | 155 | 313 |
| Domingos de remix | 39 | 13 | 52 |
| Total | 197 (54,0%) | 168 (46,0%) | 365 |

A divisão fica em 54/46, perto dos 55/45 pedidos. Ela não chega a 55% exatos porque a farmacologia do Step 1 tem teto de 20% no outline e a sexta não pode ser só Step 1; os domingos compensam (39 dos 52 remixes são de Step 1).

Os 313 dias de conteúdo novo seguem as faixas oficiais de `banco-privado/referencia-outline.json`. Todos os sistemas e todas as disciplinas ficam dentro da faixa (o validador imprime a tabela completa). Exemplos: Step 1 com reprodutor e endócrino em 13,3% (faixa 12 a 16), respiratório e renal 12,0% (11 a 15), bioestatística 5,7% (4 a 6), patologia 48,7% (45 a 55), fisiologia 32,3% (30 a 40); Step 2 CK com ética e segurança do paciente 14,8% (10 a 15), cardiovascular 8,4% (6 a 12), clínica médica 58,1% (55 a 65), pediatria 19,4% (17 a 27), GO 12,3% (10 a 20) e psiquiatria 10,3% (10 a 15). Disciplinas contam a principal e as secundárias, como o próprio USMLE faz (por isso a soma passa de 100%). Cirurgia usa faixa ampla porque as fontes oficiais divergem (20 a 30% no relatório de 2025, 5 a 15% no de 2026). A linha "Nutrition 15 a 20%" ainda não foi confirmada e não entrou na conta; os conceitos de nutrição aparecem marcados como "Bioquímica e nutrição".

Nenhum conceito se repete. Cada conceito tem um rótulo em inglês único (`conceito`) e uma chave (`chave`).

## 2. Quadros semanais

| Dia | Quadro | Step | Conteúdo | Assinatura visual |
|---|---|---|---|---|
| Segunda | **Bicho de Segunda** | Step 1 | Microbiologia e imunologia | Macrô em cenário que muda toda semana, com a comanda de boteco em branco no bolso como assinatura (o sistema do dia entra no template) |
| Terça | **Plantão de Terça** | Step 2 CK | Clínica médica: diagnóstico e próximo passo | Dona Térmica, a garrafa de café do plantão, com um relógio sem números nas 3 da manhã como assinatura (o "NEXT STEP" entra no template) |
| Quarta | **Quarta do Porquê** | Step 1 | Mecanismos: patologia, fisiologia, anatomia, bioquímica, genética, histologia | Mito, Seu Néfron, Capitã Plaqueta ou, quando nenhum deles combina, Seu Allen explicando a engrenagem em corte, estilo manual de montagem |
| Quinta | **Rodízio de Quinta** | Step 2 CK | Pediatria, GO, psiquiatria e cirurgia em rodízio, como no internato e na churrascaria | Garçom Espetinho servindo especialidades no espeto, em cenário variado; a plaquinha verde e vermelha fica de lado na questão e mostra o verde na explicação |
| Sexta | **Sextou na Farmácia** | Step 1 em 31 sextas, Step 2 CK em 21 | Farmacologia (mecanismo e efeito adverso) e farmacoterapia (escolha do remédio) | Tia Meia-Vida atrás do balcão de uma farmácia de interior, com ampulheta |
| Sábado | **Sábado Sem Viés** | Step 1 em 22 sábados, Step 2 CK em 30 | Ética, comunicação, segurança do paciente e bioestatística | Viés escondido atrás de uma tabela 2x2, ou uma balança de tribunal desenhada como placa de trânsito |
| Domingo | **Remix de Domingo** | Step 1 em 39 domingos, Step 2 CK em 13 | Revisão cumulativa de três conceitos já vistos, com o dia original marcado | Vinheta clínica nova que junta os conceitos da semana; um vinil pequeno no canto é a assinatura e o personagem de um dos conceitos ocupa a cena; o selo "visto no dia X" entra no slide |

### Como o espaçamento funciona

1. **D+1**: a explicação sai no dia seguinte, junto com a questão nova.
2. **Remix de domingo**: cada remix junta três conceitos do mesmo Step, um de cada janela: da semana que passou (1 a 6 dias), de 2 a 5 semanas atrás e de 2 a 4 meses atrás. O mesmo conceito sobe de janela em janela, com intervalos que só aumentam. No calendário atual, a primeira revisão vem em mediana 6 dias depois do post original, a segunda 28 dias depois da primeira e a terceira 49 dias depois da segunda. Em 40 das 42 cadeias com duas ou mais revisões, cada intervalo é maior que o anterior; as duas exceções são remixes temáticos de data especial, que escolhem os conceitos pelo tema.
3. **Intercalação**: os sistemas se espalham pelo ano em proporção às faixas, e o gerador evita repetir o mesmo sistema em dois dias seguidos do mesmo Step (sobraram 7 repetições em 313 dias, todas em dias de data especial, em que o tema fixa o conteúdo, como a semana de estreia no Novembro Azul).
4. **Remix na prática**: a pergunta do domingo é uma vinheta clínica nova, no formato do USMLE, que junta dois ou três conceitos já vistos num mesmo paciente (por exemplo, uma miastenia controlada que piora depois da rifampina junta o dia 22 e o dia 26). Nada de "Which statement is correct?" nem de grupo de estudo com cartões. As quatro alternativas são da mesma categoria (quatro mecanismos, quatro diagnósticos ou quatro condutas; também valem quatro micro-organismos, quatro proteínas ou a triagem de quatro pacientes estáveis, "qual atender primeiro", como no dia 245), e o conceito revisado que não cabe na vinheta volta no macete como bônus. No slide, a alternativa que vem de um dia revisado leva o selo "visto no dia X"; o validador avisa quando um dos três dias ficou só no macete, e esse aviso é esperado quando a homogeneidade das alternativas pede.

## 3. Personagens recorrentes

Seis personagens, sempre com o mesmo desenho. Ilustração editorial colorida, sombreado limpo de vetor, contorno navy grosso e arredondado. Paleta do site (`assets/css/base.css`): navy `#0f2747`, vermelho `#b0243a`, papel `#f3f5f2`, verde `#1d8a4b` e amarelo `#f1c232`, mais branco. Nenhum personagem imita estilo de anime, de estúdio ou de série conhecida, e nenhum objeto da cena leva texto: crachás, copos, carimbos e placas saem em branco, e as palavras entram no template.

| Personagem | Quem é | Descrição visual fixa | Onde aparece | Bordão |
|---|---|---|---|---|
| **Macrô** | Macrófago guloso e generoso, "come" o invasor e apresenta o pedaço aos linfócitos como quem mostra a comanda | Bolha arredondada lilás clara com pseudópodes curtos, olhos grandes e simpáticos, guardanapo xadrez vermelho e branco no pescoço, crachá em branco num cordão | Bicho de Segunda, remix de micro e imuno | "Comi, mostrei, avisei." |
| **Mito** | Mitocôndria cansada de plantão, faz ATP sem parar | Feijão alaranjado com cristas internas aparentes, olheiras, jaleco branco amassado, copo de café sem rótulo, crachá em branco | Metabolismo, bioquímica, apoptose, estatinas e metformina | "Sem oxigênio eu não trabalho." |
| **Seu Néfron** | Rim burocrata que confere tudo antes de liberar | Feijão vinho com gravata navy, óculos de leitura na ponta do nariz, carimbo na mão, pilha de formulários em branco | Renal, ácido-base, diuréticos, eletrólitos | "Sem carimbo, não sai." |
| **Capitã Plaqueta** | Agente de trânsito do sangue, organiza a coagulação como um cruzamento | Disco amarelo sorridente com colete refletivo verde, apito, quepe navy, cones de trânsito ao lado; os fatores da coagulação são carrinhos | Hematologia, coagulação, anticoagulantes, transfusão | "Parou, colou, coagulou." |
| **Tia Meia-Vida** | Farmacêutica de balcão de interior, divide tudo pela metade | Ampulheta simpática com braços, óculos de armação vermelha, avental branco com canetas no bolso, coque grisalho; a areia é o remédio indo embora | Sextou na Farmácia | "Cinco meias-vidas e ninguém lembra mais." |
| **Viés** | Fantasminha da estatística, distorce resultados quando ninguém está olhando | Lençol branco com bainha em zigue-zague, olhos navy, lupa na mão, sempre meio escondido atrás de uma tabela 2x2 ou de um gráfico em branco | Sábado Sem Viés, Halloween | "Se você não randomizou, eu entrei." |

Regras dos personagens: nenhum deles adoece, sofre ou faz piada com paciente. Eles são o órgão, a célula ou a ideia, e o humor sai da burocracia, do cansaço ou da teimosia deles. O ônibus "Road to America" (navy com faixa verde e amarela) leva os seis nos posts de data especial e no dia 365. O garçom do Rodízio de Quinta é um mascote de cabeça redonda, de camisa branca, colete vermelho e gravata-borboleta navy, nunca uma pessoa real.

**Descrição fixa em inglês** (entra igual em todo prompt, depois de "Recurring character: Nome,"):

- Macrô: *a round pale-lilac macrophage blob with short stubby pseudopods, big friendly eyes, a red-and-white checkered napkin tied around the neck and a small blank ID badge on a lanyard*
- Mito: *a tired orange bean-shaped mitochondrion with visible inner cristae, soft dark under-eye circles, a wrinkled white lab coat, a blank coffee cup in hand and a small blank ID badge*
- Seu Néfron: *a wine-red kidney-bean character with a navy necktie, reading glasses on the tip of his nose, a rubber stamp in one hand and a neat stack of blank paper forms*
- Capitã Plaqueta: *a cheerful yellow disc-shaped platelet character wearing a green reflective safety vest, a whistle and a navy cap, with small traffic cones beside her*
- Tia Meia-Vida: *a friendly hourglass-shaped pharmacist character with arms, red-framed glasses, a white apron with pens in the pocket and a gray hair bun; the sand inside her hourglass body is the medicine slowly draining away*
- Viés: *a small white bedsheet ghost with a zigzag hem, navy eyes and a magnifying glass, always half hidden behind a blank 2x2 table or chart*

### Anfitriões dos quadros

Quatro quadros não têm órgão nem célula que combine com todo tema (o plantão de clínica, a quarta de anatomia e neuro, o rodízio de especialidades e o sábado de ética). Para esses dias entra um anfitrião fixo do quadro, com desenho e bordão próprios. Ele não ocupa o campo `personagem` do calendário (que continua com os seis acima); vai no campo `anfitriao` do dia e no prompt, sempre com a mesma descrição, depois de "Recurring character: Nome,". Quando o tema pede um dos seis (o Seu Néfron numa hipercalemia, a Capitã Plaqueta numa PTT), o personagem fixo ganha o dia e o anfitrião fica de fora ou aparece pequeno, de figurante.

| Anfitrião | Quadro | Quem é | Descrição visual fixa | Bordão |
|---|---|---|---|---|
| **Dona Térmica** | Plantão de Terça | A garrafa térmica de café do plantão. Já viu de tudo às 3 da manhã, cochila em pé e acorda certa. É a autoironia de quem estuda para o Step depois de 12 horas de plantão | Garrafa térmica vermelha de pressão, tampa navy, olhos de sono mas espertos, estetoscópio no pescoço, prancheta em branco | "Já vi esse caso às 3 da manhã." |
| **Seu Allen** | Quarta do Porquê | A chave Allen que vem na caixa do móvel. Desmonta qualquer mecanismo e sempre acha a peça que sobrou | Chavinha Allen prateada em forma de L, olhos grandes e redondos, avental navy de marceneiro, lápis vermelho atrás da "orelha" | "Sobrou peça? Então faltou mecanismo." |
| **Garçom Espetinho** | Rodízio de Quinta | O garçom do rodízio, que passa servindo condutas no espeto (o mascote que já existia, agora com nome e bordão) | Mascote de cabeça redonda, camisa branca, colete vermelho e gravata-borboleta navy, nunca uma pessoa real | "Vai uma conduta aí, doutor?" |
| **Dona Bússola** | Sábado Sem Viés (ética e comunicação) | A bússola de bolso do consultório. Nas questões de ética, o ponteiro gira com a pressão da família, do convite da indústria ou do medo de processo, e sempre volta para o mesmo lugar: o paciente. Divide a cena com o Viés quando o tema é um viés de conduta (conflito de interesses, erro escondido) | Bússola de bolso redonda, caixa amarela com aro navy, ponteiro vermelho no mostrador claro, olhos grandes e simpáticos, lencinho verde no pescoço e um caderninho em branco | "Meu norte é o paciente." |

Descrição fixa em inglês:

- Dona Térmica: *a red pump-top coffee thermos character with a navy cap, sleepy but sharp eyes, a small stethoscope around her neck and a blank clipboard*
- Seu Allen: *a small silver L-shaped hex key character with big round eyes, a navy carpenter apron and a tiny red pencil tucked behind where an ear would be*
- Garçom Espetinho: *a friendly cartoon churrascaria waiter drawn as a simple round-headed mascot (not a real person), white shirt, red vest and navy bow tie*
- Dona Bússola: *a round brass pocket-compass character with a yellow case and navy rim, a red needle on her pale face, big friendly eyes, a small green scarf and a tiny blank notebook*

Quando o calendário não traz personagem e um dos seis combina com o tema (a Tia Meia-Vida numa sexta de farmacoterapia do Step 2, o Macrô num remix de micro, o Viés num conflito de interesses), ele entra pelo campo `anfitriao`, com a mesma descrição fixa. O slide do macete usa `personagem` ou, na falta dele, `anfitriao`, e o campo `explicacao.macete.fala` troca o bordão por uma fala do dia quando a piada pede.

**Assinatura pequena, cena variada.** Cada quadro guarda só um detalhe de assinatura no canto da cena, e a cena-base muda toda semana (nenhuma se repete no mesmo mês):

- Bicho de Segunda: a comanda de boteco em branco no bolso do Macrô (o boteco não precisa aparecer).
- Plantão de Terça: um relógio de parede sem números com os ponteiros nas 3 da manhã. A placa verde de três saídas sai de cena.
- Quarta do Porquê: setinhas de manual de montagem num canto da cena, nunca apontando a peça que decide a questão.
- Rodízio de Quinta: a plaquinha verde e vermelha do rodízio.
- Sextou na Farmácia: a ampulheta da Tia Meia-Vida (ela mesma).
- Sábado Sem Viés: a tabela 2x2 em branco, nem que seja pequena num quadro na parede.
- Remix de Domingo: um vinil pequeno num canto, com o personagem de um dos conceitos revisados no centro. O toca-discos com três discos sai de cena.

**Humor que vai para o grupo da turma.** Cada dia tenta ter uma tirada com punchline (a frase que dá vontade de mandar para o grupo), de preferência com piada interna de quem estuda para o USMLE (o NBME que esconde a pista na última linha, o "most likely" que nunca é o mais provável para quem está cansado, o Anki com 900 revisões atrasadas, a vinheta lida às 2 da manhã depois do plantão) ou referência brasileira atual (rodízio, fila do pão, Pix, grupo da família, bloco de Carnaval, VAR). A piada é sempre do estudante, da prova, do órgão ou do remédio, nunca do paciente.

**Ganchos e stories.** O gancho da capa é específico e curioso, ligado à cena do dia ("Seu Néfron foi buscar pão de sal e a padaria só tinha doce"), nunca genérico ("Qual é o próximo passo?"), nunca começa com "Remix" e nunca dá o nome da doença nem a pista que decide.

**Enquete do dia D: uma regra só.** A enquete das 12h06 pergunta sempre "Qual é a sua letra?" (`templates/config.json`, `enquete.pergunta`). As quatro opções são as alternativas curtas (`questao.alternativas[X].quiz`), sempre em inglês da prova, com o termo que o USMLE usa, até 30 caracteres, e sem nenhum achado da vinheta (nada de "Cálcio alto, fósforo baixo e PTH alto?"): quem quiser responder precisa ler a vinheta. A pergunta com o achado decisivo, até 80 caracteres ("Hematêmese com PA 86/52 e FC 124: o que fazer primeiro?"), fica em `quiz.resumo` e só aparece depois do gabarito: no quiz de segunda chance das 12h05 do D+1 e no Reel da sexta. O validador bloqueia pergunta diferente, opção em português e número da vinheta na opção.

**Alternativas sem padrão de prova.** A certa nunca é a única alternativa mais longa, nem no texto nem na opção da enquete (antes da revisão, a mais longa acertava em 39,5% das vezes). O validador também mede a mais curta (hoje a certa é a única mais curta em 19,6% dos dias com uma mais curta, perto do acaso de 25%).

**Cena enxuta para o feed.** A imagem aparece do tamanho de um polegar no celular. Cada cena da questão tem no máximo 3 elementos principais, um personagem em ação e fundo limpo; as quatro alternativas nunca viram quatro objetos na cena, e nenhum personagem, seta ou objeto aponta a resposta. Todo prompt traz a frase "Clean, uncluttered background with no more than three main elements." O validador estima os elementos da cena em português (artigos e quantidades, sem contar a assinatura do quadro) e bloqueia acima de 5 ou acima de 60 palavras.

**Rodízio do elenco.** Nenhum personagem passa de 15% do ano como personagem do dia (`personagem` ou `anfitriao`), nem de 15% das imagens de questão. No calendário atual: Tia Meia-Vida 48 dias (13,2%), Macrô 44 (12,1%), Garçom Espetinho 44 (12,1%), Dona Térmica 40 (11,0%), Capitã Plaqueta e Seu Allen 37 (10,1%), Seu Néfron 35 (9,6%), Viés 31 (8,5%), Mito 28 (7,7%) e Dona Bússola 19 (5,2%). O validador imprime a tabela por quadro.

**Base do prompt de imagem** (Higgsfield, modelo Nano Banana Pro, resolução 2k, proporção 4:5). Os 730 prompts de `instagram/dias/` seguem esta ordem, e `ferramentas/normalizar-dias.mjs` mantém o começo e o fim iguais em todos:

> Colorful editorial cartoon illustration, clean vector-like shading, thick rounded navy outlines, Road to America brand palette of navy #0f2747, red #b0243a and white, with small green #1d8a4b and yellow #f1c232 accents, on a flat paper background in #f3f5f2. Recurring character: [nome], [descrição fixa em inglês]. Scene: [cena do dia]. [tom: humor leve ligado ao conceito ou, nas datas sensíveis, calm, gentle and respectful mood, no gags]. Clean, uncluttered background with no more than three main elements. Keep the character identical to the attached reference sheet of [nome]: same body shape, colors, outfit, proportions and outline thickness. Vertical 4:5 composition: main character and key elements in the upper half, the lower third left as a smooth plain floor with no details, top corners kept clear. No text, no letters, no numbers, no logos, no watermark, no real people, no patients, no blood, no gore.

Quando o personagem aparece só pelo nome na cena (comum na imagem do macete), `normalizar-dias.mjs` acrescenta o cabeçalho "Recurring character" com a descrição fixa; quando a imagem do macete não cita ninguém, ela herda o elenco da imagem da questão, porque é o "depois" da mesma cena.

A imagem da questão (dia D) mostra a situação e nunca a resposta. A imagem da explicação (D+1) revela o macete com a mesma cena, como um "antes e depois".

O texto vai sempre no template (Barlow Condensed nos títulos, Barlow no corpo, Overpass Mono nos rótulos de dia e de letra), nunca dentro da imagem gerada.

### 3.1 Consistência dos personagens: folha de referência e imagem de referência

Descrição em texto não basta para o Nano Banana Pro desenhar o mesmo Macrô 45 vezes. O método tem três partes:

1. **Uma folha de referência (model sheet) por personagem, gerada uma vez antes da estreia.** São 10 folhas: Macrô, Mito, Seu Néfron, Capitã Plaqueta, Tia Meia-Vida, Viés, Dona Térmica, Seu Allen, Garçom Espetinho e Dona Bússola. No Higgsfield, modelo Nano Banana Pro (`nano_banana_pro`), resolução 2k, proporção 16:9, com este prompt (troque o nome e a descrição fixa em inglês da seção 3):

   > Colorful editorial cartoon illustration, clean vector-like shading, thick rounded navy outlines, Road to America brand palette of navy #0f2747, red #b0243a and white, with small green #1d8a4b and yellow #f1c232 accents, on a flat paper background in #f3f5f2. Character model sheet of one recurring cartoon character: [nome], [descrição fixa em inglês]. Show the same character on one sheet, evenly spaced on the flat paper background: a full-body front view, a full-body side profile view, a full-body three-quarter view, and a row of four head close-ups with different expressions (happy, surprised, tired, focused). Identical proportions, colors, outfit and outline thickness in every view, neutral standing pose in the three turnarounds, only the fixed props of the character. Wide 16:9 sheet. No text, no letters, no numbers, no logos, no watermark, no real people, no patients, no blood, no gore.

   Os 10 prompts completos já estão prontos em `instagram/personagens-referencia.json` (campo `prompt_folha`) e na aba "Personagens" da planilha. Gere 2 a 4 variações, escolha a que bate com a descrição fixa (cor, acessórios, proporção), salve em `instagram/imagens/referencias/<nome>.png` (por exemplo `macro.png`, `capita-plaqueta.png`) e faça o upload no Higgsfield (`media_upload`). Anote o `media_id` de cada folha no mesmo JSON: `normalizar-dias.mjs` preserva o que foi preenchido à mão. Folha aprovada não muda mais no ano; se mudar, refaça as imagens que ainda não foram ao ar.

2. **A folha entra como imagem de referência em todo prompt.** Na geração de cada imagem do dia, passe em `medias` a folha de cada personagem da cena, com o papel `image_references` (o único papel de mídia que o Nano Banana Pro aceita no Higgsfield): `{"model": "nano_banana_pro", "prompt": "...", "aspect_ratio": "4:5", "resolution": "2k", "medias": [{"role": "image_references", "value": "<media_id da folha>"}]}`. O prompt já pede "Keep the character identical to the attached reference sheet of [nome]".

3. **Cada dia diz quais folhas usar.** O campo `personagem_referencia` de cada dia (gerado por `normalizar-dias.mjs` a partir dos prompts) lista os personagens da imagem da questão (`questao`) e da imagem do macete (`macete`), os arquivos das folhas (`arquivos`) e o bloco `higgsfield.medias` pronto para copiar, com o lugar do `media_id`. A coluna "Referência do personagem" da aba "Prompts das imagens" da planilha mostra o mesmo. No ano: 358 dias com um personagem nas duas imagens, 5 com dois, 2 sem personagem fixo (dias acolhedores de ética).

Conferência antes de aprovar uma imagem: silhueta, cor e acessórios iguais aos da folha; nenhum texto; nenhuma seta ou personagem apontando a resposta; no máximo 3 elementos principais.

## 4. Rotina D e D+1

**Horário de Brasília. Feed às 12h00, todos os dias** (a hora do almoço de quem está no plantão ou no internato). Nas primeiras quatro semanas, testar 20h30 nas terças e quintas e ficar com o horário que der mais salvamentos por alcance. O Reel da semana sai na sexta às 19h00 (seção 13).

### O carrossel: a recompensa primeiro

**Escolha: um post por dia, com o gabarito de ontem abrindo o carrossel e a questão nova logo depois.** Antes, quem voltava para ver a resposta precisava passar por três slides da questão nova até chegar no slide 4. Agora a primeira coisa que aparece é a letra de ontem carimbada.

Por que um post e não dois:

1. **O hábito precisa de recompensa rápida.** Quem respondeu ontem abre o post para saber se acertou. Ver a letra no primeiro slide fecha o ciclo e deixa a pessoa com vontade de responder a de hoje, que vem quatro slides depois, no mesmo gesto de arrastar.
2. **Um post por dia cabe na rotina de uma pessoa.** Dois posts diários seriam 730 publicações no ano, com duas legendas, dois horários e o dobro de comentários para responder. A produção de imagens continua a mesma; o trabalho que cresceria seria o de agendar e moderar.
3. **O comentário com a letra fica num só lugar.** A discussão de ontem e o palpite de hoje dividem o mesmo post, o que soma sinais para o algoritmo em vez de dividir.
4. **A capa continua chamando quem não segue.** A capa do gabarito usa a imagem do macete (a revelação da cena de ontem, com o personagem) e traz no pé do cartão a chamada da questão de hoje, com o gancho dela. Quem cai no post pelo Explorar vê uma cena engraçada, uma letra carimbada e a promessa de uma questão nova.

Quando separar em dois posts: só em data especial que pede um post próprio (estreia, Match Day, encerramento do dia 365) ou se as métricas mostrarem, depois de oito semanas, que o alcance de não seguidores dos posts com capa de gabarito ficou abaixo do das capas de questão (compare na planilha).

**Modo completo (8 slides, 1080x1350):**

1. **Resposta de ontem**: imagem do macete de ontem, chip "RESPOSTA DE ONTEM", carimbo com a letra, a resposta e, no pé, "Depois do macete, a de hoje" com o gancho da questão nova.
2. Por que a certa está certa, em português, com os termos-chave em inglês.
3. Por que cada alternativa errada está errada (uma linha por letra).
4. Macete com o personagem e o cartão de revisão.
5. Capa da questão de hoje: imagem anedótica, quadro, Step e número do dia ("DIA 008 / STEP 1 / BICHO DE SEGUNDA").
6. Vinheta em inglês (até 60 palavras) e alternativas A a D.
7. Responda: "Vote na enquete dos stories ou comente a letra. Gabarito amanhã, no primeiro slide."
8. CTA do dia com a palavra-chave (seção 9), em cartão de embarque, e a assinatura com CRM.

**Modo enxuto (6 slides):** resposta de ontem, por que a certa está certa, macete sem imagem nova (avatar do personagem e texto), capa de hoje, vinheta e responda com o CTA na última linha. O render gera as duas versões todo dia (`post-do-dia/` e `post-do-dia-enxuto/`).

No dia 1 (02/11/2026) o post tem só a questão (4 slides no completo, 3 no enxuto). A explicação do dia 365 sai em 02/11/2027, num post de encerramento com a retrospectiva do ano.

**Legenda** (português, termos em inglês entre parênteses na primeira vez), na mesma ordem dos slides:

1. Primeira linha: "Ontem deu C. A de hoje:" e o gancho da questão nova.
2. Gabarito de ontem (a partir do dia 2): "Gabarito de ontem (dia N): letra X, resposta" e os termos da resposta, tirados de `explicacao.termos` (ex. do dia 8, no post do dia 9: *X-linked agammaglobulinemia, Bruton tyrosine kinase, CD19, maternal IgG*). Os termos da resposta só aparecem aqui, no D+1.
3. "Questão de hoje (dia N)" e o contexto em duas ou três linhas, sem dar a resposta.
4. "Vote na enquete dos stories ou comente A, B, C ou D. O gabarito sai amanhã às 12h, no primeiro slide do post."
5. Palavras-chave em inglês, três a cinco, **neutras**: sinais, exames e contexto da vinheta, nunca o nome da resposta (ex. do dia 8: *recurrent otitis media, low immunoglobulins, flow cytometry, primary immunodeficiency*). Ficam em `legenda.palavras_chave` e em `ferramentas/palavras-chave-neutras.json`.
6. CTA do dia com palavra-chave (seção 9). **Sem endereço escrito.**
7. Linha do desafio, quando houver (seção 10).
8. Assinatura: Dr. Getúlio Bernardo Morato Filho, CRM-DF 13610. Especialidade só com RQE conferido.
9. Aviso fixo curto: "Conteúdo educacional para a prova. Condutas seguem as diretrizes dos EUA cobradas no USMLE e podem diferir das brasileiras."
10. Hashtags (5 a 8): #USMLE #USMLEStep1 ou #USMLEStep2CK #MedicinaNosEUA #RoadToAmerica #IMG #QuestaoDoDia e uma do sistema.

O texto completo da explicação de ontem (`legenda_explicacao_pt`) vai como primeiro comentário fixado do post, também sem endereço: o CTA dele é a frase com palavra-chave do dia em que ele é publicado.

**Exemplo completo (dia 8, segunda-feira 09/11/2026, Bicho de Segunda)**

> A 9-month-old boy has had recurrent otitis media and two pneumonias since age 6 months. Tonsils are tiny and no lymph nodes are palpable. Serum IgG, IgA and IgM are markedly decreased. Flow cytometry shows almost no CD19+ cells; T-cell counts are normal. A defect in which protein is most likely?
>
> A. CD40 ligand · B. Adenosine deaminase · C. Bruton tyrosine kinase · D. NADPH oxidase

Capa: "A escola dos linfócitos B está de *portas* fechadas. Por quê?". Imagem da questão (sem texto e sem a resposta): Macrô na porta do boteco dos micróbios mostra o pedaço de um invasor, mas o balcão dos anticorpos está vazio, com as banquetas viradas; em cima do balcão, um presente embrulhado e uma ampulheta quase no fim; no quintal, as bolinhas T brincam normalmente. Legenda do dia 8: contexto sem a resposta e palavras-chave neutras (*recurrent otitis media, low immunoglobulins, flow cytometry, primary immunodeficiency*).

Explicação no dia 9, nos slides 1 a 4 do post: C. Sem BTK, o pré-B não amadurece, faltam células B e todas as imunoglobulinas. As infecções começam quando a IgG da mãe acaba, por volta dos 6 meses. Imagem do macete (que também é a capa do post do dia 9): a escolinha das células B de portão trancado, porque a chave dourada sumiu do gancho, e o presente da mãe já aberto e vazio. Mnemônico: "B de Bruton, de BTK, de B cell e de boy" (ligada ao X). A é hiper-IgM (IgM normal ou alta), B é SCID por ADA (faltam também células T) e D é doença granulomatosa crônica (B e imunoglobulinas normais). Legenda do dia 9: abre com "Ontem deu C", traz a letra C e os termos da resposta (*X-linked agammaglobulinemia, Bruton tyrosine kinase, CD19, maternal IgG*) e depois apresenta a questão do dia 9.

## 5. Formato das questões

- **Original**, escrita do zero a partir do conceito do calendário. Não copiar nem adaptar itens do banco privado de 1000 questões (produto pago), nem de NBME, UWorld, AMBOSS, livros ou outros perfis. O validador confere que nenhum conceito do calendário aparece com texto idêntico no banco privado; ao escrever as vinhetas, faça a mesma conferência (vinheta, alternativas e explicação).
- **Inglês do USMLE**: vinheta clínica curta (até 60 palavras), pergunta única no fim, uma só resposta certa.
- **Quatro alternativas (A a D)**, para caber no adesivo de quiz dos stories, que aceita no máximo quatro. A letra certa fica equilibrada: no ano, 91 dias com A, 92 com B, 91 com C e 91 com D, e cada mês fica entre 7 e 8 de cada letra (`ferramentas/rebalancear-letras.mjs`, conferido por `validar-dias.mjs`). Alternativas curtas (até 30 caracteres para o adesivo; no slide pode ter a versão completa).
- `tipo_pergunta` define o formato: mecanismo ("which mechanism"), diagnóstico ("most likely diagnosis"), próximo passo ("most appropriate next step"), farmaco ("most appropriate pharmacotherapy" ou "adverse effect"), ética ("most appropriate response"), bioestatística (cálculo simples ou interpretação), imagem mental (comparação visual entre dois ou três conceitos).
- Números e condutas conferidos na fonte primária (diretriz americana vigente, USPSTF, ACC/AHA, GINA, CDC) antes de postar. Diretrizes mudam: revisar as questões de rastreamento e de conduta a cada trimestre.
- Sem foto de paciente, de exame de paciente ou de prontuário. Achados de imagem viram descrição no texto ou desenho esquemático próprio.

## 6. Regras de humor

**O humor precisa ajudar a lembrar.** Antes de aprovar uma imagem, duas perguntas: (1) a piada aponta para a resposta certa? (2) ela continuaria engraçada se uma pessoa com essa doença estivesse lendo? Se a resposta a qualquer uma for não, troca a piada.

Pode:
- Personificar órgãos, células, moléculas, remédios e conceitos (o rim que carimba, o fantasma do viés).
- Analogia absurda que vira mnemônico (a toxina da cólera que "trava o interruptor do cAMP ligado", a PBP2a do MRSA como fechadura trocada).
- Rir da prova, da rotina de estudo e das siglas ("quem nunca confundiu shift com drift").
- Cultura brasileira: rodízio, feira, Carnaval, festa junina, bloco de rua, futebol, novela.

Não pode:
- Piada com paciente, com sofrimento, com o corpo de alguém (peso, aparência, idade) ou com deficiência.
- Piada com doença grave ou estigmatizada: câncer, HIV, transtornos mentais, suicídio, demência, autismo, síndrome de Down, hanseníase.
- Piada com grupos (gênero, raça, religião, região, nacionalidade, orientação), inclusive nas questões de ética que citam religião (ex.: Testemunhas de Jeová): tom neutro e respeitoso.
- Piada com profissões ou colegas (enfermagem, outras especialidades, residentes, outros cursos).
- Apologia a álcool, drogas ou automedicação. No Carnaval, o humor é sobre o fígado e o calor, nunca sobre beber.
- Usar personagens, músicas ou memes protegidos por direito autoral.

**Datas em que o humor sai e entra o acolhimento:** Finados (02/11, estreia: tom leve, sem piada sobre morte), Dia Mundial de Luta contra a AIDS (01/12), Janeiro Branco (14/01), Dia Mundial do Câncer (04/02), Síndrome de Down (17 e 21/03), Autismo (02/04), Alzheimer (21/09), Setembro Amarelo (10/09, com CVV 188 na legenda e nos stories), Saúde Mental (10/10), Outubro Rosa e Novembro Azul (informação de prevenção sem medo e sem promessa). Os personagens continuam, mas explicando, sem gag.

## 7. Compliance

- **CFM, Resolução 2.336/2023 (publicidade médica):** sem sensacionalismo, sem autopromoção exagerada, sem "o melhor curso", sem promessa de aprovação, de nota ou de Match. Sem antes e depois, sem depoimento que prometa resultado. Identificação do médico com nome e CRM em toda legenda; especialidade só com RQE conferido.
- **Sem promessa:** nada de "aprovação garantida", "passe no Step com esta questão" ou números de aprovação próprios (a Road to America ainda não tem taxa publicada).
- **Sem imagens de pacientes:** só ilustrações. Nada de fotos clínicas, de exames reais ou de pessoas reconhecíveis.
- **Direitos autorais:** questões, imagens e trilhas próprias. Nada de NBME, UWorld, AMBOSS, First Aid ou prints de livros.
- **Banco privado:** os 1000 itens são produto pago. O Instagram usa só conceitos do outline, escritos do zero.
- **LGPD:** respostas do quiz são analisadas de forma agregada. Não publicar nome ou foto de quem respondeu sem autorização escrita. A pré-inscrição continua sendo o único lugar que pede dados, com a política de privacidade do site.
- **Português:** sem travessões (o validador bloqueia o travessão e a meia-risca), sem jargão de IA, frases curtas, termos-chave em inglês.
- **Fontes:** datas especiais conferidas (Páscoa 2027 em 28/03, Carnaval em 09/02, Cinzas em 10/02, Sexta-feira Santa em 26/03, Match Day em 19/03/2027 segundo o NRMP, prazo do rank order list em 03/03/2027). Datas móveis de 2027 e números clínicos devem ser reconferidos uma semana antes de cada post.

## 8. Stories: enquete no dia D, quiz no D+1

O quiz do Instagram mostra a letra certa a quem responde. Se ele sai no dia D, o "gabarito amanhã" perde a graça: metade do público já sabe a resposta ao meio-dia. Por isso o dia D usa **enquete de quatro opções**, que não tem resposta certa, e o **quiz com gabarito só entra no D+1**, abrindo com o resultado da enquete de ontem.

| Horário | Story | Adesivo | Modo |
|---|---|---|---|
| 12h05 | **Gabarito de ontem** (`story-gabarito.png` da pasta do dia anterior): resultado da enquete de ontem, letra por letra, e "segunda chance" com a pergunta de `quiz.resumo` (agora com o achado da vinheta, porque o gabarito já saiu) | QUIZ com a pergunta de `quiz.resumo` e a letra certa marcada | completo e enxuto |
| 12h06 | **Questão de hoje** (`story-enquete.png`): gancho, vinheta, alternativas curtas e "gabarito amanhã às 12h, no primeiro slide" | ENQUETE "Qual é a sua letra?" com A, B, C e D em inglês, sem resposta certa e sem achado da vinheta | completo e enxuto |
| 12h07 | Mesmo fundo | CONTROLE DESLIZANTE "Quanta certeza você tem?" | completo |
| 12h08 | `story-desafio.png` (dia X de 30), só nos dias do desafio | | completo |
| 20h30 | Resultado parcial da enquete, sem dizer qual letra está certa ("a turma está dividida entre duas letras") | LINK para o post | completo |
| Domingo 18h | Placar da semana: as três questões com menor acerto, check-in do desafio | LINK do simulado e CAIXA DE PERGUNTAS | completo e enxuto |

Como montar o das 12h05: tire o print do resultado da enquete de ontem e escreva as porcentagens nas quatro barras do `story-gabarito.png` (ou cole o print por cima do cartão); depois ponha o adesivo de quiz na área livre (veja `story-gabarito-guia.png`). O roteiro de cada dia, com as opções curtas e a letra certa, está no `stories.txt` do render e na coluna "Roteiro dos stories" da planilha. Adesivos de enquete e de quiz só entram pelo celular, na hora de postar; por isso os stories não vão para o agendador.

Destaques fixos no perfil: Step 1, Step 2 CK, Remix, Desafio, Live, Simulado grátis, Pré-inscrição. Os gabaritos entram no destaque do Step correspondente.

## 9. CTA e conversão ativa

**Endereço escrito só no direct, no adesivo de link dos stories e na bio.** Legenda de post e de Reel não leva endereço: leva uma palavra-chave. Quem comenta a palavra recebe a resposta automática no direct com o link (que no direct é clicável) e com UTM própria (`utm_medium=dm`). A única exceção é o CVV (cvv.org.br) nas datas de saúde mental. Tudo isso vive em `instagram/conversao.json`; `templates/lib/conversao.mjs` aplica nas legendas, nos slides e no roteiro dos stories, e `ferramentas/conversao-ativa.mjs` limpou os endereços antigos dos 365 dias.

### Palavras-chave e resposta automática

| Palavra | O que chega no direct | Quando aparece |
|---|---|---|
| **SIMULADO** | Link do bloco grátis de 20 questões em 30 minutos, com relatório | Plantão de Terça, Rodízio de Quinta, Reels de Step 2 CK, formatos Pegadinha e Resultado |
| **MACETE** | Os sete macetes mais recentes com gabarito publicado (de sexta a quinta), em texto, um por dia, com a data do Remix em que o conceito volta, quando volta | Bicho de Segunda e Sextou na Farmácia, a partir da sexta do dia 5; Reels de Step 1 |
| **FACULDADE** | Link do verificador de faculdade (critério do World Directory) | Primeira quarta-feira do mês |
| **EMBARQUE** | Link da pré-inscrição gratuita na turma fundadora (não obriga a matrícula) | Remix de Domingo |
| **DESAFIO** | Regras, datas e a cartela do Desafio 30 Dias de Embarque | Semana de inscrição de cada edição |
| **LIVE** | Data, horário e como ativar o lembrete da Live de Correção | Dia da live e o sábado antes |

Quarta do Porquê (fora a primeira do mês) e Sábado Sem Viés não pedem comentário de palavra: a quarta pede compartilhamento ("mande para a pessoa do grupo que sempre pergunta o porquê") e o sábado pede debate ("comente a letra e o porquê em uma frase; as respostas mais discutidas entram na live"). As frases variam de semana para semana (`frases_cta` em `conversao.json`), e o último slide do post muda de desenho conforme o tipo.

**MACETE: promessa igual à entrega.** O texto do MACETE é um pacote de sete macetes, de sexta a quinta, e troca toda sexta às 12h, logo depois do post (quando sai o gabarito da quinta). Assim, quem comenta MACETE no Reel das 19h de sexta recebe o macete daquele Reel (a questão do Reel é de segunda a quarta da mesma semana), e quem comenta na segunda recebe os sete mais recentes. A mensagem não promete mais que "no domingo eles voltam no Remix": cada macete que volta num Remix leva a data entre parênteses, e os que não voltam ficam sem data. O validador confere que todo Reel que pede MACETE está no pacote ativo na hora em que vai ao ar. São 53 pacotes (o último, dias 362 a 365, fecha o programa).

**Texto de cada resposta automática**, com assinatura e aviso de privacidade, está em `conversao.json` e na aba "Automação de DM" da planilha, inclusive o texto de cada um dos 53 pacotes do MACETE e o do DESAFIO e da LIVE de cada edição e data. Toda mensagem termina com o aviso:

> Mensagem automática da Road to America. Usamos só o seu nome de usuário, para responder a este pedido; não vendemos nem compartilhamos seus dados. Para não receber mais mensagens automáticas, responda SAIR. Política de privacidade: https://drgetulio.github.io/road-to-america/privacidade.html

Exemplo (SIMULADO):

> Oi! Aqui está o simulado grátis da Road to America: um bloco de 20 questões em 30 minutos, no formato do USMLE, com relatório de desempenho e revisão item a item.
> (link com UTM)
> Faça com o cronômetro ligado e sem consultar nada, como no dia da prova. A questão de amanhã sai às 12h no feed.
> Dr. Getúlio Bernardo Morato Filho, CRM-DF 13610
> (aviso de privacidade)

**Como configurar.** Ferramenta parceira oficial da Meta para mensagens do Instagram (por exemplo ManyChat), ligada pelo login da Meta, nunca por senha. Um gatilho por palavra (comentário em qualquer post ou Reel e mensagem direta), resposta pública curta sorteada entre duas ou três variações, mensagem privada com o texto da planilha, e a palavra SAIR para parar. Regras da Meta que valem aqui: uma resposta privada por comentário, até 7 dias depois dele; depois que a pessoa responde, a conta pode escrever por 24 horas, e fora dessa janela não vai mensagem automática; e nada de condicionar o envio a seguir o perfil, curtir ou marcar amigos. Configuração inicial de cerca de 2 horas; depois, 5 minutos toda sexta às 12h (texto do MACETE) e 10 minutos por semana para as conversas que a automação não entendeu.

**LGPD.** A ferramenta guarda só o nome de usuário e a palavra pedida. Nada de lista de participantes publicada, nada de print de direct ou de enquete com nome sem autorização por escrito.

### Links com UTM

- Stories e bio: `utm_source=instagram&utm_medium=story|bio&utm_campaign=questao_de_embarque&utm_content=dia_NNN` (prontos no `stories.txt`).
- Direct: `utm_medium=dm&utm_content=simulado|faculdade|embarque`.
- Destinos (só no direct, nos stories e na bio): simulado `https://drgetulio.github.io/road-to-america/simulado/`, pré-inscrição `https://drgetulio.github.io/road-to-america/#pre-inscricao`, verificador `https://drgetulio.github.io/road-to-america/verificar.html`, política de privacidade `https://drgetulio.github.io/road-to-america/privacidade.html`.

## 10. Desafio 30 Dias de Embarque e Live de Correção

### Desafio de 30 dias

Uma questão por dia, durante 30 dias: votar na enquete das 12h06 sem consultar, abrir o gabarito no dia seguinte e marcar a cartela (verde se acertou, amarelo se errou e entendeu o porquê). Sem sorteio, sem prêmio e sem ranking: sorteio ou prêmio para seguidor depende de autorização prévia do Ministério da Fazenda (Lei 5.768/1971), e a recompensa aqui é a correção ao vivo na live de encerramento.

| Edição | Inscrição (comente DESAFIO) | Desafio | Dias do programa | Live de encerramento | Por que nessa data |
|---|---|---|---|---|---|
| 1 | 09/11 a 15/11/2026 | **segunda 16/11 a terça 15/12/2026** | 15 a 44 | quinta 17/12/2026 | Logo depois da estreia, quando o público forma o hábito, e antes das festas |
| 2 | 21/06 a 27/06/2027 | **segunda 28/06 a terça 27/07/2027** | 239 a 268 | quinta 29/07/2027 | Férias de julho do internato e da graduação, na metade do programa |

Na semana de inscrição o CTA do dia vira DESAFIO e o Reel da sexta é a chamada do desafio. Durante o desafio, a legenda ganha a linha "dia X de 30", o story das 12h08 mostra a barra de progresso (`story-desafio.png`) e o domingo tem check-in na caixa de perguntas. A cartela (`desafio-cartela.png`, gerada no primeiro dia de cada edição) é a imagem que a automação manda logo depois das regras. O lembrete diário é o story, não o direct, por causa da janela de 24 horas da Meta.

### Live de Correção, uma por mês

Última quinta-feira do mês, às 20h30, 45 minutos. As cinco questões do mês com menor acerto no quiz do D+1, resolvidas ao vivo: ler a vinheta, achar a pista que decide, eliminar as erradas e repetir o macete. Depois, perguntas da caixinha e dos comentários de sábado. Sem nome de quem errou; placar só agregado.

| Mês | Data | Observação |
|---|---|---|
| Novembro 2026 | quinta 26/11 | |
| Dezembro 2026 | quinta 17/12 | Encerramento do desafio 1, antes das festas |
| Janeiro 2027 | quinta 28/01 | |
| Fevereiro 2027 | quinta 25/02 | |
| Março 2027 | quinta 18/03 | 25/03 é Quinta-feira Santa |
| Abril 2027 | quinta 29/04 | |
| Maio 2027 | quinta 20/05 | 27/05 é Corpus Christi |
| Junho 2027 | quinta 17/06 | 24/06 é São João |
| Julho 2027 | quinta 29/07 | Encerramento do desafio 2 |
| Agosto 2027 | quinta 26/08 | |
| Setembro 2027 | quinta 30/09 | |
| Outubro 2027 | quinta 28/10 | Última live do programa |

Preparo: agendar a live no Instagram sete dias antes (botão "Lembrar-me" no perfil), trocar o texto da palavra LIVE, abrir a caixa de perguntas no sábado anterior, escolher as cinco questões pela coluna "Acerto no quiz (%)" no dia e, depois, compartilhar o replay e cortar 30 segundos para um Reel.

## 11. Métricas

Planilha semanal (toda segunda, antes do post), uma linha por dia do calendário, usando a coluna `dia`:

| Métrica | Como calcular | Para que serve |
|---|---|---|
| **Taxa de salvamentos** | salvamentos / alcance do post | Principal sinal de conteúdo útil. Os 10% de posts com maior taxa viram reels e voltam nos remixes |
| **Taxa de compartilhamentos** | compartilhamentos / alcance | Mede o humor que funciona; compare personagens e quadros |
| **Respostas no quiz** | respostas / visualizações do story do quiz | Engajamento diário. Queda de três semanas seguidas pede ajuste de horário ou de capa |
| **Acerto no quiz** | respostas certas / respostas | Calibração. Ideal entre 40% e 70%. Acima de 85%, a questão ficou fácil; abaixo de 25%, revisar se há ambiguidade |
| **Cliques no link** | toques no adesivo de link e no link da bio, por UTM | Ponte para o site |
| **Conversão** | sessões, simulados concluídos e pré-inscrições com `utm_campaign=questao_de_embarque` | Resultado do programa no funil |
| **Alcance de não seguidores** | % do alcance vindo de quem não segue | Crescimento do perfil |
| **Comentários com letra** | comentários com A, B, C ou D | Sinal para o algoritmo e termômetro de dúvida |
| **Votos na enquete** | votos / visualizações do story das 12h06 | Engajamento do dia D; compare com o quiz do D+1 para ver quantos voltam |
| **Volta no D+1** | respostas no quiz das 12h05 / votos na enquete de ontem | Mede se a recompensa primeiro funciona |
| **Reels** | alcance de não seguidores, retenção aos 3 s e compartilhamentos, por formato | Escolher o formato que mais traz gente nova |
| **Palavras-chave** | comentários com cada palavra e cliques por `utm_medium=dm` | Qual CTA converte; os quadros com pouca palavra trocam de frase |
| **Desafio e live** | inscritos, check-ins de domingo, espectadores ao vivo | Hábito e comunidade |

Revisão mensal: acerto por sistema e por Step (vira tema de Reel e escolhe as questões da live), quadro com mais salvamentos, personagem com mais compartilhamentos, e conferência das condutas que mudaram nas diretrizes.

## 12. Produção para uma pessoa: lote semanal e modo enxuto

O conteúdo dos 365 dias já está escrito e validado. O trabalho de cada semana é gerar as imagens, renderizar, agendar e aparecer nos stories e nos comentários. Para caber na rotina de uma pessoa, tudo que dá para fazer de uma vez vai para **um dia de lote por semana, a quarta-feira**, que prepara a semana que começa na segunda seguinte (cinco dias de folga para refazer imagem ou reconferir fonte).

### Lista de tarefas por dia da semana (modo completo)

| Dia | Tarefas | Tempo |
|---|---|---|
| Segunda | Stories das 12h05, 12h06 e 12h07 (no celular); comentários e direct que a automação não entendeu; métricas da semana anterior na planilha | 12 min + 20 min + 30 min |
| Terça | Stories 12h05, 12h06, 12h07 e 20h30; comentários e direct | 15 min + 20 min |
| **Quarta (lote)** | Stories e comentários; gerar as **14 imagens** da semana seguinte no Higgsfield, com a folha de referência de cada personagem em `medias`; conferir e renderizar a semana (`render.mjs --intervalo` e a folha de contato); reconferir na fonte primária as condutas e os números das 7 questões; agendar os 7 posts com as legendas e o primeiro comentário; Reel da sexta seguinte (conferir o texto, gravar a voz, renderizar, escolher o áudio); conversas do direct | 35 + 110 + 30 + 40 + 50 + 35 + 10 min |
| Quinta | Stories e comentários; na semana de live, preparo, live às 20h30 e corte do replay | 35 min (+ 120 min na semana de live) |
| Sexta | Stories e comentários; 12h, trocar o texto do MACETE pelos sete macetes mais recentes; no formato Resultado, copiar os números da enquete em `resultados-enquete.json` e gerar o Reel de novo (sem números, sai o plano B); 19h00, publicar o Reel e responder os primeiros comentários | 35 + 5 + 5 + 15 min |
| Sábado | Stories e comentários; na semana de live, caixa de perguntas | 35 min (+ 5 min) |
| Domingo | Stories e comentários; 18h00, placar da semana e check-in do desafio | 35 min + 10 min |

### Modo enxuto (opcional)

Para semanas de prova, plantão pesado ou viagem, e pode alternar semana a semana:

- **6 slides** por post em vez de 8 (sai o slide das erradas e o do CTA; o CTA vai na última linha do "responda").
- **2 stories** por dia (12h05 e 12h06).
- **7 imagens por semana** em vez de 14: a imagem do macete não é gerada; o slide do macete sai com o avatar do personagem, e a capa do gabarito usa a imagem da questão de ontem.
- Reel da semana nos formatos POV ou Macete, ou o Resultado no plano B, que não depende dos números da enquete.

### Estimativa de horas por semana (revista)

A estimativa anterior (7 horas no completo, 4 horas e meia no enxuto) contava 5 minutos por imagem e 3 minutos por story, sem refação, sem a voz do Reel e sem o primeiro comentário do post. A conta abaixo usa o tempo de quem já conhece as ferramentas, com uma refação a cada três imagens e a conferência da consistência do personagem.

| | Completo | Enxuto |
|---|---|---|
| Lote de quarta | 275 min: 14 imagens a cerca de 8 min (110), render e folha de contato (30), fontes de 7 questões (40), agendamento de 7 carrosséis com legenda e comentário fixado (50), Reel com voz própria (35), direct (10) | 171 min: 7 imagens (56), render (20), fontes (35), agendamento (35), Reel (20), direct (5) |
| Stories, comentários e direct | 35 min por dia, 245 min | 18 min por dia, 126 min |
| Métricas, MACETE, números da enquete, Reel publicado, placar e caixa de perguntas | 70 min | 40 min |
| Live mensal (120 min por mês, com preparo e corte) | 28 min | 21 min (90 min por mês) |
| **Total** | **cerca de 10 horas (618 min)** | **cerca de 6 horas (358 min)** |
| Imagens por semana | 14 | 7 |
| Slides por post e stories por dia | 8 e 4 | 6 e 2 |

Uma vez, antes da estreia: cerca de 7 horas (as 10 folhas de referência dos personagens, com conferência e refação, 180 min; a automação de DM, 120 min; um teste completo do render, da folha de contato e de um Reel, 120 min). Nas duas primeiras semanas, conte o dobro para o lote de quarta (cerca de 14 horas na semana, no completo). Quando o perfil crescer, o tempo de comentários e direct é o primeiro a subir: acima de 200 comentários por semana, conte mais 1 hora. Os números ficam em `conversao.json` (`rotina.horas`) e na aba "Rotina semanal" da planilha.

### Passo a passo do lote

1. Abrir a aba "Prompts das imagens" da planilha, filtrar os 7 dias da semana seguinte e gerar as imagens (Nano Banana Pro, 2k, 4:5), sempre com a folha de referência de cada personagem listado na coluna "Referência do personagem" em `medias` (`image_references`, seção 3.1); no enxuto, só as da questão. Salvar como `instagram/imagens/dia-NNN.png` e `dia-NNN-macete.png`.
2. `node instagram/templates/render.mjs --intervalo 15-21` e `node instagram/ferramentas/folha-de-contato.mjs 15 21 entregas/semana.png` para conferir a semana numa imagem só.
3. Reconferir as condutas que a planilha marca e as datas móveis; segundo médico revisa quando houver dúvida.
4. Agendar no Meta Business Suite: `post-do-dia/` (ou `post-do-dia-enxuto/`) com a `legenda.txt`, às 12h, e o comentário fixado com a explicação de ontem.
5. Reel: `cd reels && npm run render:semanais -- semana-NN`; conferir a capa; agendar para sexta às 19h00, com o áudio da sugestão.
6. Checklist antes de publicar: vinheta com até 60 palavras; quatro alternativas; resposta conferida em fonte primária; sem travessão; termos em inglês na legenda; CRM na assinatura; sem paciente na imagem; sem promessa; gancho de data conferido; nenhum endereço escrito na legenda; palavra-chave do dia testada na automação.

## 13. Reels semanais

Alcance de quem ainda não segue vem sobretudo de Reels. O programa tem **um Reel nativo por semana (52)**, de 15 a 30 segundos, publicado na **sexta às 19h00**, ligado a uma questão de segunda a quarta da mesma semana. Como o gabarito dessa questão já saiu, o Reel pode mostrar a letra e o achado da vinheta (`quiz.resumo`) sem estragar o "gabarito amanhã" de ninguém.

Fonte: `instagram/reels-semanais.json`, gerado por `ferramentas/gerar-reels-semanais.mjs` a partir do que já foi escrito para o dia (`quiz.resumo`, opções curtas, macete, pegadinha e personagem) e do texto por semana de `ferramentas/reels-roteiro.json`. O projeto Remotion de `reels/` lê o JSON e renderiza com os componentes de marca (legenda cinética, carimbo, checklist, caixa de "Comente" e fechamento), as quatro alternativas em cartões, que viram barras de resultado, e o personagem falando num balão.

**Ganchos: 52, um por semana, da questão da semana.** Acabou o rodízio de sete textos. Cada gancho cita um dado da questão daquela sexta ("Toxina no canal de cálcio: qual fase cai?", "Guaxinim mordeu e fugiu para o mato", "PO2 baixo na placenta e o feto leva o oxigênio"), sem dar a resposta. O validador bloqueia gancho repetido e gancho sem nenhum dado da questão.

| Formato | Semanas | Roteiro |
|---|---|---|
| **POV** | 13 | Gancho "POV:" com o dado da vinheta (ex.: "POV: QRS largo a 180 e PA 74/40 com pulso"); a pergunta com o achado; as quatro opções ("pausa e escolhe"); a letra carimbada; o macete na voz do personagem; "Comente PALAVRA" |
| **Personagem explica o macete** | 11 | Gancho da questão; a pergunta; o personagem fala o macete; o termo-chave carimbado; "Volta no Remix de DD/MM" só quando o conceito está no `remix_de` de um domingo depois (o gerador escolhe, entre segunda e quarta, a questão que volta); sem volta, "Este não volta no Remix: salve agora"; "Comente MACETE" |
| **Pegadinha: troque um dado e a resposta muda** | 13 | Gancho da questão; pergunta e opções; a linha que decide; a letra certa; **o contraste**: "Troque um dado: dia 21 de um ciclo sem gravidez" e "A resposta vira B, LH da hipófise". O dado trocado e a nova resposta estão em `reels-roteiro.json` (`troca`) e sempre levam a outra letra, de preferência outra alternativa da mesma questão; "Comente SIMULADO" |
| **Resultado da enquete** | 13 | Com os números: "x% erraram a FENa de 0,4%"; barras com o resultado real; "era a A"; o macete. **Plano B**, quando `instagram/resultados-enquete.json` não tem os números do dia: o mesmo Reel sem número nenhum, com "Sua letra vai nos comentários" sobre as quatro opções, a letra carimbada e o macete. Os dois estão prontos para renderizar (`status` "pronto" ou "pronto_plano_b") |
| **Chamada do desafio** | 2 | Semanas 2 e 34, cada uma com seu gancho: as três regras em checklist, a data de início carimbada, "sem prêmio, sem ranking, só o hábito", "Comente DESAFIO" |

**Os números do Resultado.** Na sexta, antes de renderizar, copie as porcentagens do story das 12h06 do dia da questão para `instagram/resultados-enquete.json` (`{"dias": {"23": {"A": 41, "B": 33, "C": 18, "D": 8}}}`) e rode `node instagram/ferramentas/gerar-reels-semanais.mjs`. O gancho passa a mostrar a porcentagem de erro e as barras entram. Sem os números, o plano B vai ao ar sem prejuízo.

**MACETE no Reel.** O fechamento diz "Os 7 macetes mais recentes, este incluído", porque o pacote do direct troca na sexta às 12h (seção 9) e já traz a questão do Reel.

**Ilustrações do carrossel no Reel.** Enquanto as imagens não existem, o personagem aparece com o avatar redondo. Quando `instagram/imagens/dia-NNN-macete.png` existir, `npm run render:semanais` copia a imagem para `reels/public/semanais/` e a cena do personagem passa a mostrar a ilustração do macete do carrossel (4:5) no lugar do avatar, sem mudar o texto nem o tempo. O campo `ilustracoes` de cada Reel indica os arquivos e se eles já existem. Gere as imagens da semana no lote de quarta antes de renderizar o Reel.

**A voz pode ser a do médico.** O vídeo sai mudo do Remotion. O áudio entra no Instagram: o mais simples e o que mais combina com a conta é o próprio Dr. Getúlio gravando no celular a narração que está em `narracao` de cada cena (um minuto de gravação por Reel, num cômodo silencioso). Também valem efeitos gravados no celular ou uma faixa da Biblioteca de Áudio Comercial do Instagram em volume baixo, nunca música do top 50 nem música protegida embutida. A voz do personagem no formato Macete pode ser a mesma narração, sem imitar ator, dublador ou personagem conhecido.

Regras: gancho em texto nos 2 primeiros segundos; texto na tela do começo ao fim, legível sem som; legenda sem endereço, com a palavra-chave e o CRM; data sensível só no formato Macete, em tom calmo. O validador confere tudo isso, mais os ganchos únicos, o contraste da Pegadinha, a promessa de Remix, o plano B e o pacote do MACETE (seção "reels" do `validar-dias.mjs`).

Como renderizar: `cd reels && npm run render:semanais -- semana-01,semana-06` (vídeo em `out/semanais/semana-NN.mp4`, capa em `out/semanais/capas/`). Para mudar o gancho ou a troca de dado de uma semana, edite `ferramentas/reels-roteiro.json`; para outros ajustes, `AJUSTES` em `gerar-reels-semanais.mjs`. Gere o JSON de novo depois.

## 14. Campos do calendário

Cada dia em `calendario.json` tem: `dia` (1 a 365), `data` (AAAA-MM-DD), `dia_semana`, `quadro`, `step`, `sistema` (nome do outline oficial do Step), `disciplina_ou_area` (principal), `disciplinas_secundarias`, `topico` (português), `conceito` (inglês, único), `tipo_pergunta`, `personagem` (ou null), `gancho_data` (ou null), `remix_de` (dias revisados, só aos domingos), `explicacao_em` (D+1) e `chave`. Os domingos também têm `sistemas_revisados`. O personagem de um domingo de remix vem da data especial (`especiais[data].personagem`) ou, nos domingos comuns, do mapa `personagensRemix` de `ferramentas/dados-calendario.js`, sem mudar o Step nem os conceitos do dia; o anfitrião do quadro (`anfitriao`) fica no JSON do dia em `instagram/dias/`. O arquivo traz ainda `quadros`, `personagens`, `periodo` e `regras`.

Campos do dia em `instagram/dias/` que entraram nesta revisão:

- `quiz.pergunta`: sempre "Qual é a sua letra?" (enquete do dia D).
- `quiz.resumo`: a pergunta curta com o achado decisivo, até 80 caracteres, para o quiz de segunda chance do D+1 e para o Reel.
- `personagem_referencia`: personagens da imagem da questão (`questao`) e do macete (`macete`), arquivos das folhas de referência (`arquivos`) e o bloco `higgsfield.medias` com o papel `image_references` (seção 3.1).
