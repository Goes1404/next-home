/* O mundo 3D do vídeo "um dia em 3 áudios": a corretora em seis lugares,
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

  // ---------- o dia da corretora: um palco por cena, ao longo do eixo x ----------
  const PALCO = { a: 0, b: 40, c: 80, d: 120, e: 160, f: 200, g: 240 };
  // [início, fim] de cada cena no vídeo
  const CENA = { a: [0, 4.8], b: [4.8, 14.8], c: [14.8, 25.8], d: [25.8, 36.3], e: [36.3, 43.5], f: [43.5, 52.1], g: [52.1, 70] };
  // quando sai cada áudio (as ondas saem do celular)
  const AUDIOS = [2.4, 2.65, 2.9, 15.4, 26.4, 44.3];
  const AVISOS = [5.9 + 0.4, 37.2, 39.8];

  function corretora() {
    const b = boneco({ camisa: 0x1b2f5c, calca: 0x1b2f5c, pele: 3, longo: true, cabelo: 0x3a2416 });
    const blusa = caixa(0.36, 0.5, 0.05, mat(0xf5f7fb)); blusa.position.set(0, 1.45, 0.33); b.g.add(blusa);
    const cel = new THREE.Group();
    const c1 = caixa(0.2, 0.4, 0.035, mat(0x0b0f1a, { flatShading: false, roughness: 0.3 })); cel.add(c1);
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.36), new THREE.MeshBasicMaterial({ color: 0x9fc3ff }));
    tela.position.z = 0.02; cel.add(tela);
    cel.position.set(0, -0.82, 0.12); cel.rotation.x = 0.4; b.bD.add(cel);
    b.cel = cel; b.telaCel = tela;
    return b;
  }

  function montar() {
    render = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    render.setPixelRatio(1); render.setSize(W, H, false);
    render.outputEncoding = THREE.sRGBEncoding;
    render.shadowMap.enabled = true; render.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fb4e8);
    scene.fog = new THREE.Fog(0x8fb4e8, 30, 80);
    camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);
    R.hemi = new THREE.HemisphereLight(0xdbe8ff, 0x3a4560, 0.8); scene.add(R.hemi);
    R.sol = new THREE.DirectionalLight(0xffe2bd, 1.2); R.sol.position.set(8, 14, 10); R.sol.castShadow = true;
    R.sol.shadow.mapSize.set(2048, 2048); Object.assign(R.sol.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
    R.sol.shadow.bias = -0.0006; scene.add(R.sol); scene.add(R.sol.target);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(400, 80), mat(0x9aa6b8, { flatShading: false, roughness: 0.95 }));
    chao.rotation.x = -Math.PI / 2; chao.position.x = 120; chao.receiveShadow = true; scene.add(chao);

    R.ana = {};
    const por = (k, x, z, ry) => { const b = corretora(); b.g.position.set(PALCO[k] + x, 0, z); b.g.rotation.y = ry || 0; scene.add(b.g); R.ana[k] = b; return b; };

    // a: rua, andando com o celular na boca
    por("a", 0, 0, 0.25);
    for (let i = 0; i < 6; i++) { const p = predio(4, 8 + rnd(i) * 10, 4, [0x4a6aa8, 0x5f7fb8, 0x3a5f9c][i % 3], i); p.position.set(PALCO.a - 12 + i * 5, 0, -9 - rnd(i + 3) * 3); scene.add(p); }
    const calcada = caixa(30, 0.15, 4, mat(0xc9d1dc)); calcada.position.set(PALCO.a, 0.07, 0); scene.add(calcada);
    for (const x of [-4, 4]) { const tr = caixa(0.25, 2.2, 0.25, mat(0x6b4a2f)); tr.position.set(PALCO.a + x, 1.1, -1.6); scene.add(tr);
      const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), mat(0x3f8f5a)); fo.position.set(PALCO.a + x, 2.8, -1.6); fo.castShadow = true; scene.add(fo); }

    // b: cozinha de manhã
    const cz = PALCO.b;
    const pb = caixa(12, 6, 0.3, mat(0xf1e6d6)); pb.position.set(cz, 3, -3); scene.add(pb);
    const jb = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshBasicMaterial({ color: 0xffe0a8 })); jb.position.set(cz + 2.2, 3.1, -2.84); scene.add(jb);
    const bal = caixa(4.5, 1.0, 1.2, mat(0x8b5e3c)); bal.position.set(cz - 0.2, 0.5, -1.6); scene.add(bal);
    const tampo = caixa(4.7, 0.12, 1.4, mat(0xeae4da)); tampo.position.set(cz - 0.2, 1.06, -1.6); scene.add(tampo);
    const xic = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.24, 12), mat(0xffffff)); xic.position.set(cz - 0.9, 1.24, -1.3); scene.add(xic);
    const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat(0x3f8f5a)); pl.position.set(cz - 2.0, 1.5, -1.8); scene.add(pl);
    por("b", 0.6, -0.4, -0.15);

    // c: plantão, com a maquete e o Marcos
    const pc = PALCO.c;
    const mesa = caixa(3, 0.9, 1.6, mat(0xf5f7fb)); mesa.position.set(pc - 0.6, 0.45, -1.8); scene.add(mesa);
    for (let i = 0; i < 4; i++) { const m = caixa(0.45, 0.6 + i * 0.25, 0.45, new THREE.MeshStandardMaterial({ map: texJanela(0xf5f7fb, i), roughness: 0.6 }));
      m.geometry.translate(0, (0.6 + i * 0.25) / 2, 0); m.position.set(pc - 1.6 + i * 0.6, 0.9, -1.8); scene.add(m); }
    const pc2 = caixa(14, 6, 0.3, mat(0xdfe6f0)); pc2.position.set(pc, 3, -4); scene.add(pc2);
    R.placaC = placa("PLANTÃO DE VENDAS", "decorado aberto", 4.4, 1.5); R.placaC.position.set(pc, 4.4, -3.8); scene.add(R.placaC);
    por("c", -0.9, 0.2, 0.3);
    R.marcos = boneco({ camisa: 0x8a8f99, calca: 0x2d3b55, pele: 0, cabelo: 0x2b2b2b });
    R.marcos.g.position.set(pc + 1.2, 0, 0); R.marcos.g.rotation.y = -0.5; scene.add(R.marcos.g);
    const ocul = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 12), mat(0x111111));
    for (const x of [-0.12, 0.12]) { const o = ocul.clone(); o.position.set(x, 0.04, 0.33); R.marcos.cab.add(o); }

    // d: no carro, parada
    const pd = PALCO.d;
    const carro = new THREE.Group(); carro.position.set(pd, 0, 0); scene.add(carro);
    const cor = mat(0xc0392b, { flatShading: false, roughness: 0.35, metalness: 0.2 });
    const base = caixa(4.6, 0.8, 2.2, cor); base.position.set(0, 0.75, 0); carro.add(base);
    const cap = caixa(1.4, 0.35, 2.1, cor); cap.position.set(1.6, 1.3, 0); carro.add(cap);
    const vid = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0), new THREE.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.25 }));
    vid.position.set(0.85, 1.75, 0); vid.rotation.set(0, Math.PI / 2, 0.55); vid.rotation.order = "YXZ"; carro.add(vid);
    for (const [x, z] of [[-1.5, 1.1], [1.5, 1.1], [-1.5, -1.1], [1.5, -1.1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), mat(0x1b1b1b)); r.rotation.x = Math.PI / 2; r.position.set(x, 0.42, z); carro.add(r); }
    const banco = caixa(0.9, 1.0, 0.9, mat(0x2b2f3a)); banco.position.set(-0.6, 1.35, 0.45); carro.add(banco);
    const volante = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 18), mat(0x111111)); volante.position.set(0.55, 1.65, 0.45); volante.rotation.y = Math.PI / 2; volante.rotation.x = 0.4; carro.add(volante);
    const anaD = por("d", -0.15, 0.45, Math.PI / 2 - 0.35);
    anaD.g.position.y = 0.55;
    anaD.g.children[0].rotation.x = anaD.g.children[1].rotation.x = -1.4;
    anaD.g.children[0].position.set(-0.17, 0.62, 0.35); anaD.g.children[1].position.set(0.17, 0.62, 0.35);
    for (let i = 0; i < 4; i++) { const p = predio(4, 6 + rnd(i + 20) * 8, 4, [0x4a6aa8, 0x5f7fb8][i % 2], i + 20); p.position.set(pd - 8 + i * 5.5, 0, -10); scene.add(p); }

    // e: na rua, antes da visita
    const pe = PALCO.e;
    const pr = predio(6, 14, 5, 0xf5f7fb, 2); pr.position.set(pe + 2.5, 0, -6); scene.add(pr);
    const cal2 = caixa(20, 0.15, 4, mat(0xc9d1dc)); cal2.position.set(pe, 0.07, 0); scene.add(cal2);
    por("e", -0.5, 0.3, 0.2);

    // f: sofá à noite
    const pf = PALCO.f;
    const pf1 = caixa(12, 6, 0.3, mat(0x2a3550)); pf1.position.set(pf, 3, -3); scene.add(pf1);
    const sofa = new THREE.Group(); sofa.position.set(pf, 0, -1.4); scene.add(sofa);
    const sm = mat(0x3a5f9c); const s1 = caixa(3.6, 0.6, 1.3, sm); s1.position.y = 0.3; sofa.add(s1);
    const s2 = caixa(3.6, 1.0, 0.35, sm); s2.position.set(0, 0.9, -0.5); sofa.add(s2);
    for (const x of [-1.95, 1.95]) { const s3 = caixa(0.35, 0.8, 1.3, sm); s3.position.set(x, 0.55, 0); sofa.add(s3); }
    const ab = caixa(0.15, 1.8, 0.15, mat(0x333333)); ab.position.set(pf + 2.6, 0.9, -1.6); scene.add(ab);
    const cup = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.5, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd59a, side: THREE.DoubleSide })); cup.position.set(pf + 2.6, 1.95, -1.6); scene.add(cup);
    R.abajur = new THREE.PointLight(0xffc56a, 0, 9); R.abajur.position.set(pf + 2.4, 1.9, -1.2); scene.add(R.abajur);
    const anaF = por("f", -0.3, -1.25, 0);
    anaF.g.position.y = 0.05;
    anaF.g.children[0].rotation.x = anaF.g.children[1].rotation.x = -1.4;
    anaF.g.children[0].position.set(-0.17, 0.62, 0.35); anaF.g.children[1].position.set(0.17, 0.62, 0.35);
    anaF.g.position.y = 0.3;

    // g: escritório, dia em ordem
    const pg = PALCO.g;
    const pg1 = caixa(12, 6, 0.3, mat(0xeef2f7)); pg1.position.set(pg, 3, -3); scene.add(pg1);
    const jg = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.6), new THREE.MeshBasicMaterial({ color: 0xa9c8f5 })); jg.position.set(pg + 1.5, 3.2, -2.84); scene.add(jg);
    const mg = caixa(3.2, 0.12, 1.4, mat(0x8b5e3c)); mg.position.set(pg, 1.0, -0.9); scene.add(mg);
    for (const x of [-1.4, 1.4]) { const pe2 = caixa(0.12, 1.0, 1.2, mat(0x6b4a2f)); pe2.position.set(pg + x, 0.5, -0.9); scene.add(pe2); }
    const note = caixa(0.9, 0.05, 0.6, mat(0x9aa3b2)); note.position.set(pg + 0.7, 1.09, -1.0); scene.add(note);
    const tl2 = caixa(0.9, 0.6, 0.04, mat(0x9aa3b2)); tl2.position.set(pg + 0.7, 1.4, -1.3); tl2.rotation.x = -0.25; scene.add(tl2);
    por("g", -0.4, 0.2, 0.15);
    R.checks = [0, 1, 2].map((k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ transparent: true, map: textura(256, 256, (ctx, w, h) => {
        ctx.fillStyle = "#1f9d6b"; ctx.beginPath(); ctx.arc(w / 2, h / 2, 120, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 26; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(72, 132); ctx.lineTo(112, 172); ctx.lineTo(186, 92); ctx.stroke();
      }) }));
      m.position.set(pg - 1.3 + k * 0.9, 3.0, 0.4); m.scale.setScalar(0.7); scene.add(m); return m;
    });

    // as ondas do áudio: um conjunto de anéis por áudio
    R.ondas = AUDIOS.map(() => [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 32), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true }));
      scene.add(m); return m;
    }));
    pronto = true;
  }

  const qual = (t) => { for (const k of Object.keys(CENA)) if (t >= CENA[k][0] && t < CENA[k][1]) return k; return "g"; };

  // câmera: plano médio da corretora, empurrando devagar; corte seco entre cenas
  const ENQ = {
    a: [[1.4, 2.6, 10.0], [0.8, 2.4, 8.8], 1.4], b: [[1.4, 2.6, 10.0], [0.8, 2.4, 8.8], 1.35], c: [[0.3, 2.8, 11.0], [0.1, 2.6, 9.8], 1.4],
    d: [[3.6, 2.9, 8.8], [2.9, 2.8, 7.8], 1.95], e: [[1.2, 2.5, 9.8], [0.7, 2.4, 8.7], 1.35], f: [[0.9, 2.4, 9.4], [0.5, 2.3, 8.4], 1.2],
    g: [[1.0, 2.6, 10.0], [-0.4, 3.2, 12.0], 1.45],
  };
  const ALVO = { a: [0.2, 0], b: [0.4, -0.5], c: [-0.2, -0.6], d: [0.1, 0.3], e: [-0.2, 0.2], f: [-0.3, -1.3], g: [-0.2, -0.3] };

  function desenhar(t) {
    if (!pronto) return;
    const k = qual(t), [t0, t1] = CENA[k], x0 = PALCO[k];
    const [p0, p1, ay] = ENQ[k], s = suave(t, t0, t1);
    camera.position.set(x0 + mix(p0[0], p1[0], s), mix(p0[1], p1[1], s), mix(p0[2], p1[2], s));
    camera.lookAt(x0 + ALVO[k][0], ay, ALVO[k][1]);
    R.sol.position.set(x0 + 8, 14, 10); R.sol.target.position.set(x0, 0, 0);

    // a luz do dia: manhã, tarde, fim de tarde, noite
    const noite = k === "f" ? 1 : 0, tarde = k === "e" ? 1 : 0;
    const ceu = new THREE.Color(0x8fb4e8).lerp(new THREE.Color(0xf2a86b), tarde * 0.55).lerp(new THREE.Color(0x0b1834), noite);
    scene.background.copy(ceu); scene.fog.color.copy(ceu);
    R.hemi.intensity = noite ? 0.25 : 0.8; R.sol.intensity = noite ? 0.08 : 1.2;
    R.sol.color.set(tarde ? 0xffb27a : 0xffe2bd);
    R.abajur.intensity = noite ? 1.6 : 0;

    for (const nome of Object.keys(R.ana)) {
      const b = R.ana[nome];
      respira(b, t, nome.charCodeAt(0));
      // falando no celular (perto da boca) ou lendo (na frente do peito)
      const fala = AUDIOS.some((ta) => t > ta - 0.6 && t < ta + 2.2 && qual(ta) === nome) || nome === "a";
      const kf = fala ? 1 : 0;
      b.bD.rotation.x = mix(-1.25, -2.35, kf); b.bD.rotation.z = mix(0.2, 0.55, kf); b.bD.rotation.y = mix(0, -0.4, kf);
      b.bE.rotation.x = nome === "g" ? -0.9 : 0; b.bE.rotation.z = -0.12;
      b.cab.rotation.x = fala ? 0 : 0.28;
      if (nome === "a") { // andando
        b.g.position.z = -0.3 + (t - 0) * 0.35; b.g.children[0].rotation.x = Math.sin(t * 6) * 0.45; b.g.children[1].rotation.x = -Math.sin(t * 6) * 0.45;
        b.bE.rotation.x = -Math.sin(t * 6) * 0.35; b.g.position.y = Math.abs(Math.sin(t * 6)) * 0.06;
      }
      const aviso = AVISOS.some((ta) => t > ta && t < ta + 1.2 && qual(ta) === nome);
      b.telaCel.material.color.set(aviso ? 0xffffff : 0x9fc3ff);
    }
    respira(R.marcos, t, 2.0);
    R.marcos.bD.rotation.z = t > 22.6 && t < 24.2 ? 0.9 + Math.sin(t * 8) * 0.15 : 0.1;

    // ondas do áudio
    R.ondas.forEach((aneis, i) => {
      const ta = AUDIOS[i], b = R.ana[qual(ta)];
      const pos = new THREE.Vector3(); b.cel.getWorldPosition(pos);
      aneis.forEach((m, j) => {
        const c = lin(t, ta + j * 0.3, ta + j * 0.3 + 1.3);
        m.visible = c > 0 && c < 1 && qual(t) === qual(ta);
        m.position.copy(pos); m.lookAt(camera.position);
        m.scale.setScalar(0.4 + c * 2.6); m.material.opacity = (1 - c) * 0.9;
      });
    });
    // os três ✓ no escritório
    R.checks.forEach((m, j) => { const c = volta(t, 56.8 + j * 0.4, 57.3 + j * 0.4); m.visible = t > 56.8 + j * 0.4; m.scale.setScalar(Math.max(0.001, c) * 0.7); m.lookAt(camera.position); });
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
