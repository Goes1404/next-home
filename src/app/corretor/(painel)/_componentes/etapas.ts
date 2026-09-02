import type { EtapaFunil } from "@/lib/types";

/**
 * Vocabulário visual das etapas do funil, em um lugar só.
 *
 * A etapa é dado ORDINAL — tem ordem — e por isso a cor aqui é uma RAMPA, não
 * seis matizes soltas. A versão anterior usava ciano, azul, areia e laranja
 * sem relação entre si: gastava meio círculo cromático e obrigava a decorar
 * qual cor vem antes de qual. "A escala esquenta junto com a negociação"
 * existia só no comentário; no olho eram quatro cores quaisquer.
 *
 * Agora são quatro passos de uma rampa só (azul-índigo → ciano), com o peso
 * visual crescendo conforme o negócio avança, e dois TERMINAIS fora dela:
 * fechado e perdido não são passos, são desfechos — o mesmo recorte que
 * `ETAPAS_DO_CAMINHO` faz em `types.ts`.
 *
 * Nada aqui usa `acento`. Isso é regra, não detalhe: `acento` passou a ser a
 * cor do MÓDULO (reapontada por `[data-modulo]` em globals.css), então uma
 * etapa pintada com ele mudaria de cor conforme a tela em que o lead
 * aparecesse — o mesmo lead seria violeta no Início e magenta em Leads. Cor
 * de etapa descreve o registro e não pode depender de onde ele está sendo
 * olhado.
 *
 * Todos os tokens são de PAPEL e resolvem os dois temas via `light-dark()`.
 */

/** Etiqueta arredondada do cartão e da lista. */
export const ETIQUETA_ETAPA: Record<EtapaFunil, string> = {
  // Sólido só aqui: "novo" é a única etapa que cobra uma ação hoje.
  novo: "bg-etapa-novo text-sobre-cor",
  primeiro_contato:
    "bg-etapa-contato-lavado text-etapa-contato border border-etapa-contato-linha",
  visita_agendada: "bg-etapa-visita-lavado text-etapa-visita border border-etapa-visita-linha",
  documentacao:
    "bg-etapa-doc-lavado text-etapa-doc border border-etapa-doc-linha font-semibold",
  fechado: "bg-etapa-fechado-lavado text-etapa-fechado border border-etapa-fechado-linha",
  perdido: "bg-etapa-perdido-lavado text-etapa-perdido border border-etapa-perdido-linha",
};

/** Borda superior da coluna do quadro. */
export const BORDA_ETAPA: Record<EtapaFunil, string> = {
  novo: "border-etapa-novo-linha",
  primeiro_contato: "border-etapa-contato-linha",
  visita_agendada: "border-etapa-visita-linha",
  documentacao: "border-etapa-doc-linha",
  fechado: "border-etapa-fechado-linha",
  perdido: "border-etapa-perdido-linha",
};

/** Preenchimento do segmento no termômetro do funil. */
export const BARRA_ETAPA: Record<EtapaFunil, string> = {
  novo: "bg-etapa-novo",
  primeiro_contato: "bg-etapa-contato",
  visita_agendada: "bg-etapa-visita",
  documentacao: "bg-etapa-doc",
  fechado: "bg-etapa-fechado",
  perdido: "bg-etapa-perdido",
};

/**
 * O botão de avanço, pintado com a cor da etapa de DESTINO — quem olha vê
 * para onde o lead vai antes de tocar, e depois do toque a régua do cartão
 * fica exatamente daquela cor.
 *
 * Sólido, e não lavado: é a ação primária da tela, e ação primária que se
 * confunde com etiqueta não é apertada.
 *
 * O texto sai de `sobre-cor` e não de `text-fundo`: no escuro a cor da etapa
 * é clara e pede texto escuro, no claro é profunda e pede texto branco. Um
 * valor chumbado acertaria um tema e sumiria no outro.
 */
export const AVANCO_ETAPA: Record<EtapaFunil, string> = {
  novo: "bg-etapa-novo text-sobre-cor hover:opacity-90",
  primeiro_contato: "bg-etapa-contato text-sobre-cor hover:opacity-90",
  visita_agendada: "bg-etapa-visita text-sobre-cor hover:opacity-90",
  documentacao: "bg-etapa-doc text-sobre-cor hover:opacity-90",
  fechado: "bg-etapa-fechado text-sobre-cor hover:opacity-90",
  perdido: "bg-etapa-perdido text-sobre-cor hover:opacity-90",
};

/**
 * A régua de cor — o elemento que amarra o painel inteiro.
 *
 * Uma barra vertical na borda esquerda do cartão, da linha da lista e do
 * cabeçalho da ficha. É o mesmo gesto em toda tela, então a etapa se lê antes
 * de qualquer texto: o corretor rola a lista e vê a distribuição do funil sem
 * ler uma palavra. Usa a mesma escala de `BARRA_ETAPA` de propósito — duas
 * escalas de cor para a mesma informação seria o mesmo erro que ter uma cor
 * para duas etapas.
 */
export const REGUA_ETAPA = BARRA_ETAPA;

/**
 * Ponto de cor para onde não cabe etiqueta inteira (selects, legendas,
 * cabeçalhos apertados). Nunca é a ÚNICA marca da etapa: sempre acompanha o
 * rótulo, porque cor sozinha não é informação para quem não a distingue.
 */
export const PONTO_ETAPA = BARRA_ETAPA;
