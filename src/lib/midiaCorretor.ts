/** Os três campos de mídia que o corretor pode substituir pelo painel. */
export type CampoMidia = "avatar" | "fundo_video" | "fundo_foto";

type LimiteMidia = { bytes: number; tipos: string[]; rotuloTipos: string };

export const LIMITES_MIDIA: Record<CampoMidia, LimiteMidia> = {
  avatar: {
    bytes: 5 * 1024 * 1024,
    tipos: ["image/jpeg", "image/png", "image/webp"],
    rotuloTipos: "JPG, PNG ou WebP",
  },
  fundo_foto: {
    bytes: 5 * 1024 * 1024,
    tipos: ["image/jpeg", "image/png", "image/webp"],
    rotuloTipos: "JPG, PNG ou WebP",
  },
  fundo_video: {
    bytes: 20 * 1024 * 1024,
    tipos: ["video/mp4"],
    rotuloTipos: "MP4",
  },
};

/** `null` quando o arquivo passa nas duas checagens — tamanho e tipo. */
export function validarMidia(
  campo: CampoMidia,
  arquivo: { size: number; type: string },
): string | null {
  const limite = LIMITES_MIDIA[campo];
  if (!limite.tipos.includes(arquivo.type)) {
    return `Formato não suportado. Use ${limite.rotuloTipos}.`;
  }
  if (arquivo.size > limite.bytes) {
    const mb = Math.round(limite.bytes / (1024 * 1024));
    return `Arquivo muito grande. Máximo ${mb}MB.`;
  }
  return null;
}

const EXTENSAO_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

/** Extensão a partir do MIME type real do arquivo — nunca do nome digitado pelo usuário. */
export function extensaoPorTipo(tipo: string): string {
  return EXTENSAO_POR_TIPO[tipo] ?? "bin";
}

/** Path do objeto no bucket a partir da URL pública salva antes do upload. */
export function caminhoDoStorage(url: string): string | null {
  const marcador = "/object/public/empreendimentos/";
  const indice = url.indexOf(marcador);
  return indice === -1 ? null : url.slice(indice + marcador.length);
}
