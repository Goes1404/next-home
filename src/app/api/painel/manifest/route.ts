import { NextResponse } from "next/server";
import { marcaDoPainel } from "@/lib/marcaDoCrm/doPainel";
import { manifestoDoPainel } from "@/lib/marcaDoCrm/icones";
import { lerSiteDoGrupo } from "@/lib/sites/siteDoGrupo";
import nextHome from "@/app/manifest";

/**
 * O manifesto do app do painel de OUTRO grupo (21/10/2026): nome, logo e cor
 * do grupo de quem está logado. Só o painel de grupo diferente de 1 aponta
 * para cá (`(painel)/layout.tsx`); a Next Home segue com `src/app/manifest.ts`.
 *
 * Varia por SESSÃO (cookie), então nunca vai ao cache compartilhado: `private,
 * no-store` e `Vary: Cookie`. Sem sessão devolve o da AstroImob (nunca o da
 * Next Home); a leitura da cor que falha cai na cor da AstroImob.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const marca = await marcaDoPainel();
  const cabecalhos = {
    "Content-Type": "application/manifest+json",
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  };
  if (marca.ehNextHome) return NextResponse.json(nextHome(), { headers: cabecalhos });
  const cor = await lerSiteDoGrupo(marca.grupoId)
    .then((s) => s?.cor ?? null)
    .catch(() => null);
  return NextResponse.json(manifestoDoPainel({ nome: marca.nome, logoUrl: marca.logoUrl, cor }), { headers: cabecalhos });
}
