"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { registrarLenis } from "./lenis";

/**
 * Liga o scroll suave (Lenis) ao ScrollTrigger do GSAP.
 *
 * Os dois precisam compartilhar o mesmo relógio: sem isso o ScrollTrigger lê
 * uma posição de scroll defasada e as animações disparam no lugar errado.
 * Por isso o Lenis roda dentro do ticker do GSAP, e não em um rAF próprio.
 */
export function SmoothScroll() {
  useEffect(() => {
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    gsap.registerPlugin(ScrollTrigger);
    // Sinaliza para o CSS que as animações estão desligadas, para que os
    // elementos com `.gsap-pending` apareçam mesmo sem GSAP atuando.
    document.documentElement.classList.toggle("motion-off", reduzido);

    if (reduzido) {
      ScrollTrigger.refresh();
      return;
    }

    const lenis = new Lenis({
      lerp: 0.11,
      smoothWheel: true,
      // No toque, o scroll nativo é mais previsível e não briga com o
      // gesto de "puxar para atualizar".
      syncTouch: false,
    });

    registrarLenis(lenis);
    lenis.on("scroll", ScrollTrigger.update);

    const aoTick = (tempo: number) => lenis.raf(tempo * 1000);
    gsap.ticker.add(aoTick);
    // Sem isso o GSAP "recupera" frames perdidos e o scroll salta ao voltar
    // para a aba.
    gsap.ticker.lagSmoothing(0);

    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(aoTick);
      registrarLenis(null);
      lenis.destroy();
    };
  }, []);

  return null;
}
