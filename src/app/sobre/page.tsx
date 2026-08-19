import type { Metadata } from "next";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { VideoInstitucionalFrame } from "@/components/institucional/VideoInstitucionalFrame";
import { TimelineEmpreendimentos } from "@/components/institucional/TimelineEmpreendimentos";
import { NossaEssencia } from "@/components/institucional/NossaEssencia";
import { SimuladorInvestimentoAlphaville } from "@/components/institucional/SimuladorInvestimentoAlphaville";
import { SeloSegurancaJuridica } from "@/components/institucional/SeloSegurancaJuridica";
import { VitrineOportunidadesSobre } from "@/components/institucional/VitrineOportunidadesSobre";
import { HubContatoSegmentado } from "@/components/institucional/HubContatoSegmentado";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getEmpreendimentos } from "@/lib/queries";
import { linkWhatsapp, linkWhatsappPara, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sobre a Next Home | Imobiliária de Alto Padrão em Alphaville",
  description: `Conheça a ${site.nomeCompleto} — CRECI ${site.creci}. Consultoria de alto padrão, curadoria de edifícios e condomínios em Alphaville, Tamboré e região.`,
  alternates: { canonical: "/sobre" },
  openGraph: {
    title: `Sobre a Next Home | Negócios Imobiliários em Alphaville`,
    description: "Conheça nossa trajetória, curadoria de edifícios e compromisso com o mercado imobiliário de alto padrão.",
    url: `${site.url}/sobre`,
  },
};

export default async function SobrePage() {
  const [corretorAtivo, empreendimentos] = await Promise.all([
    getCorretorAtivo(),
    getEmpreendimentos(),
  ]);

  const linkWhatsappGeral = corretorAtivo
    ? linkWhatsappPara(corretorAtivo.whatsapp, `Olá, ${corretorAtivo.nome}! Vim pela página institucional da Next Home.`)
    : linkWhatsapp("Olá! Gostaria de conversar com um especialista da Next Home.");

  return (
    <GlassBackgroundProvider>
      <SiteHeader />
      <WhatsappCta corretor={corretorAtivo ?? undefined} />

      <main className="flex flex-1 flex-col bg-fundo px-4 pt-28 sm:pt-36 pb-16 overflow-hidden">
        {/* 1. HERO INSTITUCIONAL ACOLHEDOR */}
        <section className="max-w-4xl mx-auto text-center space-y-6 mb-12 sm:mb-16">
          <Reveal>
            <div className="mb-2 text-left">
              <VoltarLink href="/">Início</VoltarLink>
            </div>

            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/5 border border-white/15 text-corpo text-fluid-xs font-semibold backdrop-blur shadow-sm mb-2">
              <span>🚪 Entre e fique à vontade</span>
            </div>
            <h1 className="text-fluid-3xl sm:text-fluid-4xl font-bold text-titulo tracking-tight leading-tight">
              A Next Home Negócios Imobiliários
            </h1>
            <p className="text-fluid-base sm:text-fluid-lg text-apoio font-light leading-relaxed max-w-3xl mx-auto mt-4">
              Nascemos com a vocação de redefinir a experiência de compra, venda e investimento imobiliário em Alphaville e Tamboré. Mais do que apresentar imóveis, construímos pontes entre famílias extraordinárias e os projetos arquitetônicos mais inspiradores de São Paulo.
            </p>
          </Reveal>
        </section>

        {/* 2. VÍDEO INSTITUCIONAL CINEMA GLASS */}
        <section className="mb-16 sm:mb-24">
          <Reveal delay={0.15}>
            <VideoInstitucionalFrame
              videoUrl={corretorAtivo?.videoUrl || undefined}
              titulo={`Next Home — ${corretorAtivo?.nome || "Curadoria em Alphaville"}`}
            />
          </Reveal>
        </section>

        {/* 3. LINHA DO TEMPO VISUAL DOS EMPREENDIMENTOS */}
        <Reveal delay={0.1}>
          <TimelineEmpreendimentos />
        </Reveal>

        {/* 4. NOSSA ESSÊNCIA (MISSÃO, VISÃO E VALORES) */}
        <Reveal delay={0.1}>
          <NossaEssencia />
        </Reveal>

        {/* 5. SIMULADOR DE VALORIZAÇÃO & RENTABILIDADE */}
        <Reveal delay={0.1}>
          <SimuladorInvestimentoAlphaville corretorWhatsapp={corretorAtivo?.whatsapp} />
        </Reveal>

        {/* 6. SELO DE SEGURANÇA JURÍDICA E CRECI-J */}
        <Reveal delay={0.1}>
          <SeloSegurancaJuridica />
        </Reveal>

        {/* 6. VITRINE DE OPORTUNIDADES DINÂMICAS (SEM DEAD-ENDS) */}
        <Reveal delay={0.1}>
          <VitrineOportunidadesSobre empreendimentos={empreendimentos} />
        </Reveal>

        {/* 7. HUB DE CONTATO SEGMENTADO */}
        <Reveal delay={0.1}>
          <HubContatoSegmentado linkWhatsapp={linkWhatsappGeral} />
        </Reveal>
      </main>
    </GlassBackgroundProvider>
  );
}
