import type { Metadata } from "next";
import Link from "next/link";
import { NavPainel } from "./NavPainel";
import { NavMobileBottom } from "./NavMobileBottom";
import { sair } from "@/app/corretor/actions";
import { getCorretorLogado } from "@/lib/corretorSessao";

export const metadata: Metadata = {
  title: { default: "Painel do corretor", template: "%s · Painel" },
  robots: { index: false, follow: false },
};

/**
 * Casca da área logada.
 *
 * Vive num grupo `(painel)` e não direto em `app/corretor/` porque um layout
 * ali envolveria também `entrar/`, e a tela de login apareceria com a
 * navegação do painel.
 *
 * A guarda aqui é a segunda camada — o `proxy.ts` já barra quem não tem
 * sessão antes de chegar. Layouts não re-executam a cada navegação entre
 * rotas irmãs, então cada Server Action revalida a sessão por conta própria
 * em vez de confiar nesta checagem.
 */
export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const corretor = await getCorretorLogado();

  return (
    <main className="flex min-h-svh flex-1 flex-col bg-ink-950 px-4 pt-10 pb-28 md:pb-20">
      {/*
        Mais largo que as páginas públicas de propósito: o quadro do funil tem
        sete colunas e a tabela da equipe tem cinco. A 768px o kanban rolava na
        horizontal com metade da tela vazia dos dois lados, o que parece
        defeito. Os formulários se capam por conta própria — campo de nome com
        1024px de largura seria o erro oposto.
      */}
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-display text-lg text-mist-50">
            Next<span className="text-brand-300">Home</span>
          </Link>

          <div className="flex items-center gap-4">
            {corretor && <span className="text-fluid-sm text-mist-400">{corretor.nome}</span>}
            <form action={sair}>
              <button
                type="submit"
                className="text-fluid-sm text-mist-400 underline-offset-4 hover:text-mist-100 hover:underline"
              >
                Sair
              </button>
            </form>
          </div>
        </div>

        {corretor ? (
          <>
            <NavPainel ehGestor={corretor.papel === "gestor"} />
            <div className="mt-8">{children}</div>
            <NavMobileBottom />
          </>
        ) : (
          <ContaSemVinculo />
        )}
      </div>
    </main>
  );
}

/**
 * A conta autenticou, mas nenhuma linha de `corretores` aponta para ela (ou
 * aponta sem `slug`). Sem isso o painel quebraria em toda página; aqui o
 * corretor recebe uma instrução em vez de um erro.
 */
function ContaSemVinculo() {
  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-ink-900/50 p-7">
      <h1 className="font-display text-lg text-mist-50">Conta ainda não vinculada</h1>
      <p className="text-fluid-sm mt-2 text-mist-300">
        Seu acesso está ativo, mas ainda não foi ligado a um cadastro de corretor. Fale com
        quem administra o site para concluir o vínculo — depois disso o painel abre normalmente.
      </p>
    </div>
  );
}
