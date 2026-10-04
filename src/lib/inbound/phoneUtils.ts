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

/**
 * O telefone brasileiro como se escreve: "(11) 98191-8127".
 *
 * A importação gravava o que vinha na planilha, do jeito que vinha: "+55 11
 * 98191-8127", "11981918127", "5.5119819181E+12". A chave de busca
 * (`telefone_e164`) sempre saiu certa; o que a tela mostrava, não. Número de
 * fora do Brasil, ou que não fecha um celular/fixo daqui, volta como chegou:
 * formatar errado seria pior que não formatar.
 */
export function formatarTelefoneBr(raw: string | null | undefined): string {
  const original = (raw ?? "").trim();
  // "+1 415 555 2671" tem onze dígitos, como um celular daqui com DDD: com
  // "+" e DDI que não é 55, o número é de fora e fica como está.
  if (original.startsWith("+") && !original.replace(/\D/g, "").startsWith("55")) return original;
  const e164 = normalizarTelefoneBrasileiro(original);
  if (!e164 || !e164.startsWith("55") || (e164.length !== 12 && e164.length !== 13)) return original;
  const ddd = e164.slice(2, 4);
  const numero = e164.slice(4);
  return `(${ddd}) ${numero.slice(0, -4)}-${numero.slice(-4)}`;
}
