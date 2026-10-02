/**
 * Entrega prevista como a coluna `date` aceita. Apresentação de construtora
 * costuma dizer só o mês ("2027-10", "10/2027") ou só o ano ("2027"): vira o
 * dia 1º. O que não for data reconhecível devolve null, e o campo não é gravado.
 */
export function dataDeEntrega(valor: string): string | null {
  const v = valor.trim();
  const completa = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (completa) return `${completa[1]}-${completa[2]}-${completa[3]}`;

  const anoMes = v.match(/^(\d{4})-(\d{1,2})$/);
  const mesAno = v.match(/^(\d{1,2})\/(\d{4})$/);
  const ano = anoMes?.[1] ?? mesAno?.[2];
  const mes = Number(anoMes?.[2] ?? mesAno?.[1]);
  if (ano) return mes >= 1 && mes <= 12 ? `${ano}-${String(mes).padStart(2, "0")}-01` : null;

  const soAno = v.match(/^(\d{4})$/);
  return soAno ? `${soAno[1]}-01-01` : null;
}
