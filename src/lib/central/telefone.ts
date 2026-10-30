/**
 * Telefones no número central (onda 0, 30/10/2026). Puro.
 *
 * `corretores.whatsapp` é guardado só com dígitos, quase sempre com o 55,
 * mas cadastros antigos podem vir sem o país ou sem o nono dígito. A busca
 * de quem escreve tenta todas as formas do mesmo número.
 */
import { createHash } from "node:crypto";

/** As formas do mesmo celular: com e sem 55, com e sem o nono dígito. */
export function variantesDoTelefone(bruto: string): string[] {
  const digitos = bruto.replace(/\D/g, "");
  if (!digitos) return [];
  const nacional = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  const nacionais = new Set([nacional]);
  // DDD + 8 dígitos de celular (6-9) → com o 9; DDD + 9 + 8 → sem o 9.
  if (nacional.length === 10 && /[6-9]/.test(nacional[2])) nacionais.add(`${nacional.slice(0, 2)}9${nacional.slice(2)}`);
  if (nacional.length === 11 && nacional[2] === "9" && /[6-9]/.test(nacional[3])) {
    nacionais.add(`${nacional.slice(0, 2)}${nacional.slice(3)}`);
  }
  const todas = new Set<string>();
  for (const n of nacionais) {
    todas.add(n);
    todas.add(`55${n}`);
  }
  return [...todas];
}

/** Os mesmos dígitos, em qualquer das formas acima. Vazio nunca casa. */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const deB = new Set(variantesDoTelefone(b));
  return variantesDoTelefone(a).some((v) => deB.has(v));
}

/**
 * O telefone de quem não é atendido vai para `central_tentativas` em hash:
 * dá para contar quantas vezes o mesmo número tentou sem guardar o número.
 * Sempre sobre a forma com 55 e com o nono dígito, para o mesmo celular dar
 * o mesmo hash.
 */
export function hashDoTelefone(bruto: string): string {
  return createHash("sha256").update(`central:${telefoneCanonico(bruto)}`).digest("hex").slice(0, 32);
}

/** Uma forma só para o mesmo celular: com 55 e com o nono dígito. */
export function telefoneCanonico(bruto: string): string {
  const variantes = variantesDoTelefone(bruto);
  return variantes.filter((v) => v.startsWith("55")).sort((x, y) => y.length - x.length)[0] ?? bruto.replace(/\D/g, "");
}
