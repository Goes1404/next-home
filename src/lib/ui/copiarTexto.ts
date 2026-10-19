/**
 * Copia para a área de transferência e diz se COPIOU de verdade.
 *
 * `writeText` devolve uma promessa que o navegador pode recusar (aba sem
 * foco, permissão negada, página fora de HTTPS); sem a API, `clipboard` nem
 * existe. Quem chama mostra "Copiado!" só com `true`, e com `false` deixa o
 * texto à vista para a pessoa copiar à mão.
 */
export async function copiarTexto(
  texto: string,
  area: { writeText: (texto: string) => Promise<void> } | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (!area) return false;
  try {
    await area.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
