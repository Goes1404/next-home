/* O mundo 3D do vídeo dos anúncios de venda: a corretora no escritório,
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

  // ---------- anúncio: a corretora no escritório; o roteiro vem de window.__CFG ----------
  // __CFG = { cenas: { id: [início, fim] }, sem: [ids escuros], fala: [[de, até]], ondas: [t], cafe: t, chaves: t }
  const CFG = window.__CFG || { cenas: { a: [0, 99] }, sem: [], fala: [], ondas: [] };
  const IDS = Object.keys(CFG.cenas);
  const qual = (t) => { for (const k of IDS) if (t >= CFG.cenas[k][0] && t < CFG.cenas[k][1]) return k; return IDS[IDS.length - 1]; };

  function pessoa(o) {
    const b = boneco(o);
    const cel = new THREE.Group();
    cel.add(caixa(0.2, 0.4, 0.035, mat(0x0b0f1a, { flatShading: false, roughness: 0.3 })));
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.36), new THREE.MeshBasicMaterial({ color: 0x9fc3ff }));
    tela.position.z = 0.02; cel.add(tela);
    cel.position.set(0, -0.82, 0.12); cel.rotation.x = 0.4; b.bD.add(cel);
    b.cel = cel; b.tela = tela; return b;
  }

  function montar() {
    render = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    render.setPixelRatio(1); render.setSize(W, H, false);
    render.outputEncoding = THREE.sRGBEncoding;
    render.shadowMap.enabled = true; render.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fb4e8); scene.fog = new THREE.Fog(0x8fb4e8, 25, 70);
    camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);
    R.hemi = new THREE.HemisphereLight(0xdbe8ff, 0x3a4560, 0.85); scene.add(R.hemi);
    R.sol = new THREE.DirectionalLight(0xffe2bd, 1.15); R.sol.position.set(6, 14, 12); R.sol.castShadow = true;
    R.sol.shadow.mapSize.set(2048, 2048); Object.assign(R.sol.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 }); R.sol.shadow.bias = -0.0006;
    scene.add(R.sol); scene.add(R.sol.target);
    R.alerta = new THREE.PointLight(0xff3344, 0, 12); R.alerta.position.set(0.5, 2.6, 2.5); scene.add(R.alerta);

    const chao = caixa(40, 0.2, 40, mat(0xc8b8a0, { flatShading: false })); chao.position.set(0, -0.1, 12); scene.add(chao);
    const parede = caixa(30, 7, 0.3, mat(0xeef2f7)); parede.position.set(0, 3.5, -3); scene.add(parede);
    const jan = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: 0x9fc3ff })); jan.position.set(3.6, 3.6, -2.84); scene.add(jan);
    for (let i = 0; i < 4; i++) { const p = predio(1.0, 1.2 + rnd(i) * 1.4, 0.1, 0x4a6aa8, i); p.position.set(1.9 + i * 1.15, 2.1, -2.8); scene.add(p); }
    const mesa = caixa(2.8, 0.12, 1.3, mat(0x8b5e3c)); mesa.position.set(0.6, 1.0, -0.9); scene.add(mesa);
    for (const x of [-1.25, 1.25]) { const pe = caixa(0.12, 1.0, 1.1, mat(0x6b4a2f)); pe.position.set(0.6 + x, 0.5, -0.9); scene.add(pe); }
    const note = caixa(0.9, 0.05, 0.6, mat(0x9aa3b2)); note.position.set(1.2, 1.09, -1.0); scene.add(note);
    const tl2 = caixa(0.9, 0.6, 0.04, mat(0x9aa3b2)); tl2.position.set(1.2, 1.4, -1.3); tl2.rotation.x = -0.25; scene.add(tl2);
    const vaso = caixa(0.4, 0.5, 0.4, mat(0xf5f7fb)); vaso.position.set(-2.4, 0.25, -2.2); scene.add(vaso);
    const planta = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), mat(0x3f8f5a)); planta.position.set(-2.4, 1.0, -2.2); planta.castShadow = true; scene.add(planta);
    // o café (a conta do preço)
    R.cafe = new THREE.Group(); R.cafe.position.set(-0.3, 1.06, -0.6); scene.add(R.cafe);
    const xic = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.26, 14), mat(0xffffff)); xic.position.y = 0.13; R.cafe.add(xic);
    const alca = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), mat(0xffffff)); alca.position.set(0.18, 0.14, 0); R.cafe.add(alca);
    R.vapor = [0, 1, 2].map((i) => { const v = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); R.cafe.add(v); return v; });

    R.ana = pessoa({ camisa: 0x1b2f5c, calca: 0x1b2f5c, pele: 3, longo: true, cabelo: 0x3a2416 });
    R.ana.g.position.set(-0.4, 0, 0.3); R.ana.g.rotation.y = 0.25; scene.add(R.ana.g);
    const blusa = caixa(0.36, 0.5, 0.05, mat(0xf5f7fb)); blusa.position.set(0, 1.45, 0.33); R.ana.g.add(blusa);
    R.ondas = (CFG.ondas || []).map(() => [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 32), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true })); scene.add(m); return m;
    }));
    pronto = true;
  }

  // três enquadramentos que se revezam a cada cena
  const PLANOS = [
    [[0.6, 2.5, 8.6], [0.2, 2.4, 7.4], [-0.3, 1.45, 0]],
    [[2.6, 2.9, 10.5], [2.2, 2.7, 9.4], [0.2, 1.5, 0]],
    [[-1.6, 2.6, 9.4], [-1.1, 2.5, 8.2], [-0.2, 1.45, 0]],
  ];

  function desenhar(t) {
    if (!pronto) return;
    const k = qual(t), idx = IDS.indexOf(k), [t0, t1] = CFG.cenas[k], s = suave(t, t0, t1);
    const [p0, p1, al] = PLANOS[idx % 3];
    camera.position.set(mix(p0[0], p1[0], s), mix(p0[1], p1[1], s), mix(p0[2], p1[2], s)); camera.lookAt(al[0], al[1], al[2]);
    const sem = (CFG.sem || []).includes(k);
    scene.background.set(sem ? 0x2a1a24 : 0x8fb4e8); scene.fog.color.set(sem ? 0x2a1a24 : 0x8fb4e8);
    R.hemi.intensity = sem ? 0.35 : 0.85; R.sol.intensity = sem ? 0.5 : 1.15;
    R.alerta.intensity = sem ? 1.6 + Math.sin(t * 6) * 0.6 : 0;

    const an = R.ana; respira(an, t, 1.1);
    const fala = (CFG.fala || []).some(([a, b]) => t > a && t < b);
    an.bD.rotation.x = fala ? -2.35 : -1.15; an.bD.rotation.z = fala ? 0.55 : 0.2; an.bD.rotation.y = fala ? -0.4 : 0;
    an.cab.rotation.x = sem ? 0.45 : (fala ? 0 : 0.25);
    an.tela.material.color.set(sem ? (Math.floor(t * 4) % 2 ? 0xff3344 : 0x661018) : 0x9fc3ff);
    const pos = new THREE.Vector3(); an.cel.getWorldPosition(pos);
    R.ondas.forEach((aneis, i) => {
      const ta = CFG.ondas[i];
      aneis.forEach((m, j) => {
        const c = lin(t, ta + j * 0.3, ta + j * 0.3 + 1.3);
        m.visible = c > 0 && c < 1; m.position.copy(pos); m.lookAt(camera.position); m.scale.setScalar(0.4 + c * 2.6); m.material.opacity = (1 - c) * 0.9;
      });
    });
    // o café sobe vapor; na conta do preço ele "aparece" com um pulo
    const pc = CFG.cafe ? volta(t, CFG.cafe, CFG.cafe + 0.45) : 1;
    R.cafe.scale.setScalar(Math.max(0.001, pc));
    R.vapor.forEach((v, i) => { const c = ((t * 0.6 + i / 3) % 1); v.position.set(Math.sin(t + i) * 0.04, 0.3 + c * 0.5, 0); v.material.opacity = (1 - c) * 0.6; v.scale.setScalar(0.6 + c); });
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
