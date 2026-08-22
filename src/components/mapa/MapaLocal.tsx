"use client";

import dynamic from "next/dynamic";

/**
 * Mini-mapa de localização da página do imóvel.
 *
 * Substitui o iframe do openstreetmap.org: além de destoar (tiles mapnik
 * claros num site que pode estar escuro, tipografia própria, logotipo), o
 * iframe não deixava customizar o marcador nem acompanhar o tema. Aqui é o
 * mesmo Leaflet + tiles CARTO do mapa geral — uma cara só em todo o site.
 */
const MapaLocalClient = dynamic(() => import("./MapaLocalClient"), {
  ssr: false,
  loading: () => (
    <div className="aspect-[4/3] w-full animate-pulse bg-elevado sm:aspect-[16/9]" />
  ),
});

export function MapaLocal(props: { lat: number; lng: number; titulo: string }) {
  return <MapaLocalClient {...props} />;
}
