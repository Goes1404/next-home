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
 * Quantas fotos da grade aparecem antes do "Ver mais".
 *
 * Seis é o que fecha duas fileiras no desktop (3 colunas) e três no celular
 * (2 colunas) — a grade termina reta, sem uma sobra solitária que pareça
 * corte acidental. Cadastro com 30 fotos entregava 30 `<Image>` de uma vez
 * na primeira pintura e empurrava o resto da página para longe do polegar;
 * quem quer ver tudo pede, e o Lightbox continua percorrendo o acervo
 * INTEIRO desde o primeiro clique — o corte é de exibição, não de acervo.
 */
const FOTOS_ANTES_DE_VER_MAIS = 6;

/**
 * Mosaico editorial: a primeira foto abre em destaque com parallax, as
 * demais entram num grid que alterna proporções — ritmo de revista, não
 * tabela de miniaturas. Tudo continua clicável para o Lightbox.
 */
export function Galeria({ fotos }: { fotos: Midia[] }) {
  const [aberta, setAberta] = useState<number | null>(null);
  // A miniatura clicada, para o lightbox abrir A PARTIR dela (shared element).
  const [origem, setOrigem] = useState<HTMLElement | null>(null);
  const [tudoVisivel, setTudoVisivel] = useState(false);

  const abrir = (i: number, ev: React.MouseEvent<HTMLButtonElement>) => {
    setOrigem(ev.currentTarget);
    setAberta(i);
  };

  if (fotos.length === 0) return null;

  const [destaque, ...resto] = fotos;
  const visiveis = tudoVisivel ? resto : resto.slice(0, FOTOS_ANTES_DE_VER_MAIS);
  const escondidas = resto.length - visiveis.length;

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
          onClick={(ev) => abrir(0, ev)}
          aria-label={`Ampliar imagem 1 de ${fotos.length}${destaque.alt ? `: ${destaque.alt}` : ""}`}
          className="group block w-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
        >
          {/* A foto de abertura é grande o bastante para aguentar o dobro da
              intensidade das demais — é ela que dá o tom da seção. */}
          <ParallaxImagem className="aspect-[16/9] w-full rounded-2xl" intensidade={18}>
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
          {visiveis.map((foto, i) => (
            <CartaoTilt
              key={foto.url}
              indice={i}
              // Coluna 1 a 0.06, coluna 2 a 0.12, coluna 3 a 0.18. É a
              // diferença ENTRE colunas que produz o ritmo de revista; todas
              // no mesmo passo pareceria a grade inteira tremendo junta.
              velocidadeCamada={0.06 + (i % 3) * 0.06}
              className={
                "overflow-hidden rounded-2xl " +
                // Ritmo do mosaico: a cada bloco de 5, a primeira célula é
                // retrato e alta; as outras, paisagem — revista, não tabela.
                (i % 5 === 0 ? "row-span-2 aspect-[3/4]" : "aspect-[4/3]")
              }
            >
              <button
                type="button"
                onClick={(ev) => abrir(i + 1, ev)}
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

      {escondidas > 0 && (
        <Reveal from="nenhuma">
          <div className="mt-8 flex justify-center sm:mt-10">
            <button
              type="button"
              onClick={() => setTudoVisivel(true)}
              /* Botão largo no celular: é alvo de polegar, e a seção inteira
                 depende dele para revelar o resto do acervo. */
              className="text-fluid-sm min-h-[48px] w-full max-w-xs cursor-pointer rounded-full border border-linha-forte bg-superficie/70 px-6 font-medium text-titulo backdrop-blur transition-colors hover:border-acento hover:text-acento-suave focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte sm:w-auto"
            >
              Ver mais {escondidas} {escondidas === 1 ? "foto" : "fotos"}
            </button>
          </div>
        </Reveal>
      )}

      <Lightbox
        itens={fotos}
        indice={aberta}
        origem={origem}
        aoFechar={() => setAberta(null)}
        aoTrocar={setAberta}
        rotulo="Galeria de fotos"
      />
    </section>
  );
}
