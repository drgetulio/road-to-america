/* Road to America | menu da área do aluno, comum ao app de flashcards (anki/) e ao
   banco de questões (questoes/). Itens com "rota" são telas do app de flashcards;
   itens com "href" são páginas irmãs, com o mesmo login. As duas páginas ficam um
   nível abaixo da raiz, então os caminhos relativos valem nas duas. */
export const MENU = Object.freeze([
  { rota: "", rotulo: "Estudar", icone: "cards" },
  { rota: "criar", rotulo: "Criar card", icone: "plus-circle" },
  { rota: "cards", rotulo: "Cards", icone: "magnifying-glass" },
  { rota: "curadoria", rotulo: "Curadoria", icone: "seal-check", admin: true },
  { rota: "estatisticas", rotulo: "Estatísticas", icone: "chart-bar" },
  { rota: "progresso", rotulo: "Meu progresso", icone: "path" },
  { rota: "como-estudar", rotulo: "Como estudar", icone: "lightbulb" },
  { rota: "ajustes", rotulo: "Ajustes", icone: "gear-six" },
  /* páginas fora do app, com o mesmo login */
  { href: "../questoes/", rotulo: "Questões", icone: "list-checks", pagina: "questoes" },
  { href: "../simulado/", rotulo: "Simulado", icone: "clock", pagina: "simulado" },
  { href: "../conteudo-step1.html", rotulo: "Conteúdo do Step 1", icone: "signpost" },
  { href: "../admin/", rotulo: "Rendimento", icone: "users-three", admin: true }
]);

/* HTML dos itens do menu.
   pagina: "anki" (dentro do app de flashcards) ou o nome da página irmã atual.
   rotaAtual: rota do app de flashcards aberta (só quando pagina = "anki"). */
export function itensMenu({ admin = false, pagina = "anki", rotaAtual = "", e, icon }) {
  const itens = MENU.filter((m) => !m.admin || admin);
  const html = itens.map((m) => {
    const fora = !!m.href;
    const href = fora ? m.href : (pagina === "anki" ? "#/" : "../anki/#/") + m.rota;
    const atual = fora ? m.pagina === pagina : pagina === "anki" && m.rota === rotaAtual;
    return '<li' + (fora ? ' class="app-links__fora"' : "") + '><a href="' + href + '"' + (atual ? ' aria-current="page"' : "") + ">" + icon(m.icone) + "<span>" + e(m.rotulo) + "</span>" +
      (m.rota === "curadoria" ? '<span class="nav-badge" data-badge-curadoria hidden></span>' : "") + "</a></li>";
  }).join("");
  return { html, n: itens.length };
}
