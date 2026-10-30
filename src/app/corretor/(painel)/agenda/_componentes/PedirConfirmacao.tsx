"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { pedirConfirmacaoDaAgenda } from "../acoesConfirmacao";

/**
 * O toque "Pedir confirmação" (0246, 29/10/2026): manda ao cliente, do seu
 * número, o pedido de confirmação da visita. Nada sai sem este toque — a não
 * ser que o gestor tenha ligado a confirmação automática do grupo.
 */
export function PedirConfirmacao({ visitaId }: { visitaId: string }) {
  const router = useRouter();
  const { avisar, falhar } = useAvisos();
  const [enviando, iniciar] = useTransition();
  const [enviado, setEnviado] = useState(false);

  if (enviado) return <p className="text-fluid-xs text-ok">Pedido de confirmação enviado.</p>;

  return (
    <button
      type="button"
      disabled={enviando}
      onClick={() =>
        iniciar(async () => {
          try {
            const r = await pedirConfirmacaoDaAgenda(visitaId);
            if (r.erro) return falhar(r.erro);
            setEnviado(true);
            avisar(r.ok ?? "Pedido enviado.");
            router.refresh();
          } catch {
            falhar("Não foi possível enviar agora. Tente de novo.");
          }
        })
      }
      className="botao-solido min-h-11 w-full px-4 text-sm disabled:opacity-60"
    >
      {enviando ? "Enviando…" : "Pedir confirmação pelo WhatsApp"}
    </button>
  );
}
