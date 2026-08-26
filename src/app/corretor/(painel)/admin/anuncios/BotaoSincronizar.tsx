"use client";

import { useState, useTransition } from "react";
import { sincronizarMetaAdsAgora } from "./acoes";

export function BotaoSincronizar() {
  const [pendente, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await sincronizarMetaAdsAgora();
            setMensagem({ ok: r.ok, texto: r.mensagem });
          })
        }
        className="border-linha bg-superficie hover:border-acento-linha text-titulo rounded-xl border px-4 py-2 text-fluid-sm font-medium transition-colors disabled:opacity-60"
      >
        {pendente ? "Sincronizando…" : "Sincronizar agora"}
      </button>
      {mensagem && (
        <p className={`text-fluid-xs ${mensagem.ok ? "text-apoio" : "text-red-400"}`} role="status">
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
