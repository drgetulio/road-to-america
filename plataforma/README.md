# Plataforma do aluno: banco de questões e simulados completos

Camada comum às telas do aluno e do admin: carregador do banco (`js/banco.js`),
psicometria (`js/psicometria.js`), montagem de formulários e relógio do simulado completo
(`js/formularios.js`), rotinas de calibração do admin (`js/calibracao.js`) e validação
dos registros (`js/registros.js`). A interface de cada função e método está em
`INTERFACE.md`; o método psicométrico, em `PSICOMETRIA.md`; o formato de cada questão,
em `CONTRATO-ITEM.md`.

## Onde ficam as questões

- **Públicas (demonstração):** os 80 itens de `simulado/data/` (40 por Step), na versão
  anterior do contrato. O carregador converte para o contrato atual.
- **Banco completo:** `banco-privado/` (fora do git, porque o repositório é público).
  Em produção ele vive na tabela `questoes` do Supabase, lida só pelos administradores.
  Alunos com matrícula ativa (`profiles.ativo`, ligado pelo admin) leem os itens ativos em
  `questoes_publicas`, espelho sem gabarito nem explicações; a correção vem das RPCs
  `r2a_responder`, `r2a_revelar` e `r2a_corrigir_simulado` depois que a resposta é
  gravada (detalhes em `INTERFACE.md`, seção Gabarito no servidor).
- **Formulários fixos:** `banco-privado/formularios.json` (S1-A, S1-B, CK-A e CK-B,
  gerados por `banco-privado/ferramentas/formularios.mjs --gravar`). No Supabase vão para
  a tabela `formularios_fixos`.
- **Ferramentas de consolidação:** `banco-privado/ferramentas/` (validar, duplicidade,
  laboratório, gabarito, formulários, manifesto e relatório); o resultado da última
  consolidação está em `banco-privado/relatorio-banco.md`.

## Importar o banco para o Supabase

Pré-requisitos: o `supabase/schema.sql` atual aplicado no projeto (SQL Editor, Run) e a
chave **service_role** do projeto (Settings, API). Essa chave ignora a RLS: use só no seu
computador e nunca a grave em arquivo, commit ou mensagem.

```bash
# 1. conferir sem enviar nada (valida o contrato e mostra o relatório)
node tools/importar-banco.mjs --dry-run --relatorio /tmp/relatorio-banco.json

# 2. enviar (as variáveis valem só para este comando)
SUPABASE_URL="https://SEU-PROJETO.supabase.co" SUPABASE_SERVICE_ROLE_KEY="cole-a-chave-aqui" \
  node tools/importar-banco.mjs --incluir-publicos
```

O que a ferramenta faz:

- lê todos os `*.json` de `banco-privado/` (subpastas incluídas, menos `ferramentas/`,
  `versoes/` e `fontes-*/`), exceto `manifest.json`, `formularios.json`, `referencia-*.json` e
  `blueprint-*.json`; arquivo que não é lista de itens é ignorado e aparece no relatório;
- completa cada item com a especificação de mesmo `spec_id` dos blueprints
  (`banco-privado/blueprint-step1.json` e `blueprint-step2ck.json`): disciplinas
  secundárias, disciplinas clínicas oficiais e tópicos do outline que o item não repete;
  classificação do item diferente da especificação vira aviso no relatório
  (`--sem-blueprint` desliga);
- normaliza e valida cada item com o mesmo código do site (`plataforma/js/banco.js`);
  item com erro **não é enviado** e aparece no relatório com o motivo; avisos (falta de
  explicação por alternativa, travessão no resumo em português, valor laboratorial fora
  da tabela, item não revisado) não impedem o envio;
- faz upsert por `id` em lotes de 200 (`--lote` muda). No banco, o gatilho deriva gabarito,
  classificação e Angoff do próprio item e sobe a versão só quando o conteúdo muda; a
  versão nova apaga a calibração antiga do item;
- sem `--status`, item novo entra como `ativo` e item existente **mantém o status** (uma
  suspensão feita pelo admin não é desfeita pela reimportação). `--status rascunho` grava
  esse status em todos;
- `--incluir-publicos` importa também os 80 itens públicos, para que o banco corrija no
  servidor as respostas do simulado de 30 minutos;
- envia os formulários fixos de `banco-privado/formularios.json` para a tabela
  `formularios_fixos` (`--sem-formularios` desliga); o espelho `questoes_publicas` é
  atualizado pelo gatilho a cada item enviado;
- no fim, conta os itens por Step na tabela. Código de saída: 0 sem problemas; 1 com item
  inválido ou falha de envio (`--ignorar-invalidos` devolve 0 mesmo com inválidos); 2 com
  uso errado ou sem as variáveis de ambiente. Credencial passada como opção na linha de
  comando é recusada.

## Modo de desenvolvimento com o banco completo

O modo demonstração (sem `anki/config.js`) lê os 80 itens públicos. Para testar as telas
com o banco completo no seu computador, gere o manifesto e sirva a raiz do repositório:

```bash
node tools/importar-banco.mjs --dry-run --gerar-manifest   # grava banco-privado/manifest.json (com formularios.json, se houver)
python3 -m http.server 8080                                # e abra uma página com ?banco=completo
# por exemplo http://localhost:8080/simulado/?banco=completo
```

Com `?banco=completo` numa página servida em `localhost`, `lerBancoDemo()` lê
`banco-privado/manifest.json`, os arquivos listados nele e os blueprints (para completar
disciplinas e tópicos). A escolha fica guardada no navegador; `?banco=publico` volta aos 80
itens públicos. Fora de `localhost` o banco completo nunca é procurado, e no GitHub Pages a
pasta nem existe (está no `.gitignore`).

## Testes

```bash
node --test plataforma/tests/*.test.mjs      # inclui recuperação de parâmetros do Rasch, calibração da P(acima do limiar), sensibilidade do padrão, ligação com a NBME e cobertura do intervalo dos desfechos
createdb r2a && psql -d r2a -f supabase/teste-local/01-simula-supabase.sql -f supabase/schema.sql -f supabase/teste-local/02-testa-rls.sql
node supabase/teste-local/04-compara-itens.mjs   # estatísticas de itens: banco de dados igual ao JavaScript
```
