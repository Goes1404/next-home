import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { Contato } from "@/components/empreendimento/Contato";
import { Galeria } from "@/components/empreendimento/Galeria";
import { Hero } from "@/components/empreendimento/Hero";
import { Lazer } from "@/components/empreendimento/Lazer";
import { Localizacao } from "@/components/empreendimento/Localizacao";
import { NavAncoras, type Secao } from "@/components/empreendimento/NavAncoras";
import { Similares } from "@/components/empreendimento/Similares";
import { Sobre } from "@/components/empreendimento/Sobre";
import { Tipologias } from "@/components/empreendimento/Tipologias";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { precoAPartirDe } from "@/lib/format";
import { site } from "@/lib/site";
import {
  getEmpreendimentoBySlug,
  getSimilares,
  getSlugsEmpreendimentos,
} from "@/lib/queries";
import type { Empreendimento } from "@/lib/types";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const slugs = await getSlugsEmpreendimentos();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const e = await getEmpreendimentoBySlug(slug);
  if (!e) return {};

  const titulo = `${e.nome} — ${e.bairro}, ${e.cidade}`;
  const descricao = `${e.tagline} ${precoAPartirDe(e.precoAPartir)}.`;

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `/empreendimentos/${e.slug}` },
    openGraph: {
      type: "website",
      title: titulo,
      description: descricao,
      url: `/empreendimentos/${e.slug}`,
      images: [{ url: e.capa.url, width: e.capa.largura, height: e.capa.altura }],
    },
  };
}

/** Seções realmente renderizadas — a barra de âncoras não pode oferecer link morto. */
function secoesDe(e: Empreendimento): Secao[] {
  const secoes: Secao[] = [{ id: "sobre", label: "Sobre" }];
  if (e.tipologias.length > 0) secoes.push({ id: "tipologias", label: "Tipologias" });
  if (e.lazer.length > 0) secoes.push({ id: "lazer", label: "Lazer" });
  if (e.galeria.length > 0) secoes.push({ id: "galeria", label: "Galeria" });
  secoes.push({ id: "localizacao", label: "Localização" });
  secoes.push({ id: "contato", label: "Contato" });
  return secoes;
}

/**
 * JSON-LD do empreendimento. `Residence` com `makesOffer` descreve melhor um
 * imóvel à venda do que `Product` genérico, e as tipologias entram como
 * ofertas com preço próprio quando têm um.
 */
function jsonLd(e: Empreendimento) {
  const url = `${site.url}/empreendimentos/${e.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: e.nome,
    description: e.descricao || e.tagline,
    url,
    image: e.galeria.map((m) => m.url),
    address: {
      "@type": "PostalAddress",
      streetAddress: e.endereco || undefined,
      addressLocality: e.cidade,
      addressRegion: "SP",
      addressCountry: "BR",
    },
    ...(e.lat !== null && e.lng !== null
      ? { geo: { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng } }
      : {}),
    numberOfRooms: e.tipologias[0]?.dormitorios || undefined,
    amenityFeature: e.lazer.map((nome) => ({
      "@type": "LocationFeatureSpecification",
      name: nome,
      value: true,
    })),
    ...(e.precoAPartir
      ? {
          makesOffer: {
            "@type": "Offer",
            price: e.precoAPartir,
            priceCurrency: "BRL",
            availability: "https://schema.org/InStock",
            seller: {
              "@type": "RealEstateAgent",
              name: site.nomeCompleto,
              url: site.url,
            },
          },
        }
      : {}),
  };
}

export default async function EmpreendimentoPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const e = await getEmpreendimentoBySlug(slug);
  if (!e) notFound();

  const similares = await getSimilares(slug);

  return (
    <GlassBackgroundProvider inicial={e.capa.url}>
      <script
        type="application/ld+json"
        // O conteúdo é montado no servidor a partir do nosso próprio banco,
        // não de entrada de usuário.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(e)) }}
      />

      <SiteHeader />
      <WhatsappCta empreendimento={e.nome} corretor={e.corretor} />

      <main className="flex flex-1 flex-col">
        <Hero empreendimento={e} />

        <div className="relative bg-ink-950">
          <div className="mx-auto max-w-3xl px-4">
            <NavAncoras secoes={secoesDe(e)} />
          </div>

          <Sobre empreendimento={e} />
          <Tipologias tipologias={e.tipologias} plantasGerais={e.plantas} />
          <Lazer itens={e.lazer} />
          <Galeria fotos={e.galeria} />
          <Localizacao empreendimento={e} />
          <Contato empreendimento={e} />
          <Similares empreendimentos={similares} />
        </div>
      </main>
    </GlassBackgroundProvider>
  );
}
