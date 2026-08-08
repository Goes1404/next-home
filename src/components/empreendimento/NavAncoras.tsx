"use client";

import { useEffect, useState } from "react";
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
      <ul className="scrollbar-none flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-ink-950/85 p-1.5 backdrop-blur-xl backdrop-saturate-150">
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
                  : "text-mist-300 hover:text-mist-50",
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
