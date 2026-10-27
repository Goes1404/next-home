"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { configurarPuloDeCorretorDesconectado } from "@/app/corretor/(painel)/admin/whatsapp/acoes";
import { Interruptor } from "./Interruptor";

/** Se a distribuição pode entregar lead a corretor sem WhatsApp conectado. Salva na hora. */
export function RegraDoNumeroConectado({ ligada }: { ligada: boolean }) {
  const [marcada, setMarcada] = useState(ligada);
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const mudar = (novo: boolean) => {
    setMarcada(novo);
    iniciar(async () => {
      try {
        const r = await configurarPuloDeCorretorDesconectado(novo);
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
        <span className="text-fluid-sm font-semibold text-titulo">Só entregar lead a quem está com o WhatsApp conectado</span>
        <span className="text-fluid-xs text-apoio">
          Desligado: os conectados vêm primeiro, mas o lead nunca fica sem responsável. Vale na hora.
        </span>
      </span>
      <Interruptor ligado={marcada} aoMudar={mudar} rotulo="Só entregar lead a quem está com o WhatsApp conectado" desativado={pendente} />
    </div>
  );
}
