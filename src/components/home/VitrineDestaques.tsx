"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
import { precoAPartirDe } from "@/lib/format";
import type { Empreendimento } from "@/lib/types";

function CardVitrine({ e, delay }: { e: Empreendimento; delay: number }) {
  return (
    <Reveal delay={delay} from="baixo">
      <Link href={`/empreendimentos/${e.slug}`}>
        <GlassSurface preset="card" className="group overflow-hidden">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-[calc(var(--radius-glass)-1px)]">
            <Image
              src={e.capa.url}
              alt={e.capa.alt}
              fill
              sizes="(min-width: 640px) 380px, 100vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          </div>
          <div className="px-5 py-4">
            <h3 className="font-display text-lg text-mist-50">{e.nome}</h3>
            <p className="text-fluid-sm mt-0.5 text-mist-400">
              {e.bairro}, {e.cidade}
            </p>
            <p className="text-fluid-sm mt-2 font-medium text-brand-200">
              {precoAPartirDe(e.precoAPartir)}
            </p>
          </div>
        </GlassSurface>
      </Link>
    </Reveal>
  );
}

/**
 * Grid de destaques da home com um "ver todos" que expande a própria grid em
 * vez de levar para `/empreendimentos` — o cliente pediu que os demais
 * empreendimentos apareçam mais abaixo na mesma tela, sem navegação.
 */
export function VitrineDestaques({
  destaques,
  outros,
}: {
  destaques: Empreendimento[];
  outros: Empreendimento[];
}) {
  const [expandido, setExpandido] = useState(false);
  const total = destaques.length + outros.length;

  return (
    <>
      <div className="mx-auto mt-10 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        {destaques.map((e, i) => (
          <CardVitrine key={e.slug} e={e} delay={i * 0.12} />
        ))}
        {expandido &&
          outros.map((e, i) => <CardVitrine key={e.slug} e={e} delay={(i % 4) * 0.08} />)}
      </div>

      {!expandido && outros.length > 0 && (
        <Reveal className="mt-10 text-center">
          <button
            type="button"
            onClick={() => setExpandido(true)}
            className="text-fluid-sm font-medium text-brand-200 underline-offset-4 hover:underline"
          >
            Ver todos os {total} empreendimentos ↓
          </button>
        </Reveal>
      )}
    </>
  );
}
