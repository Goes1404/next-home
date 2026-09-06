"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { alternarGaveta, useGavetaAberta } from "./_componentes/gavetaStore";

/**
 * O hambúrguer do topo, no celular.
 *
 * Abre a mesma gaveta que o botão "Menu" da barra do polegar. Existem os dois
 * de propósito: o do topo é onde todo app de celular põe o mapa, e é o que a
 * pessoa procura por reflexo; o da barra é o que já existia e a corretora já
 * usa. Um estado só (`gavetaStore`) para que os dois não discordem.
 *
 * Vive DENTRO do header, que tem `backdrop-filter` — e isso é seguro só porque
 * este botão é estático. O painel que ele abre é `fixed` e nasce num portal
 * (`GavetaLateral`); nascesse aqui, ficaria preso à barra.
 */
export function BotaoGaveta() {
  const atual = usePathname();
  const aberta = useGavetaAberta(atual);

  return (
    <button
      type="button"
      onClick={() => alternarGaveta(atual)}
      aria-expanded={aberta}
      aria-controls="gaveta-do-painel"
      aria-label={aberta ? "Fechar menu" : "Abrir menu"}
      className={cn(
        "text-titulo hover:bg-vidro -ml-2 grid h-11 w-11 cursor-pointer place-items-center rounded-xl transition-colors md:hidden",
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="h-6 w-6"
      >
        {aberta ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
      </svg>
    </button>
  );
}
