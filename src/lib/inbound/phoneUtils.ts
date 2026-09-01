/**
 * Normaliza qualquer formato de telefone brasileiro para o padrão E.164 (5511999998888).
 */
export function normalizarTelefoneBrasileiro(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Remove tudo que não for dígito
  const apenasNumeros = raw.replace(/\D/g, "");

  if (!apenasNumeros) return null;

  // Se já começar com 55 e tiver 12 ou 13 dígitos
  if (apenasNumeros.startsWith("55") && (apenasNumeros.length === 12 || apenasNumeros.length === 13)) {
    return apenasNumeros;
  }

  // Se tiver 10 ou 11 dígitos (DDD + número)
  if (apenasNumeros.length === 10 || apenasNumeros.length === 11) {
    return `55${apenasNumeros}`;
  }

  // Se tiver 8 ou 9 dígitos (sem DDD, assume DDD 11 de Barueri/Alphaville)
  if (apenasNumeros.length === 8 || apenasNumeros.length === 9) {
    return `5511${apenasNumeros}`;
  }

  // Fallback se não casar exatamente
  return apenasNumeros.length >= 8 ? apenasNumeros : null;
}
