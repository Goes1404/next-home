"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import type { Midia } from "@/lib/types";

export function Galeria({ fotos }: { fotos: Midia[] }) {
  const [aberta, setAberta] = useState<number | null>(null);

  const fechar = useCallback(() => setAberta(null), []);
  const anterior = useCallback(
    () => setAberta((i) => (i === null ? i : (i - 1 + fotos.length) % fotos.length)),
    [fotos.length],
  );
  const proxima = useCallback(
    () => setAberta((i) => (i === null ? i : (i + 1) % fotos.length)),
    [fotos.length],
  );

  useEffect(() => {
    if (aberta === null) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") fechar();
      if (ev.key === "ArrowLeft") anterior();
      if (ev.key === "ArrowRight") proxima();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberta, fechar, anterior, proxima]);

  if (fotos.length === 0) return null;

  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-mist-50">Galeria</h2>
        <p className="text-fluid-base mt-2 text-mist-300">{fotos.length} imagens.</p>
      </Reveal>

      <Reveal stagger={0.05} className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fotos.map((foto, i) => (
          <button
            key={foto.url}
            type="button"
            onClick={() => setAberta(i)}
            className="focus-visible:outline-brand-300 relative aspect-[4/3] overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Image
              src={foto.url}
              alt={foto.alt}
              fill
              sizes="(min-width: 640px) 33vw, 50vw"
              className="object-cover transition-transform duration-500 hover:scale-105"
            />
          </button>
        ))}
      </Reveal>

      {aberta !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={fotos[aberta].alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950 p-4"
          onClick={fechar}
        >
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar galeria"
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-mist-50 hover:bg-white/20"
          >
            ✕
          </button>

          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              anterior();
            }}
            aria-label="Imagem anterior"
            className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-mist-50 hover:bg-white/20 sm:left-6"
          >
            ‹
          </button>

          <div
            className="relative aspect-[4/3] w-full max-w-3xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <Image
              src={fotos[aberta].url}
              alt={fotos[aberta].alt}
              fill
              sizes="(min-width: 768px) 768px, 100vw"
              className="object-contain"
              priority
            />
          </div>

          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              proxima();
            }}
            aria-label="Próxima imagem"
            className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-mist-50 hover:bg-white/20 sm:right-6"
          >
            ›
          </button>
        </div>
      )}
    </section>
  );
}
