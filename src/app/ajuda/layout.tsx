import type { Metadata } from "next";
import { FONTES_DA_ASTRO } from "@/lib/fontesDaAstro";
import { ICONES_ASTROIMOB, MANIFESTO_DA_PLATAFORMA } from "@/lib/marcaDoCrm/icones";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";

/**
 * A central de ajuda da Astro (29/10/2026): páginas públicas, iguais em todo
 * endereço (`/ajuda` está em `FORA_DO_SITE` no `proxy.ts`), com a mesma casca
 * clara das páginas legais da Astro (`/astro/termos`, `/astro/privacidade`).
 * Abre sem login: a pessoa que não consegue entrar é justamente quem mais
 * precisa de ajuda.
 */
export const metadata: Metadata = {
  title: { default: `Central de ajuda · ${MARCA_DA_PLATAFORMA.nome}`, template: `%s · Ajuda · ${MARCA_DA_PLATAFORMA.nome}` },
  description: `Artigos curtos para usar o CRM da ${MARCA_DA_PLATAFORMA.nome}: WhatsApp, avisos, leads, funil, agenda, equipe, IA e cobrança.`,
  icons: ICONES_ASTROIMOB,
  manifest: MANIFESTO_DA_PLATAFORMA,
};

export default function AjudaLayout({ children }: { children: React.ReactNode }) {
  // `data-astro`: tira as cores da Next do documento, como na página de vendas.
  return (
    <div data-astro="site" className={`${FONTES_DA_ASTRO} astro-pagina flex flex-1 flex-col`}>
      {children}
    </div>
  );
}
