import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
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
    sitemap: `${site.url}/sitemap.xml`,
  };
}
