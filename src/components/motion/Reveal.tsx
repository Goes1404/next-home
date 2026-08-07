"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

type Direcao = "cima" | "baixo" | "esquerda" | "direita" | "nenhuma";

const DESLOCAMENTO: Record<Direcao, { x?: number; y?: number }> = {
  cima: { y: 28 },
  baixo: { y: -28 },
  esquerda: { x: 28 },
  direita: { x: -28 },
  nenhuma: {},
};

export type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** De onde o elemento entra. */
  from?: Direcao;
  delay?: number;
  duration?: number;
  /** Anima os filhos diretos em cascata em vez do elemento inteiro. */
  stagger?: number;
  as?: "div" | "section" | "ul" | "li" | "header" | "article";
};

/**
 * Revela o conteúdo ao entrar na viewport.
 *
 * O elemento nasce com `.gsap-pending` (opacidade 0 via CSS) para não piscar
 * antes da hidratação. Se o JS falhar ou o usuário pedir menos movimento, a
 * classe `motion-off` no `<html>` devolve a opacidade e nada fica invisível.
 */
export function Reveal({
  children,
  className,
  from = "cima",
  delay = 0,
  duration = 0.9,
  stagger,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.remove("gsap-pending");
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const alvos = stagger ? Array.from(el.children) : [el];
    const contexto = gsap.context(() => {
      gsap.set(alvos, { opacity: 0, ...DESLOCAMENTO[from] });
      // Só agora o CSS pode soltar o elemento: o GSAP já controla a opacidade.
      el.classList.remove("gsap-pending");

      gsap.to(alvos, {
        opacity: 1,
        x: 0,
        y: 0,
        duration,
        delay,
        stagger: stagger ?? 0,
        ease: "power3.out",
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          once: true,
        },
      });
    }, el);

    return () => contexto.revert();
  }, [from, delay, duration, stagger]);

  return (
    <Tag ref={ref as never} className={cn("gsap-pending", className)}>
      {children}
    </Tag>
  );
}
