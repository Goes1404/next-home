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

/** Textura de canvas com faixas, para os gigantes gasosos (sem baixar imagem). */
function texturaDeFaixas(THREE: typeof import("three"), cores: [string, string, string], faixas: number) {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  for (let i = 0; i <= faixas; i++) {
    const t = i / faixas;
    grad.addColorStop(t, cores[i % 3]);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  const gasoso = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshStandardMaterial({ map: texturaDeFaixas(THREE, ["#e7caa4", "#874d2d", "#f2e8da"], 11), roughness: 0.9 }),
  );
  gasoso.rotation.z = 0.25;
  const planetaGrande = new THREE.Group();
  planetaGrande.add(gasoso);
  cena.add(planetaGrande);

  const anelado = new THREE.Group();
  const aneladoCorpo = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.MeshStandardMaterial({ map: texturaDeFaixas(THREE, ["#faf2e0", "#bda87f", "#fdf9ee"], 12), roughness: 0.9 }),
  );
  const anel = new THREE.Mesh(
    new THREE.RingGeometry(1.35, 2.2, 96),
    new THREE.MeshStandardMaterial({
      color: 0xe9dcc0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      roughness: 1,
    }),
  );
  anel.rotation.x = Math.PI / 2.35;
  anelado.add(aneladoCorpo, anel);
  anelado.rotation.z = -0.35;
  cena.add(anelado);

  const rochoso = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 5),
    new THREE.MeshStandardMaterial({ map: texturaDeFaixas(THREE, ["#f0b295", "#7c4436", "#c27a5c"], 5), roughness: 1, flatShading: false }),
  );
  cena.add(rochoso);

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
    rochoso.visible = !celular;
    rochoso.scale.setScalar(meiaAltura * 0.05);
    rochoso.position.copy(naTela(0.2, -0.42, -3));
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
    gasoso.rotation.y = t * 0.03;
    aneladoCorpo.rotation.y = t * 0.05;
    rochoso.rotation.y = t * 0.09;

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
