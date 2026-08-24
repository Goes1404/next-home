"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Número que conta de 0 até o valor ao entrar na viewport.
 *
 * Renderiza o valor FINAL no servidor (SEO e no-JS veem o dado real); o
 * zero só entra quando o GSAP assume, então nunca há flash de "0" para quem
 * não anima. Formata em pt-BR a cada tick — 1.250, não 1250.
 */
export function ContadorNumero({
  valor,
  sufixo = "",
  className,
}: {
  valor: number;
  sufixo?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const estado = { n: 0 };
    const formata = (n: number) => `${Math.round(n).toLocaleString("pt-BR")}${sufixo}`;

    const contexto = gsap.context(() => {
      gsap.to(estado, {
        n: valor,
        duration: 1.6,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        onStart: () => {
          el.textContent = formata(0);
        },
        onUpdate: () => {
          el.textContent = formata(estado.n);
        },
      });
    }, el);

    return () => contexto.revert();
  }, [valor, sufixo]);

  return (
    <span ref={ref} className={className}>
      {valor.toLocaleString("pt-BR")}
      {sufixo}
    </span>
  );
}
