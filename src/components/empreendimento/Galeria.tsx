"use client";

import Image from "next/image";
import { useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { Lightbox } from "@/components/ui/Lightbox";
import type { Midia } from "@/lib/types";

export function Galeria({ fotos }: { fotos: Midia[] }) {
  const [aberta, setAberta] = useState<number | null>(null);

  if (fotos.length === 0) return null;

  return (
    <section id="galeria" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-16 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-mist-50">Galeria</h2>
        <p className="text-fluid-base mt-2 text-mist-300">
          {fotos.length} {fotos.length === 1 ? "imagem" : "imagens"}. Toque para ampliar.
        </p>
      </Reveal>

      <Reveal stagger={0.05} className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fotos.map((foto, i) => (
          <button
            key={foto.url}
            type="button"
            onClick={() => setAberta(i)}
            aria-label={`Ampliar imagem ${i + 1} de ${fotos.length}${foto.alt ? `: ${foto.alt}` : ""}`}
            className="group relative aspect-[4/3] overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
          >
            <Image
              src={foto.url}
              alt={foto.alt}
              fill
              sizes="(min-width: 640px) 33vw, 50vw"
              placeholder={foto.blurDataUrl ? "blur" : "empty"}
              blurDataURL={foto.blurDataUrl ?? undefined}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </button>
        ))}
      </Reveal>

      <Lightbox
        itens={fotos}
        indice={aberta}
        aoFechar={() => setAberta(null)}
        aoTrocar={setAberta}
        rotulo="Galeria de fotos"
      />
    </section>
  );
}
