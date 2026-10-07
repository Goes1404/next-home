/**
 * A lista de transmissão para sozinha quando os sinais ficam ruins
 * (07/10/2026). Nasceu da restrição da conta da Bruna pelo WhatsApp
 * ("mensagens automáticas ou em massa"), no meio de uma lista de 300.
 *
 * O WhatsApp não conta para nós o que pesou (denúncia, bloqueio). O que dá
 * para ver daqui são dois sinais que ele também vê:
 * - número sem WhatsApp: lista velha ou comprada. Na Carolini eram 24 de 39;
 * - pedido para parar: quem diz "me tira da lista" costuma também bloquear.
 *
 * Módulo PURO (o disparador lê os números e chama). Pausar é reversível pelo
 * botão "Retomar"; continuar enviando com um número já marcado não é.
 */

/** O `erro_motivo` do item da fila cujo número não tem WhatsApp. */
export const MOTIVO_SEM_WHATSAPP = "Número não está no WhatsApp";

export type SinaisDaLista = {
  /** Mensagens que saíram. */
  enviados: number;
  /** Itens que deram "Número não está no WhatsApp". */
  semWhatsapp: number;
  /** Quem recebeu e depois pediu para não ser mais contatado. */
  pediramParaSair: number;
};

/** A partir de quantas tentativas a proporção de números sem WhatsApp vale. */
export const MINIMO_DE_TENTATIVAS = 10;
/** Números sem WhatsApp: pelo menos 5 e 20% das tentativas. */
export const SEM_WHATSAPP_MINIMO = 5;
export const SEM_WHATSAPP_PROPORCAO = 0.2;
/** Pedidos para sair: pelo menos 3 e 2% dos enviados. */
export const SAIDAS_MINIMO = 3;
export const SAIDAS_PROPORCAO = 0.02;

/** O motivo da pausa, em português para a tela, ou null para seguir. */
export function motivoDePausaAutomatica(s: SinaisDaLista): string | null {
  const tentativas = s.enviados + s.semWhatsapp;
  if (
    tentativas >= MINIMO_DE_TENTATIVAS &&
    s.semWhatsapp >= SEM_WHATSAPP_MINIMO &&
    s.semWhatsapp / tentativas >= SEM_WHATSAPP_PROPORCAO
  ) {
    return `Pausada sozinha: ${s.semWhatsapp} de ${tentativas} números não têm WhatsApp. Lista assim costuma ser antiga, e o WhatsApp restringe quem insiste nela.`;
  }
  if (s.pediramParaSair >= SAIDAS_MINIMO && s.pediramParaSair / Math.max(1, s.enviados) >= SAIDAS_PROPORCAO) {
    return `Pausada sozinha: ${s.pediramParaSair} pessoas pediram para não receber mais. Quem pede para sair costuma bloquear, e bloqueio é o que mais restringe o número.`;
  }
  return null;
}

/** Complemento da mensagem de lista criada, quando a conferência tirou alguém. */
export function fraseSemWhatsapp(n: number): string {
  if (n <= 0) return "";
  return n === 1
    ? " 1 número saiu da lista por não ter WhatsApp."
    : ` ${n} números saíram da lista por não ter WhatsApp.`;
}

/** Os sinais desde a base gravada ao retomar (nunca negativos). */
export function sinaisDesdeABase(atuais: SinaisDaLista, base: unknown): SinaisDaLista {
  const b = (typeof base === "object" && base !== null ? base : {}) as Partial<Record<keyof SinaisDaLista, unknown>>;
  const n = (k: keyof SinaisDaLista) => Math.max(0, atuais[k] - (typeof b[k] === "number" ? (b[k] as number) : 0));
  return { enviados: n("enviados"), semWhatsapp: n("semWhatsapp"), pediramParaSair: n("pediramParaSair") };
}
