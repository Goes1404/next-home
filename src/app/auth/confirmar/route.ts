import { NextResponse, type NextRequest } from "next/server";
import {
  CAMINHO_DO_BOTAO,
  CAMINHO_DO_COOKIE,
  COOKIE_DO_LINK,
  DESTINO_DO_LINK_RUIM,
  VALIDADE_DO_COOKIE_S,
  lerLinkPendente,
  valorDoCookie,
} from "@/lib/auth/linkPendente";

/**
 * A volta do e-mail de convite e de recuperação de senha.
 *
 * O link (`gerarLinkDeAcesso`) traz `token_hash`, `type` e `next` na query.
 * Este GET NÃO gasta o token: filtros de e-mail (Safe Links do Microsoft 365
 * e outros) abrem o link antes da pessoa, e um GET que verificasse faria o
 * primeiro clique de verdade cair em "já foi usado". Aqui o link só é guardado
 * num cookie `httpOnly` e a pessoa vai para `/auth/continuar`, onde o botão
 * faz o `verifyOtp` (ver `src/lib/auth/linkPendente.ts`).
 *
 * Mora fora de `/corretor` (o `proxy.ts` só exige sessão lá): quem chega aqui
 * ainda não tem sessão nenhuma.
 *
 * Link incompleto ou de tipo desconhecido: tela de entrar com
 * `?link=expirado`, que explica e aponta "Esqueci a senha".
 */
export async function GET(request: NextRequest) {
  const link = lerLinkPendente(request.nextUrl.searchParams);
  if (!link) return irPara(DESTINO_DO_LINK_RUIM);

  const resposta = irPara(CAMINHO_DO_BOTAO);
  resposta.cookies.set(COOKIE_DO_LINK, valorDoCookie(link), {
    httpOnly: true,
    // `lax`, não `strict`: o clique vem de outro site (o e-mail), e um cookie
    // `strict` não seguiria o redirecionamento para `/auth/continuar`.
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: CAMINHO_DO_COOKIE,
    maxAge: VALIDADE_DO_COOKIE_S,
  });
  return resposta;
}

/**
 * Redirecionamento com `Location` RELATIVO. O `request.url` nem sempre traz o
 * host que o navegador usou (no `next dev -H 127.0.0.1` ele vira `localhost`;
 * atrás de proxy pode virar o host interno), e o cookie do link é do host do
 * clique: mandar para outro host perderia o cookie e o botão cairia em
 * "link expirado". Conferido no teste manual de 19/10.
 */
function irPara(caminho: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: caminho } });
}
