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
  ultima_atividade   // mais recente entre revisão, simulado e data de NBME; null se nunca houve
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
# o bloco final precisa mostrar "falhas | 0" (80 verificações)
node supabase/teste-local/03-compara-resumo.mjs   # precisa terminar em "Diferenças: 0"
```

Testes unitários:

```bash
cd plataforma && node --test tests/*.test.mjs
cd anki && node --test tests/*.test.mjs
```
