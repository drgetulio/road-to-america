# Road to America

Página de vendas da turma fundadora de preparação para o USMLE Step 1 e Step 2 CK, com a ferramenta de verificação de elegibilidade da escola médica.

- `index.html`: página principal (oferta, elegibilidade, método com globo em Three.js, fundador e mentores, dúvidas, investimento, garantia e pré-inscrição).
- `verificar.html`: verificação guiada da escola no World Directory of Medical Schools (critério do USMLE e do ECFMG para escolas fora dos EUA).
- `privacidade.html`: Política de Privacidade (LGPD), linkada nos formulários e no rodapé.

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
