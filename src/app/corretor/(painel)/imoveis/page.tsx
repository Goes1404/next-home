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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <span className="text-[11px] uppercase font-bold tracking-wider text-acento-suave">
            Catálogo & Portfólio
          </span>
          {/* "Edição & Gestão de Imóveis" é o nome que o sistema dá a si
              mesmo. O corretor pensa "imóveis" antes de tocar no menu, e é
              assim que o item do menu se chama — o título repete a palavra
              dele, não a nossa. */}
          <CabecalhoDeTela
            titulo="Imóveis"
            descricao="Fotos, textos, preços, tipologias e lazer — do celular ou do computador."
          />
        </div>
        {/* Links por imóvel saíram do menu (roadmap: 7 destinos); o caminho é por aqui. */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/corretor/imoveis/novo"
            className="text-fluid-sm border-acento-linha text-titulo hover:bg-elevado inline-flex min-h-10 items-center rounded-full border px-4 font-medium transition-colors"
          >
            + Novo imóvel
          </Link>
          <Link
            href="/corretor/links"
            className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo inline-flex min-h-10 items-center rounded-full border px-4 transition-colors"
          >
            Links por imóvel
          </Link>
        </div>
      </div>

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
          className="border-linha bg-superficie hover:border-acento-linha shadow-painel flex items-center gap-4 rounded-2xl border px-5 py-4 transition-colors sm:px-6"
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
