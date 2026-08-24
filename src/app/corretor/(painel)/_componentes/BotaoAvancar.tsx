"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { moverEtapa } from "@/app/corretor/actions";
import { AVANCO_ETAPA } from "./etapas";
import { cn } from "@/lib/utils";
import { PROXIMA_ETAPA, type EtapaFunil } from "@/lib/types";

/**
 * O botão de um toque — a única coisa que o corretor precisa apertar para o
 * lead andar.
 *
 * Mover um lead custava dois toques no melhor caso (abrir a folha, escolher
 * a etapa) e um seletor de sete opções no pior. Mas o funil é um CAMINHO:
 * depois de "Leads" vem "Contatei", depois vem "Visita". A etapa seguinte é
 * previsível em 90% dos casos, e o que não é previsível continua na folha de
 * ações, atrás do "⋯".
 *
 * O rótulo é o ATO, não o destino: "Falei com ele", não "mover para primeiro
 * contato". Quem vende não pensa em mover cartão — pensa no que acabou de
 * fazer.
 *
 * A cor é a da PRÓXIMA etapa, não a da atual: o botão mostra para onde o
 * lead vai, e depois do toque a régua do cartão fica exatamente daquela cor.
 */
export function BotaoAvancar({
  leadId,
  etapa,
  tamanho = "normal",
  className,
}: {
  leadId: string;
  etapa: EtapaFunil;
  /** `compacto` cabe na linha da lista; `normal` na ficha e no cartão. */
  tamanho?: "normal" | "compacto";
  className?: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [movendo, iniciar] = useTransition();

  const proxima = PROXIMA_ETAPA[etapa];
  // Fechado e perdido não avançam: um botão ali seria armadilha.
  if (!proxima) return null;

  function avancar() {
    if (movendo || !proxima) return;
    setErro(null);
    iniciar(async () => {
      const resultado = await moverEtapa(leadId, proxima.etapa);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className={cn("inline-flex flex-col items-stretch gap-1", className)}>
      <button
        type="button"
        onClick={avancar}
        disabled={movendo}
        title={`Avançar para ${proxima.acao.toLowerCase()}`}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:opacity-60",
          AVANCO_ETAPA[proxima.etapa],
          tamanho === "compacto"
            ? "text-fluid-xs min-h-11 px-3"
            : "text-fluid-sm min-h-12 px-4",
        )}
      >
        <Check aria-hidden className="h-4 w-4 shrink-0" />
        {movendo ? "Salvando…" : proxima.acao}
      </button>

      {erro && (
        <span role="alert" className="text-fluid-xs text-alerta">
          {erro}
        </span>
      )}
    </span>
  );
}
