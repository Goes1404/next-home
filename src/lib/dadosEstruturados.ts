import { site } from "@/lib/site";

/**
 * Dados estruturados (schema.org) do site público (07/10/2026). Funções puras,
 * sem DOM: cada página chama a sua e serializa num `<script type="application/ld+json">`.
 *
 * O que decide o desenho:
 * - `@id` fixo na organização (`<url>/#organizacao`): toda página que citar a
 *   imobiliária (seller de uma oferta, vendedor de um imóvel) aponta para o
 *   MESMO nó, em vez de descrever uma organização nova a cada vez.
 * - `alternateName` traz as formas pelas quais as pessoas procuram a casa
 *   ("Next Home", "Next Home Imóveis", "Next Home Imobiliária"): é o que
 *   liga a busca pela MARCA a este domínio, que é novo e sem histórico.
 * - `WebSite.name` é o nome curto, igual ao sufixo do título de toda página
 *   (" · Next Home"): o Google escolhe o "nome do site" nos resultados a
 *   partir dos dois concordarem.
 */

export const ID_ORGANIZACAO = `${site.url}/#organizacao`;
export const ID_SITE = `${site.url}/#site`;

/** Logotipo público para a ficha da organização (o Google pede ≥ 112px). */
export const LOGO_URL = `${site.url}/marca/logo-original.png`;

/** Imagem de compartilhamento (Open Graph / Twitter), a mesma em todo o site. */
export const OG_IMAGEM = {
  url: "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/og-image.jpg",
  width: 1200,
  height: 630,
  alt: `${site.nomeCompleto} — Imóveis em Alphaville e Barueri`,
};

export function nomesAlternativos(): string[] {
  const base = site.nome;
  return [...new Set([base, `${base} Imóveis`, `${base} Imobiliária`, site.nomeCompleto])].filter(
    (n) => n !== site.nomeCompleto,
  );
}

/** A imobiliária: o nó que as outras páginas referenciam por `@id`. */
export function organizacaoJsonLd() {
  return {
    "@type": "RealEstateAgent",
    "@id": ID_ORGANIZACAO,
    name: site.nomeCompleto,
    alternateName: nomesAlternativos(),
    description: site.descricao,
    url: site.url,
    logo: LOGO_URL,
    image: OG_IMAGEM.url,
    telephone: site.whatsapp.map((w) => `+${w.numero}`),
    address: {
      "@type": "PostalAddress",
      streetAddress: `${site.endereco.logradouro} — ${site.endereco.bairro}`,
      addressLocality: site.endereco.cidade,
      addressRegion: site.endereco.uf,
      postalCode: site.endereco.cep,
      addressCountry: "BR",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: site.endereco.lat,
      longitude: site.endereco.lng,
    },
    areaServed: site.regioes.map((r) => ({ "@type": "Place", name: r })),
    sameAs: Object.values(site.social).filter(Boolean),
  };
}

/**
 * O site como entidade, com a busca interna declarada: é daqui que o Google
 * tira o nome curto nos resultados e a caixa de busca nos sitelinks. O alvo
 * da busca é o parâmetro que a listagem LÊ (`?busca=`), não um inventado.
 */
export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": ID_SITE,
    name: site.nome,
    alternateName: site.nomeCompleto,
    url: site.url,
    inLanguage: "pt-BR",
    publisher: { "@id": ID_ORGANIZACAO },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${site.url}/empreendimentos?busca={termo}` },
      "query-input": "required name=termo",
    },
  };
}

/** Os dois nós da home num `@graph` só. */
export function homeJsonLd() {
  return { "@context": "https://schema.org", "@graph": [organizacaoJsonLd(), websiteJsonLd()] };
}

export type Trilha = { nome: string; url: string }[];

/**
 * Trilha de navegação (Início › Empreendimentos › Joy Barueri). O Google a
 * mostra no lugar da URL crua no resultado, e ela diz onde a página mora.
 * As URLs são absolutas, montadas por código a partir do slug — nunca
 * escritas à mão.
 */
export function trilhaJsonLd(itens: Trilha) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: itens.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.nome,
      item: item.url.startsWith("http") ? item.url : `${site.url}${item.url}`,
    })),
  };
}
