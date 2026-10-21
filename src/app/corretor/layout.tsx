import type { Metadata } from "next";
import { headers } from "next/headers";
import { ICONES_ASTROIMOB } from "@/lib/marcaDoCrm/icones";
import { ehEnderecoSoDoPainel } from "@/lib/enderecosDoPainel";

/**
 * Ícone das telas de `/corretor` que abrem em `astroimob.vercel.app` (login,
 * recuperar senha, termos, definir senha): o ícone da AstroImob, não o da
 * Next Home que o raiz põe em toda página. Em qualquer outro endereço devolve
 * nada, e o `<head>` da Next Home sai exatamente como sempre saiu. O painel
 * logado de cada grupo sobrescreve isto em `(painel)/layout.tsx`.
 *
 * Só olha o `host`: ler a sessão aqui cobraria uma ida ao Auth da tela de
 * login.
 */
export async function generateMetadata(): Promise<Metadata> {
  if (!ehEnderecoSoDoPainel((await headers()).get("host"))) return {};
  return { icons: ICONES_ASTROIMOB, manifest: null };
}

export default function CorretorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
