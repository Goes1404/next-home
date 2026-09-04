import Link from "next/link";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { contarCandidatosPendentes } from "@/lib/imoveis/candidatosDoCatalogo";
import { PendenciasDoCatalogo } from "./_componentes/PendenciasDoCatalogo";
import { ListaImoveisClient } from "./ListaImoveisClient";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";

export const metadata = {
  title: "Gestão & Edição de Imóveis | Painel do Corretor",
  description: "Edite fotos, textos, preços, plantas e características dos imóveis do catálogo.",
};

export const dynamic = "force-dynamic";

export default async function ImoveisPage() {
  const [imoveis, candidatosPendentes] = await Promise.all([
    getEmpreendimentosDoPainel(),
    contarCandidatosPendentes(),
  ]);

  /*
   * A lista mostra rascunho (é o painel); a lista de PENDÊNCIAS, não. O
   * cartão promete o que "a assistente sente na conversa", e ela só enxerga
   * o que está publicado — encher aquilo com rascunho recém-criado, que é
   * incompleto por definição, esvaziaria a promessa do cartão.
   */
  const publicados = imoveis.filter((i) => i.publicado ?? true);

  return (
    <div className="space-y-6">
      {/*
        A sobrelinha "CATÁLOGO & PORTFÓLIO" saiu: era um rótulo em cima de um
        título, dizendo a mesma coisa duas vezes — e ficava FORA do
        `CabecalhoDeTela`, então o filete de cor do módulo começava embaixo
        dela e a coluna nascia torta.

        "Edição & Gestão de Imóveis" era o nome que o sistema dava a si mesmo.
        O corretor pensa "imóveis" antes de tocar no menu, e é assim que o item
        do menu se chama — o título repete a palavra dele, não a nossa.

        Os dois botões estavam com `min-h-10` (40px) num painel que usa 44 em
        todo o resto: os únicos alvos abaixo do padrão da casa.
      */}
      <CabecalhoDeTela
        titulo="Imóveis"
        descricao="Fotos, textos, preços, tipologias e lazer — do celular ou do computador."
        acao={
          <Link
            href="/corretor/imoveis/novo"
            className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-medium transition-colors"
          >
            + Novo imóvel
          </Link>
        }
        abaixo={
          /* Links por imóvel e Criar imagem saíram do menu (teto de sete
             destinos); o caminho é por aqui. */
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/corretor/links"
              className="text-fluid-xs border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo inline-flex min-h-11 items-center rounded-full border px-3.5 transition-colors"
            >
              Links por imóvel
            </Link>
            <Link
              href="/corretor/imoveis/criar-imagem"
              className="text-fluid-xs border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo inline-flex min-h-11 items-center rounded-full border px-3.5 transition-colors"
            >
              Criar imagem
            </Link>
          </div>
        }
      />

      {/*
        Antes da lista de propósito: é trabalho pendente, não navegação. O
        cartão some sozinho quando o cadastro estiver completo — e a lista de
        imóveis já está carregada aqui, então isto não custa consulta nenhuma.
      */}
      <PendenciasDoCatalogo imoveis={publicados} />

      {/*
        O cartão só existe enquanto há decisão pendente — contador que vive
        em zero ensina a ignorar o contador. E o número é o gancho: sem ele,
        quem nunca abriu a fila não tem como saber que há trabalho ali.
      */}
      {candidatosPendentes > 0 && (
        <Link
          href="/corretor/imoveis/candidatos"
          className="cartao hover:border-acento-linha flex items-center gap-4 px-5 py-4 transition-colors sm:px-6"
        >
          <span className="min-w-0 flex-1">
            <span className="text-fluid-sm text-titulo block font-medium">
              {candidatosPendentes === 1
                ? "1 lançamento de Barueri esperando decisão"
                : `${candidatosPendentes} lançamentos de Barueri esperando decisão`}
            </span>
            <span className="text-fluid-xs text-apoio mt-0.5 block text-pretty">
              Levantamento do mercado: o que existe em obra na região e ainda não está no catálogo.
            </span>
          </span>
          <span className="text-tenue text-fluid-sm shrink-0" aria-hidden>
            →
          </span>
        </Link>
      )}

      <ListaImoveisClient imoveis={imoveis} />
    </div>
  );
}
