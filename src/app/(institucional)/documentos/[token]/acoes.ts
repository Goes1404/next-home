"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { lerLinkPublico } from "@/lib/crm/linkPublico";
import { nomeSeguro, problemaDoArquivo, TETO_DOCUMENTOS_POR_LINK } from "@/lib/crm/linksDoCliente";

/**
 * O cliente envia um documento pelo link (26/09/2026).
 *
 * Endpoint PÚBLICO — o token é a credencial, e tudo é conferido aqui:
 * link válido e do tipo certo, item que está na lista pedida, tamanho e
 * formato, e teto de arquivos por link (sem ele, um link vazado viraria
 * depósito de arquivo). O arquivo vai para o bucket PRIVADO; ninguém lê sem
 * URL assinada gerada para o corretor.
 */
export async function enviarDocumento(formData: FormData): Promise<{ ok?: true; erro?: string }> {
  const token = String(formData.get("token") ?? "");
  const item = String(formData.get("item") ?? "");
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) return { erro: "Escolha um arquivo." };

  const link = await lerLinkPublico(token, "documentos", { previa: true });
  if (!link) return { erro: "Este link venceu. Peça um novo ao seu corretor." };

  const itens = Array.isArray(link.dados.itens) ? (link.dados.itens as string[]) : [];
  if (!itens.includes(item)) return { erro: "Documento não reconhecido." };

  const problema = problemaDoArquivo(arquivo);
  if (problema) return { erro: problema };

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("lead_documentos")
    .select("id", { count: "exact", head: true })
    .eq("link_token", token);
  if ((count ?? 0) >= TETO_DOCUMENTOS_POR_LINK) {
    return { erro: "Este link já recebeu muitos arquivos. Fale com seu corretor." };
  }

  const caminho = `${link.leadId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
  const { error: erroUpload } = await supabase.storage
    .from("documentos-clientes")
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (erroUpload) {
    console.error("[documentos] upload recusado:", erroUpload.message);
    return { erro: "Não foi possível enviar agora. Tente de novo." };
  }

  const { error } = await supabase.from("lead_documentos").insert({
    lead_id: link.leadId,
    corretor_id: link.corretorId,
    link_token: token,
    item,
    caminho,
    nome_arquivo: arquivo.name.slice(0, 120),
    tamanho: arquivo.size,
    mime: arquivo.type,
  });
  if (error) {
    // Sem a linha, o arquivo ficaria órfão no bucket e invisível ao corretor.
    await supabase.storage.from("documentos-clientes").remove([caminho]);
    return { erro: "Não foi possível registrar o envio. Tente de novo." };
  }
  return { ok: true };
}
