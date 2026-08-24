"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { rolarPara } from "@/components/motion/lenis";
import { cn } from "@/lib/utils";

export type Secao = { id: string; label: string };

/**
 * Barra de seções da página-portfólio.
 *
 * `sticky` (e não `fixed`) de propósito: ela só precisa acompanhar o
 * conteúdo depois do hero, e sticky não sofre com o containing block que
 * um `transform` de ancestral criaria.
 */
export function NavAncoras({ secoes }: { secoes: Secao[] }) {
  const [ativa, setAtiva] = useState<string | null>(secoes[0]?.id ?? null);
  const progresso = useRef<HTMLSpanElement>(null);

  // Fio de progresso de leitura na base da barra: scaleX acompanha o scroll
  // da página inteira. Transform puro — nunca layout.
  useEffect(() => {
    const barra = progresso.current;
    if (!barra) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const gatilho = ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => {
        barra.style.transform = `scaleX(${self.progress})`;
      },
    });
    return () => gatilho.kill();
  }, []);

  useEffect(() => {
    if (secoes.length === 0) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        // A seção "ativa" é a mais alta entre as que estão cruzando a faixa
        // superior da tela — sem isso, rolar rápido faz o destaque piscar
        // entre duas seções visíveis ao mesmo tempo.
        const visiveis = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visiveis[0]) setAtiva(visiveis[0].target.id);
      },
      { rootMargin: "-88px 0px -65% 0px" },
    );

    const alvos = secoes
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    alvos.forEach((el) => observador.observe(el));

    return () => observador.disconnect();
  }, [secoes]);

  if (secoes.length < 2) return null;

  return (
    <nav
      aria-label="Seções do empreendimento"
      className="sticky top-20 z-30 -mx-4 mb-2 px-4"
    >
      <ul className="scrollbar-none relative flex gap-1 overflow-x-auto rounded-full border border-linha/10 bg-fundo/85 p-1.5 backdrop-blur-xl backdrop-saturate-150">
        <span
          ref={progresso}
          aria-hidden
          className="absolute inset-x-4 bottom-0 h-px origin-left bg-acento-forte/70"
          style={{ transform: "scaleX(0)" }}
        />
        {secoes.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(ev) => {
                ev.preventDefault();
                rolarPara(s.id);
              }}
              aria-current={ativa === s.id ? "true" : undefined}
              className={cn(
                "text-fluid-sm block rounded-full px-4 py-2 whitespace-nowrap transition-colors",
                ativa === s.id
                  ? "bg-brand-500 font-medium text-white"
                  : "text-apoio hover:text-titulo",
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
