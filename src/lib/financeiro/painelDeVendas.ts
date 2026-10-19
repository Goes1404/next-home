import { centavos, vgvCreditado, type StatusVenda } from "./venda";

/**
 * Os números e gráficos da tela de Vendas (07/10/2026), em função pura.
 *
 * Mesma régua do topo da tela: para o corretor conta a PARTE dele de cada
 * venda (numa venda meio a meio, metade do VGV; a comissão é o repasse dele);
 * para o gestor, a equipe inteira (o VGV todo e a comissão da imobiliária).
 * Venda distratada não entra em nada, como no ranking.
 */

export type VendaDoPainel = {
  dataVenda: string;
  valorVenda: number;
  comissaoValor: number;
  status: StatusVenda;
  comissaoRecebidaEm: string | null;
  imovel: string;
  participantes: {
    corretorId: string;
    partePercentual: number;
    repasseValor: number;
    repassePagoEm: string | null;
  }[];
};

export type MesDoPainel = { mes: string; rotulo: string; vgv: number; vendas: number };

export type PainelDeVendas = {
  vgvMes: number;
  vgvMesAnterior: number;
  /** Variação do mês contra o anterior, em %; null sem base de comparação. */
  variacaoMes: number | null;
  vgvAno: number;
  vendasMes: number;
  vendasAno: number;
  /** VGV médio por venda nos últimos 12 meses; null sem venda. */
  ticketMedio: number | null;
  meses: MesDoPainel[];
  /**
   * A comissão em três estados. Para o corretor: recebida (o repasse foi
   * pago), liberada (a construtora pagou e o repasse ainda não) e aguardando
   * a construtora. Para o gestor: a comissão da imobiliária, recebida ou
   * aguardando (liberada fica em zero).
   */
  comissao: { recebida: number; liberada: number; aguardando: number };
  porImovel: { imovel: string; vgv: number; vendas: number }[];
};

export const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "aaaa-mm" do mês `deslocamento` meses antes do mês de `hoje`. */
export function mesAntes(hoje: string, deslocamento: number): string {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7)) - 1 - deslocamento;
  const a = ano + Math.floor(mes / 12);
  const m = ((mes % 12) + 12) % 12;
  return `${a}-${String(m + 1).padStart(2, "0")}`;
}

export function montarPainelDeVendas(
  vendas: VendaDoPainel[],
  opcoes: { corretorId: string | null; hoje: string; meses?: number; tetoImoveis?: number },
): PainelDeVendas {
  const { corretorId, hoje } = opcoes;
  const quantosMeses = opcoes.meses ?? 6;
  const teto = opcoes.tetoImoveis ?? 5;

  const ativas = vendas.filter((v) => v.status === "ativa");
  const minhaParte = (v: VendaDoPainel) => {
    if (corretorId === null) return 100;
    return v.participantes.filter((p) => p.corretorId === corretorId).reduce((s, p) => s + p.partePercentual, 0);
  };
  const vgvDe = (v: VendaDoPainel) => vgvCreditado(v, minhaParte(v));
  const contadas = ativas.filter((v) => minhaParte(v) > 0);

  const mesAtual = hoje.slice(0, 7);
  const mesPassado = mesAntes(hoje, 1);
  const ano = hoje.slice(0, 4);
  const doMes = (mes: string) => contadas.filter((v) => v.dataVenda.slice(0, 7) === mes);
  const soma = (lista: VendaDoPainel[]) => centavos(lista.reduce((s, v) => s + vgvDe(v), 0));

  const vgvMes = soma(doMes(mesAtual));
  const vgvMesAnterior = soma(doMes(mesPassado));
  const variacaoMes = vgvMesAnterior > 0 ? Math.round(((vgvMes - vgvMesAnterior) / vgvMesAnterior) * 100) : null;
  const doAno = contadas.filter((v) => v.dataVenda.slice(0, 4) === ano);

  const inicio12 = mesAntes(hoje, 11);
  const ultimos12 = contadas.filter((v) => v.dataVenda.slice(0, 7) >= inicio12);
  const ticketMedio = ultimos12.length ? Math.round(soma(ultimos12) / ultimos12.length) : null;

  const meses: MesDoPainel[] = [];
  for (let d = quantosMeses - 1; d >= 0; d--) {
    const mes = mesAntes(hoje, d);
    const lista = doMes(mes);
    meses.push({ mes, rotulo: NOMES_MES[Number(mes.slice(5, 7)) - 1], vgv: soma(lista), vendas: lista.length });
  }

  const comissao = { recebida: 0, liberada: 0, aguardando: 0 };
  for (const v of contadas) {
    if (corretorId === null) {
      if (v.comissaoRecebidaEm) comissao.recebida += v.comissaoValor;
      else comissao.aguardando += v.comissaoValor;
      continue;
    }
    for (const p of v.participantes.filter((x) => x.corretorId === corretorId)) {
      if (p.repassePagoEm) comissao.recebida += p.repasseValor;
      else if (v.comissaoRecebidaEm) comissao.liberada += p.repasseValor;
      else comissao.aguardando += p.repasseValor;
    }
  }
  comissao.recebida = centavos(comissao.recebida);
  comissao.liberada = centavos(comissao.liberada);
  comissao.aguardando = centavos(comissao.aguardando);

  const imoveis = new Map<string, { vgv: number; vendas: number }>();
  for (const v of ultimos12) {
    const atual = imoveis.get(v.imovel) ?? { vgv: 0, vendas: 0 };
    imoveis.set(v.imovel, { vgv: atual.vgv + vgvDe(v), vendas: atual.vendas + 1 });
  }
  const porImovel = [...imoveis.entries()]
    .map(([imovel, x]) => ({ imovel, vgv: centavos(x.vgv), vendas: x.vendas }))
    .sort((a, b) => b.vgv - a.vgv || a.imovel.localeCompare(b.imovel))
    .slice(0, teto);

  return {
    vgvMes,
    vgvMesAnterior,
    variacaoMes,
    vgvAno: soma(doAno),
    vendasMes: doMes(mesAtual).length,
    vendasAno: doAno.length,
    ticketMedio,
    meses,
    comissao,
    porImovel,
  };
}

/** Valor curto para rótulo de gráfico: "R$ 1,2 mi", "R$ 480 mil", "R$ 900". */
export function reaisCurto(n: number): string {
  const fmt = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (Math.abs(n) >= 1_000_000) return `R$ ${fmt(n / 1_000_000)} mi`;
  if (Math.abs(n) >= 1_000) return `R$ ${fmt(Math.round(n / 100) / 10)} mil`;
  return `R$ ${Math.round(n)}`;
}
