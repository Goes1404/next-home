import type { NextConfig } from "next";

/**
 * Host do Supabase Storage, derivado da URL pública do projeto.
 * Fica opcional para o build funcionar antes do Supabase estar provisionado.
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Larguras alinhadas aos breakpoints reais do layout, evitando gerar
    // variantes que nunca são pedidas.
    deviceSizes: [390, 640, 828, 1080, 1280, 1920, 2560],
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },

  experimental: {
    // GSAP e OGL são pesados para o bundler resolver a cada build.
    optimizePackageImports: ["gsap", "ogl"],
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
