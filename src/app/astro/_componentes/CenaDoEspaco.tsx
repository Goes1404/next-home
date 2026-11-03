"use client";

import { useEffect, useRef } from "react";

/**
 * A cena 3D do topo da página de vendas (03/11/2026, "traz o foguete e os
 * planetas do site da empresa também"): o Starship sobre a Terra, um gigante
 * gasoso com anel e um planeta rochoso, com a Via Láctea ao fundo. São os
 * mesmos arquivos do site institucional (astrosolucoes.netlify.app), em
 * `public/espaco/`; a cena em si é nossa, mais simples que a de lá (sem os
 * shaders e partículas próprios).
 *
 * Peso e bateria:
 * - O three.js (~170 KB comprimido) e o modelo (1,1 MB) só são baixados
 *   depois que a página abriu, quando o navegador fica ocioso. Até lá (e se
 *   faltar WebGL, ou com economia de dados) fica o céu de CSS da página, que
 *   já tem o planeta: a cena só aparece por cima quando está pronta.
 * - Só desenha enquanto o topo está na tela (IntersectionObserver) e a aba
 *   está visível.
 * - "Menos movimento": desenha UM quadro, parado, e não acompanha a rolagem.
 *
 * Ao rolar, o foguete sobe e a chama cresce, como a decolagem do site de lá.
 *
 * Modelo: "SpaceX Starship Block 3", de Clarence365 (Sketchfab), licença
 * CC BY 4.0, que exige o crédito: ele está no rodapé do topo (page.tsx).
 */
export function CenaDoEspaco({ className, aoFicarPronta }: { className?: string; aoFicarPronta?: string }) {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;

    const conexao = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conexao?.saveData) return;
    if (!temWebGL()) return;

    let desmontado = false;
    let limpar: (() => void) | undefined;

    const comecar = () => {
      montarCena(elemento, aoFicarPronta)
        .then((fim) => {
          if (desmontado) fim();
          else limpar = fim;
        })
        .catch(() => {
          // Sem a cena, fica o céu de CSS: nada a avisar ao visitante.
        });
    };

    // Safari não tem `requestIdleCallback`: cai no `setTimeout`.
    const temOcioso = "requestIdleCallback" in window;
    const pedido = temOcioso ? window.requestIdleCallback(comecar, { timeout: 1500 }) : window.setTimeout(comecar, 400);

    return () => {
      desmontado = true;
      if (temOcioso) window.cancelIdleCallback(pedido);
      else window.clearTimeout(pedido);
      limpar?.();
    };
  }, [aoFicarPronta]);

  return <div ref={caixa} aria-hidden className={className} />;
}

function temWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function misturar(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function suave(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Gigante gasoso desenhado pixel a pixel (03/11/2026, "deixe os outros
 * planetas mais bonitos também"): faixas que ondulam e se torcem, filetes
 * finos dentro delas, polos mais escuros e, se pedido, uma grande mancha de
 * tempestade. Tudo com senos de período inteiro em x, então a textura fecha
 * sem costura na volta da esfera. 1024×512 (com 512×256 a textura serrilhava
 * no planeta grande) leva algumas dezenas de milissegundos, no ocioso.
 */
function texturaDeGigante(
  THREE: typeof import("three"),
  paleta: { claro: string; escuro: string; meio: string; mancha?: string },
  { faixas, turbulencia, semente }: { faixas: number; turbulencia: number; semente: number },
) {
  const L = 1024;
  const A = 512;
  const c = document.createElement("canvas");
  c.width = L;
  c.height = A;
  const g = c.getContext("2d")!;
  const img = g.createImageData(L, A);
  const claro = rgb(paleta.claro);
  const escuro = rgb(paleta.escuro);
  const meio = rgb(paleta.meio);
  const corDaMancha = paleta.mancha ? rgb(paleta.mancha) : null;
  const fase = (k: number) => Math.sin(semente * 12.9898 + k * 78.233) * 43758.5453 % (Math.PI * 2);
  const [p1, p2, p3, p4] = [fase(1), fase(2), fase(3), fase(4)];
  // A mancha: elipse no hemisfério sul, como a do Júpiter.
  const manchaU = 0.62;
  const manchaV = 0.64;

  for (let y = 0; y < A; y++) {
    const lat = y / A;
    const polo = 0.62 + 0.38 * Math.sin(lat * Math.PI);
    for (let x = 0; x < L; x++) {
      const u = (x / L) * Math.PI * 2;
      // Ondulação das faixas: mais forte perto do Equador, onde o vento é maior.
      const onda =
        turbulencia *
        (0.6 + 0.4 * Math.sin(lat * Math.PI)) *
        (0.02 * Math.sin(u * 3 + lat * 38 + p1) +
          0.011 * Math.sin(u * 7 - lat * 85 + p2) +
          0.006 * Math.sin(u * 11 + lat * 150 + p3) +
          0.003 * Math.sin(u * 19 - lat * 210 + p4));
      const v = lat + onda;
      const larga = 0.5 + 0.5 * Math.sin(v * Math.PI * faixas + 0.8 * Math.sin(v * Math.PI * faixas * 0.37 + p2));
      const fina = 0.5 + 0.5 * Math.sin(v * Math.PI * faixas * 3.1 + 0.6 * Math.sin(u * 2 + v * 30 + p3));
      let cor = misturar(claro, escuro, Math.pow(larga, 1.6));
      cor = misturar(cor, meio, fina * 0.32);

      if (corDaMancha) {
        let du = x / L - manchaU;
        du -= Math.round(du);
        const dx = du / 0.075;
        const dy = (lat - manchaV) / 0.042;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.6) {
          const anel = Math.sin(d * 9 - Math.atan2(dy, dx) * 1.5) * 0.5 + 0.5;
          const dentro = 1 - suave(0.55, 1.15, d);
          cor = misturar(cor, misturar(corDaMancha, meio, anel * 0.35), dentro * 0.9);
          // Borda clara em volta da tempestade.
          cor = misturar(cor, claro, (suave(0.95, 1.15, d) - suave(1.15, 1.6, d)) * 0.5);
        }
      }

      const i = (y * L + x) * 4;
      img.data[i] = cor[0] * polo;
      img.data[i + 1] = cor[1] * polo;
      img.data[i + 2] = cor[2] * polo;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Material dos planetas (não a Terra): luz própria de cada um, sombra suave
 * no lado de trás, borda escurecida (dá volume) e uma névoa de atmosfera só
 * no lado iluminado. Com o halo aditivo de antes, a borda virava um contorno
 * marrom; com a luz da cena, o planeta ficava chapado, todo aceso de frente.
 */
function materialDePlaneta(
  THREE: typeof import("three"),
  mapa: import("three").Texture,
  { luz, tinta = "#ffffff", ar = "#ffe2bf", forcaDoAr = 0.35, relevo = 0 }: {
    luz: [number, number, number];
    tinta?: string;
    ar?: string;
    forcaDoAr?: number;
    relevo?: number;
  },
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMapa: { value: mapa },
      uLuz: { value: new THREE.Vector3(...luz).normalize() },
      uTinta: { value: new THREE.Color(tinta) },
      uAr: { value: new THREE.Color(ar) },
      uForcaDoAr: { value: forcaDoAr },
      uRelevo: { value: relevo },
      // As texturas daqui são todas 1024×512 (canvas e a da Lua).
      uPasso: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vVistaW;
      void main() {
        vUv = uv;
        vec4 mundo = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vVistaW = normalize(cameraPosition - mundo.xyz);
        gl_Position = projectionMatrix * viewMatrix * mundo;
      }`,
    fragmentShader: `
      uniform sampler2D uMapa;
      uniform vec3 uLuz;
      uniform vec3 uTinta;
      uniform vec3 uAr;
      uniform float uForcaDoAr;
      uniform float uRelevo;
      uniform vec2 uPasso;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vVistaW;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 cor = texture2D(uMapa, vUv).rgb * uTinta;
        // Relevo barato (crateras): a diferença de brilho entre vizinhos
        // inclina a luz um pouco.
        if (uRelevo > 0.0) {
          float aqui = dot(texture2D(uMapa, vUv).rgb, vec3(0.333));
          float dx = dot(texture2D(uMapa, vUv + vec2(uPasso.x, 0.0)).rgb, vec3(0.333)) - aqui;
          float dy = dot(texture2D(uMapa, vUv + vec2(0.0, uPasso.y)).rgb, vec3(0.333)) - aqui;
          cor *= clamp(1.0 + (dx - dy) * uRelevo, 0.6, 1.4);
        }
        float luz = dot(n, uLuz);
        float dia = smoothstep(-0.18, 0.55, luz);
        float frente = max(dot(n, vVistaW), 0.0);
        float borda = pow(frente, 0.35);
        vec3 final = cor * (0.035 + 0.95 * dia) * borda;
        // Atmosfera: névoa na borda, só onde bate luz.
        float neblina = pow(1.0 - frente, 2.5) * smoothstep(-0.1, 0.6, luz);
        final += uAr * neblina * uForcaDoAr;
        gl_FragColor = vec4(final, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * Anel com faixas de densidade e a divisão escura (a "de Cassini"), em uma
 * tira radial: u = 0 na borda de dentro, u = 1 na de fora (o UV do anel é
 * refeito por raio em `anelComTextura`).
 */
function texturaDoAnel(THREE: typeof import("three")) {
  const L = 512;
  const c = document.createElement("canvas");
  c.width = L;
  c.height = 4;
  const g = c.getContext("2d")!;
  const img = g.createImageData(L, 4);
  const creme = rgb("#f6ead0");
  const areia = rgb("#c8a878");
  for (let x = 0; x < L; x++) {
    const r = x / L;
    const faixas =
      0.55 + 0.25 * Math.sin(r * 61) + 0.12 * Math.sin(r * 173 + 1.3) + 0.08 * Math.sin(r * 411 + 0.4);
    let alfa = faixas * suave(0, 0.08, r) * (1 - suave(0.9, 1, r));
    alfa *= 1 - 0.92 * (suave(0.55, 0.575, r) - suave(0.615, 0.64, r)); // divisão principal
    alfa *= 1 - 0.6 * (suave(0.83, 0.84, r) - suave(0.85, 0.86, r)); // divisão fina
    const cor = misturar(areia, creme, 0.5 + 0.5 * Math.sin(r * 23 + 0.7));
    for (let y = 0; y < 4; y++) {
      const i = (y * L + x) * 4;
      img.data[i] = cor[0];
      img.data[i + 1] = cor[1];
      img.data[i + 2] = cor[2];
      img.data[i + 3] = Math.max(0, Math.min(1, alfa * 1.15)) * 245;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function anelComTextura(THREE: typeof import("three"), dentro: number, fora: number) {
  const geometria = new THREE.RingGeometry(dentro, fora, 160, 1);
  const pos = geometria.attributes.position;
  const uv = geometria.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - dentro) / (fora - dentro), 0.5);
  }
  return new THREE.Mesh(
    geometria,
    new THREE.MeshStandardMaterial({
      map: texturaDoAnel(THREE),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 1,
    }),
  );
}

/** Brilho radial (chama do motor, halo dos planetas). */
function texturaDeBrilho(THREE: typeof import("three"), paradas: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [t, cor] of paradas) grad.addColorStop(t, cor);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Atmosfera: casca um pouco maior que o planeta, acesa só na borda (fresnel). */
function atmosfera(THREE: typeof import("three"), raio: number, cor: string, forca: number) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Color(cor) }, uForca: { value: forca } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        vec4 mundo = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vVista = normalize(-mundo.xyz);
        gl_Position = projectionMatrix * mundo;
      }`,
    fragmentShader: `
      uniform vec3 uCor;
      uniform float uForca;
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        float borda = pow(1.0 - max(dot(vNormal, vVista), 0.0), 3.2);
        gl_FragColor = vec4(uCor, borda * uForca);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(raio * 1.04, 96, 48), material);
}

async function montarCena(elemento: HTMLDivElement, classePronta?: string): Promise<() => void> {
  const [THREE, { GLTFLoader }, { DRACOLoader }, { RoomEnvironment }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/loaders/DRACOLoader.js"),
    import("three/examples/jsm/environments/RoomEnvironment.js"),
  ]);

  const parado = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fraco = (navigator.hardwareConcurrency ?? 8) <= 4;
  const estreito = () => elemento.clientWidth < 768;

  const renderer = new THREE.WebGLRenderer({ antialias: !fraco, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, fraco ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04);
  cena.environment = ambiente.texture;
  cena.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  // Luz: o "sol" é o clarão do alto à direita (CSS da página).
  const sol = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sol.position.set(6, 5, 6);
  cena.add(sol);
  const contraluz = new THREE.DirectionalLight(0x6f9bff, 1.1);
  contraluz.position.set(-6, 1, -3);
  cena.add(contraluz);
  cena.add(new THREE.HemisphereLight(0x8da9f5, 0x0a1430, 0.35));

  const carregador = new THREE.TextureLoader();
  const textura = (url: string) =>
    new Promise<import("three").Texture>((ok, falha) => carregador.load(url, ok, undefined, falha));

  // ---------- Via Láctea ao fundo ----------
  const [texVia, texTerra, texNuvens] = await Promise.all([
    textura("/espaco/milky-way-2k.webp"),
    textura(estreito() || fraco ? "/espaco/earth-day-1k.webp" : "/espaco/earth-day-2k.webp"),
    textura("/espaco/earth-clouds-1k.webp"),
  ]);
  texVia.colorSpace = THREE.SRGBColorSpace;
  texTerra.colorSpace = THREE.SRGBColorSpace;
  texTerra.anisotropy = 4;

  const via = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texVia, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  via.position.z = -30;
  cena.add(via);

  // ---------- Terra ----------
  const segmentos = estreito() || fraco ? 96 : 160;
  const terra = new THREE.Group();
  const globo = new THREE.Mesh(
    new THREE.SphereGeometry(1, segmentos, segmentos / 2),
    new THREE.MeshStandardMaterial({ map: texTerra, roughness: 0.85, metalness: 0 }),
  );
  const nuvens = new THREE.Mesh(
    new THREE.SphereGeometry(1.008, segmentos, segmentos / 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: texNuvens, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  const ar = atmosfera(THREE, 1, "#9cc2ff", 0.85);
  terra.add(globo, nuvens, ar);
  // Só a parte de cima da esfera aparece: o eixo é tombado para trás (x) para
  // o Equador ficar no alto, e o giro (y) põe a América do Sul de frente
  // (na esfera do three, y = 0 mostra a longitude -90°).
  const GIRO_DA_TERRA = -0.6;
  terra.rotation.set(-1.15, GIRO_DA_TERRA, 0.18);
  cena.add(terra);

  // ---------- Planetas ----------
  const texLua = await textura("/espaco/moon-1k.webp");
  texLua.colorSpace = THREE.SRGBColorSpace;

  // O gigante gasoso, com a grande mancha e um halo quente e fino na borda.
  const gasoso = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 48),
    materialDePlaneta(
      THREE,
      texturaDeGigante(
        THREE,
        { claro: "#f1dcbc", escuro: "#7a3d20", meio: "#c4864f", mancha: "#a8432c" },
        { faixas: 9, turbulencia: 1, semente: 3 },
      ),
      // Luz de cima à esquerda: o lado à vista acende, a sombra cai para a
      // borda da tela.
      { luz: [-0.55, 0.45, 0.7], ar: "#ffd2a0", forcaDoAr: 0.4 },
    ),
  );
  gasoso.rotation.z = 0.22;
  const planetaGrande = new THREE.Group();
  planetaGrande.add(gasoso);
  cena.add(planetaGrande);

  // O anelado: corpo pálido de faixas suaves e um anel com divisões.
  const anelado = new THREE.Group();
  const aneladoCorpo = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    materialDePlaneta(
      THREE,
      texturaDeGigante(
        THREE,
        { claro: "#fbf3e1", escuro: "#c2a477", meio: "#e6d1a8" },
        { faixas: 7, turbulencia: 0.45, semente: 7 },
      ),
      { luz: [0.6, 0.5, 0.6], ar: "#fff0d2", forcaDoAr: 0.35 },
    ),
  );
  const anel = anelComTextura(THREE, 1.3, 2.35);
  anel.rotation.x = Math.PI / 2.3;
  anelado.add(aneladoCorpo, anel);
  anelado.rotation.z = -0.38;
  cena.add(anelado);

  // O rochoso: crateras da textura da Lua, tingidas de vermelho como Marte.
  const rochoso = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    materialDePlaneta(THREE, texLua, { luz: [0.7, 0.4, 0.55], tinta: "#f2a37c", ar: "#ffb48a", forcaDoAr: 0.3, relevo: 6 }),
  );
  const rochosoGrupo = new THREE.Group();
  rochosoGrupo.add(rochoso);
  cena.add(rochosoGrupo);

  // ---------- Starship ----------
  const draco = new DRACOLoader();
  draco.setDecoderPath("/espaco/draco/");
  const gltf = new GLTFLoader();
  gltf.setDRACOLoader(draco);
  const modelo = await gltf.loadAsync("/espaco/starship.glb");
  draco.dispose();

  const foguete = new THREE.Group();
  const corpo = modelo.scene;
  // Deixa o foguete em pé, com a base na origem e altura 1.
  const caixa = new THREE.Box3().setFromObject(corpo);
  const tamanho = caixa.getSize(new THREE.Vector3());
  const maior = Math.max(tamanho.x, tamanho.y, tamanho.z);
  if (maior === tamanho.z) corpo.rotation.x = -Math.PI / 2;
  else if (maior === tamanho.x) corpo.rotation.z = Math.PI / 2;
  corpo.updateMatrixWorld(true);
  const caixaEmPe = new THREE.Box3().setFromObject(corpo);
  const centro = caixaEmPe.getCenter(new THREE.Vector3());
  const altura = caixaEmPe.max.y - caixaEmPe.min.y;
  const ajuste = new THREE.Group();
  corpo.position.sub(new THREE.Vector3(centro.x, caixaEmPe.min.y, centro.z));
  ajuste.add(corpo);
  ajuste.scale.setScalar(1 / altura);
  foguete.add(ajuste);

  const texChama = texturaDeBrilho(THREE, [
    [0, "rgba(255,255,255,1)"],
    [0.18, "rgba(255,226,170,0.95)"],
    [0.45, "rgba(255,150,70,0.45)"],
    [1, "rgba(255,120,40,0)"],
  ]);
  const chama = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texChama, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  chama.center.set(0.5, 0.92);
  foguete.add(chama);
  const luzDaChama = new THREE.PointLight(0xffa25c, 0, 3, 1.6);
  foguete.add(luzDaChama);
  cena.add(foguete);

  // ---------- Encaixe na tela ----------
  let meiaAltura = 1;
  let meiaLargura = 1;
  let alturaDoTopo = 1;
  let baseDoFoguete = 0;
  let alturaDoFoguete = 1;
  const posicionar = () => {
    const largura = elemento.clientWidth;
    const altura = elemento.clientHeight;
    if (!largura || !altura) return;
    alturaDoTopo = altura;
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
    meiaAltura = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    meiaLargura = meiaAltura * camera.aspect;
    const celular = largura < 768;

    // Converte uma posição na TELA (-1 a 1 nos dois eixos) para o mundo, na
    // profundidade z (mais fundo = mais longe da câmera, e menor).
    const naTela = (fx: number, fy: number, z: number) => {
      const fator = (camera.position.z - z) / camera.position.z;
      return new THREE.Vector3(fx * meiaLargura * fator, fy * meiaAltura * fator, z);
    };
    const pxParaMundo = (px: number) => (px / altura) * 2 * meiaAltura;

    // A Terra: uma esfera de verdade no pé do topo, com a curvatura à vista
    // (como no site da empresa), não só a tampa.
    const raio = meiaLargura * (celular ? 1.25 : 0.62);
    const tampa = pxParaMundo(celular ? 150 : 230);
    terra.scale.setScalar(raio);
    terra.position.set(celular ? 0 : -meiaLargura * 0.08, -meiaAltura - raio + tampa, 0);

    // Via Láctea cobrindo o fundo (no plano z = -30).
    const fator = (camera.position.z + 30) / camera.position.z;
    via.scale.set(meiaLargura * 2 * fator * 1.1, meiaAltura * 2 * fator * 1.1, 1);

    // Foguete: em pé à direita, flutuando acima da Terra. No celular, menor e
    // encostado na borda, atrás do texto (como no site da empresa).
    alturaDoFoguete = meiaAltura * 2 * (celular ? 0.5 : 0.7);
    foguete.scale.setScalar(alturaDoFoguete);
    baseDoFoguete = -meiaAltura * (celular ? 0.62 : 0.6);
    foguete.position.set(meiaLargura * (celular ? 0.8 : 0.56), baseDoFoguete, 0.5);

    // Planetas: o gasoso grande meio para fora, no alto à direita, atrás do
    // foguete; o anelado pequeno e longe; o rochoso miúdo.
    planetaGrande.scale.setScalar(meiaAltura * (celular ? 0.42 : 0.62));
    planetaGrande.position.copy(naTela(celular ? 1.05 : 1.02, celular ? 0.62 : 0.42, -8));
    anelado.scale.setScalar(meiaAltura * (celular ? 0.07 : 0.09));
    anelado.position.copy(naTela(celular ? 0.45 : 0.3, celular ? 0.86 : 0.8, -6));
    rochosoGrupo.visible = !celular;
    rochosoGrupo.scale.setScalar(meiaAltura * 0.06);
    rochosoGrupo.position.copy(naTela(0.2, -0.42, -3));
  };

  // ---------- Laço ----------
  let quadro = 0;
  let naTela = true;
  let subida = 0;
  const inicio = performance.now();

  const desenhar = () => {
    const t = parado ? 0 : (performance.now() - inicio) / 1000;
    const alvo = parado ? 0 : Math.min(Math.max(window.scrollY / alturaDoTopo, 0), 1);
    subida += (alvo - subida) * (parado ? 1 : 0.08);

    terra.rotation.y = GIRO_DA_TERRA + t * 0.006;
    nuvens.rotation.y = t * 0.004;
    // −2,95 põe a mancha na parte à vista (o planeta fica meio fora da tela).
    gasoso.rotation.y = -2.95 + t * 0.03;
    aneladoCorpo.rotation.y = t * 0.05;
    rochoso.rotation.y = 1.2 + t * 0.06;

    // Flutua de leve parado; ao rolar, decola (sobe e a chama cresce).
    const empuxo = 0.55 + subida * 1.2;
    const flutua = Math.sin(t * 0.8) * 0.012 * alturaDoFoguete;
    foguete.position.y = baseDoFoguete + flutua + subida * subida * alturaDoFoguete * 1.6;
    foguete.rotation.z = Math.sin(t * 0.5) * 0.015 - 0.04;
    foguete.rotation.y = t * 0.08;
    const tremor = parado ? 1 : 0.9 + Math.sin(t * 31) * 0.06 + Math.sin(t * 17) * 0.04;
    chama.scale.set(0.16 * empuxo * tremor, 0.42 * empuxo * tremor, 1);
    chama.position.y = 0.02;
    luzDaChama.intensity = 1.2 * empuxo * tremor;
    luzDaChama.position.y = -0.04;

    renderer.render(cena, camera);
  };

  const laco = () => {
    quadro = 0;
    if (!naTela || document.hidden) return;
    desenhar();
    if (!parado) quadro = requestAnimationFrame(laco);
  };
  const retomar = () => {
    if (!quadro && naTela && !document.hidden) quadro = requestAnimationFrame(laco);
  };

  posicionar();
  elemento.appendChild(renderer.domElement);
  // Compila antes de mostrar, para a cena não "piscar" em partes.
  await renderer.compileAsync(cena, camera);
  desenhar();
  if (classePronta) elemento.classList.add(classePronta);

  const observador = new IntersectionObserver(([e]) => {
    naTela = e.isIntersecting;
    retomar();
  });
  observador.observe(elemento);
  const aoRedimensionar = new ResizeObserver(() => {
    posicionar();
    if (parado) desenhar();
  });
  aoRedimensionar.observe(elemento);
  document.addEventListener("visibilitychange", retomar);
  retomar();

  return () => {
    cancelAnimationFrame(quadro);
    observador.disconnect();
    aoRedimensionar.disconnect();
    document.removeEventListener("visibilitychange", retomar);
    cena.traverse((o) => {
      const malha = o as import("three").Mesh;
      malha.geometry?.dispose();
      const materiais = Array.isArray(malha.material) ? malha.material : malha.material ? [malha.material] : [];
      for (const m of materiais) {
        for (const valor of Object.values(m)) if (valor instanceof THREE.Texture) valor.dispose();
        m.dispose();
      }
    });
    ambiente.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
