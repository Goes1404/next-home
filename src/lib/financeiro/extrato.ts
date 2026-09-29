import { centavos, type StatusVenda } from "./venda";
import { diasEntre } from "./periodo";

/**
 * O extrato: o que cada venda vira em dinheiro, para quem, e em que ponto
 * está. Puro — recebe vendas já lidas (com a RLS aplicada) e devolve
 * números. Tela do corretor e do gestor usam a MESMA conta.
 *
 * O dinheiro passa por dois portões, e a tela precisa dizer em qual está:
 *   1. a construtora paga a comissão à imobiliária (`comissaoRecebidaEm`);
 *   2. a imobiliária repassa a parte do corretor (`repassePagoEm`).
 * Venda distratada não gera dinheiro a receber — mas o que já foi pago
 * continua no histórico, porque aconteceu.
 */

export type ParticipanteDoExtrato = {
  corretorId: string;
  nome: string;
  partePercentual: number;
  repasseValor: number;
  repassePagoEm: string | null;
};

export type VendaDoExtrato = {
  id: string;
  imovel: string;
  construtora: string | null;
  unidade: string | null;
  dataVenda: string;
  valorVenda: number;
  comissaoValor: number;
  status: StatusVenda;
  comissaoRecebidaEm: string | null;
  participantes: ParticipanteDoExtrato[];
};

/** Em que ponto está o repasse de UM corretor numa venda. */
export type SituacaoDoRepasse = "pago" | "pode_pagar" | "aguardando_construtora" | "distratada";

export function situacaoDoRepasse(v: VendaDoExtrato, p: ParticipanteDoExtrato): SituacaoDoRepasse {
  if (p.repassePagoEm) return "pago";
  if (v.status === "distratada") return "distratada";
  return v.comissaoRecebidaEm ? "pode_pagar" : "aguardando_construtora";
}

export const ROTULO_SITUACAO: Record<SituacaoDoRepasse, string> = {
  pago: "Pago",
  pode_pagar: "A construtora já pagou: repasse liberado",
  aguardando_construtora: "Aguardando a construtora pagar",
  distratada: "Venda distratada",
};

export type LinhaDoExtrato = {
  vendaId: string;
  imovel: string;
  unidade: string | null;
  dataVenda: string;
  valorVenda: number;
  repasse: number;
  situacao: SituacaoDoRepasse;
  pagoEm: string | null;
};

export type ExtratoDoCorretor = {
  linhas: LinhaDoExtrato[];
  /** Soma dos repasses ainda não pagos, fora os distratos. */
  aReceber: number;
  /** Dos a receber, quanto a construtora já pagou (pode sair hoje). */
  liberado: number;
  recebidoNoAno: number;
  recebidoPorMes: { mes: string; valor: number }[];
};

export function extratoDo(corretorId: string, vendas: VendaDoExtrato[], hoje: string): ExtratoDoCorretor {
  const linhas: LinhaDoExtrato[] = [];
  for (const v of vendas) {
    const p = v.participantes.find((x) => x.corretorId === corretorId);
    if (!p) continue;
    linhas.push({
      vendaId: v.id,
      imovel: v.imovel,
      unidade: v.unidade,
      dataVenda: v.dataVenda,
      valorVenda: v.valorVenda,
      repasse: p.repasseValor,
      situacao: situacaoDoRepasse(v, p),
      pagoEm: p.repassePagoEm,
    });
  }
  linhas.sort((a, b) => b.dataVenda.localeCompare(a.dataVenda));

  const pendentes = linhas.filter((l) => l.situacao === "pode_pagar" || l.situacao === "aguardando_construtora");
  const ano = hoje.slice(0, 4);
  const pagos = linhas.filter((l) => l.pagoEm);
  const porMes = new Map<string, number>();
  for (const l of pagos) {
    if (!l.pagoEm!.startsWith(ano)) continue;
    const mes = l.pagoEm!.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + l.repasse);
  }

  return {
    linhas,
    aReceber: centavos(pendentes.reduce((s, l) => s + l.repasse, 0)),
    liberado: centavos(pendentes.filter((l) => l.situacao === "pode_pagar").reduce((s, l) => s + l.repasse, 0)),
    recebidoNoAno: centavos([...porMes.values()].reduce((s, n) => s + n, 0)),
    recebidoPorMes: [...porMes.entries()].sort().map(([mes, valor]) => ({ mes, valor: centavos(valor) })),
  };
}

/** Quanto o corretor GANHOU (repasse) em vendas com data no intervalo. */
export function repasseDoPeriodo(corretorId: string, vendas: VendaDoExtrato[], inicio: string, fim: string): number {
  let total = 0;
  for (const v of vendas) {
    if (v.status !== "ativa" || v.dataVenda < inicio || v.dataVenda > fim) continue;
    const p = v.participantes.find((x) => x.corretorId === corretorId);
    if (p) total += p.repasseValor;
  }
  return centavos(total);
}

// ─── Visão do gestor ────────────────────────────────────────────────────

export type ComissaoAReceber = {
  construtora: string;
  total: number;
  vendas: { id: string; imovel: string; unidade: string | null; dataVenda: string; valor: number; dias: number }[];
  /** A venda mais antiga ainda sem pagamento, em dias — é o que cobra. */
  maisAntigaDias: number;
};

/**
 * O que as construtoras devem à imobiliária, agrupado por quem paga, com a
 * idade de cada venda. Ordenado pela dívida mais velha: é por ela que se
 * começa a cobrar.
 */
export function aReceberDasConstrutoras(vendas: VendaDoExtrato[], hoje: string): ComissaoAReceber[] {
  const grupos = new Map<string, ComissaoAReceber>();
  for (const v of vendas) {
    if (v.status !== "ativa" || v.comissaoRecebidaEm) continue;
    const chave = v.construtora?.trim() || "Construtora não cadastrada";
    const g = grupos.get(chave) ?? { construtora: chave, total: 0, vendas: [], maisAntigaDias: 0 };
    const dias = Math.max(0, diasEntre(v.dataVenda, hoje));
    g.total = centavos(g.total + v.comissaoValor);
    g.vendas.push({ id: v.id, imovel: v.imovel, unidade: v.unidade, dataVenda: v.dataVenda, valor: v.comissaoValor, dias });
    g.maisAntigaDias = Math.max(g.maisAntigaDias, dias);
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, vendas: g.vendas.sort((a, b) => b.dias - a.dias) }))
    .sort((a, b) => b.maisAntigaDias - a.maisAntigaDias);
}

export type RepasseAPagar = {
  corretorId: string;
  nome: string;
  liberado: number;
  aguardando: number;
  itens: { vendaId: string; imovel: string; unidade: string | null; valor: number; situacao: SituacaoDoRepasse }[];
};

/**
 * Quanto a imobiliária deve a cada corretor. "Liberado" é o que já pode
 * sair (a construtora pagou); "aguardando" é promessa que depende de outra
 * empresa. Misturar os dois faria o gestor pagar dinheiro que não entrou.
 */
export function repassesAPagar(vendas: VendaDoExtrato[]): RepasseAPagar[] {
  const porCorretor = new Map<string, RepasseAPagar>();
  for (const v of vendas) {
    for (const p of v.participantes) {
      const situacao = situacaoDoRepasse(v, p);
      if (situacao !== "pode_pagar" && situacao !== "aguardando_construtora") continue;
      const r = porCorretor.get(p.corretorId) ?? { corretorId: p.corretorId, nome: p.nome, liberado: 0, aguardando: 0, itens: [] };
      if (situacao === "pode_pagar") r.liberado = centavos(r.liberado + p.repasseValor);
      else r.aguardando = centavos(r.aguardando + p.repasseValor);
      r.itens.push({ vendaId: v.id, imovel: v.imovel, unidade: v.unidade, valor: p.repasseValor, situacao });
      porCorretor.set(p.corretorId, r);
    }
  }
  return [...porCorretor.values()].sort((a, b) => b.liberado - a.liberado || b.aguardando - a.aguardando);
}
