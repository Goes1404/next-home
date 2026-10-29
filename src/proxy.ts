import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { COOKIE_CORRETOR_ATIVO } from "@/lib/corretorAtivoCookie";
import { ehEnderecoSoDoPainel, ehRotaDeTokenDoCliente } from "@/lib/enderecosDoPainel";
import { normalizarHost } from "@/lib/sites/endereco";
import { SEGMENTO_SEM_ENDERECO } from "@/lib/sites/segmento";
import {
  COOKIE_DE_INDICACAO,
  normalizarCodigoDeIndicacao,
  OPCOES_DO_COOKIE_DE_INDICACAO,
  PARAMETRO_DE_INDICACAO,
} from "@/lib/indicacoes/codigo";

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

  // Endereço só do CRM (astroimob.vercel.app): página do site público não
  // existe ali; quem abre a raiz ou qualquer página do site vai ao painel.
  // Fora a página de TOKEN que o cliente recebe do corretor (seleção,
  // documentos, proposta, portal, contador, parceiro): o grupo sem site
  // próprio manda esses links no endereço do painel.
  if (
    ehEnderecoSoDoPainel(request.headers.get("host")) &&
    ehPaginaDoSite(pathname) &&
    !ehRotaDeTokenDoCliente(pathname)
  ) {
    // A raiz é a página de vendas da Astro Soluções (28/10/2026): reescrita,
    // não redirecionada, para o endereço continuar limpo.
    if (pathname === "/") {
      const vendas = request.nextUrl.clone();
      vendas.pathname = "/astro";
      const paraVendas = NextResponse.rewrite(vendas);
      // A raiz também aceita `?indicacao=` (0247): é a página de vendas.
      const codigoNaRaiz = normalizarCodigoDeIndicacao(searchParams.get(PARAMETRO_DE_INDICACAO));
      if (codigoNaRaiz) paraVendas.cookies.set(COOKIE_DE_INDICACAO, codigoNaRaiz, OPCOES_DO_COOKIE_DE_INDICACAO);
      return paraVendas;
    }
    return NextResponse.redirect(new URL("/corretor", request.url));
  }
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

  // Indique e ganhe (0247, 29/10/2026): `/astro/contratar?indicacao=<codigo>`
  // (e qualquer página da Astro) vira o mesmo cookie de 30 dias do link
  // curto `/i/<codigo>`. Aqui, e não na página de contratação, para a
  // atribuição valer sem depender do que cada página faz com o parâmetro.
  // Só o formato é conferido; o código de verdade, no registro da indicação.
  if (pathname === "/astro" || pathname.startsWith("/astro/")) {
    const codigoDeIndicacao = normalizarCodigoDeIndicacao(searchParams.get(PARAMETRO_DE_INDICACAO));
    if (codigoDeIndicacao) response.cookies.set(COOKIE_DE_INDICACAO, codigoDeIndicacao, OPCOES_DO_COOKIE_DE_INDICACAO);
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

  if (ehPaginaDoSite(pathname)) {
    const site = normalizarHost(request.headers.get("host") ?? request.nextUrl.host) ?? SEGMENTO_SEM_ENDERECO;
    const destino = request.nextUrl.clone();
    destino.pathname = `/s/${site}${pathname === "/" ? "" : pathname}`;
    const reescrita = NextResponse.rewrite(destino);
    for (const c of response.cookies.getAll()) reescrita.cookies.set(c);
    return reescrita;
  }

  return response;
}

/**
 * Fase 3 (20/10/2026): o site público de cada grupo pelo endereço.
 *
 * Toda página pública é levada para `/s/<host>/<caminho>`, onde moram as
 * páginas (`src/app/s/[site]/…`). O proxy NÃO consulta o banco — a
 * documentação do Next desaconselha, e a F2 mediu o custo de rede aqui. Quem
 * diz de que grupo é o host é o layout do segmento (`siteDaPagina`), com
 * cache por host. Por o host estar no CAMINHO, o cache de rota (ISR) já sai
 * separado por site, e as páginas continuam estáticas (a F2b não regride).
 *
 * `/astro` (28/10/2026) é a página de vendas da Astro Soluções, a mesma em
 * qualquer endereço; nos só do painel ela é a raiz.
 *
 * `/imovel/<grupo>/<slug>` (21/10/2026) é a ficha pública do imóvel de quem
 * não tem site: abre em qualquer endereço, inclusive nos só do painel, e não
 * é página do site (o grupo vem da URL, não do endereço).
 *
 * Um `/s/...` que chega de fora também é reescrito (`/s/<host>/s/...`, que
 * não existe): sem isso, `nexthomeimoveis.com/s/outro.com.br/` mostraria o
 * site de outro grupo debaixo do domínio da Next Home.
 */
//
// `/ajuda` (central de ajuda) e `/i` (link curto do indique e ganhe), de
// 29/10/2026 (0247), são da Astro, iguais em todo endereço, como `/astro`.
const FORA_DO_SITE = ["/corretor", "/plataforma", "/auth", "/wa", "/imovel", "/astro", "/ajuda", "/i"];

function ehPaginaDoSite(pathname: string): boolean {
  return !FORA_DO_SITE.some((raiz) => pathname === raiz || pathname.startsWith(`${raiz}/`));
}

export const config = {
  // Só PÁGINAS: nada de `_next/`, nada de `api/`, nada com ponto no caminho
  // (`/video/intro.mp4`, `/robots.txt`, `/sitemap.xml`, fontes, ícones).
  // Arquivo não tem sessão para renovar nem link de corretor para gravar.
  //
  // `/s/:path*` entra À PARTE, e é de segurança (fase 3): o host costuma ter
  // ponto (`/s/imobsol.com.br/sobre`), e a regra de cima deixaria esse
  // caminho chegar direto ao segmento do site — o site de outro grupo
  // servido debaixo de qualquer domínio. Passando por aqui ele é reescrito
  // para `/s/<host>/s/...`, que não existe.
  matcher: ["/((?!_next/|api/|.*\\..*).*)", "/s/:path*"],
};
