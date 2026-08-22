"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
// O CSS base do Leaflet é OBRIGATÓRIO: sem ele os tiles renderizam fora de
// posição (cada tile num fluxo normal de layout, empilhados), os panes
// perdem o z-index e os controles ficam soltos — era exatamente o "mapa
// feio e desajustado". Nenhum outro arquivo importava isto.
import "leaflet/dist/leaflet.css";
import type { Empreendimento, StatusObra } from "@/lib/types";
import { CardFlutuanteImovel } from "./CardFlutuanteImovel";
import { FiltrosMapa } from "./FiltrosMapa";
import { temaDoMapa, TILES_MAPA, ATRIBUICAO_MAPA, aoMudarTema } from "./temaDoMapa";

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
  const tilesRef = useRef<L.TileLayer | null>(null);

  const [statusFiltro, setStatusFiltro] = useState<StatusObra | "todos">("todos");
  const [bairroFiltro, setBairroFiltro] = useState<string>("todos");
  // Seleção inicial (link /mapa?imovel=slug) resolvida na montagem do
  // estado — um efeito para isso seria um re-render a mais sem motivo.
  const [imovelSelecionado, setImovelSelecionado] = useState<Empreendimento | null>(() =>
    imovelInicialSlug ? (empreendimentos.find((e) => e.slug === imovelInicialSlug) ?? null) : null,
  );

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
      // No canto de baixo para não brigar com a barra de filtros, que mora
      // no topo do mapa.
      zoomControl: false,
      // Atribuição ligada: exigência de licença do OpenStreetMap/CARTO.
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Tiles do CARTO acompanhando o tema do site — mapa escuro dentro de um
    // site claro (como era antes) parece um buraco na página.
    const tiles = L.tileLayer(TILES_MAPA[temaDoMapa()], {
      maxZoom: 19,
      subdomains: "abcd",
      attribution: ATRIBUICAO_MAPA,
    }).addTo(map);
    tilesRef.current = tiles;

    const pararDeObservarTema = aoMudarTema((tema) => {
      tilesRef.current?.setUrl(TILES_MAPA[tema]);
    });

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

    return () => {
      pararDeObservarTema();
      map.remove();
      mapRef.current = null;
      tilesRef.current = null;
    };
    // Nada aqui depende de props além da montagem: o mapa nasce uma vez.
  }, []);

  // Atualiza marcadores quando a lista filtrada ou o item selecionado mudar
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds: [number, number][] = [];

    // Sem coordenada, sem pin: o fallback antigo espalhava os sem-cadastro
    // numa grade falsa em volta do centro de Alphaville — um pin apontando
    // para um lugar que não é o do imóvel é pior que pin nenhum. (Hoje todos
    // os cadastros têm lat/lng; isto protege os próximos.)
    imoveisFiltrados.forEach((emp) => {
      if (emp.lat === null || emp.lng === null) return;
      const lat = emp.lat;
      const lng = emp.lng;

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
    <div className={`relative w-full overflow-hidden rounded-2xl border border-linha ${alturaClasse}`}>
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
