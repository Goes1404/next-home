/* O mundo 3D do vídeo "gestor: equipe e anúncios": escritório, equipe e anúncios,
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

  // ---------- o escritório da imobiliária ----------
  const CENA = { a: [0, 4.8], b: [4.8, 15.2], c: [15.2, 22.8], d: [22.8, 31], e: [31, 42.2], f: [42.2, 52], g: [52, 80] };
  const qual = (t) => { for (const k of Object.keys(CENA)) if (t >= CENA[k][0] && t < CENA[k][1]) return k; return "g"; };
  const XS = [1.5, 4, 6.5]; // Ana, Bruno, Paula

  function pessoa(o) {
    const b = boneco(o);
    const cel = new THREE.Group();
    cel.add(caixa(0.2, 0.4, 0.035, mat(0x0b0f1a, { flatShading: false, roughness: 0.3 })));
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.36), new THREE.MeshBasicMaterial({ color: 0x9fc3ff }));
    tela.position.z = 0.02; cel.add(tela);
    cel.position.set(0, -0.82, 0.12); cel.rotation.x = 0.4; b.bD.add(cel);
    b.cel = cel; b.tela = tela; return b;
  }
  function rotulo(txt, w, h, cor) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ transparent: true, map: textura(512, 512 * h / w | 0, (ctx, cw, ch) => {
      ctx.fillStyle = cor || "#ffffff"; ctx.font = "700 " + (ch * 0.62) + "px Figtree, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, cw / 2, ch / 2 + 4);
    }) }));
  }

  function montar() {
    render = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    render.setPixelRatio(1); render.setSize(W, H, false);
    render.outputEncoding = THREE.sRGBEncoding;
    render.shadowMap.enabled = true; render.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a2a4a); scene.fog = new THREE.Fog(0x1a2a4a, 25, 60);
    camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x3a4560, 0.8));
    const sol = new THREE.DirectionalLight(0xffe2bd, 1.15); sol.position.set(6, 14, 12); sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 }); sol.shadow.bias = -0.0006;
    sol.target.position.set(0, 0, 0); scene.add(sol); scene.add(sol.target);

    const chao = caixa(60, 0.2, 44, mat(0xc8b8a0, { flatShading: false })); chao.position.set(0, -0.1, 18); scene.add(chao);
    const parede = caixa(30, 7, 0.3, mat(0xeef2f7)); parede.position.set(0, 3.5, -4); scene.add(parede);
    const jan = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshBasicMaterial({ color: 0x9fc3ff })); jan.position.set(4, 3.9, -3.84); scene.add(jan);
    for (let i = 0; i < 5; i++) { const p = predio(1.2, 1.4 + rnd(i) * 1.6, 0.1, 0x4a6aa8, i); p.position.set(0.6 + i * 1.6, 2.2, -3.8); scene.add(p); }
    const placaI = placa("SUA IMOBILIÁRIA", "equipe de vendas", 4.2, 1.5); placaI.position.set(-4.2, 4.7, -3.8); scene.add(placaI);

    // o gestor, na mesa à esquerda
    const mesa = caixa(2.8, 0.12, 1.3, mat(0x8b5e3c)); mesa.position.set(-4.2, 1.0, -1.2); scene.add(mesa);
    for (const x of [-1.25, 1.25]) { const pe = caixa(0.12, 1.0, 1.1, mat(0x6b4a2f)); pe.position.set(-4.2 + x, 0.5, -1.2); scene.add(pe); }
    const tab = caixa(0.9, 0.05, 0.65, mat(0x0b0f1a)); tab.position.set(-3.7, 1.09, -1.1); scene.add(tab);
    R.gestor = pessoa({ camisa: 0x0f2547, calca: 0x1a2236, pele: 1, gravata: true, cabelo: 0x9a9a9a });
    R.gestor.g.position.set(-4.4, 0, -0.1); R.gestor.g.rotation.y = 0.25; scene.add(R.gestor.g);

    // a equipe
    const cores = [[0x1b6b5a, 3, true, 0x3a2416], [0x2f5ea8, 1, false, 0x1b1410], [0xb1268f, 0, true, 0x2a1a10]];
    R.eq = cores.map(([c, pele, longo, cab], k) => { const b = pessoa({ camisa: c, calca: 0x1d2433, pele, longo, cabelo: cab }); b.g.position.set(XS[k], 0, 0.6); scene.add(b.g); return b; });
    R.nomes = ["Ana", "Bruno", "Paula"].map((n, k) => { const r = rotulo(n, 1.4, 0.45); r.position.set(XS[k], 2.85, 0.6); scene.add(r); return r; });

    // a roleta: um anel que gira sobre a equipe, e o lead que cai no Bruno
    R.anel = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.06, 6, 80), new THREE.MeshBasicMaterial({ color: 0x7fa6ec })); R.anel.rotation.x = Math.PI / 2; R.anel.position.set(4, 3.4, 0.6); scene.add(R.anel);
    R.lead = new THREE.Group(); scene.add(R.lead);
    R.lead.add(caixa(1.0, 0.66, 0.08, mat(0xffffff)));
    const aba = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.42, 4, 1), mat(0xe6ebf2)); aba.rotation.set(Math.PI / 2, Math.PI / 4, 0); aba.scale.set(1, 0.2, 0.62); aba.position.set(0, 0.1, 0.05); R.lead.add(aba);
    const brilho = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.25 })); R.lead.add(brilho);

    // a carteira do Bruno: cartões que ficam e vão para a Ana
    R.cartoes = [];
    for (let i = 0; i < 6; i++) { const c = caixa(0.5, 0.34, 0.04, mat([0xffffff, 0xe6eefb, 0xffe1d6][i % 3])); scene.add(c); R.cartoes.push(c); }

    // as barras do anúncio
    const dados = [["Clientes", "60", 3.6, 0x7fa6ec], ["Visitas", "12", 1.6, 0x7fa6ec], ["Fechados", "2", 0.7, 0x7fa6ec]];
    R.barras = dados.map(([n, v, h, c], k) => {
      const b = caixa(1.1, 1, 1.1, mat(c, { emissive: 0x1a3a7a, emissiveIntensity: 0.3 })); b.geometry.translate(0, 0.5, 0);
      b.position.set(-12 + k * 1.8, 0, 0); scene.add(b);
      const lv = rotulo(v, 1.2, 0.6, "#0d1b33"); scene.add(lv);
      const ln = rotulo(n, 1.8, 0.4, "#0d1b33"); ln.position.set(-12 + k * 1.8, 0.35, 0.8); scene.add(ln);
      return { b, h, lv };
    });
    const base = caixa(6.5, 0.15, 2.4, mat(0x2a3a5c)); base.position.set(-10.2, 0.07, 0); scene.add(base);

    R.ondas = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 32), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true })); scene.add(m); return m; });
    pronto = true;
  }

  // câmera por cena: [posição inicial, posição final, alvo]
  const ENQ = {
    a: [[-2.6, 2.9, 9.0], [-3.0, 2.7, 7.8], [-4.3, 1.3, -0.4]],
    b: [[4, 3.6, 12.5], [4, 3.3, 11.2], [4, 1.8, 0.6]],
    c: [[5.0, 2.4, 6.8], [4.6, 2.3, 5.9], [4, 1.5, 0.6]],
    d: [[3.2, 3.2, 11.5], [3.0, 3.0, 10.4], [3.0, 1.7, 0.6]],
    e: [[-10.2, 3.6, 15.5], [-10.2, 3.2, 13.8], [-10.2, 1.5, 0]],
    f: [[-2.6, 2.9, 9.0], [-3.0, 2.7, 7.8], [-4.3, 1.3, -0.4]],
    g: [[1, 3.8, 14], [1.5, 4.6, 16], [1, 1.7, 0]],
  };

  function desenhar(t) {
    if (!pronto) return;
    const k = qual(t), [t0, t1] = CENA[k], [p0, p1, al] = ENQ[k], s = suave(t, t0, t1);
    camera.position.set(mix(p0[0], p1[0], s), mix(p0[1], p1[1], s), mix(p0[2], p1[2], s)); camera.lookAt(al[0], al[1], al[2]);

    // gestor: lê o tablet; na cena f fala no celular
    respira(R.gestor, t, 0.4);
    const fala = k === "f" && t > 42.6;
    R.gestor.bD.rotation.x = fala ? -2.35 : -1.1; R.gestor.bD.rotation.z = fala ? 0.55 : 0.2; R.gestor.bD.rotation.y = fala ? -0.4 : 0;
    R.gestor.cab.rotation.x = fala ? 0 : 0.3; R.gestor.cab.rotation.y = -0.15;

    // equipe
    R.eq.forEach((b, i) => {
      respira(b, t, i * 1.7);
      b.bD.rotation.x = -1.1; b.bD.rotation.z = 0.2; b.cab.rotation.x = 0.2;
      b.tela.material.color.set(0x9fc3ff);
    });
    // o Bruno recebe o lead (cena b/c): o celular acende e ele levanta o braço
    const avisado = t > 12.0 && t < 22.8;
    if (avisado) { const br = R.eq[1]; br.tela.material.color.set(Math.floor(t * 4) % 2 ? 0xffffff : 0x9fc3ff); br.bD.rotation.x = -1.6; br.cab.rotation.x = 0.35; }
    // a Paula acena no final
    if (k === "g") R.eq.forEach((b, i) => { const a = suave(t, 52.5 + i * 0.2, 52.9 + i * 0.2); b.bE.rotation.z = -2.5 * a + Math.sin(t * 8 + i) * 0.2 * a; });

    // o Bruno sai (cena d) e a carteira dele vai para a Ana
    const sai = suave(t, 23.4, 25.6);
    const br = R.eq[1];
    br.g.visible = !(t > 25.7 && t < 52);
    br.g.position.x = XS[1] + sai * 7; br.g.rotation.y = sai > 0 && sai < 1 ? Math.PI / 2 : 0;
    if (sai > 0 && sai < 1) { br.g.children[0].rotation.x = Math.sin(t * 7) * 0.5; br.g.children[1].rotation.x = -Math.sin(t * 7) * 0.5; }
    else { br.g.children[0].rotation.x = br.g.children[1].rotation.x = 0; }
    if (t > 52) { br.g.position.x = XS[1]; br.g.rotation.y = 0; }
    R.nomes[1].visible = br.g.visible && sai < 0.05;
    R.cartoes.forEach((c, i) => {
      const ap = volta(t, 23.2 + i * 0.08, 23.6 + i * 0.08);
      const vai = suave(t, 28.2 + i * 0.12, 28.9 + i * 0.12);
      const x = mix(XS[1] - 0.5 + (i % 3) * 0.5, XS[0] - 0.5 + (i % 3) * 0.5, vai), y = 3.3 + Math.floor(i / 3) * 0.42 + Math.sin(vai * Math.PI) * 1.2;
      c.position.set(x, y, 0.6); c.rotation.y = vai * Math.PI * 2;
      c.scale.setScalar(Math.max(0.001, ap) * (1 - suave(t, 30.4, 30.8)));
      c.visible = t > 23.2 && t < 30.8;
    });

    // a roleta e o lead
    R.anel.visible = (k === "b" || k === "g"); R.anel.rotation.z = t * 1.4; R.anel.scale.setScalar(k === "b" ? volta(t, 8.4, 9.0) : 1);
    const kl = suave(t, 9.6, 11.9);
    R.lead.visible = t > 8.2 && t < 12.2;
    R.lead.position.set(mix(4, XS[1], kl), mix(6.5, 2.0, kl) + Math.sin(kl * Math.PI) * 0.6, mix(-1, 1.1, kl));
    R.lead.rotation.set(0, t * 2, Math.sin(t * 3) * 0.2);
    R.lead.scale.setScalar(volta(t, 8.2, 8.6) * (1 - suave(t, 11.9, 12.2)) + 0.001);

    // as barras
    R.barras.forEach(({ b, h, lv }, i) => {
      const c = Math.max(0.001, volta(t, 31.5 + i * 0.3, 32.3 + i * 0.3) * h);
      b.scale.y = c; lv.position.set(-12 + i * 1.8, c + 0.45, 0); lv.visible = c > 0.2; lv.lookAt(camera.position);
      b.material.color.set(i === 1 && t > 40.3 ? 0x1f9d6b : 0x2f5ea8); b.material.emissiveIntensity = i === 1 && t > 40.3 ? 0.5 : 0.1;
    });

    // ondas do áudio do gestor (cena f)
    const pos = new THREE.Vector3(); R.gestor.cel.getWorldPosition(pos);
    R.ondas.forEach((m, j) => { const c = lin(t, 43.2 + j * 0.3, 44.5 + j * 0.3); m.visible = c > 0 && c < 1; m.position.copy(pos); m.lookAt(camera.position); m.scale.setScalar(0.4 + c * 2.6); m.material.opacity = (1 - c) * 0.9; });
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
