/**
 * A forma dos parâmetros de crédito — módulo PURO.
 *
 * Puro porque a tela do gestor (`"use client"`) e a conta de financiamento
 * leem a mesma forma, e importar isto de dentro de um módulo `server-only`
 * derrubaria o build do cliente — a pedra do `limitesPdf.ts` e do
 * `pessoasTipos.ts`.
 *
 * Estes números MUDAM: faixa do MCMV, teto de uso do FGTS, taxa de referência
 * do SBPE, alíquota de ITBI. Por isso vivem no banco, editáveis pelo gestor —
 * e por isso `conferidoEm` viaja junto. Número de crédito sem data é número
 * que ninguém sabe se ainda vale.
 */

export type FaixaMcmv = {
  /** "Faixa 1", "Faixa 2"… — o rótulo que o corretor usa ao falar. */
  nome: string;
  /** Renda familiar bruta máxima da faixa, em reais. */
  rendaMax: number;
  /** Subsídio máximo dessa faixa, em reais. Zero quando não há. */
  subsidioMaximo: number;
  /** Taxa efetiva anual, em decimal: 0.045 = 4,5% a.a. */
  taxaAnual: number;
};

export type ParametrosCredito = {
  /** A conta escolhe a PRIMEIRA cuja renda-teto comporte a renda declarada. */
  faixas: FaixaMcmv[];
  /** Valor máximo do imóvel para usar FGTS na compra. */
  tetoFgtsImovel: number;
  /** Taxa efetiva anual do SBPE, para quem está fora do MCMV. */
  taxaSbpeAnual: number;
  /** Prazo máximo de financiamento, em meses. */
  prazoMaximoMeses: number;
  /** Fração da renda que a parcela não deve passar: 0.3 = 30%. */
  comprometimentoMaximo: number;
  /** Alíquota de ITBI por cidade, em decimal: `{ "Barueri": 0.02 }`. */
  itbiPorCidade: Record<string, number>;
  /** ISO (AAAA-MM-DD) da última conferência na fonte. */
  conferidoEm: string;
};

/**
 * Cidade fora do mapa usa 2%, que é a alíquota mais comum no estado.
 *
 * Devolver zero seria pior que uma estimativa: o corretor esqueceria o ITBI na
 * conta, e ele é o custo que mais surpreende o cliente na assinatura. A
 * simulação diz em voz alta quando caiu no padrão.
 */
export const ALIQUOTA_ITBI_PADRAO = 0.02;
