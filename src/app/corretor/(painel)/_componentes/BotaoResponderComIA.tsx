"use client";

import { useState, useTransition } from "react";
import { responderComIA } from "../conversas/acoes";

/**
 * "Deixa a Sofia responder" — direto da fila do Início.
 *
 * Existe porque quem já escreveu não volta sozinho: o webhook só age quando
 * chega mensagem NOVA. Quando a trava de campanha estava quebrada (01/09),
 * 6 clientes responderam ao disparo e ficaram sem resposta, um deles desde
 * 27/08 — o conserto destravou o futuro e não trouxe esses de volta.
 *
 * Fica ao lado do botão do WhatsApp, não no lugar dele: às vezes a resposta
 * certa é a do corretor, e quem decide é ele.
 */
export function BotaoResponderComIA({
  conversaId,
  titulo,
}: {
  conversaId: string;
  titulo: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [estado, setEstado] = useState<"parado" | "feito" | "erro">("parado");
  const [erro, setErro] = useState<string | null>(null);

  if (estado === "feito") {
    return (
      <span className="text-fluid-xs text-ok my-2 flex shrink-0 items-center self-center px-2">
        respondido ✓
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pendente}
      title={erro ?? `Deixar a Sofia responder: ${titulo}`}
      aria-label={`Deixar a Sofia responder: ${titulo}`}
      onClick={() =>
        iniciar(async () => {
          setErro(null);
          const r = await responderComIA(conversaId);
          if (r.erro) {
            setErro(r.erro);
            setEstado("erro");
            return;
          }
          setEstado("feito");
        })
      }
      className={`text-fluid-xs my-2 flex min-h-11 shrink-0 items-center self-center rounded-full border px-3 font-medium transition-colors disabled:opacity-60 ${
        estado === "erro"
          ? "border-alerta-linha text-alerta"
          : "border-acento-linha text-acento-suave hover:bg-elevado"
      }`}
    >
      {pendente ? "Respondendo…" : estado === "erro" ? "Tentar de novo" : "Sofia responde"}
    </button>
  );
}
