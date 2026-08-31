import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FaixaConexao } from "./_componentes/FaixaConexao";
import { NavPainel } from "./NavPainel";
import { NavMobileBottom } from "./NavMobileBottom";
import { sair } from "@/app/corretor/actions";
import { SeletorTema } from "@/components/tema/SeletorTema";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { iniciais } from "@/lib/format";
import { getTemaEscolhido } from "@/lib/tema";

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
 *
 * Toda a cor vem dos tokens de papel (`bg-fundo`, `text-apoio`, …), que
 * trocam com o tema; ver a camada semântica em `globals.css`.
 */
export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [corretor, tema] = await Promise.all([getCorretorLogado(), getTemaEscolhido()]);
  const ehGestor = corretor?.papel === "gestor";

  return (
    <main data-rota="painel" className="bg-fundo flex min-h-svh flex-1 flex-col">
      <header className="border-linha bg-fundo/85 sticky top-0 z-40 border-b backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-[84rem] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Link href="/" className="font-display text-titulo text-lg">
            Next<span className="text-acento-suave">Home</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <SeletorTema atual={tema} />

            {corretor && (
              <span className="flex items-center gap-2.5">
                {corretor.fotoUrl ? (
                  <Image
                    src={corretor.fotoUrl}
                    alt=""
                    width={32}
                    height={32}
                    className="ring-linha h-8 w-8 rounded-full object-cover ring-1"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="bg-acento-lavado text-acento-suave flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
                  >
                    {iniciais(corretor.nome)}
                  </span>
                )}
                {/* O nome cabe no desktop; no celular a inicial já identifica
                    a conta e o espaço vale mais para o botão de sair. */}
                <span className="text-fluid-sm text-corpo hidden sm:inline">{corretor.nome}</span>
              </span>
            )}

            <form action={sair}>
              <button
                type="submit"
                className="border-linha text-apoio hover:border-linha-forte hover:text-titulo cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      {corretor ? (
        <>
          {/*
            Enquanto o número está fora do ar, nada mais no painel está
            acontecendo de verdade — por isso a faixa vem antes do conteúdo,
            em toda tela. Ela devolve `null` no caminho feliz, que é quase
            sempre (ver FaixaConexao).
          */}
          <FaixaConexao corretorId={corretor.id} />

          {/*
            A coluna de conteúdo fica em 1fr com a lateral fixa em 15rem, o
            que dá ~64rem de leitura no monitor comum — a mesma largura de
            antes. É o que o quadro do funil (sete colunas) e a tabela da
            equipe (cinco) pedem; formulários se capam por conta própria.
          */}
          <div className="mx-auto grid w-full max-w-[84rem] flex-1 grid-cols-1 gap-8 px-4 pt-6 pb-28 md:grid-cols-[15rem_minmax(0,1fr)] md:px-8 md:pb-16">
            <NavPainel ehGestor={ehGestor} />
            <div className="min-w-0">{children}</div>
          </div>
          <NavMobileBottom ehGestor={ehGestor} />
        </>
      ) : (
        <div className="mx-auto w-full max-w-2xl px-4 py-12">
          <ContaSemVinculo />
        </div>
      )}
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
    <div className="border-linha bg-superficie shadow-painel rounded-2xl border p-7">
      <h1 className="font-display text-titulo text-lg">Conta ainda não vinculada</h1>
      <p className="text-fluid-sm text-corpo mt-2">
        Seu acesso está ativo, mas ainda não foi ligado a um cadastro de corretor. Fale com
        quem administra o site para concluir o vínculo — depois disso o painel abre normalmente.
      </p>
    </div>
  );
}
