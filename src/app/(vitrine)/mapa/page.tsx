import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MapaEmpreendimentos } from "@/components/mapa/MapaEmpreendimentos";
import { getEmpreendimentos } from "@/lib/queries";
import { site } from "@/lib/site";import { ClipboardList } from 'lucide-react';


export const metadata: Metadata = {
  title: "Mapa Interativo de Imóveis e Lançamentos em Alphaville",
  description: `Explore os edifícios, condomínios e lançamentos de alto padrão em Alphaville, Tamboré e Barueri diretamente no mapa interativo da ${site.nome}.`,
  alternates: { canonical: "/mapa" },
  openGraph: {
    title: `Mapa de Imóveis em Alphaville | ${site.nome}`,
    description: "Navegue pelo mapa noturno interativo e descubra os melhores endereços de alto padrão.",
    url: `${site.url}/mapa`,
  },
};

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<{ imovel?: string }>;
}) {
  const [params, todosEmpreendimentos] = await Promise.all([
    searchParams,
    getEmpreendimentos(),
  ]);

  return (
    <main className="relative min-h-screen pt-20 pb-8 px-4 sm:px-6 max-w-7xl mx-auto flex flex-col justify-between">
      <SiteHeader />

      <div className="space-y-4">
        {/* Cabeçalho da Página do Mapa */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div>
            <span className="text-[11px] uppercase tracking-widest font-bold text-acento-forte">
              Geolocalização & Arquitetura
            </span>
            <h1 className="text-fluid-xl sm:text-fluid-2xl font-bold text-titulo tracking-tight">
              Mapa de Imóveis & Lançamentos
            </h1>
            <p className="text-fluid-xs sm:text-fluid-sm text-legenda">
              Navegue pelos empreendimentos em Alphaville e Tamboré. Toque nos marcadores para ver os detalhes.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/empreendimentos"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-corpo text-fluid-xs font-semibold backdrop-blur border border-white/15 transition-all"
            >
              <span> <ClipboardList className="inline-block w-5 h-5 align-text-bottom mr-1" />  Ver em Lista</span>
            </Link>
          </div>
        </div>

        {/* Mapa Interativo */}
        <div className="w-full">
          <MapaEmpreendimentos
            empreendimentos={todosEmpreendimentos}
            imovelInicialSlug={params.imovel}
            alturaClasse="h-[76vh] min-h-[520px]"
          />
        </div>
      </div>
    </main>
  );
}
