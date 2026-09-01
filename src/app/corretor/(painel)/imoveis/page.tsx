import Link from "next/link";
import { getEmpreendimentos } from "@/lib/queries";
import { PendenciasDoCatalogo } from "./_componentes/PendenciasDoCatalogo";
import { ListaImoveisClient } from "./ListaImoveisClient";

export const metadata = {
  title: "Gestão & Edição de Imóveis | Painel do Corretor",
  description: "Edite fotos, textos, preços, plantas e características dos imóveis do catálogo.",
};

export const dynamic = "force-dynamic";

export default async function ImoveisPage() {
  const imoveis = await getEmpreendimentos();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <span className="text-[11px] uppercase font-bold tracking-wider text-acento-suave">
            Catálogo & Portfólio
          </span>
          <h1 className="text-fluid-xl font-bold text-titulo">
            Edição & Gestão de Imóveis
          </h1>
          <p className="text-fluid-xs text-apoio max-w-2xl">
            Altere fotos, textos comerciais, preços, tipologias e diferenciais de lazer diretamente pelo celular ou computador.
          </p>
        </div>
        {/* Links por imóvel saíram do menu (roadmap: 7 destinos); o caminho é por aqui. */}
        <Link
          href="/corretor/links"
          className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo inline-flex min-h-10 items-center rounded-full border px-4 transition-colors"
        >
          Links por imóvel
        </Link>
      </div>

      {/*
        Antes da lista de propósito: é trabalho pendente, não navegação. O
        cartão some sozinho quando o cadastro estiver completo — e a lista de
        imóveis já está carregada aqui, então isto não custa consulta nenhuma.
      */}
      <PendenciasDoCatalogo imoveis={imoveis} />

      <ListaImoveisClient imoveis={imoveis} />
    </div>
  );
}
