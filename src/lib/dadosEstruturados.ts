import { site } from "@/lib/site";
import type { MarcaDoSite } from "@/lib/sites/marca";

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
 *
 * Por SITE desde a fase 3 (20/10/2026): tudo recebe a marca do site servido.
 * No site de outro grupo, a organização é a dele, no endereço dele, sem o
 * telefone, o endereço nem as redes da Next Home.
 */

export function idOrganizacao(marca: MarcaDoSite): string {
  return `${marca.url}/#organizacao`;
}

export function idSite(marca: MarcaDoSite): string {
  return `${marca.url}/#site`;
}

/** Imagem de compartilhamento (Open Graph / Twitter) da Next Home. */
export const OG_IMAGEM = {
  url: "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/og-image.jpg",
  width: 1200,
  height: 630,
  alt: `${site.nomeCompleto} — Imóveis em Alphaville e Barueri`,
};

/** A imagem de compartilhamento do site; os outros grupos ainda não têm. */
export function imagemDeCompartilhamento(marca: MarcaDoSite): typeof OG_IMAGEM | null {
  return marca.ehNextHome ? OG_IMAGEM : null;
}

export function nomesAlternativos(marca: MarcaDoSite): string[] {
  const base = marca.nome;
  return [...new Set([base, `${base} Imóveis`, `${base} Imobiliária`, marca.nomeCompleto])].filter(
    (n) => n !== marca.nomeCompleto,
  );
}

/** A imobiliária: o nó que as outras páginas referenciam por `@id`. */
export function organizacaoJsonLd(marca: MarcaDoSite) {
  const e = marca.endereco;
  const imagem = imagemDeCompartilhamento(marca);
  return {
    "@type": "RealEstateAgent",
    "@id": idOrganizacao(marca),
    name: marca.nomeCompleto,
    alternateName: nomesAlternativos(marca),
    description: marca.descricao,
    url: marca.url,
    ...(marca.ehNextHome ? { logo: `${marca.url}/marca/logo-original.png` } : marca.logoUrl ? { logo: marca.logoUrl } : {}),
    ...(imagem ? { image: imagem.url } : {}),
    ...(marca.whatsapp.length ? { telephone: marca.whatsapp.map((w) => `+${w.numero}`) } : {}),
    ...(marca.email ? { email: marca.email } : {}),
    ...(e
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: `${e.logradouro} — ${e.bairro}`,
            addressLocality: e.cidade,
            addressRegion: e.uf,
            postalCode: e.cep,
            addressCountry: "BR",
          },
          // O endereço que o grupo digita não tem coordenada: sem ela, sem `geo`.
          ...(e.lat !== undefined && e.lng !== undefined
            ? { geo: { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng } }
            : {}),
        }
      : {}),
    ...(marca.regioes.length ? { areaServed: marca.regioes.map((r) => ({ "@type": "Place", name: r })) } : {}),
    ...(marca.social ? { sameAs: Object.values(marca.social).filter(Boolean) } : {}),
  };
}

/**
 * O site como entidade, com a busca interna declarada: é daqui que o Google
 * tira o nome curto nos resultados e a caixa de busca nos sitelinks. O alvo
 * da busca é o parâmetro que a listagem LÊ (`?busca=`), não um inventado.
 */
export function websiteJsonLd(marca: MarcaDoSite) {
  return {
    "@type": "WebSite",
    "@id": idSite(marca),
    name: marca.nome,
    alternateName: marca.nomeCompleto,
    url: marca.url,
    inLanguage: "pt-BR",
    publisher: { "@id": idOrganizacao(marca) },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${marca.url}/empreendimentos?busca={termo}` },
      "query-input": "required name=termo",
    },
  };
}

/** Os dois nós da home num `@graph` só. */
export function homeJsonLd(marca: MarcaDoSite) {
  return { "@context": "https://schema.org", "@graph": [organizacaoJsonLd(marca), websiteJsonLd(marca)] };
}

export type Trilha = { nome: string; url: string }[];

/**
 * Trilha de navegação (Início › Empreendimentos › Joy Barueri). O Google a
 * mostra no lugar da URL crua no resultado, e ela diz onde a página mora.
 * As URLs são absolutas, montadas por código a partir do slug — nunca
 * escritas à mão.
 */
export function trilhaJsonLd(marca: MarcaDoSite, itens: Trilha) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: itens.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.nome,
      item: item.url.startsWith("http") ? item.url : `${marca.url}${item.url}`,
    })),
  };
}
