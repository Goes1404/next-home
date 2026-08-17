import type { MetadataRoute } from "next";
import { getCorretores, getSlugsEmpreendimentos } from "@/lib/queries";
import { site } from "@/lib/site";

/** Revalida junto com o conteúdo: um lançamento novo entra no sitemap em 5 min. */
export const revalidate = 300;

const url = (caminho: string) => `${site.url}${caminho}`;

/**
 * Fora do sitemap de propósito: `/corretor*` (área logada, sem valor de busca
 * e que não queremos indexada) e `/portfolio`, que é a peça compartilhada
 * pelo corretor no WhatsApp — a porta de entrada orgânica é a home
 * institucional, e as duas competiriam pela mesma intenção de busca.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, corretores] = await Promise.all([
    getSlugsEmpreendimentos(),
    getCorretores(),
  ]);

  const agora = new Date();

  return [
    { url: url("/"), lastModified: agora, changeFrequency: "weekly", priority: 1 },
    { url: url("/empreendimentos"), lastModified: agora, changeFrequency: "daily", priority: 0.9 },
    { url: url("/anunciar-imovel"), lastModified: agora, changeFrequency: "monthly", priority: 0.8 },
    { url: url("/corretores"), lastModified: agora, changeFrequency: "monthly", priority: 0.7 },
    { url: url("/sobre"), lastModified: agora, changeFrequency: "yearly", priority: 0.5 },
    { url: url("/contato"), lastModified: agora, changeFrequency: "yearly", priority: 0.5 },
    { url: url("/privacidade"), lastModified: agora, changeFrequency: "yearly", priority: 0.2 },

    ...slugs.map((slug) => ({
      url: url(`/empreendimentos/${slug}`),
      lastModified: agora,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),

    ...corretores.map((c) => ({
      url: url(`/corretores/${c.slug}`),
      lastModified: agora,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
