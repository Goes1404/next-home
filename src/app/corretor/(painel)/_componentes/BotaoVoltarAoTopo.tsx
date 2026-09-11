"use client";

import { useEffect, useState } from "react";
import { rolarAoTopo } from "@/components/motion/lenis";
import { cn } from "@/lib/utils";

/**
 * O botão flutuante de voltar ao topo, para as telas de LISTA longa.
 *
 * Pedido de 07/09/2026: "tem muitas conversas e pra voltar pra cima é muito
 * cansativo". Vale igual para a lista de leads e para o funil expandido — as
 * três telas em que a rolagem passa fácil de dez telas de altura.
 *
 * O gatilho é a DISTÂNCIA do topo, não a direção do gesto: direção some no
 * instante em que a pessoa para de rolar, e o botão sumiria justamente
 * quando ela decide usá-lo (a mesma régua do botão do chat de Conversas).
 *
 * Fica ACIMA da barra do polegar no celular (`--nav-mobile-h`) e no canto
 * inferior direito no computador. `z-30`: abaixo da gaveta e dos modais
 * (z-50) — um atalho de rolagem nunca pode cobrir um diálogo.
 *
 * A rolagem sobe pelo Lenis quando ele está ativo (ver `rolarAoTopo`):
 * `window.scrollTo` por fora do laço dele faz a subida sair aos trancos.
 */
const DISTANCIA_PARA_APARECER = 600;

export function BotaoVoltarAoTopo() {
  const [longe, setLonge] = useState(false);

  useEffect(() => {
    // `setState` com o mesmo booleano não re-renderiza; o custo por evento
    // de rolagem é uma comparação.
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
      className={cn(
        /*
         * Um degrau ACIMA do canto, que desde 11/09/2026 é do balão do
         * consultor (`BalaoConsultor`). A altura é fixa, nunca condicional à
         * presença da bolha: dois botões que sobem e descem conforme o outro
         * aparece é pior que um degrau constante — e a bolha some enquanto o
         * painel do consultor está aberto, o que faria este pular no meio da
         * leitura.
         */
        "bg-acento text-sobre-cor shadow-painel fixed right-4 bottom-[calc(var(--nav-mobile-h)+5rem)] z-30 flex size-11 cursor-pointer items-center justify-center rounded-full ring-1 ring-white/20 transition-all ring-inset hover:-translate-y-0.5 md:right-6 md:bottom-[5.5rem]",
        longe ? "opacity-90 hover:opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
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
