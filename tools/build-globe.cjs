/* Gera assets/js/globe-data.js: pontos de terra do globo, com Brasil e EUA marcados.
   Uso: node tools/build-globe.cjs <pasta node_modules com world-atlas, topojson-client e d3-geo>
   Formato: base64 de registros de 5 bytes (lat*100 int16, lon*100 int16, tipo uint8).
   Tipo: 0 = terra, 1 = Brasil, 2 = Estados Unidos. */
const path = require("path");
const fs = require("fs");
const NM = path.resolve(process.argv[2] || "node_modules");
const topo = require(path.join(NM, "topojson-client"));
const d3 = require(path.join(NM, "d3-geo"));
const world = require(path.join(NM, "world-atlas/countries-110m.json"));

const countries = topo.feature(world, world.objects.countries).features;
const land = topo.feature(world, world.objects.land);
const brazil = countries.find((f) => f.id === "076");
const usa = countries.find((f) => f.id === "840");

const N = 42000;
const golden = Math.PI * (3 - Math.sqrt(5));
const out = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = golden * i;
  const lat = (Math.asin(y) * 180) / Math.PI;
  let lon = ((Math.atan2(Math.sin(th) * r, Math.cos(th) * r) * 180) / Math.PI);
  if (lat < -60) continue; /* sem Antártida */
  const p = [lon, lat];
  if (!d3.geoContains(land, p)) continue;
  let type = 0;
  /* caixas aproximadas antes do teste exato, que é lento */
  if (lon > -75 && lon < -33 && lat > -35 && lat < 7 && d3.geoContains(brazil, p)) type = 1;
  else if (lat > 17 && lon < -65 && d3.geoContains(usa, p)) type = 2;
  out.push([Math.round(lat * 100), Math.round(lon * 100), type]);
}
const buf = Buffer.alloc(out.length * 5);
out.forEach(([la, lo, t], i) => {
  buf.writeInt16LE(la, i * 5);
  buf.writeInt16LE(lo, i * 5 + 2);
  buf.writeUInt8(t, i * 5 + 4);
});
const counts = out.reduce((a, r) => ((a[r[2]] = (a[r[2]] || 0) + 1), a), {});
const js = "/* Gerado por tools/build-globe.cjs a partir de world-atlas (Natural Earth, domínio público). */\n" +
  "window.R2A_GLOBE = \"" + buf.toString("base64") + "\";\n";
fs.writeFileSync(path.join(__dirname, "..", "assets", "js", "globe-data.js"), js);
console.log("pontos:", out.length, "por tipo:", counts, "bytes:", js.length);
