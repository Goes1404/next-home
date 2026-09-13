"use client";

import { useEffect, useState } from "react";
import { rolarAoTopo } from "@/components/motion/lenis";

/**
 * "Voltar ao topo" do site público (12/09/2026).
 *
 * Mesma régua do botão do painel: o gatilho é a DISTÂNCIA do topo, nunca a
 * direção do gesto — direção some quando a pessoa para de rolar, que é
 * justamente quando ela decide subir. A subida passa pelo Lenis quando ele
 * está ativo (`rolarAoTopo`): `window.scrollTo` por fora do laço dele sai
 * aos trancos.
 *
 * Mora um degrau ACIMA do botão do WhatsApp (que é `bottom-4 right-4`,
 * 56px): os dois flutuam no mesmo canto e o degrau é fixo — o WhatsApp some
 * ao rolar para baixo no celular, e um degrau condicional faria este pular.
 */
const DISTANCIA_PARA_APARECER = 700;

export function VoltarAoTopo() {
  const [longe, setLonge] = useState(false);

  useEffect(() => {
    const aoRolar = () => setLonge(window.scrollY > DISTANCIA_PARA_APARECER);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return (
    <button
      type="button"
      onClick={rolarAoTopo}
      aria-label="Voltar ao topo"
      title="Voltar ao topo"
      aria-hidden={!longe}
      tabIndex={longe ? 0 : -1}
      className={`fixed right-5 bottom-[5.5rem] z-30 flex size-11 items-center justify-center rounded-full border border-linha-forte bg-superficie/90 text-titulo shadow-lg backdrop-blur-md transition-[opacity,transform] duration-300 hover:-translate-y-0.5 sm:right-6 sm:bottom-[6.25rem] ${
        longe ? "opacity-95 hover:opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
