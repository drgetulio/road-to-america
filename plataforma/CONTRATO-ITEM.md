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
  "revisao": { "verificado": true, "revisor": "", "data": "2026-10-29", "notas": "" }
}
```

Regras:

- Step 1 usa `sistema` e `disciplina`; Step 2 CK usa `area`, `tarefa` e `sistema`.
- `angoff`: probabilidade, de 0 a 1, de um examinando no limiar de aprovação acertar o item. Quando ausente, o carregador usa 0,80 (fácil), 0,65 (média) ou 0,45 (difícil).
- `alternativas`: de 5 a 8, homogêneas, com uma única melhor resposta.
- `valores_lab`: nomes que existem em `simulado/data/valores-laboratoriais.json`. Valores fora da tabela oficial vêm na própria vinheta com a faixa de referência.
- `tabela`: opcional, para painéis laboratoriais exibidos como tabela.
- O banco completo não fica no repositório público. Ele é importado para o Supabase (tabela `questoes`, leitura só para alunos autenticados) com a ferramenta de importação; no modo demonstração o app usa apenas os itens públicos de `simulado/data/`.
