/**
 * A conta do financiamento — módulo PURO, sem I/O e sem LLM.
 *
 * ## Por que a IA não faz esta conta
 *
 * Modelo erra aritmética, e o número daqui vai para o cliente. A IA EXTRAI
 * (renda, entrada, imóvel) do texto livre e PEDE a simulação; quem calcula é
 * este arquivo, que tem teste. Mesma razão por que o telefone é normalizado
 * em código e o corte de mensagem não é pedido no prompt.
 *
 * ## O que ela é
 *
 * ESTIMATIVA, e diz isso em voz alta: `premissas` sai preenchida em toda
 * simulação. Financiamento de verdade depende de análise de crédito, seguro,
 * taxa negociada e avaliação do imóvel — nada disso está aqui.
 */

import { ALIQUOTA_ITBI_PADRAO, type FaixaMcmv, type ParametrosCredito } from "@/lib/credito/tipos";

export type EntradaSimulacao = {
  /** Renda familiar bruta mensal. */
  rendaMensal: number;
  /** Recursos próprios em dinheiro. */
  entrada: number;
  /** Saldo de FGTS que a pessoa pretende usar. */
  fgts?: number;
  valorImovel: number;
  cidade?: string;
  prazoMeses?: number;
};

export type Simulacao = {
  /** `null` = fora do MCMV; a conta usa a taxa do SBPE. */
  faixa: string | null;
  taxaAnual: number;
  prazoMeses: number;
  subsidio: number;
  /** O teto de parcela que a renda suporta. */
  parcelaMaxima: number;
  /** Quanto de financiamento essa parcela sustenta, no prazo escolhido. */
  valorFinanciavel: number;
  /** Entrada + FGTS utilizável + subsídio. */
  recursosProprios: number;
  /** Quanto ainda falta depois de tudo. Zero quando fecha. */
  faltam: number;
  fecha: boolean;
  /** A parcela do financiamento realmente necessário. Zero se não fecha. */
  parcelaEstimada: number;
  itbi: number;
  /** O que a conta assumiu, em português. */
  premissas: string[];
  /** O que o corretor precisa saber que foi desconsiderado. */
  avisos: string[];
};

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Efetiva anual → efetiva mensal.
 *
 * Dividir por 12 subestima a parcela e infla o quanto a renda sustenta — o
 * erro que faz a simulação dizer "fecha" para quem não fecha, que é o pior
 * desfecho possível aqui (manda alguém para uma visita que termina em não).
 */
function taxaMensal(anual: number): number {
  return Math.pow(1 + anual, 1 / 12) - 1;
}

/** Valor presente de uma série de parcelas iguais (tabela Price). */
function valorPresente(parcela: number, i: number, n: number): number {
  if (i <= 0) return parcela * n;
  return (parcela * (1 - Math.pow(1 + i, -n))) / i;
}

/** Parcela de um financiamento (tabela Price). */
function parcelaDe(principal: number, i: number, n: number): number {
  if (principal <= 0) return 0;
  if (i <= 0) return principal / n;
  return (principal * i) / (1 - Math.pow(1 + i, -n));
}

/** A PRIMEIRA faixa cuja renda-teto comporta a renda declarada. */
function faixaDaRenda(renda: number, faixas: FaixaMcmv[]): FaixaMcmv | null {
  return [...faixas].sort((a, b) => a.rendaMax - b.rendaMax).find((f) => renda <= f.rendaMax) ?? null;
}

export function simularFinanciamento(
  entrada: EntradaSimulacao,
  params: ParametrosCredito,
): Simulacao {
  const avisos: string[] = [];

  const faixa = faixaDaRenda(entrada.rendaMensal, params.faixas);
  const taxaAnual = faixa ? faixa.taxaAnual : params.taxaSbpeAnual;
  const subsidio = faixa ? faixa.subsidioMaximo : 0;

  const prazoMeses = Math.min(
    entrada.prazoMeses ?? params.prazoMaximoMeses,
    params.prazoMaximoMeses,
  );
  const i = taxaMensal(taxaAnual);

  /*
   * O FGTS na compra tem teto de VALOR DO IMÓVEL, não de renda. Ignorar isso
   * inflaria os recursos próprios e a simulação diria "fecha" para quem não
   * fecha.
   */
  const fgtsPedido = Math.max(0, entrada.fgts ?? 0);
  const fgtsUsavel = entrada.valorImovel <= params.tetoFgtsImovel ? fgtsPedido : 0;
  if (fgtsPedido > 0 && fgtsUsavel === 0) {
    avisos.push(
      `FGTS não entrou na conta: o imóvel (${reais(entrada.valorImovel)}) passa do teto de ${reais(params.tetoFgtsImovel)} para uso do fundo na compra.`,
    );
  }

  const recursosProprios = Math.max(0, entrada.entrada) + fgtsUsavel + subsidio;
  const necessario = Math.max(0, entrada.valorImovel - recursosProprios);

  const parcelaMaxima = entrada.rendaMensal * params.comprometimentoMaximo;
  const valorFinanciavel = valorPresente(parcelaMaxima, i, prazoMeses);

  const fecha = necessario <= valorFinanciavel;
  const faltam = fecha ? 0 : Math.round(necessario - valorFinanciavel);
  const parcelaEstimada = fecha ? parcelaDe(necessario, i, prazoMeses) : 0;

  const cidade = entrada.cidade?.trim();
  const aliquota = (cidade ? params.itbiPorCidade[cidade] : undefined) ?? ALIQUOTA_ITBI_PADRAO;
  if (cidade && params.itbiPorCidade[cidade] === undefined) {
    avisos.push(
      `Não tenho a alíquota de ITBI de ${cidade} cadastrada — usei ${(ALIQUOTA_ITBI_PADRAO * 100).toFixed(0)}%, que é a mais comum. Confira na prefeitura.`,
    );
  }
  const itbi = entrada.valorImovel * aliquota;

  const premissas = [
    `Taxa de ${(taxaAnual * 100).toFixed(2)}% ao ano${faixa ? ` (${faixa.nome} do MCMV)` : " (SBPE)"}.`,
    `Prazo de ${prazoMeses} meses, tabela Price, parcela fixa.`,
    `Parcela limitada a ${(params.comprometimentoMaximo * 100).toFixed(0)}% da renda.`,
    "Sem seguro, taxa de administração nem custos de cartório na parcela.",
    `Parâmetros conferidos em ${params.conferidoEm}.`,
  ];

  return {
    faixa: faixa?.nome ?? null,
    taxaAnual,
    prazoMeses,
    subsidio,
    parcelaMaxima,
    valorFinanciavel,
    recursosProprios,
    faltam,
    fecha,
    parcelaEstimada,
    itbi,
    premissas,
    avisos,
  };
}
