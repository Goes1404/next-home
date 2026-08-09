import Link from "next/link";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
import { linkWhatsapp } from "@/lib/site";

export function CtaFinal() {
  return (
    <section className="px-4 pb-24">
      <Reveal className="mx-auto w-full max-w-2xl">
        <GlassSurface preset="painel" className="px-7 py-10 text-center sm:px-12 sm:py-14">
          <h2 className="text-fluid-2xl text-mist-50">Pronto para conhecer seu próximo endereço?</h2>
          <p className="text-fluid-base mt-3 text-mist-300">
            Fale com um corretor da Next Home agora ou explore o portfólio completo de
            empreendimentos.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={linkWhatsapp()}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-brand-500 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-400"
            >
              Falar no WhatsApp
            </a>
            <Link
              href="/empreendimentos"
              className="rounded-full border border-white/20 px-7 py-3.5 text-sm font-medium text-mist-100 transition-colors hover:border-brand-300/50 hover:text-brand-200"
            >
              Ver todos os empreendimentos
            </Link>
          </div>
        </GlassSurface>
      </Reveal>
    </section>
  );
}
