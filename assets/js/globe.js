/* Road to America | globo em Three.js com a rota Brasília -> Nova York.
   O viajante avança uma saída de cada vez, conforme o médico lê as etapas do método.
   O Three.js só é carregado quando a seção se aproxima da tela. */

var host = document.querySelector("[data-globe]");
var stops = Array.prototype.slice.call(document.querySelectorAll("[data-stop]"));
var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var STOP_T = [0, 0.27, 0.5, 0.74, 1];

/* ---------- etapas: funciona mesmo sem WebGL ---------- */
function stepMargin() {
  if (!window.matchMedia("(max-width: 900px)").matches) return "-48% 0px -42% 0px";
  /* no celular, a faixa de leitura começa logo abaixo do globo fixo */
  var stage = document.querySelector(".journey__stage");
  var h = stage ? stage.getBoundingClientRect().height : 300;
  return "-" + Math.round(68 + h + 24) + "px 0px -30% 0px";
}
var target = 0;
var onStep = function () {};
function setStep(i) {
  stops.forEach(function (s, j) {
    s.classList.toggle("is-active", j === i);
    s.classList.toggle("is-done", j < i);
  });
  target = STOP_T[i] || 0;
  onStep(i);
}
if (stops.length) {
  setStep(0);
  if ("IntersectionObserver" in window) {
    var stepIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setStep(stops.indexOf(e.target));
      });
    }, { rootMargin: stepMargin() });
    stops.forEach(function (s) { stepIO.observe(s); });
  }
}

/* ---------- carregamento preguiçoso ---------- */
if (host) {
  if ("IntersectionObserver" in window) {
    var bootIO = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { bootIO.disconnect(); boot(); }
    }, { rootMargin: "700px 0px" });
    bootIO.observe(host);
  } else {
    boot();
  }
}

function fail() { if (host) host.classList.add("is-fallback"); }

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

async function boot() {
  var THREE;
  try {
    THREE = await import("../vendor/three.module.min.js");
  } catch (e) { fail(); return; }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (e) { fail(); return; }
  if (!renderer.getContext()) { fail(); return; }

  var D = Math.PI / 180;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.insertBefore(renderer.domElement, host.firstChild);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(0, 0, 3.35);
  var globe = new THREE.Group();
  scene.add(globe);

  function ll(lat, lon, r) {
    var phi = (90 - lat) * D, th = (lon + 180) * D;
    r = r || 1;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
  }
  function toLatLon(v) {
    var n = v.clone().normalize();
    var lat = Math.asin(n.y) / D;
    var th = Math.atan2(n.z, -n.x) / D;
    return { lat: lat, lon: th - 180 };
  }

  /* ---------- pontos de terra ---------- */
  var raw = atob(window.R2A_GLOBE || "");
  var count = Math.floor(raw.length / 5);
  var bytes = new Uint8Array(raw.length);
  for (var b = 0; b < raw.length; b++) bytes[b] = raw.charCodeAt(b);
  var view = new DataView(bytes.buffer);
  var pos = new Float32Array(count * 3);
  var kind = new Uint8Array(count);
  var lats = new Float32Array(count), lons = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    var la = view.getInt16(i * 5, true) / 100;
    var lo = view.getInt16(i * 5 + 2, true) / 100;
    kind[i] = view.getUint8(i * 5 + 4);
    lats[i] = la; lons[i] = lo;
    var v = ll(la, lo, 1.002);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
  }
  var colors = new Float32Array(count * 3);
  var alphas = new Float32Array(count);
  var sizes = new Float32Array(count);
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  var dotMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 1 } },
    vertexShader: [
      "attribute vec3 aColor; attribute float aAlpha; attribute float aSize;",
      "uniform float uScale; varying vec3 vColor; varying float vAlpha;",
      "void main() {",
      "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
      "  vec3 n = normalize((modelViewMatrix * vec4(position, 0.0)).xyz);",
      "  vAlpha = aAlpha * smoothstep(-0.02, 0.32, n.z);",
      "  vColor = aColor;",
      "  gl_PointSize = aSize * uScale / -mv.z;",
      "  gl_Position = projectionMatrix * mv;",
      "}"
    ].join("\n"),
    fragmentShader: [
      "varying vec3 vColor; varying float vAlpha;",
      "void main() {",
      "  float d = length(gl_PointCoord - 0.5);",
      "  if (d > 0.5 || vAlpha < 0.01) discard;",
      "  gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.36, d));",
      "}"
    ].join("\n")
  });
  var dots = new THREE.Points(geo, dotMat);
  dots.renderOrder = 1;
  globe.add(dots);

  /* ---------- oceano com borda suave ---------- */
  var oceanMat = new THREE.ShaderMaterial({
    uniforms: { uBase: { value: new THREE.Vector3() }, uRim: { value: new THREE.Vector3() }, uRimA: { value: 0.3 } },
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 uBase; uniform vec3 uRim; uniform float uRimA; varying vec3 vN; void main(){ float f = pow(1.0 - max(vN.z, 0.0), 3.2); gl_FragColor = vec4(mix(uBase, uRim, f * 0.32), 1.0); }"
  });
  var ocean = new THREE.Mesh(new THREE.SphereGeometry(0.995, 64, 48), oceanMat);
  ocean.renderOrder = -1;
  globe.add(ocean);

  /* ---------- rota ---------- */
  var A = ll(-15.79, -47.88), B = ll(40.71, -74.01);
  var pts = [];
  for (var k = 0; k <= 120; k++) {
    var t = k / 120;
    var q = new THREE.Vector3().copy(A).lerp(B, t).normalize();
    pts.push(q.multiplyScalar(1 + 0.2 * Math.sin(Math.PI * t)));
  }
  var curve = new THREE.CatmullRomCurve3(pts);
  var SEG = 240, RAD = 8;
  var tube = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, 0.0075, RAD, false), new THREE.MeshBasicMaterial({ color: 0xb0243a }));
  globe.add(tube);
  var dashGeo = new THREE.BufferGeometry().setFromPoints(curve.getSpacedPoints(240));
  var dashMat = new THREE.LineDashedMaterial({ color: 0x0d1a2b, dashSize: 0.028, gapSize: 0.02, transparent: true, opacity: 0.4 });
  var dash = new THREE.Line(dashGeo, dashMat);
  dash.computeLineDistances();
  globe.add(dash);

  /* marcos de cada saída */
  var markers = STOP_T.map(function (tt, idx) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(idx === 0 || idx === 4 ? 0.02 : 0.013, 16, 12), new THREE.MeshBasicMaterial({ color: 0x0d1a2b }));
    m.position.copy(curve.getPointAt(tt));
    globe.add(m);
    return m;
  });

  /* viajante e halo */
  var traveler = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf1c232 }));
  globe.add(traveler);
  var haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 128;
  var hx = haloCanvas.getContext("2d");
  var grad = hx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(241,194,50,0.85)");
  grad.addColorStop(0.35, "rgba(241,194,50,0.35)");
  grad.addColorStop(1, "rgba(241,194,50,0)");
  hx.fillStyle = grad;
  hx.fillRect(0, 0, 128, 128);
  var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloCanvas), transparent: true, depthWrite: false }));
  halo.scale.set(0.2, 0.2, 1);
  globe.add(halo);

  /* ---------- cores conforme o tema ---------- */
  var srgb = { r: 0, g: 0, b: 0 };
  function toSRGB(hex) { var c = new THREE.Color(hex), o = { r: 0, g: 0, b: 0 }; c.getRGB(o, THREE.SRGBColorSpace); return new THREE.Vector3(o.r, o.g, o.b); }
  function paint() {
    var ink = new THREE.Color(cssVar("--ink"));
    var red = new THREE.Color(cssVar("--red"));
    var verde = new THREE.Color(cssVar("--verde"));
    var amarelo = new THREE.Color(cssVar("--amarelo"));
    var navy = new THREE.Color(cssVar("--navy"));
    var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var blue = dark ? new THREE.Color("#5b8de0") : navy;
    for (var i = 0; i < count; i++) {
      var c = ink, a = dark ? 0.32 : 0.3, s = 13;
      var la = lats[i], lo = lons[i];
      if (kind[i] === 1) {
        /* bandeira do Brasil: losango amarelo e círculo azul sobre o verde */
        var dx = (lo + 52) / 15, dy = (la + 11) / 11;
        var r2 = (lo + 52) * (lo + 52) + (la + 11) * (la + 11);
        c = r2 < 30 ? blue : (Math.abs(dx) + Math.abs(dy) < 1 ? amarelo : verde);
        a = 0.95; s = 17;
      } else if (kind[i] === 2) {
        /* bandeira americana: cantão azul a noroeste e listras pela latitude */
        if (la > 40.5 && lo < -100 && lo > -125) c = blue;
        else c = Math.floor(la / 1.55) % 2 === 0 ? red : (dark ? new THREE.Color("#eef1ec") : new THREE.Color("#c9ced6"));
        a = 0.95; s = 17;
      }
      /* o shader recebe as cores em sRGB, sem conversão linear */
      c.getRGB(srgb, THREE.SRGBColorSpace);
      colors[i * 3] = srgb.r; colors[i * 3 + 1] = srgb.g; colors[i * 3 + 2] = srgb.b;
      alphas[i] = a; sizes[i] = s;
    }
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    oceanMat.uniforms.uBase.value = toSRGB(cssVar(dark ? "--paper-3" : "--paper"));
    oceanMat.uniforms.uRim.value = toSRGB(cssVar("--ink"));
    tube.material.color.copy(red);
    dashMat.color.copy(ink);
    dashMat.opacity = dark ? 0.5 : 0.4;
    paintMarkers();
    dirty = true;
  }
  function paintMarkers() {
    var ink = new THREE.Color(cssVar("--ink")), red = new THREE.Color(cssVar("--red"));
    markers.forEach(function (m, idx) { m.material.color.copy(STOP_T[idx] <= p + 0.001 ? red : ink); });
  }

  /* ---------- rótulos em HTML ---------- */
  var lblOrigem = host.querySelector('[data-label="origem"]');
  var lblDestino = host.querySelector('[data-label="destino"]');
  var lblSign = host.querySelector('[data-label="viajante"]');
  var signNum = lblSign ? lblSign.querySelector("b") : null;
  var tmp = new THREE.Vector3(), nrm = new THREE.Vector3();
  function place(el, worldPos, mode) {
    if (!el) return;
    tmp.copy(worldPos).applyMatrix4(globe.matrixWorld);
    nrm.copy(tmp).normalize();
    var facing = nrm.dot(new THREE.Vector3().copy(camera.position).normalize()) > 0.18;
    tmp.project(camera);
    var x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
    var align = mode === "below" ? "translate(-50%, 14px)" : mode === "right" ? "translate(16px, -115%)" : "translate(-50%, calc(-100% - 12px))";
    el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) " + align;
    el.style.opacity = facing ? "1" : "0";
  }

  /* ---------- estado e laço ---------- */
  var p = reduce ? target : 0;
  var W = 1, H = 1, dirty = true, visible = true, raf = 0, last = -1, stepIdx = 0;
  var rotX = 0, rotY = 0;
  function aim(force) {
    var travelerPos = curve.getPointAt(Math.min(Math.max(p, 0), 1));
    var mid = curve.getPointAt(0.5);
    var focus = mid.clone().lerp(travelerPos, 0.6);
    var f = toLatLon(focus);
    var dir = ll(f.lat, f.lon);
    var ty = -Math.atan2(dir.x, dir.z);
    var tx = (f.lat - 4) * D;
    if (force || reduce) { rotY = ty; rotX = tx; }
    else { var k = 1 - Math.exp(-16 / 200); rotY += (ty - rotY) * k; rotX += (tx - rotX) * k; }
    globe.rotation.set(rotX, rotY, 0);
    return travelerPos;
  }

  function resize() {
    var r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.position.z = W / H < 0.9 ? 4.6 : (W / H < 1.2 ? 4.25 : 3.9);
    camera.updateProjectionMatrix();
    dotMat.uniforms.uScale.value = renderer.getPixelRatio() * Math.min(W, H) / 620 * 1.35;
    dirty = true;
    kick();
  }

  var lastT = 0, lastChange = 0;
  function frame(time) {
    raf = 0;
    var dt = lastT ? Math.min(100, (time || 0) - lastT) : 16;
    lastT = time || 0;
    var moving = Math.abs(target - p) > 0.0005;
    if (moving) p = reduce ? target : p + (target - p) * (1 - Math.exp(-dt / 260));
    else p = target;
    var tp = aim(false);
    traveler.position.copy(tp);
    halo.position.copy(tp);
    var pulse = reduce ? 1 : 1 + 0.18 * Math.sin((time || 0) / 380);
    halo.scale.set(0.2 * pulse, 0.2 * pulse, 1);
    var segs = Math.round(Math.min(Math.max(p, 0), 1) * SEG);
    tube.geometry.setDrawRange(0, segs * RAD * 6);
    if (segs !== last) { paintMarkers(); last = segs; }
    globe.updateMatrixWorld();
    place(lblOrigem, A.clone().multiplyScalar(1.01), "below");
    place(lblDestino, B.clone().multiplyScalar(1.01), "above");
    place(lblSign, tp, "right");
    /* na chegada, a placa sai e o rótulo de destino assume a saída final */
    var arrived = p > 0.93;
    if (lblSign && arrived) lblSign.style.opacity = "0";
    if (lblDestino) lblDestino.textContent = arrived ? "Nova York, EXIT 05" : "Nova York";
    renderer.render(scene, camera);
    host.setAttribute("data-progress", p.toFixed(3));
    dirty = false;
    if (moving) lastChange = time || 0;
    /* o pulso do halo segue por alguns segundos depois de cada etapa e então o laço para */
    if (visible && (moving || (!reduce && (time || 0) - lastChange < 4000))) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && visible) { lastT = 0; lastChange = performance.now(); raf = requestAnimationFrame(frame); } }

  onStep = function (i) {
    stepIdx = i;
    if (signNum) signNum.textContent = String(i + 1).padStart(2, "0");
    kick();
  };
  onStep(stops.findIndex ? Math.max(0, stops.findIndex(function (s) { return s.classList.contains("is-active"); })) : 0);

  var visIO = new IntersectionObserver(function (es) {
    /* o observador pode entregar várias leituras de uma vez; vale a mais recente */
    visible = es[es.length - 1].isIntersecting;
    if (visible) kick();
  });
  visIO.observe(host);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(host);
  else window.addEventListener("resize", resize);

  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", paint);

  paint();
  aim(true);
  resize();
  host.classList.add("is-ready");
}
