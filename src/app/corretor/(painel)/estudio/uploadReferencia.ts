"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Upload da foto de referência do chat — direto do navegador para o Storage.
 *
 * Direto de propósito: Server Action tem teto de corpo (12 MB, e afrouxar
 * afrouxaria para todas — a lição do PDF de book). O caminho vive na pasta
 * pessoal do corretor (`corretores/<id>/…`), a mesma que a policy da 0015
 * cobre e que a rota `/api/imagens/gerar` confina ao ler `referenciaPath`.
 *
 * O nome é o hash do conteúdo (o esquema de `registrarMidia`): mandar a mesma
 * foto duas vezes não duplica arquivo, e `upsert` torna o upload idempotente.
 */

const BUCKET = "empreendimentos";
export const TETO_REFERENCIA_BYTES = 8 * 1024 * 1024;
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type ReferenciaEnviada = { path: string; url: string };

export async function enviarFotoDeReferencia(
  corretorId: string,
  file: File,
): Promise<ReferenciaEnviada | { erro: string }> {
  if (!TIPOS.has(file.type)) {
    return { erro: "Só JPG, PNG ou WebP — é o que o motor de imagem lê." };
  }
  if (file.size > TETO_REFERENCIA_BYTES) {
    return { erro: "Foto grande demais (máx. 8 MB). Manda uma versão menor." };
  }

  const bytes = await file.arrayBuffer();
  const digesto = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digesto))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);

  const path = `corretores/${corretorId}/referencias/${hash}.${EXT[file.type]}`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) {
    console.error("[estudio] upload de referência falhou:", error.message);
    return { erro: "Não deu para enviar a foto. Tenta de novo." };
  }

  return { path, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}
