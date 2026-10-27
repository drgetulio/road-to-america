# Road to America

Página de vendas da turma fundadora de preparação para o USMLE Step 1 e Step 2 CK, com a ferramenta de verificação de elegibilidade da escola médica.

- `index.html`: página principal (oferta, elegibilidade, método com globo em Three.js, fundador e mentores, dúvidas, investimento, garantia e pré-inscrição).
- `verificar.html`: verificação guiada da escola no World Directory of Medical Schools (critério do USMLE e do ECFMG para escolas fora dos EUA).

Site estático, sem etapa de build. Basta publicar a pasta em qualquer hospedagem (Netlify, Vercel, GitHub Pages, servidor próprio).

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
| `fotoFundador` | Foto do fundador. Vazio mostra o monograma. |
| `mentores` | Lista de mentores. Cada item vira um cartão de embarque. Vazio mostra três cartões reservados. |

Também revisar:

1. **Nome do fundador**: a página usa "Dr. Getúlio" em `index.html` (seção `#mentores`) e em `assets/js/landing.js`. Trocar pelo nome completo.
2. **Contrato da garantia**: a página descreve a garantia de três anos e cita o direito de arrependimento do CDC. O texto do contrato precisa ter as mesmas regras.
3. **Condições de pagamento**: a página diz apenas "à vista com desconto ou parcelado no cartão".

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
