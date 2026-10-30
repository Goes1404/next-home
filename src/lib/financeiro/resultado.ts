import {
  movimentosDo,
  ROTULO_CATEGORIA,
  somarMeses,
  type Categoria,
  type LancamentoDoCaixa,
  type Movimento,
  type VendaDoCaixa,
} from "./caixa";
import { centavos } from "./venda";

/**
 * O resultado do mês (DRE) da imobiliária, pelo regime de CAIXA: conta o que
 * de fato entrou e saiu no mês (`pagoEm`), a partir dos mesmos movimentos do
 * caixa. Módulo puro.
 *
 * Por que caixa e não competência: a comissão da construtora chega meses
 * depois da venda, e o dono quer saber se o mês pagou as contas. O que foi
 * VENDIDO no mês já aparece em Vendas e no Desempenho.
 *
 * As linhas seguem a DRE de uma imobiliária:
 *   receita de corretagem (comissões + comissão avulsa)
 *   − repasses aos corretores        = margem de corretagem
 *   − impostos
 *   + outras receitas
 *   − despesas da operação (por categoria)
 *   = resultado
 */

export type LinhaDeDespesa = { categoria: Categoria; rotulo: string; valor: number };

export type ResultadoDoMes = {
  mes: string; // "aaaa-mm"
  comissoes: number;
  comissaoAvulsa: number;
  receitaCorretagem: number;
  repasses: number;
  margemCorretagem: number;
  impostos: number;
  outrasReceitas: number;
  despesas: LinhaDeDespesa[];
  totalDespesas: number;
  resultado: number;
  /** Resultado sobre a receita total (corretagem + outras). `null` sem receita. */
  margem: number | null;
  /** Houve algum movimento pago no mês. */
  temMovimento: boolean;
};

const DO_MES = (m: Movimento, mes: string) => m.pagoEm !== null && m.pagoEm.slice(0, 7) === mes;

export function resultadoDoMes(movimentos: Movimento[], mes: string): ResultadoDoMes {
  let comissoes = 0;
  let comissaoAvulsa = 0;
  let repasses = 0;
  let impostos = 0;
  let outrasReceitas = 0;
  const porCategoria = new Map<Categoria, number>();
  let temMovimento = false;

  for (const m of movimentos) {
    if (!DO_MES(m, mes)) continue;
    temMovimento = true;
    if (m.origem === "comissao") comissoes += m.valor;
    else if (m.origem === "repasse") repasses += m.valor;
    else if (m.tipo === "entrada") {
      if (m.categoria === "comissao_avulsa") comissaoAvulsa += m.valor;
      else outrasReceitas += m.valor;
    } else if (m.categoria === "impostos") impostos += m.valor;
    else {
      const c = m.categoria ?? "outros";
      porCategoria.set(c, (porCategoria.get(c) ?? 0) + m.valor);
    }
  }

  const despesas = [...porCategoria.entries()]
    .map(([categoria, valor]) => ({ categoria, rotulo: ROTULO_CATEGORIA[categoria], valor: centavos(valor) }))
    .sort((a, b) => b.valor - a.valor);
  const totalDespesas = centavos(despesas.reduce((s, d) => s + d.valor, 0));
  const receitaCorretagem = centavos(comissoes + comissaoAvulsa);
  const margemCorretagem = centavos(receitaCorretagem - repasses);
  const resultado = centavos(margemCorretagem - impostos + outrasReceitas - totalDespesas);
  const receitaTotal = receitaCorretagem + outrasReceitas;

  return {
    mes,
    comissoes: centavos(comissoes),
    comissaoAvulsa: centavos(comissaoAvulsa),
    receitaCorretagem,
    repasses: centavos(repasses),
    margemCorretagem,
    impostos: centavos(impostos),
    outrasReceitas: centavos(outrasReceitas),
    despesas,
    totalDespesas,
    resultado,
    margem: receitaTotal > 0 ? resultado / receitaTotal : null,
    temMovimento,
  };
}

/** Os `n` meses que terminam em `ultimoMes`, do mais antigo ao mais novo. */
export function mesesAte(ultimoMes: string, n: number): string[] {
  const base = `${ultimoMes}-01`;
  return Array.from({ length: n }, (_, i) => somarMeses(base, i - (n - 1)).slice(0, 7));
}

/** Soma de vários meses (o acumulado do ano, por exemplo). */
export function somarResultados(lista: ResultadoDoMes[], rotulo: string): ResultadoDoMes {
  const porCategoria = new Map<Categoria, number>();
  for (const r of lista) for (const d of r.despesas) porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + d.valor);
  const soma = (f: (r: ResultadoDoMes) => number) => centavos(lista.reduce((s, r) => s + f(r), 0));
  const despesas = [...porCategoria.entries()]
    .map(([categoria, valor]) => ({ categoria, rotulo: ROTULO_CATEGORIA[categoria], valor: centavos(valor) }))
    .sort((a, b) => b.valor - a.valor);
  const receitaCorretagem = soma((r) => r.receitaCorretagem);
  const outrasReceitas = soma((r) => r.outrasReceitas);
  const resultado = soma((r) => r.resultado);
  return {
    mes: rotulo,
    comissoes: soma((r) => r.comissoes),
    comissaoAvulsa: soma((r) => r.comissaoAvulsa),
    receitaCorretagem,
    repasses: soma((r) => r.repasses),
    margemCorretagem: soma((r) => r.margemCorretagem),
    impostos: soma((r) => r.impostos),
    outrasReceitas,
    despesas,
    totalDespesas: soma((r) => r.totalDespesas),
    resultado,
    margem: receitaCorretagem + outrasReceitas > 0 ? resultado / (receitaCorretagem + outrasReceitas) : null,
    temMovimento: lista.some((r) => r.temMovimento),
  };
}

/**
 * O que a tela lê para mostrar `mes`: doze meses até ele e o ano dele
 * inteiro (o acumulado). `ate` é o primeiro dia do mês seguinte, exclusivo.
 */
export function janelaDoResultado(mes: string): { meses: string[]; desde: string; ate: string } {
  const meses = mesesAte(mes, 12);
  const desde = `${meses[0] < `${mes.slice(0, 4)}-01` ? meses[0] : `${mes.slice(0, 4)}-01`}-01`;
  const ate = `${somarMeses(`${mes}-01`, 1).slice(0, 7)}-01`;
  return { meses, desde, ate };
}

/**
 * Os números da tela Resultado do mês a partir do que ela leu: o mês, o
 * anterior, o acumulado do ano e a série de doze meses. Mora aqui, e não na
 * página, para o número central dizer os MESMOS números ("como fechou o
 * mês?"): duas contas do resultado divergiriam no primeiro centavo.
 */
export function resultadosDoMes(
  lancamentos: LancamentoDoCaixa[],
  vendas: VendaDoCaixa[],
  mes: string,
): { doMes: ResultadoDoMes; anterior: ResultadoDoMes; acumulado: ResultadoDoMes; serie: ResultadoDoMes[] } {
  const { meses, ate } = janelaDoResultado(mes);
  const movimentos = movimentosDo(
    lancamentos.filter((l) => l.pagoEm !== null && l.pagoEm < ate),
    vendas,
  );
  return {
    doMes: resultadoDoMes(movimentos, mes),
    anterior: resultadoDoMes(movimentos, somarMeses(`${mes}-01`, -1).slice(0, 7)),
    acumulado: somarResultados(
      mesesAte(mes, Number(mes.slice(5, 7))).map((m) => resultadoDoMes(movimentos, m)),
      mes.slice(0, 4),
    ),
    serie: meses.map((m) => resultadoDoMes(movimentos, m)),
  };
}

/** Lê `?mes=aaaa-mm`; qualquer coisa fora disso, ou no futuro, vira o mês de hoje. */
export function lerMes(v: string | string[] | undefined, hoje: string): string {
  const s = Array.isArray(v) ? v[0] : v;
  const atual = hoje.slice(0, 7);
  if (!s || !/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return atual;
  return s > atual ? atual : s;
}
