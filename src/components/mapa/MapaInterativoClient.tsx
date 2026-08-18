"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { Empreendimento, StatusObra } from "@/lib/types";
import { CardFlutuanteImovel } from "./CardFlutuanteImovel";
import { FiltrosMapa } from "./FiltrosMapa";

interface Props {
  empreendimentos: Empreendimento[];
  imovelInicialSlug?: string;
  alturaClasse?: string;
}

// Coordenada padrão de Alphaville / Barueri
const CENTRO_ALPHAVILLE: [number, number] = [-23.4985, -46.8532];

function formatarPrecoTag(preco: number | null): string {
  if (!preco) return "Consulte";
  if (preco >= 1_000_000) {
    const milhoes = (preco / 1_000_000).toFixed(1).replace(".0", "").replace(".", ",");
    return `R$ ${milhoes}M`;
  }
  return `R$ ${Math.round(preco / 1000)}k`;
}

export default function MapaInterativoClient({
  empreendimentos,
  imovelInicialSlug,
  alturaClasse = "h-[calc(100vh-80px)] min-h-[500px]",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [statusFiltro, setStatusFiltro] = useState<StatusObra | "todos">("todos");
  const [bairroFiltro, setBairroFiltro] = useState<string>("todos");
  const [imovelSelecionado, setImovelSelecionado] = useState<Empreendimento | null>(null);

  // Lista de bairros únicos disponíveis
  const bairrosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    empreendimentos.forEach((e) => {
      if (e.bairro) set.add(e.bairro);
    });
    return Array.from(set).sort();
  }, [empreendimentos]);

  // Imóveis filtrados
  const imoveisFiltrados = useMemo(() => {
    return empreendimentos.filter((e) => {
      if (statusFiltro !== "todos" && e.status !== statusFiltro) return false;
      if (bairroFiltro !== "todos" && e.bairro !== bairroFiltro) return false;
      return true;
    });
  }, [empreendimentos, statusFiltro, bairroFiltro]);

  // Inicializa o mapa Leaflet
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: CENTRO_ALPHAVILLE,
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    // Camada Dark Matter do CartoDB (estética 21st.dev escura)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = layerGroup;
    mapRef.current = map;

    // Deseleciona ao clicar fora
    map.on("click", (e) => {
      const target = e.originalEvent?.target as HTMLElement;
      if (!target.closest(".map-pulse-marker")) {
        setImovelSelecionado(null);
      }
    });

    // Se houver slug inicial, seleciona
    if (imovelInicialSlug) {
      const match = empreendimentos.find((e) => e.slug === imovelInicialSlug);
      if (match) setImovelSelecionado(match);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [imovelInicialSlug, empreendimentos]);

  // Atualiza marcadores quando a lista filtrada ou o item selecionado mudar
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds: [number, number][] = [];

    // Fallback de coordenadas se o empreendimento não tiver lat/lng cadastrado
    imoveisFiltrados.forEach((emp, index) => {
      // Usa as coordenadas cadastradas ou distribui levemente no centroide de Alphaville
      const lat = emp.lat ?? (CENTRO_ALPHAVILLE[0] + (index % 5 - 2) * 0.008);
      const lng = emp.lng ?? (CENTRO_ALPHAVILLE[1] + (Math.floor(index / 5) - 2) * 0.008);

      const isAtivo = imovelSelecionado?.slug === emp.slug;
      const precoTexto = formatarPrecoTag(emp.precoAPartir);

      const customIcon = L.divIcon({
        className: "custom-leaflet-div-icon",
        html: `
          <div class="map-pulse-marker ${isAtivo ? "active" : ""}" id="marker-${emp.slug}">
            <div class="map-pulse-ring"></div>
            <div class="map-pulse-dot"></div>
            <div class="map-pulse-price">${precoTexto}</div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });
      marker.on("click", () => {
        setImovelSelecionado(emp);
        map.flyTo([lat, lng], Math.max(map.getZoom(), 15), {
          duration: 0.7,
        });
      });

      marker.addTo(layer);
      bounds.push([lat, lng]);
    });

    // Ajusta o zoom inicial para enquadrar todos os pins
    if (bounds.length > 0 && !imovelSelecionado) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }, [imoveisFiltrados, imovelSelecionado]);

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-white/10 ${alturaClasse}`}>
      {/* Filtros Flutuantes no Topo */}
      <FiltrosMapa
        statusFiltro={statusFiltro}
        onMudarStatus={setStatusFiltro}
        bairroFiltro={bairroFiltro}
        onMudarBairro={setBairroFiltro}
        bairrosDisponiveis={bairrosDisponiveis}
        totalImoveisExibidos={imoveisFiltrados.length}
      />

      {/* Container Leaflet */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Card Flutuante do Imóvel Selecionado */}
      {imovelSelecionado && (
        <CardFlutuanteImovel
          imovel={imovelSelecionado}
          onFechar={() => setImovelSelecionado(null)}
        />
      )}
    </div>
  );
}
