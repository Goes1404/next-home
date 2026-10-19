import { NextResponse } from "next/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { integracaoLiberada } from "@/lib/grupos/integracoes";
import { urlDeAutorizacao } from "@/lib/inbound/gmail";
import { gmailConfigurado } from "@/lib/inbound/gmailCaixa";
import { site } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Início da conexão do Gmail (26/09/2026). Só com sessão de corretor; o
 * `state` vai num cookie httpOnly e é conferido na volta — sem ele, um link
 * forjado poderia ligar a caixa de OUTRA pessoa à conta do corretor.
 */
export async function GET() {
  const corretor = await getCorretorLogado();
  if (!corretor) return NextResponse.redirect(`${site.url}/corretor/entrar`);
  // O app OAuth é o da Next Home: até a fase 7, só o grupo dela liga a
  // caixa a ele (L19). Para os outros, é como se não estivesse configurado.
  if (!gmailConfigurado() || !integracaoLiberada(corretor.grupoId, "gmail")) {
    return NextResponse.redirect(`${site.url}/corretor/perfil?gmail=nao-configurado`);
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(
    urlDeAutorizacao({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      redirectUri: `${site.url}/api/gmail/retorno`,
      state,
    }),
  );
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 600,
  });
  return res;
}
