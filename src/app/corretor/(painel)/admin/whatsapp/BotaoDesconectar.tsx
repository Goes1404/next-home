"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { desconectarNumeroDoCorretor } from "./acoes";

/**
 * Desconectar o número de outro corretor pede confirmação com o NOME dele
 * escrito: a IA daquele número para de responder cliente na hora.
 */
export function BotaoDesconectar({ corretorId, nome }: { corretorId: string; nome: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-fluid-xs border-perigo-linha text-perigo hover:bg-perigo-lavado min-h-11 rounded-lg border px-3 transition-colors"
      >
        Desconectar
      </button>
    );
  }

  return (
    <div className="border-perigo-linha bg-perigo-lavado w-full max-w-sm rounded-xl border p-3 text-left">
      <p className="text-fluid-sm text-titulo">
        Desconectar o número de {nome}? A IA dele para de responder na hora, e só ele consegue
        conectar de novo, pelo celular.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              try {
                const r = await desconectarNumeroDoCorretor(corretorId);
                if (r.erro) falhar(r.erro);
                else if (r.ok) avisar(r.ok);
                setConfirmando(false);
              } catch {
                falhar("Não foi possível desconectar agora. Recarregue a página e tente de novo.");
              }
            })
          }
          className="text-fluid-sm bg-perigo text-sobre-cor min-h-11 rounded-xl px-4 font-medium disabled:opacity-60"
        >
          {pendente ? "Desconectando…" : "Sim, desconectar"}
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => setConfirmando(false)}
          className="border-linha-forte text-corpo text-fluid-sm min-h-11 rounded-xl border px-4"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
