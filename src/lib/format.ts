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
/**
 * Preço por m² — a métrica que compradores usam para comparar
 * empreendimentos de metragens diferentes. Só faz sentido com os dois
 * valores presentes e positivos.
 */
export function precoPorM2(
  preco: number | null | undefined,
  area: number | null | undefined,
): string | null {
  if (preco == null || area == null || preco <= 0 || area <= 0) return null;
  return `${brl.format(Math.round(preco / area))}/m²`;
}

/**
 * Iniciais do nome — fallback de avatar enquanto não há foto cadastrada.
 *
 * Só partes que começam com letra entram: nomes cadastrados como
 * "Cristal - Bruna" têm o hífen como palavra própria, e ele viraria uma
 * "inicial" ("C-") se não fosse descartado aqui.
 */
export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter((parte) => /^\p{L}/u.test(parte))
    .slice(0, 2)
    .map((parte) => parte[0]!.toUpperCase())
    .join("");
}

/**
 * "5511972207204" → "(11) 97220-7204".
 *
 * O banco guarda o WhatsApp do corretor em E.164, formato de máquina. Na
 * página dele o número também é lido por gente — quem quer salvar o contato
 * na agenda em vez de abrir a conversa agora —, e ninguém copia um número
 * grudado de 13 dígitos sem errar. Qualquer coisa fora do padrão brasileiro
 * de celular volta como veio, com "+" na frente: melhor um número cru do que
 * um número reformatado errado.
 */
export function telefoneBR(e164: string): string {
  const digitos = e164.replace(/\D/g, "");
  const brasileiro = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digitos);
  if (!brasileiro) return `+${digitos}`;
  const [, ddd, prefixo, sufixo] = brasileiro;
  return `(${ddd}) ${prefixo}-${sufixo}`;
}

const DIAS_PARA_DEIXAR_DE_SER_NOVO = 30;

/** Publicado há pouco tempo — alimenta o selo "novo" da listagem. */
export function ehRecente(criadoEm: string): boolean {
  const dias = (Date.now() - new Date(criadoEm).getTime()) / 86_400_000;
  return dias >= 0 && dias <= DIAS_PARA_DEIXAR_DE_SER_NOVO;
}

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
