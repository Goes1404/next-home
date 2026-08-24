"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Fundo de partículas: pontinhos que desenham um skyline de prédios e, ao
 * rolar a página, se reorganizam num skyline DIFERENTE — três cidades ao
 * longo do scroll. O dedo (ou mouse) afasta os pontos ao passar.
 *
 * SÓ NO CELULAR, de propósito: é o par do corte do vídeo de fundo (14,8 MB
 * que não baixam mais no mobile). O desktop mantém o vídeo com scrub, que é
 * assinatura da casa; o celular ganha um fundo vivo que custa zero de rede —
 * é canvas 2D local, ~900 pontos, DPR limitado a 2.
 *
 * Decisões de custo:
 * - O laço roda no ticker do GSAP (mesmo relógio do Lenis/ScrollTrigger);
 *   aba oculta = rAF parado = zero trabalho.
 * - O progresso do scroll vem de um ScrollTrigger 0→max, não de listener
 *   próprio de scroll.
 * - `prefers-reduced-motion` desliga o componente inteiro — quem pediu menos
 *   movimento fica com o gradiente estático do layout, como hoje.
 */

const CONSULTA_MOBILE = "(max-width: 767px)";
const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";

function podeExibir(): boolean {
  if (window.matchMedia(CONSULTA_MOVIMENTO).matches) return false;
  return window.matchMedia(CONSULTA_MOBILE).matches;
}

function inscrever(aoMudar: () => void): () => void {
  const mobile = window.matchMedia(CONSULTA_MOBILE);
  const movimento = window.matchMedia(CONSULTA_MOVIMENTO);
  mobile.addEventListener("change", aoMudar);
  movimento.addEventListener("change", aoMudar);
  return () => {
    mobile.removeEventListener("change", aoMudar);
    movimento.removeEventListener("change", aoMudar);
  };
}

function usePodeExibir(): boolean {
  return useSyncExternalStore(inscrever, podeExibir, () => false);
}

/** PRNG determinístico: os três skylines são sempre as mesmas três cidades. */
function criarRng(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Ponto = { x: number; y: number };

/**
 * Gera um skyline procedural e o amostra em pontos: contorno de cada prédio
 * (topo e laterais) + grade de janelas acesas. `larg`/`alt` em px de CSS.
 */
function amostrarSkyline(semente: number, larg: number, alt: number, alvoPontos: number): Ponto[] {
  const rng = criarRng(semente);
  const pontos: Ponto[] = [];
  const chao = alt * 0.96;

  let x = -larg * 0.05;
  while (x < larg * 1.05) {
    const w = larg * (0.09 + rng() * 0.13);
    const h = alt * (0.25 + rng() * 0.55);
    const topo = chao - h;

    // Contorno: topo denso, laterais mais ralas — é o que "desenha" o prédio.
    const passoTopo = 7;
    for (let px = x; px < x + w; px += passoTopo) pontos.push({ x: px, y: topo });
    const passoLado = 16;
    for (let py = topo; py < chao; py += passoLado) {
      pontos.push({ x, y: py });
      pontos.push({ x: x + w, y: py });
    }

    // Janelas: grade interna, ~55% acesas.
    const colunas = Math.max(2, Math.floor(w / 14));
    const linhas = Math.max(3, Math.floor(h / 18));
    for (let c = 1; c < colunas; c++) {
      for (let l = 1; l < linhas; l++) {
        if (rng() < 0.55) {
          pontos.push({ x: x + (w * c) / colunas, y: topo + (h * l) / linhas });
        }
      }
    }

    // Antena ocasional nos prédios altos.
    if (h > alt * 0.5 && rng() < 0.4) {
      for (let py = topo - alt * 0.06; py < topo; py += 5) {
        pontos.push({ x: x + w / 2, y: py });
      }
    }

    x += w + larg * (0.015 + rng() * 0.04);
  }

  // Normaliza para o total alvo: sorteio estável (mesmo rng) para o morph
  // ter sempre pares de pontos comparáveis entre os três skylines.
  const escolhidos: Ponto[] = [];
  for (let i = 0; i < alvoPontos; i++) {
    escolhidos.push(pontos[Math.floor(rng() * pontos.length)]);
  }
  return escolhidos;
}

const N_PONTOS = 900;
const SEMENTES = [7, 1301, 90210];

export function SkylineParticulas() {
  const exibir = usePodeExibir();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!exibir || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    gsap.registerPlugin(ScrollTrigger);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let larg = 0;
    let alt = 0;
    let skylines: Ponto[][] = [];

    // Estado por partícula: posição atual + jitter próprio (offset de fase no
    // morph, para os pontos não viajarem todos em bloco).
    const px = new Float32Array(N_PONTOS);
    const py = new Float32Array(N_PONTOS);
    const fase = new Float32Array(N_PONTOS);
    const brilho = new Float32Array(N_PONTOS);
    for (let i = 0; i < N_PONTOS; i++) {
      fase[i] = Math.random() * 0.25;
      brilho[i] = 0.35 + Math.random() * 0.65;
    }

    let progresso = 0;
    const ponteiro = { x: -9999, y: -9999 };

    const cores = { ponto: "154, 230, 197", realce: "212, 180, 131" };
    const lerCores = () => {
      const estilo = getComputedStyle(document.documentElement);
      const bruto = estilo.getPropertyValue("--color-acento-suave").trim();
      // Tokens são hex; converte uma vez por mudança de tema.
      const hex = bruto.startsWith("#") ? bruto : "#6fe7c0";
      const n = parseInt(hex.slice(1), 16);
      cores.ponto = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    };

    const redimensionar = () => {
      larg = window.innerWidth;
      alt = window.innerHeight;
      canvas.width = Math.floor(larg * dpr);
      canvas.height = Math.floor(alt * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      skylines = SEMENTES.map((s) => amostrarSkyline(s, larg, alt, N_PONTOS));
      // Nasce já no primeiro skyline, sem voo inicial do (0,0).
      for (let i = 0; i < N_PONTOS; i++) {
        px[i] = skylines[0][i].x;
        py[i] = skylines[0][i].y;
      }
    };

    const aoMover = (e: PointerEvent) => {
      ponteiro.x = e.clientX;
      ponteiro.y = e.clientY;
    };
    const aoSair = () => {
      ponteiro.x = -9999;
      ponteiro.y = -9999;
    };

    const gatilho = ScrollTrigger.create({
      start: 0,
      // O morph inteiro cabe na SAÍDA do hero: depois dele o conteúdo tem
      // fundo opaco (decisão da reforma da home) e o canvas fica coberto —
      // mapear ao scroll da página toda deixaria a transformação invisível.
      end: () => window.innerHeight * 1.4,
      onUpdate: (self) => {
        progresso = self.progress;
      },
    });

    const observadorTema = new MutationObserver(lerCores);
    observadorTema.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-tema"],
    });

    const tick = () => {
      ctx.clearRect(0, 0, larg, alt);
      if (skylines.length < 3) return;

      // Dois trechos de morph: A→B na primeira metade do scroll, B→C na
      // segunda. A fase individual atrasa/adianta cada ponto um pouco.
      for (let i = 0; i < N_PONTOS; i++) {
        const bruto = progresso * 2;
        const seg = bruto < 1 ? 0 : 1;
        let t = bruto - seg - fase[i];
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        // easing suave no próprio t (smoothstep)
        t = t * t * (3 - 2 * t);

        const a = skylines[seg][i];
        const b = skylines[seg + 1][i];
        const alvoX = a.x + (b.x - a.x) * t;
        const alvoY = a.y + (b.y - a.y) * t;

        // persegue o alvo
        px[i] += (alvoX - px[i]) * 0.08;
        py[i] += (alvoY - py[i]) * 0.08;

        // repulsão do dedo/mouse
        const dx = px[i] - ponteiro.x;
        const dy = py[i] - ponteiro.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 8100 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const forca = ((90 - d) / 90) * 14;
          px[i] += (dx / d) * forca;
          py[i] += (dy / d) * forca;
        }

        ctx.fillStyle = `rgba(${cores.ponto}, ${brilho[i] * 0.9})`;
        ctx.fillRect(px[i] - 1.25, py[i] - 1.25, 2.5, 2.5);
      }
    };

    lerCores();
    redimensionar();
    window.addEventListener("resize", redimensionar);
    window.addEventListener("pointermove", aoMover, { passive: true });
    window.addEventListener("pointerleave", aoSair);
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      gatilho.kill();
      observadorTema.disconnect();
      window.removeEventListener("resize", redimensionar);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerleave", aoSair);
    };
  }, [exibir]);

  if (!exibir) return null;

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
    />
  );
}
