import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
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
        {/* Luzes de ambientação coloridas (Glow) */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 -z-10 h-96 w-full max-w-3xl rounded-full bg-gradient-to-tr from-brand-500/20 via-azure-500/15 to-sand-400/10 blur-[100px]"
        />

        <Reveal className="mx-auto w-full max-w-2xl">
          <GlassSurface
            preset="painel"
            className="relative overflow-hidden px-7 py-8 text-center sm:px-10 sm:py-11 border border-brand-400/20 bg-gradient-to-b from-ink-900/80 to-ink-950/90 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
          >
            {/* Avatar com moldura luminosa e gradiente */}
            <div className="relative mx-auto inline-block">
              <div className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-brand-400 via-azure-400 to-sand-300 opacity-70 blur-sm" />
              {corretor.fotoUrl ? (
                <Image
                  src={corretor.fotoUrl}
                  alt={corretor.nome}
                  width={104}
                  height={104}
                  className="relative mx-auto h-26 w-26 rounded-full object-cover ring-2 ring-brand-300/80 shadow-[0_0_20px_rgba(47,214,164,0.3)]"
                />
              ) : (
                <span
                  aria-hidden
                  className="font-display relative mx-auto flex h-26 w-26 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 via-brand-500 to-azure-500 text-2xl font-bold text-white ring-2 ring-brand-300/80 shadow-[0_0_20px_rgba(47,214,164,0.3)]"
                >
                  {iniciais(corretor.nome)}
                </span>
              )}
              <span
                title="Disponível no WhatsApp"
                className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-[#25D366] ring-3 ring-ink-950 shadow-[0_0_10px_#25D366]"
              />
            </div>

            <h1 className="text-fluid-2xl mt-5 font-bold tracking-tight text-mist-50">{corretor.nome}</h1>

            {/* Badges Coloridos */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 border border-brand-400/30 px-3 py-1 text-xs font-semibold text-brand-200">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-300 animate-pulse" />
                CRECI {corretor.creci}
              </span>
              <span className="inline-flex items-center rounded-full bg-azure-500/15 border border-azure-400/30 px-3 py-1 text-xs font-medium text-azure-200">
                Alphaville & Região
              </span>
              <span className="inline-flex items-center rounded-full bg-sand-400/15 border border-sand-400/30 px-3 py-1 text-xs font-medium text-sand-300">
                Consultor Especialista
              </span>
            </div>

            {corretor.bio && (
              <p className="text-fluid-base mt-6 whitespace-pre-line text-mist-200 leading-relaxed max-w-lg mx-auto">
                {corretor.bio}
              </p>
            )}

            {/* Botões de Ação com Cores Vibrantes */}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <WhatsappLink
                href={whatsapp}
                origem="perfil_corretor"
                corretorId={corretor.id}
                className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#25D366] to-[#128C7E] px-7 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_25px_rgba(37,211,102,0.4)] hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
                </svg>
                Falar no WhatsApp
              </WhatsappLink>
              <Link
                href={`/portfolio?corretor=${corretor.slug}`}
                className="flex items-center justify-center gap-2 rounded-full border border-brand-400/40 bg-gradient-to-r from-brand-950/40 to-ink-900/60 px-7 py-3.5 text-sm font-semibold text-brand-200 transition-all duration-300 hover:border-brand-300 hover:bg-brand-500/20 hover:text-brand-100 hover:shadow-[0_0_20px_rgba(47,214,164,0.2)]"
              >
                <span>✨</span> Ver portfólio completo
              </Link>
            </div>
          </GlassSurface>
        </Reveal>

        <Reveal className="mt-16 text-center">
          <Link
            href="/corretores"
            className="text-fluid-sm text-mist-400 underline-offset-4 hover:text-mist-100 hover:underline"
          >
            ← Ver toda a equipe
          </Link>
        </Reveal>
      </main>
    </>
  );
}
