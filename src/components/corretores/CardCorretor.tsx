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
      <GlassSurface
        preset="card"
        className="group relative overflow-hidden flex items-center gap-4 px-5 py-5 transition-all duration-300 hover:border-brand-400/50 hover:bg-gradient-to-r hover:from-brand-950/40 hover:to-azure-950/30"
      >
        <div className="relative shrink-0">
          {corretor.fotoUrl ? (
            <Image
              src={corretor.fotoUrl}
              alt=""
              width={68}
              height={68}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-400/40 transition-all duration-300 group-hover:ring-brand-300 group-hover:shadow-[0_0_15px_rgba(47,214,164,0.35)]"
            />
          ) : (
            <span
              aria-hidden
              className="font-display flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 via-brand-500 to-azure-500 text-lg font-bold text-white ring-2 ring-brand-400/40 transition-all duration-300 group-hover:ring-brand-300 group-hover:shadow-[0_0_15px_rgba(47,214,164,0.35)]"
            >
              {iniciais(corretor.nome)}
            </span>
          )}
          <span
            title="Online"
            className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-[#25D366] ring-2 ring-ink-950 shadow-[0_0_8px_#25D366]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display text-lg text-mist-50 transition-colors group-hover:text-brand-200">
            {corretor.nome}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-full bg-brand-500/15 border border-brand-400/20 px-2 py-0.5 text-fluid-xs font-medium text-brand-300">
              CRECI {corretor.creci}
            </span>
            <span className="text-fluid-xs text-mist-400">Alphaville</span>
          </div>
        </div>

        <span className="text-mist-500 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand-300">
          →
        </span>
      </GlassSurface>
    </Link>
  );
}
