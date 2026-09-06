"use client";

import { useState } from "react";

export function CopiarLegenda({ legenda }: { legenda: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(legenda);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência o texto continua na tela
      // para seleção manual — o pior caso é copiar à mão, não perder nada.
      setCopiado(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <pre className="text-fluid-xs text-corpo border-linha bg-elevado max-h-72 overflow-auto rounded-xl border p-4 whitespace-pre-wrap">
        {legenda}
      </pre>
      <button
        type="button"
        onClick={copiar}
        className="border-acento-linha text-titulo hover:bg-elevado text-fluid-sm min-h-11 rounded-xl border px-5 font-medium transition-colors"
      >
        {copiado ? "Copiado ✓" : "Copiar legenda"}
      </button>
    </div>
  );
}
