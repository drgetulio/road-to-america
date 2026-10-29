# Banco de questões (espaço do aluno)

Página `questoes/` da área do aluno: itens no estilo NBME do Step 1 e do Step 2 CK, em
blocos personalizados, com desempenho por área, curva de evolução e o painel de
posição em relação ao limiar do banco. Mesmo login, mesma camada de dados e mesmo menu do app de
flashcards (`anki/`). Site estático, módulos ES, sem etapa de build.

## Telas

| Rota | O que tem |
|---|---|
| `#/` | placas EXIT com a posição em relação ao limiar do banco no Step 1 e no Step 2 CK, bloco em andamento, atalhos (bloco de prova de 20 itens cronometrado, refazer erradas, rever marcadas), números do aluno e últimos blocos |
| `#/criar` | bloco personalizado: Step; sistemas, disciplinas, competências e, no Step 2 CK, disciplinas clínicas, áreas e tarefas; não vistas, erradas, marcadas ou todas; de 1 a 20 itens (até 40 no modo livre); tutor ou cronometrado. As contagens mudam a cada escolha. A rota aceita parâmetros (`?step=step1&sistema=cardiovascular&situacao=erradas&modo=tutor&n=10`) |
| `#/bloco` | bloco em andamento, na mesma tela do simulado (`simulado/js/interface-bloco.js`): navegação, marcar, riscar, realçar, valores laboratoriais, calculadora, anotações, revisão do bloco, atalhos de teclado. Cronometrado: 90 s por item, relógio regressivo, encerra sozinho. Tutor: relógio conta o tempo gasto; ao confirmar a resposta, a alternativa trava, a correta aparece e a explicação vem logo abaixo |
| `#/blocos` | histórico de blocos, por Step |
| `#/resultado/<id>` | acerto contra o examinando no limiar (média da dificuldade-alvo dos mesmos itens), tempo contra o ritmo de 90 s, acerto por área, revisão de cada questão com a explicação de cada alternativa, resumo em português, fonte, anotação e reporte de erro; botão para refazer as erradas no modo tutor |
| `#/desempenho` | perfil por sistema, disciplina e competência em relação ao limiar (mais baixo, igual, mais alto), como no relatório oficial de reprovação; curva de evolução da probabilidade com tabela |
| `#/aprovacao` | painel de posição em relação ao limiar do banco (abaixo) |

## Painel de posição em relação ao limiar do banco

Para cada Step: probabilidade de estar acima do limiar do banco (no Step 2 CK, de atingir
o padrão de 218 pelo limiar do banco), intervalo de 90% da habilidade, percentual esperado
num formulário completo e acerto do limiar, gráfico da distribuição posterior, as três
condições da precisão alta (probabilidade decidida, itens suficientes, sistemas
cobertos) com quantos itens e quais sistemas faltam, as áreas que mais derrubam a
probabilidade (contribuição de cada área), recomendações de estudo com links para o
Conteúdo do Step 1, os flashcards e blocos filtrados, e a prontidão combinada com a
EXIT 18, que continua decidindo. O método, as fórmulas, a validação e as limitações estão
em `plataforma/PSICOMETRIA.md` (seções 3 a 10 e 18).

## Dados

- Itens: `store.listQuestoes()` por `carregarBanco()` (`plataforma/js/banco.js`). No modo
  demonstração, os 80 itens públicos de `simulado/data/`; com `?banco=completo` em
  `localhost`, o banco de `banco-privado/` (ver `plataforma/README.md`). No Supabase, a
  tabela `questoes`, só com a matrícula ativa.
- Respostas: `store.saveRespostas()` no fim de cada bloco, uma linha por item, com
  `origem: "banco"`. Se a gravação falhar, as linhas ficam no navegador
  (`r2a-questoes-pendentes-v1`) e são enviadas na próxima visita da mesma conta. Como a
  tabela `respostas_item` não tem chave única por bloco e a gravação pode ter chegado ao
  servidor mesmo com erro de rede, o bloco cujo `sessao_id` já está na conta não é
  reenviado, e `resumoBlocos()` conta uma vez a linha repetida.
- Bloco em andamento: no navegador (`r2a-questoes-andamento-v1`), com o dono; recarregar a
  página retoma o bloco. No cronometrado, o tempo com a página fechada continua contando.
  Se o prazo vence fora da tela do bloco (cronometrado: o relógio; tutor: 24 horas), a
  próxima tela aberta encerra o bloco pelo tempo, grava as respostas e avisa
  (`ctx.fecharVencido()`); sem isso o bloco vencido impediria começar outro.
- Em branco: no cronometrado, conta como erro na estimativa, como na prova; no tutor, fica
  fora (`PSICOMETRIA.md`, seção 4).
- Anotações: `store.saveAnotacaoItem()`, uma por item, na conta; voltam sempre que o item
  aparecer.
- Reporte de erro: `store.reportarItem()` com os motivos de `MOTIVOS_REPORTE`.

## Arquivos

```
questoes/
  index.html, questoes.css, icons/ (subconjunto Phosphor, comando abaixo)
  js/app.js          inicialização, conta, menu e rotas
  js/comum.js        nomes, formatação, seletor de Step, gráficos em SVG
  js/local.js        bloco em andamento, respostas pendentes e preferências no navegador
  js/iniciar.js      começar um bloco (formulário, atalhos, erradas de um bloco)
  js/explicacao.js   explicação do item e reporte de erro
  js/views/          inicio, criar, bloco, blocos, resultado, desempenho, aprovacao
  tests/fluxos.e2e.mjs
plataforma/js/banco-aluno.js   lógica pura (filtros, sessão, histórico, curva, contribuição, recomendações)
```

Ícones: `python3 tools/build-icons.py <@phosphor-icons/web> --app questoes --extra simulado/js/interface-bloco.js,simulado/js/dom.js,anki/js/ui.js,anki/js/menu.js`.

## Testes

```bash
node --test plataforma/tests/banco-aluno.test.mjs
AXE_PATH=/caminho/para/axe-core/axe.min.js node questoes/tests/fluxos.e2e.mjs [pasta-das-capturas]
```

O teste de navegador percorre, em 1440 e 390 px e nos temas claro e escuro: bloco tutor
(confirmar, explicação, alternativa travada, encerrar, revisar), bloco cronometrado até o
tempo acabar (5 itens, 7:30), desempenho, painel dos dois Steps, cartão em "Meu
progresso", links do menu e do simulado e bloco cronometrado que vence com o aluno fora
dele (encerrado e gravado na tela seguinte), com axe-core (WCAG 2.1 A e AA) sem
violações, sem rolagem horizontal e sem erro de console. São 32 etapas.
