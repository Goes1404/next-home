"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ATALHOS_MOBILE, gruposVisiveis, rotaAtiva } from "./_componentes/navegacao";

/**
 * Navegação do celular: quatro atalhos no polegar mais uma gaveta com o
 * painel inteiro.
 *
 * A gaveta existe porque a barra inferior só cabe cinco alvos e o painel tem
 * treze seções. Antes as outras oito simplesmente não tinham como ser
 * abertas no celular — a barra de abas do topo é `hidden md:flex` —, o que
 * deixava o corretor sem acesso a Imóveis, WhatsApp e Campanhas justamente
 * no aparelho em que ele trabalha.
 */
export function NavMobileBottom({ ehGestor }: { ehGestor: boolean }) {
  const atual = usePathname();
  const grupos = gruposVisiveis(ehGestor);

  /*
   * A gaveta guarda em que rota foi aberta, em vez de um booleano. Assim ela
   * se fecha sozinha ao navegar — `aberta` deixa de ser verdade no mesmo
   * render em que a rota muda — sem um efeito que chame setState e provoque
   * um render em cascata.
   */
  const [abertaEm, setAbertaEm] = useState<string | null>(null);
  const aberta = abertaEm !== null && abertaEm === atual;
  const setAberta = (valor: boolean) => setAbertaEm(valor ? atual : null);

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setAbertaEm(null);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberta]);

  return (
    <div className="md:hidden">
      <div
        // `inert` tira o conteúdo fechado do foco e do leitor de tela; só
        // `opacity-0` deixaria treze links tabuláveis atrás da página.
        inert={!aberta}
        aria-hidden={!aberta}
        className={cn(
          "fixed inset-0 z-60 transition-opacity duration-200",
          aberta ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Fechar menu"
          onClick={() => setAberta(false)}
          className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-[2px]"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Todas as seções"
          className={cn(
            "border-linha bg-superficie pb-safe absolute inset-x-0 bottom-0 max-h-[80svh] overflow-y-auto rounded-t-3xl border-t px-5 pt-3 pb-6 transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]",
            aberta ? "translate-y-0" : "translate-y-full",
          )}
        >
          <span aria-hidden className="bg-linha-forte mx-auto mb-5 block h-1 w-10 rounded-full" />

          <div className="space-y-5">
            {grupos.map((grupo) => (
              <div key={grupo.titulo}>
                <p className="text-tenue pb-2 text-[11px] font-medium tracking-[0.14em] uppercase">
                  {grupo.titulo}
                </p>
                <ul className="grid grid-cols-2 gap-2">
                  {grupo.itens.map((item) => {
                    const ativa = rotaAtiva(atual, item.href);
                    const Icone = item.icone;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={ativa ? "page" : undefined}
                          className={cn(
                            "flex min-h-12 items-center gap-2.5 rounded-xl border px-3 text-sm transition-colors",
                            ativa
                              ? "border-acento-linha bg-acento-lavado text-acento-suave font-medium"
                              : "border-linha text-corpo",
                          )}
                        >
                          <Icone aria-hidden className="h-[18px] w-[18px] shrink-0" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <nav
        aria-label="Atalhos do painel"
        className="border-linha bg-fundo/85 h-nav-safe pb-safe fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t px-1 backdrop-blur-lg"
      >
        {ATALHOS_MOBILE.map((item) => {
          const ativa = rotaAtiva(atual, item.href);
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
          onClick={() => setAberta(!aberta)}
          aria-expanded={aberta}
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
    </div>
  );
}
