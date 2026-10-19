/**
 * Mídia que o CLIENTE mandou no WhatsApp e foi guardada no bucket privado
 * `documentos-clientes` (16/10/2026). A coluna `whatsapp_mensagens.midia_url`
 * guarda `privado:<caminho>` em vez de uma URL: o arquivo é pessoal (RG,
 * holerite) e só abre por URL assinada, gerada para quem pode ler a conversa.
 *
 * Módulo puro, para o painel e o webhook falarem o mesmo formato.
 */
const PREFIXO = "privado:";

export function marcaDeMidiaPrivada(caminho: string): string {
  return `${PREFIXO}${caminho}`;
}

/** O caminho no bucket, quando a mídia é das guardadas; `null` para URL comum. */
export function caminhoDaMidiaPrivada(midiaUrl: string | null | undefined): string | null {
  if (!midiaUrl || !midiaUrl.startsWith(PREFIXO)) return null;
  const caminho = midiaUrl.slice(PREFIXO.length);
  // Só caminho de lead (`<uuid>/whatsapp/...`): o que vem de fora não escolhe pasta.
  return /^[0-9a-f-]{36}\/whatsapp\/[^/]+$/.test(caminho) ? caminho : null;
}
