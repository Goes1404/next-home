"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { lerLinkPublico } from "@/lib/crm/linkPublico";
import { after } from "next/server";
import {
  alertaDeResolucao,
  documentosQueFaltam,
  nomeSeguro,
  problemaDoArquivo,
  TETO_DOCUMENTOS_POR_LINK,
} from "@/lib/crm/linksDoCliente";
import { avisarCorretorDoLink, registrarEventoDoLink } from "@/lib/crm/eventosDoLink";
import { medirImagem } from "@/lib/imoveis/imagemDerivada";

/**
 * O cliente envia um documento pelo link (26/09/2026).
 *
 * Endpoint PÚBLICO — o token é a credencial, e tudo é conferido aqui:
 * link válido e do tipo certo, item que está na lista pedida, tamanho e
 * formato, e teto de arquivos por link (sem ele, um link vazado viraria
 * depósito de arquivo). O arquivo vai para o bucket PRIVADO; ninguém lê sem
 * URL assinada gerada para o corretor.
 *
 * Foto pequena demais para o banco ler ganha um `alerta` que só o corretor
 * vê: o envio NÃO é recusado — recusar travaria o cliente num celular com
 * câmera ruim, e quem decide se dá para ler é quem vai levar ao banco.
 *
 * O primeiro documento e a lista completa avisam o corretor no WhatsApp
 * (`eventosDoLink.ts`). A lista completa NÃO muda a etapa do lead: mover
 * para "documentação" é julgamento do corretor (`etapaAutomatica.test.ts`).
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

  // Medida só de imagem; PDF não tem resolução para conferir aqui.
  const alerta = arquivo.type.startsWith("image/")
    ? await medirImagem(Buffer.from(await arquivo.arrayBuffer())).then((m) =>
        m ? alertaDeResolucao(m.largura, m.altura) : null,
      )
    : null;

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
    alerta,
  });
  if (error) {
    // Sem a linha, o arquivo ficaria órfão no bucket e invisível ao corretor.
    await supabase.storage.from("documentos-clientes").remove([caminho]);
    return { erro: "Não foi possível registrar o envio. Tente de novo." };
  }
  after(() => registrarAvanco(supabase, { token, leadId: link.leadId, corretorId: link.corretorId, item, itens }));
  return { ok: true };
}

/** Evento do documento e, quando cabe, o aviso ao corretor. */
async function registrarAvanco(
  supabase: ReturnType<typeof createServiceClient>,
  p: { token: string; leadId: string; corretorId: string; item: string; itens: string[] },
): Promise<void> {
  const [{ data: anteriores }, { data: recebidos }, { data: lead }] = await Promise.all([
    supabase.from("links_do_cliente_eventos").select("tipo").eq("token", p.token),
    supabase.from("lead_documentos").select("item").eq("link_token", p.token),
    supabase.from("leads").select("nome").eq("id", p.leadId).maybeSingle(),
  ]);
  const ja = new Set((anteriores ?? []).map((e) => e.tipo));
  const base = { token: p.token, leadId: p.leadId, corretorId: p.corretorId };

  await registrarEventoDoLink(supabase, { ...base, tipo: "documento", detalhe: p.item });
  if (!ja.has("documento")) {
    await avisarCorretorDoLink(supabase, { ...base, tipo: "documento", nomeLead: lead?.nome ?? null, detalhe: p.item });
  }

  const faltam = documentosQueFaltam(p.itens, (recebidos ?? []).map((r) => r.item));
  if (faltam.length === 0 && !ja.has("documentos_completos")) {
    await registrarEventoDoLink(supabase, { ...base, tipo: "documentos_completos" });
    await avisarCorretorDoLink(supabase, { ...base, tipo: "documentos_completos", nomeLead: lead?.nome ?? null });
  }
}
