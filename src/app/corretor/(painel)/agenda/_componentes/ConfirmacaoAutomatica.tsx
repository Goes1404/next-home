"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { configurarConfirmacaoAutomatica } from "@/app/corretor/(painel)/admin/whatsapp/acoes";
import { Interruptor } from "@/app/corretor/(painel)/marketing/impulsionamentos/Interruptor";

/**
 * O opt-in da confirmação automática de visita, para o gestor (0246,
 * 29/10/2026), na Agenda da equipe. Salva na hora; se falhar, volta.
 */
export function ConfirmacaoAutomatica({ ligada }: { ligada: boolean }) {
  const [marcada, setMarcada] = useState(ligada);
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const mudar = (novo: boolean) => {
    setMarcada(novo);
    iniciar(async () => {
      try {
        const r = await configurarConfirmacaoAutomatica(novo);
        if (r.erro) {
          setMarcada(!novo);
          falhar(r.erro);
        } else if (r.ok) avisar(r.ok);
      } catch {
        setMarcada(!novo);
        falhar("Não foi possível salvar agora. Tente novamente.");
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-linha bg-vidro px-4 py-3">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-fluid-sm font-semibold text-titulo">Pedir a confirmação da visita sozinho</span>
        <span className="text-fluid-xs text-apoio">
          Até 24h antes, do número do corretor, em horário comercial e dentro da cota anti-ban. Desligado: só quando o
          corretor tocar em &quot;Pedir confirmação&quot;.
        </span>
      </span>
      <Interruptor ligado={marcada} aoMudar={mudar} rotulo="Pedir a confirmação da visita sozinho" desativado={pendente} />
    </div>
  );
}
