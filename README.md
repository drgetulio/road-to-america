# Road to America

Página de vendas da turma fundadora de preparação para o USMLE Step 1 e Step 2 CK, com a ferramenta de verificação de elegibilidade da escola médica.

- `index.html`: página principal (oferta, elegibilidade, método com globo em Three.js, fundador e mentores, dúvidas, investimento, garantia e pré-inscrição).
- `verificar.html`: verificação guiada da escola no World Directory of Medical Schools (critério do USMLE e do ECFMG para escolas fora dos EUA).
- `privacidade.html`: Política de Privacidade (LGPD), linkada nos formulários e no rodapé.
- `anki/`: app de flashcards do Step 1 com repetição espaçada (FSRS), modo demonstração ou Supabase. Instruções em `anki/README.md`; esquema do banco em `supabase/schema.sql`.
- `simulado/`: simulado de 30 minutos no formato do bloco oficial e simulados completos do Step 1 e do Step 2 CK no formato do dia de prova, com relatório de desempenho.
- `conteudo-step1.html`: conteúdo do Step 1 pelo Content Outline oficial, gerado por `tools/build-conteudo-step1.cjs`.
- `admin/`: área administrativa de rendimento dos participantes.

## Área do aluno e área administrativa

As partes usam a mesma marca, o mesmo botão de tema (a escolha vale em todas as páginas) e links entre si. O rodapé de `index.html` leva aos flashcards, ao simulado de 30 minutos, ao banco de questões, aos simulados completos e ao conteúdo do Step 1; a área administrativa não aparece no site e só abre para administradores.

### Como as partes se ligam

- **Espaço do aluno:** flashcards, banco de questões, simulados (30 minutos e dia de prova completo) e Meu progresso, com o mesmo menu e a mesma conta. Cada resposta no banco e nos simulados entra numa única estimativa por Step (modelo de Rasch ancorado no limiar do banco, hoje provisório, `plataforma/PSICOMETRIA.md`), e a posição em relação a esse limiar aparece com o mesmo número no painel do banco, em Meu progresso, na página dos simulados completos e na ficha do participante. Meu progresso também lista os simulados completos, com o dia parado (e o link para continuar) e o relatório de cada um. A estimativa é complementar e não prevê aprovação no USMLE: o limiar ainda vem da dificuldade-alvo dos itens, sem painel de juízes nem dados de desfecho, e a prontidão para manter a data continua sendo a EXIT 18, pelas autoavaliações do NBME.
- **Espaço da equipe** (`admin/`): turma, ficha de cada participante (com a probabilidade pelo banco, os simulados completos e o relatório de cada dia), análise de itens no padrão do NBME, recalibração com dados da turma e blueprint. Responder questões ou fazer simulado conta como atividade, então quem estuda só pelo banco não acende o risco de inatividade.
- **Percurso inteiro testado** por `plataforma/tests/produto.e2e.mjs`: bloco personalizado no banco, Step 1 completo com pausa, parada e retomada, relatório, a mesma probabilidade nas quatro telas e a visão do admin.

- **Flashcards** (`anki/`): estudo com FSRS, criação e curadoria de cards e a tela **Meu progresso** (`anki/#/progresso`), onde o participante vê o checklist da garantia, a prontidão pela EXIT 18, as datas de prova, os simulados e lança as autoavaliações do NBME. É esse o "painel do aluno" citado no Termo da Garantia. Detalhes em `anki/README.md`.
- **Banco de questões** (`questoes/`): itens no estilo NBME do Step 1 e do Step 2 CK em blocos personalizados (sistemas, disciplinas, competências, áreas e tarefas; não vistas, erradas, marcadas; de 1 a 20 itens ou até 40 no modo livre; tutor ou cronometrado com 90 s por item), na mesma tela de bloco do simulado, com revisão, desempenho por área, curva de evolução e o painel de posição em relação ao limiar do banco de cada Step (intervalo, rótulo de precisão, itens e sistemas que faltam, áreas que mais derrubam a probabilidade e o que estudar). Detalhes em `questoes/README.md`.
- **Simulado de 30 minutos** (`simulado/`): um bloco com 20 questões e 30 minutos para o Step 1 ou o Step 2 CK, o tamanho do bloco oficial desde maio de 2026 (usmle.org). As questões são sorteadas por área a partir de `simulado/data/`, com a tabela de valores laboratoriais na tela. Na mesma página, `simulado/#/completos` tem os **simulados que replicam a prova** (Step 1 com 14 blocos e até 280 itens, Step 2 CK com 16 blocos e até 318, meio formulário e avaliação de prontidão), com tutorial, pausas com saldo, parar e continuar depois e relatório de desempenho com a posição em relação ao limiar do banco e o perfil por área. Detalhes em `simulado/README.md`.
- **Conteúdo do Step 1** (`conteudo-step1.html`): tópicos por sistema, com as faixas oficiais de questões e marcação de estudo guardada no navegador. Para editar, altere `tools/conteudo-step1-dados.txt` e rode `node tools/build-conteudo-step1.cjs`; não edite o HTML gerado.
- **Área administrativa** (`admin/`): turma, lista de participantes, ficha individual (flashcards, simulados, NBME, presença, riscos e anotações do mentor), metas e exportação CSV. Detalhes em `admin/README.md`.

Sem configuração, tudo roda em **modo demonstração**: os dados ficam no navegador, um seletor no topo troca entre participante e administrador e o painel mostra uma turma fictícia marcada como tal.

### Configurar o Supabase

1. Crie o projeto e rode `supabase/schema.sql` no SQL Editor (pode ser rodado de novo sem perder dados).
2. Ative o login por e-mail e cadastre `https://drgetulio.github.io/road-to-america/anki/` como Site URL e Redirect URL.
3. Cole a Project URL e a chave pública anon em `anki/config.js`. Flashcards, simulado e área administrativa leem o mesmo arquivo. Nunca use a chave `service_role` no site.
4. Entre pelo app com o seu e-mail (o primeiro acesso cria o perfil de participante) e promova a sua conta a administrador pelo SQL Editor.

O passo a passo completo está em `anki/README.md` (seção "Ativar o Supabase"), e a camada de dados, as regras de acesso e os critérios de risco, garantia e prontidão estão em `plataforma/INTERFACE.md`. As políticas de acesso podem ser testadas num Postgres local com os scripts de `supabase/teste-local/`.

### Testes

```bash
for d in anki plataforma simulado admin; do node --test $d/tests/*.test.mjs; done
node admin/tests/fluxos.e2e.mjs          # fluxos da área administrativa (Playwright)
AXE_PATH=.../axe.min.js node admin/tests/banco.e2e.mjs       # análise de itens, recalibração, desfechos e blueprint na área administrativa
AXE_PATH=.../axe.min.js node questoes/tests/fluxos.e2e.mjs   # banco de questões: fluxos, axe, 1440 e 390 px, claro e escuro
node plataforma/tests/percurso.e2e.mjs   # percurso completo: flashcards, simulado, NBME e painel do admin
AXE_PATH=.../axe.min.js node plataforma/tests/produto.e2e.mjs    # produto inteiro: banco, Step 1 completo, Meu progresso, admin, navegação e axe
AXE_CORE=.../axe.min.js node simulado/tests/completo.e2e.mjs     # simulados completos: dia de prova, relatório, axe-core em 1440 e 390 px
node simulado/tests/validacao-relatorio.mjs   # resultado estimado do simulado: calibração por simulação, com e sem erro no Angoff
node supabase/teste-local/03-compara-resumo.mjs   # resumo do painel: Postgres igual ao JavaScript
node supabase/teste-local/04-compara-itens.mjs    # estatísticas de itens: Postgres igual ao JavaScript
```

O banco de questões (carregador, psicometria, formulários no formato oficial e importação
para o Supabase) está descrito em `plataforma/README.md`, `plataforma/INTERFACE.md` e
`plataforma/PSICOMETRIA.md`.

Site estático, sem etapa de build. Basta publicar a pasta em qualquer hospedagem (Netlify, Vercel, GitHub Pages, servidor próprio).

## Publicação no GitHub Pages

O site é publicado a partir da branch `main`, na raiz, em https://drgetulio.github.io/road-to-america/. O arquivo `.nojekyll` impede o processamento pelo Jekyll, e todos os caminhos são relativos, o que permite servir o site num subdiretório.

No GitHub Pages o Netlify Forms não existe. Para que as pré-inscrições sejam gravadas, é preciso preencher `leadEndpoint` em `assets/js/config.js` com a URL de um serviço que aceite POST JSON (por exemplo, um formulário do Formspree). Sem isso, o formulário exibe a mensagem de falha no envio.

## Para ver localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## O que editar antes de publicar

Tudo o que muda com frequência fica em `assets/js/config.js`:

| Campo | Para que serve |
|---|---|
| `leadEndpoint` | Destino dos cadastros. Vazio usa o Netlify Forms (automático quando o site está na Netlify). Para outro destino, informe uma URL que aceite POST JSON (Formspree, Make, Zapier, webhook do RD Station ou do ActiveCampaign). |
| `grupoWhatsapp` | Convite do grupo da turma fundadora (`https://chat.whatsapp.com/...`). O botão verde aparece logo após a pré-inscrição. Vazio mostra o aviso de que o convite será enviado por WhatsApp. |
| `whatsapp` | Número de atendimento (só dígitos, com 55). Aparece como alternativa quando o envio do formulário falha. |
| `fundador` | Nome completo, CRM, RQE, link do Lattes e foto. A Resolução CFM 2.336/2023 exige nome, CRM e RQE quando o médico divulga especialidade. Vazio mostra "Dr. Getúlio" e o monograma. |
| `empresa` | Razão social, CNPJ, cidade e e-mail. Aparecem no rodapé e na Política de Privacidade. |
| `oferta` | Texto de pagamento, data de início, número de vagas, formato das aulas e da mentoria. Cada campo preenchido aparece no cartão de preço. |
| `amostras` | Links para amostra gratuita do Anki e da apostila (botões nos blocos do material). |
| `mentores` | Lista de mentores. Cada item vira um cartão de embarque. Vazio mostra três cartões reservados com o aviso de que os perfis serão publicados antes das matrículas. |

**Antes de captar leads**, preencher no mínimo `fundador`, `empresa`, `grupoWhatsapp` e pelo menos dois `mentores`: os avaliadores independentes apontaram esses itens como os que mais pesam na decisão do médico.

Também revisar:

1. **Contrato da garantia**: a página descreve a garantia de três anos e cita o direito de arrependimento do CDC. O texto do contrato precisa ter as mesmas regras.
2. **Regras da garantia na página**: prazo de três anos, aprovação = Pass no Step 1 e nota mínima no Step 2 CK, participação no programa, ao menos uma tentativa da prova que faltou, agendamento livre (o mentor orienta, mas não autoriza) e reembolso de 100% do valor do curso. Validar com o jurídico.

## Pendências que dependem do dono do curso

Os três avaliadores independentes (médica cética, especialista em qualidade e revisor de texto) apontaram que a nota da página só passa de 9 quando estes itens estiverem preenchidos com dados reais e verificáveis:

1. Fundador: nome, CRM-DF 13610, RQEs (Pediatria 10178 e Medicina Esportiva 10439), Lattes e foto já estão em `config.js > fundador`. Os RQEs e o link do Lattes vieram de buscas públicas (Doctoralia e página de docentes da ESCS) e precisam ser conferidos no CFM e no CNPq antes da publicação. Sem RQE, o item "Pediatra e médico do esporte" fica oculto automaticamente, para atender à Resolução CFM 2.336/2023.
2. Empresa: razão social, CNPJ, cidade e e-mail de contato e do encarregado de dados (`config.js > empresa`).
3. Mentores: nome, foto, faculdade, resultado no Step 2 CK, programa e cidade nos EUA, de preferência com link verificável (`config.js > mentores`, campos `origem` e `destino` com siglas curtas, como "BSB" e "OH").
4. Oferta: valor das parcelas e desconto à vista, data de início, número de vagas, formato e horário das aulas e da mentoria (`config.js > oferta`).
5. Amostras gratuitas do Anki e da apostila (`config.js > amostras`).
6. Link do grupo de WhatsApp. Recomenda-se uma Comunidade com grupo só de avisos, em que os participantes não veem o número uns dos outros; a página já oferece a opção de receber avisos só por e-mail.
7. Respostas de produto que a página ainda não dá: idioma das aulas e da apostila; se há banco de questões próprio; se há preparo para o OET Speaking; total de horas de aula, de cards e de páginas; se o reembolso é corrigido pela inflação e inclui juros de parcelamento; regra de trancamento após os sete dias.
8. Validação jurídica do termo da garantia (`garantia.html`), em especial: critério de 80% das aulas, duas autoavaliações do NBME por Step, ausência de tentativa obrigatória, prazo de 30 dias para o reembolso e a cláusula de encerramento do curso. São propostas redigidas para a página e precisam refletir o contrato.
9. Imagens: baixar as fotos da CDN para `assets/img/`, convertê-las para AVIF/WebP em três larguras e usar `srcset`.
10. Levantamento de preços dos concorrentes: arquivar capturas de tela das páginas citadas na data da publicação.
11. Supabase: criar o projeto, aplicar o `schema.sql` atual, preencher `anki/config.js` e testar com contas reais o login, o simulado gravado no banco e o painel do admin. Até hoje tudo foi testado no modo demonstração e num Postgres local que simula o Supabase.
12. Simulado: conferir nas tabelas originais do NBME e do ACP os valores laboratoriais complementares (PCR, fibrinogênio, lactato, saturação da transferrina), que vieram de cópias secundárias. O simulado de 30 minutos e o modo demonstração usam só os 40 itens públicos por Step; o banco completo vem do Supabase (item 16).
13. Política de Privacidade: o trecho sobre os dados da área do aluno (base legal, prazo de guarda, Supabase como operador) é proposta e precisa de revisão jurídica.
14. Critérios do painel: confirmar a leitura de "duas autoavaliações seguidas" na EXIT 18 (uma self-paced no meio não quebra a sequência), a retenção desejada fixa em 90% nos cálculos do painel e o agrupamento da turma pelo semestre da matrícula.
15. Rotina da equipe: lançar presença nas aulas (manual ou por CSV) e a data de matrícula de cada participante, sem as quais o checklist da garantia fica incompleto.
16. Banco de questões: terminar a revisão dos itens de `banco-privado/` (fora do git), aplicar o `schema.sql` atual no Supabase e importar com `tools/importar-banco.mjs` (passo a passo em `plataforma/README.md`); depois, ativar a matrícula de cada participante (`profiles.ativo`), sem a qual o banco não abre para ele. Em 29/10/2026 a simulação de importação leu 920 itens (436 do Step 1 e 480 do Step 2 CK), 916 válidos; 4 itens do Step 1 (R2A-S1-0133, 0336, 0338 e 0443) estão com alternativas repetidas e não seriam enviados.
17. Revisão clínica dos itens por médicos da equipe (gabarito, plausibilidade dos distratores e referências) e julgamento de Angoff por um painel: uma probabilidade de aprovação de verdade depende desses valores, da ligação com as autoavaliações NBME da turma ou dos resultados oficiais (`plataforma/PSICOMETRIA.md`, limitações e validação por simulação).
18. Coleta de desfechos reais: lançar o resultado oficial (Pass/Fail e a nota do Step 2 CK) de cada participante em Calibração, e recalibrar os itens quando houver respostas suficientes da turma. Até lá, todas as telas dizem que a estimativa vem do padrão de Angoff e não é oficial.
19. Correção no servidor: hoje o gabarito chega ao navegador do aluno (site estático). Para que a probabilidade valha como indicador de alta confiança contra fraude, a correção precisa passar para uma função no Supabase que só devolve o gabarito depois do fim do bloco.

## Imagens

As fotos foram geradas para o projeto e estão hospedadas numa CDN (URLs `d8j0ntlcm91z4.cloudfront.net` nos HTML). Recomenda-se baixá-las para `assets/img/` e trocar as URLs, para não depender de link externo:

| Uso | Arquivo na CDN |
|---|---|
| Hero (médica no hospital) | `hf_20261027_231732_267a4822-...png` |
| Faixa da estrada e fallback do globo | `hf_20261027_231733_3c857358-...png` |
| Bloco do Anki (estudo noturno) | `hf_20261027_231731_dbbd138d-...png` |
| Mentores | `hf_20261027_231732_23a8f3ed-...png` |
| Pré-inscrição (passaporte) | `hf_20261027_231731_8127800b-...png` |
| Hero da verificação (diploma) | `hf_20261027_231731_c3177e57-...png` |
| Faixa final (avião) | `hf_20261027_231732_2fbe8d68-...png` |

## Dados e fontes

Os números citados (nota mínima, tentativas, Match 2026, taxas, política de acreditação) foram conferidos em outubro de 2026 nas fontes linkadas na própria página (USMLE, ECFMG/Intealth, NRMP, FSMB). Revisar a cada turma.

`assets/js/escolas.js` traz a lista de cursos com acreditação SAEME-CFM vigente (reconstruída em 27/10/2026 a partir de saeme.org.br) e outras escolas para o autocompletar. A acreditação SAEME não é requisito para o USMLE; ela aparece apenas como informação extra. Atualizar depois de cada cerimônia de acreditação do CFM (a próxima está prevista para 12/11/2026).

## Arquivos gerados

- `assets/icons/`: subconjunto dos ícones Phosphor usados. Para incluir um ícone novo:
  `npm i @phosphor-icons/web@2.1.1 && pip install fonttools brotli && python3 tools/build-icons.py node_modules/@phosphor-icons/web`
- `assets/js/globe-data.js`: pontos de terra do globo, com Brasil e EUA marcados.
  `npm i world-atlas@2 topojson-client@3 d3-geo@3 && node tools/build-globe.cjs node_modules`
- `assets/vendor/three.module.min.js`: Three.js r160 (licença MIT em `THREE-LICENSE.txt`), carregado só quando a seção do método se aproxima da tela.
- `assets/fonts/`: Barlow, Barlow Condensed e Overpass Mono (Fontsource, licença OFL).

## Acessibilidade e desempenho

- Tema claro e escuro (segue o sistema, com botão de troca).
- Animações respeitam `prefers-reduced-motion`.
- O globo tem alternativa estática quando o navegador não suporta WebGL.
- Formulários com rótulos visíveis, mensagens de erro por campo e honeypot contra spam.
