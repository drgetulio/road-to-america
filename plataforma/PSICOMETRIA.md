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
3. **Em branco.** No modo cronometrado (bloco cronometrado do banco, simulado completo
   e bloco de 30 minutos), item sem resposta conta como erro, como na prova: se não
   contasse, deixar em branco os itens difíceis inflaria a estimativa. No bloco tutor do
   banco, item sem resposta não entra (o aluno pulou, sem relógio que o forçasse).
   Correção de 29/10/2026: até essa data, o item em branco do banco ficava fora da conta
   também no cronometrado.
4. **Item fora do banco ou de outro Step** não entra (`ignoradas` na saída).
5. **Resposta a uma versão anterior do item** (o conteúdo mudou, ou o gabarito foi
   corrigido sem recorreção) não é pontuada contra o item atual e conta em `ignoradas`.
   O item fica como visto: uma resposta à versão nova já não seria a primeira
   exposição. Resposta sem versão registrada entra normalmente. Correção de 29/10/2026:
   até essa data, a resposta antiga continuava pontuada pelo gabarito antigo.

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
| Outfit | `(1/n) Σ_j (x_ij - P_ij)² / (P_ij (1 - P_ij))`, com `P_ij = expit(θ̂_j - b̂_i)`, `θ̂_j` EAP da pessoa e `b̂_i` a dificuldade estimada com as respostas do próprio item (`bAjuste`: máximo a posteriori com os `θ̂_j` fixos e priori N(b em uso, 0,5²)) |
| Infit | `Σ_j (x_ij - P_ij)² / Σ_j P_ij (1 - P_ij)` |

O ajuste usa `b̂_i`, e não o b de Angoff, porque o infit e o outfit medem a forma da
curva do item, não a posição. Correção de 29/10/2026: até essa data o ajuste usava o b em
uso; numa simulação com 320 itens que seguem o Rasch, 400 examinandos de habilidade
conhecida (cerca de 190 respostas por item) e Angoff com erro de desvio-padrão 0,45
logit, 38 itens bons recebiam `desajuste_rasch` antes da recalibração; com `b̂_i`, 5. O
item com gabarito trocado continua com o alerta.

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
  regra de cerca de 10 eventos por variável (Peduzzi et al., 1996), desde que o ajuste
  convirja e não haja separação completa (todos os aprovados com θ acima de todos os
  reprovados, ou o contrário): nesse caso a verossimilhança não tem máximo finito
  (Albert e Anderson, 1984), o β1 cresce sem limite e a curva vira degrau, e o modelo
  fica exploratório (`separacao: true`). Saem também a área sob a curva ROC e o escore
  de Brier.
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

- Albert A, Anderson JA. On the existence of maximum likelihood estimates in logistic regression models. Biometrika. 1984;71(1):1-10.
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

## 17. Relatório do simulado completo (acréscimo de 29/10/2026)

Telas em `simulado/js/tela-relatorio.js`; contas em `simulado/js/relatorio.js`, sobre as
funções das seções 5 a 10.

**Respostas usadas.** Só as do simulado: as linhas de `corrigirSessao()` (origem
`simulado`, modo `cronometrado`, peso 1). Item em branco conta como erro, como na prova
(a regra da seção 4 que descarta respostas em branco vale só para o modo tutor do banco).
Cada item aparece uma vez no formulário, então a regra da primeira resposta não corta
nada aqui.

**Percentual esperado e limiar.** `bsFormulario` recebe as dificuldades dos itens do
próprio formulário: o percentual esperado e o acerto do examinando no limiar
(`f(0)`, média dos Angoff) referem-se a um formulário igual ao que o aluno fez.

**Resultado estimado.** A palavra "Pass" ou "Fail" (no Step 2 CK, "padrão
provavelmente atingido" ou "não atingido") só aparece quando `P(θ > 0 | respostas)`
sai da faixa de 0,10 a 0,90, os mesmos cortes da seção 7. Dentro da faixa, o relatório
diz "resultado indefinido, perto do limiar" e escreve a tendência em texto ("a tendência
é Pass", quando `P >= 0,5`). Com `P = 0,55`, escrever "Pass", mesmo com o rótulo de
estimativa preliminar ao lado, seria ler como resultado o que é quase um sorteio. O rótulo
de confiança continua separado: "Alta confiança" exige, além de `P` fora da faixa, pelo
menos N itens e cobertura de 80% dos sistemas. Um formulário completo tem 280 itens, bem
acima de N = 73 a 75, e cobre todos os sistemas; nele, o rótulo depende só de `P`. Nas
versões reduzidas do modo demonstração (40 itens), N não é atingido e o relatório fica
preliminar, com o número de itens que faltam. No Step 2 CK, nenhuma nota de três dígitos
aparece sem `preverEscore()` calibrado com pelo menos 30 notas reais (seção 9).

**Validação do relatório por simulação.** `node simulado/tests/validacao-relatorio.mjs`
(banco sintético de 700 itens por Step, semente 7; 1.000 examinandos por cenário com
`θ ~ N(0; 0,8²)`, gerador com semente 20261029). Resultado de 29/10/2026:

| Formulário | Itens | Erro comum no Angoff | Intervalo de 90% contém o `θ` verdadeiro | Brier | Relatórios com alta confiança | Pass/Fail trocado entre eles | Indefinidos |
|---|---|---|---|---|---|---|---|
| Step 1, completo | 280 | nenhum | 88,9% | 0,033 | 846 | 6 (0,7%) | 154 |
| Step 2 CK, completo | 318 | nenhum | 88,5% | 0,037 | 857 | 9 (1,1%) | 143 |
| Step 1, prontidão | 80 | nenhum | 89,9% | 0,064 | 701 | 8 (1,1%) | 299 |
| Step 1, completo | 280 | itens 0,25 logit mais difíceis | 40,8% | 0,093 | 835 | 49 (5,9%) | 165 |
| Step 1, completo | 280 | itens 0,25 logit mais fáceis | 45,2% | 0,085 | 849 | 45 (5,3%) | 151 |

Quando o Angoff está certo, a probabilidade é bem calibrada e a alta confiança erra
cerca de 1 vez em 100. Um erro comum de 0,25 logit (no item de Angoff 0,65, cerca de 6
pontos percentuais) multiplica o erro da alta confiança por 5 a 8 e derruba a cobertura
do intervalo para menos da metade, porque o erro desloca toda a escala e não diminui com
mais itens. É a limitação 1 da seção 15 medida: até a recalibração com dados reais
(seções 12 e 13), "alta confiança" quer dizer precisão da estimativa em relação ao
padrão do banco, e não certeza sobre o resultado oficial.

**Escala do limiar e perfil.** A habilidade e cada área são desenhadas numa escala de
-3 a +3 logit, com o limiar no 0 (valores fora ficam no extremo; o número exato aparece
no texto). O perfil usa `perfilPorArea()` (seção 8) nas dimensões do outline: sistema,
disciplina com todos os rótulos e competência no Step 1; sistema, disciplina clínica com
todos os rótulos e tarefa do médico no Step 2 CK (a área do painel, sem faixa oficial,
fica de fora do relatório). A barra de cada área é o intervalo de 90%; a classe vem da
regra da seção 8, com o mesmo critério interno de 5 itens. As cores (vermelho para mais
baixo, cinza para igual, azul para mais alto) foram conferidas quanto à separação para
daltonismo, e cada classe também tem ícone e texto, para que a leitura não dependa da cor.

**Por onde começar.** Até 5 áreas classificadas, primeiro as "mais baixo", depois as de
menor `P(θ_área > 0)`, mostrando só as que estão abaixo do limiar ou com `P < 0,5`.

**Instantâneo e recálculo.** Ao concluir, o simulado grava em `resultado.estimativa`
`P`, `θ`, desvio-padrão, intervalo, rótulo e base (Angoff, calibrado ou misto), usados no
histórico. O relatório recalcula tudo ao abrir: depois de uma recalibração do admin
(seção 12), os números mudam e passam a usar as dificuldades calibradas.

**Indicador complementar.** O relatório mostra também a estimativa com todas as
respostas do aluno no banco (seção 4) e a prontidão combinada da seção 10, em que a
EXIT 18 decide.

**Limitações específicas.** Um simulado só é um formulário: a variação de um dia para
outro (sono, ansiedade, sorte com os temas) não entra no intervalo, que mede só a
incerteza estatística. O recurso de parar e continuar depois, que não existe na prova,
tira do dia o cansaço contínuo de 8 ou 9 horas; o relatório informa quantas paradas
houve. Nos formulários fixos, parte dos itens pode já ter sido respondida no banco; o
relatório conta esses itens (`itensJaVistos()`: respostas de outra sessão anteriores ao
início do dia) e avisa que a repetição tende a subir o acerto, sem corrigir a estimativa,
porque o tamanho do efeito de memória não é conhecido. Validação por simulação em `simulado/tests/relatorio.test.mjs`: examinandos
simulados com `θ = 1,6` e `θ = -1,6` num formulário completo saem com "Pass" e "Fail" em
alta confiança, e no limiar (`θ = 0`) o rótulo só é alto quando `P` sai da faixa de 0,10 a
0,90.

## 18. Banco de questões no espaço do aluno (acréscimo de 29/10/2026)

Telas em `questoes/` (início, criar bloco, bloco em andamento, resultado, desempenho e
painel de probabilidade); contas em `plataforma/js/banco-aluno.js`, sobre as funções das
seções 4 a 10. Testes em `plataforma/tests/banco-aluno.test.mjs`.

**Respostas usadas.** As mesmas da seção 4, de todas as origens (banco, simulado completo
e bloco de 30 minutos): primeira resposta a cada item, cronometrado com peso 1, tutor com
peso 0,5, item em branco como erro no cronometrado e fora da conta no tutor. O bloco do
banco grava uma linha por item
(`origem: "banco"`, `sessao_id` do bloco, posição, tempo e marca), inclusive os itens
deixados em branco, para que a revisão mostre o bloco inteiro.

**Blocos.** De 1 a 20 itens, como o bloco oficial, ou até 40 no modo livre (critério
interno). Cronometrado: 90 s por item, a média do bloco oficial de 30 minutos com até 20
itens (usmle.org, páginas do Step 1 e do Step 2 CK, consulta em 28/10/2026). Tutor: sem
limite de prova; a resposta trava ao ser confirmada e a explicação aparece em seguida. O
sorteio usa `sortearQuestoes()` estratificado por sistema, com os itens não vistos
primeiro. Filtros: "não vistas" (sem nenhuma resposta), "erradas" (a tentativa mais
recente foi errada ou ficou em branco), "marcadas" (marcada na tentativa mais recente) e
"todas".

**Painel de probabilidade.** `resumoAprovacao()` chama `estimarAluno()` e mostra
`P(θ > 0)`, o intervalo de 90% de `θ`, o percentual esperado num formulário com todos
os itens do Step no banco (com intervalo) e o acerto do examinando no limiar no mesmo
formulário, o rótulo da seção 7 com cada condição e quantos itens e quais sistemas
faltam. Quando os itens que faltam passam dos itens ainda não vistos pelo aluno, a tela
avisa. No Step 2 CK, a frase é "probabilidade de atingir o padrão de aprovação (218) pelo
limiar do banco", com o aviso da seção 9; a nota de três dígitos só aparece quando houver
modelo de escore suficiente (seção 13). Com modelo de desfechos suficiente, a
probabilidade pelos resultados oficiais aparece ao lado. A prontidão combinada da seção
10 fica no mesmo painel: a EXIT 18 decide.

### 18.1 Contribuição de cada área

Pergunta respondida: quanto a probabilidade subiria se, só naquela área, o aluno tivesse
acertado o que o examinando no limiar acerta nos mesmos itens. Para os itens `i` da área
`A`, a resposta observada `x_i` é trocada pela resposta esperada no limiar,
`a_i = expit(-b_i)` (o Angoff, ou o `b` calibrado), como pseudo-resposta fracionária:

```
log π_A(θ) = log priori(θ) + Σ_{i ∉ A} w_i ℓ(x_i; θ - b_i) + Σ_{i ∈ A} w_i [a_i ln expit(θ - b_i) + (1 - a_i) ln expit(b_i - θ)]
ganho_A   = P_A(θ > 0) - P(θ > 0 | respostas)
deficit_A = Σ_{i ∈ A} (a_i - x_i)          (acertos que faltaram para o limiar)
```

Na implementação, cada pseudo-resposta vira duas respostas pesadas (acerto com peso
`w_i a_i` e erro com peso `w_i (1 - a_i)`), o que dá a mesma verossimilhança. Como o
log-posterior é uma soma por item, a base é calculada uma vez na grade e cada área soma
só a diferença entre as pseudo-respostas e as respostas observadas dos seus itens. O
custo cai de (áreas × itens) para (itens × rótulos por item), e o resultado é o da conta
direta com `eap()` (diferença menor que 1e-10 no teste "contribuição por área (base
calculada uma vez)"). A diferença de custo aparece depois da recalibração, quando os `b`
deixam de se repetir. `ganho > 0`:
a área derruba a probabilidade; `ganho < 0`: a área a sustenta; uma área com acerto igual
ao esperado no limiar tem ganho zero (conferido no teste). As contribuições não se somam:
`P` não é linear em `θ` e, nas disciplinas, um item conta em cada rótulo.

A tela mostra os sistemas com ganho de pelo menos 0,5 ponto percentual (critério
interno, abaixo disso a diferença não muda a leitura), do maior para o menor, com o
acerto do aluno, o acerto esperado no limiar e o peso do sistema na prova (ponto médio
da faixa oficial do outline). O peso informa, mas não reordena a lista: a ordem segue o
efeito na probabilidade estimada.

Validação por simulação (teste "calibração da recomendação", semente 20261029): 300
alunos com `θ` sorteado de N(0; 0,5²), um sistema do Step 1 sorteado como fraco
(`θ - 1,5` nesse sistema), cada um respondendo cerca de metade de 400 itens sintéticos
(200 em média). O sistema fraco foi o primeiro da lista em 247 dos 300 casos (82,3%) e
um dos dois primeiros em 275 (91,7%). O teste falha abaixo de 80% no primeiro lugar. Os
erros se concentram nos sistemas com faixa pequena no outline (desenvolvimento humano,
de 1% a 3%), em que o aluno responde poucos itens.

### 18.2 Recomendações de estudo

Na ordem: (1) até 5 sistemas que mais derrubam a probabilidade; (2) a disciplina e a
competência (no Step 2 CK, também a disciplina clínica) de maior ganho; (3) os sistemas
do outline sem item respondido, que impedem a alta confiança; (4) quantos itens faltam
para a contagem mínima N, lembrando que o tutor vale 0,5. Cada sistema leva à seção
correspondente de `conteudo-step1.html`, aos flashcards em modo treino filtrados pelo
sistema (`anki/#/estudar?sistema=...&modo=treino`) e a um bloco já filtrado com os itens
errados (ou não vistos) daquele sistema. No Step 2 CK, os links de conteúdo e de
flashcards levam à ciência básica do sistema correspondente do Step 1
(`BASE_S1_DO_CK`); os itens do bloco são do Step 2 CK.

### 18.3 Curva de evolução

Um ponto por sessão (bloco do banco, simulado completo ou bloco de 30 minutos), na data
em que ela terminou, com `P(θ > 0)` calculada com todas as respostas até aquela data
(`prepararRespostas(..., { ate })`). Junto vão o acerto da própria sessão e o acerto
esperado do examinando no limiar nos mesmos itens. A curva mostra as linhas de 10% e 90%,
onde a estimativa passa a decidir, e tem a tabela com todos os valores.

### 18.4 Limitações específicas

1. A contribuição é um contrafactual do modelo, não um efeito causal: ela diz quanto a
   estimativa mudaria, não quanto a nota real mudaria.
2. Com poucos itens numa área, o ganho é instável; a tela mostra o número de itens ao lado,
   e o perfil por área (seção 8) marca "poucos itens" abaixo de 5.
3. Itens do banco feitos em casa, no modo tutor ou repetidos depois de ver a explicação
   diferem da prova; a primeira resposta e o peso do tutor reduzem, mas não eliminam, a
   diferença (seção 15).


## 19. Banco de questões na área administrativa (acréscimo de 29/10/2026)

Funções em `admin/js/analise.js`; telas descritas em `admin/README.md`.

### 19.1 Probabilidade de aprovação de cada participante

Para cada participante e cada Step com respostas, `estimarAluno` (seções 4 a 9) com os
itens ativos do banco, os sistemas do outline e o modelo de desfechos gravado, se houver.
O painel mostra a probabilidade, o rótulo de confiança, o θ com intervalo de 90%, o
percentual esperado num formulário completo e o perfil por sistema; a distribuição da
turma separa alta confiança (ponto cheio) de estimativa preliminar (anel).

**Critério de risco `banco_probabilidade_baixa`** (critério interno da Road to America,
nível alto): `P(θ > 0 | respostas) <= 0,10` **com alta confiança** (seção 7: pelo menos N
itens efetivos e itens em 80% dos sistemas) num Step ainda não aprovado. O limite de
0,10 é o mesmo da regra de confiança: abaixo dele a estimativa já é decisiva no sentido
desfavorável. Estimativa preliminar nunca acende o critério. A prontidão continua decidida
pela EXIT 18 (seção 10); quando a EXIT 18 está atendida e o banco indica o contrário com
alta confiança, a ficha mostra a divergência e pede conversa.

### 19.2 Distratores por quartil de habilidade

Cada pessoa da matriz pseudonimizada recebe o θ EAP de todos os itens que respondeu no
Step (grade de 0,05 logit, b calibrado quando houver). As pessoas são ordenadas pelo θ e
divididas em quatro grupos de mesmo tamanho (empates desfeitos pelo identificador
pseudonimizado); com menos de 8 pessoas não há quartis. Para cada alternativa, a tela
mostra a proporção que a escolheu no total e em cada quartil, além da ponto-bisserial da
escolha (seção 11). Num item que funciona, a curva da correta sobe de Q1 para Q4 e as dos
distratores descem; um distrator que supera a correta em Q4 é destacado, e corresponde ao
alerta `distrator_atrai_melhores` (grupo superior de 27%). O quartil usa o θ, e não a
proporção de acertos, porque cada aluno responde itens diferentes do banco: o θ desconta a
dificuldade dos itens que cada um viu.

### 19.3 Correção de gabarito e versões

Corrigir o gabarito sobe a versão do item e apaga a calibração dele. Com recorreção, as
respostas gravadas na versão em vigor passam a valer pela alternativa nova e vão para a
versão nova: entram de novo nos índices do item e mudam a estimativa dos alunos que o
fizeram. As respostas de uma versão de conteúdo anterior não são recorrigidas, porque
responderam a outro texto. Sem recorreção, as respostas ficam na versão antiga e saem dos
índices (seção 11) e da estimativa dos alunos (seção 4, regra 5). O resultado já gravado de um simulado
completo concluído não é refeito. Item retirado do banco (suspenso ou aposentado) sai da
estimativa dos alunos, como um item eliminado da pontuação.

### 19.4 Dados fictícios do modo demonstração

`plataforma/js/respostas-demo.js` gera respostas por um modelo de Rasch com habilidades
conhecidas. Todos os números abaixo são parâmetros escolhidos para a demonstração, sem valor
empírico:

| Parâmetro | Valor |
|---|---|
| θ dos participantes fictícios | `logit(acerto médio nos simulados) - logit(0,65)` |
| θ das turmas anteriores | N(0,3; 1), número de examinandos para cerca de 45 respostas por item (de 60 a 400 por Step), até 160 itens cada, 15% no modo tutor |
| b verdadeiro | b de Angoff + N(0; 0,45²), sorteado pelo identificador do item |
| Distratores | pesos 0,36, 0,26, 0,21 e 0,17 em ordem sorteada por item |
| Defeitos plantados por Step | 2,5% gabarito trocado, 3% pouco discriminativo (acerto de 0,55 em qualquer θ), 2% muito difícil (b passa a ser o maior entre b e 0,5, mais 1,8) e 2% muito fácil (o menor entre b e -0,5, menos 4), no mínimo 1 de cada |
| Desfechos | 60% das turmas anteriores; Pass quando θ + N(0; 0,3²) > 0; só Pass/Fail, sem nota |

O teste "demonstração" de `admin/tests/analise.test.mjs` confere que cada defeito acende o
alerta esperado, que a recalibração fica mais perto do b verdadeiro do que o Angoff e que
há pelo menos 10 aprovados e 10 reprovados por Step. Os defeitos são da simulação: a ficha
do item avisa e diz que o item público não tem erro conhecido.

### 19.5 Cobertura do blueprint

Para cada linha do outline: itens ativos, proporção do banco, faixa oficial (de
`TAXONOMIA`), situação (dentro, abaixo, acima, sem faixa), itens que um formulário completo
pede (`ceil(lo * 280)` a `floor(hi * 280)` no Step 1; 318 no Step 2 CK) e formulários
completos sem repetição que a linha sustenta (`floor(n / ceil(lo * tamanho))`). O total de
formulários sem repetição é o menor entre `floor(itens / tamanho)` e os das linhas de
faixa exigida (sistema e competência). Nas disciplinas, o item conta em cada rótulo, como
no outline, e a faixa é alvo, não trava.
