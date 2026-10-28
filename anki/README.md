# Flashcards da Road to America

App de flashcards do USMLE Step 1 com repetição espaçada (FSRS), servido em
`https://drgetulio.github.io/road-to-america/anki/`. Site estático, sem etapa de build:
HTML, CSS e módulos ES. O link para o app fica no rodapé da página principal
("Área do aluno: flashcards").

## O que o app faz

- **Estudar**: sessão do dia com revisões vencidas e cards novos intercalados entre
  sistemas, limite diário de novos (padrão 20) e de revisões (padrão 200), irmãos de
  cloze em dias diferentes, frente primeiro e verso com "Mostrar resposta" (Espaço),
  botões Errei, Difícil, Bom e Fácil (teclas 1 a 4) com o próximo intervalo em cada um,
  desfazer (Z), sinalizar erro (S), editar (E), leech no 8º lapso (suspende, marca e
  sugere reescrita) e sessões filtradas por sistema, disciplina ou tag. No modo agenda
  entram só cards que já venciam; o treino livre não altera a agenda.
- **Criar card**: Básico ou Cloze, modelos de especialista em Step 1, prévia ao vivo,
  classificação obrigatória pelo outline oficial e verificador de qualidade baseado no
  princípio da informação mínima. O participante escolhe entre "só para mim" (estudável
  na hora) e "enviar para a comunidade" (vai para a curadoria).
- **Curadoria** (administradores): fila de revisão (aprovar, aprovar como oficial,
  editar e aprovar, rejeitar com comentário), sinalizações, promoção de cards da
  comunidade a oficiais, histórico de versões, importação TSV/CSV e exportação.
- **Cards**: busca, filtros (baralho, sistema, disciplina, status, tag, situação no
  estudo, leeches, suspensos), suspensão, edição dos próprios cards e exportação.
- **Estatísticas**: retenção real e desejada, previsão de 30 dias, mapa de dias de
  estudo e sequência, cards maduros e cobertura por sistema e disciplina comparada às
  faixas do outline.
- **Ajustes**: retenção desejada de 80% a 97% com simulação da carga pelo próprio FSRS,
  limites, data da prova, sistemas liberados para novos, passos, intervalo máximo,
  limiar de leech, parâmetros FSRS colados do Anki desktop, backup JSON e exportação
  para o Anki.
- **Como estudar**: dez práticas com evidência e referências.

## Estrutura

```
anki/
  index.html            página única (rotas por #/...)
  anki.css              estilos do app (usa ../assets/css/base.css e as fontes do site)
  config.js             { supabaseUrl, supabaseAnonKey }: vazio = modo demonstração
  icons/                subconjunto Phosphor do app (tools/build-icons.py --app anki)
  data/
    manifest.json       arquivos de cards iniciais lidos pelo app
    seed-a/b/c.json     cards iniciais (oficiais)
    seed-exemplo.json   amostra pequena usada só em testes (fora do manifesto)
    taxonomia.json      sistemas e disciplinas do outline com as faixas percentuais
  js/
    app.js              inicialização, estado global, rotas, tema e menu
    store-local.js      dados no localStorage (modo demonstração)
    store-supabase.js   dados no Supabase (mesma interface)
    permissions.js      regras de permissão (espelho das políticas do banco)
    scheduler.js        FSRS (ts-fsrs), fila do dia, sessão, leech, simulação de carga
    cards.js, cloze.js  modelo do card, validação, lacunas
    quality.js          verificador de qualidade
    tsv.js              exportação para o Anki, importação TSV/CSV, backup
    stats.js            estatísticas
    data.js             carga da taxonomia e dos cards iniciais
    ui.js, util.js      utilidades
    views/              telas (painel, estudo, editor, navegador, curadoria,
                        estatisticas, guia, ajustes, entrar)
  tests/                testes unitários (node:test)
  vendor/
    ts-fsrs.mjs                 ts-fsrs 5.4.2 (MIT), FSRS-6 com 21 parâmetros
    supabase.umd.js             @supabase/supabase-js 2.117.3 (MIT), carregado só no modo Supabase
    TS-FSRS-LICENSE.txt, SUPABASE-JS-LICENSE.txt
supabase/
  schema.sql            tabelas, gatilhos e RLS
  teste-local/          simulação do Supabase em Postgres puro e teste das políticas
```

## Modo demonstração

Com `config.js` vazio, os dados ficam só no navegador (localStorage). Um seletor no
topo, marcado como "Demonstração", troca entre Participante e Administrador para
mostrar as duas áreas. Os cards de `data/manifest.json` entram como oficiais.

## Ativar o Supabase (login por e-mail e banco)

1. Crie um projeto em https://supabase.com (plano gratuito serve para começar).
2. No painel do projeto, abra **SQL Editor**, cole o conteúdo de
   `supabase/schema.sql` e clique em **Run**. O script pode ser rodado de novo sem
   perder dados.
3. Em **Authentication > Sign In / Providers**, deixe o provedor **Email** ativo.
   Em **Authentication > URL Configuration**, defina **Site URL** como
   `https://drgetulio.github.io/road-to-america/anki/` e inclua o mesmo endereço em
   **Redirect URLs** (para testar localmente, acrescente `http://localhost:8000/anki/`).
4. Abra o app, entre com o seu e-mail e clique no link recebido. O primeiro acesso
   cria o perfil como participante.
5. Promova o primeiro administrador no SQL Editor (que roda como dono do banco):
   ```sql
   update public.profiles set papel = 'admin' where email = 'seu-email@exemplo.com';
   ```
   Depois disso, só um administrador consegue mudar o papel de alguém; o gatilho
   `profiles_guard` bloqueia a autopromoção.
6. Em **Project Settings > API**, copie a **Project URL** e a chave pública
   **anon** (ou "publishable") e cole em `anki/config.js`:
   ```js
   export default {
     supabaseUrl: "https://xxxxxxxx.supabase.co",
     supabaseAnonKey: "eyJhbGciOi..."
   };
   ```
   A chave anon é pública por desenho; quem protege os dados são as políticas RLS.
   Nunca coloque a chave `service_role` no site.
7. Entre como administrador e abra **Curadoria > Importar e exportar > Publicar cards
   iniciais no banco** para gravar os cards de `data/` como oficiais.

### Regras de acesso (resumo do schema.sql)

| | Participante | Administrador |
|---|---|---|
| Ler cards | aprovados (oficial e comunidade) e os próprios | todos |
| Criar | pessoal (estudável na hora, visível só para o autor) ou comunidade (entra em revisão) | qualquer baralho e status |
| Editar | só os próprios, nunca oficiais; editar card aprovado da comunidade devolve à revisão | todos |
| Aprovar, rejeitar, promover | não | sim |
| Estado FSRS, revlog, configurações | só os próprios | lê todos |
| Sinalizações | cria e vê as suas | vê e resolve todas |

O status `rascunho` de um card pessoal significa "não compartilhado"; ele é estudável
pelo autor. O gatilho `cards_guard` força autor, status e campos de revisão quando quem
grava é participante, e `cards_historico` registra cada versão em `card_historico`.
Para participantes, o id do card é sempre gerado pelo banco (prefixo `u-`), o que impede
ocupar de antemão o id de um card oficial que a curadoria ainda vai publicar, e o nome do
autor vem do perfil, o que impede assinar um card ou uma sinalização com o nome de outra
pessoa. O e-mail do perfil também não pode ser trocado pelo próprio participante.

### Testar o schema sem o Supabase

```bash
createdb r2a
psql -d r2a -f supabase/teste-local/01-simula-supabase.sql -f supabase/schema.sql -f supabase/teste-local/02-testa-rls.sql
```

## Formato dos cards iniciais

Cada arquivo listado em `data/manifest.json` é um array de objetos:

```json
{ "id": "r2a-cardiovascular-001", "tipo": "basico",
  "frente": "pergunta em inglês ou texto com {{c1::lacuna}}",
  "verso": "resposta curta (no cloze, vazio ou complemento)",
  "extra": "mecanismo em 1 a 3 frases",
  "nota_pt": "nota opcional em português",
  "sistema": "cardiovascular", "disciplina": "farmacologia",
  "tags": ["step1", "tema"], "rendimento": "alto",
  "fonte": "Katzung Basic & Clinical Pharmacology, 15th ed." }
```

As chaves de sistema e disciplina estão em `data/taxonomia.json`. Cards com chave
desconhecida, cloze malformado ou id repetido são ignorados, com aviso no console.
Arquivos ausentes também são ignorados.

## Exportar para o Anki desktop

O arquivo `.txt` traz os cabeçalhos `#separator:tab`, `#html:true`,
`#notetype column:1`, `#deck column:2`, `#tags column:5` e `#guid column:6`. No Anki
2.1.55 ou mais novo: Arquivo > Importar. O baralho fica em
`Road to America::Step 1::<sistema>` e as tags em `R2A::sistema::...`,
`R2A::disciplina::...` e `R2A::alto_rendimento`. O GUID estável faz uma nova importação
atualizar as notas em vez de duplicar.

## Testes

```bash
cd anki && node --test tests/*.test.mjs
```

Cobrem agendador e fila do dia, sessão e desfazer, verificador de qualidade, cloze,
exportação e importação TSV, permissões da camada local e estatísticas.

Para ver o app localmente: `python3 -m http.server 8000` na raiz do repositório e abra
`http://localhost:8000/anki/`.

## Atualizar as bibliotecas

```bash
npm i ts-fsrs@<versão> @supabase/supabase-js@<versão>
cp node_modules/ts-fsrs/dist/index.mjs anki/vendor/ts-fsrs.mjs
cp node_modules/@supabase/supabase-js/dist/umd/supabase.js anki/vendor/supabase.umd.js
```

Use só versões estáveis publicadas há pelo menos duas semanas e rode os testes depois.

## Limitações conhecidas

- O otimizador de parâmetros do FSRS não roda no navegador. Quem usa o Anki desktop
  pode otimizar lá uma vez por mês e colar os 21 números em Ajustes.
- O modo demonstração guarda tudo no navegador; limpar os dados do site apaga o
  progresso. Use o backup JSON.
- As faixas do outline mudam de tempos em tempos; confira `data/taxonomia.json` a cada
  turma.
