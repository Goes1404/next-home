"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { Empreendimento } from "@/lib/types";
import { EnvioImediato } from "./_componentes/EnvioImediato";
import { HistoricoCampanhas } from "./_componentes/HistoricoCampanhas";
import { NovaCampanha } from "./_componentes/NovaCampanha";
import { StatusFila } from "./_componentes/StatusFila";
import { listarCampanhas, type CampanhaListada, type StatusDisparo } from "./acoes";

/**
 * A casca da tela de Campanhas (roadmap F4).
 *
 * Antes eram 552 linhas com 21 botões, jargão de sistema à vista ("cota",
 * "fila", "instância") e as ferramentas destrutivas no mesmo nível do resto.
 * Agora são três blocos com um papel cada: como está a fila, criar campanha
 * nova (assistente de 3 passos) e o que já foi enviado.
 */

interface Props {
  empreendimentos: Empreendimento[];
  campanhasIniciais: CampanhaListada[];
  statusInicial: StatusDisparo | null;
}

export function CampanhasManager({ empreendimentos, campanhasIniciais, statusInicial }: Props) {
  const [campanhas, setCampanhas] = useState<CampanhaListada[]>(campanhasIniciais);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {feedback && (
        <p className="text-fluid-sm text-ok border-ok-linha bg-ok-lavado flex items-start gap-2 rounded-xl border px-4 py-3">
          <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {feedback}
        </p>
      )}

      <StatusFila
        statusInicial={statusInicial}
        aoMudar={async () => setCampanhas(await listarCampanhas())}
      />

      <NovaCampanha
        empreendimentos={empreendimentos}
        aoCriar={(campanha, aviso) => {
          setCampanhas((prev) => [campanha, ...prev]);
          setFeedback(aviso);
          setTimeout(() => setFeedback(null), 10000);
        }}
      />

      {/* Depois do assistente, e não antes: o caminho normal é criar uma
          lista escolhendo o público. Este é o atalho para a carteira
          inteira agora — poderoso e sem volta, então não disputa a
          atenção com o fluxo que se quer que seja o padrão. */}
      <EnvioImediato
        aoEnviar={(campanha, aviso) => {
          setCampanhas((prev) => [campanha, ...prev]);
          setFeedback(aviso);
          setTimeout(() => setFeedback(null), 10000);
        }}
      />

      <HistoricoCampanhas
        campanhas={campanhas}
        aoLiberar={async () => setCampanhas(await listarCampanhas())}
      />
    </div>
  );
}
