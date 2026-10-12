"use client";

import { useSearchParams } from "next/navigation";
import { MapaEmpreendimentos, type PropsDoMapa } from "./MapaEmpreendimentos";

/**
 * Lê `?imovel=<slug>` NO NAVEGADOR e abre o mapa naquele pino.
 *
 * Mesma razão de `FormularioContatoDaUrl`: ler o parâmetro em
 * `searchParams` tornava `/mapa` dinâmica inteira. A página passa o mapa sem
 * pino inicial como `fallback` do `<Suspense>`, e este componente o troca
 * pelo mapa com o pino no primeiro quadro — bem antes de o chunk do Leaflet
 * chegar.
 */
export function MapaEmpreendimentosDaUrl(props: Omit<PropsDoMapa, "imovelInicialSlug">) {
  const parametros = useSearchParams();
  return <MapaEmpreendimentos {...props} imovelInicialSlug={parametros.get("imovel") ?? undefined} />;
}
