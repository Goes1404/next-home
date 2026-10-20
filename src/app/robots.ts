import type { MetadataRoute } from "next";
import { siteDoCabecalho } from "@/lib/sites/pagina";

/**
 * Por SITE desde a fase 3 (20/10/2026): o sitemap apontado é o do endereço
 * PRINCIPAL do grupo do endereço pedido. Endereço que não é de nenhum grupo
 * pede para não indexar nada — um domínio apontado para a plataforma sem
 * cadastro não pode aparecer no Google com a página neutra.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await siteDoCabecalho();
  if (!site) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Área logada do corretor e endpoints — nada disso tem valor de busca,
      // e o painel nem deveria aparecer numa SERP.
      //
      // `/corretor$` com âncora de fim, não `/corretor` solto: em robots.txt a
      // regra é prefixo, e `/corretor` bloquearia também `/corretores`, a
      // vitrine pública da equipe, que queremos indexada.
      disallow: ["/corretor$", "/corretor/", "/api/"],
    },
    sitemap: `${site.marca.url}/sitemap.xml`,
  };
}
