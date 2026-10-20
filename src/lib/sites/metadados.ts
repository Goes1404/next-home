import type { Metadata } from "next";
import { imagemDeCompartilhamento } from "@/lib/dadosEstruturados";
import type { MarcaDoSite } from "./marca";

/**
 * Os metadados de cada site público (fase 3): base das URLs (canonical,
 * Open Graph, sitemap) no endereço PRINCIPAL do grupo, título e descrição
 * com o nome dele. Vale para todo endereço do grupo — o canonical de
 * `nexthomeimoveis.com` e de `next-home-drab.vercel.app` aponta para o
 * `www` —, e nunca para o site de outro grupo.
 *
 * Para a Next Home sai exatamente o que o layout raiz já dizia, mais as
 * etiquetas `geo.*` do escritório, que saíram do raiz: o `other` dos
 * metadados é MESCLADO entre layouts (Object.assign no Next), e no raiz elas
 * vazariam o endereço da Next Home para o site de qualquer grupo.
 */
export function metadadosDoSite(marca: MarcaDoSite): Metadata {
  const titulo = marca.ehNextHome ? `${marca.nomeCompleto} — Imobiliária em Alphaville e Barueri` : marca.nomeCompleto;
  const imagem = imagemDeCompartilhamento(marca);
  const e = marca.endereco;
  return {
    metadataBase: new URL(marca.url),
    title: { default: titulo, template: `%s · ${marca.nome}` },
    description: marca.descricao,
    keywords: [...marca.keywords],
    applicationName: marca.nome,
    appleWebApp: { title: marca.nome, capable: false },
    authors: [{ name: marca.nomeCompleto, url: marca.url }],
    creator: marca.nomeCompleto,
    publisher: marca.nomeCompleto,
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: marca.url,
      siteName: marca.nomeCompleto,
      title: titulo,
      description: marca.descricao,
      ...(imagem ? { images: [imagem] } : {}),
    },
    twitter: {
      card: imagem ? "summary_large_image" : "summary",
      title: marca.ehNextHome ? `${marca.nomeCompleto} — Imobiliária em Alphaville` : titulo,
      description: marca.descricao,
      ...(imagem ? { images: [imagem.url] } : {}),
    },
    ...(e
      ? {
          other: {
            "geo.region": `BR-${e.uf}`,
            "geo.placename": `${e.bairro}, ${e.cidade}`,
            "geo.position": `${e.lat};${e.lng}`,
            ICBM: `${e.lat}, ${e.lng}`,
          },
        }
      : {}),
  };
}

/**
 * O Open Graph de uma página do site. O `openGraph` da página SUBSTITUI o do
 * layout (não mescla): sem repetir a imagem aqui, a página seria
 * compartilhada sem figura. A imagem é a da marca do site (outros grupos
 * ainda não têm a sua — sem imagem, e nunca a da Next Home).
 */
export function openGraphDaPagina(
  marca: MarcaDoSite,
  { titulo, descricao, caminho }: { titulo: string; descricao?: string; caminho: string },
): NonNullable<Metadata["openGraph"]> {
  const imagem = imagemDeCompartilhamento(marca);
  return {
    title: titulo,
    description: descricao ?? marca.descricao,
    url: `${marca.url}${caminho === "/" ? "" : caminho}`,
    ...(imagem ? { images: [imagem] } : {}),
  };
}
