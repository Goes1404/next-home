import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { COOKIE_CORRETOR_ATIVO } from "@/lib/corretorAtivoCookie";

const TRINTA_DIAS_EM_SEGUNDOS = 60 * 60 * 24 * 30;

/** As telas de `/corretor` que abrem sem sessão. */
const TELAS_SEM_LOGIN = new Set(["/corretor/entrar", "/corretor/esqueci-a-senha"]);

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
  // A área do administrador da plataforma (fase 2A): só sessão aqui; quem
  // decide se a pessoa é administrador é a guarda de cada página
  // (`exigirAdminDaPlataformaNaPagina`), pelo banco.
  const areaDaPlataforma = pathname === "/plataforma" || pathname.startsWith("/plataforma/");
  // Telas de quem ainda não entrou. A volta do link do e-mail
  // (`/auth/confirmar` e o botão `/auth/continuar`) mora fora de `/corretor`
  // justamente para não passar por esta exigência.
  const precisaLogin = (areaDoCorretor && !TELAS_SEM_LOGIN.has(pathname)) || areaDaPlataforma;

  if (areaDoCorretor || areaDaPlataforma) {
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
      const entrar = new URL("/corretor/entrar", request.url);
      // O administrador da plataforma volta para a área dele depois de
      // entrar (o login confere o `next` com `destinoSeguro`). No painel do
      // corretor o destino padrão já é `/corretor`.
      if (areaDaPlataforma) entrar.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(entrar);
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
    //
    // A query vai junto (19/10/2026): o robô do WhatsApp segue este
    // redirecionamento para montar a prévia e NÃO guarda o cookie, então é o
    // `?corretor=<slug>` na URL de `/portfolio` que deixa a prévia dizer de
    // quem é o portfólio (`previaDoLink.ts`). Leva também o `origem=ig` do
    // link do carrossel, que o redirect perdia.
    if (pathname === "/") {
      const destino = request.nextUrl.clone();
      destino.pathname = "/portfolio";
      const paraPortfolio = NextResponse.redirect(destino);
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
