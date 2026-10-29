import { somarMeses } from "./caixa";
import { centavos, formatarReais } from "./venda";

/**
 * As parcelas da comissão (0232). Módulo puro.
 *
 * A comissão raramente entra de uma vez: o comprador paga o sinal, a
 * construtora paga em parcelas. Cada parcela tem as três datas que a lei
 * separa: a competência é a da venda (`data_venda`), o vencimento é a
 * previsão e o recebimento é o fato, que só o gestor marca.
 *
 * As parcelas são só o que a IMOBILIÁRIA recebe: a parte de quem recebe
 * `direto` do pagador não passa por ela (`valorDaImobiliaria`).
 */

export type Pagador = "construtora" | "comprador";
export type FormaRecebimento = "repasse" | "direto";

export type Parcela = {
  id: string;
  numero: number;
  valor: number;
  pagador: Pagador;
  venceEm: string | null;
  recebidaEm: string | null;
  /** Cancelada por distrato (data do distrato). Nunca junto com `recebidaEm`. */
  canceladaEm: string | null;
};

export type ParcelaNova = Omit<Parcela, "id" | "recebidaEm" | "canceladaEm">;

export type SituacaoDaParcela = "recebida" | "cancelada" | "atrasada" | "prevista" | "sem_data";

export const MAX_PARCELAS = 24;

export const ROTULO_PAGADOR: Record<Pagador, string> = {
  construtora: "Construtora",
  comprador: "Comprador",
};

/** O que passa pela imobiliária: a comissão menos as partes pagas direto aos corretores. */
export function valorDaImobiliaria(
  comissaoValor: number,
  participantes: { formaRecebimento: FormaRecebimento; repasseValor: number }[],
): number {
  const direto = participantes.reduce((s, p) => s + (p.formaRecebimento === "direto" ? p.repasseValor : 0), 0);
  return centavos(comissaoValor - direto);
}

/** Divide em `n` parcelas mensais; o resto dos centavos vai na primeira. */
export function dividirEmParcelas(total: number, n: number, primeiroVencimento: string | null, pagador: Pagador): ParcelaNova[] {
  const base = Math.floor((total * 100) / n) / 100;
  const resto = centavos(total - base * n);
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    valor: centavos(i === 0 ? base + resto : base),
    pagador,
    venceEm: primeiroVencimento ? somarMeses(primeiroVencimento, i, Number(primeiroVencimento.slice(8, 10))) : null,
  }));
}

export function validarParcelas(parcelas: { valor: number }[], esperado: number): string[] {
  const erros: string[] = [];
  if (parcelas.length === 0) erros.push("Informe ao menos uma parcela.");
  if (parcelas.length > MAX_PARCELAS) erros.push(`No máximo ${MAX_PARCELAS} parcelas.`);
  if (parcelas.some((p) => !(p.valor > 0))) erros.push("Toda parcela precisa de valor.");
  const soma = centavos(parcelas.reduce((s, p) => s + p.valor, 0));
  if (parcelas.length > 0 && Math.abs(soma - esperado) > 0.01 + 1e-9) {
    erros.push(`As parcelas somam ${formatarReais(soma)}, mas a imobiliária recebe ${formatarReais(esperado)}.`);
  }
  return erros;
}

export function situacaoDaParcela(p: Parcela, hoje: string): SituacaoDaParcela {
  if (p.recebidaEm) return "recebida";
  if (p.canceladaEm) return "cancelada";
  if (!p.venceEm) return "sem_data";
  return p.venceEm < hoje ? "atrasada" : "prevista";
}

export function somaDas(parcelas: Parcela[], filtro: "todas" | "recebidas" | "abertas" | "nao_canceladas"): number {
  const entra = (p: Parcela) =>
    filtro === "todas" ||
    (filtro === "recebidas" && !!p.recebidaEm) ||
    (filtro === "abertas" && !p.recebidaEm && !p.canceladaEm) ||
    (filtro === "nao_canceladas" && !p.canceladaEm);
  return centavos(parcelas.reduce((s, p) => s + (entra(p) ? p.valor : 0), 0));
}

const proporcao = (repasse: number, parte: number, todas: number) => (todas > 0 ? centavos((repasse * parte) / todas) : 0);

/** O que a imobiliária ainda deve ao corretor: o cancelado por distrato sai na mesma proporção. */
export function repasseDevido(repasseValor: number, parcelas: Parcela[]): number {
  return proporcao(repasseValor, somaDas(parcelas, "nao_canceladas"), somaDas(parcelas, "todas"));
}

/** O que já pode ser pago ao corretor: a proporção do que a imobiliária recebeu. */
export function repasseLiberado(repasseValor: number, parcelas: Parcela[]): number {
  return proporcao(repasseValor, somaDas(parcelas, "recebidas"), somaDas(parcelas, "todas"));
}

/**
 * O repasse em aberto distribuído pelas parcelas, para o fluxo de caixa: cada
 * parcela não cancelada leva a sua fatia na mesma data. O resto dos centavos
 * vai na última, e a soma é sempre `repasseDevido`.
 */
export function fatiasDoRepasse(repasseValor: number, parcelas: Parcela[]): { parcelaId: string; valor: number; data: string | null }[] {
  const vivas = [...parcelas].filter((p) => !p.canceladaEm).sort((a, b) => a.numero - b.numero);
  const todas = somaDas(parcelas, "todas");
  const devido = repasseDevido(repasseValor, parcelas);
  let acumulado = 0;
  return vivas.map((p, i) => {
    const valor = i === vivas.length - 1 ? centavos(devido - acumulado) : proporcao(repasseValor, p.valor, todas);
    acumulado = centavos(acumulado + valor);
    return { parcelaId: p.id, valor, data: p.recebidaEm ?? p.venceEm };
  });
}
