/* Road to America | carregador do banco de questões (Step 1 e Step 2 CK).

   O que faz:
   - lê os itens: no modo Supabase, da tabela questoes (a RLS só entrega itens
     ativos a participantes com matrícula ativa e a administradores); no modo
     demonstração, os 80 itens públicos de simulado/data/ e, se o servidor local
     servir banco-privado/manifest.json (só em desenvolvimento), o banco completo;
   - normaliza cada item para o contrato (plataforma/CONTRATO-ITEM.md), aplicando os
     padrões de Angoff (fácil 0,80, média 0,65, difícil 0,45) e convertendo os itens
     públicos da versão anterior do contrato;
   - valida (erros tiram o item do banco; avisos ficam no relatório);
   - indexa por step, sistema, disciplina, área, tarefa, competência e dificuldade.

   Funções puras, sem DOM. A única entrada e saída é fetch (no modo demonstração) e
   store.listQuestoes() (nos dois modos). Interface em plataforma/INTERFACE.md. */

export const STEPS_BANCO = Object.freeze(["step1", "step2ck"]);
export const DIFICULDADES = Object.freeze(["facil", "media", "dificil"]);
export const STATUS_QUESTAO = Object.freeze(["ativo", "rascunho", "suspenso", "aposentado"]);

/* Probabilidade de acerto do examinando no limiar quando o item não traz "angoff"
   (CONTRATO-ITEM.md; método em PSICOMETRIA.md) */
export const ANGOFF_PADRAO = Object.freeze({ facil: 0.8, media: 0.65, dificil: 0.45 });

const FONTE_S1 = "https://www.usmle.org/step-exams/step-1 (Step 1 Exam Content; outline revisado em 29/01/2024; consulta em 28/10/2026)";
const FONTE_CK = "https://www.usmle.org/step-exams/step-2-ck (Step 2 CK Exam Content e relatórios de nota de 2025 e 2026; consulta em 28/10/2026)";

/* Faixas oficiais em % de itens por prova. "multirrotulo: true" quer dizer que,
   no outline oficial, um item pode contar em mais de uma linha (a soma passa de
   100%); como cada item do banco tem um rótulo só, essas faixas servem de alvo
   relativo e não são exigidas na montagem. As faixas de sistema e de competência
   somam perto de 100% e são exigidas. */
const k = (chave, nome, nome_en, faixa, extra = {}) => Object.freeze({ chave, nome, nome_en, faixa: faixa ? Object.freeze(faixa) : null, ...extra });

export const TAXONOMIA = Object.freeze({
  step1: Object.freeze({
    sistema: Object.freeze({
      fonte: FONTE_S1, multirrotulo: false, exigir_faixa: true,
      chaves: Object.freeze([
        k("desenvolvimento_humano", "Desenvolvimento humano", "Human Development", [1, 3]),
        k("sangue_imune", "Sangue e sistemas linforreticular e imune", "Blood & Lymphoreticular/Immune Systems", [9, 13]),
        k("comportamento_nervoso", "Saúde comportamental, sistema nervoso e órgãos dos sentidos", "Behavioral Health & Nervous Systems/Special Senses", [10, 14]),
        k("musculoesqueletico_pele", "Sistema musculoesquelético, pele e tecido subcutâneo", "Musculoskeletal, Skin & Subcutaneous Tissue", [8, 12]),
        k("cardiovascular", "Sistema cardiovascular", "Cardiovascular System", [7, 11]),
        k("respiratorio_renal", "Sistemas respiratório e renal/urinário", "Respiratory & Renal/Urinary Systems", [11, 15]),
        k("gastrointestinal", "Sistema gastrointestinal", "Gastrointestinal System", [6, 10]),
        k("reprodutor_endocrino", "Sistemas reprodutor e endócrino", "Reproductive & Endocrine Systems", [12, 16]),
        k("multissistemico", "Processos e doenças multissistêmicos", "Multisystem Processes & Disorders", [8, 12]),
        k("bioestatistica", "Bioestatística, epidemiologia e saúde populacional", "Biostatistics & Epidemiology/Population Health", [4, 6]),
        k("ciencias_sociais", "Ciências sociais: comunicação e habilidades interpessoais", "Social Sciences: Communication and Interpersonal Skills", [6, 9])
      ])
    }),
    disciplina: Object.freeze({
      fonte: FONTE_S1, multirrotulo: true, exigir_faixa: false,
      chaves: Object.freeze([
        k("patologia", "Patologia", "Pathology", [45, 55]),
        k("fisiologia", "Fisiologia", "Physiology", [30, 40]),
        k("anatomia", "Anatomia macroscópica e embriologia", "Gross Anatomy & Embryology", [10, 20]),
        k("microbiologia", "Microbiologia", "Microbiology", [10, 20]),
        k("farmacologia", "Farmacologia", "Pharmacology", [10, 20]),
        k("comportamental", "Ciências do comportamento", "Behavioral Sciences", [10, 15]),
        k("bioquimica", "Bioquímica", "Biochemistry", [5, 15]),
        k("histologia", "Histologia e biologia celular", "Histology & Cell Biology", [5, 15]),
        k("imunologia", "Imunologia", "Immunology", [5, 15]),
        k("genetica", "Genética", "Genetics", [5, 10]),
        k("nutricao", "Nutrição", "Nutrition", null, { nota: "Linha recente (reforço de nutrição anunciado em 14/04/2026); faixa de 15 a 20% ainda não confirmada na página oficial." })
      ])
    }),
    competencia: Object.freeze({
      fonte: FONTE_S1, multirrotulo: false, exigir_faixa: true,
      chaves: Object.freeze([
        k("conhecimento_medico", "Conhecimento médico: aplicação de conceitos de ciência básica", "Medical Knowledge: Applying Foundational Science Concepts", [60, 70]),
        k("diagnostico", "Cuidado ao paciente: diagnóstico", "Patient Care: Diagnosis", [20, 25]),
        k("comunicacao_interpessoal", "Comunicação e habilidades interpessoais", "Communication and Interpersonal Skills", [6, 9]),
        k("aprendizagem_pratica", "Aprendizado e aprimoramento baseados na prática", "Practice-based Learning & Improvement", [4, 6])
      ])
    })
  }),
  step2ck: Object.freeze({
    sistema: Object.freeze({
      fonte: FONTE_CK, multirrotulo: false, exigir_faixa: true,
      chaves: Object.freeze([
        k("ciencias_sociais_etica_seguranca", "Ciências sociais: ética, profissionalismo, sistemas de saúde e segurança do paciente", "Social Sciences: Legal/Ethical Issues & Professionalism/Systems-based Practice & Patient Safety", [10, 15]),
        k("renal_urinario_reprodutor", "Sistemas renal, urinário e reprodutor", "Renal & Urinary System & Reproductive Systems", [7, 13]),
        k("cardiovascular", "Sistema cardiovascular", "Cardiovascular System", [6, 12]),
        k("musculoesqueletico_pele", "Sistema musculoesquelético, pele e tecido subcutâneo", "Musculoskeletal System/Skin & Subcutaneous Tissue", [6, 12]),
        k("saude_comportamental", "Saúde comportamental", "Behavioral Health", [5, 10]),
        k("sangue_imune", "Sangue e sistemas linforreticular e imune", "Blood & Lymphoreticular/Immune Systems", [5, 10]),
        k("gastrointestinal", "Sistema gastrointestinal", "Gastrointestinal System", [5, 10]),
        k("nervoso_sentidos", "Sistema nervoso e órgãos dos sentidos", "Nervous System & Special Senses", [5, 10]),
        k("respiratorio", "Sistema respiratório", "Respiratory System", [5, 10]),
        k("multissistemico", "Processos e doenças multissistêmicos", "Multisystem Processes & Disorders", [4, 8]),
        k("endocrino", "Sistema endócrino", "Endocrine System", [3, 7]),
        k("gestacao_parto_puerperio", "Gestação, parto e puerpério", "Pregnancy, Childbirth & the Puerperium", [3, 7]),
        k("bioestatistica_epidemiologia", "Bioestatística, epidemiologia e interpretação da literatura", "Biostatistics & Epidemiology/Population Health/Interpretation of the Medical Literature", [3, 5]),
        k("desenvolvimento_humano", "Desenvolvimento humano e cuidado do paciente saudável", "Human Development", [2, 4])
      ])
    }),
    /* Tarefas do médico (Physician Tasks/Competencies) do outline */
    competencia: Object.freeze({
      fonte: FONTE_CK, multirrotulo: false, exigir_faixa: true,
      chaves: Object.freeze([
        k("diagnostico", "Cuidado ao paciente: diagnóstico", "Patient Care: Diagnosis", [16, 20]),
        k("exames_laboratoriais_diagnosticos", "Cuidado ao paciente: exames laboratoriais e diagnósticos", "Patient Care: Laboratory/Diagnostic Studies", [13, 17]),
        k("manejo_misto", "Cuidado ao paciente: manejo misto", "Patient Care: Mixed Management", [12, 16]),
        k("farmacoterapia", "Cuidado ao paciente: farmacoterapia", "Patient Care: Pharmacotherapy", [8, 12]),
        k("intervencoes_clinicas", "Cuidado ao paciente: intervenções clínicas", "Patient Care: Clinical Interventions", [6, 10]),
        k("manutencao_saude_prevencao", "Cuidado ao paciente: manutenção da saúde e prevenção", "Patient Care: Health Maintenance/Disease Prevention", [5, 10]),
        k("prognostico_desfecho", "Cuidado ao paciente: prognóstico e desfecho", "Patient Care: Prognosis/Outcome", [5, 9]),
        k("pratica_sistemas_seguranca", "Prática baseada em sistemas e segurança do paciente", "Systems-based Practice & Patient Safety", [5, 7]),
        k("profissionalismo", "Profissionalismo", "Professionalism", [5, 7]),
        k("aprendizagem_baseada_pratica", "Aprendizado e aprimoramento baseados na prática", "Practice-based Learning & Improvement", [3, 5])
      ])
    }),
    /* Disciplinas clínicas do outline: um item pode ter mais de uma (a primeira é a principal) */
    disciplina_oficial: Object.freeze({
      fonte: FONTE_CK, multirrotulo: true, exigir_faixa: false, campo_multirrotulo: "disciplinas_oficiais",
      chaves: Object.freeze([
        k("medicina", "Medicina", "Medicine", [55, 65]),
        k("pediatria", "Pediatria", "Pediatrics", [17, 27]),
        k("ginecologia_obstetricia", "Ginecologia e obstetrícia", "Obstetrics & Gynecology", [10, 20]),
        k("psiquiatria", "Psiquiatria", "Psychiatry", [10, 15]),
        k("cirurgia", "Cirurgia", "Surgery", null, { nota: "Fontes oficiais divergem (20 a 30% no relatório de 2025, 5 a 15% no relatório-modelo de 2026); sem faixa até a conferência na página oficial." })
      ])
    }),
    /* Etiquetas do projeto, sem faixa oficial: área clínica e tarefa usadas no painel do aluno */
    area: Object.freeze({
      fonte: "Road to America (etiqueta do painel; sem faixa oficial)", multirrotulo: false, exigir_faixa: false,
      chaves: Object.freeze([
        k("medicina_interna", "Medicina interna", "Internal Medicine", null), k("pediatria", "Pediatria", "Pediatrics", null),
        k("cirurgia", "Cirurgia", "Surgery", null), k("ginecologia_obstetricia", "Ginecologia e obstetrícia", "Obstetrics & Gynecology", null),
        k("psiquiatria", "Psiquiatria", "Psychiatry", null), k("neurologia", "Neurologia", "Neurology", null),
        k("emergencia", "Emergência", "Emergency Medicine", null), k("medicina_preventiva", "Medicina preventiva", "Preventive Medicine", null),
        k("etica_comunicacao", "Ética e comunicação", "Ethics & Communication", null), k("bioestatistica", "Bioestatística", "Biostatistics", null)
      ])
    }),
    tarefa: Object.freeze({
      fonte: "Road to America (etiqueta do painel; sem faixa oficial)", multirrotulo: false, exigir_faixa: false,
      chaves: Object.freeze([
        k("manejo", "Manejo", "Management", null), k("diagnostico", "Diagnóstico", "Diagnosis", null),
        k("interpretacao_exames", "Interpretação de exames", "Test interpretation", null), k("etica", "Ética", "Ethics", null),
        k("prevencao", "Prevenção", "Prevention", null), k("prognostico", "Prognóstico", "Prognosis", null),
        k("mecanismo", "Mecanismo", "Mechanism", null)
      ])
    })
  })
});

/* Dimensões indexadas por Step (a primeira é a dimensão principal da montagem) */
export const DIMENSOES = Object.freeze({
  step1: Object.freeze(["sistema", "disciplina", "competencia", "dificuldade"]),
  step2ck: Object.freeze(["sistema", "competencia", "disciplina_oficial", "area", "tarefa", "dificuldade"])
});
/* Campo com a lista completa de rótulos das dimensões multirrótulo */
export const CAMPO_MULTIRROTULO = Object.freeze({ step1: Object.freeze({ disciplina: "disciplinas" }), step2ck: Object.freeze({ disciplina_oficial: "disciplinas_oficiais" }) });

/* Sinônimos aceitos na leitura (chaves já sem acento, minúsculas, com "_") */
const ALIASES = {
  step1: {
    sistema: {
      sangue: "sangue_imune", imune: "sangue_imune", hematologia: "sangue_imune", sangue_linforreticular_imune: "sangue_imune", imunologia: "sangue_imune",
      nervoso: "comportamento_nervoso", neuro: "comportamento_nervoso", neurologia: "comportamento_nervoso", saude_comportamental: "comportamento_nervoso", nervoso_comportamento: "comportamento_nervoso", comportamental: "comportamento_nervoso",
      musculoesqueletico: "musculoesqueletico_pele", pele: "musculoesqueletico_pele", dermatologia: "musculoesqueletico_pele",
      cardio: "cardiovascular", respiratorio: "respiratorio_renal", renal: "respiratorio_renal", renal_respiratorio: "respiratorio_renal",
      gi: "gastrointestinal", digestivo: "gastrointestinal",
      reprodutor: "reprodutor_endocrino", endocrino: "reprodutor_endocrino", endocrino_reprodutor: "reprodutor_endocrino",
      multissistema: "multissistemico", multissistemicos: "multissistemico",
      epidemiologia: "bioestatistica", bioestatistica_epidemiologia: "bioestatistica",
      comunicacao: "ciencias_sociais", etica: "ciencias_sociais", ciencias_sociais_comunicacao: "ciencias_sociais"
    },
    disciplina: {
      anatomia_embriologia: "anatomia", embriologia: "anatomia", anatomia_macroscopica: "anatomia",
      ciencias_comportamentais: "comportamental", comportamento: "comportamental", ciencias_do_comportamento: "comportamental",
      histologia_biologia_celular: "histologia", biologia_celular: "histologia",
      bioquimica_nutricao: "bioquimica", patologia_geral: "patologia", micro: "microbiologia", farmaco: "farmacologia"
    },
    competencia: {
      applying_foundational_science: "conhecimento_medico", medical_knowledge: "conhecimento_medico", foundational_science: "conhecimento_medico", applying_foundational_science_concepts: "conhecimento_medico",
      medical_knowledge_applying_foundational_science_concepts: "conhecimento_medico", aplicacao_ciencia_basica: "conhecimento_medico", conhecimento: "conhecimento_medico",
      patient_care_diagnosis: "diagnostico", patient_care: "diagnostico", diagnosis: "diagnostico", patient_care_diagnosis_history_physical_examination_diagnosis: "diagnostico",
      communication_interpersonal: "comunicacao_interpessoal", communication: "comunicacao_interpessoal", communication_and_interpersonal_skills: "comunicacao_interpessoal", comunicacao: "comunicacao_interpessoal",
      practice_based_learning: "aprendizagem_pratica", pbli: "aprendizagem_pratica", practice_based_learning_improvement: "aprendizagem_pratica", practice_based_learning_and_improvement: "aprendizagem_pratica", aprendizado_pratica: "aprendizagem_pratica"
    }
  },
  step2ck: {
    sistema: {
      ciencias_sociais: "ciencias_sociais_etica_seguranca", ciencias_sociais_etica: "ciencias_sociais_etica_seguranca", etica: "ciencias_sociais_etica_seguranca", social_sciences: "ciencias_sociais_etica_seguranca",
      renal: "renal_urinario_reprodutor", renal_urinario: "renal_urinario_reprodutor", renal_reprodutor: "renal_urinario_reprodutor", reprodutor: "renal_urinario_reprodutor",
      cardio: "cardiovascular", musculoesqueletico: "musculoesqueletico_pele", pele: "musculoesqueletico_pele",
      comportamental: "saude_comportamental", psiquiatria: "saude_comportamental", saude_mental: "saude_comportamental",
      sangue: "sangue_imune", imune: "sangue_imune", hematologia: "sangue_imune",
      gi: "gastrointestinal", nervoso: "nervoso_sentidos", neurologia: "nervoso_sentidos", sistema_nervoso: "nervoso_sentidos",
      pulmonar: "respiratorio", multissistema: "multissistemico", endocrinologia: "endocrino",
      gestacao: "gestacao_parto_puerperio", gravidez: "gestacao_parto_puerperio", gravidez_parto_puerperio: "gestacao_parto_puerperio", obstetricia: "gestacao_parto_puerperio",
      bioestatistica: "bioestatistica_epidemiologia", epidemiologia: "bioestatistica_epidemiologia", desenvolvimento: "desenvolvimento_humano"
    },
    competencia: {
      patient_care_diagnosis: "diagnostico", diagnosis: "diagnostico",
      exames_diagnosticos: "exames_laboratoriais_diagnosticos", laboratory_diagnostic_studies: "exames_laboratoriais_diagnosticos", patient_care_laboratory_diagnostic_studies: "exames_laboratoriais_diagnosticos", interpretacao_exames: "exames_laboratoriais_diagnosticos",
      manejo: "manejo_misto", mixed_management: "manejo_misto", patient_care_mixed_management: "manejo_misto",
      pharmacotherapy: "farmacoterapia", patient_care_pharmacotherapy: "farmacoterapia",
      clinical_interventions: "intervencoes_clinicas", patient_care_clinical_interventions: "intervencoes_clinicas",
      prevencao: "manutencao_saude_prevencao", health_maintenance_disease_prevention: "manutencao_saude_prevencao", patient_care_health_maintenance_disease_prevention: "manutencao_saude_prevencao",
      prognostico: "prognostico_desfecho", prognosis_outcome: "prognostico_desfecho", patient_care_prognosis_outcome: "prognostico_desfecho",
      sistemas_seguranca: "pratica_sistemas_seguranca", systems_based_practice_patient_safety: "pratica_sistemas_seguranca", systems_based_practice: "pratica_sistemas_seguranca",
      professionalism: "profissionalismo", etica: "profissionalismo",
      practice_based_learning: "aprendizagem_baseada_pratica", practice_based_learning_improvement: "aprendizagem_baseada_pratica", pratica_baseada_aprendizado: "aprendizagem_baseada_pratica", aprendizagem_pratica: "aprendizagem_baseada_pratica"
    },
    disciplina_oficial: {
      medicine: "medicina", medicina_interna: "medicina", clinica_medica: "medicina", internal_medicine: "medicina",
      pediatrics: "pediatria", surgery: "cirurgia", psychiatry: "psiquiatria",
      obstetrics_gynecology: "ginecologia_obstetricia", go: "ginecologia_obstetricia", obstetricia: "ginecologia_obstetricia", ginecologia: "ginecologia_obstetricia"
    },
    area: {
      clinica_medica: "medicina_interna", medicina: "medicina_interna", medicine: "medicina_interna",
      go: "ginecologia_obstetricia", obstetricia: "ginecologia_obstetricia", ginecologia: "ginecologia_obstetricia",
      cirurgia_geral: "cirurgia", surgery: "cirurgia", pediatrics: "pediatria", psychiatry: "psiquiatria"
    },
    tarefa: {
      tratamento: "manejo", management: "manejo", diagnosis: "diagnostico", exames: "interpretacao_exames", exames_diagnosticos: "interpretacao_exames",
      profissionalismo: "etica", ethics: "etica", rastreamento: "prevencao", prevention: "prevencao", ciencia_basica: "mecanismo"
    }
  }
};

const DIFICULDADE_ALIAS = { facil: "facil", easy: "facil", media: "media", medio: "media", medium: "media", moderada: "media", dificil: "dificil", hard: "dificil", alta: "dificil", baixa: "facil" };

/* Classificação dos 40 itens públicos do Step 2 CK (versão anterior do contrato,
   em que "sistema" guardava a área e "disciplina" a tarefa), feita por leitura de
   cada vinheta na preparação do blueprint do banco: s = sistema do outline,
   c = tarefa do médico (competência), d = disciplinas clínicas (a primeira é a
   principal). A área e a tarefa do projeto continuam as antigas. */
const LEGADO_CK = Object.freeze({
  "ck-001": { s: "endocrino", c: "farmacoterapia", d: ["medicina"] },
  "ck-002": { s: "renal_urinario_reprodutor", c: "farmacoterapia", d: ["medicina"] },
  "ck-003": { s: "endocrino", c: "exames_laboratoriais_diagnosticos", d: ["medicina"] },
  "ck-004": { s: "renal_urinario_reprodutor", c: "farmacoterapia", d: ["medicina"] },
  "ck-005": { s: "respiratorio", c: "exames_laboratoriais_diagnosticos", d: ["medicina"] },
  "ck-006": { s: "respiratorio", c: "farmacoterapia", d: ["medicina"] },
  "ck-007": { s: "gastrointestinal", c: "exames_laboratoriais_diagnosticos", d: ["medicina"] },
  "ck-008": { s: "sangue_imune", c: "diagnostico", d: ["medicina"] },
  "ck-009": { s: "respiratorio", c: "farmacoterapia", d: ["medicina"] },
  "ck-010": { s: "multissistemico", c: "diagnostico", d: ["medicina"] },
  "ck-011": { s: "respiratorio", c: "manutencao_saude_prevencao", d: ["medicina"] },
  "ck-012": { s: "ciencias_sociais_etica_seguranca", c: "profissionalismo", d: ["pediatria", "cirurgia"] },
  "ck-013": { s: "respiratorio", c: "intervencoes_clinicas", d: ["cirurgia", "medicina"] },
  "ck-014": { s: "gastrointestinal", c: "intervencoes_clinicas", d: ["cirurgia"] },
  "ck-015": { s: "gastrointestinal", c: "exames_laboratoriais_diagnosticos", d: ["cirurgia", "medicina"] },
  "ck-016": { s: "gastrointestinal", c: "intervencoes_clinicas", d: ["cirurgia", "medicina"] },
  "ck-017": { s: "multissistemico", c: "manejo_misto", d: ["pediatria"] },
  "ck-018": { s: "gastrointestinal", c: "exames_laboratoriais_diagnosticos", d: ["pediatria", "cirurgia"] },
  "ck-019": { s: "cardiovascular", c: "farmacoterapia", d: ["pediatria"] },
  "ck-020": { s: "desenvolvimento_humano", c: "manutencao_saude_prevencao", d: ["pediatria"] },
  "ck-021": { s: "saude_comportamental", c: "exames_laboratoriais_diagnosticos", d: ["pediatria"] },
  "ck-022": { s: "respiratorio", c: "farmacoterapia", d: ["pediatria"] },
  "ck-023": { s: "gestacao_parto_puerperio", c: "manejo_misto", d: ["ginecologia_obstetricia"] },
  "ck-024": { s: "gestacao_parto_puerperio", c: "intervencoes_clinicas", d: ["ginecologia_obstetricia"] },
  "ck-025": { s: "gestacao_parto_puerperio", c: "exames_laboratoriais_diagnosticos", d: ["ginecologia_obstetricia"] },
  "ck-026": { s: "gestacao_parto_puerperio", c: "manutencao_saude_prevencao", d: ["ginecologia_obstetricia"] },
  "ck-027": { s: "gestacao_parto_puerperio", c: "exames_laboratoriais_diagnosticos", d: ["ginecologia_obstetricia"] },
  "ck-028": { s: "saude_comportamental", c: "diagnostico", d: ["psiquiatria", "medicina"] },
  "ck-029": { s: "saude_comportamental", c: "intervencoes_clinicas", d: ["psiquiatria", "medicina"] },
  "ck-030": { s: "saude_comportamental", c: "diagnostico", d: ["psiquiatria"] },
  "ck-031": { s: "ciencias_sociais_etica_seguranca", c: "profissionalismo", d: ["psiquiatria"] },
  "ck-032": { s: "nervoso_sentidos", c: "manejo_misto", d: ["medicina"] },
  "ck-033": { s: "nervoso_sentidos", c: "exames_laboratoriais_diagnosticos", d: ["medicina", "cirurgia"] },
  "ck-034": { s: "multissistemico", c: "farmacoterapia", d: ["medicina", "psiquiatria"] },
  "ck-035": { s: "sangue_imune", c: "farmacoterapia", d: ["medicina"] },
  "ck-036": { s: "cardiovascular", c: "manutencao_saude_prevencao", d: ["medicina"] },
  "ck-037": { s: "desenvolvimento_humano", c: "manutencao_saude_prevencao", d: ["medicina"] },
  "ck-038": { s: "ciencias_sociais_etica_seguranca", c: "profissionalismo", d: ["pediatria"] },
  "ck-039": { s: "ciencias_sociais_etica_seguranca", c: "profissionalismo", d: ["medicina"] },
  "ck-040": { s: "bioestatistica_epidemiologia", c: "aprendizagem_baseada_pratica", d: ["medicina"] }
});

/* Disciplina clínica principal deduzida da área do projeto, quando o item não traz
   disciplinas_oficiais */
const DISCIPLINA_DA_AREA = Object.freeze({
  medicina_interna: "medicina", neurologia: "medicina", emergencia: "medicina", medicina_preventiva: "medicina",
  etica_comunicacao: "medicina", bioestatistica: "medicina", pediatria: "pediatria", cirurgia: "cirurgia",
  ginecologia_obstetricia: "ginecologia_obstetricia", psiquiatria: "psiquiatria"
});

/* Classificação adicional dos 40 itens públicos do Step 1 (competência e disciplinas
   secundárias), feita por leitura na preparação do blueprint do banco. */
const LEGADO_S1 = Object.freeze({
  "s1-001": { c: "diagnostico" }, "s1-004": { c: "conhecimento_medico", d2: ["nutricao"] }, "s1-006": { c: "diagnostico" },
  "s1-022": { c: "diagnostico" }, "s1-024": { c: "diagnostico", d2: ["nutricao"] }, "s1-032": { c: "conhecimento_medico", d2: ["nutricao"] },
  "s1-036": { c: "aprendizagem_pratica" }, "s1-037": { c: "aprendizagem_pratica" },
  "s1-038": { c: "comunicacao_interpessoal" }, "s1-039": { c: "comunicacao_interpessoal" }, "s1-040": { c: "comunicacao_interpessoal" }
});

const ID_VALIDO = /^[A-Za-z0-9._-]{1,40}$/;
const LEGADO_ID = /^(s1|ck)-\d{3}$/;
const TRAVESSAO = /[\u2014\u2013]/;

/* ---------- utilidades ---------- */
export function normalizarChave(v) {
  return String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
export function logit(p) { return Math.log(p / (1 - p)); }

/* Chaves oficiais de uma dimensão ("sistema", "disciplina", "area", "tarefa", "competencia") */
export function chavesDe(step, dim) {
  return (TAXONOMIA[step]?.[dim]?.chaves || []).map((x) => x.chave);
}
export function sistemasDoOutline(step) { return chavesDe(step, "sistema"); }

/* Chave canônica: aceita acentos, maiúsculas e os sinônimos de ALIASES.
   Devolve { chave, conhecida } (conhecida = está na taxonomia oficial) */
export function chaveCanonica(step, dim, valor) {
  const n = normalizarChave(valor);
  if (!n) return { chave: "", conhecida: false };
  const oficiais = chavesDe(step, dim);
  if (!oficiais.length) return { chave: n, conhecida: true };
  if (oficiais.includes(n)) return { chave: n, conhecida: true };
  const a = ALIASES[step]?.[dim]?.[n];
  if (a) return { chave: a, conhecida: true };
  /* último recurso: mesmas palavras, sem conectivos e em qualquer ordem
     ("obstetricia_e_ginecologia" = "ginecologia_obstetricia") */
  const tokens = (x) => x.split("_").filter((t) => t && !CONECTIVOS.has(t)).sort().join("_");
  const alvo = tokens(n);
  for (const c of oficiais) if (tokens(c) === alvo) return { chave: c, conhecida: true };
  for (const [al, c] of Object.entries(ALIASES[step]?.[dim] || {})) if (tokens(al) === alvo) return { chave: c, conhecida: true };
  return { chave: n, conhecida: false };
}
const CONECTIVOS = new Set(["e", "de", "do", "da", "dos", "das", "and", "of", "the", "sistema", "sistemas", "system", "systems"]);

/* Nome legível em português (cai na própria chave quando não conhece) */
export function nomeChave(step, dim, chave) {
  const x = (TAXONOMIA[step]?.[dim]?.chaves || []).find((c) => c.chave === chave);
  if (x) return x.nome;
  if (dim === "dificuldade") return { facil: "Fácil", media: "Média", dificil: "Difícil" }[chave] || chave;
  const t = String(chave || "").replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* FNV-1a de 32 bits em hexadecimal (assinatura determinística) */
export function hashTexto(s) {
  let h = 0x811c9dc5;
  const t = String(s);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
/* Assinatura do conjunto de itens (ids e versões): muda quando o banco muda */
export function assinaturaBanco(itens) {
  return hashTexto((itens || []).map((q) => q.id + "@" + (q.versao || 1)).sort().join("|"));
}

function texto(v) { return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim(); }

/* Competência do Step 1 quando o item não traz uma: tabela dos itens públicos ou,
   para itens novos sem o campo, regra pelo sistema e pela pergunta */
function competenciaStep1(item, sistema) {
  if (LEGADO_S1[item.id]) return LEGADO_S1[item.id].c;
  if (LEGADO_ID.test(item.id || "")) return "conhecimento_medico";
  if (sistema === "ciencias_sociais") return "comunicacao_interpessoal";
  if (sistema === "bioestatistica") return "aprendizagem_pratica";
  if (/most likely diagnosis|most appropriate next step in (diagnosis|evaluation)/i.test(item.pergunta || "")) return "diagnostico";
  return "conhecimento_medico";
}

/* ---------- normalização ----------
   Recebe o item bruto (contrato atual ou anterior) e devolve uma cópia no contrato
   atual, com os campos derivados:
     angoff_origem: "item" | "padrao_dificuldade"
     b_angoff: -logit(angoff)  (dificuldade de Rasch no limiar; PSICOMETRIA.md)
     legado: true para os itens públicos da versão anterior do contrato
     taxonomia_desconhecida: [dimensões cuja chave não está no outline] */
export function normalizarItem(bruto) {
  const q = bruto && typeof bruto === "object" ? bruto : {};
  const id = texto(q.id);
  let step = normalizarChave(q.step).replace(/^step_?2(_?ck)?$/, "step2ck").replace(/^step_?1$/, "step1");
  if (!step && /^R2A-CK-|^ck-/i.test(id)) step = "step2ck";
  if (!step && /^R2A-S1-|^s1-/i.test(id)) step = "step1";
  const legado = !q.spec_id && LEGADO_ID.test(id);
  const desconhecidas = [];
  const canon = (dim, v) => {
    if (v === undefined || v === null || v === "") return "";
    const c = chaveCanonica(step, dim, v);
    if (!c.conhecida) desconhecidas.push(dim);
    return c.chave;
  };

  let sistema = "", disciplina = "", area = "", tarefa = "";
  let ckLegado = null;
  if (step === "step2ck" && legado) {
    ckLegado = LEGADO_CK[id] || {};
    area = canon("area", q.sistema);
    sistema = ckLegado.s || "";
    tarefa = canon("tarefa", q.disciplina);
  } else if (step === "step2ck") {
    sistema = canon("sistema", q.sistema);
    area = canon("area", q.area);
    tarefa = canon("tarefa", q.tarefa);
  } else {
    sistema = canon("sistema", q.sistema);
    disciplina = canon("disciplina", q.disciplina);
  }

  const dificuldade = DIFICULDADE_ALIAS[normalizarChave(q.dificuldade)] || "";
  let angoff = Number(q.angoff);
  let angoff_origem = "item";
  if (q.angoff === undefined || q.angoff === null || q.angoff === "" || !Number.isFinite(angoff)) {
    angoff = ANGOFF_PADRAO[dificuldade] ?? ANGOFF_PADRAO.media;
    angoff_origem = "padrao_dificuldade";
  } else if (angoff >= 2 && angoff < 100) {
    angoff = angoff / 100; /* aceita percentual (62 vira 0,62) */
  }

  let competencia = "";
  if (step === "step1") competencia = q.competencia ? canon("competencia", q.competencia) : competenciaStep1(q, sistema);
  else competencia = ckLegado?.c || (q.competencia ? canon("competencia", q.competencia) : "");
  /* disciplinas secundárias (o outline conta um item em mais de uma disciplina) */
  const secBrutas = Array.isArray(q.disciplinas_secundarias) ? q.disciplinas_secundarias : (legado && LEGADO_S1[id]?.d2) || [];
  const disciplinas_secundarias = step === "step1" ? [...new Set(secBrutas.map((d) => chaveCanonica("step1", "disciplina", d).chave).filter((d) => d && d !== disciplina))] : [];
  /* Step 2 CK: disciplinas clínicas oficiais (a primeira é a principal) */
  let disciplinas_oficiais = [];
  if (step === "step2ck") {
    const brutas = ckLegado?.d || (Array.isArray(q.disciplinas_oficiais) ? q.disciplinas_oficiais : q.disciplina_oficial ? [q.disciplina_oficial] : []);
    disciplinas_oficiais = [...new Set(brutas.map((d) => chaveCanonica("step2ck", "disciplina_oficial", d).chave).filter(Boolean))];
    if (!disciplinas_oficiais.length && DISCIPLINA_DA_AREA[area]) disciplinas_oficiais = [DISCIPLINA_DA_AREA[area]];
  }

  const alternativas = (Array.isArray(q.alternativas) ? q.alternativas : []).map((a, i) => ({
    letra: texto(a?.letra || String.fromCharCode(65 + i)).toUpperCase(),
    texto: texto(a?.texto)
  }));
  const b_cal = Number(q.b_calibrado);
  const status = STATUS_QUESTAO.includes(q.status) ? q.status : "ativo";

  return {
    id,
    spec_id: texto(q.spec_id),
    step,
    versao: Number.isInteger(Number(q.versao)) && Number(q.versao) >= 1 ? Number(q.versao) : 1,
    status,
    vinheta: texto(q.vinheta),
    pergunta: texto(q.pergunta),
    alternativas,
    correta: texto(q.correta).toUpperCase(),
    explicacao: texto(q.explicacao),
    explicacoes_alternativas: q.explicacoes_alternativas && typeof q.explicacoes_alternativas === "object" ? { ...q.explicacoes_alternativas } : {},
    objetivo_educacional: texto(q.objetivo_educacional),
    explicacao_pt: texto(q.explicacao_pt),
    sistema,
    disciplina,
    disciplinas_secundarias,
    disciplinas: step === "step1" && disciplina ? [disciplina, ...disciplinas_secundarias] : [],
    disciplina_oficial: disciplinas_oficiais[0] || "",
    disciplinas_oficiais,
    area,
    tarefa,
    subarea: texto(q.subarea),
    competencia,
    topico: texto(q.topico),
    outline_topicos: Array.isArray(q.outline_topicos) ? q.outline_topicos.map(String) : [],
    tipo_lead_in: texto(q.tipo_lead_in),
    conceito_testado: texto(q.conceito_testado),
    dificuldade,
    angoff,
    angoff_origem,
    b_angoff: angoff > 0 && angoff < 1 ? -logit(angoff) : null,
    b_calibrado: q.b_calibrado !== undefined && q.b_calibrado !== null && Number.isFinite(b_cal) ? b_cal : null,
    ep_calibrado: Number.isFinite(Number(q.ep_calibrado)) && q.ep_calibrado !== null ? Number(q.ep_calibrado) : null,
    n_calibracao: Number.isInteger(Number(q.n_calibracao)) ? Number(q.n_calibracao) : 0,
    calibrado_em: q.calibrado_em || null,
    alto_rendimento: !!q.alto_rendimento,
    tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
    fonte: texto(q.fonte),
    valores_lab: Array.isArray(q.valores_lab) ? q.valores_lab.map(String) : [],
    tabela: q.tabela && typeof q.tabela === "object" ? q.tabela : null,
    revisao: q.revisao && typeof q.revisao === "object" ? { ...q.revisao } : { verificado: false, revisor: "", data: "", notas: "" },
    legado,
    taxonomia_desconhecida: [...new Set(desconhecidas)]
  };
}

/* Nomes da tabela de valores laboratoriais (simulado/data/valores-laboratoriais.json) */
export function nomesLaboratoriais(tabela) {
  const out = new Set();
  for (const s of tabela?.secoes || []) for (const it of s.itens || []) if (it?.nome) for (const v of variantesLab(it.nome)) out.add(v);
  return out;
}
/* "Potassium (K⁺)", "Potassium, serum" e "Potassium" contam como o mesmo nome */
function variantesLab(nome) {
  const semParenteses = String(nome).replace(/\([^)]*\)/g, " ");
  const semMaterial = semParenteses.replace(/,\s*(serum|plasma|blood|urine|whole blood|arterial)\s*$/i, "");
  return [...new Set([normalizarChave(nome), normalizarChave(semParenteses), normalizarChave(semMaterial)].filter(Boolean))];
}

/* ---------- validação ----------
   erros: o item não entra no banco. avisos: entra, mas aparece no relatório.
   labs: Set de nomes normalizados (nomesLaboratoriais), opcional. */
export function validarItem(item, { labs = null } = {}) {
  const q = item || {};
  const erros = [];
  const avisos = [];
  if (!ID_VALIDO.test(q.id || "")) erros.push("Identificador ausente ou inválido (use letras, números, ponto, hífen ou sublinhado, até 40).");
  if (!STEPS_BANCO.includes(q.step)) erros.push("Step inválido (use step1 ou step2ck).");
  if ((q.vinheta || "").length < 20) erros.push("Vinheta ausente ou curta demais.");
  if (!q.pergunta) erros.push("Pergunta (lead-in) ausente.");
  const alts = q.alternativas || [];
  if (alts.length < 5 || alts.length > 8) erros.push("O contrato pede de 5 a 8 alternativas; o item tem " + alts.length + ".");
  const letras = alts.map((a) => a.letra);
  const esperadas = alts.map((_, i) => String.fromCharCode(65 + i));
  if (letras.join("") !== esperadas.join("")) erros.push("As letras das alternativas precisam seguir A, B, C... sem repetição.");
  if (alts.some((a) => !a.texto)) erros.push("Há alternativa sem texto.");
  const textos = alts.map((a) => normalizarChave(a.texto));
  if (new Set(textos).size !== textos.length) erros.push("Há alternativas repetidas.");
  if (!letras.includes(q.correta)) erros.push("A resposta correta não está entre as alternativas.");
  if (!DIFICULDADES.includes(q.dificuldade)) erros.push("Dificuldade inválida (use facil, media ou dificil).");
  if (!(q.angoff > 0 && q.angoff < 1)) erros.push("Angoff precisa ser uma probabilidade entre 0 e 1.");
  else if (q.angoff < 0.1 || q.angoff > 0.97) avisos.push("Angoff extremo (" + q.angoff + "); confira a estimativa.");
  if (!q.sistema) erros.push("Sistema ausente.");
  if (q.step === "step1" && !q.disciplina) erros.push("Disciplina ausente (Step 1).");
  if (q.step === "step2ck" && !q.area) erros.push("Área clínica ausente (Step 2 CK).");
  if (q.step === "step2ck" && !q.competencia) erros.push("Tarefa do médico (competência do outline) ausente (Step 2 CK).");
  if (q.step === "step2ck" && !q.tarefa) avisos.push("Tarefa do projeto ausente (Step 2 CK).");
  if (q.step === "step1" && !q.competencia) erros.push("Competência ausente (Step 1).");
  for (const dim of q.taxonomia_desconhecida || []) avisos.push("Chave de " + dim + " fora do outline: " + q[dim] + ".");

  if (!q.explicacao) avisos.push("Explicação em inglês ausente.");
  if (!q.explicacao_pt) avisos.push("Resumo em português ausente.");
  if (!q.legado) {
    const faltam = letras.filter((l) => !texto(q.explicacoes_alternativas?.[l]));
    if (faltam.length) avisos.push("Sem explicação por alternativa em: " + faltam.join(", ") + ".");
    if (!q.objetivo_educacional) avisos.push("Objetivo educacional ausente.");
    if (!q.fonte) avisos.push("Fonte ausente.");
    if (!q.revisao?.verificado) avisos.push("Item ainda não verificado pelo revisor.");
    if (q.angoff_origem !== "item") avisos.push("Sem Angoff próprio; usado o padrão da dificuldade.");
  }
  if (TRAVESSAO.test(q.explicacao_pt || "")) avisos.push("Travessão ou meia-risca no resumo em português.");
  if (alts.some((a) => /\b(all|none) of the above\b/i.test(a.texto))) avisos.push("Alternativa do tipo 'all/none of the above' (regra do NBME).");
  if (/\b(EXCEPT|NOT|LEAST)\b/.test(q.pergunta || "")) avisos.push("Pergunta em forma negativa (regra do NBME).");
  if (labs && q.valores_lab?.length) {
    const fora = q.valores_lab.filter((n) => !variantesLab(n).some((v) => labs.has(v)));
    if (fora.length) avisos.push("Valores laboratoriais fora da tabela: " + fora.join("; ") + ".");
  }
  return { erros, avisos };
}

/* ---------- montagem do banco em memória ----------
   lista: itens brutos (qualquer versão do contrato).
   Devolve:
   {
     itens,                     // válidos e normalizados, ordenados por id
     porId: Map(id -> item),
     steps: { step1: [...], step2ck: [...] },
     indice: { step1: { sistema: { chave: [ids] }, disciplina, competencia, dificuldade },
               step2ck: { sistema, area, tarefa, competencia, dificuldade } },
     invalidos: [{ id, erros }], avisos: [{ id, avisos }], duplicados: [id],
     contagem: { step1: n, step2ck: n },
     reduzido: { step1: bool, step2ck: bool },   // abaixo do total de um formulário oficial
     assinatura,                // assinaturaBanco(itens)
     origem, fontes
   } */
export const ITENS_FORMULARIO_OFICIAL = Object.freeze({ step1: 280, step2ck: 318 });

export function montarBanco(lista, { origem = "desconhecida", fontes = [], labs = null, incluirInativos = false } = {}) {
  const porIdBruto = new Map();
  const duplicados = [];
  for (const b of Array.isArray(lista) ? lista : []) {
    const q = normalizarItem(b);
    const ant = porIdBruto.get(q.id);
    if (ant) {
      duplicados.push(q.id);
      if ((q.versao || 1) < (ant.versao || 1)) continue;
    }
    porIdBruto.set(q.id, q);
  }
  const itens = [];
  const invalidos = [];
  const avisos = [];
  for (const q of porIdBruto.values()) {
    const v = validarItem(q, { labs });
    if (v.erros.length) { invalidos.push({ id: q.id || "(sem id)", erros: v.erros }); continue; }
    if (v.avisos.length) avisos.push({ id: q.id, avisos: v.avisos });
    if (!incluirInativos && q.status !== "ativo") continue;
    itens.push(q);
  }
  itens.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const porId = new Map(itens.map((q) => [q.id, q]));
  const steps = { step1: itens.filter((q) => q.step === "step1"), step2ck: itens.filter((q) => q.step === "step2ck") };
  const indice = {};
  for (const step of STEPS_BANCO) {
    indice[step] = {};
    for (const dim of DIMENSOES[step]) {
      const m = {};
      for (const q of steps[step]) if (q[dim]) (m[q[dim]] ||= []).push(q.id);
      indice[step][dim] = m;
    }
  }
  return {
    itens, porId, steps, indice, invalidos, avisos,
    duplicados: [...new Set(duplicados)],
    contagem: { step1: steps.step1.length, step2ck: steps.step2ck.length },
    reduzido: { step1: steps.step1.length < ITENS_FORMULARIO_OFICIAL.step1, step2ck: steps.step2ck.length < ITENS_FORMULARIO_OFICIAL.step2ck },
    assinatura: assinaturaBanco(itens),
    origem,
    fontes
  };
}

/* Filtro por qualquer combinação de dimensões. Valores aceitam string ou lista.
   excluir: Set ou lista de ids. */
export function filtrarBanco(banco, { step = null, excluir = null, ...dims } = {}) {
  const ex = excluir ? new Set(excluir) : null;
  const base = step ? banco.steps[step] || [] : banco.itens;
  const conds = Object.entries(dims).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([d, v]) => [d, new Set(Array.isArray(v) ? v : [v])]);
  return base.filter((q) => (!ex || !ex.has(q.id)) && conds.every(([d, s]) => s.has(q[d])));
}

/* Contagem por chave de uma dimensão: { chave: n } */
export function contarPor(itens, dim) {
  const out = {};
  for (const q of itens || []) { const c = q?.[dim] || "_sem"; out[c] = (out[c] || 0) + 1; }
  return out;
}

/* ---------- blueprint ----------
   Completa cada item com o que a especificação de mesmo spec_id traz e o item não
   repete (disciplinas secundárias, disciplinas clínicas oficiais, competência,
   subárea, tópicos do outline, tipo de pergunta) e aponta divergências de
   classificação entre o item escrito e a especificação. O valor do item prevalece.
   blueprints: objetos de banco-privado/blueprint-*.json ({ step, itens: [spec] }). */
const CAMPOS_BLUEPRINT = ["sistema", "disciplina", "area", "tarefa", "competencia", "subarea", "tipo_lead_in", "topico", "conceito_testado"];
export function enriquecerComBlueprint(itens, blueprints) {
  const specs = new Map();
  for (const bp of blueprints || []) for (const sp of bp?.itens || []) if (sp?.spec_id) specs.set(sp.spec_id, sp);
  const divergencias = [];
  const out = (itens || []).map((q) => {
    const sp = q && specs.get(q.spec_id);
    if (!sp) return q;
    const r = { ...q };
    for (const c of CAMPOS_BLUEPRINT) {
      if (sp[c] === undefined || sp[c] === null || sp[c] === "") continue;
      if (r[c] === undefined || r[c] === null || r[c] === "") r[c] = sp[c];
      else if (["sistema", "disciplina", "area", "tarefa", "competencia"].includes(c) && normalizarChave(r[c]) !== normalizarChave(sp[c])) divergencias.push({ id: q.id, spec_id: q.spec_id, campo: c, item: r[c], blueprint: sp[c] });
    }
    if (!Array.isArray(r.disciplinas_secundarias) && Array.isArray(sp.disciplinas_secundarias)) r.disciplinas_secundarias = sp.disciplinas_secundarias.slice();
    if (!Array.isArray(r.disciplinas_oficiais) && Array.isArray(sp.disciplinas_oficiais)) r.disciplinas_oficiais = sp.disciplinas_oficiais.slice();
    if (!Array.isArray(r.outline_topicos)) r.outline_topicos = Array.isArray(sp.outline_topicos) ? sp.outline_topicos.slice() : sp.outline_ref ? [sp.outline_ref] : [];
    if (sp.nutricao === true && !(r.tags || []).includes("nutricao")) r.tags = [...(r.tags || []), "nutricao"];
    return r;
  });
  return { itens: out, divergencias, especificacoes: specs.size };
}

/* ---------- leitura no modo demonstração ----------
   base: URL da raiz do site (padrão: dois níveis acima deste arquivo).
   Lê os itens públicos e, com privado (padrão: bancoCompletoPedido()), também
   banco-privado/manifest.json e os arquivos que ele lista. Formato do manifesto:
     { "versao": "2026-10-29", "arquivos": ["step1/lote-01.json", ...],
       "blueprints": ["blueprint-step1.json", "blueprint-step2ck.json"] }
   (blueprints é opcional; quando vem, os itens são completados por
   enriquecerComBlueprint).
   Cada arquivo é um array de itens (ou { "itens": [...] }).
   Devolve { itens, fontes: [{ arquivo, n, ok, erro }], privado: bool }. */
/* O banco completo só é procurado em desenvolvimento, quando pedido: página servida
   em localhost com ?banco=completo (a escolha fica guardada no navegador; ?banco=publico
   desliga). Assim o site publicado não tenta ler banco-privado/ (e não registra 404). */
export function bancoCompletoPedido() {
  try {
    const loc = globalThis.location;
    if (!loc || !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)) return false;
    const q = new URLSearchParams(loc.search).get("banco");
    if (q === "completo") globalThis.localStorage?.setItem("r2a-banco-completo", "1");
    if (q === "publico") globalThis.localStorage?.removeItem("r2a-banco-completo");
    return globalThis.localStorage?.getItem("r2a-banco-completo") === "1";
  } catch { return false; }
}

export async function lerBancoDemo({ base = null, fetch: f = globalThis.fetch, privado = bancoCompletoPedido() } = {}) {
  const raiz = base ? new URL(base) : new URL("../../", import.meta.url);
  const fontes = [];
  const itens = [];
  const lerJson = async (rel) => {
    const r = await f(new URL(rel, raiz));
    if (!r || !r.ok) throw new Error("HTTP " + (r ? r.status : "sem resposta"));
    return r.json();
  };
  for (const arq of ["simulado/data/step1-questoes.json", "simulado/data/step2ck-questoes.json"]) {
    try {
      const d = await lerJson(arq);
      const l = Array.isArray(d) ? d : d?.itens || [];
      itens.push(...l);
      fontes.push({ arquivo: arq, n: l.length, ok: true, erro: "" });
    } catch (e) { fontes.push({ arquivo: arq, n: 0, ok: false, erro: String(e.message || e) }); }
  }
  let temPrivado = false;
  if (privado) {
    let manifesto = null;
    try { manifesto = await lerJson("banco-privado/manifest.json"); } catch { manifesto = null; }
    if (manifesto && Array.isArray(manifesto.arquivos)) {
      temPrivado = true;
      const seguro = (rel) => typeof rel === "string" && !rel.includes("..") && !rel.startsWith("/");
      for (const rel of manifesto.arquivos) {
        if (typeof rel !== "string" || rel.includes("..") || rel.startsWith("/")) { fontes.push({ arquivo: String(rel), n: 0, ok: false, erro: "Caminho recusado." }); continue; }
        const arq = "banco-privado/" + rel;
        try {
          const d = await lerJson(arq);
          const l = Array.isArray(d) ? d : d?.itens || [];
          itens.push(...l);
          fontes.push({ arquivo: arq, n: l.length, ok: true, erro: "" });
        } catch (e) { fontes.push({ arquivo: arq, n: 0, ok: false, erro: String(e.message || e) }); }
      }
      const bps = [];
      for (const rel of Array.isArray(manifesto.blueprints) ? manifesto.blueprints : []) {
        if (!seguro(rel)) continue;
        try { bps.push(await lerJson("banco-privado/" + rel)); fontes.push({ arquivo: "banco-privado/" + rel, n: 0, ok: true, erro: "" }); }
        catch (e) { fontes.push({ arquivo: "banco-privado/" + rel, n: 0, ok: false, erro: String(e.message || e) }); }
      }
      if (bps.length) {
        const r = enriquecerComBlueprint(itens, bps);
        return { itens: r.itens, fontes, privado: true, divergencias: r.divergencias };
      }
    }
  }
  return { itens, fontes, privado: temPrivado, divergencias: [] };
}

/* ---------- carregamento pela camada de dados ----------
   Nos dois modos chama store.listQuestoes() (LocalStore lê os arquivos com
   lerBancoDemo; SupabaseStore lê a tabela questoes, e a RLS decide o que volta).
   labsTabela: conteúdo de valores-laboratoriais.json, opcional (só para avisos). */
export async function carregarBanco({ store, step = null, labsTabela = null, incluirInativos = false } = {}) {
  if (!store || typeof store.listQuestoes !== "function") throw new Error("Camada de dados sem listQuestoes().");
  const lista = await store.listQuestoes({ step, incluirInativas: incluirInativos });
  const meta = store.ultimaLeituraQuestoes || {};
  const origem = store.mode === "supabase" ? "supabase" : meta.privado ? "demonstracao_completa" : "demonstracao";
  return montarBanco(lista, { origem, fontes: meta.fontes || [], labs: labsTabela ? nomesLaboratoriais(labsTabela) : null, incluirInativos });
}
