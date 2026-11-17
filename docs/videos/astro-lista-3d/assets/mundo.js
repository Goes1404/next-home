/* O mundo 3D do vídeo "lista de transmissão segura": disparo em massa e lista na fila,
   e a câmera, tudo calculado a partir do tempo t (em segundos do vídeo).
   Nada depende do quadro anterior: o render pode pedir qualquer t, em
   qualquer ordem. */
(function () {
  const W = 1080, H = 1920;
  const canvas = document.getElementById("mundo");
  let pronto = false;
  let render, scene, camera, R = {};

  // ---------- utilidades ----------
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const suave = (t, a, b) => { const x = lin(t, a, b); return x * x * (3 - 2 * x); };
  const volta = (t, a, b) => { // back.out: passa um pouco e volta
    const x = lin(t, a, b), c = 1.9;
    return x <= 0 ? 0 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  };
  const mix = (a, b, k) => a + (b - a) * k;
  function rnd(i) { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function mat(cor, extra) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.65, metalness: 0.05, flatShading: true }, extra || {}));
  }
  function caixa(w, h, d, m) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    g.castShadow = true; g.receiveShadow = true; return g;
  }
  function textura(w, h, desenha) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    desenha(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.encoding = THREE.sRGBEncoding; return t;
  }
  function arred(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- boneco low-poly ----------
  const PELE = [0xf1c7a1, 0xc98d5f, 0x8d5a3b, 0xe0ac7e];
  function boneco(o) {
    const g = new THREE.Group();
    const roupa = mat(o.camisa), calca = mat(o.calca || 0x1d2433), pele = mat(PELE[o.pele || 0]), cabelo = mat(o.cabelo || 0x241a14);
    const perna = (x) => { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.6, 3, 8), calca); p.position.set(x, 0.45, 0); p.castShadow = true; return p; };
    g.add(perna(-0.17), perna(0.17));
    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.55, 4, 10), roupa);
    corpo.position.y = 1.3; corpo.castShadow = true; g.add(corpo);
    const cab = new THREE.Group(); cab.position.y = 2.12; g.add(cab);
    const cabeca = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), pele); cabeca.castShadow = true; cab.add(cabeca);
    const cab2 = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 6, 0, Math.PI * 2, 0, Math.PI * (o.longo ? 0.5 : 0.45)), cabelo);
    cab2.position.y = 0.04; cab2.rotation.x = o.longo ? -0.75 : -0.25; cab.add(cab2);
    if (o.longo) { const c3 = caixa(0.62, 0.55, 0.22, cabelo); c3.position.set(0, -0.2, -0.2); cab.add(c3); }
    const olho = mat(0x111111, { flatShading: false });
    for (const x of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), olho); e.position.set(x, 0.03, 0.31); cab.add(e); }
    const boca = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 4, 10, Math.PI), mat(0x7a2e2e));
    boca.position.set(0, -0.11, 0.3); boca.rotation.z = Math.PI; cab.add(boca);
    const braco = (x) => {
      const b = new THREE.Group(); b.position.set(x, 1.68, 0);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.55, 3, 8), roupa); m.position.y = -0.36; m.castShadow = true; b.add(m);
      const mao = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), pele); mao.position.y = -0.74; b.add(mao);
      g.add(b); return b;
    };
    const bE = braco(-0.47), bD = braco(0.47);
    if (o.gravata) { const gr = caixa(0.1, 0.42, 0.04, mat(0x4d84e0)); gr.position.set(0, 1.45, 0.34); g.add(gr); }
    return { g, bE, bD, cab, corpo };
  }
  function respira(b, t, k) { b.corpo.scale.y = 1 + Math.sin(t * 2.2 + k) * 0.015; b.cab.rotation.z = Math.sin(t * 1.3 + k) * 0.05; }

  // ---------- prédio com janelas ----------
  const janelas = {};
  function texJanela(cor, seed) {
    const k = cor + "-" + seed;
    if (janelas[k]) return janelas[k];
    janelas[k] = textura(128, 256, (ctx, w, h) => {
      ctx.fillStyle = "#" + cor.toString(16).padStart(6, "0"); ctx.fillRect(0, 0, w, h);
      for (let y = 10; y < h - 10; y += 22) for (let x = 12; x < w - 12; x += 26) {
        const acesa = rnd(seed * 31 + x * 7 + y) > 0.55;
        ctx.fillStyle = acesa ? "#ffd98a" : "rgba(10,20,40,0.55)"; ctx.fillRect(x, y, 14, 12);
      }
    });
    janelas[k].wrapS = janelas[k].wrapT = THREE.RepeatWrapping;
    return janelas[k];
  }
  function predio(w, h, d, cor, seed) {
    const t = texJanela(cor, seed % 5).clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 4)));
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, emissive: 0xffc46a, emissiveIntensity: 0.0 });
    const p = caixa(w, h, d, m); p.geometry.translate(0, h / 2, 0); return p;
  }

  function placa(texto, sub, w, h) {
    const tx = textura(1024, 512 * h / w | 0, (ctx, cw, ch) => {
      ctx.fillStyle = "#0f2547"; arred(ctx, 0, 0, cw, ch, 40); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.font = "700 " + (ch * 0.36) + "px Figtree, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(texto, cw / 2, ch * (sub ? 0.4 : 0.5));
      if (sub) { ctx.fillStyle = "#a9c1e0"; ctx.font = "400 " + (ch * 0.17) + "px Figtree, sans-serif"; ctx.fillText(sub, cw / 2, ch * 0.75); }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx, transparent: true }));
    return m;
  }
  function cartao(nome, iniciais, cor) {
    const tx = textura(600, 760, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff"; arred(ctx, 0, 0, w, h, 48); ctx.fill();
      ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(w / 2, 170, 110, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 92px Figtree, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(iniciais, w / 2, 172);
      ctx.fillStyle = "#0d1b33"; ctx.font = "700 62px Figtree, sans-serif"; ctx.fillText(nome, w / 2, 365);
      ctx.fillStyle = "#6b7790"; ctx.font = "400 40px Figtree, sans-serif"; ctx.fillText("CRECI 234800", w / 2, 435);
      ctx.fillStyle = "#1f8a5b"; arred(ctx, 60, 520, w - 120, 120, 60); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 46px Figtree, sans-serif"; ctx.fillText("WhatsApp", w / 2, 582);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), new THREE.MeshBasicMaterial({ map: tx, transparent: true, side: THREE.DoubleSide }));
    return m;
  }

  // ---------- disparo em massa (x=0) e lista segura (x=40) ----------
  const CENA = { a: [0, 5.6], b: [5.6, 16.2], c: [16.2, 22.8], d: [22.8, 31], e: [31, 39.2], f: [39.2, 47.2], g: [47.2, 80] };
  const qual = (t) => { for (const k of Object.keys(CENA)) if (t >= CENA[k][0] && t < CENA[k][1]) return k; return "g"; };
  const AX = 40; // palco da Ana

  function pessoa(o) {
    const b = boneco(o);
    const cel = new THREE.Group();
    cel.add(caixa(0.2, 0.4, 0.035, mat(0x0b0f1a, { flatShading: false, roughness: 0.3 })));
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.36), new THREE.MeshBasicMaterial({ color: 0x9fc3ff }));
    tela.position.z = 0.02; cel.add(tela);
    cel.position.set(0, -0.82, 0.12); cel.rotation.x = 0.4; b.bD.add(cel);
    b.cel = cel; b.tela = tela; return b;
  }
  function envelope(cor) {
    const g = new THREE.Group();
    g.add(caixa(0.6, 0.4, 0.05, mat(cor)));
    const aba = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.26, 4, 1), mat(0xe6ebf2)); aba.rotation.set(Math.PI / 2, Math.PI / 4, 0); aba.scale.set(1, 0.2, 0.62); aba.position.set(0, 0.06, 0.03); g.add(aba);
    return g;
  }

  function montar() {
    render = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    render.setPixelRatio(1); render.setSize(W, H, false);
    render.outputEncoding = THREE.sRGBEncoding;
    render.shadowMap.enabled = true; render.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a1a24); scene.fog = new THREE.Fog(0x2a1a24, 25, 70);
    camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);
    R.hemi = new THREE.HemisphereLight(0xdbe8ff, 0x3a4560, 0.8); scene.add(R.hemi);
    R.sol = new THREE.DirectionalLight(0xffe2bd, 1.15); R.sol.position.set(6, 14, 12); R.sol.castShadow = true;
    R.sol.shadow.mapSize.set(2048, 2048); Object.assign(R.sol.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 }); R.sol.shadow.bias = -0.0006;
    scene.add(R.sol); scene.add(R.sol.target);
    R.alerta = new THREE.PointLight(0xff3344, 0, 12); R.alerta.position.set(0.5, 2.6, 2); scene.add(R.alerta);

    // palco do disparo em massa
    const c1 = caixa(16, 0.2, 30, mat(0x3a3440, { flatShading: false })); c1.position.set(0, -0.1, 8); scene.add(c1);
    const p1 = caixa(16, 7, 0.3, mat(0x4a3f4f)); p1.position.set(0, 3.5, -3); scene.add(p1);
    R.rafa = pessoa({ camisa: 0x8a8f99, calca: 0x2d3b55, pele: 1, cabelo: 0x1b1410 }); scene.add(R.rafa.g);
    R.tempestade = [];
    for (let i = 0; i < 60; i++) {
      const e = envelope(0xffffff); scene.add(e);
      R.tempestade.push({ e, t0: 0.15 + i * 0.075, dx: (rnd(i) - 0.5) * 9, dy: 1.5 + rnd(i + 50) * 5, dz: -1 - rnd(i + 90) * 3, r: rnd(i + 7) * 6 });
    }
    R.xs = [];
    for (let i = 0; i < 3; i++) {
      const x = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ transparent: true, map: textura(256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#e0484d"; ctx.beginPath(); ctx.arc(w / 2, h / 2, 120, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 26; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(80, 80); ctx.lineTo(176, 176); ctx.moveTo(176, 80); ctx.lineTo(80, 176); ctx.stroke();
      }) }));
      x.position.set(-2.2 + i * 2.2, 3.2 - i * 0.2, 0); scene.add(x); R.xs.push(x);
    }

    // palco da lista segura: escritório da Ana
    const c2 = caixa(20, 0.2, 30, mat(0xc8b8a0, { flatShading: false })); c2.position.set(AX, -0.1, 8); scene.add(c2);
    const p2 = caixa(20, 7, 0.3, mat(0xeef2f7)); p2.position.set(AX, 3.5, -3); scene.add(p2);
    const jan = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3), new THREE.MeshBasicMaterial({ color: 0x9fc3ff })); jan.position.set(AX + 4.5, 3.6, -2.84); scene.add(jan);
    const mesa = caixa(2.8, 0.12, 1.3, mat(0x8b5e3c)); mesa.position.set(AX - 0.4, 1.0, -0.9); scene.add(mesa);
    for (const x of [-1.25, 1.25]) { const pe = caixa(0.12, 1.0, 1.1, mat(0x6b4a2f)); pe.position.set(AX - 0.4 + x, 0.5, -0.9); scene.add(pe); }
    R.ana = pessoa({ camisa: 0x1b2f5c, calca: 0x1b2f5c, pele: 3, longo: true, cabelo: 0x3a2416 });
    R.ana.g.position.set(AX - 0.7, 0, 0.4); R.ana.g.rotation.y = 0.2; scene.add(R.ana.g);
    const cores = [0xffe1d6, 0xe6eefb, 0xdff5e6, 0xfdf0c8, 0xf0e2fb];
    R.fila = [];
    for (let i = 0; i < 12; i++) { const e = envelope(cores[i % 5]); scene.add(e); R.fila.push(e); }
    R.relogio = new THREE.Group(); R.relogio.position.set(AX + 2.4, 4.2, -2.7); scene.add(R.relogio);
    R.relogio.add(new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 32), mat(0x0f2547)); R.relogio.add(aro);
    R.ponteiro = caixa(0.06, 0.6, 0.03, mat(0x0f2547)); R.ponteiro.geometry.translate(0, 0.3, 0); R.ponteiro.position.z = 0.04; R.relogio.add(R.ponteiro);
    R.volta = envelope(0x4ade80); scene.add(R.volta);
    R.sai = envelope(0x9aa3b2); scene.add(R.sai);
    R.ondas = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 32), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true })); scene.add(m); return m; });
    pronto = true;
  }

  const ENQ = {
    a: [[0.8, 2.6, 8.5], [0.4, 2.4, 6.8], [0, 1.8, 0]],
    b: [[0, 4.0, 12.0], [0, 3.6, 10.5], [0, 2.0, 0]],
    c: [[AX + 0.6, 2.7, 8.8], [AX + 0.1, 2.5, 7.6], [AX - 1.4, 1.4, 0]],
    d: [[AX + 0.8, 2.6, 13.8], [AX + 0.6, 2.5, 12.8], [AX + 0.3, 1.5, 0]],
    e: [[AX + 0.8, 2.6, 13.8], [AX + 0.7, 2.5, 12.8], [AX + 0.3, 1.5, 0]],
    f: [[AX + 0.8, 2.6, 13.8], [AX + 0.6, 2.5, 12.8], [AX + 0.3, 1.5, 0]],
    g: [[AX + 0.6, 2.6, 13.0], [AX + 1.0, 3.6, 16.0], [AX + 0.3, 1.5, 0]],
  };
  // a fila: 12 envelopes; saem um a um a partir de 33 s, a cada 0,55 s
  const SAIDA = (i) => 33.0 + i * 0.55;

  function desenhar(t) {
    if (!pronto) return;
    const k = qual(t), [t0, t1] = CENA[k], [p0, p1, al] = ENQ[k], s = suave(t, t0, t1);
    camera.position.set(mix(p0[0], p1[0], s), mix(p0[1], p1[1], s), mix(p0[2], p1[2], s)); camera.lookAt(al[0], al[1], al[2]);
    const x0 = k === "a" || k === "b" ? 0 : AX;
    R.sol.position.set(x0 + 6, 14, 12); R.sol.target.position.set(x0, 0, 0);
    const sem = x0 === 0;
    scene.background.set(sem ? 0x2a1a24 : 0x8fb4e8); scene.fog.color.set(sem ? 0x2a1a24 : 0x8fb4e8);
    R.hemi.intensity = sem ? 0.55 : 0.85;
    // câmera treme quando o número "cai"
    if (t > 2.25 && t < 2.65) camera.position.x += Math.sin(t * 90) * 0.12;

    // o disparo em massa
    const ra = R.rafa; respira(ra, t, 0.3);
    ra.bD.rotation.x = -1.3; ra.bD.rotation.z = 0.25; ra.cab.rotation.x = 0.3;
    const vermelho = t > 2.25;
    ra.tela.material.color.set(vermelho ? (Math.floor(t * 6) % 2 ? 0xff3344 : 0x661018) : 0x9fc3ff);
    R.alerta.intensity = vermelho && sem ? 2.2 + Math.sin(t * 12) * 1.2 : 0;
    const origem = new THREE.Vector3(); ra.cel.getWorldPosition(origem);
    R.tempestade.forEach(({ e, t0: ti, dx, dy, dz, r }) => {
      const c = lin(t, ti, ti + 1.2);
      const cai = lin(t, 6.0, 7.6);
      e.visible = t > ti && sem;
      e.position.set(origem.x + dx * c, Math.max(0.05, origem.y + dy * c - cai * (origem.y + dy)), origem.z + dz * c + 0.5);
      e.rotation.set(r * c, r * 1.3 * c, r * 0.7 * c + cai * 1.2);
    });
    R.xs.forEach((x, i) => { const tx = [12.1, 13.0, 14.1][i]; x.visible = t > tx && sem; x.scale.setScalar(Math.max(0.001, volta(t, tx, tx + 0.4))); x.lookAt(camera.position); });

    // a Ana
    const an = R.ana; respira(an, t, 1.1);
    const fala = (t > 16.6 && t < 19.4) || (t > 47.4 && t < 49.4);
    an.bD.rotation.x = fala ? -2.35 : -1.15; an.bD.rotation.z = fala ? 0.55 : 0.2; an.bD.rotation.y = fala ? -0.4 : 0; an.cab.rotation.x = fala ? 0 : 0.28;
    const pos = new THREE.Vector3(); an.cel.getWorldPosition(pos);
    R.ondas.forEach((m, j) => {
      const ta = t < 30 ? 17.0 : 47.8;
      const c = lin(t, ta + j * 0.3, ta + j * 0.3 + 1.3);
      m.visible = c > 0 && c < 1 && !sem; m.position.copy(pos); m.lookAt(camera.position); m.scale.setScalar(0.4 + c * 2.6); m.material.opacity = (1 - c) * 0.9;
    });
    // a fila de envelopes, cada um de uma cor (cada mensagem reescrita)
    R.fila.forEach((e, i) => {
      const nasce = volta(t, 24.2 + i * 0.12, 24.6 + i * 0.12);
      const lx = AX - 1.2 + (i % 6) * 0.75, ly = 3.0 + Math.floor(i / 6) * 0.55;
      const sa = suave(t, SAIDA(i), SAIDA(i) + 1.2);
      e.position.set(mix(lx, AX + 4.5, sa), ly + Math.sin(sa * Math.PI) * 0.8 + Math.sin(t * 2 + i) * 0.04, mix(0.3, -2.6, sa));
      e.rotation.set(0, sa * 0.6, Math.sin(t * 1.5 + i) * 0.05);
      const fora = i === 7 && t > 40.2; // quem pediu para sair: cai da fila
      e.visible = t > 24.2 + i * 0.12 && sa < 0.98 && !fora && !sem;
      e.scale.setScalar(Math.max(0.001, nasce));
    });
    // o ponteiro do relógio anda um passo a cada envelope
    const passos = R.fila.filter((_, i) => t > SAIDA(i)).length;
    R.ponteiro.rotation.z = -passos * (Math.PI / 6);
    R.relogio.visible = !sem;
    // quem sai da lista (cinza, cai) e quem responde (verde, volta para a Ana)
    const qs = suave(t, 40.2, 41.4);
    R.sai.visible = t > 40.2 && t < 41.6; R.sai.position.set(AX - 1.2 + 1 * 0.75, 3.55 - qs * 3.4, 0.3); R.sai.rotation.z = qs * 2.4;
    const qv = suave(t, 44.6, 46.0);
    R.volta.visible = t > 44.6 && t < 46.4; R.volta.position.set(mix(AX + 4.5, pos.x, qv), mix(3.6, pos.y + 0.4, qv) + Math.sin(qv * Math.PI) * 0.8, mix(-2.6, pos.z + 0.3, qv));
    R.volta.scale.setScalar(volta(t, 44.6, 45.0) * (1 - suave(t, 45.9, 46.4)) + 0.001);
    render.render(scene, camera);
  }

  window.__hf = window.__hf || {};
  window.__hf.buildReady = window.__hf.buildReady || {};
  window.__hf.buildReady.mundo = (async () => {
    await Promise.all(["700 64px Figtree", "400 40px Figtree"].map((f) => document.fonts.load(f)));
    montar();
    desenhar(0);
  })();
  window.addEventListener("hf-seek", (e) => desenhar(e.detail.time));
  window.__mundo = desenhar;
})();
