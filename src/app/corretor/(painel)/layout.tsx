import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FaixaCobranca } from "./_componentes/FaixaCobranca";
import { FaixaConexao } from "./_componentes/FaixaConexao";
import { FaixaCotaDaIa } from "./_componentes/FaixaCotaDaIa";
import { FaixaLimitesDoPlano } from "./_componentes/FaixaLimitesDoPlano";
import { FundoDoPainel } from "./_componentes/FundoDoPainel";
import { LuzDosCartoes } from "./_componentes/LuzDosCartoes";
import { TransicaoDeTela } from "./_componentes/TransicaoDeTela";
import { NavPainel } from "./NavPainel";
import { NavMobileBottom } from "./NavMobileBottom";
import { GavetaLateral } from "./GavetaLateral";
import { BotaoGaveta } from "./BotaoGaveta";
import { BalaoConsultor } from "./BalaoConsultor";
import { CabecalhoDoPainel } from "./_componentes/CabecalhoDoPainel";
import { COOKIE_MENU_LATERAL, lerMenuRecolhido } from "./_componentes/menuLateral";
import { CromaDoModulo } from "./CromaDoModulo";
import { FONTES_DA_ASTRO } from "@/lib/fontesDaAstro";
import { DESTINO_SENHA_VENCIDA, senhaDaSessaoVencida } from "@/lib/auth/validadeDaSenhaNoServidor";
import { MenuDaConta } from "./MenuDaConta";
import { LogoDoPainel, MarcaDoPainelProvider } from "./_componentes/NomeDaCasa";
import { marcaDoPainel } from "@/lib/marcaDoCrm/doPainel";
import { MARCA_DA_PLATAFORMA, rotuloDaConta } from "@/lib/marcaDaPlataforma";
import { SeloAstro } from "@/components/marca/SeloAstro";
import { CAMINHO_DO_MANIFESTO_DO_PAINEL, iconesDoGrupo } from "@/lib/marcaDoCrm/icones";
import { sair } from "@/app/corretor/actions";
import { SeletorTema } from "@/components/tema/SeletorTema";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { iniciais } from "@/lib/format";
import { cadastroEstaPendente } from "@/lib/corretores/cadastroPendente";
import { createClient } from "@/lib/supabase/server";

/**
 * Título das abas e ícone do painel. A Next Home (grupo 1) fica como sempre
 * foi. Outro grupo não herda o nome nem o ícone dela: a aba leva o nome da
 * casa dele, e o ícone é a logo dele ou o da Astro Soluções, e o manifesto é o dele
 * (`/api/painel/manifest`). O `favicon.ico` mora em `public/` justamente para
 * não vencer o `icons` do grupo.
 */
export async function generateMetadata(): Promise<Metadata> {
  const marca = await marcaDoPainel();
  const base: Metadata = { robots: { index: false, follow: false } };
  if (marca.ehNextHome) {
    return { ...base, title: { default: "Painel do corretor", template: "%s · Painel" } };
  }
  return {
    ...base,
    title: { default: `Painel · ${marca.nome}`, template: `%s · ${marca.nome}` },
    icons: iconesDoGrupo(marca),
    manifest: CAMINHO_DO_MANIFESTO_DO_PAINEL,
  };
}

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
  const [corretor, guardados, senhaVencida] = await Promise.all([
    getCorretorLogado(),
    cookies(),
    senhaDaSessaoVencida(),
  ]);
  // Senha com mais de 90 dias (29/10/2026): troca antes de qualquer tela.
  // Lido do JWT, sem ida ao Auth; o login já confere, isto pega quem nunca sai.
  if (senhaVencida) redirect(DESTINO_SENHA_VENCIDA);
  // Ficha criada só para conceder acesso administrativo: permanece fora do
  // painel até o próprio titular informar os dados obrigatórios.
  if (corretor && cadastroEstaPendente(corretor.creci)) redirect("/corretor/completar-cadastro");
  // Administrador da plataforma sem ficha de corretor (o dono): o login já o
  // manda para /plataforma, mas o app e os atalhos abrem /corretor direto, e
  // ele caía preso em "conta sem vínculo" (29/10/2026). Decide pela sessão,
  // como `exigirAdminDaPlataforma*`; só roda para quem não tem corretor.
  if (!corretor) {
    const supabase = await createClient();
    const { data: ehAdmin } = await supabase.rpc("eh_admin_da_plataforma");
    if (ehAdmin === true) redirect("/plataforma");
  }
  // Termos de uso no primeiro acesso (limites do plano, 0198): quem não aceitou a
  // O aceite dos termos está temporariamente desativado; a página e a action
  // continuam preservadas para reativação posterior.
  // Termos de uso no primeiro acesso (fase 2D, 0198): quem não aceitou a
  // versão vigente vai ler e aceitar antes de qualquer tela. A página dos
  // termos mora FORA deste grupo (senão seria redirecionada para si mesma),
  // e entrar, recuperar, criar e trocar senha também: nada disso passa por
  // aqui (trocar a senha provisória não pode esperar o aceite).
  const marca = await marcaDoPainel();
  const ehGestor = corretor?.papel === "gestor";
  // Sem sessão o painel mostra a tela de conta sem vínculo; o menu segue o
  // padrão de antes (imobiliária), que só esconde o que já escondia.
  const tipoDoGrupo = corretor?.tipoDoGrupo ?? "imobiliaria";
  // A lateral do computador nasce do jeito que a pessoa deixou (ver menuLateral.ts).
  const menuRecolhido = lerMenuRecolhido(guardados.get(COOKIE_MENU_LATERAL)?.value);

  return (
    <MarcaDoPainelProvider marca={{ nome: marca.nome, wordmark: marca.wordmark, logoUrl: marca.logoUrl }}>
    <CromaDoModulo className={`${FONTES_DA_ASTRO} bg-fundo relative isolate flex min-h-svh flex-1 flex-col`}>
      {/*
        A aurora e o grão, fixos atrás de todo o painel (24/09/2026). São o
        que os cartões translúcidos e o vidro do cabeçalho deixam transparecer
        — sem eles, vidro sobre fundo liso é só cinza (lição do HeroInicio).
        Acompanham `--color-acento`, então mudam de cor com a seção, com a
        transição que `@property` já dá ao token. `isolate` no <main> segura o
        `-z-10` dentro deste contexto: ficam sobre o fundo e sob o conteúdo.
        `LuzDosCartoes` é o foco que segue o ponteiro nos cartões (só desktop).
      */}
      <FundoDoPainel />
      <LuzDosCartoes />
      <div aria-hidden className="faixa-de-status" />
      {/* No celular ele sai de cena ao rolar para baixo e volta ao subir
          (ver CabecalhoDoPainel); no computador fica. */}
      <CabecalhoDoPainel className="border-linha bg-fundo/85 pt-safe sticky top-0 z-40 border-b backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-[84rem] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-1">
            {/* O hambúrguer só existe no celular e só quando há sessão: sem
                corretor não há gaveta para abrir. */}
            {corretor && <BotaoGaveta />}
            {/* A barra da empresa (28/10/2026), como TOTVS e SAP: o produto
                (Astro Soluções) e, ao lado, a imobiliária ou o corretor
                autônomo da sessão, com a logo ou o nome do grupo. */}
            <Link
              href="/corretor"
              aria-label={`${MARCA_DA_PLATAFORMA.nome}, início do CRM`}
              className="text-titulo flex shrink-0 items-center gap-2"
            >
              <SeloAstro className="size-7" />
              <span className="text-fluid-sm hidden font-semibold tracking-tight whitespace-nowrap lg:inline">
                {MARCA_DA_PLATAFORMA.wordmark[0]}
                <span className="text-apoio font-normal">{MARCA_DA_PLATAFORMA.wordmark[1]}</span>
              </span>
            </Link>
            {corretor && (
              <>
                <span aria-hidden className="bg-linha-forte mx-1.5 h-6 w-px shrink-0 sm:mx-2.5" />
                <Link
                  href="/"
                  title={`${rotuloDaConta(tipoDoGrupo)}: ${marca.nome}`}
                  className="flex min-w-0 items-center gap-2.5"
                >
                  <span className="font-display text-titulo min-w-0 truncate text-lg">
                    <LogoDoPainel marca={marca} destaque="text-acento-suave" />
                  </span>
                  <span className="border-linha text-apoio hidden shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] tracking-[0.08em] uppercase md:inline">
                    {rotuloDaConta(tipoDoGrupo)}
                  </span>
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <SeletorTema />

            {corretor && (
              <MenuDaConta
                nome={corretor.nome}
                fotoUrl={corretor.fotoUrl}
                iniciais={iniciais(corretor.nome)}
                formularioSair={
                  <form action={sair} data-sair>
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
      </CabecalhoDoPainel>

      {corretor ? (
        <>
          {/*
            Enquanto o número está fora do ar, nada mais no painel está
            acontecendo de verdade — por isso a faixa vem antes do conteúdo,
            em toda tela. Ela devolve `null` no caminho feliz, que é quase
            sempre (ver FaixaConexao).
          */}
          <FaixaConexao corretorId={corretor.id} />
          {/* A cota de respostas da IA do grupo (fase 2B): gestor a partir de
              80%, todos quando acaba. `null` quase sempre. */}
          <FaixaCotaDaIa />
          {/* Artes, vídeos e mensagens de lista do plano (limites do plano): idem. */}
          <FaixaLimitesDoPlano />
          {/* A mensalidade do grupo (fase 2C): vencida ou em atraso, para
              todos. `null` com a cobrança em dia ou isenta. */}
          <FaixaCobranca />

          {/*
            A coluna de conteúdo fica em 1fr e a da lateral em `auto`: quem
            diz a largura é a própria lateral, 15rem aberta e 4rem recolhida
            (09/10/2026). Aberta, dá ~64rem de leitura no monitor comum — o
            que o quadro do funil e a tabela da equipe pedem; recolhida, a
            tela de trabalho ganha 11rem. Formulários se capam por conta
            própria.
          */}
          <div className="mx-auto grid w-full max-w-[84rem] flex-1 grid-cols-1 gap-8 px-4 pt-6 pb-28 md:grid-cols-[auto_minmax(0,1fr)] md:px-8 md:pb-16">
            <NavPainel ehGestor={ehGestor} tipoDoGrupo={tipoDoGrupo} recolhidoInicial={menuRecolhido} />
            <TransicaoDeTela>{children}</TransicaoDeTela>
          </div>
          <NavMobileBottom />
          <GavetaLateral ehGestor={ehGestor} tipoDoGrupo={tipoDoGrupo} />
          {/*
            O consultor a um toque, de qualquer tela. Mora aqui, e não em
            cada página, porque layout não re-executa entre rotas irmãs: a
            conversa aberta em Pessoas continua aberta em Imóveis, sem store
            e sem URL. Ele mesmo se cala na tela do consultor.
          */}
          <BalaoConsultor />
        </>
      ) : (
        <div className="mx-auto w-full max-w-2xl px-4 py-12">
          <ContaSemVinculo />
        </div>
      )}
    </CromaDoModulo>
    </MarcaDoPainelProvider>
  );
}

/**
 * A conta autenticou, mas nenhuma linha de `corretores` aponta para ela (ou
 * aponta sem `slug`). Sem isso o painel quebraria em toda página; aqui o
 * corretor recebe uma instrução em vez de um erro. O menu da conta só existe
 * com corretor, então o "Sair" mora aqui: sem ele a pessoa ficava presa na
 * tela, sem como entrar com outro login (29/10/2026).
 */
function ContaSemVinculo() {
  return (
    <div className="cartao p-7">
      <h1 className="font-display text-titulo text-lg">Conta ainda não vinculada</h1>
      <p className="text-fluid-sm text-corpo mt-2">
        Seu acesso está ativo, mas ainda não foi ligado a um cadastro de corretor. Fale com
        quem administra o site para concluir o vínculo — depois disso o painel abre normalmente.
      </p>
      <form action={sair} data-sair className="mt-6">
        <button
          type="submit"
          className="botao-secundario text-fluid-sm text-corpo min-h-11 w-full rounded-full px-7 py-3 sm:w-auto"
        >
          Sair e entrar com outra conta
        </button>
      </form>
    </div>
  );
}
