# Área administrativa de rendimento

Servida em `https://drgetulio.github.io/road-to-america/admin/`. Site estático, sem
build: HTML, CSS e módulos ES, com o mesmo login e a mesma camada de dados do app de
flashcards (`anki/`, ver `plataforma/INTERFACE.md`). Só administradores entram;
participante ou visitante vê a tela de acesso negado, com link para "Meu progresso" e
para os flashcards. No modo demonstração (`anki/config.js` vazio) a tela mostra a coorte
sintética de 16 participantes fictícios com a faixa fixa "dados de demonstração".

## Telas

| Rota | O que mostra |
|---|---|
| `#/` Turma | 8 indicadores (ativos em 7 dias, revisões por dia, retenção real contra desejada e mínima, média e variação dos simulados por Step, garantia em dia, em risco, prontos pela EXIT 18), fila de quem precisa de atenção com o motivo e a ação sugerida, contagem por critério de risco e por situação da garantia, revisões da turma por dia, retenção real por participante, média semanal dos simulados por Step e áreas mais fracas por sistema, área, disciplina e tarefa. Cada indicador abre a lista já filtrada. |
| `#/participantes` | Tabela ordenável (cabeçalhos clicáveis com `aria-sort`) e filtrável por situação, Step em preparo, turma, garantia e inatividade, com busca por nome ou e-mail. Os filtros ficam no endereço. Abaixo de 900 px a tabela vira lista de fichas. Exportação CSV do que está filtrado, sem e-mails por padrão. Importação de presença por CSV. |
| `#/p/<id>` Ficha | Sinais de risco com o motivo, sugestões de ação com prioridade e motivo, checklist da garantia, prontidão pela EXIT 18 com as duas autoavaliações consideradas, mapa de calor de 26 semanas, revisões e retenção por semana, situação dos cards, simulados com acerto por sistema, NBMEs (marcar e desfazer verificação, excluir), presença (editar ou importar CSV), plano e datas, anotações do mentor e relatório para imprimir (sem as anotações). |
| `#/metas` | Limites dos critérios de risco e da prontidão, com a origem de cada um; os contratuais vêm marcados. |
| `#/itens?step=` Análise de itens | Tabela de todos os itens do Step com respostas, dificuldade p, discriminação (ponto-bisserial corrigida e D), dificuldade-alvo, b em uso (da dificuldade-alvo ou calibrado, com erro-padrão), infit e outfit, alertas e situação (no banco, retirado, em revisão, reportes abertos, versão). Filtros por sistema, disciplina, competência (tarefa do médico no Step 2 CK), alerta e situação, busca pelo identificador e ordem por prioridade de revisão, todos no endereço. Fila dos reportes de erro abertos. |
| `#/item/<id>` Ficha do item | Enunciado com o gabarito, índices e alertas (provisórios com menos de 30 respostas), distratores por quartil de habilidade (gráfico de curva de cada alternativa e tabela com a ponto-bisserial de cada opção), reportes dos alunos com resposta da equipe, ações (marcar para revisão com nota, retirar do banco ou devolver, corrigir o gabarito com motivo obrigatório e recorreção opcional das respostas) e histórico de versões. |
| `#/calibracao?step=` Calibração | Prévia da recalibração de Rasch com a turma (dispersão do b da dificuldade-alvo contra o novo, maiores mudanças, convergência), gravação e volta à dificuldade-alvo; lançamento de desfechos reais (Pass/Fail; nota no Step 2 CK); regressão logística do Pass/Fail sobre o θ (curva, coeficientes, área sob a curva ROC, Brier, θ com 50% de Pass), regressões lineares das notas NBME e oficiais e gravação do modelo para as telas dos alunos. |
| `#/blueprint?step=` Blueprint | Itens ativos por sistema, disciplina (todos os rótulos) e competência ou tarefa do médico contra as faixas oficiais, com o que um formulário completo pede de cada linha, quantos formulários sem repetição o banco sustenta e a conferência dos formulários fixos A e B (partição do banco, sem item em comum; B pode sair parcial), com a origem (gravado em `banco-privado/formularios.json` ou calculado) e o corte provisório pela dificuldade-alvo média. |
| `#/angoff` Painel Angoff | Painéis de juízes para o corte Angoff modificado. O admin cria o painel com itens de um formulário fixo, designa os juízes (mentores; aluno com matrícula ativa não pode), conduz as rodadas (fechar rodada, nova rodada, encerrar), vê o andamento de cada juiz, as estimativas por item com média e DP, o p observado, o corte com erro padrão, a verificação de Hofstee e a discussão, e publica os valores quando cada item tem pelo menos 10 juízes, o erro-padrão do corte fica abaixo de 0,02 e o corte passa na verificação de Hofstee (a publicação é recusada fora disso; sem Hofstee ou fora da janela, só com justificativa registrada). Em `#/angoff/<id>/avaliar` o juiz vê o item completo sem gabarito, dá a estimativa de 0 a 100 (o gabarito aparece depois de gravar) e, a partir da segunda rodada, vê a média do painel, a própria estimativa anterior, o p observado e os comentários. Juiz que não é admin só acessa esta tela. |

A visão da turma ganhou o painel **Posição em relação ao limiar do banco de questões**
(distribuição da turma por Step, ponto cheio para precisão alta e anel para estimativa
preliminar, e a lista do critério novo), a lista de participantes ganhou a coluna
**Banco** (probabilidade no Step em preparo, ordenável e no CSV) e a ficha ganhou o cartão
de cada Step com a probabilidade, o rótulo de confiança, o θ com intervalo de 90%, o
percentual esperado num formulário completo, o que falta para a precisão alta, o perfil
por sistema em relação ao examinando no limiar, a leitura combinada com a EXIT 18 e os
resultados oficiais lançados.

## Arquivos

```
admin/
  index.html          página única (rotas por #/...)
  admin.css           estilos próprios (usa ../assets/css/base.css e ../anki/anki.css)
  js/app.js           inicialização, controle de acesso, rotas, tema e menu
  js/calculos.js      cálculos das telas (funções puras, testadas)
  js/analise.js       banco de questões: análise de itens, quartis, probabilidade da turma,
                      critério de risco do banco e cobertura do blueprint (funções puras)
  js/graficos.js      gráficos em SVG sem biblioteca
  js/views/           turma, participantes, ficha, metas, bloqueio, acoes (importar CSV), comum,
                      itens, item, calibracao, blueprint, angoff (painel de juízes)
  tests/calculos.test.mjs   node:test dos cálculos
  tests/regras-conhecidas.test.mjs  regras conferidas com dados montados à mão
  tests/analise.test.mjs    node:test do banco de questões no painel e dos dados fictícios
  tests/fluxos.e2e.mjs      fluxos no navegador com Playwright
  tests/banco.e2e.mjs       fluxos do banco de questões com Playwright e axe-core
```

Ícones: a área usa o subconjunto de `anki/icons/` e só nomes que o app de flashcards
já usa (lista no topo de `js/app.js`), para que um novo `tools/build-icons.py --app anki`
não os apague.

## Regras que a tela acrescenta

As regras de risco, garantia e prontidão estão em `plataforma/js/desempenho.js`. A tela
só acrescenta leituras, documentadas no código:

- **Situação da garantia hoje** (`plataforma/js/acompanhamento.js`): como a garantia é
  conferida ao fim do prazo, a tela mostra se o participante está no ritmo. "Em dia":
  presença de pelo menos 80% e NBMEs no ritmo da data de prova; "atrasada": presença
  abaixo de 80% ou critério `nbme_insuficiente` aceso; "sem presença lançada";
  "falta verificar NBME"; "cumprida".
- **Turma**: não existe campo de turma no cadastro; a tela agrupa pelo semestre da data
  de matrícula ("Matrícula 2026/2").
- **Retenção desejada**: 90%, a do preset da EXIT 04 e padrão do app. A dos Ajustes de
  cada participante não chega ao painel.
- **Revisões por dia**: média dos últimos 7 dias completos (o dia de hoje fica de fora);
  a mediana por participante ativo usa os mesmos 7 dias.
- **Prontidão sem faixa**: probabilidade de 90% ou mais nas duas últimas sem a faixa provável
  informada aparece como "Falta confirmar a faixa" (selo "OK?" na ficha) e não entra em
  "Prontos pela EXIT 18".
- **Checklist da garantia**: autoavaliações que ainda não são cobradas (prova a mais de 60
  dias ou sem data, prazo aberto) aparecem "em andamento", não como pendência.
- **Simulados da turma**: médias, tendência e áreas fracas só contam tentativas de
  participantes (as dos administradores ficam de fora).
- **Simulados**: média das tentativas dos últimos 14 dias contra os 14 anteriores; áreas
  só com pelo menos 4 questões somadas nos últimos 60 dias. Na ficha e em "Meu progresso",
  áreas com menos de 4 questões ficam em cinza, no fim da lista, sem o vermelho da meta.
- **Sugestões de ação** (`sugestoesAcao`): agendar conversa (inatividade ou risco),
  retomar só com revisões, reduzir novos cards e rever o uso de Errei e Difícil (retenção
  baixa, EXIT 04), Clínica de leeches a partir de 8 leeches (EXIT 12), caderno de erros
  (EXIT 07) e revisão do sistema ou área abaixo da meta, treino de ritmo quando dois dos
  três últimos simulados acabam pelo tempo, recuperação de aulas, programação das NBMEs,
  conversa de 20 minutos da EXIT 18 a até 21 dias da prova, verificação de NBMEs e
  lançamento de matrícula e presença.

## Banco de questões no painel

Método em `plataforma/PSICOMETRIA.md`, seções 11 a 13 e 19. O que a tela acrescenta:

- **Critério de risco "Probabilidade baixa no banco, com precisão alta"**
  (`banco_probabilidade_baixa`, nível alto): probabilidade de estar acima do limiar do banco de até 10% com
  precisão alta (a mesma regra de confiança do banco) num Step ainda não aprovado. Entra
  na situação do participante pela regra de `desempenho.js` (um critério alto põe em
  risco), na fila de atenção, na contagem por critério, na lista e na ficha, com a
  sugestão de ação "Rever com o aluno o plano e a data". Estimativa preliminar nunca
  acende o critério, por mais baixa que seja. A EXIT 18 continua decidindo a prontidão.
- **Distratores por quartil**: as pessoas da matriz pseudonimizada são divididas em quatro
  grupos iguais pelo θ EAP de todos os itens que responderam no Step (b calibrado quando
  houver). Com menos de 8 pessoas não há quartis.
- **Ações sobre o item** (`editarGabarito`, `marcarRevisaoQuestao`,
  `setStatusQuestao(id, status, { motivo })`, `listHistoricoQuestao`): marcar para revisão
  não tira o item do banco; retirar (suspenso ou aposentado) tira dos blocos, dos
  simulados montados depois e da estimativa dos alunos; corrigir o gabarito sobe a
  versão, apaga a calibração do item e, com recorreção, faz as respostas já gravadas
  na versão em vigor valerem pela alternativa nova (as de uma versão de conteúdo
  anterior continuam fora). Tudo fica em `questoes_historico` com o motivo.
- **Modo demonstração**: as respostas, os desfechos e os reportes são fictícios
  (`plataforma/js/respostas-demo.js`), com o selo "dados de demonstração" em cada tela do
  banco. Além dos participantes fictícios, entram examinandos de "turmas anteriores"
  simuladas (ids `demo-sint-cal-...`), que não aparecem na lista e existem para a
  calibração ter cerca de 45 respostas por item. Alguns itens recebem um defeito plantado
  (gabarito trocado, pouco discriminativo, muito difícil, muito fácil); a ficha do item
  avisa quando é o caso e diz que o item público não tem erro conhecido. Com os 40 itens
  públicos por Step ninguém chega à precisão alta; para ver o critério de risco aceso,
  sirva o banco completo em `localhost` com `?banco=completo` (o e2e serve um banco
  sintético de 320 itens por Step no lugar de `banco-privado/`).
- **Supabase**: aplique o `supabase/schema.sql` atual (colunas `em_revisao` e
  `revisao_nota`, tabela `questoes_historico` e funções `r2a_admin_editar_gabarito`,
  `r2a_admin_marcar_revisao` e `r2a_admin_status_questao`; testes Q10a a Q10v em
  `02-testa-rls.sql`). Se o banco não abrir (schema antigo, por exemplo), o painel continua
  sem a probabilidade e avisa.

## Proteção de dados

A lista não mostra e-mails (a busca considera; a ficha mostra o contato). O CSV só leva
e-mails quando o admin marca a opção. Toda tela traz o aviso de uso para acompanhamento
pedagógico e da garantia, com link para a Política de Privacidade. As anotações do mentor
não aparecem para o participante nem no relatório impresso, mas ele pode pedir cópia pela
LGPD (art. 18); a ficha lembra isso no campo. A Política de Privacidade (`privacidade.html`)
ganhou a seção "Na área do aluno, depois da matrícula", com os dados tratados, a finalidade,
a base legal (execução do contrato, art. 7º, V) e a guarda; o texto é uma proposta e precisa
da revisão de quem responde juridicamente pelo curso.

## Testes

```bash
node --test admin/tests/*.test.mjs     # cálculos (na raiz do repositório)
node admin/tests/fluxos.e2e.mjs [pasta-das-capturas]
AXE_PATH=/caminho/axe.min.js node admin/tests/banco.e2e.mjs [pasta-das-capturas]
```

`banco.e2e.mjs` confere a análise de itens (filtros, ficha, distratores, reporte, marca de
revisão, correção de gabarito com versão e histórico, retirada do banco), a recalibração
(prévia, gravação, volta à dificuldade-alvo), o lançamento de desfecho e a regressão salva, o
blueprint com os formulários fixos A e B, o painel Angoff (item sem gabarito até a
estimativa, duas rodadas com retorno e discussão, Hofstee e publicação), o critério de
risco do banco com um banco sintético grande e, em 1440 e 390 px nos temas claro e escuro, axe-core sem violações WCAG A e AA e
nenhuma rolagem horizontal em todas as telas novas.

Os fluxos sobem um servidor estático próprio e conferem: admin vê turma, lista e ficha
sem erro no console; participante e visitante caem no acesso negado; edição e importação
de presença; verificação de NBME; exportação CSV com e sem e-mails; participante lança
NBME em "Meu progresso" e o admin vê na ficha; nenhuma tela com rolagem horizontal em
390 px nos temas claro e escuro; a data da prova apagada em "Meu progresso" não volta.
