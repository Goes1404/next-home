"use client";

import { Check } from "lucide-react";
import { moverEtapa } from "@/app/corretor/actions";
import { AVANCO_ETAPA } from "./etapas";
import { cn } from "@/lib/utils";
import { BotaoAcao } from "./BotaoAcao";
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
  const proxima = PROXIMA_ETAPA[etapa];
  // Fechado e perdido não avançam: um botão ali seria armadilha.
  if (!proxima) return null;

  return (
    <BotaoAcao
      acao={() => moverEtapa(leadId, proxima.etapa)}
      // O sucesso é anunciado porque na LISTA ele não se vê: a linha some do
      // recorte atual ou muda uma régua de 4px na borda, longe do dedo que
      // acabou de tocar. Na ficha do lead a mudança é óbvia, mas o mesmo
      // botão serve os dois lugares, e errar para o lado de avisar é barato.
      sucesso={`Movido para ${proxima.acao.toLowerCase()}`}
      rotulopendente="Salvando…"
      title={`Avançar para ${proxima.acao.toLowerCase()}`}
      className={cn(
        // Vem depois da variante de propósito: `cn` usa twMerge, então a cor
        // da etapa de DESTINO vence o acento do módulo. É o que faz o botão
        // dizer para onde o lead vai antes de ser tocado.
        AVANCO_ETAPA[proxima.etapa],
        tamanho === "compacto" ? "text-fluid-xs min-h-11 px-3" : "text-fluid-sm min-h-12 px-4",
        className,
      )}
    >
      <Check aria-hidden className="h-4 w-4 shrink-0" />
      {proxima.acao}
    </BotaoAcao>
  );
}
