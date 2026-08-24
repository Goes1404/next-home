"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { FundoEmCamadas } from "@/components/motion/FundoEmCamadas";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { fotosDoLazer } from "@/lib/lazerFotos";
import type { Midia } from "@/lib/types";

const semInscricao = () => () => {};

/** `false` no servidor; `true` depois de hidratar. O portal precisa de `document`. */
function useMontado(): boolean {
  return useSyncExternalStore(semInscricao, () => true, () => false);
}

type Aberto = { item: string; foto: Midia };

/**
 * Lazer com prévia da área.
 *
 * MOBILE PRIMEIRO, que é de onde vem o tráfego real (link de WhatsApp):
 * - Toque abre uma prévia ancorada na base da tela, acima do CTA flutuante.
 * - Tocar de novo no mesmo item fecha; tocar em outro troca sem fechar.
 * - Rolar a página fecha. Não trava o scroll nem escurece a tela: é uma
 *   prévia, não um modal — quem quer a foto grande tem a Galeria.
 * No mouse, o mesmo painel abre no `hover`/`focus` (com uma carência curta,
 * para passar o cursor por cima da lista não disparar seis aberturas).
 *
 * O painel vai para um PORTAL porque é `position: fixed` e vive dentro de um
 * `<Reveal>`, que deixa um `transform` aplicado no ancestral — e transform
 * cria containing block, o que ancoraria o painel no lugar errado. Mesma
 * armadilha documentada no Lightbox.
 *
 * Item sem foto correspondente NÃO vira botão (ver `lazerFotos.ts`): não há
 * o que prever, e prometer uma prévia que abre a foto errada é pior do que
 * não ter prévia.
 */
export function Lazer({ itens, fotos = [] }: { itens: string[]; fotos?: Midia[] }) {
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const montado = useMontado();
  const carencia = useRef<ReturnType<typeof setTimeout> | null>(null);

  const comFoto = fotosDoLazer(itens, fotos);

  // Rolagem, Esc e clique fora fecham. O scroll é o gesto mais provável logo
  // depois de olhar a foto no celular — fechar nele evita o painel "grudado".
  useEffect(() => {
    if (!aberto) return;

    const fechar = () => setAberto(null);
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };

    window.addEventListener("scroll", fechar, { passive: true });
    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("scroll", fechar);
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  useEffect(() => () => {
    if (carencia.current) clearTimeout(carencia.current);
  }, []);

  if (itens.length === 0) return null;

  const abrirComCarencia = (item: string, foto: Midia) => {
    if (carencia.current) clearTimeout(carencia.current);
    carencia.current = setTimeout(() => setAberto({ item, foto }), 90);
  };

  const cancelarAbertura = () => {
    if (carencia.current) clearTimeout(carencia.current);
  };

  return (
    // A lista é alvo de toque e a prévia é `fixed` num portal — nada aqui
    // pode ganhar transform. Quem dá profundidade é o fundo.
    <section
      id="lazer"
      className="relative overflow-hidden scroll-mt-24 bg-superficie/40 px-4 py-16 sm:px-8 sm:py-28"
    >
      <FundoEmCamadas intensidade={0.7} />
      <div className="mx-auto max-w-7xl">
        <TituloEditorial className="text-fluid-3xl text-titulo">Lazer</TituloEditorial>
        <Reveal from="nenhuma" delay={0.2}>
          <p className="text-fluid-base mt-3 text-apoio">
            {itens.length} itens de lazer no condomínio.
            {comFoto.size > 0 && " Toque nos destacados para ver a área."}
          </p>
        </Reveal>

        <Reveal
          stagger={0.04}
          from="nenhuma"
          className="mt-10 grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3"
        >
          {itens.map((item) => {
            const foto = comFoto.get(item);

            if (!foto) {
              return (
                <span
                  key={item}
                  className="text-fluid-base flex items-center gap-3 border-b border-linha/10 py-3.5 text-corpo"
                >
                  <span className="h-1 w-1 shrink-0 rounded-full bg-linha/40" />
                  {item}
                </span>
              );
            }

            const ativo = aberto?.item === item;

            return (
              <button
                key={item}
                type="button"
                // min-h-11 = 44px, o alvo de toque mínimo confortável.
                className="text-fluid-base flex min-h-11 w-full items-center gap-3 border-b border-linha/10 py-3.5 text-left text-corpo transition-colors hover:text-titulo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
                aria-expanded={ativo}
                onClick={() => setAberto(ativo ? null : { item, foto })}
                onMouseEnter={() => abrirComCarencia(item, foto)}
                onMouseLeave={cancelarAbertura}
                onFocus={() => setAberto({ item, foto })}
              >
                <span className="h-1 w-1 shrink-0 rounded-full bg-acento-forte" />
                {item}
                <span
                  aria-hidden
                  className="text-fluid-xs ml-auto shrink-0 text-legenda transition-opacity"
                >
                  ver
                </span>
              </button>
            );
          })}
        </Reveal>
      </div>

      {montado &&
        aberto &&
        createPortal(
          <div
            // `bottom-24` no celular: acima do CTA flutuante do WhatsApp
            // (`bottom-4`, z-40), que senão cobriria a legenda da prévia.
            className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex justify-center sm:inset-x-auto sm:right-8 sm:bottom-8"
            role="status"
            aria-live="polite"
          >
            <figure className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-linha/15 bg-fundo/95 shadow-2xl backdrop-blur-xl">
              <div className="relative aspect-[4/3] w-full">
                <Image
                  key={aberto.foto.url}
                  src={aberto.foto.url}
                  alt={aberto.foto.alt}
                  fill
                  sizes="(min-width: 640px) 384px, 100vw"
                  placeholder={aberto.foto.blurDataUrl ? "blur" : "empty"}
                  blurDataURL={aberto.foto.blurDataUrl ?? undefined}
                  className="object-cover"
                />
              </div>
              <figcaption className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-fluid-sm font-medium text-titulo">{aberto.item}</span>
                <button
                  type="button"
                  onClick={() => setAberto(null)}
                  className="text-fluid-xs -mr-2 min-h-11 px-2 text-legenda hover:text-titulo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
                >
                  Fechar
                </button>
              </figcaption>
            </figure>
          </div>,
          document.body,
        )}
    </section>
  );
}
