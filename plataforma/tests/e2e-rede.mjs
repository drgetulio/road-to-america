/* Road to America | rede nos testes de ponta a ponta (Playwright).
   O site usa imagens hospedadas numa CDN externa (cloudfront). Em ambientes de teste com
   a rede restrita, essas requisições falham ou ficam penduradas, e o percurso quebrava
   por um motivo que não é do app. Aqui:
   - toda imagem de outro domínio é atendida na hora com um PNG transparente de 1 x 1
     (o layout usa width e height do <img>, então nada muda de tamanho);
   - qualquer outra requisição externa segue normalmente;
   - os erros do app continuam valendo, e com mais rigor que antes: erro de console,
     exceção na página, requisição do próprio servidor que falhou e resposta 4xx ou 5xx
     do próprio servidor (salvo as que o teste declarar esperadas). Só a falha de
     carregamento de recurso externo é ignorada. */
export const PNG_VAZIO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const local = (url, base) => url.startsWith(base) || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:");

/* contexto: BrowserContext; base: "http://127.0.0.1:porta" */
export async function prepararRede(contexto, base) {
  await contexto.route("**/*", (route) => {
    const req = route.request();
    if (!local(req.url(), base) && req.resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/png", body: PNG_VAZIO });
    return route.continue();
  });
}

/* Liga os ouvintes de erro na página. esperados: lista de RegExp de URLs do próprio
   servidor cuja resposta 4xx é esperada (por exemplo, banco-privado/ ausente). */
export function vigiarErros(page, base, erros, { esperados = [] } = {}) {
  const esperado = (u) => esperados.some((re) => re.test(u));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const u = m.location()?.url || "";
    if (/Failed to load resource/.test(m.text()) && (!local(u, base) || esperado(u))) return;
    erros.push(m.text() + (u ? " (" + u + ")" : ""));
  });
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (!local(u, base) || esperado(u)) return;
    const motivo = r.failure()?.errorText || "";
    if (/ERR_ABORTED/.test(motivo)) return; /* navegação que cancelou a requisição anterior */
    erros.push("falha de rede no app: " + u + " " + motivo);
  });
  page.on("response", (r) => {
    const u = r.url();
    if (local(u, base) && r.status() >= 400 && !esperado(u)) erros.push("HTTP " + r.status() + " " + u);
  });
}
