// Quando a assinatura do Asaas começa, e como o pagamento volta para a
// competência certa (29/10/2026, 0241).
//
// Módulo PURO, testado sem banco nem Asaas.
//
// O webhook registra cada pagamento na competência do MÊS do vencimento
// (`dueDate`) do pagamento. Para isso bater com a conta do painel
// (`cobranca.ts`), a assinatura tem de vencer no mesmo dia que a
// competência:
//
// - grupo em teste grátis: a primeira cobrança vence no fim do teste (a
//   primeira competência do teste vence nesse dia);
// - competência do MÊS ATUAL vencida e não paga: a primeira cobrança vence
//   hoje (o Asaas não aceita vencimento no passado), e o dia do vencimento
//   do grupo passa a ser o de hoje (até 28), senão as próximas faturas do
//   Asaas cairiam em outro dia que o painel;
// - senão: o próximo vencimento do painel (`proximoVencimento`, no dia do
//   vencimento do grupo).
//
// Competências de meses ANTERIORES em aberto não entram na assinatura (o
// Asaas não cobra para trás): voltam em `atrasadasFora` para a tela pedir o
// registro à mão.

import { diaDoVencimentoValido, type SituacaoDaCobranca } from "@/lib/planos/cobranca";

export type InicioDaAssinatura = {
  /** `AAAA-MM-DD`: o `nextDueDate` da assinatura. */
  proximoVencimento: string;
  /** O dia do vencimento novo do grupo (1–28), quando precisa mudar; `null` = mantém. */
  novoDiaDoVencimento: number | null;
  /** Competências (`AAAA-MM-01`) de meses anteriores ainda em aberto. */
  atrasadasFora: string[];
};

export function inicioDaAssinatura(p: {
  situacao: SituacaoDaCobranca;
  /** Hoje em São Paulo, `AAAA-MM-DD`. */
  hoje: string;
  diaDoVencimento: number;
}): InicioDaAssinatura {
  const { situacao, hoje } = p;
  if (situacao.estado === "teste" && situacao.fimDoTeste) {
    return { proximoVencimento: situacao.fimDoTeste, novoDiaDoVencimento: null, atrasadasFora: [] };
  }
  const mesAtual = hoje.slice(0, 7);
  const doMes = situacao.emAberto.find((c) => c.competencia.slice(0, 7) === mesAtual);
  const atrasadasFora = situacao.emAberto.filter((c) => c !== doMes).map((c) => c.competencia);
  if (doMes) {
    const diaDeHoje = diaDoVencimentoValido(Number(hoje.slice(8, 10)));
    return {
      proximoVencimento: hoje,
      novoDiaDoVencimento: diaDeHoje === diaDoVencimentoValido(p.diaDoVencimento) ? null : diaDeHoje,
      atrasadasFora,
    };
  }
  return { proximoVencimento: situacao.proximoVencimento, novoDiaDoVencimento: null, atrasadasFora };
}

/** `2026-11-05` → `2026-11-01`: a competência que o pagamento quita. */
export function competenciaDoVencimento(dueDate: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? `${dueDate.slice(0, 7)}-01` : null;
}
