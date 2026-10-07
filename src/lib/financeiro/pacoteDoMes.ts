import type { Planilha } from "@/lib/imoveis/xlsxEscrita";
import { ROTULO_CATEGORIA, type Movimento } from "./caixa";
import { totalDeImpostos, type ConfigFiscal, type DadosFiscaisDaVenda, type LinhaDeImposto, type VendaParaFiscal } from "./fiscal";
import { planilhaDeImpostos, planilhaDeNotas, planilhaDeRpa, type LinhaDeRpa } from "./fiscalPlanilhas";
import type { ResultadoDoMes } from "./resultado";
import { centavos } from "./venda";

/**
 * O pacote do mês para o contador (0168): um arquivo .xlsx com uma aba por
 * assunto, montado dos mesmos números das telas Caixa, Resultado e Fiscal.
 * Módulo puro: recebe os dados prontos e devolve as abas.
 */

export type EntradaDoPacote = {
  mes: string; // "aaaa-mm"
  resultado: ResultadoDoMes;
  movimentos: Movimento[];
  impostos: LinhaDeImposto[];
  impostosPagos: number;
  receita: number;
  config: ConfigFiscal;
  rpas: LinhaDeRpa[];
  /** Vendas cuja comissão entrou no mês. */
  comissoesDoMes: VendaParaFiscal[];
  dados: Map<string, DadosFiscaisDaVenda>;
};

/** O que fica gravado em `meses_fechados.totais`. */
export type TotaisDoMes = {
  receita: number;
  repasses: number;
  despesas: number;
  impostosPagos: number;
  impostosEstimados: number;
  resultado: number;
  movimentos: number;
  semNota: number;
};

export function totaisDoMes(e: EntradaDoPacote): TotaisDoMes {
  const r = e.resultado;
  return {
    receita: centavos(r.receitaCorretagem + r.outrasReceitas),
    repasses: r.repasses,
    despesas: r.totalDespesas,
    impostosPagos: r.impostos,
    impostosEstimados: totalDeImpostos(e.impostos),
    resultado: r.resultado,
    movimentos: e.movimentos.length,
    semNota: e.comissoesDoMes.filter((v) => !e.dados.get(v.id)?.notaNumero).length,
  };
}

const ORIGEM: Record<Movimento["origem"], string> = {
  lancamento: "Conta do caixa",
  comissao: "Comissão de venda",
  repasse: "Repasse a corretor",
};

function planilhaDoResumo(e: EntradaDoPacote): Planilha {
  const r = e.resultado;
  const linhas: [string, number | null][] = [
    ["Receita de corretagem", r.receitaCorretagem],
    ["  Comissões das construtoras", r.comissoes],
    ["  Comissão avulsa", r.comissaoAvulsa],
    ["(−) Repasses aos corretores", r.repasses],
    ["= Margem de corretagem", r.margemCorretagem],
    ["(−) Impostos e taxas pagos", r.impostos],
    ["(+) Outras receitas", r.outrasReceitas],
    ["(−) Despesas da operação", r.totalDespesas],
    ...r.despesas.map((d): [string, number] => [`  ${d.rotulo}`, d.valor]),
    ["= Resultado do mês", r.resultado],
    ["Impostos estimados sobre a receita", totalDeImpostos(e.impostos)],
  ];
  return {
    aba: `Resumo ${e.mes}`,
    colunas: [
      { titulo: "Linha", largura: 40 },
      { titulo: "Valor (R$)", largura: 16 },
    ],
    linhas: linhas.map(([rotulo, valor]) => [rotulo, valor]),
  };
}

function planilhaDosMovimentos(e: EntradaDoPacote): Planilha {
  const ordenados = [...e.movimentos].sort((a, b) => (a.pagoEm ?? "").localeCompare(b.pagoEm ?? ""));
  return {
    aba: "Entradas e saídas",
    colunas: [
      { titulo: "Data", largura: 12 },
      { titulo: "Tipo", largura: 10 },
      { titulo: "Origem", largura: 20 },
      { titulo: "Categoria", largura: 22 },
      { titulo: "Descrição", largura: 44, quebra: true },
      { titulo: "Valor (R$)", largura: 14 },
    ],
    linhas: ordenados.map((m) => [
      m.pagoEm ?? "",
      m.tipo === "entrada" ? "Entrada" : "Saída",
      ORIGEM[m.origem],
      m.categoria ? ROTULO_CATEGORIA[m.categoria] : "",
      [m.descricao, m.detalhe].filter(Boolean).join(" · "),
      m.tipo === "entrada" ? m.valor : -m.valor,
    ]),
  };
}

export function abasDoPacote(e: EntradaDoPacote): Planilha[] {
  return [
    planilhaDoResumo(e),
    planilhaDosMovimentos(e),
    planilhaDeImpostos(e.mes, e.receita, e.impostos, e.config, e.impostosPagos),
    planilhaDeRpa(e.mes, e.rpas),
    { ...planilhaDeNotas(e.comissoesDoMes, e.dados), aba: `Notas ${e.mes}` },
  ];
}
