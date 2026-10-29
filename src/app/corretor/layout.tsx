import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { FontesDaAstroNoDocumento } from "@/components/marca/FontesDaAstroNoDocumento";
import { ICONES_ASTROIMOB, MANIFESTO_DA_PLATAFORMA } from "@/lib/marcaDoCrm/icones";
import { ehEnderecoSoDoPainel } from "@/lib/enderecosDoPainel";
import { APP_DO_IPHONE, META_DO_IPHONE } from "@/lib/marcaDoCrm/iphone";
import { AberturaDoApp } from "./AberturaDoApp";
import { COR_DA_BARRA_DO_PAINEL, ComportamentoDeApp } from "./ComportamentoDeApp";

const ARETZ_HOSTS = new Set(["aretzimoveis.com", "www.aretzimoveis.com"]);
const ARETZ_FAVICON =
  "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/grupos/442f2289-bba9-46f9-b9de-9e0df95a049c/logo-selo.png";

function hostSemPorta(host: string | null): string {
  return (host ?? "").toLowerCase().split(":")[0].replace(/\.$/, "");
}

/** Icon for public `/corretor` pages, selected only by host. */
export async function generateMetadata(): Promise<Metadata> {
  const host = hostSemPorta((await headers()).get("host"));
  if (ARETZ_HOSTS.has(host)) {
    return {
      icons: {
        icon: [{ url: ARETZ_FAVICON, type: "image/png" }],
        apple: [{ url: ARETZ_FAVICON, type: "image/png" }],
      },
      manifest: null,
    };
  }
  if (!ehEnderecoSoDoPainel(host)) return {};
  // No iPhone, "Adicionar à Tela de Início" abre como app, com as telas de
  // abertura da Astro (29/10/2026; `lib/marcaDoCrm/iphone.ts`). Só aqui, no
  // endereço do app: os sites dos grupos seguem com `capable: false` do raiz.
  return { icons: ICONES_ASTROIMOB, manifest: MANIFESTO_DA_PLATAFORMA, appleWebApp: APP_DO_IPHONE, other: META_DO_IPHONE };
}

/**
 * A barra de status do celular no fundo do painel da Astro, não no sálvia do
 * site da Next (29/10/2026). As telas de acesso pedem o marinho do céu delas;
 * o tema escuro e a troca de tela são corrigidos por `SCRIPT_DA_BARRA`.
 */
export const viewport: Viewport = { themeColor: COR_DA_BARRA_DO_PAINEL.claro };

/**
 * A abertura animada mora AQUI, e não no layout do painel: o app abre em
 * `/corretor`, que manda quem não entrou para `/corretor/entrar`, e os dois
 * passam por este layout. Ela só aparece no app instalado (`AberturaDoApp`).
 */
export default function CorretorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ComportamentoDeApp />
      <FontesDaAstroNoDocumento />
      <AberturaDoApp />
      {children}
    </>
  );
}
