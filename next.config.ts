import type { NextConfig } from "next";

/**
 * Host do Supabase Storage, derivado da URL pública do projeto — mesmo
 * fallback de `lib/supabase/env.ts`, necessário porque o deploy atual não
 * tem como receber variáveis de ambiente.
 */
const supabaseHost = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://prhhrqyubjcafvucirri.supabase.co",
).hostname;

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Larguras alinhadas aos breakpoints reais do layout, evitando gerar
    // variantes que nunca são pedidas.
    deviceSizes: [390, 640, 828, 1080, 1280, 1920, 2560],
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
    "/corretor/**": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
    "/api/diag/sharp": [
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
      // O site legado servia uma versão mobile separada; agora o layout é
      // responsivo e /m/ redireciona para a raiz preservando o SEO acumulado.
      { source: "/m", destination: "/", permanent: true },
      { source: "/m/:path*", destination: "/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
