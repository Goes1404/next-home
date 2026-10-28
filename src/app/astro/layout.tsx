import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { ICONES_ASTROIMOB } from "@/lib/marcaDoCrm/icones";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";

/**
 * A página de vendas da Astro Soluções (28/10/2026). Mora fora do site das
 * imobiliárias (`/s/[site]`): é a raiz de `astroimob.vercel.app`, reescrita
 * pelo `proxy.ts`, e também abre direto em `/astro` em qualquer endereço.
 *
 * As fontes são só desta página e não são pré-carregadas no resto do app:
 * Bricolage Grotesque nos títulos, Figtree no texto.
 */
const titulos = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-astro-titulo",
  display: "swap",
});

const texto = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-astro-texto",
  display: "swap",
});

export const metadata: Metadata = {
  title: { absolute: `${MARCA_DA_PLATAFORMA.nome} · CRM com IA para imobiliárias e corretores` },
  description:
    "O CRM da Astro Soluções responde seus leads no WhatsApp com IA, organiza o funil, distribui os leads dos anúncios e marca as visitas.",
  icons: ICONES_ASTROIMOB,
  manifest: null,
  openGraph: {
    title: `${MARCA_DA_PLATAFORMA.nome} · CRM com IA para imobiliárias`,
    description: "Seu lead respondido no WhatsApp em segundos, o funil em ordem e a visita na agenda.",
    type: "website",
    locale: "pt_BR",
  },
};

export default function AstroLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${titulos.variable} ${texto.variable} astro-pagina flex flex-1 flex-col`}>{children}</div>;
}
