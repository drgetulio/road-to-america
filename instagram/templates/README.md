# Templates da Questão de Embarque

Gera os PNG prontos para postar a partir de um JSON por dia, com a identidade do site (navy, vermelho, papel, fitinha verde e amarela, placa de rodovia, carimbo e cartão de embarque) e as fontes locais de `assets/fonts`.

```bash
node instagram/templates/render.mjs --dia 8
node instagram/templates/render.mjs --intervalo 1-28
node instagram/templates/render.mjs --intervalo 7-9 --fonte instagram/templates/exemplos   # teste
```

Opções: `--fonte DIR` (padrão `instagram/questoes`), `--imagens DIR` (padrão `instagram/imagens`), `--saida DIR` (padrão `instagram/saida`), `--reel` (gera a capa de reel mesmo sem o campo `reel`), `--html` (guarda o HTML de cada peça ao lado do PNG), `--so-conferir` (só valida, não renderiza) e `--forcar` (renderiza mesmo com erro de conferência).

Requisito: Node 18 ou mais novo e o pacote `playwright` com o Chromium instalado (`require('playwright')`, `chromium.launch()` sem opções). Um dia leva cerca de 2 segundos; os 365 dias, uns 12 minutos.

## O que sai em `instagram/saida/dia-NNN/`

| Arquivo | Tamanho | Quando posta |
|---|---|---|
| `questao-1-capa.png` | 1080x1350 | Dia D, 12h, slide 5. Imagem cheia, escudo do Step, data, selo do quadro e placa verde com o gancho em português |
| `questao-2-enunciado.png` | 1080x1350 | Dia D, slide 6. Vinheta e pergunta em inglês, alternativas A a D (no remix, com o selo "visto no dia X") |
| `questao-3-responda.png` | 1080x1350 | Dia D, slide 7. "Qual é a letra?", enquete nos stories, comentário, cartão do gabarito ("slide 1" de amanhã) e a linha do CTA |
| `questao-4-cta.png` | 1080x1350 | Dia D, slide 8. CTA do dia com a palavra-chave (SIMULADO, MACETE, FACULDADE, EMBARQUE, DESAFIO, LIVE) ou, sem palavra, salvar, compartilhar e debater; assinatura com CRM |
| `explicacao-1-resposta.png` | 1080x1350 | D+1, slide 1 (capa do post). "Resposta de ontem", carimbo com a letra, imagem do macete (ou da questão, no enxuto), a resposta e, no pé, o gancho da questão de hoje |
| `explicacao-2-certa.png` | 1080x1350 | D+1, slide 2. Por que a certa está certa e os termos-chave em inglês |
| `explicacao-3-erradas.png` | 1080x1350 | D+1, slide 3. Uma explicação por alternativa errada (só no completo) |
| `explicacao-4-macete.png` | 1080x1350 | D+1, slide 4. Placa "macete", imagem do macete, cartão de revisão, personagem e fala |
| `explicacao-4-macete-enxuto.png` | 1080x1350 | D+1, slide 3 do modo enxuto. O mesmo macete sem imagem nova, com o avatar maior |
| `story-enquete.png` | 1080x1920 | Dia D, 12h06. Gancho, vinheta, alternativas curtas e área livre para o adesivo de ENQUETE (A, B, C, D), sem gabarito |
| `story-enquete-guia.png` | 1080x1920 | Não posta. Mostra onde encaixar a enquete |
| `story-gabarito.png` | 1080x1920 | D+1, 12h05. Resultado da enquete de ontem (quatro barras para escrever as porcentagens), "segunda chance" e área do adesivo de QUIZ com a letra certa |
| `story-gabarito-guia.png` | 1080x1920 | Não posta. Mostra onde escrever o resultado e encaixar o quiz |
| `story-desafio.png` | 1080x1920 | Só nos 30 dias de cada edição do desafio, 12h08: "dia X de 30" e a grade de progresso |
| `desafio-cartela.png` | 1080x1920 | Só no primeiro dia de cada edição: a cartela que a resposta automática do DESAFIO manda no direct |
| `capa-reel.png` | 1080x1920 | Opcional, quando o JSON tem `reel` ou com `--reel`. Os Reels semanais saem do projeto `reels/` |
| `legenda.txt` | | Legenda do post do dia D, na ordem dos slides: "Ontem deu X", o gabarito de ontem com os termos da resposta, a questão de hoje com palavras-chave neutras, o CTA com palavra-chave (sem endereço escrito), a linha do desafio, assinatura, aviso e hashtags |
| `stories.txt` | | Roteiro dos stories do dia: quiz do gabarito de ontem às 12h05 (com a letra certa), enquete de hoje às 12h06, certeza, resultado parcial, desafio, live, placar e links com UTM |
| `manifesto.json` | | Datas de publicação, CTA, imagens pendentes e avisos |
| `post-do-dia/` | | O carrossel do feed do dia D, modo completo, numerado de 01 a 08 |
| `post-do-dia-enxuto/` | | O mesmo post no modo enxuto, de 01 a 06 |

**O post do feed junta dois dias, com a recompensa primeiro.** A explicação do dia N fica na pasta do dia N, mas é publicada no dia N+1. A pasta `post-do-dia/` do dia N+1 recebe, nesta ordem, os quatro slides do gabarito N (`01-gabarito-NNN-resposta.png` a `04-gabarito-NNN-macete.png`) e os quatro da questão N+1 (`05` a `08`). O modo enxuto (`post-do-dia-enxuto/`) tem resposta, porquê e macete sem imagem, e depois capa, vinheta e responda. É a rotina D e D+1 do `PROGRAMA.md`, seção 4. No dia 1 o post tem só a questão. Renderizar o dia N também refaz o `post-do-dia/` do dia N+1, se ele já existir. O Instagram aceita até 20 imagens por carrossel.

## Fluxo de produção

1. Os 365 dias já estão escritos em `instagram/dias/dias-XXX-YYY.json`. `node instagram/ferramentas/validar-dias.mjs` confere o ano e grava `instagram/questoes/dia-NNN.json`, que é o que o render lê. Para um dia novo, copie `modelo-dia.json` e escreva a partir do `calendario.json` (campos `topico`, `conceito`, `tipo_pergunta`, `personagem`, `gancho_data` e, no domingo, `remix_de`).
2. Gere as duas imagens no Higgsfield (Nano Banana Pro, 2k, 4:5) com os prompts prontos da aba "Prompts das imagens" de `entregas/instagram-365-dias.xlsx` e salve como `instagram/imagens/dia-NNN.png` (questão) e `instagram/imagens/dia-NNN-macete.png` (explicação). Aceita `.png`, `.jpg`, `.webp` e `.svg`.
3. Rode `render.mjs --dia NNN`. Corrija o que aparecer com `x` (erro, bloqueia) e confira o que aparecer com `!` (aviso).
4. Abra os PNG, poste `post-do-dia/` (ou `post-do-dia-enxuto/`) com a `legenda.txt` e siga o `stories.txt`. Os adesivos de enquete e de quiz só entram pelo celular, na hora de postar.

Sem imagem, a peça sai com a marca **IMAGEM PENDENTE**, o nome esperado do arquivo e a descrição da cena. O `manifesto.json` lista o que falta.

## Imagem anedótica

- Proporção 4:5 (1080x1350 ou maior), como no prompt base. Na capa ela ocupa a tela inteira.
- A placa verde do gancho cobre cerca de 40% de baixo da capa. Peça na geração: "personagem e elemento principal na metade de cima, terço inferior com chão liso e sem detalhes". O canto de cima à direita recebe o selo do quadro, e o de cima à esquerda, o escudo do Step.
- No story, a mesma imagem vira uma miniatura em 4:5; no reel, um quadro quase quadrado. Use `imagem.foco` (o `object-position` do CSS, por exemplo `"50% 30%"`) para escolher o recorte.
- Sem texto dentro da imagem: o texto fica no template.
- `imagem_macete` (opcional) põe uma segunda imagem no slide do macete. Sem caminho, procura `dia-NNN-macete.png`.

## Campos do JSON

O que não estiver no JSON vem do `calendario.json` pelo número do dia (data, dia da semana, quadro, Step, área, personagem, gancho de data, remix e data da explicação). Qualquer um desses campos pode ser sobrescrito no JSON.

| Campo | Obrigatório | Uso |
|---|---|---|
| `dia` | não | Se existir, precisa bater com o nome do arquivo |
| `gancho` | sim | Capa, story e reel. Português. `*palavra*` sai em destaque (amarelo na placa, vermelho no papel) |
| `gancho_apoio` | não | Linha menor na placa da capa |
| `imagem.arquivo`, `cena`, `foco`, `alt` | não | Caminho relativo ao JSON, a `instagram/imagens` ou à raiz. Sem `arquivo`, usa `dia-NNN.*` |
| `questao.vinheta`, `pergunta` | sim | Inglês. As duas juntas com até 60 palavras |
| `questao.alternativas` | sim | Exatamente A, B, C e D. Texto simples ou `{ "texto", "quiz", "dia" }`. `quiz` é a versão de até 30 caracteres para o adesivo; `dia` marca "visto no dia X" no remix |
| `questao.correta` | sim | A, B, C ou D |
| `explicacao.titulo` | não | Título do porquê (também vai na "resposta de ontem") |
| `explicacao.certa` | sim | Lista de parágrafos em português, termos em inglês entre asteriscos |
| `explicacao.termos` | não | Termos-chave em inglês (slide e legenda) |
| `explicacao.erradas` | sim | Uma explicação para cada letra errada |
| `explicacao.macete.frase`, `apoio`, `fala` | frase recomendada | Mnemônico, frase de apoio e fala do personagem (sem `fala`, usa o bordão fixo) |
| `legenda.contexto` | não | Duas ou três linhas da legenda |
| `legenda.palavras_chave` | sim | Três a cinco termos neutros da vinheta para a legenda do dia D. Os termos da resposta (`explicacao.termos`) nunca entram na legenda do dia D; vão no bloco do gabarito, no post do dia seguinte |
| `legenda.hashtags`, `cta_texto`, `cta_slide` | não | Sobrescrevem o padrão. `cta_texto` não pode ter endereço escrito (o validador bloqueia) |
| `quiz.pergunta` | não | Pergunta da enquete do dia D e do quiz do D+1 (padrão: "Qual é a sua letra?") |
| `cta_forcado` | não | `simulado`, `macete`, `verificador`, `pre_inscricao`, `desafio`, `live`, `compartilhar`, `debate` ou `salvar`. Sem ele, o CTA sai de `instagram/conversao.json`: palavra-chave por quadro, inscrição do desafio, dia da live e sábado antes, primeira quarta do mês (`PROGRAMA.md`, seção 9) |
| `tom` | não | `acolhedor` troca a placa verde por navy e tira as maiúsculas do gancho. Entra sozinho em 12 dias do calendário: 1, 30, 74, 95, 136, 140, 152, 313, 324, 334, 343 e 365 (lista `DATAS_ACOLHEDORAS` em `lib/dados.mjs`, mais os ganchos que pedem tom respeitoso). Use `"tom": "normal"` para desligar, por exemplo na festa do dia 365 |
| `reel.titulo` | não | Liga a capa de reel; sem título, usa o gancho |
| `exemplo` | não | `true` põe a faixa "EXEMPLO DE TESTE · NÃO POSTAR" em todas as peças |

## Conferências automáticas

Bloqueiam a renderização (`x`):

- vinheta e pergunta com mais de 60 palavras; número de alternativas diferente de 4 ou fora da ordem A a D; `correta` inválida; falta de explicação para alguma letra errada;
- alternativa com `quiz` acima de 30 caracteres;
- travessão ou meia-risca em qualquer texto;
- promessa proibida pela Res. CFM 2.336/2023 ("aprovação garantida", "passe no Step" e parecidas);
- **cópia do banco privado**: vinheta, pergunta, explicação, erradas e macete são comparados com os lotes de `banco-privado/step1` e `banco-privado/step2ck` em sequências de 8 palavras (minúsculas, sem acento, números trocados por #). Sequências que aparecem em 3 ou mais itens do banco são linguagem padrão de vinheta e não contam. O aviso mostra só o trecho do JSON do Instagram e o id do item, nunca o texto do banco.

Só avisam (`!`): imagem pendente, alternativa longa sem `quiz`, jargão de IA na parte em português, remix sem a marca de dia, CRM ainda como `[número]` no `config.json`, JSON de exemplo e texto que não coube nem no tamanho mínimo de fonte (encurte).

Nas datas com CVV no calendário (Setembro Amarelo), os slides de texto e o story ganham a faixa "CVV 188" e a legenda recebe a linha do CVV.

## Layout e legibilidade

- Corpo do texto entre 30 e 50 px nos slides de 1080 de largura (11 a 18 pt num celular de 390 pt). Cada bloco de texto começa grande e encolhe até caber (`data-fit` em `lib/slides.mjs`); quando chega ao mínimo, o render avisa.
- Story: nada essencial acima de 230 px (barra do Instagram) nem abaixo de 1770 px (campo de resposta). O adesivo de quiz vai entre 1318 e 1710 px.
- Capa de reel: título, imagem e marca dentro do recorte 3:4 do perfil (de 240 a 1680 px).

## Arquivos

- `render.mjs`: linha de comando, Playwright, montagem do `post-do-dia/`, legenda, stories e manifesto.
- `lib/dados.mjs`: leitura do JSON, junção com o calendário e conferências.
- `lib/banco.mjs`: comparação com o banco privado.
- `lib/slides.mjs`: HTML de cada peça, escudo, selo, carimbo, ícones e personagens.
- `lib/legenda.mjs`: legenda, roteiro dos stories e links com UTM.
- `lib/conversao.mjs`: CTA do dia, frases com palavra-chave, desafio, live e textos da resposta automática (lê `instagram/conversao.json`).
- `estilo.css`: o visual. As cores e as fontes são as de `assets/css/base.css`.
- `config.json`: assinatura (preencha o CRM; especialidade só com RQE), links, UTM, aviso, hashtags e limites.
- `modelo-dia.json`: JSON em branco para copiar.
- `exemplos/`: três dias inventados para teste (7, remix; 8, com imagem; 9, sem imagem) e duas ilustrações SVG simples. Não são conteúdo final e saem com a faixa de exemplo.

## Antes de postar

- O `config.json` já assina com CRM-DF 13610. A especialidade só entra com `rqe` e `especialidade` preenchidos e conferidos.
- Conferir condutas e números na fonte primária e passar pela revisão do segundo médico (`PROGRAMA.md`, seção 12).
- Apagar a pasta de saída dos exemplos (`instagram/saida/dia-007` a `dia-009`) quando os dias reais forem renderizados, ou renderizar por cima.
