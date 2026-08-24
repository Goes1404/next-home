"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

/**
 * Moldura de parallax: o filho (uma imagem `fill`) anda mais devagar que o
 * scroll, dando profundidade à foto sem custo de layout — só transform.
 *
 * A imagem é levemente ampliada (`scale`) para o deslocamento nunca expor
 * borda vazia. `intensidade` é o quanto ela percorre, em % da própria
 * altura, do início ao fim da passagem pela viewport.
 */
export function ParallaxImagem({
  children,
  className,
  intensidade = 12,
}: {
  children: React.ReactNode;
  className?: string;
  intensidade?: number;
}) {
  const moldura = useRef<HTMLDivElement>(null);
  const alvo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const quadro = moldura.current;
    const filho = alvo.current;
    if (!quadro || !filho) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const contexto = gsap.context(() => {
      gsap.fromTo(
        filho,
        { yPercent: -intensidade },
        {
          yPercent: intensidade,
          ease: "none",
          scrollTrigger: {
            trigger: quadro,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        },
      );
    }, quadro);

    return () => contexto.revert();
  }, [intensidade]);

  return (
    <div ref={moldura} className={cn("relative overflow-hidden", className)}>
      <div
        ref={alvo}
        className="absolute inset-0"
        style={{ scale: `${1 + (intensidade * 2) / 100}` }}
      >
        {children}
      </div>
    </div>
  );
}
