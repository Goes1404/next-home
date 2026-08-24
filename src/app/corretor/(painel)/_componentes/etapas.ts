import type { EtapaFunil } from "@/lib/types";

/**
 * Vocabulário visual das etapas do funil, em um lugar só.
 *
 * UMA COR POR ETAPA. Antes eram três cores para sete etapas — "proposta
 * enviada" e "em negociação" eram a mesma areia, "novo" e "primeiro contato"
 * o mesmo verde — e duas etapas com a mesma cor não são identificáveis de
 * relance, que é a única razão de existir cor de status.
 *
 * A escala esquenta junto com a negociação: verde na chegada, ciano quando a
 * conversa começa, azul quando há compromisso marcado, âmbar quando há
 * proposta na mesa, laranja no aperto final, verde sólido no fechamento,
 * cinza no fim da linha.
 *
 * Todos os tokens aqui são de PAPEL, não de tinta: mudam com o tema. A
 * versão anterior usava `text-azure-200` e `text-sand-300` direto, que no
 * tema claro viravam texto pastel sobre branco — ilegível.
 */

/** Etiqueta arredondada do cartão e da lista. */
export const ETIQUETA_ETAPA: Record<EtapaFunil, string> = {
  // Sólido só aqui: "novo" é a única etapa que cobra uma ação hoje.
  novo: "bg-acento text-white",
  primeiro_contato: "bg-etapa-ciano-lavado text-etapa-ciano border border-etapa-ciano-linha",
  visita_agendada: "bg-etapa-azul-lavado text-etapa-azul border border-etapa-azul-linha",
  proposta_enviada: "bg-etapa-areia-lavado text-etapa-areia border border-etapa-areia-linha",
  negociacao:
    "bg-etapa-laranja-lavado text-etapa-laranja border border-etapa-laranja-linha font-semibold",
  fechado: "bg-ok-lavado text-ok border border-ok-linha",
  perdido: "bg-vidro-forte text-apoio border border-linha",
};

/** Borda superior da coluna do quadro. */
export const BORDA_ETAPA: Record<EtapaFunil, string> = {
  novo: "border-acento-linha",
  primeiro_contato: "border-etapa-ciano-linha",
  visita_agendada: "border-etapa-azul-linha",
  proposta_enviada: "border-etapa-areia-linha",
  negociacao: "border-etapa-laranja-linha",
  fechado: "border-ok-linha",
  perdido: "border-linha",
};

/** Preenchimento do segmento no termômetro do funil. */
export const BARRA_ETAPA: Record<EtapaFunil, string> = {
  novo: "bg-acento",
  primeiro_contato: "bg-etapa-ciano",
  visita_agendada: "bg-etapa-azul",
  proposta_enviada: "bg-etapa-areia",
  negociacao: "bg-etapa-laranja",
  fechado: "bg-ok",
  perdido: "bg-tenue/45",
};

/**
 * A régua de cor — o elemento que amarra o painel inteiro.
 *
 * Uma barra vertical de 3px na borda esquerda do cartão, da linha da lista e
 * do cabeçalho da ficha. É o mesmo gesto em toda tela, então a etapa se lê
 * antes de qualquer texto: o corretor rola a lista e vê a distribuição do
 * funil sem ler uma palavra. Usa a mesma escala de `BARRA_ETAPA` de
 * propósito — duas escalas de cor para a mesma informação seria o mesmo erro
 * que ter uma cor para duas etapas.
 */
export const REGUA_ETAPA = BARRA_ETAPA;

/**
 * Ponto de cor para onde não cabe etiqueta inteira (selects, legendas,
 * cabeçalhos apertados). Some junto com o texto se a cor não for percebida:
 * nunca é a ÚNICA marca da etapa, sempre acompanha o rótulo.
 */
export const PONTO_ETAPA = BARRA_ETAPA;
