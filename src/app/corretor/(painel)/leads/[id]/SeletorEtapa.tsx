"use client";

import { useOptimistic, useTransition } from "react";
import { moverEtapa } from "@/app/corretor/actions";
import { ETIQUETA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { ETAPA_LABEL, ETAPAS_FUNIL, type EtapaFunil } from "@/lib/types";

/**
 * Mover o lead de etapa direto da ficha — o mesmo `moverEtapa` do quadro.
 *
 * Otimista como o quadro, e pelo mesmo motivo de lá: o RLS pode negar, e
 * `moverEtapa` devolve erro quando nenhuma linha é afetada. O `useOptimistic`
 * volta sozinho ao valor do servidor quando a transição termina.
 */
export function SeletorEtapa({ leadId, etapa }: { leadId: string; etapa: EtapaFunil }) {
  const [, iniciar] = useTransition();
  const [etapaVisivel, verEtapa] = useOptimistic(etapa);

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">Etapa do funil</span>
      <select
        value={etapaVisivel}
        onChange={(e) => {
          const nova = e.target.value as EtapaFunil;
          iniciar(async () => {
            verEtapa(nova);
            await moverEtapa(leadId, nova);
          });
        }}
        className={`text-fluid-xs cursor-pointer rounded-full px-3 py-1.5 font-medium ${ETIQUETA_ETAPA[etapaVisivel]}`}
      >
        {ETAPAS_FUNIL.map((e) => (
          <option key={e} value={e} className="bg-superficie text-corpo">
            {ETAPA_LABEL[e]}
          </option>
        ))}
      </select>
    </label>
  );
}
