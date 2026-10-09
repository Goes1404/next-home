/**
 * O envio falhou porque a SESSÃO do WhatsApp caiu (08/10/2026).
 *
 * Medido no número da Márcia: às 9h, quatro envios da lista voltaram com
 * `HTTP 500 ... Connection Closed`, o disjuntor abriu por 12 horas, e o
 * painel seguiu dizendo "conectado" e "volta sozinho às 21h". Não voltaria:
 * a sessão tinha caído, e sem reconectar nada sai.
 *
 * "Connection Closed" é o Baileys (por baixo da Evolution) dizendo que a
 * ligação com o WhatsApp está fechada. A mensagem não saiu, e a culpa não é
 * do lead nem do texto. Por isso:
 *
 * - o item não gasta tentativa e a cota volta: nada foi enviado;
 * - a falha conta para o disjuntor: provedor doente não pode ser martelado;
 * - a fila guarda o motivo (`MOTIVO_SESSAO_CAIU`), e é dele que a faixa do
 *   painel e a tela de listas tiram o pedido de reconectar;
 * - quando o número reconecta (ou um envio volta a dar certo), a marca sai e
 *   a pausa que essas falhas abriram cai junto (`liberarFilaDaSessao`): a
 *   causa foi resolvida, e esperar as 12 horas seria castigar o número por
 *   um problema que já não existe.
 *
 * Sem coluna nova de propósito: a marca na fila basta para as três leituras,
 * e não depende de migration para valer.
 *
 * Mora fora de `listaDeTransmissao.ts` porque aquele módulo vai para o
 * navegador na tela de listas, e este só o servidor usa.
 */
export const MOTIVO_SESSAO_CAIU =
  "A conexão do WhatsApp caiu antes de enviar. A mensagem sai quando o número reconectar.";

export function ehFalhaDeSessao(detalhe: string | null | undefined): boolean {
  return /\bconnection (closed|lost|terminated)\b/i.test(detalhe ?? "");
}
