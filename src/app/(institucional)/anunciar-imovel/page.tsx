import type { Metadata } from "next";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { FormularioProprietario } from "@/components/contato/FormularioProprietario";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { linkWhatsapp, linkWhatsappPara, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Anunciar Imóvel em Alphaville e Barueri | Avaliação Gratuita",
  description: `Venda ou alugue seu imóvel com a ${site.nomeCompleto} — CRECI ${site.creci}. Avaliação estratégica de mercado, compradores qualificados e suporte jurídico em ${site.regioes.join(", ")}.`,
  alternates: { canonical: "/anunciar-imovel" },
  openGraph: {
    title: "Anuncie seu Imóvel em Alphaville | Next Home",
    description: `Máxima valorização e rapidez na venda ou locação do seu patrimônio imobiliário.`,
    url: `${site.url}/anunciar-imovel`,
  },
};

const ETAPAS = [
  {
    titulo: "Envie as informações",
    texto: "Em menos de 1 minuto, nos conte sobre o imóvel pelo formulário abaixo ou direto no WhatsApp.",
  },
  {
    titulo: "Avaliação Precisa e Estratégica",
    texto:
      "Estudo aprofundado com valores reais de fechamento na região para posicionar seu patrimônio com máxima rentabilidade.",
  },
  {
    titulo: "Divulgação e Negociação Premium",
    texto:
      "Produção visual profissional, qualificação rigorosa de compradores e suporte jurídico completo até a assinatura.",
  },
];

export default async function AnunciarImovelPage() {
  const corretorAtivo = await getCorretorAtivo();
  const whatsapp = corretorAtivo
    ? linkWhatsappPara(
        corretorAtivo.whatsapp,
        `Olá, ${corretorAtivo.nome}! Tenho um imóvel e quero anunciar com a Next Home.`,
      )
    : linkWhatsapp();

  return (
    <main className="flex flex-1 flex-col px-4 pt-32 pb-24">
      {/* O CTA flutuante saiu do layout do grupo para cada página (ver
          `(institucional)/layout.tsx`); é `position: fixed`, então fica no
          mesmo canto da tela esteja onde estiver na árvore. */}
      <WhatsappCta corretor={corretorAtivo ?? undefined} />

      <Reveal className="mx-auto w-full max-w-2xl text-center">
        <div className="text-left">
          <VoltarLink href="/">Início</VoltarLink>
        </div>

        <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-brand-200 uppercase">
          Exclusividade para Proprietários
        </p>
        <h1 className="text-fluid-3xl text-mist-50">
          Venda ou alugue seu imóvel com máxima valorização e total agilidade.
        </h1>
        <p className="text-fluid-base mt-5 text-mist-300">
          Conectamos seu patrimônio a compradores e investidores qualificados em Alphaville e região. Conte sobre seu imóvel e receba uma avaliação estratégica sem compromisso.
        </p>
      </Reveal>

      <Reveal stagger={0.1} className="mx-auto mt-14 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {ETAPAS.map((etapa, i) => (
          <GlassSurface key={etapa.titulo} preset="painel" className="px-6 py-7">
            <span className="font-display text-fluid-xl text-brand-300">{i + 1}</span>
            <h2 className="font-display mt-2 text-lg text-mist-50">{etapa.titulo}</h2>
            <p className="text-fluid-sm mt-2 text-mist-400">{etapa.texto}</p>
          </GlassSurface>
        ))}
      </Reveal>

      <div className="mx-auto mt-16 grid w-full max-w-4xl gap-8 lg:grid-cols-[1.1fr_1fr]">
        <Reveal className="rounded-2xl border border-white/10 bg-ink-900/50 p-6 sm:p-8">
          <h2 className="font-display text-lg text-mist-50">Cadastre seu Imóvel</h2>
          <p className="text-fluid-sm mt-1 mb-6 text-mist-400">
            Rápido, confidencial e com avaliação de mercado gratuita.
          </p>
          <FormularioProprietario regioes={[...site.regioes]} />
        </Reveal>

        <Reveal delay={0.1} className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-6">
            <h2 className="font-display text-lg text-mist-50">Prefere atendimento direto?</h2>
            <p className="text-fluid-sm mt-2 text-mist-400">
              {corretorAtivo
                ? `Converse diretamente com ${corretorAtivo.nome} no WhatsApp.`
                : "Fale com nossos especialistas no WhatsApp para tirar dúvidas e agendar uma avaliação."}
            </p>
            <WhatsappLink
              href={whatsapp}
              origem="anunciar_imovel"
              corretorId={corretorAtivo?.id}
              className="mt-5 inline-flex rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400"
            >
              Falar no WhatsApp
            </WhatsappLink>
          </div>

          <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-6">
            <h2 className="font-display text-lg text-mist-50">Por que anunciar com a Next Home</h2>
            <ul className="text-fluid-sm mt-3 space-y-2 text-mist-400">
              <li>✨ Base ativa de compradores qualificados em Alphaville e região.</li>
              <li>📸 Produção visual profissional e destaque nos principais canais.</li>
              <li>🛡️ Segurança jurídica completa e contratos claros do início ao fim.</li>
              <li>🤝 Corretor responsável dedicado exclusivamente ao seu imóvel.</li>
            </ul>
            <p className="text-fluid-xs mt-4 text-mist-500">CRECI {site.creci}</p>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
