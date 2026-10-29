# Simulados: bloco de 30 minutos e simulados completos

Servidos em `https://drgetulio.github.io/road-to-america/simulado/`. Site estático,
módulos ES, sem etapa de build. O link fica no rodapé da página principal.

- `#/`: um bloco do USMLE Step 1 ou Step 2 CK, com 20 questões em 30 minutos (abaixo).
- `#/completos`: simulados que replicam o dia de prova, com relatório de desempenho
  (seção "Simulados completos", no fim deste arquivo).

# Simulado de 30 minutos

## Formato

Desde 14/05/2026 o Step 1 tem 14 blocos de 30 minutos e, desde 07/05/2026, o Step 2 CK
tem 16 blocos de 30 minutos, com até 20 questões por bloco (usmle.org, páginas do
Step 1 e do Step 2 CK). Um bloco encerrado não reabre (usmle.org, Examination Day
Testing). O simulado reproduz um bloco: 20 questões, 30:00 no relógio, 90 s por questão
em média. As constantes estão em `plataforma/js/simulado.js` (`FORMATO_OFICIAL`, `SIMULADO_30`).

## Funções da tela do bloco

| Função | Como usar |
|---|---|
| Navegação por número | lista à esquerda (no celular, botão "Questões") |
| Anterior e próxima | botões da barra, `P`/`N` ou setas |
| Escolher alternativa | clique, `1` a `6`, ou setas dentro do grupo de opções |
| Marcar para revisão | botão "Marcar" ou `M` |
| Riscar alternativa | botão à esquerda da alternativa ou botão direito no texto; não apaga a resposta |
| Realçar texto | selecionar um trecho da vinheta ou da pergunta e tocar em "Realçar" ou `H`; clique no realce remove |
| Valores laboratoriais | botão "Lab" ou `L`; painel lateral com busca em inglês e português, abre sobre a questão sem pausar o relógio |
| Calculadora | botão ou `C`; quatro operações, porcentagem, raiz quadrada, teclado físico |
| Anotações | botão ou `O`; uma por questão, ficam só no navegador e voltam na revisão do resultado |
| Ajustes | tamanho do texto (três níveis) e cores claras ou escuras |
| Relógio do bloco | regressivo a partir de 30:00, avisos discretos a 5 minutos e 1 minuto, encerra sozinho ao zerar |
| Revisão do bloco | botão no rodapé ou `R`; filtros por marcadas e sem resposta |
| Encerrar bloco | confirmação com o número de questões em branco e marcadas |

Fontes consultadas para as funções (28/10/2026): usmle.org informa que o software novo
trouxe navegação melhorada pelo teclado, menu de ajustes e contraste por imagem, e que a
prova tem anotações e calculadora padrão; valores laboratoriais são abertos por botão
próprio. Riscar, realçar, marcar e a tela de revisão seguem o funcionamento conhecido do
software. A tela oficial não é copiada; a moldura usa a identidade da Road to America.

O relógio é a diferença entre o relógio de parede e o início, então não atrasa em aba de
fundo. Recarregar a página retoma o bloco (o tempo fora da página continua contando no
bloco, mas não entra no tempo de nenhuma questão). Se o tempo acabar com a página
fechada, a próxima visita encerra e grava o bloco.

## Sorteio

`sortearBloco` (em `js/sessao.js`) chama `sortearQuestoes` da camada de dados,
estratificado por `sistema` (no Step 2 CK esse campo guarda a área), e depois troca as
questões da tentativa anterior por questões não vistas, sem deixar nenhum estrato a 1
questão ou mais da proporção exata do banco. Com os bancos de 40 questões, duas
tentativas seguidas não repetem nenhuma questão (testado com 25 sementes por Step e, na
revisão, com 500 tentativas seguidas por Step). Limite do banco: com 40 questões e blocos de
20, a terceira tentativa volta às questões da primeira; o rodízio só melhora com banco maior.

## Onde a tentativa fica gravada

| Situação | Gravação |
|---|---|
| Supabase configurado e participante com login | `store.saveSimulado`: vai para o painel do admin |
| Supabase configurado, sem login | só no navegador (`r2a-simulado-visitante-v1`), com convite à pré-inscrição e à verificação da faculdade |
| Modo demonstração (`anki/config.js` vazio) | `LocalStore` do app de flashcards, no navegador; entra no painel do admin de demonstração |

Se a gravação na conta falhar, a tentativa fica no navegador marcada como pendente, com o id
da conta, e é reenviada na próxima visita com login da mesma conta. O bloco em andamento
também guarda o dono: num computador compartilhado, o bloco aberto por outra conta é
descartado e não entra na conta de quem entrou depois (um visitante que faz login no meio do
bloco continua dono dele). Um bloco que termina com a página aberta em outra tela, ou cuja
gravação falhou, é gravado na próxima vez que a tela inicial abre.

## Valores laboratoriais

`data/valores-laboratoriais.json`: 94 exames em 12 seções, com unidade convencional e SI.
As 11 primeiras seções seguem a tabela pública do NBME usada no USMLE
(https://www.nbme.org/laboratory-values/). Lipase (13 a 60 U/L), troponina I (até 0,04 ng/mL)
e dímero D (até 250 ng/mL) entraram na revisão de 28/10/2026, conferidos na página do NBME
por busca, porque o acesso direto a nbme.org estava bloqueado nesta sessão.
As conversões para o SI foram calculadas com os fatores-padrão. No magnésio, a tabela do NBME
traz 1,5 a 2,0 mg/dL com 0,75 a 1,0 mmol/L, que é a conversão de mEq/L; a tabela daqui mostra
0,62 a 0,82 mmol/L (conversão correta de mg/dL) e explica a diferença numa nota na própria linha.
Cloreto no suor segue o consenso da Cystic Fibrosis Foundation de 2017.

A 12ª seção, "Complementares, fora da tabela do NBME", traz PCR, fibrinogênio, lactato e
saturação da transferrina, que aparecem em vinhetas do banco (s1-003, s1-004, s1-035, ck-015,
ck-019, ck-033). Os valores vêm da tabela de referência para adultos do American College of
Physicians (MKSAP), conferida por cópias secundárias; falta confirmar no original. A seção
avisa na tela que esses exames não constam da tabela oficial.
O gerador desta tabela não fica no repositório; edite o JSON diretamente.

## Resultado

Acertos, percentual, duração, média por questão contra 90 s, questões acima de 90 s,
acerto por sistema e disciplina (Step 1) ou área e tarefa (Step 2 CK), "o que revisar"
com link para o treino livre do app de flashcards filtrado pelo sistema
(`../anki/#/estudar?sistema=...&modo=treino`), revisão questão por questão com a
resposta dada, a correta, a explicação em inglês, o resumo em português, a fonte, o tempo
gasto e a anotação. No Step 2 CK, só psiquiatria, neurologia, bioestatística, medicina
preventiva e ética têm sistema correspondente nos cards do Step 1.

## Simulados completos

Rotas: `#/completos` (escolha, em andamento, estimativa com todas as respostas e
histórico), `#/dia/<id>` (dia de prova) e `#/relatorio/<id>` (relatório e revisão item a
item). Exigem conta (Supabase com login e matrícula ativa) ou o modo demonstração; o
visitante sem login vê o convite para entrar.

### Formatos

| Formato | Step 1 | Step 2 CK | Pausa | Tutorial | Dia |
|---|---|---|---|---|---|
| Simulado completo (oficial) | 14 blocos, 280 itens | 16 blocos, 318 itens | 55 min | 5 min, opcional | 8 h e 9 h |
| Meio formulário (Road to America) | 7 blocos, 140 itens | 8 blocos, 159 itens | 30 min | 5 min, opcional | 4 h 05 min e 4 h 35 min |
| Avaliação de prontidão (Road to America) | 4 blocos, 80 itens | 4 blocos, 80 itens | 15 min | sem | 2 h 15 min |

Fontes do formato oficial (usmle.org, consultadas em 28/10/2026): páginas do Step 1 (em
vigor desde 14/05/2026) e do Step 2 CK (desde 07/05/2026), Examination Day Testing e
Examination Results and Scoring. Os dois recortes não existem no USMLE e são critério
interno. Formulários: fixos A, B e C (mesmos itens para a turma; B evita A e C evita A e
B) ou personalizado (prioriza itens não vistos), montados por
`plataforma/js/formularios.js` nas faixas oficiais do outline. Com banco menor que o
formato, a versão reduzida tem blocos de 20 itens e a tela avisa.

### O dia de prova

| Tela | O que acontece |
|---|---|
| Check-in | resumo do formulário (cartão de embarque), regras do dia; fazer o tutorial ou pular (os 5 minutos vão para a pausa). Nada corre ainda |
| Tutorial | relógio de 5 minutos e as ferramentas da tela do bloco; o que sobrar vai para a pausa; depois de 5 minutos, o tempo conta como pausa |
| Bloco | a mesma tela do bloco de 30 minutos (`js/interface-bloco.js`): marcar, riscar, realçar, valores laboratoriais, anotações, calculadora, tabela do item, revisão só dentro do bloco, relógio do bloco com avisos de 5 e 1 minuto e, no rodapé, o cronômetro do dia |
| Pausa | saldo de pausa em contagem regressiva (55 min, mais sobras de blocos e do tutorial), trilha dos blocos, duração do próximo bloco; pausa além do saldo fica em vermelho e sai do bloco seguinte |
| Condições do dia | escolhidas no modal de início: "oficiais" (sem parar; toda pausa além do saldo sai dos blocos seguintes, com a página aberta ou fechada; dia padronizado) ou "estudo" (pode parar entre blocos; dia não padronizado). Não mudam depois de escolhidas |
| Dia parado | só em condições de estudo: entre blocos, "Parar e continuar depois" congela o saldo de pausa; "Retomar" volta a correr de onde parou |
| Itens já vistos e reserva | o modal mostra quantos itens do formulário o aluno já respondeu; acima de 25%, pede confirmação e o relatório sai como reaplicação, não comparável. O formulário reservado (S1-B, CK-A) fica fora do banco de questões até o aluno fazê-lo |
| Formulário parcial | o CK-B (11 blocos) tem pausa proporcional, e o resumo e o check-in dizem "formulário parcial" |
| Fim do dia | corrige, grava as respostas em `respostas_item` (origem `simulado`, modo `cronometrado`), conclui o simulado e mostra o resumo |

Regras do relógio (as oficiais vêm de `plataforma/js/formularios.js`; os acréscimos ficam
em `js/dia-prova.js`, funções puras):

- bloco encerrado, por você ou pelo tempo, não reabre; a camada de dados recusa mudar
  as respostas de um bloco encerrado (`validarProgresso` e o gatilho do Supabase);
- o tempo de cada item é o intervalo em que ele ficou aberto, sem passar do fim do bloco;
- página fechada com o bloco aberto: o relógio do bloco continua. Ao voltar, o bloco
  vencido é encerrado no instante em que o tempo acabou; se a ausência passou de 2
  minutos (critério interno), o dia fica parado a partir do fim do bloco, para que ela não consuma a pausa;
- página fechada na pausa sem "Parar": a pausa continua correndo, como no centro de provas.
  Se a volta acontece mais de 2 minutos depois de o saldo acabar, o dia fica parado no
  instante em que o saldo zerou, sem débito (critério interno). Antes dessa regra, uma
  pausa esquecida até o dia seguinte virava débito de horas e zerava o tempo de todos os
  blocos seguintes;
- pausa além do saldo com a página aberta: vira débito no bloco seguinte, como na prova
  (usmle.org, página Break Time, https://www.usmle.org/step-exams/exam-day-information/break-time, consultada por busca em 29/10/2026: o excesso sai do tempo de prova), até 10 minutos; passado isso,
  o dia para sozinho (critério interno), e os 10 minutos continuam descontados;
- tutorial aberto além dos 5 minutos: o excesso gasta a pausa (regra oficial) e segue a
  mesma regra da pausa; quando o dia para, o tutorial é encerrado e o dia fica parado
  antes do bloco 1;
- parar e continuar depois existe só entre blocos. É recurso de estudo, fora do formato
  oficial, e o relatório informa quantas vezes o dia parou.

Retomada: o estado (`sessao` do `SimuladoCompleto`) vai para a camada de dados com
`store.salvarProgressoSimulado` a cada transição e, dentro do bloco, a cada 3 segundos de
mudança, ao esconder a aba e ao sair da página; uma cópia vai para o navegador a cada
mudança (`r2a-simulado-completo-espelho-v1`). Ao abrir, vale a cópia mais nova
(`maisRecente`: mesmo formulário, contador maior e sem reabrir bloco). Campos que
`dia-prova.js` acrescenta à sessão: `ui` (item aberto, hora de abertura, riscos, realces e
avisos do bloco atual), `notas` (anotações por item), `suspensa` e `suspensoes`, `rev` e
`respostas_gravadas`.

### Relatório de desempenho

Método em `plataforma/PSICOMETRIA.md` (seção 17). O relatório traz:

- **Step 1:** "Acima do limiar do banco" ou "Abaixo do limiar do banco" pela probabilidade
  P(theta > c | respostas do simulado) quando ela sai da faixa de 10% a 90% (Pass ou Fail só
  com o limiar ligado às autoavaliações NBME da turma ou com o modelo de desfechos); dentro da
  faixa, "resultado indefinido, perto do limiar", com a tendência em texto. Ao lado, o rótulo "Precisão alta" ou "Estimativa
  preliminar" e quantos itens faltam; habilidade estimada com intervalo de 90%; percentual
  esperado num formulário igual; acerto esperado do examinando no limiar;
- **Step 2 CK:** probabilidade de atingir o padrão do banco, que representa o mínimo de
  218 (com a mesma faixa de indefinição), e o aviso de que a nota de três dígitos só será estimada depois da calibração com
  escores reais (com modelo calibrado e notas suficientes, a tela mostra a nota prevista);
- escala do limiar: a sua habilidade e o intervalo de 90% em relação ao 0;
- aviso de quantos itens do formulário já tinham sido respondidos no banco antes do dia
  (a repetição tende a subir o acerto);
- perfil de desempenho por sistema, disciplina (todos os rótulos) e competência (no Step 2
  CK, tarefas do médico): mais baixo, igual ou mais alto que o examinando no limiar, com a
  barra do intervalo de 90% de cada área, o acerto bruto e o acerto esperado no limiar;
- por onde começar a revisar, com link para os flashcards do sistema;
- o dia bloco a bloco: acertos, tempo usado, sobra para a pausa, encerramento, pausa
  usada, débito de pausa e paradas;
- indicador com todas as respostas do banco e a prontidão pela EXIT 18 (critério
  principal; o banco é complementar);
- revisão item a item, com filtros por situação e por bloco: vinheta, tabela do item,
  alternativas com a explicação de cada uma, objetivo educacional, explicação, resumo em
  português, anotação feita na prova, tempo gasto, "Criar flashcard" (abre
  `anki/#/criar` pré-preenchido; o editor aceita `frente`, `verso`, `extra`, `nota_pt`,
  `sistema`, `disciplina`, `tags`, `fonte`, `de_questao` e `retorno`, este só para páginas
  do site) e "Reportar erro no item" (`store.reportarItem`, motivos de `MOTIVOS_REPORTE`).

O relatório é recalculado ao abrir (vale a calibração mais recente do banco). O resumo
gravado com o simulado (`resultado.estimativa` e `resultado.dia`) alimenta o histórico.

### Bloco de 30 minutos no banco de respostas

Desde 29/10/2026, cada bloco de 30 minutos gravado na conta (ou no modo demonstração)
também grava as respostas em `respostas_item` com origem `bloco_30` e modo
`cronometrado`, para entrarem na estimativa de aprovação. No Supabase, o gabarito é
recalculado pelo banco quando os itens públicos foram importados com `--incluir-publicos`.

## Arquivos

```
simulado/
  index.html, simulado.css, icons/ (subconjunto Phosphor: tools/build-icons.py --app simulado)
  data/step1-questoes.json, data/step2ck-questoes.json, data/valores-laboratoriais.json
  js/app.js            inicialização, conta (participante, visitante, demonstração), rotas
  js/tela-inicio.js    escolha do Step, formato, histórico
  js/interface-bloco.js tela do bloco e ferramentas (comum ao bloco de 30 min e aos completos)
  js/tela-prova.js     bloco de 30 minutos ligado à interface do bloco
  js/tela-completos.js simulados completos: escolha, em andamento, estimativa, histórico
  js/tela-dia.js       dia de prova: check-in, tutorial, blocos, pausas, parada, fim
  js/tela-relatorio.js relatório de desempenho e revisão item a item
  js/dia-prova.js      acréscimos ao relógio oficial: tempo por item, avisos, parada, retomada (puro)
  js/relatorio.js      contas do relatório, perfil, blocos, revisão, card pré-preenchido (puro)
  js/formato.js        percentuais, probabilidades e durações (puro)
  js/tela-resultado.js resultado e revisão
  js/sessao.js         estado do bloco, relógio, sorteio sem repetição (puro)
  js/resultado.js      agregados do resultado e do histórico (puro)
  js/realce.js, js/calculadora.js, js/labs.js, js/rotulos.js (puros)
  js/armazenamento.js  histórico do visitante, bloco em andamento, anotações, preferências
  js/dom.js, js/tema.js
  tests/               node:test
```

## Testes

```bash
cd simulado && node --test tests/*.test.mjs
node simulado/tests/completo.e2e.mjs [pasta-das-capturas]   # na raiz; Playwright e axe-core (AXE_CORE=.../axe.min.js)
node simulado/tests/validacao-relatorio.mjs   # na raiz; validação do resultado estimado por simulação (cerca de 2 min)
```

`completo.e2e.mjs` serve um banco sintético como `banco-privado/` (formulários no tamanho
oficial), faz um Step 1 completo a 1440 px no tema claro (tutorial, ferramentas, pausa,
parada, recarregar no meio do bloco, 14 blocos, relatório, reporte e flashcard) e uma
avaliação de prontidão do Step 2 CK a 390 px no tema escuro, e roda o axe-core (WCAG 2.1
A e AA) em cada tela nos dois temas, conferindo também que não há rolagem horizontal.
