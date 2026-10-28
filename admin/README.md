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

## Arquivos

```
admin/
  index.html          página única (rotas por #/...)
  admin.css           estilos próprios (usa ../assets/css/base.css e ../anki/anki.css)
  js/app.js           inicialização, controle de acesso, rotas, tema e menu
  js/calculos.js      cálculos das telas (funções puras, testadas)
  js/graficos.js      gráficos em SVG sem biblioteca
  js/views/           turma, participantes, ficha, metas, bloqueio, acoes (importar CSV), comum
  tests/calculos.test.mjs   node:test dos cálculos
  tests/regras-conhecidas.test.mjs  regras conferidas com dados montados à mão
  tests/fluxos.e2e.mjs      fluxos no navegador com Playwright
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
```

Os fluxos sobem um servidor estático próprio e conferem: admin vê turma, lista e ficha
sem erro no console; participante e visitante caem no acesso negado; edição e importação
de presença; verificação de NBME; exportação CSV com e sem e-mails; participante lança
NBME em "Meu progresso" e o admin vê na ficha; nenhuma tela com rolagem horizontal em
390 px nos temas claro e escuro; a data da prova apagada em "Meu progresso" não volta.
