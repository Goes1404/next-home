import Link from "next/link";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
import { linkDoPorteiro } from "@/lib/whatsapp/linkDoPorteiro";

export function CtaFinal() {
  const link = linkDoPorteiro({ intencao: "saber" });

  return (
    <section className="px-4 pb-24 sm:px-8">
      {/* No computador a caixa tinha 672px no meio de uma página de 1152:
          uma ilha centrada depois de seções que ocupam a largura toda. Hoje
          ela acompanha a largura das seções e, de `lg` para cima, texto à
          esquerda e botões à direita (30/09/2026). */}
      <Reveal className="mx-auto w-full max-w-2xl lg:max-w-6xl">
        <GlassSurface
          preset="painel"
          className="px-7 py-10 text-center sm:px-12 sm:py-14 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-12 lg:text-left"
        >
          <div>
          <h2 className="text-fluid-2xl text-titulo">Pronto para encontrar a melhor oportunidade?</h2>
          <p className="text-fluid-base mt-3 max-w-2xl text-apoio">
            Nossos corretores estão online agora para apresentar opções com excelente custo-benefício, simular condições de pagamento e agendar visitas sem burocracia.
          </p>
          </div>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row lg:mt-0 lg:flex-col lg:items-stretch">
            <WhatsappLink
              href={link}
              origem="cta_final"
              className="rounded-full bg-brand-500 px-7 py-3.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-400 shadow-md botao-vivo"
            >
              Receber Ofertas no WhatsApp
            </WhatsappLink>
            <Link
              href="/empreendimentos"
              className="rounded-full border border-linha/20 px-7 text-center py-3.5 text-sm font-medium text-corpo transition-colors hover:border-brand-300/50 hover:text-acento-suave"
            >
              Ver Todas as Oportunidades
            </Link>
          </div>
        </GlassSurface>
      </Reveal>
    </section>
  );
}
