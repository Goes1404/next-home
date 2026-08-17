import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { COOKIE_CORRETOR_ATIVO } from "@/lib/corretorAtivo";

const TRINTA_DIAS_EM_SEGUNDOS = 60 * 60 * 24 * 30;

/** Opções do cookie de atribuição — as mesmas nos dois caminhos abaixo. */
const OPCOES_COOKIE_CORRETOR = {
  maxAge: TRINTA_DIAS_EM_SEGUNDOS,
  path: "/",
  sameSite: "lax",
} as const;

/**
 * Três responsabilidades independentes, uma passada só:
 *
 * 1. Sessão do corretor (login em /corretor via Supabase Auth): atualiza o
 *    cookie de sessão a cada requisição (exigência do @supabase/ssr) e
 *    barra quem tenta acessar /corretor sem sessão.
 * 2. Link pessoal do corretor (`?corretor=<slug>` em qualquer página):
 *    grava o cookie que `lib/corretorAtivo.ts` lê depois. Não valida o slug
 *    contra o banco aqui de propósito — Proxy roda em toda requisição
 *    (inclusive prefetch) e não deve fazer round-trip de rede; um slug
 *    inválido é ignorado silenciosamente por `getCorretorAtivo()`.
 * 3. Separação dos dois públicos: quem chega orgânico na raiz vê o site
 *    institucional; quem chega pelo link de um corretor vai direto para o
 *    catálogo. Ver `redirecionaParaPortfolio()`.
 *
 * `middleware.ts` foi descontinuado e renomeado para `proxy.ts` nesta
 * versão do Next — ver node_modules/next/dist/docs/.../proxy.md.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesParaSetar) => {
        cookiesParaSetar.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesParaSetar.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;

  // Checagem com fronteira explícita, não `startsWith("/corretor")`: aquele
  // prefixo também casa com `/corretores` — a vitrine pública da equipe —, o
  // que mandaria todo visitante para a tela de login.
  const areaDoCorretor = pathname === "/corretor" || pathname.startsWith("/corretor/");
  const precisaLogin = areaDoCorretor && pathname !== "/corretor/entrar";
  if (precisaLogin && !user) {
    return NextResponse.redirect(new URL("/corretor/entrar", request.url));
  }

  const slugCompartilhado = searchParams.get("corretor");
  if (slugCompartilhado) {
    // Link de corretor caindo na raiz: é tráfego direcionado (WhatsApp), não
    // orgânico — o cliente veio pra ver imóveis, não pra conhecer a
    // imobiliária. Manda direto pro catálogo, levando a atribuição no cookie.
    //
    // Só na raiz: num link profundo (`/empreendimentos/<slug>?corretor=...`)
    // o corretor escolheu o imóvel a mostrar, e jogar pro portfólio geral
    // desfaria justamente essa escolha.
    //
    // Redirect em vez de rewrite para a URL final ficar compartilhável e a
    // `/` continuar sendo, para o Google, só o institucional.
    if (pathname === "/") {
      const paraPortfolio = NextResponse.redirect(new URL("/portfolio", request.url));
      paraPortfolio.cookies.set(COOKIE_CORRETOR_ATIVO, slugCompartilhado, OPCOES_COOKIE_CORRETOR);
      return paraPortfolio;
    }

    response.cookies.set(COOKIE_CORRETOR_ATIVO, slugCompartilhado, OPCOES_COOKIE_CORRETOR);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
