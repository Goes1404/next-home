"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { alternarPausa } from "@/app/corretor/actions";

/** Liga/desliga a pausa de um corretor na escala da roleta. */
export function TogglePausa({ corretorId, emPausa }: { corretorId: string; emPausa: boolean }) {
  const [pausado, setPausado] = useState(emPausa);
  const [salvando, iniciarTransicao] = useTransition();
  const { falhar } = useAvisos();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={pausado}
        aria-label={pausado ? "Tirar da pausa" : "Colocar em pausa"}
        disabled={salvando}
        onClick={() => {
          const novoValor = !pausado;
          setPausado(novoValor);
          iniciarTransicao(async () => {
            const resultado = await alternarPausa(corretorId, novoValor);
            if (resultado.erro) {
              setPausado(!novoValor);
              falhar(resultado.erro);
            }
          });
        }}
        className={`text-fluid-xs rounded-full border px-3 py-1 transition-colors disabled:opacity-50 ${
          pausado
            ? "border-alerta-linha bg-alerta-lavado text-alerta"
            : "border-linha-forte bg-campo text-corpo"
        }`}
      >
        {pausado ? "Em pausa" : "Na escala"}
      </button>
    </div>
  );
}
