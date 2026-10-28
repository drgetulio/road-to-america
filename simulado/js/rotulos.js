/* Road to America | simulado: rótulos em português das chaves dos bancos e ligação
   com os flashcards. Funções puras (sem DOM), usadas pela tela e pelos testes.

   Step 1: as chaves de "sistema" e "disciplina" são as mesmas do outline usado no
   app de flashcards (anki/data/taxonomia.json); os nomes abaixo repetem os de lá
   e são substituídos pelos da taxonomia quando ela carrega.
   Step 2 CK: "sistema" guarda a área clínica e "disciplina" guarda a tarefa
   (ROTULO_CAMPOS em plataforma/js/simulado.js). */

export const ROTULOS = {
  step1: {
    sistema: {
      desenvolvimento_humano: "Desenvolvimento humano",
      sangue_imune: "Sangue e sistemas linforreticular e imune",
      comportamento_nervoso: "Saúde comportamental, sistema nervoso e órgãos dos sentidos",
      musculoesqueletico_pele: "Sistema musculoesquelético, pele e tecido subcutâneo",
      cardiovascular: "Sistema cardiovascular",
      respiratorio_renal: "Sistemas respiratório e renal/urinário",
      gastrointestinal: "Sistema gastrointestinal",
      reprodutor_endocrino: "Sistemas reprodutor e endócrino",
      multissistemico: "Processos e doenças multissistêmicos",
      bioestatistica: "Bioestatística, epidemiologia e saúde populacional",
      ciencias_sociais: "Ciências sociais: comunicação e habilidades interpessoais",
      geral: "Conceitos transversais"
    },
    disciplina: {
      patologia: "Patologia",
      fisiologia: "Fisiologia",
      anatomia: "Anatomia macroscópica e embriologia",
      microbiologia: "Microbiologia",
      farmacologia: "Farmacologia",
      comportamental: "Ciências do comportamento",
      bioquimica: "Bioquímica e nutrição",
      histologia: "Histologia e biologia celular",
      imunologia: "Imunologia",
      genetica: "Genética",
      nutricao: "Nutrição"
    }
  },
  step2ck: {
    sistema: {
      medicina_interna: "Medicina interna",
      pediatria: "Pediatria",
      ginecologia_obstetricia: "Ginecologia e obstetrícia",
      cirurgia: "Cirurgia",
      psiquiatria: "Psiquiatria",
      neurologia: "Neurologia",
      emergencia: "Medicina de emergência",
      medicina_preventiva: "Medicina preventiva",
      etica_comunicacao: "Ética e comunicação",
      bioestatistica: "Bioestatística e epidemiologia"
    },
    disciplina: {
      diagnostico: "Diagnóstico",
      manejo: "Manejo e conduta",
      prevencao: "Prevenção e rastreamento",
      etica: "Ética e profissionalismo",
      mecanismo: "Mecanismo da doença"
    }
  }
};

export const ROTULO_DIFICULDADE = { facil: "Fácil", media: "Média", dificil: "Difícil" };

/* Troca os nomes do Step 1 pelos da taxonomia carregada (mantém os daqui se faltar) */
export function aplicarTaxonomia(tax) {
  if (!tax) return;
  for (const s of tax.sistemas || []) if (s.chave && s.nome_pt) ROTULOS.step1.sistema[s.chave] = s.nome_pt.replace(/\s*\(fora do outline.*\)$/i, "");
  for (const d of tax.disciplinas || []) if (d.chave && d.nome_pt) ROTULOS.step1.disciplina[d.chave] = d.nome_pt.replace(/\s*\(contada com.*\)$/i, "");
}

/* Nome legível de uma chave; chave desconhecida vira texto com espaços */
export function rotulo(step, campo, chave) {
  if (campo === "dificuldade") return ROTULO_DIFICULDADE[chave] || String(chave || "");
  const mapa = ROTULOS[step]?.[campo] || {};
  if (mapa[chave]) return mapa[chave];
  if (!chave || chave === "_sem_area") return "Sem classificação";
  const s = String(chave).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* Áreas do Step 2 CK que têm correspondência com sistemas do outline do Step 1,
   cujos cards existem no app. As demais áreas não recebem link. */
const CK_PARA_SISTEMA_STEP1 = {
  psiquiatria: "comportamento_nervoso",
  neurologia: "comportamento_nervoso",
  bioestatistica: "bioestatistica",
  medicina_preventiva: "bioestatistica",
  etica_comunicacao: "ciencias_sociais"
};

/* Link para treinar flashcards do mesmo sistema da questão. O app aceita
   #/estudar?sistema=...&modo=treino (anki/js/views/shared.js, filtroDeParams);
   o treino livre não altera a agenda do FSRS. Devolve null quando não há
   correspondência. base: caminho relativo até o app ("../anki/"). */
export function linkFlashcards(questao, base = "../anki/") {
  if (!questao) return null;
  let sistema = null;
  let aproximado = false;
  if (questao.step === "step1") sistema = questao.sistema && questao.sistema !== "_sem_area" ? questao.sistema : null;
  else if (questao.step === "step2ck") { sistema = CK_PARA_SISTEMA_STEP1[questao.sistema] || null; aproximado = true; }
  if (!sistema) return null;
  const p = new URLSearchParams({ sistema, modo: "treino" });
  return { href: base + "#/estudar?" + p.toString(), sistema, rotulo: rotulo("step1", "sistema", sistema), aproximado };
}
