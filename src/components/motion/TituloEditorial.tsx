"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

type Tag = "h1" | "h2" | "h3" | "p";

/**
 * Título editorial: as linhas sobem de dentro de uma máscara, uma a uma.
 *
 * É o reveal de tipografia das páginas públicas — mais teatral que o Reveal
 * comum, reservado para os títulos que apresentam o produto. O split espera
 * `document.fonts.ready`: dividir antes de a fonte display carregar mede
 * linhas com a fonte errada e as quebras ficam nos lugares errados.
 *
 * Segue o contrato de `.gsap-pending` do Reveal: nasce invisível via CSS e
 * só aparece quando o GSAP assume — com `motion-off`, o CSS devolve a
 * opacidade e o título simplesmente está lá.
 */
export function TituloEditorial({
  children,
  className,
  as: TagName = "h2",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  as?: Tag;
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.remove("gsap-pending");
      return;
    }

    gsap.registerPlugin(ScrollTrigger, SplitText);

    let split: SplitText | null = null;
    let cancelado = false;

    const contexto = gsap.context(() => {
      document.fonts.ready.then(() => {
        if (cancelado) return;

        split = new SplitText(el, {
          type: "lines",
          linesClass: "linha-editorial",
          // Máscara por linha: o pai de cada linha corta o overflow, e a
          // linha sobe de trás do corte — sem elemento extra escrito à mão.
          mask: "lines",
        });

        el.classList.remove("gsap-pending");

        gsap.from(split.lines, {
          yPercent: 110,
          duration: 1.1,
          delay,
          stagger: 0.09,
          ease: "power4.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      });
    }, el);

    return () => {
      cancelado = true;
      split?.revert();
      contexto.revert();
    };
  }, [delay]);

  return (
    // Junção crua de propósito: o twMerge do `cn` não conhece os utilitários
    // customizados `text-fluid-*` e os descarta ao ver um `text-<cor>` junto.
    <TagName ref={ref as never} className={["gsap-pending", className].filter(Boolean).join(" ")}>
      {children}
    </TagName>
  );
}
