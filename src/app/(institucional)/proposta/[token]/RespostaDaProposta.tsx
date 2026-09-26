"use client";

import { useState, useTransition } from "react";
import type { RespostaDaProposta as Resposta } from "@/lib/crm/proposta";
import { responderProposta } from "./acoes";

/**
 * Os dois botões da proposta. Depois de responder, a página diz o que
 * acontece a seguir; o cliente pode mudar de ideia ("quero conversar" →
 * "aceito"), e só a mudança avisa o corretor de novo.
 */
export function RespostaDaProposta({
  token,
  inicial,
  previa,
}: {
  token: string;
  inicial: Resposta | null;
  previa: boolean;
}) {
  const [resposta, setResposta] = useState<Resposta | null>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function responder(r: Resposta) {
    if (previa) return setErro("Esta é a prévia do corretor: a resposta não é registrada.");
    setErro(null);
    iniciar(async () => {
      try {
        const out = await responderProposta(token, r);
        if (out.erro) return setErro(out.erro);
        setResposta(r);
      } catch {
        setErro("Sem conexão. Tente de novo.");
      }
    });
  }

  return (
    <div className="space-y-3" aria-live="polite">
      {resposta === "aceitou" && (
        <p className="rounded-xl border border-ok-linha bg-ok-lavado p-4 text-fluid-base text-ok font-semibold">
          Proposta aceita. Seu corretor já foi avisado e vai te chamar para os próximos passos.
        </p>
      )}
      {resposta === "quer_conversar" && (
        <p className="rounded-xl border border-linha bg-superficie p-4 text-fluid-base text-corpo">
          Anotado. Seu corretor já sabe que você quer conversar antes de decidir.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {resposta !== "aceitou" && (
          <button
            type="button"
            onClick={() => responder("aceitou")}
            disabled={ocupado}
            className="botao-vivo min-h-12 rounded-full bg-acento px-6 font-semibold text-sobre-cor disabled:opacity-60"
          >
            Aceito a proposta
          </button>
        )}
        {resposta === null && (
          <button
            type="button"
            onClick={() => responder("quer_conversar")}
            disabled={ocupado}
            className="min-h-12 rounded-full border border-linha-forte px-6 font-semibold text-corpo disabled:opacity-60"
          >
            Quero conversar antes
          </button>
        )}
      </div>
      {erro && <p className="text-fluid-sm text-perigo">{erro}</p>}
    </div>
  );
}
