"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { concluirAnotacao } from "@/app/corretor/(painel)/anotacoes/acoes";
import { useAvisos } from "./Avisos";

/**
 * Concluir o LEMBRETE de anotação (0100) sem sair do Início — o mesmo gesto
 * (e as mesmas duas lições) do `BotaoConcluirTarefa`: a falha desfaz o
 * sumiço e diz o motivo, e o ícone é visível sem hover porque o painel vive
 * no celular.
 */
export function BotaoConcluirAnotacao({
  anotacaoId,
  titulo,
}: {
  anotacaoId: string;
  titulo: string;
}) {
  const [feita, setFeita] = useState(false);
  const [pendente, iniciar] = useTransition();
  const { falhar } = useAvisos();

  if (feita) return null;

  return (
    <button
      type="button"
      aria-label={`Concluir lembrete: ${titulo}`}
      title="Concluir"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          setFeita(true);
          try {
            const r = await concluirAnotacao(anotacaoId);
            if (r?.erro) {
              setFeita(false);
              falhar(r.erro);
            }
          } catch {
            setFeita(false);
            falhar("Não deu para concluir o lembrete. Confira a conexão.");
          }
        })
      }
      className="border-linha-forte text-apoio hover:border-ok hover:text-ok my-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center self-center rounded-full border transition-colors disabled:opacity-60"
    >
      <Check className="h-5 w-5" />
    </button>
  );
}
