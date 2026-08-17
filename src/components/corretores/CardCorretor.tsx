import Image from "next/image";
import Link from "next/link";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { iniciais } from "@/lib/format";
import type { CorretorPerfil } from "@/lib/types";

/**
 * Corretor na vitrine da equipe. Poucos têm foto cadastrada hoje, então o
 * fallback de iniciais não é caso de borda — é o estado comum, e precisa
 * ficar apresentável.
 */
export function CardCorretor({ corretor }: { corretor: CorretorPerfil }) {
  return (
    <Link href={`/corretores/${corretor.slug}`} className="rounded-glass block">
      <GlassSurface preset="card" className="group flex items-center gap-4 px-5 py-5">
        {corretor.fotoUrl ? (
          <Image
            src={corretor.fotoUrl}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg text-mist-50"
          >
            {iniciais(corretor.nome)}
          </span>
        )}

        <div className="min-w-0">
          <p className="font-display text-lg text-mist-50 transition-colors group-hover:text-brand-200">
            {corretor.nome}
          </p>
          <p className="text-fluid-sm text-mist-400">CRECI {corretor.creci}</p>
        </div>
      </GlassSurface>
    </Link>
  );
}
