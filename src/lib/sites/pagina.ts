import "server-only";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ehEnderecoSoDoPainel } from "@/lib/enderecosDoPainel";
import { marcaDoGrupo } from "./marca";
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
  const host = decodeURIComponent(site);
  const resolvido = (await resolverSite(host)) ?? sitePadraoDoPainel(host);
  if (!resolvido) notFound();
  return resolvido;
}

/** Id de grupo que não existe: o "site" do endereço só do painel não é de ninguém. */
export const GRUPO_DO_ENDERECO_DO_PAINEL = "00000000-0000-0000-0000-00000000ffff";

/**
 * O endereço só do CRM não é site de grupo nenhum, mas as páginas de TOKEN
 * que o cliente recebe (seleção, documentos, proposta, portal, contador,
 * parceiro) abrem ali quando o grupo não tem site próprio (`proxy.ts`). Elas
 * pedem um site à casca; este é NEUTRO: sem nome, sem contato, sem endereço
 * (a marca de um grupo sem nome). A marca de verdade vem do token
 * (`marcaDoGrupoDoLink`). Só vale para as páginas do segmento: `/wa`, a API e
 * os arquivos de metadados usam `resolverSite`, que segue nulo aqui.
 */
function sitePadraoDoPainel(host: string): SiteDoGrupo | null {
  if (!ehEnderecoSoDoPainel(host)) return null;
  return {
    grupoId: GRUPO_DO_ENDERECO_DO_PAINEL,
    host,
    marca: marcaDoGrupo({ grupoId: GRUPO_DO_ENDERECO_DO_PAINEL, nome: "", url: "" }),
  };
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
