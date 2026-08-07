/** Formatadores pt-BR compartilhados entre servidor e cliente. */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** `null` vira "Consulte" — o site legado usa isso para preço sob consulta. */
export function precoBRL(valor: number | null | undefined): string {
  if (valor == null || valor <= 0) return "Consulte";
  return brl.format(valor);
}

export function precoAPartirDe(valor: number | null | undefined): string {
  if (valor == null || valor <= 0) return "Valor sob consulta";
  return `A partir de ${brl.format(valor)}`;
}

export function areaM2(valor: number | null | undefined): string {
  if (valor == null || valor <= 0) return "—";
  const n = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(valor);
  return `${n} m²`;
}

/**
 * Resume a faixa de uma lista de valores: [2,2,3] → "2 a 3", [2,2] → "2".
 * Usado para dormitórios/vagas, que variam entre as tipologias.
 */
export function faixa(valores: Array<number | null | undefined>): string | null {
  const nums = valores.filter((v): v is number => typeof v === "number" && v > 0);
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? String(min) : `${min} a ${max}`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2029-04-01" → "abril de 2029". A entrega é sempre comunicada por mês. */
export function entregaPrevista(data: string | null | undefined): string | null {
  if (!data) return null;
  const [ano, mes] = data.split("-").map(Number);
  if (!ano || !mes) return null;
  return `${MESES[mes - 1]} de ${ano}`;
}
