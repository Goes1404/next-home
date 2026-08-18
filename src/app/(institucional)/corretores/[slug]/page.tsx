import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { iniciais } from "@/lib/format";
import { getCorretorPorSlug } from "@/lib/queries";
import { linkWhatsappPara, site } from "@/lib/site";

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const corretor = await getCorretorPorSlug(slug);
  if (!corretor) return {};

  const titulo = `${corretor.nome} · Consultor Imobiliário | Next Home`;
  const descricao = corretor.bio
    ? corretor.bio.slice(0, 160)
    : `Fale com ${corretor.nome}, corretor credenciado CRECI ${corretor.creci} na Next Home. Especialista em imóveis de alto padrão em ${site.regioes.join(", ")}.`;

  const imagemUrl =
    corretor.fotoUrl ||
    "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/og-image.jpg";

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `/corretores/${corretor.slug}` },
    openGraph: {
      type: "profile",
      locale: "pt_BR",
      title: titulo,
      description: descricao,
      url: `/corretores/${corretor.slug}`,
      images: [
        {
          url: imagemUrl,
          width: 800,
          height: 800,
          alt: `${corretor.nome} — Next Home Imóveis`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: titulo,
      description: descricao,
      images: [imagemUrl],
    },
  };
}

/**
 * Página do corretor — o "microsite de agente" que a RE/MAX usa, adaptado ao
 * porte da Next Home: quem é, o que ele acompanha hoje, e dois caminhos para
 * falar com ele.
 *
 * O botão "Ver portfólio completo" leva ao mesmo link pessoal que ele copia no
 * painel (`/portfolio?corretor=<slug>`): a partir dali, todo CTA do site passa
 * a apontar para o WhatsApp dele, mesmo em imóveis de outro responsável.
 */
export default async function CorretorPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const corretor = await getCorretorPorSlug(slug);
  if (!corretor) notFound();

  const whatsapp = linkWhatsappPara(
    corretor.whatsapp,
    `Olá, ${corretor.nome}! Vim pelo site da Next Home e quero falar com você.`,
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: corretor.nome,
    description: corretor.bio || `${corretor.nome} — Corretor de imóveis credenciado CRECI ${corretor.creci} na Next Home.`,
    url: `${site.url}/corretores/${corretor.slug}`,
    image: corretor.fotoUrl || undefined,
    telephone: `+${corretor.whatsapp}`,
    parentOrganization: {
      "@type": "RealEstateAgent",
      name: site.nomeCompleto,
      url: site.url,
      address: {
        "@type": "PostalAddress",
        streetAddress: `${site.endereco.logradouro} — ${site.endereco.bairro}`,
        addressLocality: site.endereco.cidade,
        addressRegion: site.endereco.uf,
        postalCode: site.endereco.cep,
        addressCountry: "BR",
      },
    },
    areaServed: site.regioes.map((r) => ({ "@type": "Place", name: r })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="relative flex flex-1 flex-col px-4 pt-32 pb-24 overflow-hidden">
        <Reveal from="baixo" className="mx-auto w-full max-w-xl">
          <GlassSurface
            preset="painel"
            className="relative overflow-hidden px-7 py-10 text-center sm:px-12 sm:py-14 border border-brand-400/20 bg-gradient-to-b from-ink-900/80 to-ink-950/90 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
          >
            <div className="text-left">
              <VoltarLink href="/corretores">Toda a equipe</VoltarLink>
            </div>

            <Reveal stagger={0.12} duration={0.7} className="flex flex-col items-center">
              {/* Retrato — moldura orgânica, não um avatar social redondo. Uma
                  segunda forma, deslocada atrás, dá a profundidade de duas
                  camadas; a mesma dupla serve pro monograma sem foto. */}
              <div className="relative h-40 w-40">
                <div
                  aria-hidden
                  className="absolute inset-0 rotate-6 bg-gradient-to-br from-azure-500/70 to-brand-600/80"
                  style={{ borderRadius: "62% 38% 55% 45% / 48% 42% 58% 52%" }}
                />
                {corretor.fotoUrl ? (
                  <Image
                    src={corretor.fotoUrl}
                    alt={corretor.nome}
                    width={168}
                    height={168}
                    className="absolute inset-0 -rotate-3 h-full w-full border border-sand-400/20 object-cover"
                    style={{ borderRadius: "55% 45% 48% 52% / 55% 40% 60% 45%" }}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="font-display absolute inset-0 -rotate-3 flex items-center justify-center border border-sand-400/20 bg-gradient-to-tr from-brand-700 via-brand-600 to-azure-600 text-4xl font-medium text-mist-50"
                    style={{ borderRadius: "55% 45% 48% 52% / 55% 40% 60% 45%" }}
                  >
                    {iniciais(corretor.nome)}
                  </span>
                )}
                <span
                  title="Disponível no WhatsApp"
                  className="absolute -bottom-1 -right-1 z-10 h-5 w-5 rounded-full bg-[#25D366] ring-4 ring-ink-950"
                />
              </div>

              {/* Nome como assinatura — o traço pessoal que combina com o
                  CRECI tratado como selo logo abaixo. */}
              <h1 className="font-script text-6xl sm:text-7xl mt-4 leading-none text-sand-300">
                {corretor.nome}
              </h1>

              {/* Credencial — o CRECI é o registro legal do corretor; tratado como
                  um selo gravado, não como mais um chip decorativo entre outros. */}
              <div className="mt-5 flex w-full max-w-[15rem] items-center gap-3">
                <span aria-hidden className="h-px flex-1 bg-white/15" />
                <span className="font-mono shrink-0 text-fluid-xs tracking-[0.2em] text-mist-400 uppercase">
                  CRECI {corretor.creci}
                </span>
                <span aria-hidden className="h-px flex-1 bg-white/15" />
              </div>

              {corretor.bio && (
                <p className="text-fluid-base mt-8 max-w-md border-l border-sand-400/25 pl-5 text-left whitespace-pre-line text-mist-200 leading-relaxed">
                  {corretor.bio}
                </p>
              )}

              <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
                <WhatsappLink
                  href={whatsapp}
                  origem="perfil_corretor"
                  corretorId={corretor.id}
                  className="flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#20BD5A]"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
                  </svg>
                  Falar no WhatsApp
                </WhatsappLink>
                <Link
                  href={`/portfolio?corretor=${corretor.slug}`}
                  className="flex items-center justify-center gap-2 rounded-full border border-brand-400/30 px-7 py-3.5 text-sm font-semibold text-brand-200 transition-colors hover:border-brand-300 hover:bg-brand-500/10"
                >
                  Ver portfólio completo <span aria-hidden>→</span>
                </Link>
              </div>
            </Reveal>
          </GlassSurface>
        </Reveal>
      </main>
    </>
  );
}
