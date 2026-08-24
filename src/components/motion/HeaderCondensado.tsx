"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * Header que condensa ao sair do topo.
 *
 * Marca `data-condensado` em vez de escrever transform: este elemento
 * contém o MenuMobile, cujo painel é `fixed` num portal — e transform no
 * ancestral criaria containing block, prendendo o menu dentro da barra.
 * Armadilha já paga três vezes neste projeto (Lightbox, prévia do Lazer,
 * menu mobile).
 *
 * O estado é lido no ticker do GSAP (o mesmo do Lenis, ver SmoothScroll) e
 * só escreve quando MUDA de faixa: carimbar atributo a 60fps invalidaria
 * estilo à toa.
 */
const LIMIAR_PX = 80;

export function HeaderCondensado({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let condensado: boolean | null = null;

    const conferir = () => {
      const agora = window.scrollY > LIMIAR_PX;
      if (agora === condensado) return;
      condensado = agora;
      el.dataset.condensado = agora ? "sim" : "nao";
    };

    conferir();
    gsap.ticker.add(conferir);
    return () => gsap.ticker.remove(conferir);
  }, []);

  return (
    <header ref={ref} data-condensado="nao" className={className}>
      {children}
    </header>
  );
}
