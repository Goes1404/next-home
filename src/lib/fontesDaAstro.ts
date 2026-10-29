import { Bricolage_Grotesque, Figtree } from "next/font/google";

/**
 * As fontes da marca Astro Soluções (29/10/2026): Bricolage Grotesque nos
 * títulos e Figtree no texto. Num módulo só para a página de vendas, o login
 * e a abertura do app usarem o MESMO arquivo de fonte (o `next/font` gera um
 * por chamada). Só são carregadas onde a classe `variable` entra.
 */
export const tituloDaAstro = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-astro-titulo",
  display: "swap",
});

export const textoDaAstro = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-astro-texto",
  display: "swap",
});

export const FONTES_DA_ASTRO = `${tituloDaAstro.variable} ${textoDaAstro.variable}`;
