"use client";

import { useRef } from "react";
import { useCamada } from "./Camada";
import { cn } from "@/lib/utils";

/**
 * Moldura de parallax: o filho (uma imagem `fill`) anda mais devagar que o
 * scroll, dando profundidade à foto sem custo de layout — só transform.
 *
 * A imagem é levemente ampliada (`scale`) para o deslocamento nunca expor
 * borda vazia. `intensidade` é o quanto ela percorre, em % da própria
 * altura, do centro até a ponta da passagem pela viewport.
 *
 * Desde 08/2026 a API é a mesma mas o motor mudou: em vez de um
 * `ScrollTrigger` próprio, delega ao controlador central — um laço só para
 * as ~40 camadas do site (ver `controladorCamadas.ts`).
 */
export function ParallaxImagem({
  children,
  className,
  intensidade = 12,
}: {
  children: React.ReactNode;
  className?: string;
  intensidade?: number;
}) {
  const alvo = useRef<HTMLDivElement>(null);

  useCamada(alvo, { velocidade: intensidade / 100 });

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        ref={alvo}
        className="absolute inset-0 will-change-transform"
        style={{ scale: `${1 + (intensidade * 2) / 100}` }}
      >
        {children}
      </div>
    </div>
  );
}
