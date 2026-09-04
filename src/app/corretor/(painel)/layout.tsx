import type { Metadata } from "next";
import Link from "next/link";
import { FaixaConexao } from "./_componentes/FaixaConexao";
import { NavPainel } from "./NavPainel";
import { NavMobileBottom } from "./NavMobileBottom";
import { GavetaLateral } from "./GavetaLateral";
import { BotaoGaveta } from "./BotaoGaveta";
import { CromaDoModulo } from "./CromaDoModulo";
import { MenuDaConta } from "./MenuDaConta";
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
 * trocam com o tema; ver a camada semântica em `globals.css`. A casca é
 * envolvida por `CromaDoModulo`, que escreve `data-modulo` e com isso troca a
 * cor de acento do painel inteiro conforme a seção — ele precisa ser client
 * justamente porque este layout NÃO re-executa ao navegar entre rotas irmãs.
 */
export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [corretor, tema] = await Promise.all([getCorretorLogado(), getTemaEscolhido()]);
  const ehGestor = corretor?.papel === "gestor";

  return (
    <CromaDoModulo className="bg-fundo relative isolate flex min-h-svh flex-1 flex-col">
      {/*
        Dois brilhos na cor do módulo, fixos atrás de todo o painel. São o que
        os cartões translúcidos e o vidro do cabeçalho deixam transparecer —
        sem eles, vidro sobre fundo liso é só cinza (lição do HeroInicio).
        Acompanham `--color-acento`, então mudam de cor com a seção, com a
        transição que `@property` já dá ao token. `isolate` no <main> segura o
        `-z-10` dentro deste contexto: ficam sobre o fundo e sob o conteúdo.
      */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="from-acento/25 absolute -top-40 right-[-12%] h-[30rem] w-[30rem] rounded-full bg-gradient-to-br to-transparent blur-3xl" />
        <div className="from-acento/15 absolute bottom-[-10rem] left-[-8rem] h-[26rem] w-[26rem] rounded-full bg-gradient-to-tr to-transparent blur-3xl" />
      </div>
      <header className="border-linha bg-fundo/85 sticky top-0 z-40 border-b backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-[84rem] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-1">
            {/* O hambúrguer só existe no celular e só quando há sessão: sem
                corretor não há gaveta para abrir. */}
            {corretor && <BotaoGaveta />}
            <Link href="/" className="font-display text-titulo text-lg">
              Next<span className="text-acento-suave">Home</span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <SeletorTema atual={tema} />

            {corretor && (
              <MenuDaConta
                nome={corretor.nome}
                fotoUrl={corretor.fotoUrl}
                iniciais={iniciais(corretor.nome)}
                formularioSair={
                  <form action={sair}>
                    <button
                      type="submit"
                      className="text-fluid-sm text-apoio hover:bg-vidro hover:text-titulo flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M15 17l5-5-5-5" />
                        <path d="M20 12H9" />
                        <path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
                      </svg>
                      Sair
                    </button>
                  </form>
                }
              />
            )}

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
            antes. É o que o quadro do funil (seis colunas desde a 0045) e a tabela da
            equipe (cinco) pedem; formulários se capam por conta própria.
          */}
          <div className="mx-auto grid w-full max-w-[84rem] flex-1 grid-cols-1 gap-8 px-4 pt-6 pb-28 md:grid-cols-[15rem_minmax(0,1fr)] md:px-8 md:pb-16">
            <NavPainel ehGestor={ehGestor} />
            <div className="min-w-0">{children}</div>
          </div>
          <NavMobileBottom />
          <GavetaLateral ehGestor={ehGestor} />
        </>
      ) : (
        <div className="mx-auto w-full max-w-2xl px-4 py-12">
          <ContaSemVinculo />
        </div>
      )}
    </CromaDoModulo>
  );
}

/**
 * A conta autenticou, mas nenhuma linha de `corretores` aponta para ela (ou
 * aponta sem `slug`). Sem isso o painel quebraria em toda página; aqui o
 * corretor recebe uma instrução em vez de um erro.
 */
function ContaSemVinculo() {
  return (
    <div className="cartao p-7">
      <h1 className="font-display text-titulo text-lg">Conta ainda não vinculada</h1>
      <p className="text-fluid-sm text-corpo mt-2">
        Seu acesso está ativo, mas ainda não foi ligado a um cadastro de corretor. Fale com
        quem administra o site para concluir o vínculo — depois disso o painel abre normalmente.
      </p>
    </div>
  );
}
