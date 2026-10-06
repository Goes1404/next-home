import { ETAPAS_FUNIL, GRUPO_DA_ETAPA, type EtapaFunil, type GrupoFunil } from "@/lib/types";

/**
 * Vocabulário visual das etapas do funil, em um lugar só.
 *
 * A etapa é dado ORDINAL — tem ordem — e por isso a cor aqui é uma RAMPA, não
 * seis matizes soltas. A versão anterior usava ciano, azul, areia e laranja
 * sem relação entre si: gastava meio círculo cromático e obrigava a decorar
 * qual cor vem antes de qual. "A escala esquenta junto com a negociação"
 * existia só no comentário; no olho eram quatro cores quaisquer.
 *
 * Desde 03/10/2026 (plano de ativação, 5.3) cada passo tem matiz própria,
 * das frias às quentes (índigo → turquesa → laranja → magenta): a rampa de
 * uma matiz só deixava as vizinhas parecidas demais na tela de Conversas. Os
 * dois TERMINAIS ficam fora do caminho: fechado é verde, perdido é vermelho
 * apagado — o mesmo recorte que `ETAPAS_DO_CAMINHO` faz em `types.ts`. Os
 * valores moram só em `globals.css`; aqui só os nomes dos tokens.
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

/*
 * Desde a 0165 (funil de 10 etapas) a cor é do GRUPO: as etapas do mesmo
 * grupo do funil resumido dividem a matiz. É o que faz o funil completo e o
 * resumido conversarem — "Em conversa" e "Qualificado" são turquesa porque
 * no resumido os dois são "Contatei". O rótulo diferencia dentro do grupo.
 */
function porGrupo(mapa: Record<GrupoFunil, string>): Record<EtapaFunil, string> {
  return Object.fromEntries(ETAPAS_FUNIL.map((e) => [e, mapa[GRUPO_DA_ETAPA[e]]])) as Record<
    EtapaFunil,
    string
  >;
}

/** Etiqueta arredondada do cartão e da lista. */
export const ETIQUETA_GRUPO: Record<GrupoFunil, string> = {
  // Sólido só aqui: "novo" é a única etapa que cobra uma ação hoje.
  novo: "bg-etapa-novo text-sobre-cor",
  contato: "bg-etapa-contato-lavado text-etapa-contato border border-etapa-contato-linha",
  visita: "bg-etapa-visita-lavado text-etapa-visita border border-etapa-visita-linha",
  negociacao: "bg-etapa-doc-lavado text-etapa-doc border border-etapa-doc-linha font-semibold",
  // Sólido também: entrada e vitória são os dois extremos do caminho, e são
  // os únicos momentos em que a etiqueta grita.
  fechado: "bg-etapa-fechado text-sobre-cor",
  perdido: "bg-etapa-perdido-lavado text-etapa-perdido border border-etapa-perdido-linha",
};
export const ETIQUETA_ETAPA = porGrupo(ETIQUETA_GRUPO);

/** Borda superior da coluna do quadro. */
export const BORDA_GRUPO: Record<GrupoFunil, string> = {
  novo: "border-etapa-novo-linha",
  contato: "border-etapa-contato-linha",
  visita: "border-etapa-visita-linha",
  negociacao: "border-etapa-doc-linha",
  fechado: "border-etapa-fechado-linha",
  perdido: "border-etapa-perdido-linha",
};
export const BORDA_ETAPA = porGrupo(BORDA_GRUPO);

/** Preenchimento do segmento no termômetro do funil. */
export const BARRA_GRUPO: Record<GrupoFunil, string> = {
  novo: "bg-etapa-novo",
  contato: "bg-etapa-contato",
  visita: "bg-etapa-visita",
  negociacao: "bg-etapa-doc",
  fechado: "bg-etapa-fechado",
  perdido: "bg-etapa-perdido",
};
export const BARRA_ETAPA = porGrupo(BARRA_GRUPO);

/**
 * O botão de avanço, pintado com a cor da etapa de DESTINO — quem olha vê
 * para onde o lead vai antes de tocar.
 *
 * O texto sai de `sobre-cor` e não de `text-fundo`: no escuro a cor da etapa
 * é clara e pede texto escuro, no claro é profunda e pede texto branco.
 */
export const AVANCO_ETAPA = porGrupo({
  novo: "bg-etapa-novo text-sobre-cor hover:opacity-90",
  contato: "bg-etapa-contato text-sobre-cor hover:opacity-90",
  visita: "bg-etapa-visita text-sobre-cor hover:opacity-90",
  negociacao: "bg-etapa-doc text-sobre-cor hover:opacity-90",
  fechado: "bg-etapa-fechado text-sobre-cor hover:opacity-90",
  perdido: "bg-etapa-perdido text-sobre-cor hover:opacity-90",
});

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
