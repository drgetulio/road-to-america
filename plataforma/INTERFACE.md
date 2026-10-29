# Plataforma Road to America: interface da camada de dados

Este documento descreve o que as telas do **simulado de 30 minutos** e da **área
administrativa de rendimento** podem chamar. A camada de dados é a mesma do app de
flashcards (`anki/`), com o mesmo login e a mesma sessão, nos dois modos:

| Modo | Classe | Quando |
|---|---|---|
| Demonstração | `LocalStore` em `anki/js/store-local.js` | `anki/config.js` vazio. Dados no `localStorage` deste navegador. |
| Supabase | `SupabaseStore` em `anki/js/store-supabase.js` | `anki/config.js` preenchido. Regras no banco (`supabase/schema.sql`). |

As duas classes têm os mesmos métodos públicos (um teste confere isso). A única
exceção é `resetDemo()`, que só existe no modo demonstração.

## Arquivos

```
plataforma/
  INTERFACE.md          este documento
  PSICOMETRIA.md        método psicométrico do banco (fórmulas, validação e limitações)
  README.md             importação do banco para o Supabase e modo de desenvolvimento
  CONTRATO-ITEM.md      formato de cada questão do banco
  js/banco.js           carregador do banco: leitura, normalização, validação, índice e taxonomia do outline
  js/psicometria.js     Rasch ancorado no Angoff, EAP, P(aprovação), confiança, perfil por área,
                        análise de itens, recalibração e regressão com desfechos (funções puras)
  js/formularios.js     formulários no formato oficial (completo, meio, prontidão) e relógio do simulado completo
  js/calibracao.js      rotinas do admin: recalibrar com a turma e ajustar modelos com desfechos reais
  js/registros.js       validação dos registros novos (respostas, simulados completos, reportes...)
  js/respostas-demo.js  respostas sintéticas da coorte de demonstração (só modo demonstração)
  js/simulado.js        formato oficial, sorteio estratificado e correção (funções puras)
  js/desempenho.js      linha de resumo, critérios de risco, garantia e prontidão (funções puras)
  js/coorte-demo.js     coorte sintética do modo demonstração
  js/acompanhamento.js  textos de tela compartilhados pelo admin/ e por "Meu progresso":
                        checklist da garantia, situação da garantia hoje, leitura da
                        prontidão, nomes de sistemas e áreas, formatação
  tests/                node:test (simulado, desempenho e camadas de dados)
supabase/
  schema.sql            tabelas, gatilhos, RLS e funções do painel (seção PLATAFORMA)
  teste-local/02-testa-rls.sql       testes de RLS (blocos P1 a P9 para a plataforma; P9 tenta ataques
                                     com os privilégios padrão do Supabase simulados no 01)
  teste-local/03-compara-resumo.mjs  confere se o resumo do banco é igual ao do JavaScript
  teste-local/04-compara-itens.mjs   confere se as estatísticas de itens do banco são iguais às do JavaScript
tools/
  importar-banco.mjs    importa banco-privado/ para a tabela questoes (plataforma/README.md)
```

## Como abrir a camada de dados numa página nova

Exemplo para uma página em `plataforma/` ou `simulado/` (um nível abaixo da raiz):

```js
import config from "../anki/config.js";
import { LocalStore } from "../anki/js/store-local.js";
import { SupabaseStore } from "../anki/js/store-supabase.js";
import { loadSeeds, loadTaxonomy } from "../anki/js/data.js";

const usaSupabase = !!(config.supabaseUrl && config.supabaseAnonKey);
let store;
if (usaSupabase) {
  store = new SupabaseStore({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey, vendorUrl: "../anki/vendor/supabase.umd.js" });
  await store.init();                 // store.user é null sem login: mande para ../anki/#/entrar
} else {
  store = new LocalStore();
  const tax = await loadTaxonomy("../anki/data/");
  const { cards } = await loadSeeds(tax, "../anki/data/");
  await store.init({ seeds: cards }); // os cards oficiais entram na cobertura da coorte
}
const u = store.user;                 // { id, nome, email, papel: "admin" | "participante" }
```

- No modo demonstração, o papel é trocado com `store.setDemoRole("admin" | "participante")`
  (o app de flashcards já tem esse seletor). A interface deve mostrar o selo
  **"Demonstração"** como o app faz.
- No modo Supabase, a sessão fica no `localStorage` da origem
  (`drgetulio.github.io`) e vale para todas as páginas do site. O login continua em
  `anki/#/entrar`.
- Erros de permissão chegam como `PermissionError` (de `anki/js/permissions.js`);
  erros de validação, como `Error` com a mensagem em português pronta para exibir.

## Simulado de 30 minutos (`plataforma/js/simulado.js`)

Formato oficial (consulta em usmle.org em 28/10/2026):

| | Step 1 | Step 2 CK |
|---|---|---|
| Vigente desde | 14/05/2026 | 07/05/2026 |
| Blocos | 14 de 30 minutos | 16 de 30 minutos |
| Questões por bloco | até 20 | até 20 |
| Total no dia | até 280, sessão de 8 h | até 318, sessão de 9 h |
| Fonte | https://www.usmle.org/step-exams/step-1 | https://www.usmle.org/step-exams/step-2-ck |

Um bloco encerrado não reabre; a revisão acontece só dentro do bloco
(https://www.usmle.org/bulletin-information/examination-day-testing). O simulado
reproduz um bloco: **20 questões em 30 minutos nos dois Steps, 90 s por questão em média.**

Exportações:

| Nome | O que é |
|---|---|
| `STEPS` | `["step1", "step2ck"]` |
| `NOME_STEP` | `{ step1: "Step 1", step2ck: "Step 2 CK" }` |
| `FORMATO_OFICIAL[step]` | `{ blocos, minutos_por_bloco, questoes_por_bloco, questoes_max, horas_sessao, vigente_desde, fonte }` |
| `SIMULADO_30` | `{ questoes: 20, duracao_ms: 1800000, ritmo_ms: 90000, modo: "bloco_30min" }` |
| `ROTULO_CAMPOS[step]` | rótulos de `sistema` e `disciplina`. No Step 2 CK, `sistema` guarda a **área** (medicina interna, pediatria...) e `disciplina` guarda a **tarefa** (diagnóstico, manejo...). |
| `sortearQuestoes(banco, { n = 20, campo = "sistema", pesos, vistas = [], semente })` | Sorteio estratificado pelo campo (padrão: sistema no Step 1, área no Step 2 CK), com cotas pelo maior resto proporcionais à composição do banco ou aos `pesos` informados. Dentro do estrato, prefere questões fora de `vistas` e alterna dificuldade e disciplina. A ordem final é embaralhada para intercalar áreas. Mesma `semente`, mesmo sorteio. Devolve os objetos do banco na ordem de aplicação. |
| `corrigirTentativa({ step, questoes, respostas, marcadas, tempos_ms, inicio, fim, encerramento, limite_ms, versao_banco })` | Devolve o registro pronto para `saveSimulado`. `questoes` são os objetos do banco na ordem aplicada; `respostas[i]` é a letra ou `null`; `marcadas[i]` é booleano; `tempos_ms[i]` soma todo o tempo gasto na questão; `encerramento` é `"participante"` ou `"tempo"`. |
| `validarTentativa(t)` | lista de mensagens de erro (vazia = válida). As duas camadas chamam antes de gravar. |
| `desempenhoPorArea(tentativas, campo = "por_sistema")` | `[{ chave, total, acertos, taxa }]` somando tentativas, da pior para a melhor taxa. `campo`: `por_sistema`, `por_disciplina` ou `por_dificuldade`. |
| `ritmo(tentativa)` | `{ medio_ms, acima_do_ritmo }` (proporção de questões acima de 90 s). |

Bancos: `simulado/data/step1-questoes.json` e `simulado/data/step2ck-questoes.json`
(40 questões cada; campos `id, step, vinheta, pergunta, alternativas [{letra, texto}],
correta, explicacao, explicacao_pt, sistema, disciplina, dificuldade, tags, fonte`).
Os revisores pediram que a tela do simulado exiba a tabela de valores laboratoriais de
referência do USMLE durante a prova; ela fica a cargo da interface.

### Registro de uma tentativa (`Simulado`)

```js
{
  id, user_id, criado_em,                  // preenchidos pela camada de dados
  step: "step1" | "step2ck",
  modo: "bloco_30min",
  questoes: ["s1-012", ...],               // ids na ordem aplicada
  respostas: ["C", null, ...],             // letra marcada ou null
  marcadas: [false, true, ...],
  tempos_ms: [81000, ...],
  inicio, fim,                             // ISO 8601
  duracao_ms, limite_ms,                   // limite padrão 1.800.000
  total, acertos, percentual,              // percentual de 0 a 1
  em_branco,
  por_sistema:    { cardiovascular: { total: 2, acertos: 1 }, ... },
  por_disciplina: { patologia: { total: 4, acertos: 3 }, ... },
  por_dificuldade:{ facil: {...}, media: {...}, dificil: {...} },
  encerramento: "participante" | "tempo",
  versao_banco: ""
}
```

O acerto é calculado no navegador a partir do banco público. O banco de dados confere
coerência (tamanhos, acertos entre 0 e o total, fim não futuro), mas não a correção de
cada resposta: o simulado é formativo e não entra na garantia.

## Métodos da camada de dados

Todos são `async`. "Participante" e "admin" indicam quem pode chamar; o que está fora
disso lança `PermissionError` (ou, no Supabase, a RLS devolve vazio).

### Simulados

| Método | Participante | Admin | Retorno |
|---|---|---|---|
| `saveSimulado(t)` | grava a própria (o dono é sempre ele) | idem | `Simulado` gravado |
| `listSimulados({ todos = false, userId = null, step = null })` | só as próprias (ignora `todos` e `userId` alheio) | `todos: true` lista todas; `userId` filtra uma pessoa | `Simulado[]`, mais recente primeiro |
| `deleteSimulado(id)` | não pode | pode | nada |

O participante não altera nem apaga uma tentativa depois de gravada.

### Autoavaliações NBME

| Método | Participante | Admin | Retorno |
|---|---|---|---|
| `saveNbme(x)` | cria (sem `id`) ou corrige (com `id`) as próprias **enquanto não verificadas** | qualquer uma | registro gravado |
| `listNbme({ todos, userId, step })` | só as próprias | todas ou de uma pessoa | lista, data mais recente primeiro |
| `deleteNbme(id)` | as próprias não verificadas | qualquer uma | nada |
| `verifyNbme(id, verificada = true)` | não pode | marca ou desmarca; grava quem e quando | registro |

Campos (`NBME`):

```js
{
  id, user_id, criado_em, atualizado_em,
  step: "step1" | "step2ck",
  formulario: "CBSSA Form 31",             // até 80 caracteres
  modo: "standard" | "self" | "desconhecido",   // padrão "standard" (standard-paced)
  data: "AAAA-MM-DD",                      // não pode estar no futuro
  escore: 212,                             // inteiro de 1 a 999, ou null
  escore_texto: "",                        // equivalente do relatório, se não houver três dígitos
  probabilidade: 91.5,                     // probabilidade de aprovação informada pelo NBME, 0 a 100, ou null
  faixa_acima_aprovacao_baixa: true | false | null, // faixa provável inteira acima da faixa de aprovação baixa
  observacao: "",
  verificada: false, verificada_por, verificada_em  // só o admin altera
}
```

É obrigatório `escore` ou `escore_texto`. Arquivo ou print do relatório não é pedido.
`validarNbme(x)` e `normalizarNbme(x)` (em `desempenho.js`) dão as mesmas mensagens que
a camada usa.

### Presença nas aulas

O curso ainda não tem plataforma de vídeo: o admin lança à mão ou importa CSV.

| Método | Participante | Admin | Retorno |
|---|---|---|---|
| `getPresenca(userId = null)` | a própria | de qualquer pessoa | `{ user_id, aulas_assistidas, aulas_totais, origem, atualizado_por, atualizado_em }` ou `null` |
| `listPresenca()` | não pode | todas | lista |
| `setPresenca(userId, { aulas_assistidas, aulas_totais })` | não pode | grava (inteiros, assistidas ≤ totais) | registro |
| `importPresencaCsv(texto)` | não pode | lê o CSV e grava | `{ atualizados, nao_encontrados: [email], erros: [{ linha, motivo }] }` |

CSV: cabeçalho com `email`, `aulas_assistidas` e `aulas_totais` em qualquer ordem;
separador vírgula, ponto e vírgula ou tab; BOM aceito; e-mail comparado sem diferenciar
maiúsculas; e-mail repetido fica com a última linha. A leitura pura está em
`parsePresencaCsv(texto)`.

### Plano do participante

| Método | Participante | Admin |
|---|---|---|
| `getPlano(userId = null)` | o próprio | de qualquer pessoa |
| `savePlano(dados, userId = null)` | só `data_prova_step1` e `data_prova_step2ck` (outros campos são ignorados) | todos os campos |

Campos: `data_prova_step1`, `data_prova_step2ck`, `step1_aprovado`, `step2ck_aprovado`,
`data_matricula`, `ciclo_basico_concluido_em` (datas `AAAA-MM-DD` ou `null`). Aprovação,
matrícula e ciclo básico definem os Steps que faltam e o prazo da garantia. Se
`data_prova_step1` estiver vazia, o resumo usa a data da prova dos Ajustes do app de
flashcards (`dataProva`).

### Anotações do mentor (acréscimo da área administrativa)

| Método | Participante | Admin | Retorno |
|---|---|---|---|
| `getAnotacao(userId)` | não pode | lê | `{ user_id, texto, atualizado_por, atualizado_em }` ou `null` |
| `saveAnotacao(userId, texto)` | não pode | grava (até 5000 caracteres) | registro |

Texto interno da equipe, um por participante. No Supabase fica na tabela
`anotacoes_mentor` (só admin lê e grava; o gatilho carimba quem gravou e quando;
testes P8a a P8h em `02-testa-rls.sql`). No modo demonstração, as anotações sobre
participantes fictícios ficam na chave `r2a-plataforma-coorte-v1`.

### Metas da coorte

| Método | Participante | Admin |
|---|---|---|
| `getConfigPlataforma()` | lê | lê |
| `saveConfigPlataforma(c)` | não pode | grava (passa por `mergeConfig`) |

Ver a tabela de parâmetros em "Critérios de risco".

### Leitura agregada (painel)

| Método | Participante | Admin | Retorno |
|---|---|---|---|
| `getMeuResumo({ agora })` | o próprio | o próprio | `LinhaResumo` |
| `listResumoParticipantes({ agora, incluirSinteticos = true })` | não pode | todos os participantes (admins ficam de fora) | `LinhaResumo[]` |
| `listParticipantes()` | não pode | `{ id, nome, email, papel, criado_em, sintetico }[]` |
| `getAtividadeDiaria(userId = null, { dias = 182, agora })` | a própria | de qualquer pessoa | `[{ dia: "AAAA-MM-DD", revisoes, revisao_total, revisao_acertos }]`, do mais antigo para hoje (heatmap e tendência de retenção) |

No Supabase, essas leituras usam as funções `r2a_meu_resumo`,
`r2a_admin_resumo_participantes` e `r2a_atividade_diaria` e não trazem o revlog bruto.
O dia de estudo vira às 4h no fuso do navegador, como no app de flashcards.

### `LinhaResumo` (mesma forma nos dois modos)

```js
{
  user_id, nome, email, criado_em,
  sintetico: false,                        // true = participante fictício da demonstração
  plano: { data_prova_step1, data_prova_step2ck, step1_aprovado, step2ck_aprovado, data_matricula, ciclo_basico_concluido_em },
  flashcards: {
    revisoes_hoje, revisoes_7d, revisoes_30d, dias_estudados_30d,
    por_dia_30: [30 números, do mais antigo para hoje],
    retencao_30d: { total, acertos, taxa },  // retenção real: revisões de cards em revisão com Difícil, Bom ou Fácil; taxa null sem revisões
    sequencia_atual, maior_sequencia,
    vistos,          // cards oficiais já estudados (por card)
    vistos_itens,    // itens estudados, contando cada lacuna de cloze e cards pessoais
    maduros, jovens, aprendendo, leeches, suspensos,  // por item, como nas Estatísticas do app
    total_oficial,   // cards oficiais aprovados
    cobertura,       // vistos / total_oficial (0 a 1) ou null
    ultima_revisao
  },
  simulados: {
    step1:   { n, ultimo_em, ultimos: [{ id, percentual, acertos, total, fim }] },  // até 5, mais recente primeiro
    step2ck: { n, ultimo_em, ultimos: [...] }
  },
  nbme: [NBME resumida, em ordem de data],  // id, step, formulario, modo, data, escore, escore_texto, probabilidade, faixa_acima_aprovacao_baixa, verificada, criado_em
  presenca: { aulas_assistidas, aulas_totais, percentual, atualizado_em } | null,
  ultima_atividade   // mais recente entre revisão de card, simulado de 30 minutos, data de NBME,
                     // resposta no banco de questões (respostas_item.respondida_em) e simulado
                     // completo (simulados_completos.atualizado_em); null se nunca houve
}
```

`supabase/teste-local/03-compara-resumo.mjs` carrega os 16 perfis da coorte sintética
(cerca de 140 mil revisões) no Postgres e confere, campo a campo, que a linha do banco é
igual à do JavaScript e que as duas levam à mesma avaliação.

## Avaliação: risco, garantia e prontidão (`plataforma/js/desempenho.js`)

```js
import { avaliarParticipante, resumoCoorte, CONFIG_PADRAO, CODIGOS_RISCO } from "../plataforma/js/desempenho.js";
const config = await store.getConfigPlataforma();
const linhas = await store.listResumoParticipantes();
const topo = resumoCoorte(linhas, { config });      // contagens e medianas, mais topo.avaliacoes
const a = avaliarParticipante(linhas[0], { config });
```

`avaliarParticipante(linha, { config, agora })` devolve:

```js
{
  user_id,
  status: "em_dia" | "atencao" | "risco",
  riscos: [{ codigo, nivel: "normal" | "alto", titulo, detalhe, valor, limite, step? }],
  dias_sem_estudo,
  garantia: { ... },                       // abaixo
  prontidao: { step1: { ... }, step2ck: { ... } }
}
```

### Parâmetros (`CONFIG_PADRAO`, editáveis pelo admin)

| Chave | Padrão | Origem |
|---|---|---|
| `dias_inatividade` | 7 | critério interno de acompanhamento |
| `retencao_minima` | 0,80 | menor retenção desejada aceita pelo app (`RETENCAO_MIN` em `anki/js/scheduler.js`); a meta do preset é 0,90 (EXIT 04) |
| `retencao_janela_dias` | 30 | critério interno |
| `retencao_min_revisoes` | 100 | critério interno (abaixo disso a taxa oscila demais) |
| `simulado_minimo` | 0,60 | critério interno |
| `simulado_ultimos` | 2 | critério interno |
| `presenca_minima` | 0,80 | Termo da Garantia (`garantia.html`) |
| `nbme_minimo_por_step` | 2 | Termo da Garantia |
| `nbme_antecedencia_dias` | 60 | critério interno |
| `meta_probabilidade` | 90 | EXIT 18 (`materiais/overdeliveries-step1.html`) |
| `prontidao_seguidas` | 2 | EXIT 18 |
| `garantia_anos` | 3 | Termo da Garantia |

`mergeConfig(c)` aceita percentuais em 0 a 1 ou 0 a 100 e ignora valores inválidos.

### Critérios de risco

| Código | Dispara quando | Nível |
|---|---|---|
| `inatividade` | 7 dias ou mais desde a `ultima_atividade` (sem nenhuma atividade, conta desde a criação da conta) | `alto` a partir de 14 dias (2 vezes o limite) |
| `retencao_baixa` | retenção real dos últimos 30 dias abaixo de 80%, com pelo menos 100 revisões nessa janela | normal |
| `simulado_baixo` | média dos 2 últimos simulados de um Step abaixo de 60%; exige 2 tentativas daquele Step | normal |
| `presenca_baixa` | aulas assistidas / aulas totais abaixo de 80% (sem lançamento, não dispara) | normal |
| `nbme_insuficiente` | Step pendente com prova marcada daqui a menos de 60 dias (e ainda não passada) e menos de 2 NBMEs lançadas daquele Step | `alto` a 30 dias ou menos |
| `nbme_probabilidade_baixa` | última NBME com probabilidade informada de um Step pendente abaixo da meta do admin | normal |

Status: `em_dia` sem critérios; `atencao` com um critério normal; `risco` com dois ou
mais critérios ou qualquer critério de nível alto. Step marcado como aprovado não entra
nos critérios de NBME.

### Condições da garantia (`garantia.html`)

```js
garantia: {
  cumpre: "sim" | "pendente_verificacao" | "ainda_nao" | "sem_dados_presenca",
  presenca: { percentual, aulas_assistidas, aulas_totais, cumpre: true | false | null, faltam_aulas },
  nbme: {
    step1:   { exigido, lancados, verificados, minimo, cumpre, pendente_verificacao },
    step2ck: { ... }
  },
  prazo: { inicio, fim, dias_restantes } | null,
  todos_aprovados
}
```

- Presença: pelo menos 80% das aulas. `faltam_aulas` diz quantas faltam para chegar lá
  com o total atual.
- NBME: no mínimo 2 autoavaliações oficiais **para cada Step que faltar**
  (`exigido = !stepX_aprovado`). Lançada conta; enquanto a equipe não verificar,
  o estado é `pendente_verificacao`.
- `ainda_nao` descreve o momento: a garantia só é pedida depois do fim do prazo.
- Prazo: 3 anos a partir da matrícula ou, para quem ainda não concluiu o ciclo básico,
  da data de conclusão (vale a mais tardia das duas datas lançadas).
- Aprovação que encerra a garantia: Pass no Step 1 e nota igual ou superior à mínima
  em vigor no Step 2 CK (218 desde julho de 2025, segundo
  https://usmle.org/scores-transcripts/examination-results-and-scoring). Quem marca é o admin.

### Prontidão (EXIT 18)

`prontidao[step]`: `{ status, atende, faixa_confirmada, consideradas, motivo }`.

- `pronto`: as 2 autoavaliações mais recentes do Step em standard-paced têm
  probabilidade ≥ meta (90%) e nenhuma tem a faixa marcada como **não** acima da
  aprovação baixa. `faixa_confirmada` só é `true` quando as duas têm a faixa marcada como
  acima; sem essa informação, a interface deve avisar. As telas (admin e "Meu progresso")
  mostram esse caso como **"Falta confirmar a faixa"** (`leituraProntidao().status_tela`
  = `pronto_sem_faixa`), e não como critério atendido, porque o critério escrito da
  EXIT 18 pede as duas coisas; o indicador "Prontos pela EXIT 18" do admin não o conta.
- `nao_pronto`: alguma das duas abaixo da meta ou com faixa negativa.
- `insuficiente`: menos de 2 em standard-paced, ou probabilidade não informada.
- `aprovado`: Step já aprovado.

A recomendação é da Road to America; a decisão sobre a data continua sendo do aluno.

## Modo demonstração e coorte sintética

No painel do admin, o modo demonstração junta:

1. o **participante de demonstração** (`demo-participante`), com os dados reais deste
   navegador (revisões, simulados e NBMEs que ele fizer);
2. uma **coorte sintética de 16 participantes fictícios** (`plataforma/js/coorte-demo.js`),
   com ids `demo-sint-...`, e-mails `@demo.local`, `sintetico: true` e o campo
   `perfil_demo` em `listParticipantes()` explicando o perfil.

A interface deve marcar essas linhas com o selo **"dados de demonstração"**.
A coorte é gerada na memória a cada dia (determinística: mesma semente e mesmo dia,
mesmos dados), nunca entra na chave principal do `localStorage` e não aparece para o
participante. Edições do admin sobre ela (verificar NBME, lançar presença, mudar plano,
excluir tentativa) ficam na chave separada `r2a-plataforma-coorte-v1`, apagada por
`resetDemo()`. Os simulados sintéticos usam questões reais dos bancos, sorteadas por
`sortearQuestoes`; sem os bancos, usam ids `sint-...`.

Perfis: em dia (Ana, Karina recém-chegada, Nuno, João no Step 2 CK), pronto pela EXIT 18
(Bruno), inativo há 7, 9 e 23 dias (Olívia, Carla, Diego), conta sem estudo (Lucas),
retenção baixa (Elisa), simulados baixos (Hugo), NBME abaixo da meta (Fábio), prova em
25 dias com uma NBME só (Íris), presença abaixo de 80% (Gabriela), Step 2 CK em 40 dias
com NBME abaixo da meta (Pedro) e vários critérios ao mesmo tempo (Marina).

## Banco (Supabase)

Tabelas novas: `simulados`, `nbme_autoavaliacoes`, `presenca`, `plano_participante`,
`plataforma_config` (uma linha, `id = 1`). Funções: `r2a_admin_resumo_participantes`,
`r2a_meu_resumo`, `r2a_atividade_diaria`, `r2a_admin_importar_presenca` e a interna
`r2a_resumo_interno` (sem permissão de execução para `anon` e `authenticated`).

| Tabela | Participante | Admin |
|---|---|---|
| `simulados` | insere e lê as próprias; não altera nem apaga | tudo |
| `nbme_autoavaliacoes` | insere, lê, altera e apaga as próprias não verificadas; `verificada` sempre falso para ele | tudo; o gatilho carimba `verificada_por` e `verificada_em` |
| `presenca` | lê a própria | tudo |
| `plano_participante` | lê e altera o próprio, só as datas de prova (o gatilho recusa o resto) | tudo |
| `plataforma_config` | lê | tudo |
| `anon` | nada | |

Testar localmente (Postgres puro):

```bash
createdb r2a
psql -d r2a -f supabase/teste-local/01-simula-supabase.sql -f supabase/schema.sql -f supabase/teste-local/02-testa-rls.sql
# o bloco final precisa mostrar "falhas | 0" (187 verificações: P1 a P9 da plataforma, Q1 a Q10 do banco de questões)
node supabase/teste-local/03-compara-resumo.mjs   # precisa terminar em "Diferenças: 0"
node supabase/teste-local/04-compara-itens.mjs    # precisa terminar em "Diferenças: 0"
```

Testes unitários:

```bash
cd plataforma && node --test tests/*.test.mjs
cd anki && node --test tests/*.test.mjs
```


---

# Banco de questões, simulados completos e psicometria

Acréscimo de 29/10/2026. Tudo abaixo vale nos dois modos (`LocalStore` e
`SupabaseStore` têm os mesmos métodos; `plataforma/tests/store.test.mjs` confere). O
método psicométrico, com fórmulas e limitações, está em `PSICOMETRIA.md`.

## Como as telas usam (exemplo de ponta a ponta)

```js
import { carregarBanco, sistemasDoOutline } from "../plataforma/js/banco.js";
import { estimarAluno, prontidaoCombinada } from "../plataforma/js/psicometria.js";
import { montarFormularioFixo, novaSessao, iniciarBloco, responder, encerrarBloco, atualizarSessao, estadoRelogio, corrigirSessao } from "../plataforma/js/formularios.js";
import { prontidao } from "../plataforma/js/desempenho.js";

const banco = await carregarBanco({ store });             // itens válidos, normalizados e indexados
if (!banco.itens.length) { /* modo Supabase sem matrícula ativa: mostrar aviso */ }

// simulado completo, formulário fixo A do Step 1 (versão reduzida no modo demonstração)
const form = montarFormularioFixo(banco, "step1", "S1-A", "completo");
let sessao = novaSessao(form);
const reg = await store.criarSimuladoCompleto({ formulario: form, sessao });
sessao = iniciarBloco(sessao, Date.now());
sessao = responder(sessao, 0, { resposta: "C", tempo_ms_add: 41000 }, Date.now());
await store.salvarProgressoSimulado(reg.id, sessao);      // grava a cada mudança: retomada após recarregar
sessao = encerrarBloco(sessao, Date.now());               // a sobra do bloco vai para a pausa
// ... ao terminar o último bloco:
const { resultado, respostas } = corrigirSessao(form, sessao, banco.porId, { sessaoId: reg.id });
await store.saveRespostas(respostas);
await store.concluirSimuladoCompleto(reg.id, { sessao, resultado });

// probabilidade de aprovação e prontidão
const modelos = await store.getModelosPsicometricos();
const est = estimarAluno({
  step: "step1", respostas: await store.listRespostas({ step: "step1" }), itens: banco.porId,
  sistemas: sistemasDoOutline("step1"), modeloDesfechos: modelos.step1?.desfechos
});
const pr = prontidaoCombinada({ exit18: prontidao(await store.listNbme({ step: "step1" }), "step1", config), banco: est });
```

## `plataforma/js/banco.js`

| Exportação | O que faz |
|---|---|
| `carregarBanco({ store, step, labsTabela, incluirInativos })` | chama `store.listQuestoes()`, normaliza, valida e indexa. Devolve o objeto `Banco` (abaixo). `labsTabela` (conteúdo de `simulado/data/valores-laboratoriais.json`) só acrescenta avisos |
| `montarBanco(lista, { origem, fontes, labs, incluirInativos })` | o mesmo, a partir de uma lista de itens brutos |
| `lerBancoDemo({ base, fetch, privado })` | modo demonstração: lê os 80 itens públicos e, com `privado` (padrão: `bancoCompletoPedido()`, verdadeiro só em `localhost` com `?banco=completo`), `banco-privado/manifest.json`, os arquivos e os blueprints listados nele. `{ itens, fontes, privado, divergencias }` |
| `normalizarItem(bruto)` | item no contrato atual, com padrões de Angoff e os derivados `b_angoff`, `angoff_origem` (`item` ou `padrao_dificuldade`), `legado`, `taxonomia_desconhecida` |
| `validarItem(item, { labs })` | `{ erros, avisos }`. Erro tira o item do banco; aviso só entra no relatório |
| `tipoRevisao(revisao)`, `resumoRevisao(itens)` | tipo da revisão do item (`medica`, `automatizada` ou `nenhuma`) e, para uma lista, `{ total, medica, automatizada, nenhuma, sem_medica, aviso }`: o aviso vai para a tela de escolha dos simulados, o relatório e o banco de questões enquanto houver item sem revisão médica |
| `filtrarBanco(banco, { step, excluir, sistema, disciplina, area, tarefa, competencia, dificuldade })` | valores podem ser texto ou lista |
| `contarPor(itens, dim)`, `assinaturaBanco(itens)`, `hashTexto(s)` | contagem, assinatura (muda quando o banco muda) e hash FNV-1a |
| `TAXONOMIA[step][dim]` | chaves, nomes em português e em inglês e faixas oficiais (% de itens) do outline: Step 1 `sistema`, `disciplina`, `competencia`; Step 2 CK `sistema`, `competencia` (tarefas do médico), `disciplina_oficial`, mais as etiquetas do painel `area` e `tarefa` (sem faixa). `multirrotulo` e `exigir_faixa` dizem se a faixa é exigida na montagem |
| `enriquecerComBlueprint(itens, blueprints)` | completa cada item com o que a especificação de mesmo `spec_id` traz e o item não repete (disciplinas secundárias, disciplinas clínicas oficiais, tópicos do outline) e devolve `{ itens, divergencias }` |
| `CAMPO_MULTIRROTULO` | campo com todos os rótulos das dimensões multirrótulo: `disciplinas` (Step 1) e `disciplinas_oficiais` (Step 2 CK) |
| `DIMENSOES[step]`, `sistemasDoOutline(step)`, `chavesDe(step, dim)`, `nomeChave(step, dim, chave)`, `chaveCanonica(step, dim, valor)` | listas e nomes; `chaveCanonica` aceita acentos, maiúsculas, sinônimos e palavras em outra ordem |
| `ANGOFF_PADRAO`, `ITENS_FORMULARIO_OFICIAL`, `STATUS_QUESTAO`, `DIFICULDADES`, `STEPS_BANCO` | constantes |

Objeto `Banco`:

```js
{
  itens,                       // válidos, normalizados, ordenados por id (só ativos, salvo incluirInativos)
  porId: Map,                  // id -> item
  steps: { step1: [...], step2ck: [...] },
  indice: { step1: { sistema: { chave: [ids] }, disciplina, competencia, dificuldade },
            step2ck: { sistema, competencia, disciplina_oficial, area, tarefa, dificuldade } },
  invalidos: [{ id, erros }], avisos: [{ id, avisos }], duplicados: [id],
  contagem: { step1, step2ck },
  reduzido: { step1: bool, step2ck: bool },   // menos itens que um formulário oficial (280 e 318)
  assinatura, origem: "supabase" | "demonstracao" | "demonstracao_completa", fontes
}
```

Chaves usadas pela plataforma, as mesmas de `banco-privado/blueprint-step1.json` e
`blueprint-step2ck.json` (sinônimos comuns, acentos e nomes em inglês também são aceitos):

| Step | Dimensão | Chaves |
|---|---|---|
| Step 1 | `sistema` | `desenvolvimento_humano`, `sangue_imune`, `comportamento_nervoso`, `musculoesqueletico_pele`, `cardiovascular`, `respiratorio_renal`, `gastrointestinal`, `reprodutor_endocrino`, `multissistemico`, `bioestatistica`, `ciencias_sociais` |
| Step 1 | `disciplina` | `patologia`, `fisiologia`, `anatomia`, `microbiologia`, `farmacologia`, `comportamental`, `bioquimica`, `histologia`, `imunologia`, `genetica`, `nutricao`; `disciplinas_secundarias` (lista) entra em `disciplinas` (todos os rótulos), usado na montagem e no perfil |
| Step 1 | `competencia` | `conhecimento_medico`, `diagnostico`, `comunicacao_interpessoal`, `aprendizagem_pratica` (os nomes em inglês do outline, como `applying_foundational_science`, também são aceitos) |
| Step 2 CK | `sistema` | `ciencias_sociais_etica_seguranca`, `renal_urinario_reprodutor`, `cardiovascular`, `musculoesqueletico_pele`, `saude_comportamental`, `sangue_imune`, `gastrointestinal`, `nervoso_sentidos`, `respiratorio`, `multissistemico`, `endocrino`, `gestacao_parto_puerperio`, `bioestatistica_epidemiologia`, `desenvolvimento_humano` |
| Step 2 CK | `competencia` (tarefa do médico do outline, com faixa) | `diagnostico`, `exames_laboratoriais_diagnosticos`, `manejo_misto`, `farmacoterapia`, `intervencoes_clinicas`, `manutencao_saude_prevencao`, `prognostico_desfecho`, `pratica_sistemas_seguranca`, `profissionalismo`, `aprendizagem_baseada_pratica` |
| Step 2 CK | `disciplinas_oficiais` (lista; a primeira vira `disciplina_oficial`) | `medicina`, `pediatria`, `ginecologia_obstetricia`, `psiquiatria`, `cirurgia` (aceita os nomes do outline: Medicine, Surgery, Pediatrics, Obstetrics & Gynecology, Psychiatry). Sem a lista, a principal sai da área |
| Step 2 CK | `area` (etiqueta do painel, sem faixa) | `medicina_interna`, `pediatria`, `cirurgia`, `ginecologia_obstetricia`, `psiquiatria`, `neurologia`, `emergencia`, `medicina_preventiva`, `etica_comunicacao`, `bioestatistica` |
| Step 2 CK | `tarefa` (etiqueta do painel, sem faixa) | `manejo`, `diagnostico`, `interpretacao_exames`, `etica`, `prevencao`, `prognostico`, `mecanismo` |

Itens públicos (contrato anterior): no Step 2 CK, o antigo `sistema` vira `area` e o antigo
`disciplina` vira `tarefa`; sistema, competência e disciplinas clínicas vêm da
reclassificação feita por leitura de cada vinheta no blueprint (`LEGADO_CK` em
`banco.js`). No Step 1, a competência e as disciplinas secundárias dos 40 itens vêm da
mesma fonte (`LEGADO_S1`). Chave fora do outline vira aviso, não erro. Obrigatórios para
entrar no banco: `sistema`, `disciplina` e `competencia` no Step 1; `sistema`, `area` e
`competencia` no Step 2 CK.

## `plataforma/js/psicometria.js`

| Exportação | O que faz |
|---|---|
| `estimarAluno({ step, respostas, itens, sistemas, pesosSistemas, bsFormulario, pesos, regra, usarCalibrado, modeloDesfechos, modeloEscore, ligacaoNbme, desde, ate, efeitoModo, sigmaCorte, ponderar })` | estimativa completa (abaixo). `ligacaoNbme` (o `ligacao_nbme` do modelo do Step, saída de `corteLigadoNbme`): quando suficiente e sem padrão do painel, o limiar passa a ser o corte ligado às autoavaliações NBME, `c ~ N(mu, sigma²)`. `pesosSistemas` (de `pesosDoOutline(step)` em `banco.js`) liga a cobertura proporcional e a repesagem pelo outline; `ponderar: false` desliga só a repesagem (simulado completo) |
| `prepararRespostas(respostas, itens, { step, pesos, usarCalibrado, desde, ate, efeitoModo })` | `{ usadas, ignoradas }` com as regras de entrada (primeira resposta, pesos, em branco, `b - δ` no tutor) |
| `eap(respostas, { priori, grade, incluirPosterior, sigmaCorte })` | `{ theta, dp, ic90, p_aprovacao, p_medida, sigma_corte, origem_corte, n, n_efetivo, acertos }`; `respostas = [{ b, x, w, item? }]`. Sem `sigmaCorte`, usa `incertezaCorte(respostas)` (0,4 para item sem origem) |
| `incertezaCorte(usadas)`, `pAcimaDoCorte(posterior, sigma, cum, mu)`, `intervaloRelativo(posterior, sigma, intervalo, mu)`, `INCERTEZA_CORTE` (provisório 0,7), `SENSIBILIDADE_PADRAO` (0,75 logit, cerca de 15 pontos) | incerteza do padrão (seção 6.1 de PSICOMETRIA.md); `mu` é o centro do corte (0 no padrão do banco) |
| `corteLigadoNbme(modeloEscore, { step, limiar, min_alunos, min_t, ep_max })`, `LIGACAO_NBME` | ligação com as autoavaliações NBME (seção 6.2): `{ metodo, limiar, n, n_alunos, mu, ep, sigma, t, suficiente, motivo }`; o mínimo é de 30 alunos distintos (`LIGACAO_NBME.min_alunos`), não de escores; modelo sem `n_alunos` não libera; `mu = (limiar - a) / b`, erro-padrão pelo método delta |
| `nomePadrao(origem)`, `padraoProvisorio(origem)`, `faixaP(p)` | texto único do padrão em uso ("provisório", "do painel de juízes", "ligado às autoavaliações NBME da turma") e faixa da probabilidade |
| `ponderarPeloOutline(usadas, pesos)`, `PONDERACAO_OUTLINE` | `{ usadas, fatores, distancia, mistura }` (seção 5.1) |
| `estimarEfeitoModo(matriz, itens)` | `{ delta, ep, n_tutor, pessoas, suficiente }` (seção 13.1) |
| `posteriorGrade`, `resumirPosterior`, `cdfPosterior`, `quantilPosterior` | posterior em grade e leituras |
| `percentualEsperado(posterior, bs)` | `{ media, ic90, limiar, itens }` (0 a 1) |
| `classificarConfianca({ p, theta, dp, n_efetivo, n_minimo, cob, infoMedia, regra, sigmaCorte, origemCorte })`, `itensMinimos(bs)`, `itensParaPrecisao(dp, dpAlvo, info)`, `cobertura(contagemPorSistema, sistemas, { minPorSistema, pesos, nTotal })` | regra de precisão e contas de "quantos itens faltam"; `ROTULOS_CONFIANCA` |
| `perfilPorArea(usadas, dim, { min_itens, prob })` | `[{ chave, n, acertos, taxa, esperado_limiar, theta, dp, ic, p_acima, classe }]`, classe `mais_baixo`, `igual`, `mais_alto` ou `insuficiente`; da área mais fraca para a mais forte. Campo com lista (`disciplinas`, `disciplinas_oficiais`) conta o item em cada rótulo |
| `prontidaoCombinada({ exit18, banco })` | `{ status, principal: "exit18", complementar, divergente, mensagem, regra }` |
| `analisarItens(respostas, itens, { limiares, usarCalibrado, thetas })` | `{ itens: [AnaliseItem], resumo }` (seção 11 de PSICOMETRIA.md) |
| `recalibrarRasch(respostas, itens, { tau, priori_theta, max_iter, tol, ancoragem, ancorarEm })` | `{ itens: [{ id, b_angoff, b, ep, n, acertos }], pessoas, iteracoes, convergiu, deslocamento, parametros }` |
| `regressaoLogistica(X, y, { pesos })` (com `cov`), `ajustarDesfechos(registros, { naoRespondentes })` (`suficiente`, `exploratorio`, `taxa_resposta`, `ponderado`, `cov`), `intervaloDesfechos(modelo, { theta })` (`{ p, ic90 }`; regressão calibrada sobre o EAP, `dp` aceito e ignorado), `probAprovacaoDesfechos(modelo, { theta })`, `ajustarEscore(registros, { min_alunos })` (registros com `user_id`: cada aluno pesa 1 e a covariância `var_a`, `var_b`, `cov_ab` é robusta agrupada por aluno; devolve também `n_alunos`, `escores_por_aluno`, `metodo`, `tau`, `icc`, `ep_b_sem_agrupar` e `media_theta`; `suficiente` com pelo menos `min_alunos` = 30 alunos distintos), `preverEscore(modelo, { theta }, limiar)` (incerteza dos coeficientes, sem `dp`), `montarDadosDesfechos(desfechos, respostasPorUsuario, itens)` | desfechos reais |
| `bDeAngoff(a)`, `bDoItem(item, { usarCalibrado })`, `expit`, `logit`, `normalCdf`, `informacao`, `informacaoMedia`, `correlacao`, `auc` | utilidades |
| `textoProbabilidade(p)` | texto único da probabilidade em todas as telas: inteiro, `< 1%` e `> 99%` nas pontas, uma casa decimal só quando o arredondamento cruzaria 10% ou 90% (os cortes da precisão alta); `sem dados` quando não há número |
| `simularRespostas({ thetas, bs, random })`, `normalAleatoria(random)` | simulação para testes (recebem o gerador) |
| `PRIORI_PADRAO`, `GRADE_PADRAO`, `REGRA_CONFIANCA`, `PESOS_MODO`, `LIMIARES_ITEM`, `RECALIBRACAO_PADRAO`, `DESFECHOS_PADRAO`, `PADRAO_STEP2CK`, `DIMENSOES_PERFIL` | parâmetros do método |

Saída de `estimarAluno`:

```js
{
  step, n, n_efetivo, acertos, taxa_bruta, ignoradas,
  theta, dp, ic90: [lo, hi],           // só a incerteza da medida
  ic90_relativo: [lo, hi],             // distância ao limiar, theta - c, com a incerteza do padrão
  p_aprovacao,                         // P(theta > c | respostas), c ~ N(0, sigma²): probabilidade de estar acima do limiar do banco
  p_medida,                            // P(theta > centro | respostas), sem a incerteza do padrão
  corte: { sigma, origem: "provisorio" | "misto" | "painel" | "nbme", centro /* 0, ou mu da ligação com a NBME */, itens_painel, ligacao_nbme: null | { limiar, n, ep } },
  sensibilidade: null | { deslocamento: 0.75, pontos: 15, itens_mais_faceis, itens_mais_dificeis, muda_leitura },   // só com padrão provisório
  mistura: { distancia, fatores, sistemas },   // repesagem pelo outline
  percentual_esperado: { media, ic90: [lo, hi], limiar, itens },   // 0 a 1
  confianca: { alta, rotulo: "precisao_alta" | "estimativa_preliminar", texto, texto_curto, motivos: [texto],
               n_minimo, faltam_itens /* null = perto do limiar */, faltam_itens_minimo, faltam_sistemas: [chave], perto_do_limiar,
               padrao_limita /* o padrão incerto, sozinho, impede a decisão */, sigma_corte, origem_corte },
  cobertura: { com_itens, faltando, total, proporcao, minimos: { chave: n }, itens: { chave: n }, min_por_sistema },
  perfil: { sistema, disciplinas, competencia }            // Step 1
        | { sistema, disciplinas_oficiais, competencia, area }, // Step 2 CK
  base: "angoff" | "calibrado" | "misto", itens_calibrados,
  oficial: false,
  avisos: [texto],                     // a tela mostra sempre (origem da estimativa; no Step 2 CK, o 218 e a nota de três dígitos)
  limiar: { tipo: "padrao_do_banco", origem, resultado_oficial: "Pass/Fail" } | { ..., escore_oficial: 218 },
  efeito_modo: null | delta,
  desfechos: null | { p_aprovacao, ic90, rotulo: "alta_confianca" | "estimativa_preliminar", texto, modelo },   // só com modelo suficiente (30 + 30, taxa de resposta >= 50%)
  escore: null | { media, ic90, p_limiar, limiar, suficiente }   // só Step 2 CK com notas reais suficientes
}
```

## `plataforma/js/formularios.js`

| Exportação | O que faz |
|---|---|
| `montarFormulario(banco, { step, tipo, modo, semente, vistas, evitar, codigo, nome })` | `tipo`: `completo` (14 blocos e 280 itens no Step 1; 16 blocos e 318 no Step 2 CK), `meio` (7 e 140; 8 e 159) ou `prontidao` (4 blocos e 80 itens). `modo`: `fixo` ou `personalizado`. Item com inimigo já escolhido só entra se não houver alternativa; o reparo das faixas não junta pares, e o par que sobrar é trocado por item do mesmo sistema (e, quando dá, da mesma dificuldade e competência) |
| `montarFormularioFixo(banco, step, codigo, tipo, { ignorarGravado })` | formulários fixos `S1-A`, `S1-B`, `CK-A`, `CK-B` (`FORMULARIOS_FIXOS`). A e B são uma partição do banco do Step (nenhum item em comum). Quando o banco traz `formularios_fixos` (de `banco-privado/formularios.json` ou da tabela `formularios_fixos`) e a assinatura confere, o formulário completo é o gravado (`origem_montagem: "gravado"`); senão é calculado (`"calculado"`). B com menos itens que o formato sai `parcial: true`. Pares inimigos (`item.inimigos`, nos dois sentidos) nunca ficam no mesmo formulário: quando o banco não comporta todos os itens sem juntar um par, um item do par sai do B (`particao.omitidos_do_b_por_inimigos`, `omitidos_por_inimigos`) e o B continua completo enquanto cada bloco tiver 19 ou 20 itens (`MIN_ITENS_POR_BLOCO_COMPLETO`). Gravação com par inimigo dentro é recusada e o formulário é recalculado |
| `montarParticao(pool, step, nA, nB, { semente, inim })` | partição de A e B por busca local: A tem prioridade nas faixas exigidas, B fica com o restante; nenhuma troca junta um par inimigo no A, e par no B custa mais que qualquer faixa; devolve também `conflitos: { A, B }` |
| `mapaInimigos(pool)`, `paresInimigosEm(ids, mapa)` | pares inimigos do pool nos dois sentidos (`Map id -> Set`) e os pares dentro de uma lista de ids; usados pela montagem fixa e personalizada e por `verificarFormulario` |
| `angoffMontagem(q)`, `FAIXAS_DIFICULDADE` | Angoff usado na montagem (o do item, mesmo depois do painel) e meta de dificuldade do projeto (fácil 17 a 23%, média 52 a 58%, difícil 22 a 28%) |
| `montarFormularioPersonalizado(banco, { step, tipo, vistas, semente })` | prioriza itens não vistos sem sair das faixas |
| `formularioReservado(banco, step, codigo)`, `itensReservados(banco, simulados)` | formulário completo reservado por Step (S1-B e CK-A): `{ ids: Set, formularios }` com os itens fora do banco do aluno até ele concluir o formulário; formulário reduzido nunca é reservado |
| `vistosNoFormulario(form, respostas)`, `LIMITE_JA_VISTOS` (0,25) | `{ n, total, fracao, reaplicacao }` |
| `pausaProporcional(pausaMs, blocos, blocosOficiais)` | pausa do formulário parcial (`tempo.pausa_proporcional: true`) |
| `verificarFormulario(form, porId)` | `{ ok, total, blocos, equilibrio, corte: { angoff_medio, origem: "provisorio" \| "misto" \| "painel", itens_com_painel }, dimensoes, problemas, avisos, pares_inimigos }` (par inimigo no mesmo formulário é problema; total abaixo do máximo, com 19 a 20 itens por bloco, é aviso) (no formulário parcial, faixa fora vira aviso), com cada chave do outline, `pct`, `faixa`, `dentro`, `exigida` e, nas disciplinas, `n_multirrotulo`, `pct_multirrotulo` e `dentro_multirrotulo` (todos os rótulos; fora da faixa vira aviso) |
| `dimensionar(step, tipo, disponiveis)`, `tamanhosBlocos(total, blocos)`, `cotasNasFaixas`, `alvosDimensao` | contas da montagem |
| `novaSessao(form)`, `iniciarTutorial`, `iniciarBloco`, `responder(sessao, posicao, { resposta, marcada, tempo_ms_add }, agora)`, `encerrarBloco(sessao, agora, motivo)`, `atualizarSessao(sessao, agora)`, `estadoRelogio(sessao, agora)`, `corrigirSessao(form, sessao, porId, { sessaoId })` | relógio do simulado completo (estado JSON serializável; todas devolvem um estado novo) |
| `TEMPOS_OFICIAIS`, `TIPOS_FORMULARIO`, `FORMULARIOS_FIXOS`, `SECUNDARIAS` | constantes |

Formulário:

```js
{
  id: "step1:completo:fixo:S1-A:<assinatura>", codigo, nome, step, tipo, modo, semente,
  reduzido, motivo_reducao,              // banco menor que o formato: blocos de 20, aviso pronto para a tela
  oficial: { blocos, itens, formato_oficial },
  blocos: [[ids], ...], total,
  tempo: { bloco_ms: 1800000, pausa_ms, tutorial_ms, dia_ms },
  assinatura_banco, hash, fora_da_faixa: [chaves sem itens suficientes no banco]
}
```

Montagem: cotas de sistema dentro das faixas; escolha gulosa dentro de cada sistema que
equilibra competência (faixa exigida), disciplina principal, disciplinas com todos os
rótulos e dificuldade; reparo por trocas dentro do mesmo sistema até a competência e as
disciplinas (todos os rótulos) caberem nas faixas; distribuição em blocos em serpentina
pelo Angoff. Os formulários completos fixos do banco privado são gravados por
`banco-privado/ferramentas/formularios.mjs --gravar` em `banco-privado/formularios.json`
(lido pelo modo demonstração via `manifest.formularios`; no Supabase, tabela
`formularios_fixos`, enviada por `tools/importar-banco.mjs`). Com os 1080 itens atuais,
S1-A e S1-B têm 280 itens em 14 blocos, CK-A tem 318 em 16 e CK-B fica parcial com os 202
itens restantes; os quatro saem dentro das faixas oficiais, com Angoff e dificuldade
iguais entre blocos e o gabarito equilibrado por bloco
(`plataforma/tests/banco-privado.test.mjs`, que roda quando `banco-privado/` existe).
O corte provisório de cada formulário é a média do Angoff dos seus itens; quando o painel
de juízes publica valores (pelo menos 10 juízes por item e Hofstee verificado, ou
publicação justificada), `angoff` passa a ser o do painel (`angoff_origem: "painel"`) e a
composição não muda. Itens públicos (`legado`) de um formulário fixo ficam fora da
estimativa: `itensForaDoCorte(form, porId)` devolve o `Set` desses ids, e
`estimativaDoSimulado` (simulado/js/relatorio.js) os tira das respostas e do percentual
esperado (`est.fora_do_corte: { n, ids }`). No modo demonstração, com só os itens
públicos, todos contam.

Dois alunos com o mesmo `formulario_id` fizeram exatamente os mesmos itens (a assinatura
muda quando o banco muda). Relógio: pular o tutorial ou terminar antes dá o tempo que
sobrou à pausa; sobra de bloco também vai para a pausa; todo o tempo fora de bloco e de
tutorial conta como pausa; pausa além do saldo vira débito, descontado do bloco
seguinte; `responder` só aceita o bloco atual; `atualizarSessao` fecha o bloco cujo tempo
acabou com a página fechada. `estadoRelogio` dá `restante_bloco_ms`, `pausa_saldo_ms`,
`pausa_excedente_ms`, `proximo_bloco_ms` e `tutorial_restante_ms`.

## `plataforma/js/angoff.js` (painel de juízes)

| Exportação | O que faz |
|---|---|
| `MIN_JUIZES` (10), `CORTE_EP_MAX` (0,02), `RODADAS_MAX` (5), `ESTADOS_PAINEL` (`avaliacao`, `discussao`, `encerrado`) | constantes |
| `validarEstimativa(v)`, `validarHofstee(h)`, `validarPainel(p)` | estimativa de 0 a 100; Hofstee com corte mínimo e máximo e reprovação mínima e máxima |
| `proximoEstado(painel, acao)` | `fechar_rodada` (avaliação para discussão), `nova_rodada` (discussão para a rodada seguinte), `encerrar` |
| `estatisticaItem(valores)`, `resumoRodada(itens, avaliacoes, rodada)` | média, DP, mínimo, máximo e n por item; corte Angoff modificado (média das médias) com erro padrão entre juízes |
| `pObservado(respostas, itens)` | acerto real por item (primeira resposta de cada pessoa, fora do modo tutor) |
| `distribuicaoEscores(respostas, itens, { minItens, porId })`, `reprovacaoNoCorte`, `hofstee`, `verificarHofstee(corteAngoff, h, escores)` | compromisso de Hofstee e se o corte Angoff cai dentro do retângulo; com `porId`, o escore de cada pessoa é o esperado no formulário do painel pelo theta EAP de todas as respostas dela |
| `valoresParaPublicar(painel, avaliacoes, { minJuizes, corteEpMax, verificacao, justificativa })` | `{ publicar: [{ questao_id, angoff, juizes, ep }], insuficientes, corte, corte_ep, bloqueado, bloqueado_ep, motivo, hofstee_ok, exige_justificativa }`: média da última rodada por item, só dos itens com pelo menos `minJuizes` juízes; nada quando o erro-padrão do corte passa de `corteEpMax`, ou quando `verificacao` (saída de `verificarHofstee`) não tem `ok: true` e a justificativa tem menos de `JUSTIFICATIVA_MIN` (30) caracteres |
| `regraHofsteePublicacao(corte, respostasHofstee, justificativa)` | regra que o servidor confere (a mesma de `r2a_admin_publicar_angoff`): pelo menos uma resposta de Hofstee e o corte dentro da janela média `[k_min, k_max]`; fora disso, `bloqueado` sem justificativa de 30 caracteres |
| `estimativasFicticias(...)` | estimativas dos mentores fictícios do modo demonstração |

Na tela (área da equipe, Angoff), o juiz vê o item completo sem a letra correta nem as
explicações até gravar a estimativa; entre rodadas recebe a média do painel, a própria
estimativa anterior, o p observado e os comentários da discussão.

## Gabarito no servidor (modo Supabase)

No Supabase o participante não lê o gabarito: `questoes` é só da equipe e o participante lê
`questoes_publicas` (espelho mantido por gatilho, sem `CAMPOS_PRIVADOS`). As telas usam as
mesmas chamadas nos dois modos; no modo demonstração (`gabaritoNoServidor: false`) a
correção continua no navegador.

| Método da camada de dados | O que faz |
|---|---|
| `gabaritoNoServidor` | `true` no Supabase para quem não é admin |
| `responderItens(lista, { revelar })` | grava as respostas (RPC `r2a_responder`, em lotes de 200) e devolve `{ id, questao_id, resposta, correta, revelado }`; `revelado` traz a parte privada do item (modo tutor na hora, cronometrado no fim do bloco) |
| `revelarItens(ids)` | parte privada de itens já respondidos ou de simulado concluído (RPC `r2a_revelar`) |
| `corrigirSimulado(id, complemento)` | corrige o simulado completo no servidor (RPC `r2a_corrigir_simulado`) e grava conclusão e resultado |

Em `plataforma/js/banco.js`: `CAMPOS_PRIVADOS`, `partePrivada(item)`, `partePublica(item)`,
`temGabarito(q)`, `mesclarRevelados(banco, revelados)` e `garantirGabarito(store, banco, ids)`
(busca o que falta antes de mostrar correção ou relatório). `validarItem` e `montarBanco`
aceitam `exigirGabarito: false` para itens sem gabarito.

## Painel Angoff na camada de dados

| Método | Admin | Juiz designado | Outros |
|---|---|---|---|
| `listJuizesPossiveis()` | lista mentores e admins | não | não |
| `listPaineisAngoff()`, `getPainelAngoff(id)` | todos | os seus | nada |
| `criarPainelAngoff({ step, nome, descricao, itens, rodadas_max, juizes })`, `designarJuizesAngoff(id, juizes)` | pode | não | não |
| `listItensPainelAngoff(id)` | itens do painel | itens sem gabarito nem explicações (RPC `r2a_angoff_itens`) | não |
| `avaliarItemAngoff(id, questao_id, valor, comentario)` | só se também for juiz designado | a própria, na rodada aberta | não |
| `revelarPainelAngoff(id)` | pode | gabarito só dos itens que já avaliou | não |
| `listAvaliacoesAngoff(id)`, `feedbackPainelAngoff(id)` | todas, com p observado e histograma | as próprias e a média do painel das rodadas fechadas | não |
| `listDiscussaoAngoff(id)`, `comentarAngoff(id, { questao_id, texto })` | pode | pode | não |
| `listHofsteeAngoff(id)`, `salvarHofsteeAngoff(id, h)` | pode | o próprio | não |
| `avancarPainelAngoff(id, acao)`, `publicarAngoff(id, { minJuizes, justificativa })` | pode (publica em `questoes.angoff_painel` só com 10 juízes ou mais, erro-padrão do corte abaixo de 0,02 e Hofstee com o corte na janela; sem Hofstee ou fora da janela, só com justificativa de 30 caracteres, gravada em `angoff_paineis.publicacao_justificativa`) | não | não |

Tabelas `angoff_paineis`, `angoff_juizes`, `angoff_avaliacoes`, `angoff_discussao` e
`angoff_hofstee`, com RLS: só a equipe e os juízes designados; juiz não pode ser
participante com matrícula ativa. Mudança de conteúdo do item apaga o Angoff do painel.

## `plataforma/js/calibracao.js` (admin)

| Função | O que faz |
|---|---|
| `prepararRecalibracao({ store, step, tau, minRespostas = 30, incluirTutor })` | prévia: `{ itens: [{ id, b_angoff, b, ep, n, aplicar, delta }], a_aplicar, pessoas, respostas, convergiu, ... }` |
| `aplicarRecalibracao({ store, preparo })` | grava os b dos itens com `aplicar: true` |
| `desfazerCalibracao({ store, ids })` | volta esses itens ao Angoff |
| `calibrarDesfechos({ store, step })` | `{ pass_fail, escore_oficial, escore_nbme, ligacao_nbme, efeito_modo, n, dados }` a partir de `resultados_oficiais` e das NBMEs em standard-paced; `ligacao_nbme` é `corteLigadoNbme(escore_nbme, { step })` |
| `salvarModelo({ store, step, desfechos })` | grava o modelo (versão 3, `metodo: "regressao_logistica_ponderada_e_linear_sobre_theta_eap_sem_integrar_dp"`) em `modelos_psicometricos` para as telas dos alunos, com `ligacao_nbme` |

## Métodos novos da camada de dados

| Método | Participante | Admin | Retorno |
|---|---|---|---|
| `listQuestoes({ step, incluirInativas })` | itens ativos, só com matrícula ativa (sem matrícula: lista vazia) | todos; inativos com `incluirInativas` | itens brutos com `status`, `b_calibrado`, `ep_calibrado`, `n_calibracao`, `calibrado_em` |
| `setStatusQuestao(id, status)` | não pode | `ativo`, `rascunho`, `suspenso`, `aposentado` | `{ id, status }` |
| `salvarCalibracao([{ id, b, ep, n }])` | não pode | grava (`b: null` apaga) | `{ gravados }` |
| `setAtivo(userId, ativo)` | não pode | ativa ou desativa a matrícula (libera o banco) | `{ id, ativo }` |
| `saveRespostas(lista)`, `saveResposta(r)` | grava as próprias (o gabarito, o Step e a versão vêm do banco quando o item está nele) | idem | `RespostaItem[]` |
| `listRespostas({ step, origem, desde, userId, todos })` | só as próprias | todas (`todos`) ou de uma pessoa | da mais antiga para a mais nova |
| `criarSimuladoCompleto({ formulario, sessao })` | cria o próprio | idem | `SimuladoCompleto` |
| `salvarProgressoSimulado(id, sessao)` | o próprio, em andamento; bloco encerrado não reabre nem muda | qualquer | `SimuladoCompleto` |
| `concluirSimuladoCompleto(id, { sessao, resultado })`, `abandonarSimuladoCompleto(id)` | o próprio | qualquer | `SimuladoCompleto` |
| `getSimuladoCompleto(id)`, `listSimuladosCompletos({ todos, userId, step, estado })` | os próprios | todos | registro ou lista (mais recente primeiro) |
| `deleteSimuladoCompleto(id)` | não pode | pode | nada |
| `getAnotacaoItem(questaoId)`, `saveAnotacaoItem(questaoId, texto)`, `listAnotacoesItem()` | as próprias (texto vazio apaga; até 5000 caracteres) | só as próprias (o admin não lê as do aluno) | `{ user_id, questao_id, texto, atualizado_em }` |
| `reportarItem({ questao_id, motivo, texto })` | cria (sempre `aberto`) | idem | `Reporte` |
| `listReportes({ todos, status, questaoId })` | os próprios | a fila inteira com `todos: true` | lista, mais recente primeiro |
| `resolverReporte(id, { status, resposta })` | não pode | `em_analise`, `resolvido`, `rejeitado`; carimba quem e quando | `Reporte` |
| `saveResultadoOficial(x)`, `deleteResultadoOficial(id)` | não pode | lança `{ user_id, step, data, resultado, escore, observacao }` | registro |
| `listResultadosOficiais({ todos, userId, step })` | os próprios | todos | lista |
| `getModelosPsicometricos()` | lê | lê | `{ step1: Modelo | null, step2ck: Modelo | null }` |
| `saveModeloPsicometrico(step, dados)` | não pode | grava | `Modelo` |
| `listRespostasCalibracao({ step, incluirTutor, todasVersoes })` | não pode | matriz pseudonimizada `[{ pessoa, questao_id, step, resposta, correta, modo, origem, tempo_ms }]` | primeira resposta por pessoa e item |
| `getEstatisticasItens({ step, incluirTutor, todasVersoes })` | não pode | `[{ questao_id, step, n, acertos, p, em_branco, opcoes, tempo_mediano_ms, pbis, n_superior, n_inferior, opcoes_superior, opcoes_inferior }]` | agregados rápidos; para alertas e Rasch, `analisarItens(await store.listRespostasCalibracao(...), banco.porId)` |

Motivos de reporte (`MOTIVOS_REPORTE` em `registros.js`, com o rótulo da tela):
`gabarito`, `mais_de_uma_correta`, `desatualizado`, `erro_texto`, `valores_lab`,
`explicacao`, `outro` (este exige texto).

`RespostaItem`:

```js
{
  id, user_id, criado_em,
  questao_id, step,
  resposta: "A".."J" | null, correta,      // o banco recalcula correta quando o item está em questoes
  tempo_ms, marcada,
  modo: "tutor" | "cronometrado",
  origem: "banco" | "simulado" | "bloco_30",
  sessao_id, bloco, posicao,               // no simulado completo
  versao_item, respondida_em
}
```

`SimuladoCompleto`:

```js
{
  id, user_id, step, tipo: "completo" | "meio" | "prontidao", montagem: "fixo" | "personalizado",
  formulario_id, nome, reduzido,
  formulario,                              // o objeto de montarFormulario, imutável depois de criado
  sessao,                                  // estado de novaSessao/iniciarBloco/... (relógio, pausa, respostas por bloco)
  estado: "em_andamento" | "concluido" | "abandonado", bloco_atual,
  resultado,                               // de corrigirSessao().resultado
  inicio, atualizado_em, fim, criado_em
}
```

Telas dos simulados completos (`simulado/`, acréscimo de 29/10/2026): o dia de prova usa
o relógio desta seção e grava na `sessao` campos extras que a camada aceita sem mudança
(`validarSessao` e o gatilho só olham `respostas` e `bloco_atual`): `ui` (item aberto,
riscos, realces e avisos do bloco atual), `notas` (`{ questao_id: texto }`), `suspensa` e
`suspensoes` (parar e continuar depois, só entre blocos), `rev` (contador de mudanças) e
`respostas_gravadas`. Ao concluir, `resultado` ganha `estimativa` (P, θ, dp, intervalo,
rótulo de confiança) e `dia` (pausa usada, sobras, paradas). O bloco de 30 minutos grava
também `respostas_item` com `origem: "bloco_30"`. Detalhes em `simulado/README.md`.

Modo demonstração: todos os participantes têm matrícula ativa, salvo se o admin
desativar; o admin vê, além das respostas reais deste navegador, respostas sintéticas da
coorte fictícia (`respostas-demo.js`, linhas com `sintetico: true`), para que a análise de
itens e a calibração tenham o que mostrar. A tela precisa marcar esses dados como
**"dados de demonstração"**. Os resultados oficiais e os modelos ficam no `localStorage`.

## Tabelas novas no Supabase

| Tabela | Participante | Admin |
|---|---|---|
| `profiles.ativo` | não altera (o gatilho recusa) | ativa a matrícula |
| `questoes` | lê itens `ativo` só com matrícula ativa; não escreve | tudo (a importação usa a chave service_role) |
| `respostas_item` | insere e lê as próprias; não altera nem apaga | tudo |
| `simulados_completos` | cria, lê e atualiza o próprio em andamento (formulário imutável, bloco encerrado não reabre) | tudo |
| `anotacoes_item` | só as próprias | não lê |
| `reportes_item` | cria (sempre aberto) e lê os próprios | tudo; o gatilho carimba quem resolveu |
| `resultados_oficiais` | lê os próprios | tudo; no Step 2 CK, nota sem resultado vira Pass ou Fail pelo 218 a partir de 01/07/2025 |
| `modelos_psicometricos` | lê | grava |
| `anon` | nada | |

Funções (security definer, `search_path` fixo, só admin): `r2a_admin_estatisticas_itens`,
`r2a_admin_respostas_calibracao`, `r2a_admin_salvar_calibracao`. Auxiliar:
`pode_ler_banco()`. Testes: blocos Q1 a Q9 de `supabase/teste-local/02-testa-rls.sql`
(entre eles: anônimo não lê `questoes`; participante não lê respostas de outro;
participante não altera o gabarito; participante sem matrícula não lê o banco).

Testes unitários do banco de questões:

```bash
node --test plataforma/tests/banco.test.mjs plataforma/tests/psicometria.test.mjs plataforma/tests/formularios.test.mjs \
            plataforma/tests/store-banco.test.mjs plataforma/tests/importar.test.mjs
```

---

# Banco de questões no espaço do aluno (`questoes/`)

Acréscimo de 29/10/2026. Página `questoes/` com o mesmo cabeçalho, login, seletor de
papel da demonstração e menu do app de flashcards (o menu fica em `anki/js/menu.js`, usado
pelas duas páginas). Detalhes de uso em `questoes/README.md`; método em
`PSICOMETRIA.md`, seção 18.

## `plataforma/js/banco-aluno.js` (funções puras)

| Exportação | O que faz |
|---|---|
| `historicoItens(respostas)` | `Map` id -> `{ n, respondidas, primeira_correta, ultima_resposta, ultima_correta, ultima_em, marcada, em_branco_ultima }` |
| `situacaoItem(id, historico)` | `{ nao_vistas, erradas, marcadas, todas }` (erradas: tentativa mais recente errada ou em branco) |
| `filtrarPool(banco, { step, selecao, situacao, historico, reservados })` (`reservados` padrão: `banco.reservados`, que `questoes/js/app.js` preenche com `itensReservados`) | itens do Step que passam nos filtros; `selecao = { sistema: [...], disciplina: [...], ... }` ("ou" dentro da dimensão, "e" entre dimensões; disciplinas com todos os rótulos) |
| `contagemFacetas(banco, { step, selecao, situacao, historico })` | `{ situacoes, dims: { dim: { chave: n } }, disponiveis, max_bloco, fora_por_inimigos }`; a contagem de cada dimensão ignora o filtro dela mesma; `max_bloco` (`maximoSemInimigos(pool)`) é quantos itens cabem num bloco sem pares inimigos, o mesmo corte da montagem |
| `FILTROS_STEP`, `SITUACOES`, `ROTULO_SITUACAO`, `MODOS_BLOCO`, `ROTULO_MODO`, `LIMITES_BLOCO` | dimensões filtráveis por Step e limites (1 a 20 itens, 40 no modo livre, 90 s por item) |
| `validarPedidoBloco`, `sortearBlocoBanco(pool, { n, semente, historico })`, `criarBlocoBanco({ step, itens, modo, livre, criterios, dono, notas })` | pedido, sorteio estratificado e sessão no formato de `simulado/js/sessao.js`, com `origem: "banco"`, `id` (`bq-...`), `modo`, `confirmadas` |
| `confirmarResposta(s, i)`, `travada(s, i)` | modo tutor: a resposta confirmada trava |
| `paraRespostasBanco(s, porId)` | linhas para `store.saveRespostas` (uma por item, com posição, tempo, marca e `sessao_id`) |
| `resumoBlocos(respostas, itens)`, `blocoPorArea(bloco, itens, campo)` | histórico de blocos (mais recente primeiro) e acerto por área de um bloco contra o limiar |
| `curvaEvolucao({ respostas, itens, step, maxPontos })` | um ponto por sessão: `P(aprovação)`, `θ`, intervalo, acerto da sessão e do limiar |
| `contribuicaoPorArea(usadas, dim, { step, sigmaCorte, minItens })` | `[{ chave, n, acertos, esperado_limiar, deficit, taxa, taxa_limiar, p_atual, p_area_no_limiar, ganho, ganho_bruto, poucos_itens, peso_prova }]`, do maior ganho para o menor; `ganho: null` com menos de 5 itens |
| `semInimigos(escolhidos, pool)` | troca o segundo item de um par inimigo (`item.inimigos`) pelo próximo do pool; `sortearBlocoBanco` já aplica |
| `linksDeEstudo(step, dim, chave, { base, situacao })`, `linkBloco`, `ANCORAS_CONTEUDO_S1`, `BASE_S1_DO_CK` | links para `conteudo-step1.html#s-...`, `anki/#/estudar?...&modo=treino` e `questoes/#/criar?...` |
| `recomendacoes({ step, est, contribuicao, base })` | lista ordenada `{ tipo: "area" \| "cobertura" \| "volume", nome, texto, links }` |
| `resumoAprovacao({ banco, respostas, step, modelos, nbme, config, base })` | tudo o que o painel e o cartão de "Meu progresso" mostram: `{ est, contribuicao, recomendacoes, prontidao, limiar_texto, itens_no_banco, nao_vistos, modelo_demonstracao }` |
| `curvaPosterior(respostas, itens, step)`, `estatisticasAluno(banco, historico, step)`, `chavesDaDimensao` | densidade de `θ` para o gráfico, números do aluno e chaves na ordem do outline |

## Tela do bloco compartilhada (`simulado/js/interface-bloco.js`)

O banco usa a mesma tela de bloco do simulado de 30 minutos e dos simulados completos
(`montarBloco(el, cfg)`). Para o modo tutor, a tela ganhou ganchos opcionais, que não mudam
nada para quem não os passa: `estado.travada(i)`, `estado.gabarito(i)`,
`questaoExtra: { html(i), clique(ev, i) }`, `relogio.progressivo` e o método
`redesenhar()` no retorno. A página `questoes/` carrega `../simulado/simulado.css` (estilos
da tela do bloco e do resultado) antes de `../anki/anki.css`; `questoes/questoes.css`
desfaz o único conflito de nome (`.painel`).

## Onde o banco aparece

- rodapé de `index.html`: "Banco de questões" (`questoes/`) e "Simulados"
  (`simulado/#/completos`), ao lado de "Simulado de 30 minutos";
- menu da área do aluno (`anki/js/menu.js`): item "Questões";
- menu da área administrativa (`admin/js/app.js`): item "Questões";
- cabeçalho e rodapé do Conteúdo do Step 1 (gerados por `tools/build-conteudo-step1.cjs`);
- cabeçalho do simulado: link "Questões";
- "Meu progresso" (`anki/js/views/progresso.js`): cartão com a probabilidade de cada
  Step pelo banco, o rótulo de confiança, os itens que faltam e a área que mais derruba
  a probabilidade, com link para `questoes/#/aprovacao`.

Testes: `node --test plataforma/tests/banco-aluno.test.mjs` e
`node questoes/tests/fluxos.e2e.mjs` (Playwright e axe-core, em 1440 e 390 px, temas
claro e escuro).


---

# Análise de itens na área administrativa

Acréscimo de 29/10/2026. Telas em `admin/` (`#/itens`, `#/item/<id>`, `#/calibracao`,
`#/blueprint`), descritas em `admin/README.md`; funções puras em `admin/js/analise.js`;
método em `PSICOMETRIA.md`, seção 19.

## Métodos novos da camada de dados (os dois modos)

| Método | Participante | Admin | Retorno |
|---|---|---|---|
| `setStatusQuestao(id, status, { motivo })` | não pode | muda o status; o motivo vai para o histórico | `{ id, status }` |
| `editarGabarito(id, { correta, motivo, recorrigir = true })` | não pode | motivo de 5 a 1000 caracteres; letra entre as alternativas e diferente da atual; a versão sobe e a calibração do item é apagada; com `recorrigir`, as respostas gravadas na versão em vigor passam a valer pela letra nova e vão para a versão nova (as de versões de conteúdo anteriores não mudam) | `{ id, versao, de, para, recorrigidas }` |
| `marcarRevisaoQuestao(id, { revisao = true, nota })` | não pode | marca ou desmarca (nota até 1000 caracteres); o item continua no banco | `{ id, em_revisao, revisao_nota }` |
| `listHistoricoQuestao(id = null)` | não pode | histórico de um item ou de todos, do mais antigo para o mais novo | `[{ id, questao_id, versao, acao: "gabarito" \| "conteudo" \| "status" \| "revisao", de, para, motivo, recorrigidas, editor_id, criado_em }]` |

`listQuestoes` traz, só para o admin, `em_revisao` e `revisao_nota` (o carregador
`normalizarItem` preserva os dois campos). O campo `revisao` do contrato do item (quem
revisou o conteúdo) continua sendo outro campo.

No Supabase: colunas `questoes.em_revisao` e `questoes.revisao_nota`; tabela
`questoes_historico` (só o admin lê; ninguém escreve direto, o gatilho
`questoes_registrar_historico` grava cada mudança de gabarito, conteúdo, status e marca);
funções `r2a_admin_editar_gabarito(p_id, p_correta, p_motivo, p_recorrigir)`,
`r2a_admin_marcar_revisao(p_id, p_revisao, p_nota)` e
`r2a_admin_status_questao(p_id, p_status, p_motivo)` (security definer, `search_path`
fixo, só admin). O motivo chega ao gatilho pela configuração local da transação
`r2a.motivo`. Testes Q10a a Q10v de `supabase/teste-local/02-testa-rls.sql`.

`calibrarDesfechos()` (`calibracao.js`) devolve também `dados: { oficiais, nbme }`, os
pontos (θ na data do desfecho e resultado ou nota) usados no ajuste, para os gráficos.

## Modo demonstração

`LocalStore` acrescenta, só para o admin, dados fictícios gerados na memória por
`plataforma/js/respostas-demo.js` (todas as linhas com `sintetico: true`):

- `listRespostas({ todos })` e `listRespostasCalibracao()`: respostas dos participantes
  fictícios e de examinandos de turmas anteriores simuladas (`demo-sint-cal-s1-001`...,
  fora da lista de participantes);
- `listResultadosOficiais({ todos })`: desfechos fictícios Pass/Fail dessas turmas (sem
  nota de três dígitos); não podem ser alterados nem excluídos;
- `listReportes({ todos })`: reportes fictícios sobre itens com defeito plantado; a
  resolução feita pelo admin fica gravada neste navegador.

As respostas fictícias seguem o gabarito em vigor: depois de uma correção de gabarito,
elas passam a ser corrigidas pela letra nova.


---

# Produto integrado: espaço do aluno e espaço da equipe

Acréscimo de 29/10/2026. As cinco áreas (flashcards, banco de questões, simulados, Meu
progresso e área administrativa) usam a mesma conta, a mesma camada de dados e as mesmas
funções de estimativa; esta seção lista o que liga uma à outra.

## Navegação

| Página | Leva a |
|---|---|
| `index.html` (rodapé) | flashcards, simulado de 30 minutos, banco de questões, simulados completos, Conteúdo do Step 1 |
| `anki/` e `questoes/` (menu comum, `anki/js/menu.js`) | todas as telas dos flashcards, Questões, Simulado, Conteúdo do Step 1 e, para o admin, Rendimento |
| `simulado/` (cabeçalho) | flashcards, Questões, Conteúdo do Step 1 |
| `admin/` (menu) | telas da equipe, Flashcards, Questões, Simulado, Conteúdo do Step 1 |
| `conteudo-step1.html` (cabeçalho e rodapé) | flashcards, Questões, Simulado e simulados completos |

## A mesma probabilidade em todas as telas

A probabilidade de estar acima do limiar do banco sai sempre de `estimarAluno` com todas as
respostas do aluno no Step (banco, simulados completos e blocos de 30 minutos) e aparece
com `textoProbabilidade` em: placa e painel do banco (`questoes/#/`, `#/aprovacao`),
cartão de "Meu progresso", indicador de `simulado/#/completos`, ficha do participante e
lista de participantes na área administrativa. O relatório de cada simulado completo
mostra a estimativa daquele dia (só os itens do formulário que contam) e, abaixo, a geral,
com uma frase que explica por que as duas podem diferir (a geral repesa pelo outline).

## Simulados completos fora da página do simulado

- "Meu progresso" (`anki/#/progresso`), seção "Simulados completos":
  `listSimuladosCompletos({})` do próprio aluno; em andamento (com o bloco e o link
  "Continuar" para `simulado/#/dia/<id>`) e encerrados (acertos, probabilidade guardada no
  fim do dia e link para o relatório). A linha usa `linhaHistorico` de
  `simulado/js/relatorio.js`, a mesma do histórico da página do simulado.
- Ficha do participante (`admin/#/p/<id>`), seção "Simulados completos":
  `listSimuladosCompletos({ userId })`, com a mesma linha e o link para o relatório.
- Relatório aberto pela equipe (`simulado/#/relatorio/<id>` com `reg.user_id` diferente
  da conta aberta): a estimativa geral, os itens já vistos e a EXIT 18 usam
  `listRespostas({ step, userId: reg.user_id })` e `listNbme({ step, userId })`, e o
  relatório avisa que foi aberto pela equipe.

## Última atividade

`resumirParticipante` recebe `respostas` e `simuladosCompletos` (no `LocalStore`, os da
própria conta), e `r2a_resumo_interno` lê `respostas_item` e `simulados_completos`. Sem
isso, quem estuda só pelo banco ou pelos simulados completos aparecia como "Nunca
estudou" e acendia o risco de inatividade. A função SQL é criada com
`check_function_bodies` desligado só na sua definição, porque as duas tabelas aparecem
mais abaixo em `schema.sql`. `03-compara-resumo.mjs` confere a paridade com uma resposta
recente, uma antiga e um simulado completo.

## Teste do percurso inteiro

```bash
AXE_PATH=/caminho/axe.min.js node plataforma/tests/produto.e2e.mjs [pasta-das-capturas]
```

Um navegador, modo demonstração, banco sintético no tamanho oficial servido no lugar de
`banco-privado/`: rodapé do site; bloco personalizado pelo formulário do banco; Step 1
completo com bloco 1, pausa com saldo, bloco 2 pelo tempo, parada, volta por "Meu
progresso", retomada e blocos 3 a 14 pelo tempo (relógio acelerado); relatório; a mesma
probabilidade no banco, em "Meu progresso", nos simulados completos e na ficha do
admin, com 290 itens; análise de itens e ficha do item; relatório aberto pela equipe;
links e navegação das cinco áreas; axe-core e rolagem horizontal em 1440 e 390 px nos dois
temas; nenhum erro de console. São 13 etapas.
