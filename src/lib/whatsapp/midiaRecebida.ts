import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { baixarMidiaDoProvedor } from "@/lib/whatsapp/provider";
import { MIMES_ACEITOS, nomeSeguro, TETO_DOCUMENTO_BYTES } from "@/lib/crm/linksDoCliente";
import { marcaDeMidiaPrivada } from "@/lib/whatsapp/midiaPrivada";

const EXTENSAO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/**
 * Guarda a foto ou o PDF que o cliente mandou no WhatsApp (16/10/2026), para
 * o corretor poder ver no painel e, se for documento, guardar na lista do
 * lead ("Guardar como documento", na conversa).
 *
 * Roda DEPOIS da resposta ao provedor (`after`): baixar e subir não pode
 * atrasar o atendimento. Falha vira log — a mensagem já está gravada, só
 * fica sem a mídia, como era antes.
 *
 * Só formato que a lista de documentos aceita e até o mesmo teto: o resto
 * (vídeo, figurinha) não tem para onde ir e não ocupa o bucket privado.
 */
export async function guardarMidiaRecebida(p: {
  instanceName: string;
  providerMessageId: string;
  mensagemCompleta: { key?: unknown; message?: unknown } | null;
  leadId: string;
  mensagemId: string;
  nomeDoArquivo: string | null;
}): Promise<void> {
  const baixado = await baixarMidiaDoProvedor({
    instanceName: p.instanceName,
    messageId: p.providerMessageId,
    mensagemCompleta: p.mensagemCompleta,
    timeoutMs: 15_000,
  });
  if (!baixado.ok) {
    console.warn("[mídia recebida] não baixou:", baixado.motivo, baixado.detalhe ?? "");
    return;
  }
  const mime = baixado.mimeType.split(";")[0].trim().toLowerCase();
  if (!(MIMES_ACEITOS as readonly string[]).includes(mime)) return;
  const bytes = Buffer.from(baixado.base64.replace(/^data:[^,]*,/, ""), "base64");
  if (bytes.length === 0 || bytes.length > TETO_DOCUMENTO_BYTES) return;

  const base = nomeSeguro(p.nomeDoArquivo || `whatsapp.${EXTENSAO[mime] ?? "bin"}`);
  const caminho = `${p.leadId}/whatsapp/${p.mensagemId}-${base}`;
  const supabase = createServiceClient();
  const { error: erroUpload } = await supabase.storage
    .from("documentos-clientes")
    .upload(caminho, bytes, { contentType: mime, upsert: true });
  if (erroUpload) {
    console.error("[mídia recebida] upload recusado:", erroUpload.message);
    return;
  }
  const { error } = await supabase
    .from("whatsapp_mensagens")
    .update({ midia_url: marcaDeMidiaPrivada(caminho) })
    .eq("id", p.mensagemId);
  if (error) console.error("[mídia recebida] mensagem não atualizada:", error.message);
}
