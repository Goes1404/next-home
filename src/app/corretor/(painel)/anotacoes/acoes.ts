"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";

/**
 * As ações do bloco de anotações (0100).
 *
 * Tudo pelo cliente de SESSÃO: a RLS recorta (autor OU destinatário leem e
 * atualizam; só o autor exclui) — id forjado de outra carteira simplesmente
 * não afeta linha nenhuma, o mesmo contrato de `conversas/acoes.ts`.
 *
 * Spec: docs/superpowers/specs/2026-09-06-anotacoes-do-corretor-design.md
 */

export type ResultadoAnotacao = { erro?: string; ok?: string };

const ROTA = "/corretor/anotacoes";

export async function criarAnotacao(params: {
  texto: string;
  leadId?: string | null;
  /** Colega que recebe; vazio = a nota é para o próprio autor. */
  destinatarioId?: string | null;
  /** ISO com fuso; null = nota sem lembrete. */
  lembreteEm?: string | null;
  lembreteWhatsapp?: boolean;
}): Promise<ResultadoAnotacao> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const texto = params.texto.trim().slice(0, 4000);
  if (!texto) return { erro: "Escreva a anotação antes de salvar." };

  if (params.lembreteEm && Number.isNaN(new Date(params.lembreteEm).getTime())) {
    return { erro: "A data do lembrete não é válida." };
  }
  // Lembrete no passado nasceria já vencido e dispararia o WhatsApp no
  // próximo tique — quase sempre é erro de digitação, não intenção.
  if (params.lembreteEm && new Date(params.lembreteEm).getTime() < Date.now() - 60_000) {
    return { erro: "O lembrete precisa ser de agora em diante." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("anotacoes").insert({
    corretor_id: corretor.id,
    destinatario_id: params.destinatarioId || corretor.id,
    lead_id: params.leadId || null,
    texto,
    lembrete_em: params.lembreteEm || null,
    lembrete_whatsapp: params.lembreteWhatsapp ?? true,
  });

  if (error) {
    console.error("[anotacoes] falha ao criar:", error.message);
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }

  revalidatePath(ROTA);
  return { ok: params.lembreteEm ? "Anotado — o lembrete está marcado." : "Anotado." };
}

/** O destinatário (ou o autor) marca o lembrete/nota como resolvido. */
export async function concluirAnotacao(id: string): Promise<ResultadoAnotacao> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anotacoes")
    .update({ concluida_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .is("concluida_em", null)
    .select("id");

  if (error) return { erro: "Não foi possível concluir agora." };
  if (!data || data.length === 0) return { erro: "Anotação não encontrada — talvez já concluída." };

  revalidatePath(ROTA);
  revalidatePath("/corretor");
  return { ok: "Concluída." };
}

export async function excluirAnotacao(id: string): Promise<ResultadoAnotacao> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("anotacoes").delete().eq("id", id).select("id");

  if (error) return { erro: "Não foi possível excluir agora." };
  // A RLS só deixa o AUTOR excluir: destinatário conclui, não apaga.
  if (!data || data.length === 0) return { erro: "Só quem escreveu a nota pode excluí-la." };

  revalidatePath(ROTA);
  return { ok: "Excluída." };
}

export type LeadParaVincular = { id: string; nome: string; telefone: string | null };

/**
 * Busca de lead para o chip de vínculo do composer — 8 resultados, por nome
 * ou telefone, só ativos. `sanearBusca` do PostgREST não é preciso aqui: a
 * consulta usa dois `ilike` separados, sem `.or()` com input cru.
 */
export async function buscarLeadsParaVincular(termo: string): Promise<LeadParaVincular[]> {
  const corretor = await getCorretorLogado();
  if (!corretor) return [];

  const t = termo.trim().replace(/[%_,()]/g, "");
  if (t.length < 2) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, nome, telefone")
    .is("arquivado_em", null)
    .ilike("nome", `%${t}%`)
    .order("created_at", { ascending: false })
    .limit(8);

  return (data ?? []) as LeadParaVincular[];
}
