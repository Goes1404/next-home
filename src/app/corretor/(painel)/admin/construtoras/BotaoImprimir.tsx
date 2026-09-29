"use client";

/** Imprimir ou salvar em PDF pelo navegador: o relatório vira anexo para a construtora. */
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo"
    >
      Imprimir ou salvar PDF
    </button>
  );
}
