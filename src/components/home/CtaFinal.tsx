import Link from "next/link";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { linkWhatsapp, linkWhatsappPara } from "@/lib/site";

export async function CtaFinal() {
  const corretorAtivo = await getCorretorAtivo();
  const link = corretorAtivo
    ? linkWhatsappPara(corretorAtivo.whatsapp, `Olá, ${corretorAtivo.nome}! Vim pelo site.`)
    : linkWhatsapp();

  return (
    <section className="px-4 pb-24">
      <Reveal className="mx-auto w-full max-w-2xl">
        <GlassSurface preset="painel" className="px-7 py-10 text-center sm:px-12 sm:py-14">
          <h2 className="text-fluid-2xl text-mist-50">Pronto para encontrar o imóvel dos seus sonhos?</h2>
          <p className="text-fluid-base mt-3 text-mist-300">
            Nossa equipe de consultores está a uma mensagem de distância para apresentar as melhores opções com total exclusividade e rapidez.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <WhatsappLink
              href={link}
              origem="cta_final"
              corretorId={corretorAtivo?.id}
              className="rounded-full bg-brand-500 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-400"
            >
              Conversar no WhatsApp
            </WhatsappLink>
            <Link
              href="/empreendimentos"
              className="rounded-full border border-white/20 px-7 py-3.5 text-sm font-medium text-mist-100 transition-colors hover:border-brand-300/50 hover:text-brand-200"
            >
              Explorar Todos os Imóveis
            </Link>
          </div>
        </GlassSurface>
      </Reveal>
    </section>
  );
}
