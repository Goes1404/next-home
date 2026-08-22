"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { temaDoMapa, TILES_MAPA, ATRIBUICAO_MAPA, aoMudarTema } from "./temaDoMapa";

/**
 * Um mapa, um pin. O zoom de scroll fica desligado de propósito: este mapa
 * vive no meio de uma página longa, e capturar a roda do mouse ali
 * sequestra a rolagem de quem só estava passando pela seção.
 */
export default function MapaLocalClient({
  lat,
  lng,
  titulo,
}: {
  lat: number;
  lng: number;
  titulo: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      // O cadastro é centroide de via/bairro, não a porta do prédio (ver
      // comentário em Localizacao.tsx) — o zoom mostra a REGIÃO, com
      // honestidade sobre a precisão do dado.
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const tiles = L.tileLayer(TILES_MAPA[temaDoMapa()], {
      maxZoom: 19,
      subdomains: "abcd",
      attribution: ATRIBUICAO_MAPA,
    }).addTo(map);

    const pararDeObservarTema = aoMudarTema((tema) => tiles.setUrl(TILES_MAPA[tema]));

    const icone = L.divIcon({
      className: "custom-leaflet-div-icon",
      html: `
        <div class="map-pulse-marker">
          <div class="map-pulse-ring"></div>
          <div class="map-pulse-dot"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    L.marker([lat, lng], { icon: icone, title: titulo, keyboard: false }).addTo(map);

    return () => {
      pararDeObservarTema();
      map.remove();
    };
  }, [lat, lng, titulo]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Mapa da região de ${titulo}`}
      className="aspect-[4/3] w-full sm:aspect-[16/9]"
    />
  );
}
