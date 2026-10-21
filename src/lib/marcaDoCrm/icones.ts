import type { Metadata, MetadataRoute } from "next";
import type { MarcaDoCrm } from "./marca";

/**
 * O ícone da aba e o atalho (PWA) de quem NÃO é a Next Home (21/10/2026).
 *
 * Módulo PURO. O raiz de `src/app` tem `icon.png`, `apple-icon.png` e
 * `manifest.ts` da Next Home, que o Next põe em toda página; fora dela cada
 * página declara `icons` (isso desliga os de arquivo) e `manifest`.
 *
 * - Grupo com logo (`grupos.logo_url`): a logo dele, no endereço dela mesma
 *   (Storage, uma URL por grupo: não há rota de ícone compartilhada para o CDN
 *   misturar).
 * - Grupo sem logo, o login e a plataforma: o ícone da AstroImob
 *   (`scripts/marca/gerarIconeAstroimob.mjs`).
 * - Next Home: nada daqui (`ICONES_DA_NEXT_HOME` e o manifesto de arquivo).
 */

export const ICONES_ASTROIMOB = {
  icon: [
    { url: "/icones/icone-astroimob.svg", type: "image/svg+xml" },
    { url: "/icones/astroimob-192.png", sizes: "192x192", type: "image/png" },
  ],
  apple: [{ url: "/icones/astroimob-180.png", sizes: "180x180", type: "image/png" }],
} satisfies NonNullable<Metadata["icons"]>;

/** Os ícones do painel de um grupo que não é a Next Home. */
export function iconesDoGrupo(marca: Pick<MarcaDoCrm, "logoUrl">): NonNullable<Metadata["icons"]> {
  return marca.logoUrl ? { icon: [{ url: marca.logoUrl }], apple: [{ url: marca.logoUrl }] } : ICONES_ASTROIMOB;
}

/** Onde o painel de outro grupo busca o manifesto (`src/app/api/painel/manifest`). */
export const CAMINHO_DO_MANIFESTO_DO_PAINEL = "/api/painel/manifest";

export const COR_DA_ASTROIMOB = "#6d5dfc";

const HEX = /^#[0-9a-fA-F]{6}$/;

type DadosDoManifesto = { nome: string; logoUrl: string | null; cor: string | null };

/**
 * O manifesto do app de um grupo (ou da AstroImob, sem grupo): nome, ícones,
 * cor do grupo (`site_cor`) e `start_url` no painel. Abre como app
 * (`standalone`): o corretor que instala quer o painel, não uma aba. A Next
 * Home segue com o manifesto dela, `src/app/manifest.ts`.
 */
export function manifestoDoPainel({ nome, logoUrl, cor }: DadosDoManifesto): MetadataRoute.Manifest {
  return {
    name: nome,
    short_name: nome.length > 12 ? nome.slice(0, 12).trimEnd() : nome,
    description: `Painel do corretor · ${nome}`,
    lang: "pt-BR",
    start_url: "/corretor",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: cor && HEX.test(cor) ? cor : COR_DA_ASTROIMOB,
    icons: logoUrl
      ? [{ src: logoUrl, sizes: "any", purpose: "any" }]
      : [
          { src: "/icones/astroimob-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icones/astroimob-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icones/astroimob-mascaravel-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
  };
}

