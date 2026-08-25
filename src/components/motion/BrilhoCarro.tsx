"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Reflexo especular sobre o card — a luz correndo por uma lataria.
 *
 * Duas camadas, porque reflexo em superfície polida não é um borrão só:
 *
 * 1. A FAIXA: uma banda estreita e inclinada, com núcleo quase branco e
 *    queda rápida para os lados. É ela que dá o "risco de luz" que se
 *    reconhece num carro — um halo redondo sozinho parece lanterna, não
 *    reflexo.
 * 2. O HALO: um clarão largo e fraco em volta do ponteiro, que é a luz
 *    espalhada pela tinta. Sem ele a faixa parece um adesivo deslizando.
 *
 * `mix-blend-mode: screen` porque luz SOMA: sobre a foto escura da capa o
 * reflexo acende o que já está lá, em vez de pintar uma película branca por
 * cima (que é o que `opacity` puro faz, e o resultado lava a foto).
 *
 * ## Como ele se move, e por que difere entre mouse e dedo
 *
 * No mouse a faixa PERSEGUE o ponteiro: quem anda em volta do carro é o
 * observador, e o reflexo se desloca com ele. É a leitura correta do gesto e
 * não custa nada — um `quickTo` de transform, sem layout.
 *
 * No toque não existe ponteiro para seguir, e o dedo cobre justamente o
 * ponto que brilharia. Lá a luz passa UMA vez quando o card entra na tela:
 * o card cruza a faixa de luz enquanto a pessoa rola, que é o mesmo efeito
 * visto do outro referencial.
 *
 * Nada aqui pede layout (só `transform` e `opacity`), o elemento é
 * `pointer-events-none` — nunca rouba o clique do link do card — e com
 * `prefers-reduced-motion` o componente não desenha nada.
 *
 * O elemento se pendura no PAI (`parentElement`): quem chama é um Server
 * Component (CardEmpreendimento) e não tem ref para oferecer. O contrato é
 * o pai ser `relative` e `overflow-hidden` — o que o `GlassSurface` já é.
 */
export function BrilhoCarro({ intensidade = 1 }: { intensidade?: number }) {
  const raiz = useRef<HTMLSpanElement>(null);
  const faixa = useRef<HTMLSpanElement>(null);
  const halo = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = raiz.current;
    const banda = faixa.current;
    const clarao = halo.current;
    const pai = el?.parentElement;
    if (!el || !banda || !clarao || !pai) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const fino = window.matchMedia("(pointer: fine)");

    // ---- Mouse: o reflexo persegue o ponteiro -------------------------
    if (fino.matches) {
      const moverBanda = gsap.quickTo(banda, "xPercent", { duration: 0.45, ease: "power2.out" });
      const moverHaloX = gsap.quickTo(clarao, "xPercent", { duration: 0.6, ease: "power2.out" });
      const moverHaloY = gsap.quickTo(clarao, "yPercent", { duration: 0.6, ease: "power2.out" });

      const aoMover = (e: PointerEvent) => {
        const r = pai.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        // A faixa tem 40% da largura do card e nasce centrada: -150..+150
        // leva a borda esquerda até fora, de um lado ao outro.
        moverBanda(-150 + px * 300);
        moverHaloX(-50 + px * 100);
        moverHaloY(-50 + py * 100);
      };

      const aoEntrar = (e: PointerEvent) => {
        aoMover(e);
        gsap.to(el, { opacity: 1, duration: 0.35, ease: "power2.out" });
      };
      const aoSair = () => {
        gsap.to(el, { opacity: 0, duration: 0.5, ease: "power2.out" });
      };

      pai.addEventListener("pointerenter", aoEntrar);
      pai.addEventListener("pointermove", aoMover);
      pai.addEventListener("pointerleave", aoSair);
      return () => {
        pai.removeEventListener("pointerenter", aoEntrar);
        pai.removeEventListener("pointermove", aoMover);
        pai.removeEventListener("pointerleave", aoSair);
        gsap.killTweensOf([el, banda, clarao]);
      };
    }

    // ---- Toque: uma passagem de luz quando o card entra na tela -------
    gsap.registerPlugin(ScrollTrigger);

    const contexto = gsap.context(() => {
      // O halo fica fora do caminho: no toque quem conta é a faixa, e um
      // clarão parado no meio do card viraria mancha.
      gsap.set(clarao, { opacity: 0 });
      gsap.set(banda, { xPercent: -170 });

      gsap
        .timeline({ scrollTrigger: { trigger: pai, start: "top 85%", once: true } })
        .to(el, { opacity: 1, duration: 0.4, ease: "power1.out" })
        .to(banda, { xPercent: 170, duration: 1.5, ease: "power2.inOut" }, 0)
        .to(el, { opacity: 0, duration: 0.5, ease: "power1.in" }, 1.1);
    }, pai);

    return () => contexto.revert();
  }, []);

  return (
    <span
      ref={raiz}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-0 mix-blend-screen"
    >
      {/* A faixa é mais ALTA que o card (`-inset-y-1/2`) porque está
          inclinada: sem a sobra, a rotação descobriria as quinas. */}
      <span
        ref={faixa}
        className="absolute -inset-y-1/2 left-[30%] w-[40%] rotate-[18deg] will-change-transform"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 30%, " +
            `rgba(255,255,255,${0.16 * intensidade}) 44%, rgba(255,255,255,${0.5 * intensidade}) 50%, ` +
            `rgba(255,255,255,${0.16 * intensidade}) 56%, rgba(255,255,255,0.05) 70%, transparent 100%)`,
        }}
      />
      <span
        ref={halo}
        className="absolute inset-[-40%] will-change-transform"
        style={{
          background:
            `radial-gradient(closest-side, rgba(255,255,255,${0.18 * intensidade}), ` +
            `rgba(255,255,255,${0.06 * intensidade}) 45%, transparent 72%)`,
        }}
      />
    </span>
  );
}
