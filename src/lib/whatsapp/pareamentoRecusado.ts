/**
 * O WhatsApp recusou o aparelho durante o pareamento (27/10/2026).
 *
 * O Ramos digitou o código cinco vezes e o celular respondeu "Não foi possível
 * conectar o dispositivo"; a tela seguia em "aguardando" por 2 minutos, sem
 * dizer nada. A recusa chega ao nosso banco como queda 401/403 da instância
 * (`motivo_queda_codigo`), depois do instante em que o código foi pedido.
 */

/**
 * O que a tela mostra quando o WhatsApp recusa o aparelho durante o
 * pareamento (401/403 depois do pedido de código). Sem isto ela ficava 2
 * minutos em "aguardando" e o corretor só via o erro no celular.
 */
export const FRASE_RECUSADO_PELO_WHATSAPP =
  "O WhatsApp recusou a conexão deste aparelho. Peça um código novo e digite em até 1 minuto, no WhatsApp do mesmo número que está no campo. Se recusar de novo, conecte pelo QR Code (abra o painel num computador e leia com o celular) ou espere algumas horas: depois de uma restrição, o WhatsApp pode bloquear aparelhos novos por um tempo.";

/** Códigos de queda que, durante um pareamento, são o WhatsApp recusando o aparelho. */
const CODIGOS_DE_RECUSA = new Set([401, 403]);

/**
 * Folga depois de o código aparecer na tela. Recomeçar a instância (apagar e
 * recriar) pode gerar uma queda própria logo em seguida; a recusa de verdade
 * só acontece quando o corretor digita o código no celular, bem depois.
 */
export const FOLGA_DEPOIS_DO_CODIGO_MS = 5_000;

/** A queda registrada depois de o código aparecer na tela é recusa do aparelho? */
export function pareamentoRecusado(p: {
  pedidoEm: string | null | undefined;
  quedaCodigo: number | null | undefined;
  quedaEm: string | null | undefined;
}): boolean {
  if (!p.pedidoEm || !p.quedaEm || p.quedaCodigo == null) return false;
  if (!CODIGOS_DE_RECUSA.has(p.quedaCodigo)) return false;
  const pedido = new Date(p.pedidoEm).getTime();
  const queda = new Date(p.quedaEm).getTime();
  return Number.isFinite(pedido) && Number.isFinite(queda) && queda >= pedido + FOLGA_DEPOIS_DO_CODIGO_MS;
}
