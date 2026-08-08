import Image from "next/image";
import Link from "next/link";
import { ViewTransition } from "react";
import { ehRecente, precoAPartirDe } from "@/lib/format";
import { STATUS_LABEL, type Empreendimento } from "@/lib/types";

/**
 * Card de empreendimento, usado na listagem e na régua de similares.
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
      className="group block overflow-hidden rounded-2xl border border-white/10 bg-ink-900 transition-colors hover:border-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
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

        <span className="text-fluid-xs absolute top-3 left-3 rounded-full bg-ink-950/80 px-3 py-1 font-medium tracking-wide text-brand-200 uppercase backdrop-blur-sm">
          {STATUS_LABEL[e.status]}
        </span>

        {ehRecente(e.criadoEm) && (
          <span className="text-fluid-xs absolute top-3 right-3 rounded-full bg-sand-400/90 px-2.5 py-1 font-medium text-ink-950">
            Novo
          </span>
        )}
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
    </Link>
  );
}
