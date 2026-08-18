import type { Metadata } from "next";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { FormularioContato } from "@/components/contato/FormularioContato";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getEmpreendimentos } from "@/lib/queries";
import { enderecoLinha, linkWhatsapp, linkWhatsappPara, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Fale com a Next Home | Contato e Atendimento em Alphaville",
  description: `Entre em contato com a equipe da ${site.nomeCompleto} — ${enderecoLinha}. WhatsApp, telefone e atendimento presencial em Alphaville.`,
  alternates: { canonical: "/contato" },
  openGraph: {
    title: "Contato | Next Home Negócios Imobiliários",
    description: `Fale com nossos consultores credenciados por WhatsApp ou visite nosso escritório em Alphaville.`,
    url: `${site.url}/contato`,
  },
};

/** Mesma janela de ~800 m usada nas páginas de empreendimento, centrada no escritório. */
const RAIO_GRAUS = 0.008;

function urlDoMapa(lat: number, lng: number): string {
  const bbox = [lng - RAIO_GRAUS, lat - RAIO_GRAUS, lng + RAIO_GRAUS, lat + RAIO_GRAUS];
  const params = new URLSearchParams({ bbox: bbox.join(","), layer: "mapnik", marker: `${lat},${lng}` });
  return `https://www.openstreetmap.org/export/embed.html?${params}`;
}

export default async function ContatoPage({
  searchParams,
}: {
  searchParams: Promise<{ empreendimento?: string }>;
}) {
  const [sp, empreendimentos, corretorAtivo] = await Promise.all([
    searchParams,
    getEmpreendimentos(),
    getCorretorAtivo(),
  ]);

  return (
    <GlassBackgroundProvider>
      <SiteHeader />
      <WhatsappCta corretor={corretorAtivo ?? undefined} />

      <main className="flex flex-1 flex-col bg-ink-950 px-4 pt-32 pb-24">
        <Reveal className="mx-auto w-full max-w-2xl text-center">
          <div className="text-left">
            <VoltarLink href="/">Início</VoltarLink>
          </div>

          <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-brand-200 uppercase">
            Canais de Atendimento
          </p>
          <h1 className="text-fluid-3xl text-mist-50">Estamos prontos para atender você.</h1>
          <p className="text-fluid-base mt-4 text-mist-300">
            Tire dúvidas sobre empreendimentos, agende uma visita exclusiva ou receba atendimento personalizado com nossos consultores.
          </p>
        </Reveal>

        <div className="mx-auto mt-12 grid w-full max-w-4xl gap-8 lg:grid-cols-[1.1fr_1fr]">
          <Reveal className="rounded-2xl border border-white/10 bg-ink-900/50 p-6 sm:p-8">
            <FormularioContato
              empreendimentos={empreendimentos.map((e) => ({ slug: e.slug, nome: e.nome }))}
              empreendimentoPreselecionado={sp.empreendimento}
            />
          </Reveal>

          <Reveal delay={0.1} className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-6">
              <h2 className="font-display text-lg text-mist-50">WhatsApp</h2>
              <ul className="mt-3 space-y-1.5">
                {corretorAtivo ? (
                  <li>
                    <WhatsappLink
                      href={linkWhatsappPara(
                        corretorAtivo.whatsapp,
                        `Olá, ${corretorAtivo.nome}! Vim pelo site.`,
                      )}
                      origem="contato"
                      corretorId={corretorAtivo.id}
                      className="text-fluid-sm text-brand-200 underline-offset-4 hover:underline"
                    >
                      Falar com {corretorAtivo.nome}
                    </WhatsappLink>
                  </li>
                ) : (
                  site.whatsapp.map((w, i) => (
                    <li key={w.numero}>
                      <WhatsappLink
                        href={linkWhatsapp(undefined, i)}
                        origem="contato"
                        className="text-fluid-sm text-brand-200 underline-offset-4 hover:underline"
                      >
                        {w.label}
                      </WhatsappLink>
                    </li>
                  ))
                )}
              </ul>

              <h2 className="font-display mt-6 text-lg text-mist-50">Endereço</h2>
              <p className="text-fluid-sm mt-2 text-mist-400">{enderecoLinha}</p>
              <p className="text-fluid-xs mt-1 text-mist-500">CRECI {site.creci}</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
              <iframe
                src={urlDoMapa(site.endereco.lat, site.endereco.lng)}
                title={`Mapa da região de ${enderecoLinha}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="aspect-[4/3] w-full border-0"
              />
              <p className="text-fluid-xs px-5 py-3 text-mist-500">
                Mapa aproximado da região, para referência.
              </p>
            </div>
          </Reveal>
        </div>
      </main>
    </GlassBackgroundProvider>
  );
}
