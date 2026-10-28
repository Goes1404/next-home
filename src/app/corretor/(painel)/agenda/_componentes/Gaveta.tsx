"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { moduloAtivo } from "@/app/corretor/(painel)/_componentes/navegacao";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A gaveta da Agenda (visual de 28/10/2026): sobe do rodapé no celular e vira
 * uma janela no meio da tela no computador. Mesmo padrão de `FolhaAcoesLead`
 * (véu que fecha, Esc fecha, z-60 acima do menu). Vai por portal para o
 * <body>, como o mascote da assistente (`BalaoConsultor`): dentro do
 * conteúdo, que cria contexto de empilhamento, o mascote (z-55) ficava por
 * cima. Fora da árvore a cor não herda, então a raiz repete `data-rota` e
 * `data-modulo`, que é onde a paleta do painel e o acento são definidos.
 */
export function Gaveta({
  titulo,
  aberta,
  onFechar,
  children,
  larga = false,
}: {
  titulo: string;
  aberta: boolean;
  onFechar: () => void;
  children: React.ReactNode;
  /** Formulários maiores (a grade da semana) pedem mais largura no computador. */
  larga?: boolean;
}) {
  const modulo = moduloAtivo(usePathname());

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = rolagem;
    };
  }, [aberta, onFechar]);

  if (!aberta) return null;

  return createPortal(
    <div data-rota="painel" data-modulo={modulo ?? undefined} className="fixed inset-0 z-60">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar"
        onClick={onFechar}
        className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn(
          "pb-safe absolute inset-x-0 bottom-0 max-h-[88svh] overflow-y-auto rounded-t-3xl border-t border-linha bg-superficie px-5 pt-3 pb-6",
          "md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:max-h-[85vh] md:w-full md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border md:p-6",
          larga ? "md:max-w-2xl" : "md:max-w-md",
        )}
      >
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-linha-forte md:hidden" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-fluid-xs font-medium tracking-[0.14em] text-tenue uppercase">{titulo}</p>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full bg-elevado text-apoio transition-colors hover:bg-vidro-forte"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
