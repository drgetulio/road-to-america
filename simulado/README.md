# Simulado de 30 minutos

Um bloco do USMLE Step 1 ou Step 2 CK: 20 questões em 30 minutos, servido em
`https://drgetulio.github.io/road-to-america/simulado/`. Site estático, módulos ES,
sem etapa de build. O link fica no rodapé da página principal.

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

## Arquivos

```
simulado/
  index.html, simulado.css, icons/ (subconjunto Phosphor: tools/build-icons.py --app simulado)
  data/step1-questoes.json, data/step2ck-questoes.json, data/valores-laboratoriais.json
  js/app.js            inicialização, conta (participante, visitante, demonstração), rotas
  js/tela-inicio.js    escolha do Step, formato, histórico
  js/tela-prova.js     tela do bloco e ferramentas
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
```
