"use client";

import Image from "next/image";
import { useState } from "react";
import { CartaoTilt } from "@/components/motion/CartaoTilt";
import { ParallaxImagem } from "@/components/motion/ParallaxImagem";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { Lightbox } from "@/components/ui/Lightbox";
import type { Midia } from "@/lib/types";

/**
 * Mosaico editorial: a primeira foto abre em destaque com parallax, as
 * demais entram num grid que alterna proporções — ritmo de revista, não
 * tabela de miniaturas. Tudo continua clicável para o Lightbox.
 */
export function Galeria({ fotos }: { fotos: Midia[] }) {
  const [aberta, setAberta] = useState<number | null>(null);

  if (fotos.length === 0) return null;

  const [destaque, ...resto] = fotos;

  return (
    <section id="galeria" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-8 sm:py-28">
      <div className="mb-10 sm:mb-14">
        <TituloEditorial className="text-fluid-3xl text-titulo">Galeria</TituloEditorial>
        <Reveal from="nenhuma" delay={0.2}>
          <p className="text-fluid-base mt-3 text-apoio">
            {fotos.length} {fotos.length === 1 ? "imagem" : "imagens"}. Toque para ampliar.
          </p>
        </Reveal>
      </div>

      <Reveal>
        <button
          type="button"
          onClick={() => setAberta(0)}
          aria-label={`Ampliar imagem 1 de ${fotos.length}${destaque.alt ? `: ${destaque.alt}` : ""}`}
          className="group block w-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
        >
          <ParallaxImagem className="aspect-[16/9] w-full rounded-2xl" intensidade={8}>
            <Image
              src={destaque.url}
              alt={destaque.alt}
              fill
              sizes="(min-width: 1280px) 1216px, 100vw"
              placeholder={destaque.blurDataUrl ? "blur" : "empty"}
              blurDataURL={destaque.blurDataUrl ?? undefined}
              className="object-cover"
            />
          </ParallaxImagem>
        </button>
      </Reveal>

      {resto.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-3">
          {resto.map((foto, i) => (
            <CartaoTilt
              key={foto.url}
              indice={i}
              className={
                "overflow-hidden rounded-2xl " +
                // Ritmo do mosaico: a cada bloco de 5, a primeira célula é
                // retrato e alta; as outras, paisagem — revista, não tabela.
                (i % 5 === 0 ? "row-span-2 aspect-[3/4]" : "aspect-[4/3]")
              }
            >
              <button
                type="button"
                onClick={() => setAberta(i + 1)}
                aria-label={`Ampliar imagem ${i + 2} de ${fotos.length}${foto.alt ? `: ${foto.alt}` : ""}`}
                className="group absolute inset-0 h-full w-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-acento-forte"
              >
                <Image
                  src={foto.url}
                  alt={foto.alt}
                  fill
                  sizes="(min-width: 1024px) 33vw, 50vw"
                  placeholder={foto.blurDataUrl ? "blur" : "empty"}
                  blurDataURL={foto.blurDataUrl ?? undefined}
                  className="object-cover"
                />
                <span className="absolute inset-0 bg-ink-950/0 transition-colors duration-500 group-hover:bg-ink-950/10" />
              </button>
            </CartaoTilt>
          ))}
        </div>
      )}

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
