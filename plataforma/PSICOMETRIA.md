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
item, de o desempenho do aluno estar acima do limiar do banco, contando a incerteza da
medida e a do próprio limiar. **O que ela não é.** Uma probabilidade de aprovação no
USMLE nem um resultado do NBME. Hoje o limiar é **provisório**: vem da dificuldade-alvo
que os autores deram a cada item na especificação (seção 2), e não de um painel de
juízes nem de dados. As telas dizem "posição em relação ao limiar do banco" e
"probabilidade de estar acima do limiar do banco (padrão provisório)", o rótulo é
"precisão alta em relação ao padrão do banco", e o relatório do simulado escreve "Acima
do limiar do banco" ou "Abaixo do limiar do banco", nunca Pass ou Fail. Pass e Fail, e
"alta confiança de aprovação", ficam reservados para dois caminhos com base empírica:
a ligação com as autoavaliações NBME da turma (seção 6.2) e o modelo dos resultados
oficiais (seção 13). Enquanto nenhum dos dois tiver dados suficientes, o produto não
deve ser descrito, nas telas ou em material comercial, como capaz de prever aprovação.

## 1. Notação

| Símbolo | Significado |
|---|---|
| `a_i` | dificuldade-alvo do item i (campo `angoff`), ou o Angoff do painel quando publicado: probabilidade de o examinando no limiar acertá-lo |
| `c` | posição do limiar verdadeiro na escala do banco, incerta: `c ~ N(0, σ_c²)` (seção 6.1) |
| `b_i` | dificuldade do item i na escala de Rasch (logits) |
| `θ` | habilidade do aluno na mesma escala; `θ = 0` é o examinando no limiar |
| `x_i` | 1 se acertou o item i, 0 se errou |
| `w_i` | peso da resposta (seção 4) |
| `expit(z)` | `1 / (1 + e^(-z))`; `logit(p) = ln(p / (1 - p))` |

## 2. Definição do padrão: dificuldade-alvo provisória e painel de Angoff

No método de Angoff (Angoff, 1971), juízes estimam, para cada item, a probabilidade de
um examinando minimamente competente acertá-lo; o escore de corte do teste é a soma
dessas probabilidades. **O campo `angoff` dos itens do banco não é isso.** A banca de
29/10/2026 mediu que ele acompanha o alvo fixado no blueprint antes da redação
(correlação de 0,977 no Step 1 e 0,971 no Step 2 CK; 99 e 48 itens com o valor idêntico
ao alvo; desvio-padrão de 0,02 a 0,05 dentro de cada rótulo de dificuldade). Na
prática, o corte de 67% (Step 1) e 65,6% (Step 2 CK) é consequência da meta de mistura
20/55/25 de fáceis, médios e difíceis, e não de um padrão de examinando minimamente
competente. Por isso o valor se chama **dificuldade-alvo** no código, nos documentos e
nas telas, e o padrão do banco é **provisório**. O nome do campo continua `angoff` por
compatibilidade (`plataforma/CONTRATO-ITEM.md`). Quando ele falta, o carregador usa 0,80
para item fácil, 0,65 para médio e 0,45 para difícil.

O padrão definitivo sai do painel de juízes (`plataforma/js/angoff.js`, tela do admin
"Painel Angoff"), com estas condições, todas obrigatórias antes de o valor do painel
substituir a dificuldade-alvo:

- pelo menos **10 juízes** médicos que conheçam o examinando no limiar do USMLE em cada
  item da rodada final (`MIN_JUIZES = 10`; a literatura recomenda de 10 a 15; Hambleton
  e Pitoniak, 2006), com treino antes da primeira rodada (definição do examinando
  minimamente competente e itens de prática);
- pelo menos uma rodada de discussão, com a distribuição das estimativas e os dados de
  impacto (acerto real da turma, curva de reprovação) entre as rodadas;
- **erro-padrão do corte abaixo de 0,02** em proporção (`CORTE_EP_MAX`), calculado como
  o desvio-padrão dos cortes dos juízes que avaliaram todos os itens dividido pela raiz
  do número deles; acima disso a publicação é recusada (no JavaScript e na função
  `r2a_admin_publicar_angoff` do banco de dados);
- verificação de Hofstee com escores comparáveis (seção 19.6), exigida na publicação:
  sem nenhuma resposta de Hofstee, ou com o corte do Angoff fora da janela média de
  corte dos juízes, a publicação é recusada (no JavaScript, `regraHofsteePublicacao` e
  `valoresParaPublicar`, e em `r2a_admin_publicar_angoff`), a menos que o admin
  registre uma justificativa de pelo menos 30 caracteres, que fica gravada no painel
  (`publicacao_justificativa`, com o resultado da verificação em `publicacao_hofstee`).
  A tela do admin pede a justificativa também quando só a janela de reprovação falha,
  porque essa conta depende da curva de escores pelo `θ`, que o servidor não refaz.
  Testes "publicação exige Hofstee" e A7e1 a A7e5 de `02-testa-rls.sql`.

O item publicado guarda o Angoff do painel, o número de juízes e o erro-padrão da média
deles no item (`angoff_painel_ep`), usado na incerteza do corte (seção 6.1).

Escore de corte de um formulário com itens `1..n`:

```
corte = a_1 + a_2 + ... + a_n          (em itens)
corte_% = (a_1 + ... + a_n) / n        (em percentual)
```

No blueprint do Step 1 preparado para os 520 itens novos, a média das dificuldades-alvo
é 0,655 (`banco-privado/blueprint-step1.json`, campo `distribuicao.angoff`), o que dá um
corte provisório perto de 65,5% num formulário com a mesma composição. Esse número é
uma propriedade do projeto do banco, não um padrão de aprovação.

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
5. **Efeito do modo tutor.** Quando o modelo do Step traz `efeito_modo` (seção 13.1),
   o item respondido no modo tutor entra com `b - δ`, em que `δ` é o deslocamento médio
   do acerto no tutor em relação ao cronometrado, estimado com os dados da turma. O peso
   0,5 continua valendo, como cautela adicional, até haver validação externa.
6. **Resposta a uma versão anterior do item** (o conteúdo mudou, ou o gabarito foi
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

### 5.1 Repesagem pela composição do outline

No banco, o aluno escolhe sistemas e filtros ("não vistas", "erradas"); quem responde
sobretudo os sistemas fortes teria um `θ` que não representa a prova. Antes da EAP,
`ponderarPeloOutline()` multiplica o peso de cada resposta do sistema `s` por

```
f_s = (π_s / Σ_{s respondidos} π) / (fração das respostas em s),   limitado a [1/3, 3]
```

com `π_s` o ponto médio da faixa oficial do sistema (`pesosDoOutline()` em `banco.js`), e
reescala os pesos para que a soma (`n_efetivo`) não mude. A distância entre a mistura
respondida e o outline (variação total) vai para a saída e, acima de 15%, para os
avisos da tela. O perfil por área (seção 8) usa os pesos originais, porque a repesagem
daria a uma área uma precisão que os dados dela não têm. O simulado completo não é
repesado: o formulário já segue as faixas do outline. Teste "ponderarPeloOutline".

## 6. Probabilidade de estar acima do limiar e percentual esperado

```
P(acima do limiar) = P(θ > c | respostas) = ∫ π(θ | x) Φ(θ / σ_c) dθ,     c ~ N(0, σ_c²)
P_medida           = P(θ > 0 | respostas)        (só a incerteza da medida; σ_c = 0)
```

### 6.1 Incerteza do padrão

A maior fonte de erro, enquanto o padrão for provisório, é o próprio padrão: um erro
comum a todos os itens (todos mais fáceis do que a dificuldade-alvo supõe, por exemplo
porque não têm imagem e trazem pistas demais) desloca o limiar e não diminui com mais
respostas. A probabilidade passou a integrar essa incerteza (`pAcimaDoCorte()`):

| Origem do padrão do item | `σ_c` (logit) |
|---|---|
| dificuldade-alvo provisória | 0,7 (`INCERTEZA_CORTE.provisorio`; cerca de 15 pontos percentuais no item de 0,65). Sem base empírica: escolhido pela simulação abaixo |
| ligação com as autoavaliações NBME (seção 6.2) | erro-padrão do corte ligado, pelo método delta, com piso de 0,1 |
| Angoff do painel com erro-padrão gravado | `ep / (a (1 - a))`, com piso de 0,1 (a variação entre painéis e métodos não cabe no erro-padrão de um painel só) |
| Angoff do painel sem erro-padrão | 0,25 |

`σ_c` do aluno é a média, pesada pelos pesos das respostas, do `σ_c` de cada item usado
(`incertezaCorte()`). Na saída, `corte.origem` diz se o padrão é `provisorio`, `misto`
ou `painel`. O intervalo de 90% da **distância ao limiar**, `θ - c`, soma as duas
incertezas (`intervaloRelativo()`, quantis por bisseção) e aparece nas telas ao lado do
intervalo de `θ`.

**Por que 0,7 e não 0,4.** Na rodada 1 o valor era 0,4, escolhido para neutralizar
exatamente o viés de 0,5 logit que a banca tinha testado. A banca da rodada 2 refez a
simulação com erro de item e vieses maiores, e mostrou que 0,4 voltava a errar 11,7%
com 0,75 logit e 27% com 1,0 logit. Um viés de 0,75 logit (cerca de 15 pontos
percentuais no item de 0,65) é plausível para itens sem imagem e com pistas clássicas.
Não há dado da turma que fixe esse número; até haver (seção 6.2 ou recalibração com a
turma), o valor vem da simulação abaixo, com o limite do método documentado.

Simulação (800 examinandos por cenário; o teste "incerteza do padrão" repete os
cenários com 500, semente 20261029): formulário de 280 itens com a mistura
20/55/25 e dificuldades-alvo de 0,85, 0,69 e 0,50, erro de cada item com DP de 0,6 logit
em torno da dificuldade-alvo, o banco inteiro deslocado (viés) e `θ ~ N(média; 0,8²)`.
Erro: classificação decidida (P >= 0,90 ou <= 0,10) do lado errado do limiar verdadeiro;
decididos: fração com classificação decidida.

| Viés do banco (logit) | σ_c = 0,4: erro | σ_c = 0,6: erro | **σ_c = 0,7: erro (decididos)** | σ_c = 0,8: erro |
|---|---|---|---|---|
| 0 | 0,0% | 0,0% | **0,0% (23%)** | 0,0% |
| -0,5 (itens mais fáceis) | 2,2% | 0,0% | **0,0% (35%)** | 0,0% |
| -0,75 | 11,7% | 2,0% | **0,3% (42%)** | 0,0% |
| -1,0 | 26,4% | 12,5% | **5,5% (52%)** | 1,9% |
| +0,75 (itens mais difíceis) | 11,7% | 0,5% | **0,3% (39%)** | 0,0% |
| -0,75 com θ médio +0,9 | 5,7% | 0,7% | **0,2% (80%)** | 0,0% |

Leitura: com 0,7 a precisão alta erra menos de 4% até 0,75 logit de viés em qualquer
sentido; com 1,0 logit erra cerca de 5%, que é o **limite documentado do método**. O
preço é decidir para menos examinandos quando a população está perto do limiar (23% a
52% com θ médio 0); numa turma realista (θ médio +0,9), 80% ainda são decididos. Quem
está a menos de cerca de 0,9 logit do limiar fica como estimativa preliminar enquanto o
padrão for provisório. O teste falha se o erro passar de 4% em algum viés de até 0,75
logit, se o erro com 1,0 logit sair da faixa de 2% a 9% (o limite deixa de estar
documentado), ou se o valor antigo de 0,4 deixar de errar mais de 8% com 0,75 logit.

**Análise de sensibilidade para o aluno.** Enquanto o padrão for provisório,
`estimarAluno()` devolve `sensibilidade`: a probabilidade se o banco inteiro for 0,75
logit (cerca de 15 pontos percentuais) mais fácil do que a dificuldade-alvo supõe, o que
põe o limiar verdadeiro em `+0,75` na escala do banco, e se for 0,75 logit mais difícil
(`-0,75`), só com a incerteza da medida em cada cenário, e `muda_leitura` (a faixa
acima de 90%, entre 10% e 90% ou abaixo de 10% muda em algum cenário). O relatório do
simulado e o painel do banco mostram as duas probabilidades em uma frase. Teste
"sensibilidade ao padrão provisório".

### 6.2 Ligação com as autoavaliações NBME

As autoavaliações oficiais (CBSSA no Step 1, CCSSA no Step 2 CK) que os alunos lançam em
"Meu progresso" são o caminho mais rápido para um padrão com base empírica, muito antes
de haver 30 reprovações oficiais. `calibrarDesfechos()` junta cada escore NBME em
standard-paced ao `θ` EAP do aluno com as respostas dadas até a data da autoavaliação e
ajusta `escore = a + b θ + erro` (`ajustarEscore()`, com `var_a`, `var_b` e `cov_ab`).
O mesmo aluno costuma lançar várias autoavaliações, e os escores dele são
correlacionados; por isso o ajuste conta alunos, não escores (ver "Escores repetidos do
mesmo aluno", abaixo). `corteLigadoNbme()` acha o `θ` em que o escore previsto
atinge o padrão de aprovação (`LIGACAO_NBME.limiar`: 196 no Step 1, o padrão de três
dígitos desde 26/01/2022; 218 no Step 2 CK, desde 01/07/2025; conferir em usmle.org a
cada ciclo):

```
μ_c = (limiar - a) / b
ep(μ_c)² = var_a / b² + (limiar - a)² var_b / b⁴ + 2 (limiar - a) cov_ab / b³     (método delta)
σ_c = max(ep(μ_c), 0,1)
```

**Por que a regressão sobre o EAP não precisa de correção de atenuação.** Como o EAP é
a média posterior, `Cov(θ, EAP) = Var(EAP)` quando a priori representa a população; o
coeficiente angular de `escore` sobre o EAP é então `b Cov(θ, EAP) / Var(EAP) = b`, o da
relação com o `θ` verdadeiro. Com a priori N(0; 1,5²) mais larga que a turma, sobra uma
atenuação pequena: na simulação do teste "ligação com a NBME" (40 réplicas de 80 alunos
com θ ~ N(0,3; 1), 100 itens, escore = 200 + 15 θ + N(0; 8²)), o coeficiente saiu perto
de 13,7 em vez de 15, a média do corte ligado ficou em -0,30 para o verdadeiro -0,27, e
o intervalo de 90% do corte cobriu o valor verdadeiro em 88% das réplicas.

**Escores repetidos do mesmo aluno (rodada 4).** Até a rodada 3, cada escore entrava
como uma observação independente, e o mínimo era de 30 escores: 10 alunos com 3
autoavaliações cada já liberavam a ligação, com um erro-padrão pequeno demais. Agora:

- cada aluno pesa 1 no ajuste (mínimos quadrados ponderados, peso `1/n_i` em cada um dos
  `n_i` escores do aluno `i`); sem repetição, é o ajuste de um escore por aluno;
- `var_a`, `var_b` e `cov_ab` vêm do estimador robusto agrupado por aluno (sanduíche
  `(X'WX)⁻¹ [Σ_i X_i'W_i e_i e_i'W_i X_i] (X'WX)⁻¹`, com a correção
  `G/(G-1) × (N-1)/(N-2)` para G alunos e N escores), que vale para qualquer correlação
  entre os escores do mesmo aluno; o método delta usa essa covariância;
- `sigma` é o desvio de um escore novo de um aluno novo (média, por aluno, do quadrado do
  resíduo, com G - 2 graus de liberdade), e `tau` e `icc` dizem quanto dele é do aluno
  (estimativa por momentos, só quando há repetição);
- o mínimo é de **30 alunos distintos** (`LIGACAO_NBME.min_alunos` e
  `DESFECHOS_PADRAO.min_alunos`); o número de escores não conta. Um modelo gravado antes
  desta mudança, sem `n_alunos`, não libera a ligação (`corteLigadoNbme` pede para
  recalcular).

Por que não um modelo de efeito aleatório (GLS com intercepto do aluno)? O GLS usa também
a variação do EAP de um aluno entre uma data e outra, que é em boa parte erro de medida;
com correlação alta entre os escores do mesmo aluno, ele dá peso a essa variação e puxa
`b` para baixo. Na simulação do teste, o corte ligado pelo GLS saiu em -1,74 logit para o
verdadeiro -0,27, enquanto a regressão marginal (a reta do escore sobre o EAP de cada data)
continua sem viés, porque `E[θ | EAP] = EAP` em cada data. Por isso ficou a regressão
marginal com peso por aluno e erro-padrão agrupado.

Teste "ligação com a NBME: escores repetidos do mesmo aluno agrupados"
(`tests/psicometria.test.mjs`): 80 réplicas de 45 alunos, cada um com 1 a 6
autoavaliações, `escore = 200 + 15 θ + u + e` com efeito do aluno `u ~ N(0; 8²)` e
`e ~ N(0; 4²)` (correlação intraclasse verdadeira de 0,72). O intervalo de 90% do corte
cobriu o valor verdadeiro em 74 de 80 réplicas (92%) com o agrupamento e em 56 de 80 (70%)
contando cada escore como independente; o erro-padrão agrupado foi, em média, 1,66 vez o
ingênuo; a correlação intraclasse estimada ficou em 0,66. O mesmo teste confere que 12
alunos com 5 escores cada (60 escores) não bastam.

**Ligação linear, não equipercentil.** Com 30 a 100 escores, a ligação equipercentil
fica instável nas caudas, e o que interessa é um ponto só, o corte. A regressão também
usa o `θ` de cada aluno na data, e não distribuições marginais de grupos diferentes.

**Quando entra.** A ligação é `suficiente` com pelo menos 30 alunos distintos com escore, `b / ep(b) >= 4` e
`ep(μ_c) <= 0,35` logit. Gravada por `salvarModelo()` em `ligacao_nbme`, ela substitui o
limiar provisório em `estimarAluno({ ligacaoNbme })`: `c ~ N(μ_c, σ_c²)`, o perfil por
área, a contribuição de cada área, o percentual esperado do limiar e a escala do
relatório passam a ser relativos a `μ_c`, e a análise de sensibilidade deixa de
aparecer (o padrão deixou de ser provisório). O padrão do painel, quando publicado em
todos os itens usados, tem precedência. A tela do admin (Calibração) mostra `μ_c`, o
erro-padrão e o motivo quando ainda não é suficiente; a diferença entre `μ_c` e 0 mede o
viés do padrão provisório. Com a ligação, o relatório volta a escrever Pass ou Fail,
"pelo limiar ligado à NBME".

**Limites.** As autoavaliações não são a prova: o escore da CBSSA tem erro próprio e o
NBME não publica a ligação entre a CBSSA e o resultado do Step 1. Só entram alunos que
lançam o escore (viés de seleção, como na seção 13). A ligação vale para a turma em que
foi ajustada; o padrão de aprovação do USMLE pode mudar.

O **percentual esperado num formulário completo** usa as dificuldades `b_1..b_m` de um
formulário de referência (por padrão, todos os itens do Step no banco; a tela pode
passar um formulário fixo de `formularios.js`):

```
f(θ) = (1/m) Σ_j expit(θ - b_j)
percentual esperado = ∫ f(θ) π(θ | x) dθ
intervalo de 90% = [ f(θ_0,05), f(θ_0,95) ]      (f é crescente em θ)
percentual do limiar = f(0) = média das dificuldades-alvo (ou dos Angoff do painel)
```

## 7. Regra de precisão

A tela mostra **"Precisão alta em relação ao padrão do banco"** (com "(padrão
provisório)" enquanto o padrão não for do painel) só quando as três condições valem ao
mesmo tempo; caso contrário, **"Estimativa preliminar"** e quantos itens faltam. O
rótulo antigo "Alta confiança" prometia uma confiança que o método não tinha, porque
considerava só a incerteza de `θ`; ele foi trocado em 29/10/2026. O rótulo
`alta_confianca` só existe na probabilidade pelos desfechos reais (seção 13).

1. **Decisão:** `P >= 0,90` ou `P <= 0,10`, com `P` já com a incerteza do padrão.
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
3. **Cobertura:** itens suficientes em pelo menos 80% dos sistemas do outline (9 de 11
   no Step 1; 12 de 14 no Step 2 CK). Um sistema conta como coberto com pelo menos 5
   itens (`min_por_sistema`) e pelo menos metade do número que um formulário com o mesmo
   total de itens teria pelo peso do sistema: `mínimo_s = max(5, ceil(0,5 π_s n))`.
   Correção de 29/10/2026: até essa data um único item bastava, e um bloco de 20 itens
   marcava "atendido" com 12 de 14 sistemas.

Quantos itens faltam: o maior entre `N - n_efetivo` e o número de itens com que `|θ̂|`
passaria de 1,28 vezes `sqrt(dp² + σ_c²)` (quantil 0,90 da normal), estimado com a
informação média dos itens ainda não vistos:

```
faltam_decisão = ceil( (1/dp_alvo² - 1/dp²) / Ī(θ̂) ),   dp_alvo² = (θ̂ / 1,2816)² - σ_c²
```

Com `|θ̂| < 0,05`, ou com `|θ̂| < 1,28 σ_c` (o padrão incerto, sozinho, já impede a
decisão), a tela não promete número: mais itens não mudam a classificação enquanto o
padrão for o mesmo (`perto_do_limiar: true`; no segundo caso, `padrao_limita: true`, e a
tela diz que só o painel de juízes ou subir a habilidade mudam a leitura).

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

Cada área traz também a taxa bruta de acertos e `esperado_limiar` (média das
dificuldades-alvo dos itens que o aluno respondeu), para a tela mostrar "você acertou 58%; o examinando no
limiar acertaria 64% destes itens".

## 9. Step 2 CK

O Step 2 CK informa nota de três dígitos, com mínimo de 218 desde 01/07/2025 (USMLE,
Examination Results and Scoring). A plataforma **não converte θ em nota**: não há
dados que liguem a escala do banco à escala do USMLE. O que ela mostra é
`P(θ > c)`, a probabilidade de estar acima do limiar do banco, fixado para representar
o mínimo de 218 (hoje pela dificuldade-alvo, provisória), com o aviso de que a nota de
três dígitos só será estimada depois da calibração com escores reais. Quando houver pelo menos 30 notas reais (seção 11), `preverEscore()` passa a dar
a nota esperada, o intervalo preditivo de 90% e `P(nota >= 218)`.

## 10. Prontidão combinada

O critério principal continua sendo a EXIT 18 (`materiais/overdeliveries-step1.html`;
regra em `plataforma/js/desempenho.js`, função `prontidao`): as duas autoavaliações
NBME mais recentes do Step, em standard-paced, com probabilidade de aprovação de pelo
menos 90%. `prontidaoCombinada()` acrescenta o banco como indicador complementar:

| EXIT 18 | Banco | Resultado |
|---|---|---|
| pronto | qualquer, salvo precisão alta com P <= 0,10 | pronto |
| pronto | precisão alta com P <= 0,10 | pronto, com `divergente: true` e pedido de conversa com o mentor |
| não pronto | precisão alta com P >= 0,90 | não pronto, com `divergente: true` (a decisão segue a NBME) |
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
  angular, com a matriz de covariância dos coeficientes (inversa da informação). O
  modelo vai para a tela do aluno (`suficiente`) só com **pelo menos 30 aprovados e 30
  reprovados**, taxa de resposta de pelo menos 50%, ajuste convergido e sem separação
  completa (todos os aprovados com θ acima de todos os reprovados, ou o contrário: a
  verossimilhança não tem máximo finito, Albert e Anderson, 1984). Com 10 de cada, ele
  fica `exploratorio`, só na área administrativa. A regra de 10 eventos por variável
  (Peduzzi et al., 1996) garante coeficientes estáveis, mas com 20 eventos o intervalo
  da curva perto do limiar é largo demais para orientar um aluno; 30 reprovações é
  critério interno. Saem também a área sob a curva ROC e o escore de Brier.
- **viés de seleção dos desfechos:** só entram os alunos que informam o resultado.
  `calibrarDesfechos()` conta como não respondente o participante com pelo menos 20
  respostas no Step, sem resultado informado e sem resposta nos últimos 45 dias
  (terminou o preparo). A taxa de resposta vai para o modelo e para a tela; com pelo
  menos 5 não respondentes, o ajuste é ponderado pelo inverso da probabilidade de
  informar, estimada por uma regressão logística de "informou" sobre `θ` (peso limitado
  a 10). Isso corrige o viés quando quem informa difere de quem não informa só pelo
  `θ`; não corrige diferenças que o banco não vê. A taxa é um limite inferior, porque
  parte dos não respondentes pode ainda não ter feito a prova.
- **nota oficial do Step 2 CK** e **escore NBME em standard-paced**: regressão linear
  `nota = a + b θ + erro`, suficiente com pelo menos 30 notas (critério interno). Da
  regressão do escore NBME sai a ligação da seção 6.2.

**Abordagem: regressão calibrada sobre o EAP, sem integrar de novo a incerteza de `θ`.**
O modelo é ajustado com o EAP de cada aluno na data da prova, um valor já encolhido e
com erro de medida. A curva ajustada é `P(Pass | EAP)`, que é o que se quer prever para
um aluno novo a partir do EAP dele. Até a rodada 2 da banca, a predição ainda integrava
`v_θ = β̂1² dp²`, contando o erro de medida duas vezes e puxando P para 0,5; isso foi
retirado (`intervaloDesfechos()` e `preverEscore()` aceitam `dp` e o ignoram). Entra só
a incerteza dos coeficientes:

```
η = β0 + β1 θ̂,   m = β̂0 + β̂1 θ̂
v_β = Var(β0) + 2 θ̂ Cov(β0, β1) + θ̂² Var(β1)
P(Pass | respostas) = E[expit(η)], η ~ N(m, v_β)            (quadratura de 81 pontos)
intervalo de 90% de P: [expit(m - 1,645 sqrt(v_β)), expit(m + 1,645 sqrt(v_β))]
P(nota >= 218) = 1 - Φ( (218 - (a + b θ̂)) / sqrt(σ² + var_a + 2 θ̂ cov_ab + θ̂² var_b) )
```

O resíduo `σ` da regressão sobre o EAP já contém o erro de medida de `θ`, por isso `dp`
também não entra na nota. A abordagem supõe que o aluno novo tenha um EAP com precisão
parecida com a dos alunos do ajuste (número de itens da mesma ordem); um aluno com muito
menos itens recebe uma probabilidade um pouco extrema demais. A alternativa, um modelo
com erro nas variáveis integrando sobre `θ` no ajuste, não foi implementada.

Validação (teste "desfechos sobre o EAP: calibração e cobertura do intervalo de P", 25
réplicas de 250 alunos com θ ~ N(0,3; 1) em 40 itens, P(Pass | θ) = Φ(θ / 0,5), e 50
alunos novos por réplica, com a probabilidade verdadeira `P(Pass | respostas)` calculada
pela posterior com a priori da população): o intervalo de 90% de P cobriu a
probabilidade verdadeira em 90,2% dos 755 alunos com P verdadeira entre 10% e 90%; o
erro médio absoluto foi de 0,023, contra 0,026 integrando `dp` de novo. Nas pontas
(P abaixo de 10% ou acima de 90%) a cobertura cai, porque a forma logística não
acompanha exatamente a curva verdadeira, mas a diferença absoluta fica abaixo de um
ponto percentual. O teste falha se a cobertura entre 10% e 90% sair de 85% a 96% ou se
integrar `dp` deixar de ser pior.

A tela mostra a probabilidade com o intervalo, o número de reprovações e a taxa de
resposta. O rótulo "Alta confiança de aprovação (pelos resultados oficiais da turma)"
só aparece quando o intervalo inteiro fica acima de 0,90 ou abaixo de 0,10 e a regra
de precisão da seção 7 também vale. Modelo gravado antes de 29/10/2026, sem a
covariância, fica sem intervalo e precisa ser recalculado.

### 13.1 Efeito do modo tutor

`estimarEfeitoModo()` estima, com a matriz de primeiras respostas da turma incluindo o
tutor, o deslocamento `δ` do acerto no tutor como efeito fixo no Rasch:
`P(acerto no tutor) = expit(θ_j - b_i + δ)`, com o `θ_j` de cada pessoa só pelas respostas
cronometradas (pessoas com pelo menos 10) e priori N(0, 1²) em `δ`, por Newton. Com pelo
menos 200 respostas no tutor, `salvarModelo()` grava `efeito_modo` no modelo do Step, e
as telas passam a usar `b - δ` nos itens respondidos no tutor (seção 4). Teste "efeito do
modo tutor": com `δ` verdadeiro de 0,6, a estimativa ficou a menos de 0,2 dele.

`salvarModelo()` grava o modelo em `modelos_psicometricos` (todos os logados leem, só o
admin grava); a tela do aluno o passa para `estimarAluno({ modeloDesfechos, modeloEscore })`.
Sem modelo suficiente, `estimarAluno` devolve `desfechos: null` e `escore: null`, e o
aviso de que a estimativa vem do padrão do banco (provisório, do painel ou ligado à NBME) e não é resultado oficial.

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
de 0,08 nas outras faixas. Esta validação usa `P_medida` (σ_c = 0): o padrão é conhecido
por construção. Ela mostra que a medida está calibrada; não diz nada sobre o padrão,
que só a validação externa (painel e desfechos reais) avalia. A validação da
incerteza do padrão está na seção 6.1.

## 15. Limitações

1. **O padrão é provisório.** Os valores são dificuldades-alvo do projeto do banco, e
   não o julgamento de um painel de juízes nem um corte ligado a dados (seção 2). Um
   erro comum a todos os itens (por exemplo, todos fáceis demais, porque não têm imagem
   e trazem pistas demais) desloca o limiar e não diminui com mais respostas. A
   probabilidade inclui essa incerteza com `σ_c = 0,7` logit (seção 6.1), escolhido por
   simulação e sem base empírica: a precisão alta erra menos de 4% até 0,75 logit de
   viés e cerca de 5% com 1,0 logit. O rótulo é "precisão alta em relação ao padrão do
   banco"; Pass, Fail e a palavra "aprovação" só acompanham a ligação com a NBME (seção
   6.2) ou os desfechos reais (seção 13). **A probabilidade de aprovação com confiança
   elevada que o dono do produto pediu não existe hoje**: ela depende do painel de
   juízes de fato, da ligação com as autoavaliações NBME ou dos resultados oficiais da
   turma, e nenhum dos três tem dados ainda.
2. **Nenhum item tem revisão médica.** Os 1.000 itens do banco privado trazem revisão
   automatizada (modelo de IA), sem médico identificado. As telas de escolha dos
   simulados, o relatório e o banco de questões avisam isso ao aluno (`resumoRevisao()`
   em `banco.js`), e o aviso só sai quando todos os itens tiverem revisão médica com
   nome, data e decisão; os índices da turma (p, ponto-bisserial e infit dentro dos
   limites da seção 11) continuam conferidos na área administrativa.
3. **Banco não é prova.** Itens escritos para ensinar, repetidos em tutor e respondidos
   em casa diferem da prova real (local, cansaço, pressão). O peso de tutor, a correção
   pelo efeito do modo (seção 13.1) e a regra da primeira resposta reduzem, mas não
   eliminam, essa diferença. Os itens ainda não têm imagem, áudio nem vídeo: ECG,
   radiografias, histologia e lesões aparecem descritos no texto, o que facilita o item
   e puxa o viés no sentido do falso Pass. O contrato já aceita mídia (campo `midia`) e
   as telas mostram imagem com ampliação e contraste; até haver itens com imagem, a
   tela de escolha dos simulados e o relatório avisam.
4. **Rasch supõe a mesma discriminação para todos os itens** e independência local.
   Itens que se ajudam (mesma vinheta, mesmo tema em sequência) violam a independência;
   a montagem evita itens seguidos do mesmo sistema, mas não garante independência.
5. **A priori N(0, 1,5²)** representa a população de alunos. Se a turma for muito
   diferente, as probabilidades intermediárias ficam menos calibradas; as extremas (as
   que geram "alta confiança") dependem pouco da priori quando há N itens.
6. **JML tem viés conhecido em testes curtos** (Wright e Douglas, 1977); a priori nos
   dois lados reduz o problema, e a gravação só acontece para itens com pelo menos 30
   respostas. A alternativa condicional (CML) não foi implementada.
7. **Ponto-bisserial com formulários diferentes.** No banco, cada aluno responde um
   subconjunto diferente de itens, e a proporção nos outros itens mistura habilidade com
   a dificuldade do subconjunto. Por isso o infit e o outfit, que usam `θ` de Rasch,
   acompanham os índices clássicos.
8. **Os índices do NBME não são públicos.** A Road to America reproduz os procedimentos
   clássicos de análise de itens; não há garantia de que os limites coincidam com os do
   NBME.
9. **Faixas do outline.** As faixas usadas na montagem vêm das páginas do USMLE
   consultadas por busca em 28/10/2026 (a página de Cirurgia no Step 2 CK tem fontes
   divergentes, e por isso Cirurgia fica sem faixa); o USMLE avisa que as porcentagens
   podem mudar a qualquer momento.

## 16. Referências

- Albert A, Anderson JA. On the existence of maximum likelihood estimates in logistic regression models. Biometrika. 1984;71(1):1-10.
- Angoff WH. Scales, norms, and equivalent scores. In: Thorndike RL, editor. Educational Measurement. 2nd ed. Washington: American Council on Education; 1971. p. 508-600.
- Bock RD, Mislevy RJ. Adaptive EAP estimation of ability in a microcomputer environment. Applied Psychological Measurement. 1982;6(4):431-444.
- Hambleton RK, Pitoniak MJ. Setting performance standards. In: Brennan RL, editor. Educational Measurement. 4th ed. Westport: American Council on Education/Praeger; 2006. p. 433-470.
- Hofstee WKB. The case for compromise in educational selection and grading. In: Anderson SB, Helmick JS, editors. On Educational Testing. San Francisco: Jossey-Bass; 1983. p. 109-127.
- Seaman SR, White IR. Review of inverse probability weighting for dealing with missing data. Statistical Methods in Medical Research. 2013;22(3):278-295.
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
(`f(0)`, média das dificuldades-alvo) referem-se a um formulário igual ao que o aluno
fez. O simulado não é repesado (seção 5.1): o formulário já segue o outline.

**Validade como medida de prontidão** (`validadeDoSimulado()`, acréscimo de
29/10/2026). O relatório marca em destaque "Condições padronizadas: sim ou não", como o
NBME separa standard-paced de self-paced, e só trata a estimativa como leitura de
prontidão do banco quando as três condições valem:

1. **condições oficiais**, escolhidas no modal de início (`sessao.condicoes`): sem
   "parar e continuar depois", o dia nunca para sozinho e toda pausa além do saldo sai
   dos blocos seguintes, com a página aberta ou fechada; e nenhuma parada registrada.
   Em condições de estudo, as regras de parada de `dia-prova.js` continuam. As
   condições não mudam depois de escolhidas (`validarProgresso` e o gatilho do banco
   de dados recusam);
2. **sem reaplicação**: no máximo 25% dos itens do formulário respondidos antes do
   início (`LIMITE_JA_VISTOS`). O modal de início mostra "Você já respondeu N de M itens
   deste formulário", sugere o outro formulário ou o personalizado e, acima de 25%, pede
   confirmação; o relatório sai como "reaplicação, não comparável";
3. **formulário inteiro**: nem reduzido (banco pequeno) nem parcial.

Fora disso, o cabeçalho diz "leitura de estudo" e explica o motivo. O instantâneo
gravado leva `padronizado`, `reaplicacao` e `valido_prontidao`, e o histórico mostra os
selos.

**Formulários reservados.** Os formulários fixos S1-A e S1-B somam o banco inteiro do
Step 1, e CK-A e CK-B o do Step 2 CK; quem estuda pelo banco chegaria ao simulado com
os itens já vistos. Por isso um formulário completo por Step fica **reservado**
(`FORMULARIOS_FIXOS[...].reservado`, sobrescrito por `formularios_fixos.reservado`):
S1-B no Step 1 e CK-A, o único completo, no Step 2 CK. `itensReservados()` tira os itens
do formulário reservado do sorteio do banco do aluno (`filtrarPool`, `contagemFacetas`,
contagens de "não vistas") e do formulário personalizado até o aluno concluir aquele
formulário (ou abandoná-lo depois de pelo menos um bloco), como o NBME faz com as
autoavaliações. Formulário reduzido nunca é reservado, para não esvaziar a prática no
modo demonstração. Enquanto o banco tiver só os itens dos dois formulários, a reserva
tira esses itens da prática até o simulado; a solução definitiva é escrever itens
para formulários reservados além do banco de prática (pendência da área do banco).

**Formulário parcial.** O CK-B tem 202 itens em 11 blocos. A pausa passa a ser
proporcional aos blocos (`pausaProporcional()`: 55 min x 11 / 16, arredondado para cima,
38 min), o resumo da tela de escolha mostra o formulário escolhido de fato, e o check-in
diz "formulário parcial (11 de 16 blocos)".

**Resultado estimado.** Fora da faixa de 0,10 a 0,90 de `P(θ > c | respostas)` (os
mesmos cortes da seção 7, com `P` já com a incerteza do padrão), o selo diz **"Acima do
limiar do banco"** ou **"Abaixo do limiar do banco"** enquanto o padrão for provisório
ou só do painel (correção da rodada 2: antes o selo dizia "Pass"). "Pass" e "Fail" só
aparecem com padrão empírico: o limiar ligado às autoavaliações NBME (seção 6.2, título
"Resultado estimado pelo limiar ligado à NBME") ou o modelo de desfechos suficiente
(seção 13). No Step 2 CK vale o mesmo ("Acima do padrão" só com padrão empírico). A
frase diz "probabilidade de estar acima do limiar do banco (padrão provisório)". Dentro
da faixa, o relatório diz "resultado indefinido, perto do limiar do banco" e escreve a
tendência em texto ("a tendência é acima do limiar", quando `P >= 0,5`).

**Itens públicos fora do corte** (`itensForaDoCorte()` em `formularios.js`, rodada 2).
Os 80 itens públicos (`legado`, com gabarito e explicação no repositório aberto) que
estão nos formulários fixos continuam no formulário, para não mudar a composição nem o
tempo, mas ficam fora da probabilidade, da habilidade, do perfil e do percentual
esperado, como os itens de pré-teste da prova real. O relatório diz quantos saíram; os
acertos do dia contam todos. No modo demonstração, com só os itens públicos, todos
contam. Hoje são 17 no S1-B e 22 no CK-A (reservados), 23 no S1-A e 18 no CK-B.

**Indicador do banco e resultado do formulário.** O relatório mostra os dois números e
explica por que podem diferir com as mesmas respostas: o indicador do banco usa todas as
sessões (primeira resposta de cada item, tutor com peso menor) e repesa os sistemas pelo
outline; o resultado do formulário usa só as respostas dele, sem repesagem. Com `P = 0,55`, escrever "Pass", mesmo com o rótulo de
estimativa preliminar ao lado, seria ler como resultado o que é quase um sorteio. O rótulo
de precisão continua separado: "Precisão alta" exige, além de `P` fora da faixa, pelo
menos N itens e cobertura de 80% dos sistemas. Um formulário completo tem 280 itens, bem
acima de N = 73 a 75, e cobre os sistemas; nele, o rótulo depende só de `P`. Nas
versões reduzidas do modo demonstração (40 itens), N não é atingido e o relatório fica
preliminar, com o número de itens que faltam. No Step 2 CK, nenhuma nota de três dígitos
aparece sem `preverEscore()` calibrado com pelo menos 30 notas reais (seção 9).

**Validação do relatório por simulação.** `node simulado/tests/validacao-relatorio.mjs`
(banco sintético de 700 itens por Step, semente 7; 1.000 examinandos por cenário com
`θ ~ N(0; 0,8²)`, gerador com semente 20261029). Resultado da rodada 2 de 29/10/2026,
com `σ_c = 0,7`:

| Formulário | Itens | Erro comum no padrão | IC 90% de `θ` contém o verdadeiro | IC 90% da distância ao limiar contém o verdadeiro | Brier | Relatórios com precisão alta | Acima e abaixo trocados entre eles | Indefinidos |
|---|---|---|---|---|---|---|---|---|
| Step 1, completo | 280 | nenhum | 89,3% | 100% | 0,078 | 287 | 0 | 713 |
| Step 2 CK, completo | 318 | nenhum | 89,0% | 100% | 0,078 | 264 | 0 | 736 |
| Step 1, prontidão | 80 | nenhum | 89,7% | 100% | 0,088 | 262 | 0 | 738 |
| Step 1, completo | 280 | itens 0,25 logit mais difíceis | 41,4% | 100% | 0,093 | 276 | 0 | 724 |
| Step 1, completo | 280 | itens 0,25 logit mais fáceis | 42,8% | 100% | 0,089 | 300 | 0 | 700 |
| Step 1, completo | 280 | itens 0,5 logit mais difíceis | 2,3% | 100% | 0,133 | 344 | 0 | 656 |
| Step 1, completo | 280 | itens 0,5 logit mais fáceis | 6,7% | 100% | 0,124 | 348 | 0 | 652 |

Com `σ_c = 0,4` (rodada 1), o viés de 0,5 logit trocava 1,9% a 2,6% das classificações
com precisão alta; com 0,7, nenhuma, e o intervalo da distância ao limiar cobre 100%
(conservador: inclui uma incerteza do padrão maior que a da simulação). O preço é
decidir para 26% a 35% dos examinandos quando a população está centrada no limiar,
contra cerca de metade antes; quem está a menos de cerca de 0,9 logit do limiar fica
indefinido enquanto o padrão for provisório. Os vieses de 0,75 e 1,0 logit estão na
seção 6.1. O intervalo de `θ` sozinho continua mostrado, mas não serve para ler a
distância ao limiar quando o padrão está errado (cobre 2% a 43% com viés).

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
tira do dia o cansaço contínuo de 8 ou 9 horas; por isso só existe em condições de
estudo, e o relatório marca esse dia como não padronizado. Nos formulários fixos, parte
dos itens pode já ter sido respondida no banco; o relatório conta esses itens
(`itensJaVistos()`), e acima de 25% o simulado é reaplicação, não comparável. A
estimativa não é corrigida pela memória do item, porque o tamanho do efeito não é
conhecido; por isso a reaplicação sai da leitura de prontidão. Os itens não têm imagem
(seção 15, limitação 2), e o relatório avisa. Validação por simulação em `simulado/tests/relatorio.test.mjs`: examinandos
simulados com `θ = 1,6` e `θ = -1,6` num formulário completo saem com "Pass" e "Fail" em
alta confiança, e no limiar (`θ = 0`) o rótulo só é alto quando `P` sai da faixa de 0,10 a
0,90.

## 18. Banco de questões no espaço do aluno (acréscimo de 29/10/2026)

Telas em `questoes/` (início, criar bloco, bloco em andamento, resultado, desempenho e
painel de probabilidade); contas em `plataforma/js/banco-aluno.js`, sobre as funções das
seções 4 a 10. Testes em `plataforma/tests/banco-aluno.test.mjs`.

**Respostas usadas.** As mesmas da seção 4, de todas as origens (banco, simulado completo
e bloco de 30 minutos): primeira resposta a cada item, cronometrado com peso 1, tutor com
peso 0,5 (e `b - δ` quando houver efeito do modo), item em branco como erro no
cronometrado e fora da conta no tutor, repesadas pela composição do outline (seção 5.1).
O resultado de um bloco tutor separa o acerto bruto do bloco do acerto nas respondidas,
que é o que entra na estimativa, e só dá a leitura em relação ao limiar com pelo menos 5
respostas que entram na conta. O bloco do
banco grava uma linha por item
(`origem: "banco"`, `sessao_id` do bloco, posição, tempo e marca), inclusive os itens
deixados em branco, para que a revisão mostre o bloco inteiro.

**Blocos.** De 1 a 20 itens, como o bloco oficial, ou até 40 no modo livre (critério
interno). Cronometrado: 90 s por item, a média do bloco oficial de 30 minutos com até 20
itens (usmle.org, páginas do Step 1 e do Step 2 CK, consulta em 28/10/2026). Tutor: sem
limite de prova; a resposta trava ao ser confirmada e a explicação aparece em seguida. O
sorteio usa `sortearQuestoes()` estratificado por sistema, com os itens não vistos
primeiro. Os itens do formulário reservado ainda não feito pelo aluno ficam fora do
sorteio (seção 17), e pares inimigos (campo `inimigos` do contrato) nunca saem no mesmo
bloco: o segundo item do par é trocado pelo próximo do pool. Nos formulários fixos e
personalizados vale o mesmo, para o formulário inteiro (seção 22). Filtros: "não vistas" (sem nenhuma resposta), "erradas" (a tentativa mais
recente foi errada ou ficou em branco), "marcadas" (marcada na tentativa mais recente) e
"todas".

**Painel de probabilidade.** `resumoAprovacao()` chama `estimarAluno()` e mostra
`P(θ > c)` com a incerteza do padrão, o intervalo de 90% de `θ` e o da distância ao
limiar, o percentual esperado num formulário com todos os itens do Step no banco (com
intervalo) e o acerto do examinando no limiar no mesmo formulário, o rótulo da seção 7
com cada condição e quantos itens e quais sistemas faltam (com o número de itens e o
mínimo de cada sistema). Quando os itens que faltam passam dos itens ainda não vistos pelo aluno, a tela
avisa. No Step 2 CK, a frase é "probabilidade de estar acima do limiar do banco, que
representa o 218", com o aviso da seção 9; a nota de três dígitos só aparece quando
houver modelo de escore suficiente (seção 13). Com modelo de desfechos suficiente, a
probabilidade pelos resultados oficiais aparece ao lado, com o intervalo, o número de
reprovações e a taxa de resposta. A prontidão combinada da seção
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
a área derruba a probabilidade; `ganho < 0`: a área a sustenta, e a tela escreve o efeito
por extenso ("se aqui você ficasse no nível do limiar, a probabilidade cairia N
pontos"); uma área com acerto igual
ao esperado no limiar tem ganho zero (conferido no teste). As contribuições não se somam:
`P` não é linear em `θ` e, nas disciplinas, um item conta em cada rótulo.

Área com menos de 5 itens (o mesmo mínimo do perfil por área) fica com `ganho: null` e
`poucos_itens: true`: com 1 ou 2 itens, o ganho é ruído. A tela lista essas áreas à parte,
como "poucos itens", sem pontos. A conta parte das mesmas respostas repesadas e da mesma
incerteza do padrão do painel, para que a base seja a probabilidade mostrada.

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

Na ordem: (1) até 5 sistemas com pelo menos 5 itens que mais derrubam a probabilidade;
(2) a disciplina e a competência (no Step 2 CK, também a disciplina clínica) de maior
ganho, sem repetir no Step 1 a competência que coincide item a item com um sistema já
recomendado (aprendizado baseado na prática e bioestatística; comunicação e ciências
sociais); (3) os sistemas do outline com menos itens que o mínimo da cobertura, que
impedem a precisão alta; (4) quantos itens faltam
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
O painel mostra a probabilidade de estar acima do limiar do banco, o rótulo de precisão,
o θ com intervalo de 90%, o percentual esperado num formulário completo e o perfil por
sistema; a distribuição da turma separa precisão alta (ponto cheio) de estimativa
preliminar (anel).

**Critério de risco `banco_probabilidade_baixa`** (critério interno da Road to America,
nível alto): `P(θ > c | respostas) <= 0,10` **com precisão alta** (seção 7: pelo menos N
itens efetivos e itens suficientes em 80% dos sistemas, com a incerteza do padrão) num
Step ainda não aprovado. O limite de
0,10 é o mesmo da regra de confiança: abaixo dele a estimativa já é decisiva no sentido
desfavorável. Estimativa preliminar nunca acende o critério. A prontidão continua decidida
pela EXIT 18 (seção 10); quando a EXIT 18 está atendida e o banco indica o contrário com
precisão alta, a ficha mostra a divergência e pede conversa.

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
| θ das turmas anteriores | N(0,3; 1), número de examinandos para cerca de 45 respostas por item (de 150 a 400 por Step), até 160 itens cada, 15% no modo tutor |
| b verdadeiro | b de Angoff + N(0; 0,45²), sorteado pelo identificador do item |
| Distratores | pesos 0,36, 0,26, 0,21 e 0,17 em ordem sorteada por item |
| Defeitos plantados por Step | 2,5% gabarito trocado, 3% pouco discriminativo (acerto de 0,55 em qualquer θ), 2% muito difícil (b passa a ser o maior entre b e 0,5, mais 1,8) e 2% muito fácil (o menor entre b e -0,5, menos 4), no mínimo 1 de cada |
| Desfechos | 80% das turmas anteriores; Pass quando θ + N(0; 0,3²) > 0; só Pass/Fail, sem nota (o suficiente para 30 reprovações por Step, o mínimo do modelo para ir às telas) |
| Reportes fictícios | o texto começa com "DEMO, defeito fictício da simulação", porque com o banco completo os defeitos são plantados em identificadores de itens reais |
| Juízes fictícios do painel Angoff | 12 mentores, para que o fluxo de demonstração chegue ao mínimo de 10 juízes |

O teste "demonstração" de `admin/tests/analise.test.mjs` confere que cada defeito acende o
alerta esperado, que a recalibração fica mais perto do b verdadeiro do que a
dificuldade-alvo e que há pelo menos 10 aprovados e 10 reprovados por Step;
`store-banco.test.mjs` confere que o modelo de demonstração fica suficiente (30 de cada). Os defeitos são da simulação: a ficha
do item avisa e diz que o item público não tem erro conhecido.

### 19.5 Cobertura do blueprint

Para cada linha do outline: itens ativos, proporção do banco, faixa oficial (de
`TAXONOMIA`), situação (dentro, abaixo, acima, sem faixa), itens que um formulário completo
pede (`ceil(lo * 280)` a `floor(hi * 280)` no Step 1; 318 no Step 2 CK) e formulários
completos sem repetição que a linha sustenta (`floor(n / ceil(lo * tamanho))`). O total de
formulários sem repetição é o menor entre `floor(itens / tamanho)` e os das linhas de
faixa exigida (sistema e competência). Nas disciplinas, o item conta em cada rótulo, como
no outline, e a faixa é alvo, não trava.

### 19.6 Painel Angoff e Hofstee com escores comparáveis

O corte do painel é a média, entre os itens, da média das estimativas dos juízes na
rodada final; o erro-padrão é o desvio-padrão dos cortes dos juízes que avaliaram todos
os itens dividido pela raiz do número deles. A publicação exige pelo menos 10 juízes em
cada item e erro-padrão do corte abaixo de 0,02 (seção 2); o item publicado leva o erro-
padrão da média dos juízes nele (`angoff_painel_ep`). O admin marca por padrão o
administrador e os 10 primeiros juízes possíveis ao criar o painel.

Hofstee (Hofstee, 1983): a curva de reprovação `F(c)` usava a porcentagem bruta de acerto
de cada pessoa nos itens do painel que ela respondeu, mas no banco cada pessoa responde
um subconjunto diferente, e os escores não eram comparáveis. Desde 29/10/2026,
`distribuicaoEscores(..., { porId })` calcula, para cada pessoa com pelo menos 20 respostas
no Step, o `θ` EAP com todas as respostas dela e o escore esperado no formulário do painel,
`100 x média de expit(θ - b_i)` nos itens do painel. Teste "Hofstee com escores
comparáveis": duas pessoas que acertaram tudo, uma nos itens fáceis e outra nos
difíceis, empatavam em 100% e agora ficam separadas pelo `θ`.

## 20. Correções da rodada 1 da banca (29/10/2026)

| Achado | O que mudou | Onde |
|---|---|---|
| "Angoff" era a dificuldade-alvo do blueprint | o valor se chama dificuldade-alvo nas telas e nos documentos; o padrão é provisório; o painel passa a exigir 10 juízes e erro-padrão do corte abaixo de 0,02 | seções 2 e 19.6; `angoff.js`, `banco.js`, `schema.sql` |
| a confiança ignorava a incerteza do padrão | `P = P(θ > c)`, `c ~ N(0; 0,4²)` enquanto provisório (0,7 desde a rodada 2, seção 21); rótulo "precisão alta em relação ao padrão do banco (padrão provisório)"; "alta confiança de aprovação" só pelos desfechos | seções 6.1, 7, 13 e 17 |
| desfechos com 10 + 10 e sem incerteza dos coeficientes | 30 + 30 para ir ao aluno; covariância e intervalo; taxa de resposta e ponderação pelo inverso da probabilidade de informar | seção 13 |
| theta sem ponderação pelo blueprint; cobertura com 1 item | repesagem pelo outline; mínimo de 5 itens e metade do peso por sistema | seções 5.1 e 7 |
| peso do tutor sem estimativa empírica | efeito fixo do modo estimado com os dados da turma, aplicado ao b | seção 13.1 |
| Hofstee com escores não comparáveis | escore esperado pelo θ | seção 19.6 |
| formulários sem reserva; nova tentativa sem aviso | formulário reservado por Step fora do banco do aluno; modal com itens já vistos; reaplicação não comparável | seção 17 |
| sem modo estrito | condições oficiais ou estudo; "condições padronizadas: sim ou não" no relatório | seção 17 |
| CK-B parcial com resumo e pausa de formulário completo | resumo do formulário escolhido; pausa proporcional | seção 17 |
| recomendações com áreas de 1 item | mínimo de 5 itens; "poucos itens"; efeito por extenso | seção 18 |
| sem mídia | campo `midia` no contrato, imagem com ampliação e contraste nas telas, aviso de que o banco ainda não tem imagens | `CONTRATO-ITEM.md`, seção 15 |
| revisão por IA apresentada como médica | `revisao_tipo` derivado; revisor automatizado não conta como revisão médica | `CONTRATO-ITEM.md`, `banco.js` |

O que continua pendente, por depender de gente ou de conteúdo e não de código: o painel
de juízes de fato (o fluxo existe; faltam os 10 a 15 médicos), os desfechos reais da
turma, itens com imagem licenciada, itens para formulários reservados além do banco de
prática, o segundo formulário completo do Step 2 CK e a correção da proveniência da
revisão nos arquivos do banco (área do banco).

## 21. Correções da rodada 2 da banca (29/10/2026)

| Achado | O que mudou | Onde |
|---|---|---|
| `σ_c = 0,4` ajustado ao cenário da banca anterior | `σ_c = 0,7`, escolhido por simulação com vieses de 0 a 1,0 logit e erro de item; tabela de sensibilidade documentada; teste com os cenários de 0,75 e 1,0 logit; análise de sensibilidade mostrada ao aluno | seção 6.1; `INCERTEZA_CORTE`, `SENSIBILIDADE_PADRAO`, `estimarAluno` |
| escore NBME calculado e descartado | ligação linear com as autoavaliações NBME: corte `μ_c` com erro-padrão pelo método delta, no lugar do provisório quando suficiente | seção 6.2; `corteLigadoNbme`, `ajustarEscore`, `calibracao.js`, tela Calibração |
| erro de medida contado duas vezes nos desfechos | regressão calibrada sobre o EAP, sem integrar `dp`; simulação de cobertura do intervalo de P | seção 13; `intervaloDesfechos`, `preverEscore` |
| Hofstee obrigatório só no papel | publicação recusada sem Hofstee ou com o corte fora da janela, salvo justificativa registrada | seção 2; `angoff.js`, `r2a_admin_publicar_angoff`, tela do painel |
| selo "Pass" e "Probabilidade de aprovação" com padrão provisório | "Acima do limiar do banco" e "Abaixo do limiar do banco"; Pass e Fail só com a ligação com a NBME ou com desfechos; botões e textos com "posição em relação ao limiar do banco" | seção 17; `relatorio.js`, telas do banco, dos simulados e de Meu progresso |
| aluno não sabia da falta de revisão médica | aviso na escolha dos simulados, no relatório e no banco de questões | seção 15; `resumoRevisao` |
| itens públicos nos formulários reservados | ficam no formulário, mas fora da estimativa, como itens de pré-teste | seção 17; `itensForaDoCorte` |
| dois números diferentes no relatório sem explicação | frase que explica a repesagem do indicador do banco | `tela-relatorio.js` |
| banco do Step 2 CK pequeno sem aviso | aviso de que estudo e simulado limpo disputam os mesmos itens | tela dos simulados completos e início do banco |

O que continua pendente, por depender de gente ou de conteúdo: o painel de juízes de
fato (10 a 15 médicos, treino, rodadas e dados de impacto, nos formulários reservados),
a revisão médica item a item, itens com imagem (meta de 15% a 25% por formulário), a
troca dos itens públicos dos formulários reservados por itens privados equivalentes e
os formulários adicionais para que cada Step tenha pelo menos dois formulários
reservados além de um banco de prática separado. A ligação com a NBME e o modelo de
desfechos já estão prontos e entram sozinhos quando a turma tiver dados suficientes.

## 22. Correções da rodada 4 (30/10/2026)

| Achado | O que mudou | Onde |
|---|---|---|
| ligação com a NBME contava escores, não alunos: 10 alunos com 3 autoavaliações liberavam a ligação, com erro-padrão pequeno demais | cada aluno pesa 1 no ajuste e a covariância dos coeficientes é robusta agrupada por aluno; mínimo de 30 alunos distintos; modelo antigo sem a contagem de alunos não libera; teste de cobertura com escores repetidos (92% agrupando, 70% contando escores) | seção 6.2; `ajustarEscore`, `corteLigadoNbme`, `LIGACAO_NBME.min_alunos`, `calibracao.js`, tela Calibração |
| pares inimigos respeitados só no bloco do banco | formulários fixos (partição de A e B) e personalizados nunca juntam um par; gravação com par dentro é recusada; `verificarFormulario` acusa o par; quando um trio de itens que se entregam não cabe em dois formulários, um item sai do B, que continua no formato oficial com blocos de 19 ou 20 | `mapaInimigos`, `paresInimigosEm`, `montarParticao`, `montarFormularioFixo`, `tests/formularios.test.mjs` |
| pares inimigos incompletos no banco | detecção por TF-IDF (vinheta, conceito e alternativa correta) e por resposta escrita na vinheta do outro item; cada candidato lido e decidido; campo completo nos dois itens | `banco-privado/ferramentas/inimigos.mjs`, `decisoes-inimigos.json` |
| A puxado para a meta de dificuldade e B com o que sobrava (S1-B com 12% de difíceis) | A e B paralelos na composição de dificuldade e na dificuldade-alvo média; a meta do projeto fica como aviso | `restricoesDoStep`, `montarParticao` |
| `formularios.json` e `relatorio-banco.md` desatualizados em relação aos lotes | os dois regenerados; teste de integração que recalcula proporções, dificuldade, gabarito, corte e inimigos a partir dos lotes, remonta os formulários e regenera o relatório, e falha se o arquivo gravado divergir | `tests/relatorio-formularios.test.mjs`, `formularios.mjs`, `relatorio.mjs` |
| cobertura do Step 2 CK medida por expressão regular | marcação explícita `topicos_nucleares` em todos os itens privados do Step 2 CK; o validador conta a marcação, lista as lacunas e deixa a expressão só como auditoria | `validar-banco.mjs`, `topicos-nucleares-step2ck.json`, `CONTRATO-ITEM.md` |

Continua pendente o que depende de gente: revisão médica item a item, painel de juízes
real, imagens reais licenciadas e itens difíceis novos para chegar à meta de 25%.

