/* Road to America | área administrativa: acesso negado (participante ou visitante) */
import { e, icon } from "../../../anki/js/ui.js";

export default {
  titulo: "Acesso restrito",
  async render(ctx, el) {
    const semLogin = !ctx.user;
    const demo = ctx.modo === "local";
    el.innerHTML = '<div class="wrap section-sm login">' +
      '<div class="boarding boarding--login bloqueio">' +
        '<div class="boarding__main">' +
          '<p class="boarding__top"><span>Acesso restrito</span><span>R2A · equipe</span></p>' +
          '<h1 class="display h2">Área da equipe</h1>' +
          (semLogin
            ? '<p class="body">Esta área mostra o rendimento dos participantes e é aberta só para administradores. Entre pela área do aluno com o e-mail da equipe e volte a esta página.</p>' +
              '<p class="bloqueio__acts"><a class="btn" href="../anki/#/entrar">' + icon("user-circle") + "Entrar pela área do aluno</a></p>"
            : '<p class="body">Você entrou como <b>' + e(ctx.user.nome || ctx.user.email || "participante") + "</b>, que não tem acesso a esta área. Ela mostra dados de outros participantes e fica restrita à equipe da Road to America.</p>" +
              '<p class="body">O seu próprio progresso, com o checklist da garantia, as autoavaliações NBME e os simulados, está na área do aluno.</p>' +
              '<p class="bloqueio__acts"><a class="btn" href="../anki/#/progresso">' + icon("path") + 'Ver meu progresso</a><a class="btn btn--ghost" href="../anki/#/">' + icon("cards") + "Ir para os flashcards</a></p>") +
          (demo && !semLogin ? '<p class="hint">' + icon("info") + " Na demonstração, troque o papel para Administrador no seletor do topo.</p>" : "") +
        "</div>" +
        '<div class="boarding__stub"><span>Portão</span><b>' + icon("lock-simple") + '</b><span>Equipe</span></div>' +
      "</div></div>";
  }
};
