"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Número que conta de 0 até `valor` ao entrar na viewport.
 *
 * Escreve direto no `textContent` do próprio nó via `onUpdate` do GSAP, sem
 * passar pelo estado do React — mais barato a cada frame e evita qualquer
 * fricção com a regra `react-hooks/set-state-in-effect` do projeto, já que
 * não existe `setState` aqui.
 */
export function Contador({ valor, sufixo = "" }: { valor: number; sufixo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = `${valor}${sufixo}`;
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const contador = { n: 0 };
    const contexto = gsap.context(() => {
      gsap.to(contador, {
        n: valor,
        duration: 1.6,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = `${Math.round(contador.n)}${sufixo}`;
        },
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
      });
    }, el);

    return () => contexto.revert();
  }, [valor, sufixo]);

  return <span ref={ref}>0{sufixo}</span>;
}
