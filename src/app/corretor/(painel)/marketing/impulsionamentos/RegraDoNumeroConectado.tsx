"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { configurarPuloDeCorretorDesconectado } from "@/app/corretor/(painel)/admin/whatsapp/acoes";

/** Se a distribuição pode entregar lead a corretor sem WhatsApp conectado. */
export function RegraDoNumeroConectado({ ligada }: { ligada: boolean }) {
  const [marcada, setMarcada] = useState(ligada);
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-linha-forte bg-superficie p-3">
      <input
        type="checkbox"
        checked={marcada}
        disabled={pendente}
        onChange={(e) => {
          const novo = e.target.checked;
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
        }}
        className="mt-1 size-5 accent-[var(--color-acento)]"
      />
      <span className="grid gap-0.5">
        <span className="text-fluid-sm font-medium text-titulo">Só entrega lead a quem está com o WhatsApp conectado</span>
        <span className="text-fluid-xs text-apoio">
          Ligado: o lead só vai para quem estiver conectado. Desligado: conectados seguem na frente, mas a distribuição
          não deixa o lead sem responsável. Na roleta dos anúncios em modo grupo, o que conta é o corretor ter grupo, não o
          WhatsApp.
        </span>
      </span>
    </label>
  );
}
