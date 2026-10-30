"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { Interruptor } from "@/app/corretor/(painel)/marketing/impulsionamentos/Interruptor";
import { configurarCentralWhatsapp } from "./acoes";

/**
 * O liga/desliga dos comandos pelo WhatsApp (0248), para o gestor. Salva na
 * hora; se falhar, volta.
 */
export function ComandosPeloWhatsapp({ ligado }: { ligado: boolean }) {
  const [marcado, setMarcado] = useState(ligado);
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const mudar = (novo: boolean) => {
    setMarcado(novo);
    iniciar(async () => {
      try {
        const r = await configurarCentralWhatsapp(novo);
        if (r.erro) {
          setMarcado(!novo);
          falhar(r.erro);
        } else if (r.ok) avisar(r.ok);
      } catch {
        setMarcado(!novo);
        falhar("Não foi possível salvar agora. Tente novamente.");
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-linha bg-vidro px-4 py-3">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-fluid-sm font-semibold text-titulo">Comandos pelo WhatsApp</span>
        <span className="text-fluid-xs text-apoio">
          A equipe conversa com o número central da plataforma para consultar e mexer no CRM. Toda mudança só acontece
          depois de um &quot;sim&quot;.
        </span>
      </span>
      <Interruptor ligado={marcado} aoMudar={mudar} rotulo="Comandos pelo WhatsApp" desativado={pendente} />
    </div>
  );
}
