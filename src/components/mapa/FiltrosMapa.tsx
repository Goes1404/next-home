"use client";

import type { StatusObra } from "@/lib/types";

interface Props {
  statusFiltro: StatusObra | "todos";
  onMudarStatus: (status: StatusObra | "todos") => void;
  bairroFiltro: string;
  onMudarBairro: (bairro: string) => void;
  bairrosDisponiveis: string[];
  totalImoveisExibidos: number;
}

export function FiltrosMapa({
  statusFiltro,
  onMudarStatus,
  bairroFiltro,
  onMudarBairro,
  bairrosDisponiveis,
  totalImoveisExibidos,
}: Props) {
  return (
    <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between gap-3 pointer-events-none">
      {/* Pílulas de filtro com scroll horizontal */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none p-1 pointer-events-auto bg-superficie/80 backdrop-blur-xl rounded-2xl border border-linha-forte shadow-2xl shadow-black/70">
        <button
          onClick={() => onMudarStatus("todos")}
          className={`px-3.5 py-1.5 rounded-xl text-fluid-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            statusFiltro === "todos"
              ? "bg-brand-500 text-white shadow-md shadow-brand-500/30"
              : "text-corpo hover:text-titulo hover:bg-veu/5"
          }`}
        >
          Todos ({totalImoveisExibidos})
        </button>

        <button
          onClick={() => onMudarStatus("lancamento")}
          className={`px-3.5 py-1.5 rounded-xl text-fluid-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            statusFiltro === "lancamento"
              ? "bg-brand-500 text-white shadow-md shadow-brand-500/30"
              : "text-corpo hover:text-titulo hover:bg-veu/5"
          }`}
        >
          Lançamentos
        </button>

        <button
          onClick={() => onMudarStatus("em_construcao")}
          className={`px-3.5 py-1.5 rounded-xl text-fluid-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            statusFiltro === "em_construcao"
              ? "bg-brand-500 text-white shadow-md shadow-brand-500/30"
              : "text-corpo hover:text-titulo hover:bg-veu/5"
          }`}
        >
          Em Obras
        </button>

        <button
          onClick={() => onMudarStatus("pronto_para_morar")}
          className={`px-3.5 py-1.5 rounded-xl text-fluid-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            statusFiltro === "pronto_para_morar"
              ? "bg-brand-500 text-white shadow-md shadow-brand-500/30"
              : "text-corpo hover:text-titulo hover:bg-veu/5"
          }`}
        >
          Prontos para Morar
        </button>

        {/* Dropdown de Bairro se houver múltiplos */}
        {bairrosDisponiveis.length > 1 && (
          <select
            value={bairroFiltro}
            onChange={(e) => onMudarBairro(e.target.value)}
            className="rounded-xl border border-linha-forte bg-superficie px-3 py-1.5 text-fluid-xs text-corpo cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
            aria-label="Filtrar por bairro"
          >
            <option value="todos">Todos os Bairros</option>
            {bairrosDisponiveis.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
