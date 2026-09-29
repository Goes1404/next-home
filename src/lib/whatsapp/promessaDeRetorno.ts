/**
 * A IA prometeu que o CORRETOR vai trazer uma resposta.
 *
 * Mesma família de `pedidoDeLigacao.ts`. O prompt manda a assistente dizer
 * "confirmo com o corretor e te trago" quando o dado não está na ficha
 * (metragem, data de entrega, desconto), e isso é o certo: é melhor que
 * inventar. Só que ninguém avisava o corretor. No eval de conversa de
 * 28/09/2026 ela prometeu isso em 7 das 12 conversas, algumas vezes três
 * vezes seguidas, e o cliente ficou esperando uma resposta que ninguém
 * sabia que devia dar. Promessa sem ninguém do outro lado vira mentira.
 *
 * A detecção mora em código pelo mesmo motivo da ligação: depender de o
 * modelo marcar `transferirHumano` é depender da sorte.
 *
 * Módulo puro: sem rede, sem banco, testável.
 */

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Verbo de "vou trazer a resposta" perto de "corretor", em qualquer ordem. */
const PROMESSA: RegExp[] = [
  /\b(confirmo|confirmar|vou confirmar|vou checar|vou verificar|vou perguntar|vou pedir|ja pedi|pedi)\b.{0,40}\bcorretor/,
  /\bcorretor\b.{0,40}\b(me confirmar|me passar|confirmar|te retorn|te trago|te passo|te mando)/,
  /\bassim que o corretor\b/,
];

export function iaPrometeuRetorno(textoDaIA: string): boolean {
  const t = normalizar(textoDaIA ?? "");
  if (!t.includes("corretor")) return false;
  return PROMESSA.some((p) => p.test(t));
}
