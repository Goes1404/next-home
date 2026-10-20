import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { site as siteDaCasa } from "@/lib/site";
import { normalizarHost } from "@/lib/sites/endereco";
import { metadadosDoSite } from "@/lib/sites/metadados";
import { siteDaPagina, type ParamsDoSite } from "@/lib/sites/pagina";

/**
 * O site público de cada grupo, pelo endereço (fase 3, 20/10/2026).
 *
 * O `proxy.ts` reescreve toda página pública para `/s/<host>/<caminho>`;
 * aqui o host vira o grupo (`siteDaPagina`, com cache por host). Endereço
 * que não é de nenhum grupo — ou de grupo encerrado — dá 404 com a página
 * neutra (`src/app/not-found.tsx`), nunca o site da Next Home.
 *
 * Por que o host no CAMINHO, e não `headers()` em cada página: com o host no
 * caminho o cache de rota (ISR) já sai separado por site, e as páginas
 * continuam estáticas. Com `headers()`, toda página pública voltaria a ser
 * dinâmica — exatamente o que a F2b desfez (12/10/2026). Medido em
 * docs/superpowers/plans/2026-10-20-fase-3-site-por-endereco.md.
 *
 * O endereço canônico da Next Home é prerenderizado no build, como antes;
 * os demais endereços nascem na primeira visita e ficam no cache.
 */
export function generateStaticParams(): ParamsDoSite[] {
  const host = normalizarHost(urlHost(siteDaCasa.url));
  return host ? [{ site: host }] : [];
}

function urlHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<ParamsDoSite> }): Promise<Metadata> {
  const site = await siteDaPagina(params);
  return metadadosDoSite(site.marca);
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<ParamsDoSite>;
}) {
  const site = await siteDaPagina(params);
  return (
    <>
      {children}
      <Footer marca={site.marca} />
    </>
  );
}
