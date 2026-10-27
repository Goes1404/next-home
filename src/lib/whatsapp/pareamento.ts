/**
 * O que fazer antes de pedir um código de pareamento, dado o estado atual
 * da instância na Evolution.
 *
 * Existe como função pura porque a regra é sutil e cara de errar. A
 * Evolution v2 trata o parâmetro `?number=` do `/instance/connect` assim:
 *
 * | estado       | o que faz com `?number=`                          |
 * |--------------|---------------------------------------------------|
 * | `open`       | ignora — devolve o estado da conexão               |
 * | `connecting` | **ignora o número e devolve o QR em cache**        |
 * | `close`      | chama `requestPairingCode` → devolve `pairingCode` |
 *
 * A linha do meio é a que quebrava tudo: bastava um QR ter sido aberto
 * segundos antes para o número ser silenciosamente descartado, e o código
 * de 8 caracteres nunca chegar. Por isso `connecting` exige derrubar a
 * sessão pendente (logout) antes de pedir o código.
 *
 * E `close` recomeça a instância do zero (27/10/2026). O número do Ramos foi
 * tirado da conta pelo WhatsApp (401) em 21/10, e cinco pedidos de código
 * seguidos terminaram em 401 — num deles a Evolution nem devolveu código e
 * o número caiu 0,4 s depois do pedido. É a assinatura de sessão velha
 * guardada na instância: a Evolution abre o socket com as credenciais do
 * aparelho que o WhatsApp já desconectou, o WhatsApp recusa, e o código
 * digitado no celular dá "Não foi possível conectar o dispositivo". Apagar
 * e recriar a instância troca essas credenciais por novas; o nome, o
 * webhook e o que está no nosso banco continuam os mesmos.
 */
export type DecisaoPareamento =
  /** Já conectado: recusar. Derrubar a sessão é decisão do corretor, no botão Desconectar. */
  | { acao: "recusar"; motivo: "ja_conectado" }
  /** Há um QR pendente segurando o socket: derrubar antes de pedir o código. */
  | { acao: "encerrar_antes" }
  /** Sem sessão no ar: apagar e recriar a instância, para não herdar credenciais mortas. */
  | { acao: "recomecar" }
  /** Caminho livre — pedir o código direto. */
  | { acao: "seguir" };

export function decidirPareamentoPorNumero(estado: string | null): DecisaoPareamento {
  switch (estado) {
    case "open":
      return { acao: "recusar", motivo: "ja_conectado" };
    case "connecting":
      return { acao: "encerrar_antes" };
    case "close":
      return { acao: "recomecar" };
    // Instância inexistente ou estado que não reconhecemos: seguir. Apagar
    // num estado novo da Evolution poderia derrubar uma sessão boa — e o pior
    // desfecho deste caminho é o corretor perder um número que funcionava.
    default:
      return { acao: "seguir" };
  }
}
