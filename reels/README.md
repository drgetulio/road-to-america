# Reels da Road to America

Dois conjuntos: os 20 reels do curso (`roteiros.json`, abaixo) e os 52 Reels semanais da Questão de Embarque (`../instagram/reels-semanais.json`, seção "Reels semanais" no fim).

Vinte reels verticais (1080x1920, 30 fps, 50 s, sem áudio) feitos com [Remotion](https://www.remotion.dev) a partir de `roteiros.json`. Os vídeos prontos ficam em `out/reel-XX.mp4` e as capas em `out/capas/reel-XX.jpg`.

## O que tem aqui

```
reels/
  roteiros.json          fonte única do texto (cenas, tempos, narração, legenda do post)
  src/
    Root.tsx             registra um reel e uma capa por roteiro (com schema zod)
    Reel.tsx             monta as cenas em TransitionSeries + marca, progresso e flash da virada
    Cena.tsx             liga cada tipo_visual a um componente
    direcao.ts           direção de arte de cada reel (paleta, textura, legenda, transições)
    segmentos.ts         converte cenas em segmentos (checklist, pilha e rota acumulam itens)
    texto.ts             leitura dos *destaques*, caixa alta e ajuste do tamanho da fonte
    componentes/         LegendaCinetica, NumeroGigante, Odometro, Contador, PlacaExit,
                         CartaoEmbarque, Carimbo, Checklist, ListaStack, Comparativo,
                         TelaApp, RotaBrasilEUA e MapaEUA (Mapas.tsx), CTAFinal e Comente
                         (CTA.tsx), MarcaR2A, BarraProgresso e Fita (Marca.tsx), Fundo
    transicoes.tsx       fade, slide, wipe e a "faixa de estrada" (transição própria)
  public/fonts           Barlow Condensed, Barlow e Overpass Mono (cópia de assets/fonts)
  public/img             foto do fundador usada no reel 18
  scripts/render.mjs     renderiza vídeos e capas
  scripts/quadros*.mjs   gera quadros PNG para revisão
  out/                   vídeos e capas (versionados)
```

## Como editar um roteiro

1. Abra `roteiros.json` e altere `texto_tela` da cena. Palavras entre `*asteriscos*` ganham destaque (amarelo, vermelho ou caixa colorida, conforme o reel).
2. `tipo_visual` escolhe o componente: `legenda_cinetica`, `numero_gigante`, `contador`, `carimbo`, `checklist`, `lista_stack`, `placa_exit`, `cartao_embarque`, `tela_app`, `globo_rota` ou `mapa_eua`.
3. Os tempos (`inicio_s`, `fim_s`) precisam cobrir 0 a 50 s sem buracos. A última cena termina em `duracao_s`; se não bater, o Studio e o render mostram erro.
4. Regras automáticas:
   - cenas seguidas de `checklist`, `lista_stack` ou `globo_rota` viram um bloco só, que acumula itens;
   - uma cena que começa com "Comente *PALAVRA*" vira a caixa de comentário, e a palavra aparece de novo no direct e no fechamento;
   - a última cena vira o CTA final (carimbo, ação e endereço do site);
   - a cena em `virada_s` recebe o fundo de contraste e um flash;
   - em `lista_stack`, se o primeiro item não tem número e os seguintes têm ("1. ..."), ele vira título da pilha.
5. Para mudar cor, textura de fundo ou estilo de legenda de um reel, edite `src/direcao.ts`. Lá também ficam as duas trocas pontuais para o componente `Comparativo` (reels 07 e 11), que usam as notas 218 e 248 já citadas nos roteiros.

Não há texto de tela fora do JSON, exceto rótulos fixos de marca ("ROAD TO AMERICA", "CARTÃO DE EMBARQUE", "BRA", "EUA", o endereço do site e "LINK NA BIO" ou "COMENTE PALAVRA" no fechamento).

## Pré-visualizar no Remotion Studio

```bash
cd reels
npm install          # só na primeira vez (Node 18 ou mais novo)
npm run studio       # abre o Studio no navegador
```

No Studio, cada reel aparece na pasta "Reels" e cada capa na pasta "Capas". Os campos do roteiro podem ser alterados no painel de props para testar, mas a fonte definitiva continua sendo `roteiros.json`.

Para conferir tipos: `npm run typecheck`.

## Renderizar

```bash
npm run render               # os 20 reels e as 20 capas
npm run render -- reel-07    # só um (ou vários: reel-01,reel-05)
CAPAS=0 npm run render       # sem capas
CONCORRENCIA=4 npm run render
```

Saída: H.264, CRF 20, yuv420p em faixa de vídeo (tv), sem trilha de áudio. Cada reel leva cerca de 1,5 min com concorrência 2 em 4 CPUs.

O script usa o Chromium já instalado em `/opt/pw-browsers/...` quando ele existe. Em outra máquina, defina `REMOTION_BROWSER=/caminho/do/chrome` ou não faça nada: sem esse caminho, o Remotion baixa o Chrome Headless Shell dele. `remotion.config.ts` (usado pelo Studio e pela CLI `npx remotion`) segue a mesma regra.

Para revisar quadros sem renderizar o vídeo inteiro:

```bash
node scripts/quadros.mjs /tmp/quadros reel-01 0.5,3,15,30,45,49
node scripts/quadros-cenas.mjs /tmp/cenas todos     # um quadro perto do fim de cada cena
```

## Publicar no Instagram

1. Envie `out/reel-XX.mp4` como Reel. O vídeo já está em 9:16 e respeita as zonas seguras (nada essencial nos 250 px de cima, nos 420 px de baixo nem nos 140 px da direita).
2. Em "Capa", escolha "Adicionar da galeria" e use `out/capas/reel-XX.jpg`. O título fica no centro, que é a parte que aparece na grade do perfil.
3. Áudio: os vídeos saem mudos. Adicione a trilha no próprio Instagram ou grave a narração do campo `narracao` de cada cena. Os roteiros pedem trilha original ou efeitos próprios, sem música de terceiros.
4. Legenda do post: copie `legenda_post` do roteiro (já traz a assinatura com CRM).
5. Antes de postar, confira `pendencias_antes_de_postar` no fim de `roteiros.json`. Resumo: os reels 06, 07 e 16 dependem do simulado gratuito publicado; os reels 05, 14, 18, 19 e 20 só podem ir ao ar com os mentores contratados e pelo menos dois perfis no site; o reel 18 precisa da validação do fundador; os CTAs de comentário (02, 03, 04, 08, 09, 10, 11, 14, 15) precisam da resposta automática no direct configurada.

## Versões

Todos os pacotes do Remotion estão fixados na mesma versão exata (`4.0.534`, publicada em 07/10/2026), com React 19.1.1, zod 4.5.4 e TypeScript 5.9.3. Ao atualizar, mude todos os `remotion` e `@remotion/*` juntos para a mesma versão.

## Licença do Remotion

O Remotion é gratuito para pessoas físicas e para empresas com até 3 funcionários. Acima disso, a empresa precisa de uma licença de empresa (Company License). Detalhes em <https://www.remotion.dev/license>.

As fontes (Barlow, Barlow Condensed e Overpass Mono) são OFL e vêm do próprio site.

## Reels semanais da Questão de Embarque

Um Reel por semana (52), de 15 a 30 segundos, publicado na sexta às 19h00 e ligado a uma questão de segunda a quarta da mesma semana. A fonte é `../instagram/reels-semanais.json`, gerado por `node ../instagram/ferramentas/gerar-reels-semanais.mjs` a partir dos dias já escritos; `src/semanais.ts` converte cada Reel no roteiro que `Reel.tsx` já usa.

- **Composições:** pasta "Semanais" do Studio (`semana-01` a `semana-52`) e "CapasSemanais" (`capa-semana-01`...).
- **Componentes novos:** `Alternativas` (as quatro opções em cartões, com barra de tempo, barras de resultado da enquete e a certa acendendo) e `Personagem` (o personagem fixo falando num balão; os avatares vêm de `src/avatares.ts`, gerado por `node scripts/gerar-avatares.mjs` a partir de `instagram/templates/lib/slides.mjs`, para o desenho ser igual ao do carrossel). O resto reaproveita legenda cinética, carimbo, checklist, caixa de "Comente" e fechamento.
- **Fechamento sem endereço:** a direção dos semanais liga `url: false`, então o fim mostra "Comente PALAVRA" e "resposta automática no direct", sem o endereço do site.
- **Render:** `npm run render:semanais -- semana-01,semana-06` grava `out/semanais/semana-NN.mp4` e `out/semanais/capas/semana-NN.jpg`. Sem argumento, renderiza as 52. Reels do formato Resultado só renderizam com os números da enquete preenchidos em `resultado` (ou `FORCAR=1`).
- **Quadros para revisão:** `node scripts/quadros.mjs /tmp/q semana-01 0.5,3,8,14,24`.
- **Áudio:** os vídeos saem mudos. Cada Reel traz a sugestão em `audio.sugestao` (voz própria, efeitos gravados no celular ou faixa da Biblioteca de Áudio Comercial do Instagram), sem música protegida embutida.
- **Amostras:** `out/semanais/semana-01.mp4` (POV, questão do dia 2, 25,5 s) e `out/semanais/semana-06.mp4` (o Macrô explica o macete do dia 36, 23,5 s).
