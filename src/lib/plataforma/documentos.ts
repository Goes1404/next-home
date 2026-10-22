// CPF e CNPJ: máscara, só dígitos e dígitos verificadores.
//
// Módulo PURO: o formulário (cliente) mascara enquanto o operador digita e a
// action valida com as mesmas funções. O banco (`grupos_documento_check`,
// 0195) só confere "11 ou 14 dígitos"; os dígitos verificadores são daqui.

/** Só os dígitos do texto. */
export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/** Todos os dígitos iguais (111.111.111-11) passam na conta e não existem. */
function repetido(d: string): boolean {
  return /^(\d)\1+$/.test(d);
}

function digitoDoCpf(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(texto: string): boolean {
  const d = soDigitos(texto);
  if (d.length !== 11 || repetido(d)) return false;
  return digitoDoCpf(d.slice(0, 9)) === Number(d[9]) && digitoDoCpf(d.slice(0, 10)) === Number(d[10]);
}

function digitoDoCnpj(base: string): number {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(texto: string): boolean {
  const d = soDigitos(texto);
  if (d.length !== 14 || repetido(d)) return false;
  return digitoDoCnpj(d.slice(0, 12)) === Number(d[12]) && digitoDoCnpj(d.slice(0, 13)) === Number(d[13]);
}

/** 12345678909 vira 123.456.789-09, aceitando o texto pela metade. */
export function mascararCpf(texto: string): string {
  const d = soDigitos(texto).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

/** 11222333000181 vira 11.222.333/0001-81, aceitando o texto pela metade. */
export function mascararCnpj(texto: string): string {
  const d = soDigitos(texto).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}
