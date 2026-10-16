"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { caminhoDaMidiaPrivada } from "@/lib/whatsapp/midiaPrivada";
import { ehFase, FASES_DOCUMENTO, mesmoItem, type FaseDocumento } from "@/lib/crm/documentacao";
import { lerDocumentacaoDoLead } from "@/lib/crm/documentacaoDados";

/**
 * "Guardar como documento" (16/10/2026): a foto do RG que o cliente mandou no
 * WhatsApp vira o item "RG ou CNH" da lista do lead, sem baixar e subir de
 * novo. O arquivo é o MESMO do bucket privado (não é copiado); a linha nova
 * em `lead_documentos` aponta para ele e para o balão de onde veio.
 *
 * Quem pode: o corretor dono da conversa e do lead. A mensagem é lida pela
 * sessão (a RLS da conversa só mostra a dele); a escrita é pela chave de
 * serviço, como o resto da documentação.
 */
async function midiaDaMensagem(mensagemId: string) {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." } as const;
  const supabase = await createClient();
  // Duas consultas em vez de embed: o tipo gerado à mão não conhece a relação.
  const { data: msg } = await supabase
    .from("whatsapp_mensagens")
    .select("id, remetente, midia_url, conteudo, conversa_id")
    .eq("id", mensagemId)
    .maybeSingle();
  if (!msg) return { erro: "Mensagem não encontrada." } as const;
  const { data: conversa } = await supabase
    .from("whatsapp_conversas")
    .select("lead_id, corretor_id")
    .eq("id", msg.conversa_id)
    .maybeSingle();
  const caminho = caminhoDaMidiaPrivada(msg.midia_url);
  if (!conversa?.lead_id || !caminho || msg.remetente !== "cliente") {
    return { erro: "Este arquivo não pode ser guardado como documento." } as const;
  }
  if (conversa.corretor_id !== corretor.id) {
    return { erro: "Só o corretor da conversa guarda documentos dela." } as const;
  }
  const { data: lead } = await supabase.from("leads").select("id, corretor_id").eq("id", conversa.lead_id).maybeSingle();
  if (!lead || lead.corretor_id !== corretor.id) {
    return { erro: "O lead desta conversa não está na sua carteira." } as const;
  }
  return { corretor, leadId: lead.id, caminho, conteudo: msg.conteudo } as const;
}

export type OpcoesParaGuardar =
  | { fases: { fase: FaseDocumento; itens: { item: string; jaTem: boolean }[] }[] }
  | { erro: string };

/** As listas do lead, para o corretor escolher em qual item o arquivo entra. */
export async function opcoesParaGuardar(mensagemId: string): Promise<OpcoesParaGuardar> {
  const r = await midiaDaMensagem(mensagemId);
  if ("erro" in r) return { erro: r.erro ?? "Mensagem não encontrada." };
  const doc = await lerDocumentacaoDoLead(createServiceClient(), r.leadId);
  if (!doc.migrado) return { erro: "A documentação ainda não está ativa no banco." };
  const fases = FASES_DOCUMENTO.map((fase) => ({
    fase,
    itens: doc.fases[fase].resumo.itens.map((i) => ({
      item: i.item,
      jaTem: i.arquivos.some((a) => doc.documentos.find((d) => d.id === a.id)?.caminho === r.caminho),
    })),
  })).filter((f) => f.itens.length > 0);
  if (fases.length === 0) return { erro: "Este lead ainda não tem lista de documentos. Monte a lista na ficha dele." };
  return { fases };
}

const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export async function guardarComoDocumento(
  mensagemId: string,
  fase: string,
  item: string,
): Promise<{ ok?: true; erro?: string }> {
  if (!ehFase(fase)) return { erro: "Fase desconhecida." };
  const r = await midiaDaMensagem(mensagemId);
  if ("erro" in r) return { erro: r.erro ?? "Mensagem não encontrada." };
  const servico = createServiceClient();
  const doc = await lerDocumentacaoDoLead(servico, r.leadId);
  const daLista = doc.fases[fase].itens.find((i) => mesmoItem(i, String(item ?? "")));
  if (!daLista) return { erro: "Esse documento não está na lista do lead." };

  const nome = r.caminho.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
  const extensao = nome.split(".").pop()?.toLowerCase() ?? "";
  const { error } = await servico.from("lead_documentos").insert({
    lead_id: r.leadId,
    corretor_id: r.corretor.id,
    item: daLista,
    fase,
    caminho: r.caminho,
    nome_arquivo: nome.slice(0, 120),
    mime: MIME_POR_EXTENSAO[extensao] ?? null,
    origem: "whatsapp",
    mensagem_id: mensagemId,
    situacao: "recebido",
  });
  if (error) {
    if (error.code === "23505") return { erro: "Este arquivo já está guardado nesse documento." };
    console.error("[documentação] guardar da conversa:", error.message);
    return { erro: "Não foi possível guardar agora." };
  }
  revalidatePath(`/corretor/leads/${r.leadId}`);
  return { ok: true };
}
