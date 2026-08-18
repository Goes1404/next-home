/**
 * Converte qualquer formato monetário em texto para número numérico limpo em Reais.
 * Ex: "R$ 1.450.000,00" -> 1450000
 *     "1.450.000" -> 1450000
 *     "1450k" -> 1450000
 *     "1,45M" -> 1450000
 *     "890 mil" -> 890000
 */
export function normalizarPrecoBRL(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return isNaN(raw) || raw <= 0 ? null : Math.round(raw);

  let texto = raw.trim().toLowerCase();
  if (!texto) return null;

  // Trata sufixos "mil", "k", "m", "milhões"
  if (texto.includes("milhão") || texto.includes("milhões") || texto.includes("m") && !texto.includes("mil")) {
    const num = parseFloat(texto.replace(/[^\d.,]/g, "").replace(",", "."));
    if (!isNaN(num) && num > 0) return Math.round(num * 1_000_000);
  }

  if (texto.includes("mil") || texto.endsWith("k")) {
    const num = parseFloat(texto.replace(/[^\d.,]/g, "").replace(",", "."));
    if (!isNaN(num) && num > 0) return Math.round(num * 1_000);
  }

  // Remove "r$", espaços e caracteres não numéricos exceto . e ,
  texto = texto.replace(/r\$/g, "").trim();

  // Padrão brasileiro clássico: 1.450.000,00 ou 1.450.000
  if (texto.includes(",")) {
    // Se tiver vírgula como decimal (ex: 1.450.000,50 ou 1450000,00)
    const partes = texto.split(",");
    const parteInteira = partes[0].replace(/\./g, "").replace(/\s/g, "");
    const valor = parseFloat(`${parteInteira}.${partes[1] || "0"}`);
    return !isNaN(valor) && valor > 0 ? Math.round(valor) : null;
  }

  // Se tiver apenas pontos (ex: 1.450.000 ou 1450000)
  if (texto.includes(".")) {
    const partes = texto.split(".");
    // Se a última parte tiver exatamente 3 dígitos (ex: 1.450.000), é separador de milhar
    if (partes[partes.length - 1].length === 3 || partes.length > 2) {
      const parteInteira = texto.replace(/\./g, "").replace(/\s/g, "");
      const valor = parseFloat(parteInteira);
      return !isNaN(valor) && valor > 0 ? Math.round(valor) : null;
    }
  }

  const limpo = texto.replace(/[^\d]/g, "");
  const valor = parseInt(limpo, 10);
  return !isNaN(valor) && valor > 0 ? valor : null;
}

/**
 * Formata valor numérico para padrão moeda BRL legível.
 */
export function formatarMoedaBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valor);
}
