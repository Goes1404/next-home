import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { COR_DA_BARRA } from "@/lib/tema";

/**
 * O que o celular usa quando alguém põe o site na tela inicial.
 *
 * Sem manifesto, o Android montava o atalho com o favicon pequeno dentro de
 * um quadrado branco, e o ícone saía borrado. Com ele, o celular recebe o
 * ícone em 512 px e uma versão "mascarável", que ele recorta no formato dos
 * outros ícones da tela.
 *
 * Duas escolhas que parecem esquecimento e não são (`manifest.test.ts`):
 *
 * - `display: "browser"`: o atalho abre no navegador, como sempre abriu. Com
 *   "standalone" o Chrome passa a oferecer "Instalar app" a todo visitante do
 *   site e o atalho abre sem a barra de endereço.
 * - Sem `start_url`: o atalho abre a página em que a pessoa estava. Com
 *   `start_url: "/"`, o corretor que põe o painel na tela inicial ganharia um
 *   atalho para a home do site.
 *
 * Os ícones saem de `node scripts/marca/gerarIcones.mjs`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.nomeCompleto,
    short_name: site.nome,
    description: site.descricao,
    lang: "pt-BR",
    display: "browser",
    background_color: "#ffffff",
    theme_color: COR_DA_BARRA.claro,
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/icone-mascaravel-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
