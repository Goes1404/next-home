import Image from "next/image";
import { Camada } from "@/components/motion/Camada";
import { ParallaxImagem } from "@/components/motion/ParallaxImagem";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import type { Empreendimento } from "@/lib/types";

import { srcDaMidia } from "@/lib/imagens/variantes";
import { proporcaoNoCelular } from "@/lib/imagens/proporcao";
import { fotoDoSobre } from "./cenasDoShowcase";
/**
 * Sobre, em dupla editorial: texto largo à esquerda, foto com parallax à
 * direita. A ficha técnica saiu daqui — virou a faixa FichaNumeros, onde os
 * dados têm o tamanho que merecem.
 */
export function Sobre({ empreendimento: e }: { empreendimento: Empreendimento }) {
  // Segunda foto da galeria (a capa domina o hero; a 1ª abre a Galeria).
  const foto = fotoDoSobre(e);

  return (
    <section id="sobre" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-16 sm:px-8 sm:pt-24">
      <div className="grid items-start gap-10 lg:grid-cols-[7fr_5fr] lg:gap-16">
        {/* O par foto/texto: a foto desce a +0.20, o texto sobe a -0.07. É a
            DIFERENÇA que se lê como camada — foto sozinha se lê como foto
            grande. */}
        <Camada velocidade={-0.07}>
          <p className="text-fluid-xs mb-4 tracking-[0.22em] text-acento-suave uppercase">
            Sobre o empreendimento
          </p>
          {e.tagline && (
            <TituloEditorial className="font-display text-fluid-2xl leading-snug text-titulo">
              {e.tagline}
            </TituloEditorial>
          )}
          <Reveal from="nenhuma" delay={0.25}>
            <p className={`text-fluid-lg text-corpo-suave leading-relaxed ${e.tagline ? "mt-8" : ""} break-words whitespace-pre-line`}>
              {e.descricao}
            </p>
          </Reveal>
        </Camada>

        {/* A coluna da foto NÃO vira Camada: `sticky` dentro de um elemento
            com transform para de grudar, e é o sticky que segura a foto ao
            lado do texto longo. O parallax dela mora no ParallaxImagem. */}
        {foto && (
          <Reveal from="baixo" className="lg:sticky lg:top-28">
            {/* No celular o quadro segue a foto (ver `proporcaoNoCelular`): um
                retrato 3:4 de um render 2:1 mostrava um terço da fachada. No
                desktop a coluna é estreita e alta, e o 3:4 continua. */}
            <div
              style={{ "--proporcao": proporcaoNoCelular(foto) } as React.CSSProperties}
            >
            <ParallaxImagem
              className="aspect-[var(--proporcao)] rounded-2xl lg:aspect-[3/4]"
              intensidade={20}
            >
              <Image
                src={srcDaMidia(foto)}
                alt={foto.alt}
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                placeholder={foto.blurDataUrl ? "blur" : "empty"}
                blurDataURL={foto.blurDataUrl ?? undefined}
                className="object-cover"
              />
            </ParallaxImagem>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
