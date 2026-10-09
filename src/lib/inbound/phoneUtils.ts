/**
 * Telefone guardado como NÚMERO numa planilha chega disfarçado de dois jeitos.
 *
 * - Notação científica: "5,51198E+12", "5.511981918127E+12". O Excel e o
 *   Google Planilhas mostram assim todo número de 12 dígitos ou mais, ou seja,
 *   todo celular com o 55 na frente. Copiar, colar ou exportar em CSV leva o
 *   que a planilha MOSTRA, e "5,51198E+12" já não tem os sete últimos dígitos
 *   em lugar nenhum. Lidos como telefone, os dígitos que sobram viravam
 *   "(11) 5511-9812": um número que existe e é de outra pessoa.
 * - Decimal: "5511981918127.0", de exportação feita por programa.
 *
 * Devolve os dígitos quando o valor traz o número inteiro, `cortado` quando a
 * planilha apagou dígitos, e `null` quando o valor não é nenhum dos dois.
 */
export type NumeroDePlanilha = { tipo: "inteiro"; digitos: string } | { tipo: "cortado"; original: string };

const RE_CIENTIFICA = /^\+?(\d+)(?:[.,](\d+))?[eE]\+?(\d{1,2})$/;
const RE_DECIMAL = /^\+?(\d{8,15})[.,]0+$/;

export function lerNumeroDePlanilha(bruto: string | null | undefined): NumeroDePlanilha | null {
  const original = (bruto ?? "").trim();
  const valor = original.replace(/\s+/g, "");
  if (!valor) return null;

  const decimal = valor.match(RE_DECIMAL);
  if (decimal) return { tipo: "inteiro", digitos: decimal[1] };

  const m = valor.match(RE_CIENTIFICA);
  if (!m) return null;
  const inteira = m[1].replace(/^0+/, "");
  if (!inteira) return null;
  const fracao = m[2] ?? "";
  const expoente = Number(m[3]);
  // Quantos dígitos o número tem de verdade. Fora de 8 a 15, não é telefone.
  const total = inteira.length + expoente;
  if (total < 8 || total > 15) return null;

  const algarismos = inteira + fracao;
  if (algarismos.length < total) return { tipo: "cortado", original };
  if (algarismos.length === total) return { tipo: "inteiro", digitos: algarismos };

  // Mais algarismos do que o número inteiro tem: a sobra é o resto de ponto
  // flutuante que o Excel grava ("5.5119912345670002E+12"). Telefone não tem
  // fração, então só vale se o resto for desprezível.
  const numero = Number(`${inteira}.${fracao}e${expoente}`);
  const arredondado = Math.round(numero);
  if (!Number.isFinite(numero) || Math.abs(numero - arredondado) > 0.01) return null;
  const digitos = arredondado.toFixed(0);
  return digitos.length === total ? { tipo: "inteiro", digitos } : null;
}

/**
 * Normaliza qualquer formato de telefone brasileiro para o padrão E.164 (5511999998888).
 */
export function normalizarTelefoneBrasileiro(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Número de planilha: o cortado não tem como virar telefone, e o inteiro
  // segue com os próprios dígitos.
  const daPlanilha = lerNumeroDePlanilha(raw);
  if (daPlanilha?.tipo === "cortado") return null;

  // Remove tudo que não for dígito
  const apenasNumeros = (daPlanilha ? daPlanilha.digitos : raw).replace(/\D/g, "");

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
 * 98191-8127", "11981918127". Número de fora do Brasil, ou que não fecha um
 * celular/fixo daqui, volta como chegou: formatar errado seria pior que não
 * formatar. O mesmo vale para o número que a planilha cortou ("5,51198E+12",
 * ver `lerNumeroDePlanilha`): os dígitos que faltam não estão em lugar nenhum.
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
