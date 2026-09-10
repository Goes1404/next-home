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
      /*
       * O SCROLL DA RODA É O NATIVO desde 10/09/2026, e isso é correção de
       * defeito, não preferência.
       *
       * Relatado como "não consigo arrastar para baixo com o touchpad do
       * notebook". Touchpad não manda um "clique" de roda: manda dezenas de
       * eventos minúsculos por segundo, com a inércia que o próprio sistema
       * já calcula. Com `smoothWheel`, o Lenis descartava essa inércia e
       * reinterpolava tudo com o lerp dele — o dedo andava e a página
       * respondia com atraso e em degraus, que é o que se sente como
       * "travado". Num mouse de rodinha o mesmo código parece bom, e foi por
       * isso que passou.
       *
       * O que o Lenis continua fazendo é o que ele faz bem e ninguém mais
       * faz: `scrollTo` suave para âncora e para o botão de voltar ao topo
       * (ver lenis.ts), e o relógio compartilhado com o ScrollTrigger.
       *
       * De quebra some o trabalho por quadro em toda rolagem — parte do
       * "deixe o site leve" do mesmo pedido.
       */
      smoothWheel: false,
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
