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

  /* Fundador. Nome completo, CRM e RQE são exigidos pelo CFM (Res. 2.336/2023)
     quando o médico divulga especialidade em material público. */
  fundador: {
    nome: "",      /* ex.: "Dr. Getúlio Sobrenome". Vazio = "Dr. Getúlio" */
    crm: "CRM-DF 13610",
    rqe: "",       /* ex.: "Pediatria RQE 0000 · Medicina Esportiva RQE 0000" */
    lattes: "",    /* link do Currículo Lattes */
    foto: ""       /* caminho da foto; vazio = monograma */
  },

  /* Empresa responsável (aparece no rodapé e na Política de Privacidade). */
  empresa: { razao: "", cnpj: "", cidade: "Brasília/DF", email: "" },

  /* Oferta. Cada campo preenchido aparece no cartão de preço. */
  oferta: {
    pagamento: "", /* ex.: "R$ 12.000 à vista no Pix ou em até 12x de R$ 1.000 no cartão" */
    inicio: "",    /* ex.: "Fevereiro de 2027" */
    vagas: "",     /* ex.: "40" */
    aulas: "",     /* ex.: "Gravadas, liberadas toda segunda" */
    mentoria: ""   /* ex.: "Ao vivo, quinzenal, às 21h, com gravação" */
  },

  /* Amostras gratuitas, sem cadastro (botões nos blocos do Anki e da apostila). */
  amostras: { anki: "", apostila: "" },

  /* Mentores. Cada item vira um cartão de embarque na seção de mentores.
     Enquanto a lista estiver vazia, aparecem três cartões reservados
     e o convite para receber os perfis completos pela pré-inscrição.
     Exemplo de item:
     { nome: "Dra. Fulana de Tal", foto: "assets/img/mentores/fulana.jpg",
       formacao: "Medicina, UFMG", atuacao: "Residência em Internal Medicine, Ohio",
       resultado: "Step 1 aprovado, Step 2 CK 252", destino: "Ohio" } */
  mentores: []
};
