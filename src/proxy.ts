import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { COOKIE_CORRETOR_ATIVO } from "@/lib/corretorAtivoCookie";

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
 *    cookie de sessão e barra quem tenta acessar /corretor sem sessão. SÓ
 *    nas rotas do painel — ver abaixo por quê.
 * 2. Link pessoal do corretor (`?corretor=<slug>` em qualquer página):
 *    grava o cookie que `lib/corretorAtivo.ts` lê depois. Não valida o slug
 *    contra o banco aqui de propósito — um slug inválido é ignorado
 *    silenciosamente por `getCorretorAtivo()`.
 * 3. Separação dos dois públicos: quem chega orgânico na raiz vê o site
 *    institucional; quem chega pelo link de um corretor vai direto para o
 *    catálogo.
 *
 * ## O custo que este arquivo tinha, e não sabia (F2, 13/09/2026)
 *
 * Até aqui ele chamava `supabase.auth.getUser()` ANTES de olhar a rota —
 * uma ida ao Supabase Auth (Canadá, ~100 ms) em TODA requisição: visitante
 * anônimo da home, cada prefetch RSC dos 25 cards da listagem, e até os
 * arquivos de `public/` (o matcher só excluía `_next/static`, `_next/image`
 * e `favicon.ico`, então `/video/intro.mp4` passava por aqui). O comentário
 * jurava que o proxy "não faz round-trip de rede". Fazia o mais caro.
 *
 * Agora: o Auth só entra em `/corretor/*`; a verificação é `getClaims()`,
 * que valida o JWT localmente (chave pública em cache) e só vai à rede para
 * renovar sessão vencida; e o matcher exclui qualquer caminho com ponto —
 * arquivo não precisa de sessão nem de cookie de atribuição.
 *
 * `middleware.ts` foi descontinuado e renomeado para `proxy.ts` nesta
 * versão do Next — ver node_modules/next/dist/docs/.../proxy.md.
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  let response = NextResponse.next({ request });

  // Checagem com fronteira explícita, não `startsWith("/corretor")`: aquele
  // prefixo também casa com `/corretores` — a vitrine pública da equipe —, o
  // que mandaria todo visitante para a tela de login (e, agora, faria a
  // vitrine pagar o Auth que só o painel precisa).
  const areaDoCorretor = pathname === "/corretor" || pathname.startsWith("/corretor/");
  const precisaLogin = areaDoCorretor && pathname !== "/corretor/entrar";

  if (areaDoCorretor) {
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

    const { data } = await supabase.auth.getClaims();
    const logado = Boolean(data?.claims?.sub);
    if (precisaLogin && !logado) {
      return NextResponse.redirect(new URL("/corretor/entrar", request.url));
    }
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
  // Só PÁGINAS: nada de `_next/`, nada de `api/`, nada com ponto no caminho
  // (`/video/intro.mp4`, `/robots.txt`, `/sitemap.xml`, fontes, ícones).
  // Arquivo não tem sessão para renovar nem link de corretor para gravar.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
