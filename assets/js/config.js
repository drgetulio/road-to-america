/* Configuração editável da Road to America.
   Altere aqui, sem mexer no restante do código. */
window.R2A_CONFIG = {
  /* Para onde os cadastros são enviados.
     Vazio = Netlify Forms (funciona sozinho quando o site é publicado na Netlify).
     Para outro destino, informe uma URL que aceite POST JSON
     (Formspree, Make, Zapier, RD Station via webhook, ActiveCampaign via webhook etc.). */
  leadEndpoint: "",

  /* WhatsApp de atendimento, só dígitos com DDI. Vazio = oculta o atalho. */
  whatsapp: "",

  /* Convite do grupo de WhatsApp da turma fundadora (https://chat.whatsapp.com/...).
     Aparece logo após a pré-inscrição. Vazio = a página avisa que o convite chega pelo WhatsApp. */
  grupoWhatsapp: "",

  /* Foto do fundador (opcional). Vazio = monograma com a inicial. */
  fotoFundador: "",

  /* Mentores. Cada item vira um cartão de embarque na seção de mentores.
     Enquanto a lista estiver vazia, aparecem três cartões reservados
     e o convite para receber os perfis completos pela pré-inscrição.
     Exemplo de item:
     { nome: "Dra. Fulana de Tal", foto: "assets/img/mentores/fulana.jpg",
       formacao: "Medicina, UFMG", atuacao: "Residência em Internal Medicine, Ohio",
       resultado: "Step 1 aprovado, Step 2 CK 252", destino: "Ohio" } */
  mentores: []
};
