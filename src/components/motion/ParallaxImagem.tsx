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
 * No celular o controlador anda só 40% do desktop, então a folga também
 * encolhe: com `intensidade={20}` o desktop amplia 1,4x e o celular 1,16x.
 * A folga cheia no celular ampliava em 40% uma foto já recortada para o
 * quadro estreito — o que sobrava era um borrão de parede (13/10/2026).
 *
 * Desde 08/2026 a API é a mesma mas o motor mudou: em vez de um
 * `ScrollTrigger` próprio, delega ao controlador central — um laço só para
 * as ~40 camadas do site (ver `controladorCamadas.ts`).
 */
export function ParallaxImagem({
  children,
  className,
  style,
  intensidade = 12,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  intensidade?: number;
}) {
  const alvo = useRef<HTMLDivElement>(null);

  useCamada(alvo, { velocidade: intensidade / 100 });

  return (
    <div className={cn("relative overflow-hidden", className)} style={style}>
      <div
        ref={alvo}
        className="absolute inset-0 will-change-transform [scale:var(--folga-cel)] md:[scale:var(--folga-desk)]"
        style={
          {
            "--folga-desk": `${1 + (intensidade * 2) / 100}`,
            "--folga-cel": `${1 + (intensidade * 0.8) / 100}`,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
