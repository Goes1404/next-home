/**
 * Como o escolhido fica sabendo (0218): `mensagem` é a roleta de sempre (o
 * número dele abre a conversa) e `grupo` só avisa no grupo para ele ligar.
 * `desligada` é a roleta que o corretor não ligou: o webhook segue sem ela.
 */
export type ModoDaRoleta = "desligada" | "mensagem" | "grupo";

export type MensagemDaRoleta = "passagem" | "abertura";

/**
 * O que a ROLETA manda ao cliente, na ordem em que sai. Puro, para a regra
 * ficar testável sem banco nem WhatsApp.
 *
 * - `mensagem` com repasse: o número de quem pagou manda só a passagem, ANTES
 *   da abertura do escolhido (o cliente lê "quem vai te atender é fulano" e só
 *   então fulano aparece).
 * - `mensagem` sem repasse (ninguém disponível, vez do próprio dono, erro):
 *   nada. A boas-vindas fixa do dono foi tirada a pedido dele (27/10/2026): o
 *   lead fica com quem pagou e só o corretor fala com o cliente.
 * - `grupo`: nada. O escolhido não manda mensagem nenhuma do número dele;
 *   quem chama o cliente é a ligação.
 */
export function planoDeMensagens(
  modo: Exclude<ModoDaRoleta, "desligada">,
  repassou: boolean,
): MensagemDaRoleta[] {
  if (modo === "grupo" || !repassou) return [];
  return ["passagem", "abertura"];
}
