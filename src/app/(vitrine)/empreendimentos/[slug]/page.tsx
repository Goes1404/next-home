import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { Hero } from "@/components/empreendimento/Hero";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { precoAPartirDe } from "@/lib/format";
import { site } from "@/lib/site";
import { ID_ORGANIZACAO, trilhaJsonLd } from "@/lib/dadosEstruturados";
import { faqJsonLd, perguntasDoImovel, tituloDoImovel } from "@/lib/seoDoImovel";
import { getEmpreendimentoBySlug, getSlugsEmpreendimentos } from "@/lib/queries";
import type { Empreendimento } from "@/lib/types";
import { EsperaDasSecoes, SecoesDoImovel } from "./SecoesDoImovel";
import { descricaoDePagina } from "@/lib/seo";

type Params = { slug: string };

/**
 * Revalida em segundo plano a cada 5 min: sem isso, a página fica estática
 * desde o build e uma curadoria feita direto no banco (trocar capa, marcar
 * destaque etc.) só apareceria no próximo deploy de código.
 */
export const revalidate = 300;

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

  /*
   * O título leva tipo e bairro QUANDO CABEM nos 48 caracteres que sobram
   * depois do sufixo " · Next Home" — "Eternity Alphaville Tamboré — Centro
   * Comercial Jubran, Barueri" tem 62 e o Google cortava a cidade; para
   * esses sobra "nome — cidade". O bairro sempre vai na descrição também.
   */
  // Tipo e bairro entram quando cabem; cidade é a rede (ver `seoDoImovel.ts`).
  const titulo = tituloDoImovel(e);
  const descricao = descricaoDePagina(
    `${e.tagline ? `${e.tagline}${/[.!?]$/.test(e.tagline) ? "" : "."} ` : ""}${e.bairro}, ${e.cidade}. ${precoAPartirDe(e.precoAPartir)}.`,
  );

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
            // O mesmo nó da organização que a home descreve, não uma cópia.
            seller: { "@id": ID_ORGANIZACAO },
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

  return (
    <GlassBackgroundProvider inicial={e.capa.url}>
      <script
        type="application/ld+json"
        // O conteúdo é montado no servidor a partir do nosso próprio banco,
        // não de entrada de usuário.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(e)) }}
      />
      <script
        type="application/ld+json"
        // Trilha Início › Empreendimentos › imóvel, montada por código a partir do slug.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            trilhaJsonLd([
              { nome: "Início", url: "/" },
              { nome: "Empreendimentos", url: "/empreendimentos" },
              { nome: e.nome, url: `/empreendimentos/${e.slug}` },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        // As mesmas perguntas que a seção "Perguntas frequentes" mostra.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(perguntasDoImovel(e))) }}
      />

      <SiteHeader />
      <WhatsappCta imovelSlug={e.slug} />

      <main className="flex flex-1 flex-col">
        <Hero empreendimento={e} />

        {/* O hero sai no stream ANTES das seções: elas moram num boundary
            próprio, que cede a vez (`cederAoStream`) para o `h1` — o LCP
            desta página — ser revelado sem esperar o documento inteiro.
            Ver SecoesDoImovel.tsx e a guarda heroPrimeiro.test.ts. */}
        <div className="relative bg-fundo">
          <Suspense fallback={<EsperaDasSecoes />}>
            <SecoesDoImovel empreendimento={e} />
          </Suspense>
        </div>
      </main>
    </GlassBackgroundProvider>
  );
}
