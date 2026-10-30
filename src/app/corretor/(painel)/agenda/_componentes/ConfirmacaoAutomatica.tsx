"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { configurarConfirmacaoAutomatica } from "@/app/corretor/(painel)/admin/whatsapp/acoes";
import { useVocabulario } from "@/lib/ramos/RamoDoPainel";
import { Interruptor } from "@/app/corretor/(painel)/marketing/impulsionamentos/Interruptor";

/**
 * O opt-in da confirmação automática de visita, para o gestor (0246,
 * 29/10/2026), na Agenda da equipe. Salva na hora; se falhar, volta.
 */
export function ConfirmacaoAutomatica({ ligada }: { ligada: boolean }) {
  const [marcada, setMarcada] = useState(ligada);
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();
  // O vocabulário do ramo (30/10/2026, revisão). Na imobiliária, o texto de sempre.
  const v = useVocabulario();
  const da = `${v.compromisso.genero === "f" ? "da" : "do"} ${v.compromisso.singular}`;
  const titulo = `Pedir a confirmação ${da} sozinho`;
  const equipe = v.equipe.singular;

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
        <span className="text-fluid-sm font-semibold text-titulo">{titulo}</span>
        <span className="text-fluid-xs text-apoio">
          Até 24h antes, do número do {equipe}, em horário comercial e dentro da cota anti-ban. Desligado: só quando o{" "}
          {equipe} tocar em &quot;Pedir confirmação&quot;.
        </span>
      </span>
      <Interruptor ligado={marcada} aoMudar={mudar} rotulo={titulo} desativado={pendente} />
    </div>
  );
}
