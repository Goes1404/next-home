"use client";

import { useState } from "react";

type Estado = "ocioso" | "copiado" | "erro";

/**
 * Compartilhar o empreendimento.
 *
 * Usa a Web Share API quando existe (no mobile ela abre a folha nativa,
 * com WhatsApp em primeiro lugar — que é exatamente por onde essa decisão
 * costuma circular em família) e cai para copiar o link no desktop.
 */
export function Compartilhar({ titulo, texto }: { titulo: string; texto: string }) {
  const [estado, setEstado] = useState<Estado>("ocioso");

  async function compartilhar() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url });
        return;
      } catch (erro) {
        // Cancelar a folha de compartilhamento é um AbortError e não é falha
        // nenhuma — qualquer outra coisa cai para o clipboard.
        if (erro instanceof Error && erro.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setEstado("copiado");
    } catch {
      setEstado("erro");
    }
    setTimeout(() => setEstado("ocioso"), 2500);
  }

  return (
    <button
      type="button"
      onClick={compartilhar}
      className="text-fluid-sm inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-mist-200 transition-colors hover:border-white/30 hover:text-mist-50"
    >
      {estado === "copiado" ? (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-4 w-4 text-brand-300">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.7 10.7a3 3 0 1 0 0 2.6m0-2.6 6.6-3.4m-6.6 6 6.6 3.4M18 7a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm0 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z"
          />
        </svg>
      )}
      <span aria-live="polite">
        {estado === "copiado"
          ? "Link copiado"
          : estado === "erro"
            ? "Copie da barra de endereço"
            : "Compartilhar"}
      </span>
    </button>
  );
}
