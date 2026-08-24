"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { MapaEmpreendimentos } from "@/components/mapa/MapaEmpreendimentos";
import type { Empreendimento } from "@/lib/types";

// O globo carrega no cliente e só quando é usado — é WebGL, não faz sentido
// no HTML do servidor.
const Globo = dynamic(
  () => import("@/components/mapa/GloboImoveis").then((m) => m.GloboImoveis),
  { ssr: false },
);

/**
 * A seção do mapa em dois tempos: o mundo, e então a região.
 *
 * Primeiro o visitante vê um globo girando com um pino em cada imóvel; ao
 * tocar (ou usar o botão), o mapa interativo assume o lugar, já enquadrado na
 * região. É a mesma narrativa da página do imóvel — mostrar antes de
 * explicar — aplicada à localização.
 *
 * Há um ganho concreto além do visual: o Leaflet (146 KB de JS) e as ~15
 * requisições de tile a um CDN externo só acontecem quando alguém pede o
 * mapa. Quem rola a home inteira sem tocar aqui não paga nada disso.
 *
 * Imóvel sem lat/lng não vira pino — mesma regra do mapa (ver
 * docs/MEMORIA.md: "nunca inventar coordenada de pin").
 */
export function GloboOuMapa({
  empreendimentos,
  alturaClasse,
}: {
  empreendimentos: Empreendimento[];
  alturaClasse: string;
}) {
  const [mostrarMapa, setMostrarMapa] = useState(false);

  const pinos = empreendimentos
    .filter((e) => e.lat !== null && e.lng !== null)
    .map((e) => ({ lat: e.lat as number, lng: e.lng as number }));

  if (mostrarMapa || pinos.length === 0) {
    return (
      <MapaEmpreendimentos
        empreendimentos={empreendimentos}
        alturaClasse={alturaClasse}
        compacto
        // Já foi pedido explicitamente: não faz sentido esperar visibilidade.
        adiarAteVisivel={!mostrarMapa}
      />
    );
  }

  return (
    <div className={`w-full overflow-hidden rounded-2xl border border-linha bg-superficie/40 ${alturaClasse}`}>
      <Globo
        pinos={pinos}
        aoAtivar={() => setMostrarMapa(true)}
        className="h-full w-full py-6"
      />
    </div>
  );
}
