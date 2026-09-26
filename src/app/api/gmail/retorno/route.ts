import { NextResponse, type NextRequest } from "next/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { emailDoIdToken } from "@/lib/inbound/gmail";
import { createServiceClient } from "@/lib/supabase/service";
import { site } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Volta do Google. Confere sessão e `state`, troca o código pelo refresh
 * token e guarda em `contas_email_google` (só o servidor lê a tabela).
 */
export async function GET(req: NextRequest) {
  const destino = (motivo: string) => {
    const res = NextResponse.redirect(`${site.url}/corretor/perfil?gmail=${motivo}`);
    res.cookies.delete({ name: "gmail_oauth_state", path: "/api/gmail" });
    return res;
  };
  const corretor = await getCorretorLogado();
  if (!corretor) return NextResponse.redirect(`${site.url}/corretor/entrar`);

  const url = req.nextUrl;
  const state = url.searchParams.get("state");
  const esperado = req.cookies.get("gmail_oauth_state")?.value;
  if (!state || !esperado || state !== esperado) return destino("expirou");
  if (url.searchParams.get("error")) return destino("recusado");
  const code = url.searchParams.get("code");
  if (!code) return destino("erro");

  const troca = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: `${site.url}/api/gmail/retorno`,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const j = (await troca?.json().catch(() => ({}))) as { refresh_token?: string; id_token?: string; scope?: string } | undefined;
  if (!troca?.ok || !j?.refresh_token) return destino("erro");
  // O corretor pode desmarcar o escopo do Gmail na tela do Google.
  if (!j.scope?.includes("gmail.readonly")) return destino("sem-permissao");

  const { error } = await createServiceClient()
    .from("contas_email_google")
    .upsert({
      corretor_id: corretor.id,
      email: emailDoIdToken(j.id_token) ?? "conta Google",
      refresh_token: j.refresh_token,
      ultima_leitura_em: null,
      ultimo_erro: null,
    });
  return destino(error ? "erro" : "ok");
}
