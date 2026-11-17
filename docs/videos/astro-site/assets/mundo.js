/* O mundo 3D do vídeo "o site da sua imobiliária": cidade, bonecos low-poly
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
    const cab2 = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 6, 0, Math.PI * 2, 0, Math.PI * (o.longo ? 0.62 : 0.45)), cabelo);
    cab2.position.y = 0.04; cab2.rotation.x = -0.25; cab.add(cab2);
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

  // ---------- montagem ----------
  function montar() {
    render = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    render.setPixelRatio(1); render.setSize(W, H, false);
    render.outputEncoding = THREE.sRGBEncoding;
    render.shadowMap.enabled = true; render.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1834);
    scene.fog = new THREE.Fog(0x0b1834, 45, 120);
    camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 300);

    scene.add(new THREE.HemisphereLight(0xbcd3ff, 0x1a2238, 0.75));
    const sol = new THREE.DirectionalLight(0xffe2bd, 1.25); sol.position.set(18, 30, 20); sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 120 }); sol.shadow.bias = -0.0006;
    scene.add(sol);
    const rim = new THREE.DirectionalLight(0x6f9cff, 0.55); rim.position.set(-20, 12, -25); scene.add(rim);

    const chao = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat(0x1c2a47, { flatShading: false, roughness: 0.95 }));
    chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; scene.add(chao);
    // ruas
    for (const [x, z, w, d] of [[0, -4, 120, 3], [0, 14, 120, 3], [-14, 0, 3, 120], [20, 0, 3, 120]]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0x2a3a5c, { flatShading: false })); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.01, z); r.receiveShadow = true; scene.add(r);
    }

    // a cidade que sobe (cena 2)
    R.cidade = [];
    const cores = [0x3a5f9c, 0x2f4f86, 0x4a6aa8, 0x5f7fb8, 0x2c4572];
    let n = 0;
    for (let gx = -5; gx <= 5; gx++) for (let gz = -6; gz <= -1; gz++) {
      const x = gx * 7 + (rnd(n) - 0.5) * 2, z = gz * 7 - 6 + (rnd(n + 9) - 0.5) * 2;
      n++;
      if (Math.abs(x) < 5 && z > -20) continue;          // praça e prédio principal
      if (x > 6 && x < 15 && z > -16) continue;          // terreno do imóvel importado
      const h = 4 + rnd(n * 3) * 14, w = 3 + rnd(n * 5) * 2.5;
      const p = predio(w, h, w, cores[n % 5], n); p.position.set(x, 0, z); scene.add(p);
      R.cidade.push({ p, t0: 6.2 + rnd(n * 7) * 2.4 + (Math.abs(gx) * 0.12) });
    }
    // o prédio da imobiliária
    R.hero = predio(6, 17, 6, 0x4d84e0, 3); R.hero.position.set(0, 0, -15); scene.add(R.hero);
    R.placa = placa("SUA IMOBILIÁRIA", "site próprio · sua marca", 5.6, 2.2); R.placa.position.set(0, 14.2, -11.9); scene.add(R.placa);
    R.antena = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.5, 6), mat(0xa9c1e0)); R.antena.position.set(0, 18.2, -15); scene.add(R.antena);

    // o dono (cena 1) com o celular do Instagram
    R.dono = boneco({ camisa: 0x0f2547, calca: 0x1a2236, pele: 1, gravata: true });
    R.dono.g.position.set(0, 0, 0); scene.add(R.dono.g);
    R.cel = new THREE.Group(); R.cel.position.set(0.95, 1.95, 0.55); R.cel.rotation.set(-0.05, -0.35, 0); scene.add(R.cel);
    const corpoCel = caixa(1.0, 1.9, 0.09, mat(0x0b0f1a, { flatShading: false, roughness: 0.3 })); R.cel.add(corpoCel);
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.78), new THREE.MeshBasicMaterial({ color: 0xf4f1ec })); tela.position.z = 0.047; R.cel.add(tela);
    R.feed = [];
    const corFeed = ["#e9a96b", "#7fb2e5", "#a6d49f", "#e58f9e", "#c9a6e6", "#f2d36b"];
    for (let i = 0; i < 6; i++) {
      const tx = textura(256, 256, (ctx, w, h) => {
        ctx.fillStyle = corFeed[i]; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.moveTo(60, 140); ctx.lineTo(128, 70); ctx.lineTo(196, 140); ctx.closePath(); ctx.fill();
        ctx.fillRect(80, 140, 96, 70); ctx.fillStyle = corFeed[i]; ctx.fillRect(114, 170, 28, 40);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: tx, transparent: true }));
      m.position.z = 0.05; R.cel.add(m); R.feed.push(m);
    }
    R.pontos = [];
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe0484d })); p.position.set(-0.25 + i * 0.25, -0.75, 0.06); R.cel.add(p); R.pontos.push(p); }

    // o terreno do imóvel importado (cena 3)
    R.andares = [];
    for (let i = 0; i < 9; i++) {
      const a = caixa(4.6, 1.25, 4.6, new THREE.MeshStandardMaterial({ map: texJanela(0xf5f7fb, 2), roughness: 0.6 }));
      a.position.set(11, 0.625 + i * 1.3, -11); scene.add(a); R.andares.push(a);
    }
    R.teto = caixa(5, 0.3, 5, mat(0x0f2547)); R.teto.position.set(11, 9 * 1.3 + 0.15, -11); scene.add(R.teto);
    R.link = new THREE.Group(); scene.add(R.link);
    for (const dx of [-0.32, 0.32]) { const el = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 8, 20), mat(0x4d84e0, { emissive: 0x2a5bc4, emissiveIntensity: 0.6 })); el.scale.set(1, 0.6, 1); el.position.x = dx; R.link.add(el); }
    R.selo = placa("PUBLICADO ✓", null, 4, 1.1); R.selo.material.map.dispose();
    R.selo = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ transparent: true, map: textura(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = "#1f9d6b"; arred(ctx, 0, 0, w, h, 128); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "700 120px Figtree, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("Publicado ✓", w / 2, h / 2 + 6);
    }) }));
    R.selo.position.set(11, 10.4, -8.2); scene.add(R.selo);

    // o apartamento em corte (cena 4)
    const ap = new THREE.Group(); ap.position.set(30, 0, 6); scene.add(ap); R.ap = ap;
    const piso = caixa(11, 0.3, 9, mat(0xc8a27a, { flatShading: false })); piso.position.y = 0.15; ap.add(piso);
    const p1 = caixa(11, 4.2, 0.3, mat(0xeae4da)); p1.position.set(0, 2.25, -4.35); ap.add(p1);
    const p2 = caixa(0.3, 4.2, 9, mat(0xe1d9cc)); p2.position.set(-5.35, 2.25, 0); ap.add(p2);
    const jan = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.2), new THREE.MeshBasicMaterial({ color: 0x9fc3ff })); jan.position.set(1.5, 2.6, -4.19); ap.add(jan);
    const sofa = new THREE.Group(); sofa.position.set(-1.5, 0.3, -1.6); ap.add(sofa);
    const sm = mat(0x3a5f9c); const s1 = caixa(3.6, 0.6, 1.3, sm); s1.position.y = 0.3; sofa.add(s1);
    const s2 = caixa(3.6, 1.0, 0.35, sm); s2.position.set(0, 0.9, -0.5); sofa.add(s2);
    for (const x of [-1.95, 1.95]) { const s3 = caixa(0.35, 0.8, 1.3, sm); s3.position.set(x, 0.55, 0); sofa.add(s3); }
    const mesa = caixa(1.6, 0.45, 0.9, mat(0x8b5e3c)); mesa.position.set(-1.5, 0.52, 0.6); ap.add(mesa);
    const tapete = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), mat(0xd9c3a5, { flatShading: false })); tapete.rotation.x = -Math.PI / 2; tapete.position.set(-1.5, 0.31, 0.2); ap.add(tapete);
    const vaso = caixa(0.5, 0.6, 0.5, mat(0xf5f7fb)); vaso.position.set(3.8, 0.6, -3.4); ap.add(vaso);
    const planta = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat(0x3f8f5a)); planta.position.set(3.8, 1.55, -3.4); ap.add(planta);
    const luz = new THREE.PointLight(0xffd59a, 0.9, 14); luz.position.set(0, 3.8, 0); ap.add(luz);
    R.cliente = boneco({ camisa: 0xe58f5a, calca: 0x2d3b55, pele: 0, longo: true, cabelo: 0x5a3720 });
    R.cliente.g.position.set(-1.5, 0.35, -1.55); ap.add(R.cliente.g);
    // sentado: pernas para a frente
    R.cliente.g.children[0].rotation.x = R.cliente.g.children[1].rotation.x = -1.4;
    R.cliente.g.children[0].position.set(-0.17, 0.62, 0.35); R.cliente.g.children[1].position.set(0.17, 0.62, 0.35);
    R.cliente.g.position.y = 0.05;
    R.anel = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.07, 6, 80), new THREE.MeshBasicMaterial({ color: 0x7fa6ec })); R.anel.rotation.x = Math.PI / 2; R.anel.position.set(0, 2.4, 0); ap.add(R.anel);
    R.celCli = caixa(0.28, 0.5, 0.04, mat(0x0b0f1a)); R.celCli.position.set(-1.5, 1.35, -0.75); R.celCli.rotation.x = -0.6; ap.add(R.celCli);

    // os corretores (cenas 5 e 6)
    R.corretores = [];
    const dados = [["Ana Lima", "AL", "#1b6b5a", 0x1b6b5a, 3, true], ["Bruno Reis", "BR", "#2f5ea8", 0x2f5ea8, 1, false], ["Paula Souza", "PS", "#b1268f", 0xb1268f, 0, true]];
    dados.forEach(([nome, ini, corC, corH, pele, longo], k) => {
      const b = boneco({ camisa: corH, calca: 0x1d2433, pele, longo, cabelo: longo ? 0x3a2416 : 0x1b1410 });
      b.g.position.set(-28 + k * 4, 0, 6); scene.add(b.g);
      const c = cartao(nome, ini, corC); c.position.set(-28 + k * 4, 4.0, 6); scene.add(c);
      const barra = caixa(1.0, 1, 1.0, mat(0x1f9d6b, { emissive: 0x0f5a3c, emissiveIntensity: 0.4 }));
      barra.geometry.translate(0, 0.5, 0); barra.position.set(-28 + k * 4, 2.9, 6); scene.add(barra);
      R.corretores.push({ b, c, barra, alvo: [3.2, 1.8, 2.4][k] });
    });
    R.numeros = [12, 7, 9].map((v, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ transparent: true, map: textura(512, 256, (ctx, w, h) => {
        ctx.fillStyle = "#ffffff"; ctx.font = "700 150px Figtree, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(v + "", w / 2, h / 2 + 8);
      }) }));
      m.position.set(-28 + k * 4, 0, 6.6); scene.add(m); return m;
    });
    // a casa do cliente e o envelope (cena 6)
    const casa = new THREE.Group(); casa.position.set(-15, 0, 15); scene.add(casa);
    const cb = caixa(4, 3, 4, mat(0xf5f7fb)); cb.position.y = 1.5; casa.add(cb);
    const tel = new THREE.Mesh(new THREE.ConeGeometry(3.3, 2, 4), mat(0xe0484d)); tel.position.y = 4; tel.rotation.y = Math.PI / 4; tel.castShadow = true; casa.add(tel);
    R.env = new THREE.Group(); scene.add(R.env);
    const e1 = caixa(1.2, 0.8, 0.08, mat(0xffffff)); R.env.add(e1);
    const aba = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.5, 4, 1), mat(0xe6ebf2)); aba.rotation.set(Math.PI / 2, Math.PI / 4, 0); aba.scale.set(1, 0.2, 0.62); aba.position.set(0, 0.12, 0.06); R.env.add(aba);
    // as ligações do final (cena 7)
    R.lig = [];
    const pts = [[0, 15, -12], [11, 12, -11], [30, 4.5, 6], [-24, 5, 6], [-15, 5, 15]];
    for (let i = 1; i < pts.length; i++) {
      const a = new THREE.Vector3(...pts[0]), b = new THREE.Vector3(...pts[i]);
      const meio = a.clone().add(b).multiplyScalar(0.5); meio.y += 8;
      const curva = new THREE.QuadraticBezierCurve3(a, meio, b);
      const geo = new THREE.TubeGeometry(curva, 48, 0.18, 6, false);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x7fa6ec }));
      geo.setDrawRange(0, 0); scene.add(m); R.lig.push(m);
    }
    pronto = true;
  }

  // ---------- câmera: posições-chave (t, posição, alvo); chave repetida = corte ----------
  const CAM = [
    [0, [0.3, 2.3, 5.4], [0.4, 1.95, 0]],
    [5.4, [0.6, 2.6, 6.6], [0.4, 2.0, 0]],
    [9.2, [0, 11, 32], [0, 9.5, -14]],
    [12.4, [3, 10, 27], [0, 10, -14]],
    [12.41, [20, 5, 9], [10, 4, -11]],
    [24.4, [19, 9, 10], [11, 8.5, -11]],
    [24.41, [30, 12, 26], [30, 1, 4]],
    [27.4, [33, 4.6, 15], [28.5, 1.6, 4.0]],
    [32.8, [25.5, 4.6, 15], [28.5, 1.7, 4.0]],
    [32.81, [-24, 4, 26], [-24, 2.6, 6]],
    [43.4, [-23, 4.8, 28], [-24, 3.0, 6]],
    [43.41, [-19, 11, 44], [-21, 3.5, 9]],
    [53.6, [-22, 10, 40], [-22, 4, 8]],
    [53.61, [2, 42, 60], [0, 0, -2]],
    [62.6, [6, 42, 48], [2, 0, -4]],
    [62.61, [6, 42, 48], [2, 0, -4]],
    [80, [-10, 30, 52], [2, 2, -4]],
  ];
  function poseCamera(t) {
    let i = 0; while (i < CAM.length - 2 && t >= CAM[i + 1][0]) i++;
    const [t0, p0, a0] = CAM[i], [t1, p1, a1] = CAM[i + 1];
    const k = suave(t, t0, t1);
    camera.position.set(mix(p0[0], p1[0], k), mix(p0[1], p1[1], k), mix(p0[2], p1[2], k));
    camera.lookAt(mix(a0[0], a1[0], k), mix(a0[1], a1[1], k), mix(a0[2], a1[2], k));
  }

  // ---------- o quadro no tempo t ----------
  function desenhar(t) {
    if (!pronto) return;
    poseCamera(t);
    // cena 1: o feed passa e os imóveis somem
    R.dono.bD.rotation.x = -1.15; R.dono.bD.rotation.z = 0.25; R.dono.bE.rotation.z = -0.1;
    respira(R.dono, t, 0);
    R.dono.cab.rotation.y = 0.35 + Math.sin(t * 0.8) * 0.05;
    R.feed.forEach((m, i) => {
      const y = 0.55 - i * 0.9 + t * 0.55;
      const somem = 1 - suave(t, 2.6, 3.6);
      m.position.y = ((y + 1.4) % 2.8 + 2.8) % 2.8 - 1.4;
      const borda = 1 - suave(Math.abs(m.position.y), 0.32, 0.48);
      m.material.opacity = borda * somem;
    });
    R.pontos.forEach((p, i) => { p.scale.setScalar(volta(t, 1.0 + i * 0.25, 1.4 + i * 0.25)); });
    const celOn = t < 12.4 ? 1 : 0;
    R.cel.visible = !!celOn;

    // cena 2: a cidade sobe
    for (const c of R.cidade) { const s = Math.max(0.001, volta(t, c.t0, c.t0 + 0.9)); c.p.scale.set(1, s, 1); }
    const sh = Math.max(0.001, volta(t, 6.0, 7.4)); R.hero.scale.set(1, sh, 1);
    R.antena.position.y = 17 * sh + 1.2; R.antena.visible = sh > 0.05;
    R.placa.scale.setScalar(volta(t, 8.1, 8.7)); R.placa.visible = t > 8.1;
    const noite = suave(t, 6, 10);
    R.cidade.forEach((c) => (c.p.material.emissiveIntensity = 0.0));

    // cena 3: o link voa e o prédio se monta; depois "publicado"
    const tl0 = 13.4;
    const k = suave(t, tl0, tl0 + 2.2);
    const ini = new THREE.Vector3(14, 6, 2), fim = new THREE.Vector3(11, 1.2, -11);
    R.link.position.set(mix(ini.x, fim.x, k), mix(ini.y, fim.y, k) + Math.sin(k * Math.PI) * 4, mix(ini.z, fim.z, k));
    R.link.rotation.set(t * 1.6, t * 2.1, 0.3);
    R.link.visible = t > tl0 && t < tl0 + 2.3;
    R.link.scale.setScalar(volta(t, tl0, tl0 + 0.4));
    R.andares.forEach((a, i) => {
      const t0 = tl0 + 2.3 + i * 0.55;
      const c = suave(t, t0, t0 + 0.45);
      a.visible = t > t0; a.position.y = 0.625 + i * 1.3 + (1 - c) * 6;
      a.material.opacity = 1;
    });
    const tt = tl0 + 2.3 + 9 * 0.55;
    R.teto.visible = t > tt; R.teto.position.y = 9 * 1.3 + 0.15 + (1 - suave(t, tt, tt + 0.4)) * 6;
    R.selo.visible = t > 21.6; R.selo.scale.setScalar(volta(t, 21.6, 22.1));
    R.selo.lookAt(camera.position);

    // cena 4: tour 360
    R.anel.scale.setScalar(volta(t, 26.2, 27.0)); R.anel.visible = t > 26.2;
    R.anel.rotation.z = t * 0.8;
    respira(R.cliente, t, 1.3);
    R.cliente.bD.rotation.x = -1.1; R.cliente.bE.rotation.x = -1.1; R.cliente.bD.rotation.z = 0.35; R.cliente.bE.rotation.z = -0.35;
    R.cliente.cab.rotation.x = 0.35; R.cliente.cab.rotation.y = Math.sin(t * 0.9) * 0.25;

    // cenas 5 e 6: corretores, cartões, envelope, cliques
    R.corretores.forEach((c, i) => {
      respira(c.b, t, i * 1.7);
      const ac = 34.6 + i * 0.9;
      c.c.scale.setScalar(Math.max(0.001, volta(t, ac, ac + 0.45)) * (1 - suave(t, 49.6, 50.0)) + 0.001);
      c.c.position.y = 4.0 + Math.sin(t * 1.4 + i) * 0.08;
      c.c.visible = t > ac && t < 50.0;
      c.c.lookAt(camera.position.x, c.c.position.y, camera.position.z);
      // aceno quando o cartão aparece
      const ac2 = suave(t, ac, ac + 0.3) * (1 - suave(t, ac + 1.4, ac + 1.8));
      c.b.bD.rotation.z = 2.6 * ac2 + Math.sin(t * 9) * 0.25 * ac2;
      // barras dos cliques no WhatsApp
      const bk = suave(t, 50.0 + i * 0.25, 51.0 + i * 0.25);
      c.barra.visible = bk > 0.01; c.barra.scale.y = Math.max(0.001, bk * c.alvo);
      const num = R.numeros[i]; num.visible = bk > 0.6; num.position.y = 2.9 + bk * c.alvo + 0.6; num.lookAt(camera.position);
    });
    // envelope: da casa do cliente até a Ana
    const ke = suave(t, 46.8, 48.9);
    const a = new THREE.Vector3(-15, 4.2, 15), b = new THREE.Vector3(-28, 2.9, 6.9);
    R.env.visible = t > 46.6 && t < 49.5;
    R.env.position.set(mix(a.x, b.x, ke), mix(a.y, b.y, ke) + Math.sin(ke * Math.PI) * 5, mix(a.z, b.z, ke));
    R.env.rotation.set(0, ke * Math.PI * 2, Math.sin(ke * Math.PI) * 0.4);
    R.env.scale.setScalar(volta(t, 46.6, 47.0) * (1 - suave(t, 49.0, 49.5)) + 0.001);

    // cena 7: tudo ligado
    R.lig.forEach((m, i) => { const c = suave(t, 54.4 + i * 0.6, 55.6 + i * 0.6); m.geometry.setDrawRange(0, Math.floor(c * 48 * 6 * 6)); });

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
