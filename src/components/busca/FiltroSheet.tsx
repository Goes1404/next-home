"use client";

import { useEffect, useState } from "react";import { X } from 'lucide-react';


/**
 * Botão + painel deslizante no mobile.
 *
 * Recebe o `<FiltroForm>` já renderizado como `children` — ele é um Server
 * Component, então só pode ser instanciado do lado do servidor; este client
 * component apenas controla a visibilidade do painel ao redor dele.
 */
export function FiltroSheet({
  children,
  temFiltroAtivo,
}: {
  children: React.ReactNode;
  temFiltroAtivo: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = "";
    };
  }, [aberto]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-fluid-sm flex items-center gap-2 rounded-full border border-linha/10 bg-superficie px-4 py-2 text-corpo"
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filtrar
        {temFiltroAtivo && <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filtros"
          // `bg-ink-950/80` literal: véu atrás do modal escurece a página
          // por trás, em qualquer tema.
          className="fixed inset-0 z-70 flex items-end bg-ink-950/80"
          onClick={() => setAberto(false)}
        >
          <div
            className="pb-safe max-h-[85svh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-superficie px-5 pt-5 pb-8"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg text-titulo">Filtros</h2>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar filtros"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-veu/10 text-titulo"
              >
                 <X className="inline-block w-5 h-5 align-text-bottom mr-1" /> 
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
