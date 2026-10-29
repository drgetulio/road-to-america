# Psicometria do banco de questões

Este documento descreve como a plataforma estima a probabilidade de aprovação de
cada aluno no Step 1 e no Step 2 CK a partir das respostas dadas no banco de questões
e nos simulados, como analisa a qualidade de cada item e como as estimativas passam a
usar dados reais quando eles existirem. O código está em `plataforma/js/psicometria.js`
(funções puras, sem dependências e determinísticas), `plataforma/js/calibracao.js`
(rotinas do admin) e nas funções `r2a_admin_*` de `supabase/schema.sql`. Os testes
estão em `plataforma/tests/psicometria.test.mjs`, `formularios.test.mjs` e
`store-banco.test.mjs`, e a equivalência entre o banco de dados e o JavaScript é
conferida por `supabase/teste-local/04-compara-itens.mjs`.

**O que a estimativa é.** Uma probabilidade, calculada por um modelo de resposta ao
item, de o desempenho do aluno estar acima do padrão de aprovação que a equipe fixou
para o banco. **O que ela não é.** Um resultado do USMLE ou do NBME. Enquanto não
houver desfechos reais suficientes (seção 11), o padrão vem só do julgamento de Angoff
dos autores dos itens, e a tela precisa dizer isso.

## 1. Notação

| Símbolo | Significado |
|---|---|
| `a_i` | Angoff do item i: probabilidade de o examinando minimamente competente acertá-lo |
| `b_i` | dificuldade do item i na escala de Rasch (logits) |
| `θ` | habilidade do aluno na mesma escala; `θ = 0` é o examinando no limiar |
| `x_i` | 1 se acertou o item i, 0 se errou |
| `w_i` | peso da resposta (seção 4) |
| `expit(z)` | `1 / (1 + e^(-z))`; `logit(p) = ln(p / (1 - p))` |

## 2. Definição do padrão: Angoff modificado

No método de Angoff (Angoff, 1971), juízes estimam, para cada item, a probabilidade de
um examinando minimamente competente acertá-lo; o escore de corte do teste é a soma
dessas probabilidades. No banco, cada item traz o campo `angoff`
(`plataforma/CONTRATO-ITEM.md`). Quando ele falta, o carregador usa o padrão do
contrato: 0,80 para item fácil, 0,65 para médio e 0,45 para difícil.

Escore de corte de um formulário com itens `1..n`:

```
corte = a_1 + a_2 + ... + a_n          (em itens)
corte_% = (a_1 + ... + a_n) / n        (em percentual)
```

No blueprint do Step 1 preparado para os 520 itens novos, a média dos Angoff-alvo é
0,655 (`banco-privado/blueprint-step1.json`, campo `distribuicao.angoff`), o que dá um
corte provisório perto de 65,5% num formulário com a mesma composição.

## 3. Modelo: Rasch ancorado no limiar

O modelo de Rasch (Rasch, 1960) dá a probabilidade de acerto como função da diferença
entre a habilidade e a dificuldade:

```
P(x_i = 1 | θ) = expit(θ - b_i)
```

A ancoragem no padrão é feita por construção:

```
b_i = -logit(a_i)    ⇒    P(x_i = 1 | θ = 0) = expit(logit(a_i)) = a_i
```

Assim, o examinando com `θ = 0` acerta cada item com a probabilidade que o juiz
atribuiu ao examinando no limiar, e o seu escore esperado num formulário é exatamente o
corte de Angoff. "Estar acima do limiar" passa a ser `θ > 0`. Exemplos: Angoff 0,65 dá
`b = -0,619`; 0,80 dá `b = -1,386`; 0,45 dá `b = 0,201`.

Depois da recalibração (seção 10), o item usa `b_calibrado` no lugar de `-logit(a_i)`.

## 4. Quais respostas entram

`prepararRespostas()` aplica, nesta ordem:

1. **Só a primeira resposta de cada item.** Ao rever um item, o aluno responde de
   memória; essa resposta mede a lembrança do item, não a habilidade.
2. **Peso pelo modo.** Cronometrado (banco em modo cronometrado, simulado completo e
   bloco de 30 minutos): peso 1. Modo tutor: peso 0,5 (critério interno da Road to
   America: a resposta sem relógio tende a superestimar o desempenho de prova). O peso
   entra como potência da verossimilhança; peso 0 exclui a resposta. Com
   `pesos: { tutor: 0 }` o modo tutor sai por completo.
3. **Em branco.** No banco, item sem resposta não entra (o aluno pulou). No simulado
   completo e no bloco de 30 minutos, conta como erro, como na prova.
4. **Item fora do banco ou de outro Step** não entra (`ignoradas` na saída).

## 5. Estimativa da habilidade: EAP em grade

Posterior de `θ`, com priori normal de média 0 e desvio-padrão 1,5 (parâmetro do método
adotado):

```
log π(θ | x) = -θ² / (2 · 1,5²) + Σ_i w_i [ x_i · ln expit(θ - b_i) + (1 - x_i) · ln expit(b_i - θ) ] + constante
```

A posterior é avaliada numa grade de -6 a 6 logits com passo de 0,01 (1.201 pontos) e
normalizada pela regra do trapézio. A estimativa EAP (Bock e Mislevy, 1982) é a média
posterior:

```
θ̂ = ∫ θ π(θ | x) dθ,     dp = sqrt( ∫ (θ - θ̂)² π(θ | x) dθ )
```

O intervalo de credibilidade de 90% vai do quantil 0,05 ao quantil 0,95 da posterior.
Respostas com o mesmo `b` são somadas num termo só (a conta é a mesma e fica mais
rápida).

## 6. Probabilidade de aprovação e percentual esperado

```
P(aprovação) = P(θ > 0 | respostas) = ∫_0^6 π(θ | x) dθ
```

O **percentual esperado num formulário completo** usa as dificuldades `b_1..b_m` de um
formulário de referência (por padrão, todos os itens do Step no banco; a tela pode
passar um formulário fixo de `formularios.js`):

```
f(θ) = (1/m) Σ_j expit(θ - b_j)
percentual esperado = ∫ f(θ) π(θ | x) dθ
intervalo de 90% = [ f(θ_0,05), f(θ_0,95) ]      (f é crescente em θ)
percentual do limiar = f(0) = média dos Angoff
```

## 7. Regra de confiança

A tela mostra **"Alta confiança"** só quando as três condições valem ao mesmo tempo;
caso contrário, **"Estimativa preliminar"** e quantos itens faltam.

1. **Decisão:** `P >= 0,90` ou `P <= 0,10`.
2. **Número mínimo de itens N**, definido pela largura do intervalo: N é o número de
   itens com que o examinando no limiar chega a desvio-padrão posterior de 0,25. Pela
   informação de Fisher do item de Rasch, `I_i(θ) = P_i(θ) (1 - P_i(θ))`, e pela
   aproximação `1/dp² ≈ 1/1,5² + Σ I_i`:

   ```
   N = ceil( (1/0,25² - 1/1,5²) / Ī(0) ),     Ī(0) = média de a_i (1 - a_i) nos itens do Step
   ```

   No limiar, a informação de um item é 0,2475 com Angoff 0,45; 0,2275 com 0,65; e
   0,16 com 0,80. Com os 40 itens públicos de cada Step (Angoff padrão), N = 73; com os
   Angoff-alvo do blueprint do Step 1, N = 75 (valores calculados por `itensMinimos()`).
   A soma dos pesos (`n_efetivo`) é comparada com N.
3. **Cobertura:** itens respondidos em pelo menos 80% dos sistemas do outline (9 de 11
   no Step 1; 12 de 14 no Step 2 CK).

Quantos itens faltam: o maior entre `N - n_efetivo` e o número de itens com que `|θ̂|`
passaria de 1,28 desvio-padrão (quantil 0,90 da normal), estimado com a informação
média dos itens ainda não vistos:

```
faltam_decisão = ceil( (1/dp_alvo² - 1/dp²) / Ī(θ̂) ),   dp_alvo = |θ̂| / 1,2816
```

Com `|θ̂| < 0,05` (aluno praticamente no limiar), a tela não promete número: mais itens
quase não mudam a classificação (`perto_do_limiar: true`).

Escolha de projeto: a precisão é exigida pela contagem N, e não pelo desvio-padrão do
próprio aluno, porque a informação de Rasch cai longe do limiar. Um aluno com
`θ = 1` e 160 itens tem desvio-padrão perto de 0,27 e `P` acima de 0,999; exigir 0,25
dele adiaria uma classificação que já está decidida (caso medido no teste
"estimarAluno com aluno simulado forte").

## 8. Perfil por área em relação ao limiar

O relatório oficial de reprovação do Step 1 mostra, por área de conteúdo, se o
desempenho foi mais baixo, igual ou mais alto que o de examinandos com aprovação baixa
(USMLE, modelo de relatório de reprovação de 26/01/2022). `perfilPorArea()` faz o
análogo com o limiar do banco: para cada sistema, disciplina (todos os rótulos do item)
e competência no Step 1, ou sistema, disciplina clínica (todos os rótulos), tarefa do
médico e área do painel no Step 2 CK, calcula uma estimativa EAP própria, com a mesma
priori, só com os itens daquela área, e classifica pelo intervalo central de 90%:

| Classe | Regra |
|---|---|
| `mais_alto` | quantil 0,05 > 0 |
| `mais_baixo` | quantil 0,95 < 0 |
| `igual` | o intervalo cruza o 0 (indistinguível do limiar) |
| `insuficiente` | menos de 5 itens na área (critério interno) |

Cada área traz também a taxa bruta de acertos e `esperado_limiar` (média dos Angoff dos
itens que o aluno respondeu), para a tela mostrar "você acertou 58%; o examinando no
limiar acertaria 64% destes itens".

## 9. Step 2 CK

O Step 2 CK informa nota de três dígitos, com mínimo de 218 desde 01/07/2025 (USMLE,
Examination Results and Scoring). A plataforma **não converte θ em nota**: não há
dados que liguem a escala do banco à escala do USMLE. O que ela mostra é
`P(θ > 0)`, a probabilidade de atingir o padrão do banco, que a equipe fixou por Angoff
para representar o mínimo de 218, com o aviso: "o limiar do banco foi fixado por
Angoff; a nota de três dígitos só será estimada depois da calibração com escores
reais". Quando houver pelo menos 30 notas reais (seção 11), `preverEscore()` passa a dar
a nota esperada, o intervalo preditivo de 90% e `P(nota >= 218)`.

## 10. Prontidão combinada

O critério principal continua sendo a EXIT 18 (`materiais/overdeliveries-step1.html`;
regra em `plataforma/js/desempenho.js`, função `prontidao`): as duas autoavaliações
NBME mais recentes do Step, em standard-paced, com probabilidade de aprovação de pelo
menos 90%. `prontidaoCombinada()` acrescenta o banco como indicador complementar:

| EXIT 18 | Banco | Resultado |
|---|---|---|
| pronto | qualquer, salvo alta confiança com P <= 0,10 | pronto |
| pronto | alta confiança com P <= 0,10 | pronto, com `divergente: true` e pedido de conversa com o mentor |
| não pronto | alta confiança com P >= 0,90 | não pronto, com `divergente: true` (a decisão segue a NBME) |
| insuficiente | qualquer | insuficiente; o banco aparece só como indicador |

O banco nunca declara "pronto" sozinho. A orientação do NBME lembra que uma estimativa
de 90% ainda significa que cerca de 1 em cada 10 alunos parecidos é reprovado (NBME,
orientação para interpretar a CBSSA, consultada por busca em 28/10/2026).

## 11. Análise de itens

`analisarItens()` (JavaScript, com ajuste ao Rasch) e `r2a_admin_estatisticas_itens()`
(banco de dados, estatísticas clássicas) usam as mesmas regras de entrada: primeira
resposta de cada pessoa no item; se essa primeira resposta foi no modo tutor, o item sai
para a pessoa; só a versão atual do item (quando o conteúdo muda, a versão sobe e as
respostas antigas saem, salvo `todasVersoes`). O script `04-compara-itens.mjs` confere
que as duas implementações dão os mesmos números (240 itens comparados, 0 diferenças na
última execução).

| Índice | Fórmula |
|---|---|
| Dificuldade `p` | acertos / respostas |
| Ponto-bisserial corrigida | correlação de Pearson entre `x_ij` e a proporção de acertos da pessoa j nos **outros** itens, `(S_j - x_ij) / (n_j - 1)`, só para quem respondeu pelo menos 2 itens (correção de Henrysson, 1963) |
| Discriminação `D` | `p` no grupo superior menos `p` no inferior; grupos de 27% de cada lado pela mesma proporção nos outros itens (Kelley, 1939), desempate pelo identificador da pessoa |
| Distratores | por alternativa: n, proporção geral, nos grupos superior e inferior, e ponto-bisserial da escolha |
| Outfit | `(1/n) Σ_j (x_ij - P_ij)² / (P_ij (1 - P_ij))`, com `P_ij = expit(θ̂_j - b_i)` e `θ̂_j` EAP da pessoa |
| Infit | `Σ_j (x_ij - P_ij)² / Σ_j P_ij (1 - P_ij)` |

Alertas automáticos (`revisar` pede revisão do item; `informativo` só avisa):

| Código | Regra | Nível | Origem do limite |
|---|---|---|---|
| `p_baixo` | p < 0,20 | revisar | método adotado pela Road to America |
| `p_alto` | p > 0,95 | revisar | idem |
| `pbis_negativa` | ponto-bisserial < 0 | revisar | idem |
| `pbis_baixa` | 0 <= ponto-bisserial < 0,10 | revisar | idem |
| `distrator_atrai_melhores` | no grupo superior, algum distrator foi mais escolhido que a correta | revisar | idem |
| `desajuste_rasch` | infit ou outfit fora de 0,7 a 1,3, com n >= 30 | revisar | faixa para testes de múltipla escolha "de rotina" em Wright e Linacre (1994) |
| `distrator_nao_funcional` | distrator escolhido por menos de 5%, com n >= 30 | informativo | definição de Haladyna e Downing (1993) |
| `amostra_pequena` | menos de 30 respostas | informativo | critério interno |

Com menos de 30 respostas os alertas aparecem, mas a tela deve marcá-los como
provisórios (`confiavel: false`). O teste "análise de itens" confere à mão a
ponto-bisserial de um caso pequeno e mostra que um item com gabarito trocado dispara
`pbis_negativa`, `distrator_atrai_melhores` e `desajuste_rasch`.

## 12. Recalibração com as respostas da turma

`recalibrarRasch()` estima juntos os `b_i` e os `θ_j` por máxima verossimilhança
conjunta penalizada (JML com priori, isto é, máximo a posteriori):

```
b_i ~ N(b_angoff_i, τ²),  τ = 0,5 logit        θ_j ~ N(0, 1,5²)
maximiza  Σ w log P(x | θ_j - b_i) - Σ_i (b_i - b_angoff_i)² / (2τ²) - Σ_j θ_j² / (2 · 1,5²)
```

O algoritmo alterna um passo de Newton por pessoa e um por item (passo limitado a 1
logit) até a maior mudança ficar abaixo de 1e-5. Com `τ = 0,5`, a priori de um item vale
o mesmo que cerca de `1 / (τ² · 0,2) = 20` respostas perto do limiar (critério interno:
com poucas respostas o item fica perto do Angoff; com muitas, os dados mandam).

**Ancoragem pela curva característica do teste.** Depois da convergência, todos os
`b_i` e `θ_j` são deslocados pela mesma constante `c`, escolhida para que

```
Σ_i expit(-(b_i + c)) = Σ_i a_i      (nos itens que recebem o b novo)
```

Isso mantém o escore de corte de Angoff: o examinando no limiar continua com escore
esperado igual ao corte que os juízes fixaram, e a recalibração só redistribui a
dificuldade relativa entre os itens. Deslocar `b` e `θ` juntos não muda a
verossimilhança.

`prepararRecalibracao()` (em `calibracao.js`) roda a recalibração com a matriz da turma
e marca para gravação só os itens com pelo menos 30 respostas; a ancoragem é feita nesses
itens. `aplicarRecalibracao()` grava `b_calibrado`, o erro-padrão e o número de
respostas; `desfazerCalibracao()` volta ao Angoff. Mudar o conteúdo de um item apaga a
calibração dele (gatilho `questoes_guard`).

Recuperação de parâmetros (teste "recuperação de parâmetros do Rasch", semente 31): 200
itens, 500 examinandos com 120 itens cada, dificuldades verdadeiras iguais ao Angoff
mais um erro normal de desvio-padrão 0,5. A correlação entre o `b` estimado e o
verdadeiro foi 0,986, contra 0,824 do Angoff; o erro quadrático médio, depois de tirar a
translação, caiu de 0,509 para 0,146 logit; 35 iterações.

## 13. Desfechos reais

`calibrarDesfechos()` junta, para cada aluno, o `θ` EAP calculado só com as respostas
dadas até a data do desfecho (`montarDadosDesfechos()`) e:

- **resultado oficial Pass/Fail** (tabela `resultados_oficiais`): regressão logística
  `P(Pass) = expit(β0 + β1 θ)` por IRLS com penalização leve (1e-6) no coeficiente
  angular. É considerada suficiente com pelo menos 10 aprovados e 10 reprovados, pela
  regra de cerca de 10 eventos por variável (Peduzzi et al., 1996). Saem também a área
  sob a curva ROC e o escore de Brier.
- **nota oficial do Step 2 CK** e **escore NBME em standard-paced**: regressão linear
  `nota = a + b θ + erro`, suficiente com pelo menos 30 notas (critério interno).

Com o modelo suficiente, a probabilidade pelos desfechos integra a incerteza de `θ`:

```
P(Pass | respostas) ≈ média de expit(β0 + β1 (θ̂ + z · dp)) com z de -4 a 4 (81 pontos, pesos normais)
P(nota >= 218) = 1 - Φ( (218 - (a + b θ̂)) / sqrt(σ² + b² dp²) )
```

`salvarModelo()` grava o modelo em `modelos_psicometricos` (todos os logados leem, só o
admin grava); a tela do aluno o passa para `estimarAluno({ modeloDesfechos, modeloEscore })`.
Sem modelo suficiente, `estimarAluno` devolve `desfechos: null` e `escore: null`, e o
aviso "estimativa calculada pelo padrão de Angoff do banco; não é resultado oficial".

## 14. Validação por simulação

Teste "calibração da P(aprovação)" (semente 20261029): 2.500 examinandos com `θ`
sorteado da priori, entre 40 e 199 itens cada, sorteados de 400 itens com Angoff de 0,37
a 0,88. Resultado:

| P informada | Examinandos | Proporção real acima do limiar | P média informada |
|---|---|---|---|
| < 0,10 | 1.089 | 0,005 | 0,005 |
| 0,10 a 0,50 | 192 | 0,281 | 0,275 |
| 0,50 a 0,85 | 132 | 0,742 | 0,700 |
| 0,85 a 0,95 | 101 | 0,901 | 0,905 |
| >= 0,90 | 1.046 | 0,995 | 0,993 |

O intervalo de 90% conteve o `θ` verdadeiro em 90,1% dos casos. O teste falha se a
diferença entre a proporção real e a P média passar de 0,07 na faixa de 0,85 a 0,95, ou
de 0,08 nas outras faixas.

## 15. Limitações

1. **O padrão é tão bom quanto o Angoff.** Os valores foram estimados pelos autores dos
   itens, e não por um painel independente de juízes. Um erro comum a todos os itens
   (por exemplo, todos fáceis demais) desloca o limiar e não diminui com mais respostas.
   A probabilidade calculada considera só a incerteza estatística de `θ`; ela não inclui
   a incerteza do padrão. Por isso o rótulo "alta confiança" se refere à precisão da
   estimativa, e a tela diz que não é resultado oficial.
2. **Banco não é prova.** Itens escritos para ensinar, repetidos em tutor e respondidos
   em casa diferem da prova real (local, cansaço, pressão). O peso de tutor e a regra da
   primeira resposta reduzem, mas não eliminam, essa diferença.
3. **Rasch supõe a mesma discriminação para todos os itens** e independência local.
   Itens que se ajudam (mesma vinheta, mesmo tema em sequência) violam a independência;
   a montagem evita itens seguidos do mesmo sistema, mas não garante independência.
4. **A priori N(0, 1,5²)** representa a população de alunos. Se a turma for muito
   diferente, as probabilidades intermediárias ficam menos calibradas; as extremas (as
   que geram "alta confiança") dependem pouco da priori quando há N itens.
5. **JML tem viés conhecido em testes curtos** (Wright e Douglas, 1977); a priori nos
   dois lados reduz o problema, e a gravação só acontece para itens com pelo menos 30
   respostas. A alternativa condicional (CML) não foi implementada.
6. **Ponto-bisserial com formulários diferentes.** No banco, cada aluno responde um
   subconjunto diferente de itens, e a proporção nos outros itens mistura habilidade com
   a dificuldade do subconjunto. Por isso o infit e o outfit, que usam `θ` de Rasch,
   acompanham os índices clássicos.
7. **Os índices do NBME não são públicos.** A Road to America reproduz os procedimentos
   clássicos de análise de itens; não há garantia de que os limites coincidam com os do
   NBME.
8. **Faixas do outline.** As faixas usadas na montagem vêm das páginas do USMLE
   consultadas por busca em 28/10/2026 (a página de Cirurgia no Step 2 CK tem fontes
   divergentes, e por isso Cirurgia fica sem faixa); o USMLE avisa que as porcentagens
   podem mudar a qualquer momento.

## 16. Referências

- Angoff WH. Scales, norms, and equivalent scores. In: Thorndike RL, editor. Educational Measurement. 2nd ed. Washington: American Council on Education; 1971. p. 508-600.
- Bock RD, Mislevy RJ. Adaptive EAP estimation of ability in a microcomputer environment. Applied Psychological Measurement. 1982;6(4):431-444.
- Haladyna TM, Downing SM. How many options is enough for a multiple-choice test item? Educational and Psychological Measurement. 1993;53(4):999-1010.
- Henrysson S. Correction of item-total correlations in item analysis. Psychometrika. 1963;28(2):211-218.
- Kelley TL. The selection of upper and lower groups for the validation of test items. Journal of Educational Psychology. 1939;30(1):17-24.
- Peduzzi P, Concato J, Kemper E, Holford TR, Feinstein AR. A simulation study of the number of events per variable in logistic regression analysis. Journal of Clinical Epidemiology. 1996;49(12):1373-1379.
- Rasch G. Probabilistic models for some intelligence and attainment tests. Copenhagen: Danish Institute for Educational Research; 1960.
- Wright BD, Douglas GA. Best procedures for sample-free item analysis. Applied Psychological Measurement. 1977;1(2):281-295.
- Wright BD, Linacre JM. Reasonable mean-square fit values. Rasch Measurement Transactions. 1994;8(3):370.
- Abramowitz M, Stegun IA. Handbook of Mathematical Functions. Washington: National Bureau of Standards; 1964. Fórmula 7.1.26 (função de distribuição normal).
- USMLE. Step 1 (formato e conteúdo): https://www.usmle.org/step-exams/step-1. Step 2 CK: https://www.usmle.org/step-exams/step-2-ck. Examination Day Testing: https://www.usmle.org/bulletin-information/examination-day-testing. Examination Results and Scoring: https://usmle.org/scores-transcripts/examination-results-and-scoring. Modelo de relatório de reprovação do Step 1: https://www.usmle.org/sites/default/files/2021-08/STEP1_sample_fail_report_Jan_26_2022.pdf. Consultas em 28/10/2026.
- NBME. Orientação para interpretar a CBSSA e o CBSE: https://www.nbme.org/wp-content/uploads/2026/04/CBSSA_CBSE_Guidance.pdf (consultada por busca em 28/10/2026).
