import { Anton, Inter_Tight, JetBrains_Mono } from "next/font/google";

/**
 * As fontes da página de vendas (03/11/2026), as mesmas do site institucional
 * da Astro Soluções (astrosolucoes.netlify.app): Anton nos títulos, sempre em
 * caixa alta, Inter Tight no texto e JetBrains Mono nos selos pequenos.
 *
 * Só a página de vendas carrega estas três. O login, o painel, o assistente
 * de contratação e a ajuda seguem com Bricolage + Figtree (`fontesDaAstro.ts`).
 */
const impacto = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-vitrine-impacto",
  display: "swap",
});

const texto = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-vitrine-texto",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-vitrine-mono",
  display: "swap",
  preload: false,
});

export const FONTES_DA_VITRINE = `${impacto.variable} ${texto.variable} ${mono.variable}`;
