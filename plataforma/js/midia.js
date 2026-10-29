/* Road to America | mídia do item (imagem, áudio e vídeo) para as telas do aluno, do
   relatório e da equipe. Só gera HTML; o clique de ampliar e de contraste é tratado
   por um ouvinte único no documento, instalado na primeira importação no navegador.
   Ícones usados: ph-magnifying-glass-plus ph-circle-half */
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (nome) => '<i class="ph ph-' + nome + '" aria-hidden="true"></i>';

/* Mídia do item (contrato: midia: [{ tipo, src, alt, legenda, licenca, fonte, credito,
   transcricao }]). Imagem com botões de ampliar (1x, 1,5x, 2x e 3x, com rolagem) e de
   contraste; áudio e vídeo com controles nativos e transcrição opcional. A licença e a
   fonte aparecem na legenda. */
export function htmlMidiaItem(midia) {
  const lista = (Array.isArray(midia) ? midia : []).filter((m) => m && m.src && /^(https?:|\.{0,2}\/|[a-z0-9_-]+\/)/i.test(m.src));
  if (!lista.length) return "";
  return '<div class="qmidia">' + lista.map((m, k) => {
    const cred = [m.credito || m.fonte, m.licenca].filter(Boolean).join(", ");
    const leg = (m.legenda ? '<span lang="en">' + e(m.legenda) + "</span> " : "") + (cred ? '<span class="qmidia__cred">' + e(cred) + "</span>" : "");
    let corpo = "";
    if (m.tipo === "imagem") {
      corpo = '<div class="qmidia__quadro" data-midia-quadro><img src="' + e(m.src) + '" alt="' + e(m.alt) + '" loading="lazy" decoding="async"></div>' +
        '<div class="qmidia__acoes"><button type="button" class="btn btn--ghost btn--sm" data-midia-zoom aria-label="Ampliar a imagem ' + (k + 1) + '">' + icon("magnifying-glass-plus") + "<span>Ampliar</span></button>" +
        '<button type="button" class="btn btn--ghost btn--sm" data-midia-contraste aria-pressed="false">' + icon("circle-half") + "<span>Contraste</span></button></div>";
    } else if (m.tipo === "audio") {
      corpo = '<audio controls preload="none" src="' + e(m.src) + '" aria-label="' + e(m.alt || "Áudio do item") + '"></audio>';
    } else if (m.tipo === "video") {
      corpo = '<video controls preload="metadata" src="' + e(m.src) + '" aria-label="' + e(m.alt || "Vídeo do item") + '"></video>';
    } else return "";
    const trans = m.transcricao && m.tipo !== "imagem" ? '<details class="qmidia__trans"><summary>Transcrição</summary><p lang="en">' + e(m.transcricao) + "</p></details>" : "";
    return '<figure class="qmidia__item qmidia__item--' + e(m.tipo) + '" data-zoom="1">' + corpo + (leg ? "<figcaption>" + leg + "</figcaption>" : "") + trans + "</figure>";
  }).join("") + "</div>";
}
const ZOOMS_MIDIA = [1, 1.5, 2, 3];
if (typeof document !== "undefined" && !globalThis.__r2aMidia) {
  globalThis.__r2aMidia = true;
  document.addEventListener("click", (ev) => {
    const z = ev.target.closest?.("[data-midia-zoom]");
    const c = ev.target.closest?.("[data-midia-contraste]");
    if (!z && !c) return;
    const fig = (z || c).closest(".qmidia__item");
    if (!fig) return;
    if (z) {
      const atual = Number(fig.dataset.zoom) || 1;
      const prox = ZOOMS_MIDIA[(ZOOMS_MIDIA.indexOf(atual) + 1) % ZOOMS_MIDIA.length];
      fig.dataset.zoom = String(prox);
      fig.style.setProperty("--zoom", String(prox));
      fig.classList.toggle("is-ampliada", prox > 1);
      const rot = z.querySelector("span");
      if (rot) rot.textContent = prox === ZOOMS_MIDIA[ZOOMS_MIDIA.length - 1] ? "Tamanho original" : "Ampliar (" + String(ZOOMS_MIDIA[(ZOOMS_MIDIA.indexOf(prox) + 1) % ZOOMS_MIDIA.length]).replace(".", ",") + "x)";
    }
    if (c) {
      const on = !fig.classList.contains("is-contraste");
      fig.classList.toggle("is-contraste", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    }
  });
}

