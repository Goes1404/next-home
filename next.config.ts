import type { NextConfig } from "next";

/**
 * Host do Supabase Storage, derivado da URL pública do projeto — mesmo
 * fallback de `lib/supabase/env.ts`, necessário porque o deploy atual não
 * tem como receber variáveis de ambiente.
 */
const supabaseHost = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://prhhrqyubjcafvucirri.supabase.co",
).hostname;

/**
 * O carimbo desta build, que a aba aberta usa para descobrir que houve
 * deploy (ver `src/lib/versao/versaoDaBuild.ts` para o diagnostico inteiro).
 *
 * Tem de ser DETERMINISTICO. O `next.config` e avaliado por mais de um
 * processo — o build e a funcao em runtime —, e um valor calculado na hora
 * (`Date.now()`, um sorteio) faria cliente e servidor discordarem DENTRO da
 * mesma build: a faixa de "atualize" apareceria para sempre, sem deploy
 * nenhum. Por isso sai do commit, que e o mesmo em toda avaliacao.
 *
 * Fora da Vercel vale `dev`, e ai o aviso nunca aparece — na maquina de quem
 * desenvolve o `npm run build` roda o tempo todo e a faixa seria constante.
 */
function versaoDaBuild(): string {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return commit ? commit.slice(0, 12) : "dev";
}

const nextConfig: NextConfig = {
  /*
   * Inlinado em tempo de build nos DOIS pacotes (cliente e servidor), que e o
   * que a documentacao do `env` garante: o Next substitui a expressao pelo
   * literal. E isso que impede `/api/versao` e a aba de discordarem dentro da
   * mesma build.
   */
  env: {
    NEXT_PUBLIC_BUILD_ID: versaoDaBuild(),
  },

  images: {
    /*
     * Sem o otimizador de imagens da Vercel desde 09/10/2026: no plano Hobby
     * ele tem cota mensal e, quando ela acabou, respondia 402
     * `OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` — foto quebrada, calada.
     * A primeira saída foi `unoptimized: true`: a foto original crua, 70 a
     * 430 KB por capa na listagem para um cartão de ~360px no celular.
     *
     * Desde 12/10/2026 o loader é NOSSO (`loaderDeImagem.ts`): as variantes
     * WebP já estão no Storage (geradas em `registrarMidia` e pelo backfill),
     * e o loader só escolhe entre as que a linha de `midias` diz que
     * existem. URL sem essa marca volta como veio — o comportamento de
     * `unoptimized`, imagem a imagem. Nada é redimensionado em tempo de
     * requisição, então nada tem cota. Imagem nova em `public/` continua
     * precisando chegar leve: nada a reduz no caminho.
     *
     * `deviceSizes` casa com as variantes que existem (480/960/1440) mais
     * 1920, em que o loader devolve o original: candidato do srcset que não
     * existe no Storage seria foto quebrada.
     */
    loader: "custom",
    loaderFile: "./src/lib/imagens/loaderDeImagem.ts",
    deviceSizes: [480, 960, 1440, 1920],
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" },
      // Thumbnails oficiais do YouTube — a facade do PlayerVideo mostra a
      // capa do vídeo sem carregar o player de 1 MB até o clique.
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
    ],
  },

  turbopack: {
    root: process.cwd(),
  },

  /*
   * O `sharp` roda em Server Action do painel (medida, blur e prévia de
   * imagem). O rastreador de arquivos da Vercel incluía a PASTA dos pacotes
   * nativos mas não o binário de dentro: medido na função, `@img` existia
   * com `sharp-linux-x64` e `sharp-libvips-linux-x64`, e mesmo assim o
   * carregamento morria em `ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3`.
   *
   * A razão é que esse `.so` nunca é `require`d — quem o abre é o binário
   * nativo, por dlopen, em tempo de execução. Rastreador nenhum enxerga
   * isso, e o build passa limpo enquanto a rota quebra em produção.
   */
  outputFileTracingIncludes: {
    // `/documentos/**`: a action do envio mede a foto do documento com o sharp.
    "/documentos/**": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
    // `/api/imagens/**`: o carimbo da ressalva usa o sharp, e sem o .so a
    // arte saía sem carimbo (log de 28/09).
    "/api/imagens/**": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
    "/corretor/**": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },

  experimental: {
    // GSAP e OGL são pesados para o bundler resolver a cada build.
    optimizePackageImports: ["gsap", "ogl"],

    serverActions: {
      /*
       * A importação de leads recebe PDF e planilha por Server Action, e o
       * padrão de 1 MB recusa qualquer relatório de portal. O teto do
       * arquivo é 10 MB (validado em `importar/actions.ts`); os 2 MB de
       * folga cobrem o que o multipart acrescenta em fronteiras e cabeçalhos
       * — a documentação do Next sugere reservar essa margem.
       */
      bodySizeLimit: "12mb",
    },
    // Morph da capa do card para o hero do empreendimento. Degrada sozinho
    // em navegador sem View Transitions API: a navegação só não anima.
    viewTransition: true,
  },

  async redirects() {
    return [
      /*
       * O endereço da Vercel (next-home-drab.vercel.app) servia o site inteiro
       * em paralelo ao domínio: duas cópias do mesmo conteúdo dividindo
       * sinal. Desde 07/10/2026 as páginas PÚBLICAS dali vão para o domínio
       * com 308. Ficam de fora, de propósito: `/api` (webhook do WhatsApp,
       * crons do pg_cron e da Vercel, /api/versao — tudo que chama este
       * host pelo nome), `/corretor` (o painel; sessão é por domínio, e
       * mandar a equipe para o outro endereço derrubaria quem está logado) e
       * arquivos com extensão. Só vale quando o domínio está configurado.
       */
      ...(process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL.includes("vercel.app")
        ? [
            {
              source: "/:path((?!api/|api$|corretor/|corretor$|_next/|.*\\.).*)",
              has: [{ type: "host" as const, value: "next-home-drab.vercel.app" }],
              destination: `${process.env.NEXT_PUBLIC_SITE_URL}/:path`,
              permanent: true,
            },
          ]
        : []),
      // O site legado servia uma versão mobile separada; agora o layout é
      // responsivo e /m/ redireciona para a raiz preservando o SEO acumulado.
      { source: "/m", destination: "/", permanent: true },
      { source: "/m/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
