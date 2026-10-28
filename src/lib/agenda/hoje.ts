import type { ItemDaAgenda } from "./itens";

/** O que começou há menos de uma hora ainda está acontecendo: continua no Início. */
const AINDA_VALE_MS = 60 * 60_000;

/**
 * Os próximos compromissos de hoje para o cartão do Início: o que ainda vai
 * acontecer (ou está acontecendo), na ordem em que vieram, no máximo `quantos`.
 */
export function proximosDeHoje(itens: ItemDaAgenda[], agora: Date, quantos = 3): ItemDaAgenda[] {
  const desde = agora.getTime() - AINDA_VALE_MS;
  return itens.filter((i) => Date.parse(i.inicio) >= desde).slice(0, quantos);
}
