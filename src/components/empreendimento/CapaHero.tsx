"use client";

import Image from "next/image";
import { useRef, ViewTransition } from "react";
import { useCamada } from "@/components/motion/Camada";
import type { Midia } from "@/lib/types";

/**
 * A capa do hero em três planos.
 *
 * Ela já era `fixed inset-0`, o que dá parallax "de graça" — a página
 * desliza por cima de uma foto parada. O que faltava era a foto REAGIR:
 * aqui ela amplia até 12% conforme o scroll avança, e um segundo véu fecha
 * junto, escurecendo a imagem à medida que o conteúdo opaco sobe. Sem esse
 * véu progressivo, a passagem do hero para a primeira banda opaca é um
 * corte seco.
 *
 * O deslocamento é pequeno (8%) de propósito: quem cria a sensação de
 * profundidade é a DIFERENÇA para o conteúdo, que sobe a -18% no `Hero`.
 */
export function CapaHero({ slug, capa }: { slug: string; capa: Midia }) {
  const foto = useRef<HTMLDivElement>(null);
  const veu = useRef<HTMLDivElement>(null);

  useCamada(foto, {
    velocidade: 0.08,
    escala: 1.12,
    aoAtualizar: (progresso) => {
      const el = veu.current;
      if (!el) return;
      el.style.opacity = String(Math.max(0, Math.min(1, progresso)));
    },
  });

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div ref={foto} className="absolute inset-0 will-change-transform">
        <ViewTransition name={`capa-${slug}`}>
          <Image
            src={capa.url}
            alt={capa.alt}
            fill
            priority
            sizes="100vw"
            placeholder={capa.blurDataUrl ? "blur" : "empty"}
            blurDataURL={capa.blurDataUrl ?? undefined}
            className="object-cover"
          />
        </ViewTransition>
      </div>

      {/* Cor literal de propósito: este véu escurece a FOTO de capa para o
          texto branco por cima ficar legível. O fundo dele é a imagem, não a
          página — num tema claro ele continua escuro, senão o texto some. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/15 to-ink-950" />

      {/* Segundo véu, este comandado pelo scroll: fecha a foto conforme o
          conteúdo opaco sobe. */}
      <div ref={veu} className="absolute inset-0 bg-ink-950 opacity-0" />
    </div>
  );
}
