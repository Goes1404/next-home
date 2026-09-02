"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "./Avisos";
import { responderComIA } from "../conversas/acoes";

/**
 * "Responder com IA" — direto da fila do Início.
 *
 * O rótulo não usa o NOME da assistente de propósito. Ele é configurável
 * (`nomeAssistente`, padrão "Sofia") e este botão não conhece a configuração:
 * chumbar o padrão faria a fila mentir para quem renomeasse a assistente na
 * tela de ajustes. Além disso o nome nunca é apresentado em lugar nenhum do
 * painel — quem abre pela primeira vez não sabe quem é Sofia.
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
  const { falhar } = useAvisos();

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
      /*
       * O motivo da falha vivia só no `title` — que não existe no celular,
       * onde não há ponteiro para repousar. O botão trocava para "Tentar de
       * novo" sem dizer por quê. Agora o motivo vai para a região de avisos,
       * que é visível nos dois.
       */
      title={`Deixar a assistente responder: ${titulo}`}
      aria-label={`Deixar a assistente responder: ${titulo}`}
      onClick={() =>
        iniciar(async () => {
          try {
            const r = await responderComIA(conversaId);
            if (r.erro) {
              falhar(r.erro);
              setEstado("erro");
              return;
            }
            setEstado("feito");
          } catch {
            falhar("Não deu para pedir a resposta. Confira a conexão.");
            setEstado("erro");
          }
        })
      }
      className={`text-fluid-xs my-2 flex min-h-11 shrink-0 items-center self-center rounded-full border px-3 font-medium transition-colors disabled:opacity-60 ${
        estado === "erro"
          ? "border-alerta-linha text-alerta"
          : "border-acento-linha text-acento-suave hover:bg-elevado"
      }`}
    >
      {pendente ? "Respondendo…" : estado === "erro" ? "Tentar de novo" : "Responder com IA"}
    </button>
  );
}
