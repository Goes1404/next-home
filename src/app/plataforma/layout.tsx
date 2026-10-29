import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ehEnderecoSoDoPainel } from "@/lib/enderecosDoPainel";
import { sair } from "@/app/corretor/actions";
import { SeletorTema } from "@/components/tema/SeletorTema";
import { MarcaAstro } from "@/components/marca/SeloAstro";
import { ICONES_ASTROIMOB, MANIFESTO_DA_PLATAFORMA } from "@/lib/marcaDoCrm/icones";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";

/** Em `astroimob.vercel.app` o ícone é o da Astro Soluções; nos outros endereços, como sempre foi. */
export async function generateMetadata(): Promise<Metadata> {
  const base: Metadata = { title: { default: "Plataforma · Astro Soluções", template: "%s · Astro Soluções" }, robots: { index: false, follow: false } };
  return ehEnderecoSoDoPainel((await headers()).get("host")) ? { ...base, icons: ICONES_ASTROIMOB, manifest: MANIFESTO_DA_PLATAFORMA } : base;
}

/**
 * Casca da área do administrador da plataforma (fase 2A, desenho §11).
 *
 * Fica FORA de `app/corretor/(painel)` de propósito: aquele layout parte de
 * `getCorretorLogado()`, e o administrador da plataforma pode não ter ficha
 * em `corretores` — ele cairia em "Conta sem vínculo". Aqui ninguém lê a
 * ficha: quem decide é `eh_admin_da_plataforma()`, pela sessão.
 *
 * A guarda aqui é a primeira entrada; cada `page.tsx` chama a dela de novo,
 * porque layout não re-executa entre rotas irmãs. O `proxy.ts` já barra quem
 * não tem sessão.
 *
 * `data-rota="painel"` traz a paleta do painel (tokens de `globals.css`), sem
 * a navegação dele.
 */
export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  await exigirAdminDaPlataformaNaPagina();

  return (
    <main data-rota="painel" className="bg-fundo relative isolate flex min-h-svh flex-1 flex-col">
      <header className="border-linha bg-fundo/85 pt-safe sticky top-0 z-40 border-b">
        <div className="mx-auto flex w-full max-w-[84rem] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/plataforma" className="font-display text-titulo text-lg">
              <MarcaAstro selo="size-7" destaque="text-apoio font-normal" />
            </Link>
            <span className="text-fluid-xs text-apoio tracking-[0.16em] uppercase">Plataforma</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <SeletorTema />
            <form action={sair}>
              <button
                type="submit"
                className="text-fluid-sm text-apoio hover:bg-vidro hover:text-titulo flex min-h-11 cursor-pointer items-center rounded-xl px-3 transition-colors"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[84rem] flex-1 px-4 pt-6 pb-16 md:px-8">
        <p className="text-fluid-sm text-apoio border-linha mb-6 rounded-xl border px-4 py-3">
          Esta área mostra cadastro e números, nunca conversas nem fichas.
        </p>
        {children}
      </div>
    </main>
  );
}
