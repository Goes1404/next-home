import "server-only";

import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { lerHostDoGrupo } from "@/lib/marcaDoCrm/ler";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { createServiceClient } from "@/lib/supabase/service";
import { linksDoImovel, montarLinkDoImovel, type BaseDoLinkDoImovel, type LinksDoImovel } from "./link";

/**
 * Leituras da ficha pública e do link do imóvel (21/10/2026).
 *
 * Pela chave de serviço: a IA do WhatsApp, os crons e a rota de clique do
 * cliente não têm sessão, e a página pública é anônima. O grupo vem de quem
 * chama (a instância, o corretor, o link de token) ou do slug da própria URL.
 *
 * Nunca lança. Leitura que falha devolve nulo, e o link cai no que já
 * funcionava (o painel); calar um aviso por uma piscada do banco seria pior.
 */

const VALIDADE_MS = 60_000;
const slugsDosGrupos = new Map<string, { ate: number; slug: string }>();

/** Para os testes. */
export function esquecerSlugsDosGrupos(): void {
  slugsDosGrupos.clear();
}

/** `grupos.slug` de um grupo (cache de 60 s; falha não entra no cache). */
export async function lerSlugDoGrupo(grupoId: string, agora = Date.now()): Promise<string | null> {
  const guardado = slugsDosGrupos.get(grupoId);
  if (guardado && guardado.ate > agora) return guardado.slug;
  try {
    const { data, error } = await comRetentativa("slug do grupo", () =>
      createServiceClient().from("grupos").select("slug").eq("id", grupoId).maybeSingle(),
    );
    if (error) {
      console.error(`[imóvel público] slug do grupo ${grupoId} não lido: ${error.message}`);
      return null;
    }
    const slug = (data?.slug as string | undefined) ?? null;
    if (slug) slugsDosGrupos.set(grupoId, { ate: agora + VALIDADE_MS, slug });
    return slug;
  } catch (erro) {
    console.error(`[imóvel público] slug do grupo ${grupoId} não lido:`, erro);
    return null;
  }
}

/** O grupo de um slug de URL (`/imovel/<grupo>/…`). Nulo = não existe (ou a leitura falhou). */
export async function lerGrupoPorSlug(slug: string): Promise<{ id: string; nome: string } | null> {
  if (!/^[a-z0-9-]{2,63}$/.test(slug)) return null;
  try {
    const { data, error } = await comRetentativa("grupo pelo slug", () =>
      createServiceClient().from("grupos").select("id, nome").eq("slug", slug).maybeSingle(),
    );
    if (error || !data) {
      if (error) console.error(`[imóvel público] grupo "${slug}" não lido: ${error.message}`);
      return null;
    }
    return { id: data.id as string, nome: (data.nome as string) ?? "" };
  } catch (erro) {
    console.error(`[imóvel público] grupo "${slug}" não lido:`, erro);
    return null;
  }
}

/** Onde o imóvel do grupo abre: o que `link.ts` precisa saber do banco. */
export async function lerBaseDoLinkDoImovel(grupoId: string): Promise<BaseDoLinkDoImovel> {
  if (grupoId === GRUPO_NEXT_HOME_ID) return { grupoId, hostPrincipal: null, grupoSlug: null };
  const [hostPrincipal, grupoSlug] = await Promise.all([lerHostDoGrupo(grupoId), lerSlugDoGrupo(grupoId)]);
  return { grupoId, hostPrincipal, grupoSlug };
}

/**
 * O link público de um imóvel do grupo. Grupo 1: o de sempre, sem leitura.
 * Grupo com site: o endereço dele. Sem site: a ficha do painel, com o
 * corretor (`?c=`) para o botão de WhatsApp da página.
 */
export async function linkPublicoDoImovel(p: {
  grupoId: string;
  slug: string;
  corretorSlug?: string | null;
}): Promise<string> {
  return montarLinkDoImovel(await lerBaseDoLinkDoImovel(p.grupoId), p.slug, p.corretorSlug);
}

/**
 * Os links montados por código para a IA do grupo. Grupo 1: `undefined` — o
 * prompt e as mensagens ficam byte a byte iguais, pelo caminho que já existia.
 */
export async function lerLinksDoImovel(grupoId: string): Promise<LinksDoImovel | undefined> {
  if (grupoId === GRUPO_NEXT_HOME_ID) return undefined;
  return linksDoImovel(await lerBaseDoLinkDoImovel(grupoId));
}
