"use client";

import { useState, useTransition } from "react";
import { mudarSituacaoDoComunicado } from "../comunicadosAcoes";

/** Pausar (para na próxima mensagem) ou retomar um comunicado (0260). */
export function SituacaoDoComunicado({ id, situacao }: { id: string; situacao: "enviando" | "pausado" | "concluido" }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  if (situacao === "concluido") return null;
  const proxima = situacao === "enviando" ? "pausado" : "enviando";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await mudarSituacaoDoComunicado(id, proxima);
            setErro(r.ok ? null : r.erro);
          })
        }
        className="botao-secundario text-fluid-sm text-titulo flex min-h-11 cursor-pointer items-center rounded-xl border px-4 font-medium disabled:opacity-50"
      >
        {pendente ? "Salvando…" : situacao === "enviando" ? "Pausar" : "Retomar"}
      </button>
      {erro && <span className="text-fluid-sm text-perigo">{erro}</span>}
    </div>
  );
}
