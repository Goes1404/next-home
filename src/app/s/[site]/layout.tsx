import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { site as siteDaCasa } from "@/lib/site";
import { normalizarHost } from "@/lib/sites/endereco";
import { metadadosDoSite } from "@/lib/sites/metadados";
import { type ParamsDoSite } from "@/lib/sites/pagina";
import { resolverSite } from "@/lib/sites/resolver";

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
  const site = await resolverSite(decodeURIComponent((await params).site));
  return site ? metadadosDoSite(site.marca) : { robots: { index: false, follow: false } };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<ParamsDoSite>;
}) {
  // Endereço de nenhum grupo NÃO lança aqui: um `notFound()` de layout só
  // é pego pela fronteira do segmento PAI, e o 404 saía com o HTML vazio
  // (medido em `next start`, 20/10/2026). Quem lança é o layout do grupo de
  // rotas e a página, logo abaixo (`siteDaPagina`), e o 404 cai em
  // `./not-found.tsx`, inteiro no HTML do servidor. Sem site, sem rodapé.
  const site = await resolverSite(decodeURIComponent((await params).site));
  return (
    <>
      {children}
      {site && <Footer marca={site.marca} />}
    </>
  );
}
