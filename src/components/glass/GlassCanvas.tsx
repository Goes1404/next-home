"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Texture, Triangle } from "ogl";
import { fragment, vertex } from "./shaders/glass";
import { useGlassBackground } from "./GlassBackground";

export type GlassCanvasProps = {
  /** Raio do canto em px — deve bater com o `border-radius` do painel. */
  radius: number;
  /** Espessura aparente do vidro, em px. */
  thickness: number;
  refraction: number;
  chromatic: number;
  blur: number;
  /** Amplitude da ondulação; 0 deixa o vidro estático e não gasta frames. */
  liquid: number;
  tint: [number, number, number];
  tintAmount: number;
};

/** Recorte do fundo coberto pelo painel, em coordenadas de textura. */
function recorteDoFundo(
  painel: DOMRect,
  larguraNatural: number,
  alturaNatural: number,
): [number, number, number, number] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // A imagem de fundo é `cover` e centralizada; reproduzimos essa conta para
  // saber exatamente que pedaço dela está sob o painel.
  const escala = Math.max(vw / larguraNatural, vh / alturaNatural);
  const desenhadaW = larguraNatural * escala;
  const desenhadaH = alturaNatural * escala;
  const origemX = (vw - desenhadaW) / 2;
  const origemY = (vh - desenhadaH) / 2;

  const u = (painel.left - origemX) / desenhadaW;
  const largura = painel.width / desenhadaW;
  const altura = painel.height / desenhadaH;
  // O eixo V da textura cresce para cima; o rect do DOM cresce para baixo.
  const v = 1 - (painel.bottom - origemY) / desenhadaH;

  return [u, v, largura, altura];
}

export default function GlassCanvas(props: GlassCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { src } = useGlassBackground();

  // Mantém os parâmetros atuais acessíveis ao loop sem recriar o renderer.
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new Renderer({
      canvas,
      alpha: true,
      antialias: false, // o shader já faz o antisserrilhado da máscara
      premultipliedAlpha: false,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
    const gl = renderer.gl;

    const textura = new Texture(gl, {
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });

    const p = propsRef.current;
    const programa = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      uniforms: {
        tMap: { value: textura },
        uHasTexture: { value: 0 },
        uPanel: { value: [1, 1] },
        uBgRect: { value: [0, 0, 1, 1] },
        uRadius: { value: p.radius },
        uThickness: { value: p.thickness },
        uRefraction: { value: p.refraction },
        uChromatic: { value: p.chromatic },
        uBlur: { value: p.blur },
        uLiquid: { value: p.liquid },
        uTime: { value: 0 },
        uTint: { value: p.tint },
        uTintAmount: { value: p.tintAmount },
      },
    });

    const malha = new Mesh(gl, { geometry: new Triangle(gl), program: programa });

    let naturalW = 0;
    let naturalH = 0;
    let visivel = false;
    let sujo = true;
    let rafId = 0;
    let ultimoFrame = 0;
    const inicio = performance.now();

    const marcarSujo = () => {
      sujo = true;
    };

    function atualizarGeometria() {
      // Mede o PAI, não o canvas: `renderer.setSize()` alguns parágrafos
      // abaixo escreve `style.width/height` fixos no canvas, então medir o
      // próprio canvas depois da primeira chamada só devolveria o valor
      // travado da vez anterior — nunca capturaria o painel crescendo.
      const rect = (canvas!.parentElement ?? canvas!).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      renderer.setSize(rect.width, rect.height);
      programa.uniforms.uPanel.value = [rect.width, rect.height];

      if (naturalW > 0 && naturalH > 0) {
        programa.uniforms.uBgRect.value = recorteDoFundo(rect, naturalW, naturalH);
      }
    }

    function desenhar(agora: number) {
      rafId = requestAnimationFrame(desenhar);
      if (!visivel) return;

      const atual = propsRef.current;
      const animando = atual.liquid > 0;

      // Sem animação, só redesenha quando algo mudou (scroll, resize, textura).
      if (!animando && !sujo) return;
      // Com animação, 30fps já entrega a ondulação e poupa metade da GPU.
      if (animando && !sujo && agora - ultimoFrame < 33) return;

      ultimoFrame = agora;
      sujo = false;

      atualizarGeometria();
      programa.uniforms.uTime.value = (agora - inicio) / 1000;
      programa.uniforms.uRadius.value = atual.radius;
      programa.uniforms.uThickness.value = atual.thickness;
      programa.uniforms.uRefraction.value = atual.refraction;
      programa.uniforms.uChromatic.value = atual.chromatic;
      programa.uniforms.uBlur.value = atual.blur;
      programa.uniforms.uLiquid.value = atual.liquid;
      programa.uniforms.uTint.value = atual.tint;
      programa.uniforms.uTintAmount.value = atual.tintAmount;

      renderer.render({ scene: malha });
    }

    // A textura vem do Storage em outro domínio; sem crossOrigin o WebGL a rejeita.
    let img: HTMLImageElement | null = null;
    if (src) {
      img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        naturalW = img!.naturalWidth;
        naturalH = img!.naturalHeight;
        textura.image = img!;
        programa.uniforms.uHasTexture.value = 1;
        marcarSujo();
      };
      img.src = src;
    }

    const observadorVisibilidade = new IntersectionObserver(
      ([entrada]) => {
        visivel = entrada.isIntersecting;
        if (visivel) marcarSujo();
      },
      { rootMargin: "120px" },
    );
    observadorVisibilidade.observe(canvas);

    // Observa o PAI, não o próprio canvas: `renderer.setSize()` (ogl) escreve
    // `style.width/height` em px fixos no canvas a cada frame, o que desliga
    // o `inset-0`/`w-full h-full` que antes o mantinha do tamanho do painel.
    // Depois dessa primeira medição, o canvas some do radar de qualquer
    // ResizeObserver nele mesmo — ele nunca mais muda de tamanho sozinho.
    // Quem continua refletindo o conteúdo real (texto, reflow de fonte) é o
    // painel-pai, então é ele que precisa ser observado para o vidro
    // acompanhar o painel quando a fonte troca (`font-display: swap`) tarde,
    // num carregamento lento.
    const alvoTamanho = canvas.parentElement ?? canvas;
    const observadorTamanho = new ResizeObserver(marcarSujo);
    observadorTamanho.observe(alvoTamanho);

    // Web fonts com `display: swap` re-fluem o texto quando terminam de
    // carregar — se isso acontecer depois da primeira medição (comum em
    // conexão lenta), o painel muda de altura e o vidro precisa remedir.
    document.fonts?.ready?.then(marcarSujo);

    // O recorte do fundo muda a cada pixel de scroll, então redesenhamos.
    window.addEventListener("scroll", marcarSujo, { passive: true });
    window.addEventListener("resize", marcarSujo);

    rafId = requestAnimationFrame(desenhar);

    return () => {
      cancelAnimationFrame(rafId);
      observadorVisibilidade.disconnect();
      observadorTamanho.disconnect();
      window.removeEventListener("scroll", marcarSujo);
      window.removeEventListener("resize", marcarSujo);
      if (img) img.onload = null;
      // Devolve o contexto explicitamente; o GC do navegador demora demais e a
      // cota de contextos WebGL é pequena.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
    />
  );
}
