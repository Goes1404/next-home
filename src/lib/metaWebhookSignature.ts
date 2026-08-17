import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIXO = "sha256=";

/**
 * Confere o header `X-Hub-Signature-256` que a Meta manda em todo webhook.
 *
 * Compara com `timingSafeEqual`, e não `===`: comparar segredo por igualdade
 * simples vaza, por tempo de resposta, quantos bytes iniciais bateram — o
 * tipo de brecha que um HMAC existe justamente para fechar.
 */
export function assinaturaValida(
  corpoBruto: string,
  headerAssinatura: string | null,
  appSecret: string,
): boolean {
  if (!headerAssinatura?.startsWith(PREFIXO)) return false;

  const recebida = Buffer.from(headerAssinatura.slice(PREFIXO.length), "hex");
  const esperada = Buffer.from(
    createHmac("sha256", appSecret).update(corpoBruto).digest("hex"),
    "hex",
  );

  if (recebida.length !== esperada.length) return false;
  return timingSafeEqual(recebida, esperada);
}
