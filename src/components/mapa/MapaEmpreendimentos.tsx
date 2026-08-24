"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Empreendimento } from "@/lib/types";

// Dynamic import com SSR desativado para garantir compatibilidade 100% com o Leaflet no Next.js
const MapaClient = dynamic(() => import("./MapaInterativoClient"), {
  ssr: false,
  // Sem altura própria: o wrapper abaixo já tem a `alturaClasse` do chamador.
  // O esqueleto antigo fixava a altura de /mapa (100vh-80px) para TODOS os
  // call sites — na home isso dava 224px de salto de layout quando o mapa
  // real (62vh) chegava pelo chunk.
  loading: () => (
    <div className="flex h-full w-full animate-pulse flex-col items-center justify-center gap-3 rounded-2xl border border-linha bg-superficie/80 backdrop-blur-xl">
      <div className="relative flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-400" />
        <div className="absolute h-3 w-3 rounded-full bg-brand-400" />
      </div>
      <p className="text-fluid-sm font-medium tracking-wide text-apoio">
        Carregando mapa interativo de Alphaville...
      </p>
    </div>
  ),
});

interface Props {
  empreendimentos: Empreendimento[];
  imovelInicialSlug?: string;
  alturaClasse?: string;
  /**
   * Modo para o mapa EMBUTIDO no meio de uma página (a home): gestos de toque
   * contidos até o usuário pedir, sem a barra de filtros própria. Em /mapa,
   * onde o mapa é o conteúdo, fica false e nada muda.
   */
  compacto?: boolean;
  /**
   * Só baixa o chunk do Leaflet (146 KB + tiles de CDN externo) quando a
   * seção se aproxima da viewport. Medido: na home o mapa inicializava com
   * scrollY = 0, a 5,5 telas da dobra — 15 requisições de tile que o
   * visitante talvez nunca role até ver.
   */
  adiarAteVisivel?: boolean;
  /** Repassa ao mapa a entrada voada de quem vem caindo do globo. */
  entradaCinematica?: boolean;
}

export function MapaEmpreendimentos({ alturaClasse = "h-[calc(100vh-80px)] min-h-[500px]", adiarAteVisivel = false, ...props }: Props) {
  const sentinela = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(!adiarAteVisivel);

  useEffect(() => {
    if (visivel) return;
    const el = sentinela.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) setVisivel(true);
      },
      // 400px de antecedência: o chunk chega antes de a seção entrar na tela.
      { rootMargin: "400px 0px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [visivel]);

  return (
    <div ref={sentinela} className={`w-full ${alturaClasse}`}>
      {visivel ? (
        <MapaClient {...props} alturaClasse="h-full" />
      ) : (
        <div className="h-full w-full rounded-2xl border border-linha bg-superficie/60" />
      )}
    </div>
  );
}
