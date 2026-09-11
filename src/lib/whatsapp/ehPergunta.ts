import { normalizar } from "./normalizarFala";

/**
 * A fala do cliente é uma PERGUNTA — e com que força?
 *
 * Existe para a jogada `responder_pergunta_aberta`: quando o planner não
 * soube classificar a fala, responder o que ele perguntou é o certo, e
 * avançar o funil é trocar de assunto na cara de quem perguntou — a queixa
 * "muda de assunto sozinha" (11/09/2026).
 *
 * ## Por que FORTE e FRACA, e não um booleano
 *
 * A primeira versão devolvia `true`/`false` e roubou do funil uma fala que
 * era RESPOSTA: "pode ser na planta" tem `pode`, e virou pergunta — o que
 * travava a qualificação no lugar (o teste do trace cooperativo pegou).
 *
 * Mas exigir interrogativo forte perderia "me manda a planta", que é
 * pergunta para todos os efeitos. As duas coisas convivem assim:
 *
 * - **forte** (`qual`, `onde`, `quanto`, `como`, `quem`, ou "?"): é pergunta
 *   sempre, mesmo que a fala também toque num assunto do funil — "fica onde
 *   o condomínio" cita o imóvel e continua sendo uma pergunta.
 * - **fraca** (`tem`, `pode`, `aceita`, ou um pedido): é pergunta só quando
 *   a fala NÃO responde nenhum assunto do funil. Quem decide isso é o
 *   planner, que já sabe o que a fala respondeu.
 *
 * ## O que a régua não pode fazer
 *
 * Depender da ORDEM das palavras. "onde fica" e "fica onde" são a mesma
 * pergunta, e foi exatamente essa diferença que fez a IA ignorar um cliente
 * em 10/09 — o regex de endereço conhecia uma e não a outra.
 */

export type ForcaDaPergunta = "forte" | "fraca" | "nao";

/** Interrogativo que não deixa dúvida, em qualquer posição da frase. */
const FORTE =
  /(^|\s)(qual|quais|quanto|quantos|quantas|como|onde|quando|porque|por que|pq|quem)($|\s)/;

/**
 * Forma de perguntar sem interrogativo — comum no WhatsApp, e ambígua.
 *
 * `pode` e `tem` abrem tanto pergunta ("tem vaga", "pode ser amanhã?")
 * quanto RESPOSTA ("pode ser na planta"). Por isso são fracas.
 */
const FRACA =
  /(^|\s)(tem|teria|da pra|pode|poderia|posso|aceita|aceitam|sera|seria|fica|ficam|existe|existem|cabe|inclui)($|\s)/;

/** Pedido: não é interrogativo, mas espera resposta do mesmo jeito. */
const PEDIDO =
  /(^|\s)(me (manda|mande|envia|envie|passa|passe|diz|fala)|manda (a|o|as|os|pra mim)|queria saber|gostaria de saber|preciso saber|quero saber|me ajuda)($|\s)/;

export function forcaDaPergunta(texto: string): ForcaDaPergunta {
  // A interrogação é lida no texto CRU: `normalizar` não mexe em pontuação
  // hoje, mas depender disso seria depender de um detalhe de outro módulo.
  if (texto.includes("?")) return "forte";
  const t = normalizar(texto);
  if (FORTE.test(t)) return "forte";
  if (PEDIDO.test(t) || FRACA.test(t)) return "fraca";
  return "nao";
}

/** Conveniência para quem não precisa da distinção. */
export function ehPergunta(texto: string): boolean {
  return forcaDaPergunta(texto) !== "nao";
}
