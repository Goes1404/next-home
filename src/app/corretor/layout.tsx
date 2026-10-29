import type { Metadata } from "next";
import { headers } from "next/headers";
import { ICONES_ASTROIMOB, MANIFESTO_DA_PLATAFORMA } from "@/lib/marcaDoCrm/icones";
import { ehEnderecoSoDoPainel } from "@/lib/enderecosDoPainel";
import { AberturaDoApp } from "./AberturaDoApp";

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
  return { icons: ICONES_ASTROIMOB, manifest: MANIFESTO_DA_PLATAFORMA };
}

/**
 * A abertura animada mora AQUI, e não no layout do painel: o app abre em
 * `/corretor`, que manda quem não entrou para `/corretor/entrar`, e os dois
 * passam por este layout. Ela só aparece no app instalado (`AberturaDoApp`).
 */
export default function CorretorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AberturaDoApp />
      {children}
    </>
  );
}
