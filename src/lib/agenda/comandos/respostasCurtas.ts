import { normalizar } from "./normalizar";

export type RespostaCurta = { tipo: "sim" } | { tipo: "nao" } | { tipo: "numero"; n: number };

const SIM = new Set(["sim", "s", "ss", "confirmo", "isso", "ok", "pode"]);
const NAO = new Set(["nao", "n", "cancela", "cancelar"]);

/**
 * A resposta do corretor a "Confirma? (sim/não)" ou a "Responda com o
 * número", lida sem IA.
 *
 * Só a palavra (ou o número) sozinha conta. "sim, mas muda pra 11h" NÃO é
 * sim: é um pedido novo, e confirmar o antigo em cima dele marcaria a hora
 * errada. Nesses casos `null`, e quem chama trata a mensagem como pedido.
 */
export function lerRespostaCurta(texto: string): RespostaCurta | null {
  const limpo = normalizar(texto);
  if (SIM.has(limpo)) return { tipo: "sim" };
  if (NAO.has(limpo)) return { tipo: "nao" };

  // Só "3", "3)" ou "3." — como o corretor responde a uma lista numerada.
  const numero = /^([1-9])\s*[).]?$/.exec(texto.trim());
  return numero ? { tipo: "numero", n: Number(numero[1]) } : null;
}
