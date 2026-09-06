"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ATALHOS_MOBILE, destinoAtivo } from "./_componentes/navegacao";
import { alternarGaveta, useGavetaAberta } from "./_componentes/gavetaStore";

/**
 * A barra do polegar (celular): três destinos de trabalho mais o botão Menu.
 *
 * Imóveis entrou no polegar quando Conta saiu do menu para o avatar. Medido
 * em 320px, o pior caso real: quatro alvos de 78px, nada cortado e nenhum
 * rótulo em duas linhas — barra fixa que estoura não fica feia, fica
 * inalcançável, porque ali não há rolagem.
 *
 * A gaveta que o botão Menu abre mora em `GavetaLateral.tsx`, num portal, e
 * também é aberta pelo hambúrguer do topo (`BotaoGaveta`). Os dois gatilhos
 * dividem um estado só (`gavetaStore`) para nunca discordarem.
 */
export function NavMobileBottom() {
  const atual = usePathname();
  const dono = destinoAtivo(atual);
  const aberta = useGavetaAberta(atual);

  return (
    <nav
      aria-label="Atalhos do painel"
      className="border-linha bg-fundo/85 h-nav-safe pb-safe fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t px-1 backdrop-blur-lg md:hidden"
    >
      {ATALHOS_MOBILE.map((item) => {
        /* Mesmo dono que a gaveta e o sidebar usam. Com `itemAtivo`, a barra
           acenderia "Imóveis" em `/corretor/imoveis/criar-imagem`, que é
           subtópico de Marketing — o polegar diria uma seção e o menu diria
           outra, na mesma tela. */
        const ativa = dono?.href === item.href;
        const Icone = item.icone;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1 transition-colors",
              ativa ? "text-acento-suave" : "text-tenue",
            )}
          >
            <Icone aria-hidden className="h-[22px] w-[22px]" />
            <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => alternarGaveta(atual)}
        aria-expanded={aberta}
        aria-controls="gaveta-do-painel"
        aria-label="Todas as seções"
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-1 transition-colors",
          aberta ? "text-acento-suave" : "text-tenue",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          className="h-[22px] w-[22px]"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span className="text-[10px] font-medium tracking-wide">Menu</span>
      </button>
    </nav>
  );
}
