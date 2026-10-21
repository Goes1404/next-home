// A logo do grupo no CRM (0208): o que se aceita e onde ela mora.
//
// Módulo PURO. PNG, JPEG ou WebP, até 1 MB — e SEM SVG: SVG carrega script, e
// a logo é servida do bucket público debaixo do domínio do Supabase. O formato
// vem dos PRIMEIROS BYTES do arquivo, não do nome nem do tipo que o navegador
// declarou (ambos são digitados por quem envia).

export const TETO_DA_LOGO_BYTES = 1024 * 1024;

export type FormatoDaLogo = { mime: "image/png" | "image/jpeg" | "image/webp"; extensao: "png" | "jpg" | "webp" };

/** O formato pelos bytes; nulo para qualquer outra coisa (SVG, GIF, PDF, vazio). */
export function formatoDaLogo(bytes: Uint8Array): FormatoDaLogo | null {
  const eq = (inicio: number, esperado: number[]) => esperado.every((b, i) => bytes[inicio + i] === b);
  if (bytes.length >= 8 && eq(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", extensao: "png" };
  }
  if (bytes.length >= 3 && eq(0, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extensao: "jpg" };
  // RIFF....WEBP
  if (bytes.length >= 12 && eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50])) {
    return { mime: "image/webp", extensao: "webp" };
  }
  return null;
}

export type ProblemaDaLogo = string;

/** O motivo de recusar a logo, ou nulo se ela serve. */
export function problemaDaLogo(bytes: Uint8Array): ProblemaDaLogo | null {
  if (bytes.length === 0) return "O arquivo está vazio.";
  if (bytes.length > TETO_DA_LOGO_BYTES) return "A logo passa de 1 MB. Reduza a imagem e tente de novo.";
  if (!formatoDaLogo(bytes)) return "Formato não aceito. Envie a logo em PNG, JPEG ou WebP (SVG não é aceito).";
  return null;
}

/** Pasta do grupo no bucket `empreendimentos`. */
export function pastaDaLogo(grupoId: string): string {
  return `grupos/${grupoId}`;
}

/** `grupos/<grupo_id>/logo-<hash>.<ext>`: o hash muda com o arquivo, então a URL nova não pega cache velho. */
export function caminhoDaLogo(grupoId: string, hash: string, extensao: FormatoDaLogo["extensao"]): string {
  return `${pastaDaLogo(grupoId)}/logo-${hash}.${extensao}`;
}

/** Só a logo DESTE grupo conta como "logo antiga a apagar" (nunca outra pasta). */
export function ehLogoDoGrupo(grupoId: string, caminho: string): boolean {
  return new RegExp(`^${pastaDaLogo(grupoId)}/logo-[0-9a-f]{16}\.(png|jpg|webp)$`).test(caminho);
}
