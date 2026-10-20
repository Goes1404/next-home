import "server-only";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { resolverSite, type SiteDoGrupo } from "./resolver";

/** Os parâmetros do segmento `src/app/s/[site]`: o host, posto pelo proxy. */
export type ParamsDoSite = { site: string };

/**
 * O site da página pública (tudo sob `src/app/s/[site]`). Host que não é de
 * nenhum grupo dá 404 com a página neutra (`src/app/not-found.tsx`), nunca o
 * site da Next Home.
 *
 * Lê o host do PARÂMETRO, não de `headers()`: assim a página continua
 * estática e o cache de rota sai separado por site.
 */
export async function siteDaPagina(params: Promise<ParamsDoSite> | ParamsDoSite): Promise<SiteDoGrupo> {
  const { site } = await params;
  const resolvido = await resolverSite(decodeURIComponent(site));
  if (!resolvido) notFound();
  return resolvido;
}

/**
 * O site de uma rota que não passa pelo segmento (`/wa`, `/api/leads`,
 * `/api/clique-whatsapp`): pelo `Host` da própria requisição. Nulo para
 * endereço desconhecido — quem chama decide (escape, 404, ignorar).
 */
export function siteDaRequisicao(request: Request): Promise<SiteDoGrupo | null> {
  return resolverSite(request.headers.get("host") ?? hostDaUrl(request.url));
}

function hostDaUrl(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** O mesmo, para arquivo de metadados sem `Request` (sitemap, robots). */
export async function siteDoCabecalho(): Promise<SiteDoGrupo | null> {
  return resolverSite((await headers()).get("host"));
}
