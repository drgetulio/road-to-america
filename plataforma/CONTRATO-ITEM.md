# Contrato do item do banco de questões

Formato de cada questão do banco Road to America (Step 1 e Step 2 CK). Os 80 itens públicos de demonstração em `simulado/data/` seguem a versão anterior deste contrato; os campos novos são opcionais na leitura, e o carregador aplica os padrões indicados.

```json
{
  "id": "R2A-S1-0001",
  "spec_id": "S1-0001",
  "step": "step1",
  "versao": 1,
  "vinheta": "Caso clínico em inglês, estilo NBME.",
  "pergunta": "Which of the following is the most likely ...?",
  "alternativas": [{ "letra": "A", "texto": "..." }],
  "correta": "C",
  "explicacao": "Inglês: por que a correta está certa e por que cada distrator está errado.",
  "explicacoes_alternativas": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
  "objetivo_educacional": "Uma frase em inglês com o que o item ensina.",
  "explicacao_pt": "Resumo em português, de 2 a 4 frases, sem travessões.",
  "sistema": "cardiovascular",
  "disciplina": "patologia",
  "area": "medicina_interna",
  "tarefa": "manejo",
  "subarea": "",
  "competencia": "applying_foundational_science",
  "topico": "Myocardial infarction",
  "conceito_testado": "Histologic timeline of myocardial infarction at 3 to 7 days",
  "dificuldade": "media",
  "angoff": 0.62,
  "alto_rendimento": true,
  "tags": ["step1"],
  "fonte": "Referência-padrão ou diretriz com ano.",
  "valores_lab": ["Potassium, serum"],
  "tabela": { "titulo": "Laboratory studies", "linhas": [["Hemoglobin", "9.1 g/dL"]] },
  "midia": [{ "tipo": "imagem", "src": "midia/R2A-S1-0001-ecg.png", "alt": "Traçado de ECG de 12 derivações em ritmo sinusal", "legenda": "Electrocardiogram", "licenca": "CC BY 4.0", "fonte": "Acervo próprio da Road to America", "credito": "", "transcricao": "" }],
  "inimigos": ["R2A-S1-0181"],
  "revisao": { "verificado": false, "tipo": "automatizada", "revisor": "revisão automatizada (modelo de IA)", "data": "2026-10-29", "decisao": "", "notas": "" }
}
```

Regras:

- Step 1 usa `sistema` e `disciplina`; Step 2 CK usa `area`, `tarefa` e `sistema`.
- `angoff`: **dificuldade-alvo** do item, de 0 a 1: a probabilidade de o examinando no limiar acertá-lo, fixada pelos autores na especificação do blueprint, com pequeno ajuste depois da redação. O nome do campo continua `angoff` por compatibilidade, mas o valor **não é** o julgamento de um painel de juízes e as telas dizem "dificuldade-alvo" e "padrão provisório". O Angoff de fato vem do painel (`plataforma/js/angoff.js`): com pelo menos 10 juízes no item e erro-padrão do corte abaixo de 0,02, o valor publicado vai para as colunas `angoff_painel`, `angoff_painel_juizes` e `angoff_painel_ep` e substitui a dificuldade-alvo na estimativa (`angoff_origem: "painel"`). Quando `angoff` falta, o carregador usa 0,80 (fácil), 0,65 (média) ou 0,45 (difícil).
- `alternativas`: de 5 a 8, homogêneas, com uma única melhor resposta.
- `valores_lab`: nomes que existem em `simulado/data/valores-laboratoriais.json`. Cada nome é único na tabela; exame que existe em mais de um material leva o material no nome (`Glucose, serum` e `Glucose, CSF`; `Calcium, urine`; `Proteins, total, CSF`). Os nomes antigos sem material ainda resolvem, com aviso quando são ambíguos. Valores fora da tabela oficial vêm na própria vinheta com a faixa de referência.
- `tabela`: opcional, para painéis laboratoriais exibidos como tabela.
- `midia`: opcional, lista de imagens, áudios ou vídeos que a prova mostraria (ECG, radiografia, TC, fotomicrografia, peça macroscópica, lesão de pele, esfregaço, Gram, ausculta). Cada elemento tem `tipo` (`imagem`, `audio` ou `video`), `src` (caminho relativo ou https), `alt` (obrigatório: descreve o que se vê sem dar o diagnóstico nem o achado interpretado), `licenca` e `fonte` (obrigatórios), e opcionalmente `legenda` (em inglês), `credito` e `transcricao` (áudio e vídeo). A vinheta não repete em texto o que a imagem mostra. A tela do bloco mostra a imagem com ampliação (1x a 3x) e ajuste de contraste; o relatório, a revisão e a ficha do item da equipe também. Item com mídia sem `alt`, `licenca` ou `fonte`, ou com endereço `javascript:`, não entra no banco.
- `inimigos`: opcional, identificadores de itens que não podem sair no mesmo bloco nem no mesmo formulário, fixo ou personalizado, que este (testam o mesmo ponto, ou um item entrega a resposta do outro, como R2A-S1-0143 e R2A-S1-0181). A plataforma lê o par nos dois sentidos (basta um lado); no banco privado o campo é gravado nos dois itens de cada par por `banco-privado/ferramentas/inimigos.mjs`, a partir da detecção por similaridade e das decisões em `ferramentas/decisoes-inimigos.json`. O sorteio do banco troca o segundo item do par; a montagem dos formulários fixos e personalizados nunca junta um par (`mapaInimigos` em `plataforma/js/formularios.js`), e um formulário gravado com par dentro é recusado.
- `topicos_nucleares` (Step 2 CK, banco privado): lista de identificadores de `banco-privado/topicos-nucleares-step2ck.json` que o item cobre de fato, marcada por leitura do item; lista vazia quando nenhum tópico da lista se aplica. A cobertura dos temas centrais do Step 2 CK é contada por esse campo (`validar-banco.mjs`), não por expressão regular; item privado do Step 2 CK sem o campo, ou com identificador fora da lista, é problema grave na validação.
- `revisao`: proveniência da revisão. `tipo: "automatizada"` (ou revisor com "IA", "modelo", "Claude" e afins) é revisão feita pelo próprio sistema que escreveu o item: não conta como revisão médica, mesmo com `verificado: true`, e não se chama "independente". Revisão médica exige `verificado: true`, `revisor` com o nome do médico, `data` e, de preferência, `decisao` (aprovado, aprovado com ajustes, reprovado). O carregador deriva `revisao_tipo` (`medica`, `automatizada` ou `nenhuma`) e o relatório de validação avisa o que falta.
- O banco completo não fica no repositório público. Ele é importado para o Supabase (tabela `questoes`, leitura só para alunos autenticados) com a ferramenta de importação; no modo demonstração o app usa apenas os itens públicos de `simulado/data/`.
