import Image from "next/image";
import { ParallaxImagem } from "@/components/motion/ParallaxImagem";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import type { Empreendimento } from "@/lib/types";

/**
 * Sobre, em dupla editorial: texto largo à esquerda, foto com parallax à
 * direita. A ficha técnica saiu daqui — virou a faixa FichaNumeros, onde os
 * dados têm o tamanho que merecem.
 */
export function Sobre({ empreendimento: e }: { empreendimento: Empreendimento }) {
  // Segunda foto da galeria (a capa domina o hero; a 1ª abre a Galeria).
  const foto = e.galeria.find((f) => f.url !== e.capa.url) ?? e.galeria[0] ?? null;

  return (
    <section id="sobre" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-16 sm:px-8 sm:pt-28">
      <div className="grid items-start gap-10 lg:grid-cols-[7fr_5fr] lg:gap-16">
        <div>
          <p className="text-fluid-xs mb-4 tracking-[0.22em] text-acento-suave uppercase">
            Sobre o empreendimento
          </p>
          <TituloEditorial className="font-display text-fluid-2xl leading-snug text-titulo">
            {e.tagline}
          </TituloEditorial>
          <Reveal from="nenhuma" delay={0.25}>
            <p className="text-fluid-lg mt-8 leading-relaxed whitespace-pre-line text-corpo-suave">
              {e.descricao}
            </p>
          </Reveal>
        </div>

        {foto && (
          <Reveal from="baixo" className="lg:sticky lg:top-28">
            <ParallaxImagem className="aspect-[3/4] rounded-2xl" intensidade={10}>
              <Image
                src={foto.url}
                alt={foto.alt}
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                placeholder={foto.blurDataUrl ? "blur" : "empty"}
                blurDataURL={foto.blurDataUrl ?? undefined}
                className="object-cover"
              />
            </ParallaxImagem>
          </Reveal>
        )}
      </div>
    </section>
  );
}
