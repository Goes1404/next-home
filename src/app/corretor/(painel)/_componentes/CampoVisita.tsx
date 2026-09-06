"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { definirVisitaEm } from "@/app/corretor/actions";

/** Formato que o `<input type="datetime-local">` exige, em hora local. */
function paraInputLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Data/hora da visita de um lead na etapa "visita_agendada". Fica dentro do
 * cartão do lead, não numa tela própria — visita É o lead nessa etapa (ver
 * migration 0009), não um registro separado a gerenciar em outro lugar.
 */
export function CampoVisita({ leadId, quando }: { leadId: string; quando: string | null }) {
  const [valor, setValor] = useState(paraInputLocal(quando));
  const [salvando, iniciarTransicao] = useTransition();
  const { falhar } = useAvisos();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="text-fluid-xs text-tenue" htmlFor={`visita-${leadId}`}>
        Data da visita
      </label>
      <input
        id={`visita-${leadId}`}
        type="datetime-local"
        value={valor}
        disabled={salvando}
        onChange={(e) => {
          const novoValor = e.target.value;
          setValor(novoValor);
          iniciarTransicao(async () => {
            const quandoIso = novoValor ? new Date(novoValor).toISOString() : null;
            const resultado = await definirVisitaEm(leadId, quandoIso);
            if (resultado.erro) falhar(resultado.erro);
          });
        }}
        className="text-fluid-xs rounded-lg border border-linha-forte bg-campo px-2 py-1.5 text-corpo disabled:opacity-50"
      />
    </div>
  );
}
