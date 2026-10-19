import { NextResponse, type NextRequest } from "next/server";
import { destinoSeguro } from "@/lib/auth/links";
import { createClient } from "@/lib/supabase/server";

/**
 * A volta do e-mail de convite e de recuperação de senha.
 *
 * O link (`gerarLinkDeAcesso`) traz `token_hash`, `type` e `next` na query.
 * O `verifyOtp` roda aqui, no servidor, com o cliente de cookies: a sessão
 * nasce na própria resposta (o Next junta os cookies gravados por
 * `cookies()` ao redirecionamento devolvido), sem depender de verificador
 * PKCE nem de JavaScript no navegador — funciona no celular de quem abriu o
 * e-mail, que não é o computador de quem mandou o convite.
 *
 * Mora fora de `/corretor` (o `proxy.ts` só exige sessão lá): quem chega aqui
 * ainda não tem sessão nenhuma.
 *
 * Link já usado, vencido, adulterado ou incompleto: tela de entrar com
 * `?link=expirado`, que explica e aponta "Esqueci a senha". Erro genérico
 * aqui faria a pessoa achar que a conta não existe.
 */

const TIPOS = new Set(["invite", "recovery"]);

export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams;
  const tokenHash = parametros.get("token_hash");
  const tipo = parametros.get("type");

  if (!tokenHash || !tipo || !TIPOS.has(tipo)) return expirado(request);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: tipo as "invite" | "recovery",
    token_hash: tokenHash,
  });
  if (error) return expirado(request);

  return NextResponse.redirect(new URL(destinoSeguro(parametros.get("next")), request.url));
}

function expirado(request: NextRequest) {
  return NextResponse.redirect(new URL("/corretor/entrar?link=expirado", request.url));
}
