"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { estaNaTela } from "./estaNaTela";

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
 * O elemento nasce VISÍVEL — é o que o servidor entregou e o que o visitante
 * vê antes de qualquer JavaScript. Até 13/09/2026 ele nascia com
 * `.gsap-pending` (opacidade 0) e esperava o GSAP hidratar para aparecer:
 * no celular de referência isso custava um LCP de 10,6 s, 99% dele "atraso
 * de renderização". A regra agora é a de `estaNaTela`: o que já está na
 * viewport quando o JS chega fica como está; só o que ainda não foi visto
 * ganha a entrada. Se o JS falhar ou o usuário pedir menos movimento, nada
 * muda — o conteúdo simplesmente está lá.
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

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Já na tela quando o JS chegou: o visitante pode estar lendo. Esconder
    // para revelar de novo é piscar — e atrasar o LCP em segundos.
    if (estaNaTela(el)) return;

    gsap.registerPlugin(ScrollTrigger);

    const alvos = stagger ? Array.from(el.children) : [el];
    const contexto = gsap.context(() => {
      gsap.set(alvos, { opacity: 0, ...DESLOCAMENTO[from] });

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
    <Tag ref={ref as never} className={className}>
      {children}
    </Tag>
  );
}
