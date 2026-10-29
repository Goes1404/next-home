import { repasseDevido, repasseLiberado, somaDas, type FormaRecebimento, type Parcela } from "./parcelas";
import { centavos, type StatusVenda } from "./venda";
import { diasEntre } from "./periodo";

/**
 * O extrato: o que cada venda vira em dinheiro, para quem, e em que ponto
 * está. Puro — recebe vendas já lidas (com a RLS aplicada) e devolve
 * números. Tela do corretor e do gestor usam a MESMA conta.
 *
 * O dinheiro passa por dois portões, e a tela precisa dizer em qual está:
 *   1. a construtora (ou o comprador) paga cada parcela à imobiliária
 *      (`parcelas[].recebidaEm`, 0232);
 *   2. a imobiliária repassa a parte do corretor (`repassePagoEm`).
 * O repasse é liberado na proporção do que já entrou, e o distrato que
 * cancela parcelas reduz o devido na mesma proporção. O que já foi pago
 * continua no histórico, porque aconteceu. Quem recebe `direto` do pagador
 * não tem repasse a receber da imobiliária.
 */

export type ParticipanteDoExtrato = {
  corretorId: string;
  nome: string;
  partePercentual: number;
  repasseValor: number;
  repassePagoEm: string | null;
  formaRecebimento: FormaRecebimento;
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
  parcelas: Parcela[];
  participantes: ParticipanteDoExtrato[];
};

/** Em que ponto está o repasse de UM corretor numa venda. */
export type SituacaoDoRepasse =
  | "pago"
  | "pode_pagar"
  | "parcial"
  | "aguardando_construtora"
  | "distratada"
  | "recebe_direto";

/** Situações em que a imobiliária ainda deve algo ao corretor. */
const PENDENTE: SituacaoDoRepasse[] = ["pode_pagar", "parcial", "aguardando_construtora"];

export function situacaoDoRepasse(v: VendaDoExtrato, p: ParticipanteDoExtrato): SituacaoDoRepasse {
  if (p.repassePagoEm) return "pago";
  if (p.formaRecebimento === "direto") return "recebe_direto";
  const devido = repasseDevido(p.repasseValor, v.parcelas);
  if (devido <= 0) return v.status === "distratada" ? "distratada" : "aguardando_construtora";
  const liberado = repasseLiberado(p.repasseValor, v.parcelas);
  if (liberado >= devido) return "pode_pagar";
  return liberado > 0 ? "parcial" : "aguardando_construtora";
}

/** O que o corretor tem de repasse nesta venda: o pago, ou o ainda devido. */
const repasseDaLinha = (v: VendaDoExtrato, p: ParticipanteDoExtrato) =>
  p.repassePagoEm ? p.repasseValor : p.formaRecebimento === "direto" ? 0 : repasseDevido(p.repasseValor, v.parcelas);

export const ROTULO_SITUACAO: Record<SituacaoDoRepasse, string> = {
  pago: "Pago",
  pode_pagar: "A construtora já pagou: repasse liberado",
  parcial: "Parte da comissão entrou: repasse liberado em parte",
  recebe_direto: "Recebe direto de quem paga",
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
  /** Quanto do repasse já pode sair (proporcional ao que a imobiliária recebeu). */
  liberado: number;
  situacao: SituacaoDoRepasse;
  pagoEm: string | null;
};

export type ExtratoDoCorretor = {
  linhas: LinhaDoExtrato[];
  /** Soma dos repasses ainda não pagos, fora os distratos. */
  aReceber: number;
  /** Dos a receber, quanto já entrou na imobiliária (pode sair hoje). */
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
      repasse: repasseDaLinha(v, p),
      liberado: p.repassePagoEm ? 0 : repasseLiberado(p.repasseValor, v.parcelas),
      situacao: situacaoDoRepasse(v, p),
      pagoEm: p.repassePagoEm,
    });
  }
  linhas.sort((a, b) => b.dataVenda.localeCompare(a.dataVenda));

  const pendentes = linhas.filter((l) => PENDENTE.includes(l.situacao));
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
    liberado: centavos(pendentes.reduce((s, l) => s + l.liberado, 0)),
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
    // Distrato que manteve as parcelas continua devido pela construtora.
    const aberto = somaDas(v.parcelas, "abertas");
    if (aberto <= 0) continue;
    const chave = v.construtora?.trim() || "Construtora não cadastrada";
    const g = grupos.get(chave) ?? { construtora: chave, total: 0, vendas: [], maisAntigaDias: 0 };
    const dias = Math.max(0, diasEntre(v.dataVenda, hoje));
    g.total = centavos(g.total + aberto);
    g.vendas.push({ id: v.id, imovel: v.imovel, unidade: v.unidade, dataVenda: v.dataVenda, valor: aberto, dias });
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
      if (!PENDENTE.includes(situacao)) continue;
      const r = porCorretor.get(p.corretorId) ?? { corretorId: p.corretorId, nome: p.nome, liberado: 0, aguardando: 0, itens: [] };
      const devido = repasseDevido(p.repasseValor, v.parcelas);
      const liberado = Math.min(devido, repasseLiberado(p.repasseValor, v.parcelas));
      r.liberado = centavos(r.liberado + liberado);
      r.aguardando = centavos(r.aguardando + devido - liberado);
      r.itens.push({ vendaId: v.id, imovel: v.imovel, unidade: v.unidade, valor: devido, situacao });
      porCorretor.set(p.corretorId, r);
    }
  }
  return [...porCorretor.values()].sort((a, b) => b.liberado - a.liberado || b.aguardando - a.aguardando);
}
