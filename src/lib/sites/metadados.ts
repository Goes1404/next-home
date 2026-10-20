import type { Metadata } from "next";
import { imagemDeCompartilhamento } from "@/lib/dadosEstruturados";
import { site } from "@/lib/site";
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
/**
 * Os metadados do layout raiz: só o que é neutro ou da área da plataforma.
 * O título padrão e o sufixo servem ao login e às telas sem título próprio
 * fora do site (o painel e a plataforma têm os seus); todo site declara o
 * próprio título em `metadadosDoSite`, e o endereço sem grupo declara um
 * título absoluto em `metadadosSemSite`. Nada de descrição, imagem,
 * palavras-chave ou autor da Next Home aqui: o raiz vale para todo
 * endereço, e o que o segmento de baixo não substitui vaza para ele.
 */
export const METADADOS_DO_RAIZ: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.nomeCompleto, template: `%s · ${site.nome}` },
  // `capable: false` porque o Next liga sozinho o `mobile-web-app-capable`,
  // que abriria o atalho sem a barra do navegador. O título do atalho mora
  // no site de cada grupo.
  appleWebApp: { capable: false },
  formatDetection: { telephone: true, address: true, email: true },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

/**
 * O ícone de quem não é a Next Home. O favicon, o `icon.png`, o
 * `apple-icon.png` e o manifesto em `src/app/` são ARQUIVOS do raiz: o Next
 * os põe no `<head>` de toda página, de todo endereço. Fora da Next Home a
 * página declara `icons` e `manifest: null`: com `icons` declarado, o Next
 * deixa de usar os ícones de arquivo (resolve-metadata, `leafSegmentStaticIcons`
 * só vale quando ninguém declarou), e o manifesto de arquivo é substituído
 * pelo nulo do segmento filho.
 */
export const ICONES_NEUTROS: NonNullable<Metadata["icons"]> = {
  icon: [{ url: "/icones/icone-neutro.svg", type: "image/svg+xml" }],
};

/**
 * Os metadados de um endereço que não é de nenhum grupo (ou de grupo
 * encerrado): a página neutra, sem nome, descrição, imagem, ícone nem
 * manifesto de ninguém. A prévia de um domínio apontado para a Vercel sem
 * cadastro, colado no WhatsApp, não pode sair com a imagem da Next Home.
 */
export function metadadosSemSite(): Metadata {
  return {
    // Sem base: o raiz aponta para o endereço da Next Home.
    metadataBase: null,
    title: { absolute: "Página não encontrada" },
    robots: { index: false, follow: false },
    icons: ICONES_NEUTROS,
    manifest: null,
  };
}

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
    ...(marca.ehNextHome ? {} : { icons: ICONES_NEUTROS, manifest: null }),
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
