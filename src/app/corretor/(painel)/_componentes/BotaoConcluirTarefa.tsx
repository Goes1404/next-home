"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { concluirTarefa } from "@/app/corretor/(painel)/leads/[id]/acoes";

/**
 * Concluir a tarefa sem sair do Início — o gesto que a fila herdou do bloco
 * "Para hoje". Some da tela na hora; se o servidor recusar, o próximo
 * carregamento a traz de volta (mesma aposta do componente antigo, e o custo
 * de errar é uma linha reaparecer).
 */
export function BotaoConcluirTarefa({ tarefaId, titulo }: { tarefaId: string; titulo: string }) {
  const [feita, setFeita] = useState(false);
  const [, iniciar] = useTransition();

  if (feita) return null;

  return (
    <button
      type="button"
      aria-label={`Concluir: ${titulo}`}
      title="Concluir"
      onClick={() =>
        iniciar(async () => {
          setFeita(true);
          await concluirTarefa(tarefaId);
        })
      }
      className="border-linha-forte hover:border-ok hover:text-ok my-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center self-center rounded-full border text-transparent transition-colors"
    >
      <Check className="h-5 w-5" />
    </button>
  );
}
