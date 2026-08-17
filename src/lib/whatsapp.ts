/** Mantém só dígitos e garante o formato E.164 brasileiro que `wa.me` espera. */
export function normalizarWhatsapp(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  // 10-11 dígitos = número local, sem código do país; 12-13 já vem com o 55.
  if (digitos.length <= 11) return `55${digitos}`;
  if (digitos.length <= 13 && digitos.startsWith("55")) return digitos;
  return null;
}
