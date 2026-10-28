/* Road to America | entrada por link mágico (modo Supabase) */
import { $, e, icon, toast } from "../ui.js";

export default {
  titulo: "Entrar",
  async render(ctx, el) {
    if (ctx.user) { ctx.go("#/"); return; }
    el.innerHTML = '<div class="wrap section-sm login">' +
      '<div class="boarding boarding--login">' +
        '<div class="boarding__main">' +
          '<p class="boarding__top"><span>Check-in</span><span>R2A · Step 1</span></p>' +
          '<h1 class="display h2">Área do aluno</h1>' +
          '<p class="body">Digite o e-mail da sua matrícula. Enviamos um link de acesso, sem senha; ele vale por alguns minutos e abre o app neste navegador.</p>' +
          '<form data-login class="login__form" novalidate>' +
            '<div class="field"><label for="l-email">E-mail</label><input id="l-email" name="email" type="email" class="input" autocomplete="email" required aria-describedby="l-err"><p class="error" id="l-err" data-err></p></div>' +
            '<button class="btn btn--block" type="submit">' + icon("envelope-simple") + "Enviar link de acesso</button>" +
          "</form>" +
          '<p class="login__ok" data-ok hidden role="status"></p>' +
        "</div>" +
        '<div class="boarding__stub"><span>Portão</span><b>S1</b><span>Step 1</span></div>' +
      "</div></div>";
    const form = $("[data-login]", el);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = form.email.value.trim();
      const err = $("[data-err]", el);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = "Informe um e-mail válido."; form.email.setAttribute("aria-invalid", "true"); form.email.focus(); return; }
      err.textContent = "";
      form.email.removeAttribute("aria-invalid");
      const btn = form.querySelector("button");
      btn.disabled = true;
      try {
        await ctx.store.signIn(email);
        const ok = $("[data-ok]", el);
        ok.hidden = false;
        ok.innerHTML = icon("check-circle") + "<span>Link enviado para <b>" + e(email) + "</b>. Abra o e-mail neste aparelho e clique no link. Se não chegar em alguns minutos, confira o spam.</span>";
        form.hidden = true;
      } catch (er) {
        toast(er.message, "erro");
        btn.disabled = false;
      }
    });
  }
};
