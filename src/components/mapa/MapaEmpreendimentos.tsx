"use client";

import dynamic from "next/dynamic";
import type { Empreendimento } from "@/lib/types";

// Dynamic import com SSR desativado para garantir compatibilidade 100% com o Leaflet no Next.js
const MapaClient = dynamic(() => import("./MapaInterativoClient"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[calc(100vh-80px)] min-h-[500px] rounded-2xl border border-white/10 bg-superficie/80 flex flex-col items-center justify-center gap-3 backdrop-blur-xl animate-pulse">
      <div className="relative flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-brand-500/30 border-t-brand-400 animate-spin" />
        <div className="absolute w-3 h-3 rounded-full bg-brand-400" />
      </div>
      <p className="text-fluid-sm text-apoio font-medium tracking-wide">
        Carregando mapa interativo de Alphaville...
      </p>
    </div>
  ),
});

interface Props {
  empreendimentos: Empreendimento[];
  imovelInicialSlug?: string;
  alturaClasse?: string;
}

export function MapaEmpreendimentos(props: Props) {
  return <MapaClient {...props} />;
}
