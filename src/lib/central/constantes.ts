/**
 * O número central da plataforma (0248). Puro, para servir também às telas.
 *
 * O telefone padrão é o chip comprado em 30/10/2026; `CENTRAL_TELEFONE` no
 * ambiente troca sem deploy de código (chip novo depois de um bloqueio).
 */
export const INSTANCIA_DO_CENTRAL = "astro-central";
export const TELEFONE_PADRAO_DO_CENTRAL = "5511968671127";

/** "5511968671127" → "(11) 96867-1127". */
export function telefoneFormatado(digitos: string): string {
  const n = digitos.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return digitos;
}

/** O link que abre a conversa com o central já com um "oi". */
export function linkDoCentral(telefone: string): string {
  return `https://wa.me/${telefone.replace(/\D/g, "")}?text=${encodeURIComponent("oi")}`;
}
