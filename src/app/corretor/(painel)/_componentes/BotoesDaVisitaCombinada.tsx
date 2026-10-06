"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "./Avisos";
import { dispensarVisitaCombinada, registrarVisitaCombinada } from "./acoesVisitaCombinada";

/**
 * Registrar ou dispensar a visita que o corretor combinou no chat (A2,
 * 0163). Registrar só mexe no CRM, nada vai para o cliente, então é um
 * toque só.
 */
export function BotoesDaVisitaCombinada({ conversaId, titulo }: { conversaId: string; titulo: string }) {
  const [pendente, iniciar] = useTransition();
  const [feito, setFeito] = useState<string | null>(null);
  const { falhar } = useAvisos();

  if (feito) {
    return (
      <span className="text-fluid-xs text-ok my-2 flex shrink-0 items-center self-center px-2">{feito}</span>
    );
  }

  function agir(acao: typeof registrarVisitaCombinada, rotuloFeito: string) {
    iniciar(async () => {
      try {
        const r = await acao(conversaId);
        if (r.erro) {
          falhar(r.erro);
          return;
        }
        setFeito(rotuloFeito);
      } catch {
        falhar("Não deu para concluir. Confira a conexão.");
      }
    });
  }

  return (
    <span className="my-2 flex shrink-0 items-center gap-1.5 self-center">
      <button
        type="button"
        disabled={pendente}
        aria-label={`Registrar: ${titulo}`}
        onClick={() => agir(registrarVisitaCombinada, "registrada ✓")}
        className="text-fluid-xs border-acento-linha text-acento-suave hover:bg-elevado flex min-h-11 items-center rounded-full border px-3 font-medium transition-colors disabled:opacity-60"
      >
        {pendente ? "Salvando…" : "Registrar"}
      </button>
      <button
        type="button"
        disabled={pendente}
        aria-label={`Não era visita: ${titulo}`}
        onClick={() => agir(dispensarVisitaCombinada, "dispensada")}
        className="text-fluid-xs text-apoio hover:bg-elevado flex min-h-11 items-center rounded-full px-3 transition-colors disabled:opacity-60"
      >
        Não era visita
      </button>
    </span>
  );
}
