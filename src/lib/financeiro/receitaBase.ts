import type { RegimeApuracao } from "./fiscal";
import { valorDaImobiliaria, type FormaRecebimento, type Parcela } from "./parcelas";
import { centavos } from "./venda";

/**
 * A receita sobre a qual o imposto do mês é estimado (0232). Módulo puro.
 *
 * Simples e presumido apuram, por padrão, por COMPETÊNCIA: a comissão conta
 * no mês da venda (assinatura), recebida ou não. Só quem optou pelo regime
 * de CAIXA conta no mês em que o dinheiro entrou.
 *
 * A base é o que a imobiliária fatura: a comissão inteira, inclusive o que
 * ela repassa aos corretores (o repasse é despesa, não sai da receita bruta);
 * só a parte de quem recebe `direto` do pagador fica de fora.
 *
 * Distrato na competência: o mês da venda NÃO muda (o fato aconteceu e o mês
 * pode já ter ido para o contador). As parcelas canceladas viram um ajuste
 * negativo no mês do distrato.
 */

export type VendaParaReceita = {
  id: string;
  status: "ativa" | "distratada";
  dataVenda: string;
  comissaoValor: number;
  participantes: { formaRecebimento: FormaRecebimento; repasseValor: number }[];
  parcelas: Parcela[];
};

/** Lançamento `comissao_avulsa` do caixa. `competencia` = "aaaa-mm-01". */
export type AvulsaParaReceita = { valor: number; competencia: string; pagoEm: string | null };

export type ReceitaBase = {
  comissoes: number;
  avulsas: number;
  /** Negativo: parcelas canceladas por distrato no mês (só na competência). */
  ajustesDeDistrato: number;
  total: number;
  regime: RegimeApuracao;
};

const doMes = (iso: string | null, mes: string) => iso !== null && iso.slice(0, 7) === mes;

export function receitaBaseDoMes(
  vendas: VendaParaReceita[],
  avulsas: AvulsaParaReceita[],
  mes: string,
  regime: RegimeApuracao,
): ReceitaBase {
  let comissoes = 0;
  let ajustes = 0;
  for (const v of vendas) {
    if (regime === "competencia") {
      if (doMes(v.dataVenda, mes)) comissoes += valorDaImobiliaria(v.comissaoValor, v.participantes);
      for (const p of v.parcelas) if (doMes(p.canceladaEm, mes)) ajustes -= p.valor;
    } else {
      for (const p of v.parcelas) if (doMes(p.recebidaEm, mes)) comissoes += p.valor;
    }
  }
  const somaAvulsas = avulsas.reduce(
    (s, a) => s + ((regime === "competencia" ? doMes(a.competencia, mes) : doMes(a.pagoEm, mes)) ? a.valor : 0),
    0,
  );
  return {
    comissoes: centavos(comissoes),
    avulsas: centavos(somaAvulsas),
    ajustesDeDistrato: centavos(ajustes),
    total: centavos(comissoes + somaAvulsas + ajustes),
    regime,
  };
}
