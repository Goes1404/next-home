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
          <h2 className="text-fluid-2xl text-titulo">Pronto para encontrar a melhor oportunidade?</h2>
          <p className="text-fluid-base mt-3 text-apoio">
            Nossos corretores estão online agora para apresentar opções com excelente custo-benefício, simular condições de pagamento e agendar visitas sem burocracia.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <WhatsappLink
              href={link}
              origem="cta_final"
              corretorId={corretorAtivo?.id}
              className="rounded-full bg-brand-500 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-400 shadow-md"
            >
              Receber Ofertas no WhatsApp
            </WhatsappLink>
            <Link
              href="/empreendimentos"
              className="rounded-full border border-linha/20 px-7 py-3.5 text-sm font-medium text-corpo transition-colors hover:border-brand-300/50 hover:text-acento"
            >
              Ver Todas as Oportunidades
            </Link>
          </div>
        </GlassSurface>
      </Reveal>
    </section>
  );
}
