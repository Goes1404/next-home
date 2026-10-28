"use client";

import { useCallback, useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { Gaveta } from "./Gaveta";

/**
 * Os dois botões do topo da Agenda (visual de 28/10/2026): "Novo" (bloquear
 * horário; reunião, para o gestor) e os ajustes (horários de visita e o link
 * do calendário do celular). Tiraram do pé da página as caixas recolhidas,
 * que pareciam parte da lista.
 */
export function AcoesDaAgenda({ novo, ajustes }: { novo: React.ReactNode; ajustes?: React.ReactNode }) {
  const [aberta, setAberta] = useState<"novo" | "ajustes" | null>(null);
  const fechar = useCallback(() => setAberta(null), []);

  return (
    <div className="flex items-center gap-2">
      {ajustes && (
        <button
          type="button"
          onClick={() => setAberta("ajustes")}
          aria-label="Ajustes da agenda"
          className="botao-secundario flex min-h-11 min-w-11 items-center justify-center gap-2 px-3 text-sm"
        >
          <Settings2 className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Ajustes</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setAberta("novo")}
        className="botao-solido flex min-h-11 items-center gap-1.5 px-4 text-sm"
      >
        <Plus className="h-4 w-4" aria-hidden /> Novo
      </button>

      <Gaveta titulo="Novo na agenda" aberta={aberta === "novo"} onFechar={fechar}>
        <div className="space-y-3">{novo}</div>
      </Gaveta>
      {ajustes && (
        <Gaveta titulo="Ajustes da agenda" aberta={aberta === "ajustes"} onFechar={fechar} larga>
          <div className="space-y-4">{ajustes}</div>
        </Gaveta>
      )}
    </div>
  );
}
