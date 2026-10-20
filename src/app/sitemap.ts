import type { MetadataRoute } from "next";
import { getCorretores, getEmpreendimentos, getSlugsEmpreendimentos } from "@/lib/queries";
import { siteDoCabecalho } from "@/lib/sites/pagina";
import { regioesComEstoque } from "@/lib/regioes";

/*
 * Por SITE desde a fase 3 (20/10/2026): o endereço da requisição diz de que
 * grupo é o sitemap, e toda URL sai no endereço PRINCIPAL dele — o sitemap
 * de um site nunca lista página de outro. Ler o cabeçalho torna o arquivo
 * dinâmico; os dados (catálogo, equipe) continuam no cache por grupo, então
 * cada pedido custa só a montagem. Endereço de nenhum grupo: sitemap vazio.
 */

/**
 * Fora do sitemap de propósito: `/corretor*` (área logada, sem valor de busca
 * e que não queremos indexada) e `/portfolio`, que é a peça compartilhada
 * pelo corretor no WhatsApp — a porta de entrada orgânica é a home
 * institucional, e as duas competiriam pela mesma intenção de busca.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await siteDoCabecalho();
  if (!site) return [];
  const { grupoId, marca } = site;
  const url = (caminho: string) => `${marca.url}${caminho}`;
  const [slugs, corretores, catalogo] = await Promise.all([
    getSlugsEmpreendimentos(grupoId),
    getCorretores(grupoId),
    getEmpreendimentos(grupoId),
  ]);

  /*
   * Só as regiões COM imóvel entram. `regioesComEstoque` já filtra as vazias,
   * e a página delas devolve 404 — sitemap apontando para 404 é o jeito mais
   * rápido de o Google desconfiar do resto do arquivo.
   */
  const regioes = regioesComEstoque(catalogo);

  const agora = new Date();

  return [
    { url: url("/"), lastModified: agora, changeFrequency: "weekly", priority: 1 },
    { url: url("/empreendimentos"), lastModified: agora, changeFrequency: "daily", priority: 0.9 },
    { url: url("/financiamento"), lastModified: agora, changeFrequency: "monthly", priority: 0.9 },
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

    ...regioes.map((r) => ({
      url: url(`/regioes/${r.slug}`),
      lastModified: agora,
      changeFrequency: "weekly" as const,
      // Acima de /sobre e /contato: é página de ESTOQUE, com intenção de
      // busca real ("apartamento em Alphaville"), e abaixo da listagem geral.
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
