/**
 * A contagem da prévia do público da lista: "1 pessoa receberá", "25 pessoas
 * receberão". O plural montado letra a letra (`receberá${n === 1 ? "" : "ão"}`)
 * dava "receberáão" na tela de todos os corretores (achado em 04/11/2026).
 *
 * Sem import nenhum de propósito: a função entra no pacote do navegador
 * (`NovaCampanha`) sem arrastar `publicoDaCampanha` e os cálculos dos gráficos.
 */
export function quantasPessoasRecebem(total: number): string {
  return total === 1 ? "1 pessoa receberá" : `${total} pessoas receberão`;
}
