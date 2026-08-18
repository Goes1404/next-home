import type { EtapaFunil } from "@/lib/types";

/**
 * Vocabulário visual das etapas do funil, em um lugar só.
 *
 * A escala segue a temperatura da negociação: verde na chegada, azul quando
 * está em andamento, areia quando já tem dinheiro na mesa, verde de novo
 * (mas de "concluído") no fechamento e cinza no fim da linha. O corretor lê
 * a coluna de relance em vez de decorar sete nomes.
 *
 * Todos os tokens aqui são de PAPEL, não de tinta: mudam com o tema. A
 * versão anterior usava `text-azure-200` e `text-sand-300` direto, que no
 * tema claro viravam texto pastel sobre branco — ilegível.
 */

/** Etiqueta arredondada do cartão e da lista. */
export const ETIQUETA_ETAPA: Record<EtapaFunil, string> = {
  // Sólido só aqui: "novo" é a única etapa que cobra uma ação hoje.
  novo: "bg-acento text-white",
  primeiro_contato: "bg-acento-lavado text-acento-suave border border-acento-linha",
  visita_agendada: "bg-etapa-azul-lavado text-etapa-azul border border-etapa-azul-linha",
  proposta_enviada: "bg-etapa-areia-lavado text-etapa-areia border border-etapa-areia-linha",
  negociacao:
    "bg-etapa-areia-lavado text-etapa-areia border border-etapa-areia-linha font-semibold",
  fechado: "bg-ok-lavado text-ok border border-ok-linha",
  perdido: "bg-vidro-forte text-apoio border border-linha",
};

/** Borda superior da coluna do quadro. */
export const BORDA_ETAPA: Record<EtapaFunil, string> = {
  novo: "border-acento-linha",
  primeiro_contato: "border-acento-linha",
  visita_agendada: "border-etapa-azul-linha",
  proposta_enviada: "border-etapa-areia-linha",
  negociacao: "border-etapa-areia-linha",
  fechado: "border-ok-linha",
  perdido: "border-linha",
};

/** Preenchimento do segmento no termômetro do funil. */
export const BARRA_ETAPA: Record<EtapaFunil, string> = {
  novo: "bg-acento",
  primeiro_contato: "bg-acento/55",
  visita_agendada: "bg-etapa-azul",
  proposta_enviada: "bg-etapa-areia",
  negociacao: "bg-etapa-areia/60",
  fechado: "bg-ok",
  perdido: "bg-tenue/45",
};
