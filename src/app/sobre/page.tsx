import type { Metadata } from "next";
import Link from "next/link";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { enderecoLinha, linkWhatsapp, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sobre",
  description: `${site.nomeCompleto} — CRECI ${site.creci}. ${site.descricao}`,
};

const VALORES = [
  {
    titulo: "Curadoria, não catálogo",
    texto:
      "Cada empreendimento entra no portfólio com página própria — texto, plantas e fotos organizados para quem está decidindo, não para preencher uma lista.",
  },
  {
    titulo: "Corretor responsável, sempre",
    texto:
      "Todo lançamento tem um corretor com CRECI acompanhando de perto, disponível direto pelo WhatsApp em cada página.",
  },
  {
    titulo: "Conhecimento da região",
    texto:
      "Atuação concentrada em Alphaville, Barueri, Santana de Parnaíba, Osasco e Itapevi — não tentamos cobrir o Brasil inteiro.",
  },
];

export default function SobrePage() {
  return (
    <GlassBackgroundProvider>
      <SiteHeader />
      <WhatsappCta />

      <main className="flex flex-1 flex-col bg-ink-950 px-4 pt-32 pb-24">
        <Reveal className="mx-auto w-full max-w-2xl text-center">
          <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-brand-200 uppercase">
            Sobre a Next Home
          </p>
          <h1 className="text-fluid-3xl text-mist-50">
            Uma imobiliária dedicada a Alphaville e região.
          </h1>
          <p className="text-fluid-base mt-5 text-mist-300">{site.descricao}</p>
        </Reveal>

        <Reveal stagger={0.12} className="mx-auto mt-16 grid w-full max-w-4xl gap-6 sm:grid-cols-3">
          {VALORES.map((v) => (
            <div key={v.titulo} className="rounded-2xl border border-white/10 bg-ink-900/50 px-6 py-7">
              <h2 className="font-display text-lg text-mist-50">{v.titulo}</h2>
              <p className="text-fluid-sm mt-2 text-mist-400">{v.texto}</p>
            </div>
          ))}
        </Reveal>

        <Reveal className="mx-auto mt-16 w-full max-w-2xl rounded-2xl border border-white/10 bg-ink-900/50 px-7 py-8 text-center">
          <h2 className="font-display text-lg text-mist-50">Dados institucionais</h2>
          <dl className="text-fluid-sm mt-4 space-y-2 text-mist-300">
            <div>
              <dt className="inline text-mist-500">CRECI </dt>
              <dd className="inline">{site.creci}</dd>
            </div>
            <div>
              <dt className="inline text-mist-500">Endereço </dt>
              <dd className="inline">{enderecoLinha}</dd>
            </div>
            <div>
              <dt className="inline text-mist-500">Atuação </dt>
              <dd className="inline">{site.regioes.join(", ")}</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href={linkWhatsapp()}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400"
            >
              Falar no WhatsApp
            </a>
            <Link
              href="/contato"
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-mist-100 transition-colors hover:border-brand-300/50 hover:text-brand-200"
            >
              Ver todos os contatos
            </Link>
          </div>
        </Reveal>
      </main>
    </GlassBackgroundProvider>
  );
}
