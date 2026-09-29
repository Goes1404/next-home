/**
 * Os motivos do 👎, em um toque (0131).
 *
 * As categorias saíram da análise de 28/09/2026, que leu 17 conversas e
 * agrupou o que dava errado (eval/resultados/taxonomia-2026.09-v40-2026-09-28.md),
 * escritas no vocabulário de quem está atendendo. Módulo puro: a tela do chat
 * (cliente) e o relatório semanal (servidor) leem a MESMA lista, senão o
 * rótulo do botão e o do relatório divergem.
 */

export const MOTIVOS_DA_AVALIACAO = [
  { valor: "nao_respondeu", rotulo: "Não respondeu" },
  { valor: "inventou", rotulo: "Inventou" },
  { valor: "robotico", rotulo: "Robótica" },
  { valor: "insistente", rotulo: "Insistente" },
  { valor: "imovel_errado", rotulo: "Imóvel errado" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export type MotivoDaAvaliacao = (typeof MOTIVOS_DA_AVALIACAO)[number]["valor"];

export function ehMotivoDaAvaliacao(valor: unknown): valor is MotivoDaAvaliacao {
  return MOTIVOS_DA_AVALIACAO.some((m) => m.valor === valor);
}

export function rotuloDoMotivo(valor: MotivoDaAvaliacao | null | undefined): string {
  return MOTIVOS_DA_AVALIACAO.find((m) => m.valor === valor)?.rotulo ?? "Sem motivo";
}
