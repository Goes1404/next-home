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
  por = "linhas",
}: {
  children: React.ReactNode;
  className?: string;
  as?: Tag;
  delay?: number;
  /**
   * Unidade do reveal. `"linhas"` é o padrão editorial da casa; `"palavras"`
   * faz cada palavra subir da máscara uma após a outra — mais teatral, para
   * o título que abre uma página (referência: "Masked Slide Reveal", 21st.dev
   * semana 15). Em texto longo, palavra a palavra vira desfile: use linhas.
   */
  por?: "linhas" | "palavras";
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

        const porPalavra = por === "palavras";

        split = new SplitText(el, {
          // A máscara acompanha a unidade: mascarar linhas e animar palavras
          // deixaria a palavra saindo por cima da linha vizinha.
          type: porPalavra ? "words,lines" : "lines",
          linesClass: "linha-editorial",
          // O pai de cada pedaço corta o overflow, e o pedaço sobe de trás do
          // corte — sem elemento extra escrito à mão.
          mask: porPalavra ? "words" : "lines",
        });

        el.classList.remove("gsap-pending");

        gsap.from(porPalavra ? split.words : split.lines, {
          yPercent: 110,
          duration: porPalavra ? 0.9 : 1.1,
          delay,
          stagger: porPalavra ? 0.055 : 0.09,
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
  }, [delay, por]);

  return (
    // Junção crua de propósito: o twMerge do `cn` não conhece os utilitários
    // customizados `text-fluid-*` e os descarta ao ver um `text-<cor>` junto.
    <TagName ref={ref as never} className={["gsap-pending", className].filter(Boolean).join(" ")}>
      {children}
    </TagName>
  );
}
