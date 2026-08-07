import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { precoAPartirDe } from "@/lib/format";
import { site } from "@/lib/site";
import { getEmpreendimentos } from "@/lib/queries";
import { STATUS_LABEL } from "@/lib/types";

export const metadata: Metadata = {
  title: "Empreendimentos",
  description: `Lançamentos e oportunidades em ${site.regioes.join(", ")}.`,
};

/**
 * Listagem provisória (Fase 6 trará busca e filtros). Sem fundo fixo em
 * WebGL aqui de propósito: são muitos cards e nenhuma imagem única
 * representa a página inteira, então os cards usam sombra/borda sólida em
 * vez do liquid glass.
 */
export default async function EmpreendimentosPage() {
  const empreendimentos = await getEmpreendimentos();

  return (
    <GlassBackgroundProvider>
      <SiteHeader />
      <WhatsappCta />

      <main className="flex flex-1 flex-col bg-ink-950 px-4 pt-28 pb-20">
        <Reveal className="mx-auto w-full max-w-5xl">
          <h1 className="text-fluid-2xl text-mist-50">Empreendimentos</h1>
          <p className="text-fluid-base mt-2 text-mist-300">
            {empreendimentos.length} empreendimentos em {site.regioes.join(", ")}.
          </p>
        </Reveal>

        <div className="mx-auto mt-10 grid w-full max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {empreendimentos.map((e, i) => (
            <Reveal key={e.slug} delay={i * 0.06} from="baixo">
              <Link
                href={`/empreendimentos/${e.slug}`}
                className="group block overflow-hidden rounded-2xl border border-white/10 bg-ink-900 transition-colors hover:border-white/20"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  <Image
                    src={e.capa.url}
                    alt={e.capa.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <span className="text-fluid-xs absolute top-3 left-3 rounded-full bg-ink-950/80 px-3 py-1 font-medium tracking-wide text-brand-200 uppercase">
                    {STATUS_LABEL[e.status]}
                  </span>
                </div>
                <div className="px-5 py-4">
                  <h2 className="font-display text-lg text-mist-50">{e.nome}</h2>
                  <p className="text-fluid-sm mt-0.5 text-mist-400">
                    {e.bairro}, {e.cidade}
                  </p>
                  <p className="text-fluid-sm mt-2 font-medium text-brand-200">
                    {precoAPartirDe(e.precoAPartir)}
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </main>
    </GlassBackgroundProvider>
  );
}
