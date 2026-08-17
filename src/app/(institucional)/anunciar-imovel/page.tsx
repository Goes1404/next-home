import type { Metadata } from "next";
import { FormularioProprietario } from "@/components/contato/FormularioProprietario";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { linkWhatsapp, linkWhatsappPara, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Anunciar meu imóvel",
  description: `Anuncie seu imóvel com a ${site.nomeCompleto} — CRECI ${site.creci}. Avaliação e negociação em ${site.regioes.join(", ")}.`,
  alternates: { canonical: "/anunciar-imovel" },
};

const ETAPAS = [
  {
    titulo: "Você nos conta o imóvel",
    texto: "Pelo formulário abaixo ou direto no WhatsApp — leva menos de dois minutos.",
  },
  {
    titulo: "Avaliamos com dado da região",
    texto:
      "Um corretor com CRECI visita o imóvel e traz o valor de mercado real do metro quadrado, não um chute.",
  },
  {
    titulo: "Cuidamos da negociação",
    texto:
      "Anúncio, visitas, propostas e documentação, com um responsável acompanhando do começo ao fim.",
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
      <Reveal className="mx-auto w-full max-w-2xl text-center">
        <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-brand-200 uppercase">
          Para proprietários
        </p>
        <h1 className="text-fluid-3xl text-mist-50">
          Seu imóvel merece quem conhece a região.
        </h1>
        <p className="text-fluid-base mt-5 text-mist-300">
          A Next Home atua em {site.regioes.join(", ")} — a mesma região, todos os dias. Conte
          sobre o seu imóvel e um corretor com CRECI entra em contato para avaliar.
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
          <h2 className="font-display text-lg text-mist-50">Conte sobre o imóvel</h2>
          <p className="text-fluid-sm mt-1 mb-6 text-mist-400">
            Sem compromisso — a avaliação é gratuita.
          </p>
          <FormularioProprietario regioes={[...site.regioes]} />
        </Reveal>

        <Reveal delay={0.1} className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-6">
            <h2 className="font-display text-lg text-mist-50">Prefere conversar?</h2>
            <p className="text-fluid-sm mt-2 text-mist-400">
              {corretorAtivo
                ? `Fale direto com ${corretorAtivo.nome} no WhatsApp.`
                : "Chame a gente no WhatsApp e já adiantamos as primeiras perguntas por lá."}
            </p>
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400"
            >
              Falar no WhatsApp
            </a>
          </div>

          <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-6">
            <h2 className="font-display text-lg text-mist-50">Por que a Next Home</h2>
            <ul className="text-fluid-sm mt-3 space-y-2 text-mist-400">
              <li>Atuação concentrada em Alphaville e entorno, não no Brasil inteiro.</li>
              <li>Corretor responsável com CRECI acompanhando o seu imóvel.</li>
              <li>Cada imóvel com página própria, não uma linha numa lista.</li>
            </ul>
            <p className="text-fluid-xs mt-4 text-mist-500">CRECI {site.creci}</p>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
