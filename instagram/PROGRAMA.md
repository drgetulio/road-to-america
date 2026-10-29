# Questão de Embarque: uma questão por dia no Instagram

Programa de 365 dias de questões de USMLE Step 1 e Step 2 CK no Instagram da Road to America, de segunda-feira 02/11/2026 a segunda-feira 01/11/2027. Cada dia tem uma questão (D) e a explicação sai no dia seguinte (D+1), no mesmo post da questão nova. O humor existe para fixar o conceito: cada piada carrega um mnemônico, uma analogia ou um personagem que o seguidor vai lembrar na hora da prova.

- Calendário completo: `instagram/calendario.json` (365 dias, um objeto por dia).
- Banco de conceitos e datas especiais: `instagram/ferramentas/dados-calendario.js`.
- Gerar de novo: `node instagram/ferramentas/gerar-calendario.js`.
- Validar: `node instagram/ferramentas/validar-calendario.js` (datas, proporções, unicidade, remix, datas especiais, travessões e comparação com o banco privado).

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
| Segunda | **Bicho de Segunda** | Step 1 | Microbiologia e imunologia | Macrô na porta de um "boteco dos micróbios", com a placa de estrada do sistema do dia |
| Terça | **Plantão de Terça** | Step 2 CK | Clínica médica: diagnóstico e próximo passo | Placa verde de rodovia "NEXT STEP, 500 m" com três saídas, uma para cada conduta |
| Quarta | **Quarta do Porquê** | Step 1 | Mecanismos: patologia, fisiologia, anatomia, bioquímica, genética, histologia | Mito, Seu Néfron ou Capitã Plaqueta explicando a engrenagem em corte, estilo manual de montagem |
| Quinta | **Rodízio de Quinta** | Step 2 CK | Pediatria, GO, psiquiatria e cirurgia em rodízio, como no internato e na churrascaria | Garçom de rodízio com espetos que são especialidades; a plaquinha verde e vermelha vira "SIM, ESSA CONDUTA" e "NÃO, OBRIGADO" |
| Sexta | **Sextou na Farmácia** | Step 1 em 31 sextas, Step 2 CK em 21 | Farmacologia (mecanismo e efeito adverso) e farmacoterapia (escolha do remédio) | Tia Meia-Vida atrás do balcão de uma farmácia de interior, com ampulheta |
| Sábado | **Sábado Sem Viés** | Step 1 em 22 sábados, Step 2 CK em 30 | Ética, comunicação, segurança do paciente e bioestatística | Viés escondido atrás de uma tabela 2x2, ou uma balança de tribunal desenhada como placa de trânsito |
| Domingo | **Remix de Domingo** | Step 1 em 39 domingos, Step 2 CK em 13 | Revisão cumulativa de três conceitos já vistos, com o dia original marcado | Toca-discos com três discos rotulados "Dia 8", "Dia 31", "Dia 92" |

### Como o espaçamento funciona

1. **D+1**: a explicação sai no dia seguinte, junto com a questão nova.
2. **Remix de domingo**: cada remix junta três conceitos do mesmo Step, um de cada janela: da semana que passou (1 a 6 dias), de 2 a 5 semanas atrás e de 2 a 4 meses atrás. O mesmo conceito sobe de janela em janela, com intervalos que só aumentam. No calendário atual, a primeira revisão vem em mediana 6 dias depois do post original, a segunda 28 dias depois da primeira e a terceira 49 dias depois da segunda. Em 40 das 42 cadeias com duas ou mais revisões, cada intervalo é maior que o anterior; as duas exceções são remixes temáticos de data especial, que escolhem os conceitos pelo tema.
3. **Intercalação**: os sistemas se espalham pelo ano em proporção às faixas, e o gerador evita repetir o mesmo sistema em dois dias seguidos do mesmo Step (sobraram 7 repetições em 313 dias, todas em dias de data especial, em que o tema fixa o conteúdo, como a semana de estreia no Novembro Azul).
4. **Remix na prática**: a pergunta do domingo é uma vinheta nova que obriga a separar os três conceitos (por exemplo, "qual destes três explica o quadro?"), ou uma questão de "qual é o intruso". As quatro alternativas saem dos três conceitos revisados mais um distrator. No slide, cada alternativa leva o selo "visto no dia X".

## 3. Personagens recorrentes

Seis personagens, sempre com o mesmo desenho. Todos são ilustrações planas (flat vector), traço grosso arredondado, contorno navy, sombra em bloco, sem degradê. Paleta da marca: navy `#0f2747`, vermelho `#b0243a`, amarelo `#f1c232`, verde `#1d8a4b`, branco e papel `#f3f5f2`. Nenhum personagem imita estilo de anime, de estúdio ou de série conhecida.

| Personagem | Quem é | Descrição visual fixa (usar igual em todo prompt) | Onde aparece | Bordão |
|---|---|---|---|---|
| **Macrô** | Macrófago guloso e generoso, "come" o invasor e apresenta o pedaço aos linfócitos como quem mostra a comanda | Bolha arredondada lilás clara com pseudópodes curtos, olhos grandes, guardanapo xadrez vermelho e branco no pescoço, crachá "MHC II" pendurado | Bicho de Segunda, remix de micro e imuno | "Comi, mostrei, avisei." |
| **Mito** | Mitocôndria cansada de plantão, faz ATP sem parar | Feijão alaranjado com cristas internas aparentes, olheiras, jaleco amassado, copo de café com "ATP" escrito, crachá "PLANTÃO 24 H" | Metabolismo, bioquímica, apoptose, estatinas e metformina | "Sem oxigênio eu não trabalho." |
| **Seu Néfron** | Rim burocrata que confere tudo antes de liberar | Feijão vinho com gravata navy, óculos de leitura na ponta, carimbo na mão ("REABSORVIDO" em verde, "EXCRETADO" em vermelho), pilha de formulários | Renal, ácido-base, diuréticos, eletrólitos | "Sem carimbo, não sai." |
| **Capitã Plaqueta** | Agente de trânsito do sangue, organiza a coagulação como um cruzamento | Disco amarelo com colete refletivo verde, apito, quepe navy, cones de trânsito ao lado; os fatores da coagulação são carros numerados | Hematologia, coagulação, anticoagulantes, transfusão | "Parou, colou, coagulou." |
| **Tia Meia-Vida** | Farmacêutica de balcão de interior, divide tudo pela metade | Ampulheta com braços e óculos de armação vermelha, avental branco com bolso de canetas, coque grisalho; a areia é o remédio que vai embora | Sextou na Farmácia | "Cinco meias-vidas e ninguém lembra mais." |
| **Viés** | Fantasminha da estatística, distorce resultados quando ninguém está olhando | Lençol branco com bainha em zigue-zague, olhos navy, lupa na mão, sempre meio escondido atrás de uma tabela 2x2 ou de um gráfico | Sábado Sem Viés, Halloween | "Se você não randomizou, eu entrei." |

Regras dos personagens: nenhum deles adoece, sofre ou faz piada com paciente. Eles são o órgão, a célula ou a ideia, e o humor sai da burocracia, do cansaço ou da teimosia deles. O ônibus "Road to America" (navy com faixa verde e amarela) pode levar os seis nos posts de data especial e no dia 365.

**Base do prompt de imagem** (acrescentar a cena do dia no final):

> Ilustração vetorial plana, traço grosso arredondado, contorno navy #0f2747, cores chapadas navy, vermelho #b0243a, amarelo #f1c232, verde #1d8a4b e branco, fundo papel #f3f5f2 com uma placa de estrada simples. Personagem: [descrição fixa da tabela]. Cena: [mnemônico do dia]. Sem texto na imagem, sem logotipos, sem pessoas reais, sem sangue, sem pacientes. Proporção 4:5.

O texto vai sempre no template (Barlow Condensed nos títulos, Barlow no corpo, Overpass Mono nos rótulos de dia e de letra), nunca dentro da imagem gerada.

## 4. Rotina D e D+1

**Horário de Brasília. Feed às 12h00, todos os dias** (a hora do almoço de quem está no plantão ou no internato). Nas primeiras quatro semanas, testar 20h30 nas terças e quintas e ficar com o horário que der mais salvamentos por alcance.

**Um carrossel por dia (1080x1350), em duas partes:**

1. Capa: a imagem anedótica da questão de HOJE, com o quadro, o Step e o número do dia ("DIA 008 / STEP 1 / BICHO DE SEGUNDA").
2. Vinheta em inglês, até 60 palavras.
3. Alternativas A a D e a instrução "Responda nos stories ou comente a letra. Gabarito amanhã às 12h."
4. Divisória "GABARITO DE ONTEM": cartão de embarque com o dia anterior, carimbado.
5. Resposta certa e o porquê, em português, com os termos-chave em inglês.
6. Por que cada alternativa errada está errada (uma linha por letra).
7. A imagem mnemônica com o personagem.
8. "Cartão de embarque" para salvar: o conceito em uma frase, o termo em inglês e "volta no Remix de Domingo". CTA do dia.

No dia 1 (02/11/2026) o post tem só a questão. A explicação do dia 365 sai em 02/11/2027, num post de encerramento com a retrospectiva do ano.

**Legenda** (português, termos em inglês entre parênteses na primeira vez):

1. Gancho em uma linha, ligado à imagem.
2. Contexto em duas ou três linhas, sem dar a resposta.
3. "Comente A, B, C ou D. O gabarito sai amanhã às 12h, junto com a próxima."
4. Palavras-chave em inglês: três a cinco (ex.: *Bruton tyrosine kinase, X-linked, CD19*).
5. CTA do dia (ver seção 7).
6. Assinatura: Dr. Getúlio Bernardo Morato Filho, CRM-DF [número]. Especialidade só com RQE conferido.
7. Aviso fixo curto: "Conteúdo educacional para a prova. Condutas seguem as diretrizes dos EUA cobradas no USMLE e podem diferir das brasileiras."
8. Hashtags (5 a 8): #USMLE #USMLEStep1 ou #USMLEStep2CK #MedicinaNosEUA #RoadToAmerica #IMG #QuestaoDoDia e uma do sistema.

**Exemplo completo (dia 8, segunda-feira 09/11/2026, Bicho de Segunda)**

> A 9-month-old boy has had three ear infections and one pneumonia since age 6 months. His tonsils are barely visible and no lymph nodes are palpable. Serum IgG, IgA and IgM are very low, and flow cytometry shows almost no CD19+ cells. Which protein is most likely defective?
>
> A. Adenosine deaminase · B. Bruton tyrosine kinase · C. CD40 ligand · D. NADPH oxidase

Imagem: Macrô diante de uma "escola de linfócitos B" com a porta trancada e a placa "FECHADO: FALTOU A CHAVE BTK"; no canto, um vale-presente de IgG materna "válido até 6 meses". Explicação no dia 9: B. Sem BTK, o pré-B não amadurece, faltam células B e todas as imunoglobulinas. As infecções começam quando a IgG da mãe acaba, por volta dos 6 meses. Mnemônico: "B de Bruton, de BTK, de B cell e de boy" (ligada ao X). A é SCID (faltam também células T), C é hiper-IgM (IgM alta) e D é doença granulomatosa crônica (B e imunoglobulinas normais).

## 5. Formato das questões

- **Original**, escrita do zero a partir do conceito do calendário. Não copiar nem adaptar itens do banco privado de 1000 questões (produto pago), nem de NBME, UWorld, AMBOSS, livros ou outros perfis. O validador confere que nenhum conceito do calendário aparece com texto idêntico no banco privado; ao escrever as vinhetas, faça a mesma conferência (vinheta, alternativas e explicação).
- **Inglês do USMLE**: vinheta clínica curta (até 60 palavras), pergunta única no fim, uma só resposta certa.
- **Quatro alternativas (A a D)**, para caber no adesivo de quiz dos stories, que aceita no máximo quatro. Alternativas curtas (até 30 caracteres para o adesivo; no slide pode ter a versão completa).
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

## 8. Stories com quiz

Todo dia, no mesmo horário do feed:

| Horário | Story | Objetivo |
|---|---|---|
| 12h05 | Capa da questão + adesivo de **quiz** com as alternativas A a D (texto curto) e a resposta certa marcada | Respostas no quiz, primeira interação do dia |
| 12h06 | Enquete "Você sabia ou chutou?" | Metacognição: o seguidor percebe o que não sabe |
| 20h30 | Resultado parcial ("62% marcaram B") sem revelar a resposta + adesivo de link para o post | Puxa quem não viu ao meio-dia |
| 11h50 do dia D+1 | "Gabarito em 10 minutos" com a imagem mnemônica borrada | Cria espera para o post das 12h |
| Domingo 18h | "Placar da semana": as três questões com menor acerto e o link do simulado grátis | CTA de conversão no dia de maior tempo livre |

Destaques fixos no perfil: Step 1, Step 2 CK, Remix, Simulado grátis, Pré-inscrição. Os gabaritos entram no destaque do Step correspondente.

O quiz do Instagram mostra a resposta certa para quem responde. Por isso a explicação completa fica no post D+1, e o story do quiz só confirma a letra.

## 9. CTA

Links nunca na legenda (o feed não deixa clicar): link na bio e adesivo de link nos stories, sempre com UTM.

- **Simulado grátis de 30 minutos** (terça, quinta e domingo): `https://drgetulio.github.io/road-to-america/simulado/?utm_source=instagram&utm_medium=story&utm_campaign=questao_de_embarque&utm_content=dia_NNN`. Frase: "Gostou do formato? Faça um bloco inteiro de 30 minutos, grátis, no link."
- **Pré-inscrição** (domingo, no Remix, e nas datas do Match): `https://drgetulio.github.io/road-to-america/#pre-inscricao` com a mesma UTM. Frase: "Quer estudar com método e acompanhamento? A pré-inscrição está aberta." Sem promessa de vaga, de preço ou de aprovação.
- **Verificador de faculdade** (uma vez por mês e no Match Day): `https://drgetulio.github.io/road-to-america/verificar.html`. Frase: "Sua escola está habilitada para o USMLE? Confira em 1 minuto."
- **Nos outros dias:** "Salve para revisar no Remix de domingo" e "Mande para quem vai fazer o Step com você".

## 10. Métricas

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

Revisão mensal: acerto por sistema e por Step (vira tema de reel e de live), quadro com mais salvamentos, personagem com mais compartilhamentos, e conferência das condutas que mudaram nas diretrizes.

## 11. Produção em lote

1. Toda segunda-feira, escrever as questões das quatro semanas seguintes a partir do `calendario.json` (campos `topico`, `conceito`, `tipo_pergunta`, `personagem` e `gancho_data`).
2. Para cada dia: vinheta (até 60 palavras), alternativas A a D, explicação em português, uma linha por distrator, mnemônico e cena da imagem.
3. Revisão por um segundo médico: precisão, uma única resposta certa, regras de humor e compliance.
4. Conferir que nada repete o banco privado.
5. Gerar as imagens com o prompt base e montar os slides no template.
6. Agendar feed e stories. Remix de domingo: puxar os três dias de `remix_de` e repetir os mnemônicos já usados, para o seguidor reconhecer.

Checklist antes de publicar: vinheta com até 60 palavras; quatro alternativas; resposta conferida em fonte primária; sem travessão; termos em inglês na legenda; CRM na assinatura; sem paciente na imagem; sem promessa; gancho de data conferido; CTA com UTM.

## 12. Campos do calendário

Cada dia em `calendario.json` tem: `dia` (1 a 365), `data` (AAAA-MM-DD), `dia_semana`, `quadro`, `step`, `sistema` (nome do outline oficial do Step), `disciplina_ou_area` (principal), `disciplinas_secundarias`, `topico` (português), `conceito` (inglês, único), `tipo_pergunta`, `personagem` (ou null), `gancho_data` (ou null), `remix_de` (dias revisados, só aos domingos), `explicacao_em` (D+1) e `chave`. Os domingos também têm `sistemas_revisados`. O arquivo traz ainda `quadros`, `personagens`, `periodo` e `regras`.
