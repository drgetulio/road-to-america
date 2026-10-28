"""Gera o subconjunto de ícones Phosphor usados no site.

Uso: python3 tools/build-icons.py <caminho para node_modules/@phosphor-icons/web> [--app anki]
Requer: pip install fonttools brotli
Lê os nomes ph-* usados nos HTML e JS e grava assets/icons/ com CSS e woff2 mínimos.
Com --app anki, lê anki/ (HTML e js/) e grava o subconjunto próprio em anki/icons/.
"""
import pathlib
import re
import sys

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
PKG = pathlib.Path(sys.argv[1])
APP = sys.argv[sys.argv.index("--app") + 1] if "--app" in sys.argv else None
if APP:
    OUT = ROOT / APP / "icons"
    FONTES = list((ROOT / APP).glob("*.html")) + list((ROOT / APP / "js").rglob("*.js"))
else:
    OUT = ROOT / "assets" / "icons"
    FONTES = list(ROOT.glob("*.html")) + list((ROOT / "assets" / "js").glob("*.js"))
OUT.mkdir(parents=True, exist_ok=True)

used = set()
for f in FONTES:
    used.update(re.findall(r"ph-[a-z0-9-]+", f.read_text(encoding="utf-8")))
used.discard("ph-fill")

css_out = []
for weight, family, cls, fname in (
    ("regular", "Phosphor", "ph", "Phosphor"),
    ("fill", "Phosphor-Fill", "ph-fill", "Phosphor-Fill"),
):
    css = (PKG / "src" / weight / "style.css").read_text(encoding="utf-8")
    rules = dict(re.findall(r"\.%s\.(ph-[a-z0-9-]+):before\s*\{\s*content:\s*\"\\([0-9a-f]+)\";" % re.escape(cls), css))
    found = {n: rules[n] for n in sorted(used) if n in rules}
    missing = sorted(n for n in used if n not in rules and n not in ("ph-fill",))
    if missing:
        print(f"[{weight}] sem glifo: {', '.join(missing)}")
    if not found:
        continue
    font = f"{fname}.subset.woff2"
    subset.main([
        str(PKG / "src" / weight / f"{fname}.ttf"),
        "--unicodes=" + ",".join("U+" + c for c in found.values()),
        "--flavor=woff2",
        f"--output-file={OUT / font}",
        "--layout-features=*",
    ])
    css_out.append(
        f'@font-face {{ font-family: "{family}"; src: url("{font}") format("woff2"); '
        "font-weight: normal; font-style: normal; font-display: block; }\n"
        f'.{cls} {{ font-family: "{family}" !important; speak: never; font-style: normal; font-weight: normal; '
        "font-variant: normal; text-transform: none; line-height: 1; letter-spacing: 0; "
        "-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; display: inline-block; }\n"
    )
    for name, code in found.items():
        css_out.append(f'.{cls}.{name}:before {{ content: "\\{code}"; }}\n')

(OUT / "icons.css").write_text("/* Subconjunto gerado por tools/build-icons.py a partir de @phosphor-icons/web 2.1.1 (MIT) */\n" + "".join(css_out), encoding="utf-8")
print("ok:", OUT / "icons.css")
