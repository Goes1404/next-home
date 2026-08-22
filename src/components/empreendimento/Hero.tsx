import Image from "next/image";
import { ViewTransition } from "react";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { precoAPartirDe } from "@/lib/format";
import { linkWhatsappPara } from "@/lib/site";
import { STATUS_LABEL, type Empreendimento } from "@/lib/types";

export function Hero({ empreendimento: e }: { empreendimento: Empreendimento }) {
  const link = linkWhatsappPara(
    e.corretor.whatsapp,
    `Olá, ${e.corretor.nome}! Vim pelo site e quero saber mais sobre o ${e.nome}.`,
  );

  return (
    <section className="flex min-h-svh flex-col items-center justify-end px-4 pt-28 pb-16 sm:justify-center sm:pb-0">
      <div className="fixed inset-0 -z-10">
        <ViewTransition name={`capa-${e.slug}`}>
          <Image
            src={e.capa.url}
            alt={e.capa.alt}
            fill
            priority
            sizes="100vw"
            placeholder={e.capa.blurDataUrl ? "blur" : "empty"}
            blurDataURL={e.capa.blurDataUrl ?? undefined}
            className="object-cover"
          />
        </ViewTransition>
        {/* Cor literal de propósito: este véu escurece a FOTO de capa para o
            título branco por cima ficar legível. O fundo dele é a imagem, não a
            página — num tema claro ele continua escuro, senão o texto some. */}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/60 via-ink-950/30 to-ink-950" />
      </div>

      <Reveal className="w-full max-w-2xl">
        <GlassSurface preset="painel" className="px-7 py-8 sm:px-10 sm:py-11">
          <VoltarLink href="/empreendimentos">Empreendimentos</VoltarLink>

          <p className="text-fluid-xs mb-3 flex items-center gap-2 font-medium tracking-[0.18em] text-acento-suave uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
            {STATUS_LABEL[e.status]} · {e.bairro}, {e.cidade}
          </p>

          <h1 className="text-fluid-3xl text-titulo">{e.nome}</h1>
          <p className="text-fluid-base mt-3 text-corpo-suave">{e.tagline}</p>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-linha/10 pt-6">
            <div>
              <p className="text-fluid-xs text-legenda uppercase">Valor</p>
              <p className="text-fluid-lg font-medium text-titulo">
                {precoAPartirDe(e.precoAPartir)}
              </p>
            </div>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400"
            >
              Falar com corretor
            </a>
          </div>
        </GlassSurface>
      </Reveal>
    </section>
  );
}
