import Image from "next/image";
import Link from "next/link";
import { ViewTransition } from "react";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { ehRecente, precoAPartirDe } from "@/lib/format";
import { STATUS_LABEL, type Empreendimento } from "@/lib/types";

/**
 * Card de empreendimento, usado na listagem e na régua de similares.
 *
 * Mesmo vidro (`preset="card"`, CSS-only — ver GlassSurface.tsx) dos cards
 * de destaque na home, para o efeito ficar consistente em todo lugar onde
 * um empreendimento aparece em miniatura.
 *
 * A capa entra num `<ViewTransition>` cujo nome é o slug: o hero da página
 * de detalhe usa o mesmo nome, então o navegador interpola a foto do card
 * até a posição do hero em vez de trocar as duas páginas secamente.
 */
export function CardEmpreendimento({
  empreendimento: e,
  prioridade = false,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
}: {
  empreendimento: Empreendimento;
  /** `priority` na imagem — só para os primeiros cards acima da dobra. */
  prioridade?: boolean;
  sizes?: string;
}) {
  return (
    <Link
      href={`/empreendimentos/${e.slug}`}
      className="block rounded-glass focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
    >
      <GlassSurface preset="card" className="group overflow-hidden">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-[calc(var(--radius-glass)-1px)]">
          <ViewTransition name={`capa-${e.slug}`}>
            <Image
              src={e.capa.url}
              alt={e.capa.alt}
              fill
              sizes={sizes}
              priority={prioridade}
              placeholder={e.capa.blurDataUrl ? "blur" : "empty"}
              blurDataURL={e.capa.blurDataUrl ?? undefined}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          </ViewTransition>

          {/* Cor literal: o selo flutua sobre a capa, e o que precisa
              contrastar com ele é a foto — não a superfície da página. */}
          <span className="text-fluid-xs absolute top-3 left-3 rounded-full bg-ink-950/80 px-3 py-1 font-medium tracking-wide text-acento-suave uppercase backdrop-blur-sm">
            {STATUS_LABEL[e.status]}
          </span>

          {ehRecente(e.criadoEm) && (
            // `text-ink-950` literal: o contraste aqui é com o próprio chip
            // de areia, que é claro nos dois temas.
            <span className="text-fluid-xs absolute top-3 right-3 rounded-full bg-sand-400/90 px-2.5 py-1 font-medium text-ink-950">
              Novo
            </span>
          )}
        </div>

        <div className="px-5 py-4">
          <h3 className="font-display text-lg text-titulo">{e.nome}</h3>
          <p className="text-fluid-sm mt-0.5 text-legenda">
            {e.bairro}, {e.cidade}
          </p>
          <p className="text-fluid-sm mt-2 font-medium text-acento-suave">
            {precoAPartirDe(e.precoAPartir)}
          </p>
        </div>
      </GlassSurface>
    </Link>
  );
}
