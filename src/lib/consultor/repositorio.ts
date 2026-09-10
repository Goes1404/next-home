import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  dadosDoConsultor,
  type ConversaDoConsultor,
  type DadosDoConsultor,
  type MensagemDoConsultor,
} from "./contrato";

/**
 * Leitura e escrita das conversas do consultor.
 *
 * LEITURA com o cliente de SESSÃO (a RLS recorta pelo corretor logado);
 * ESCRITA com a service key, porque `authenticated` não tem insert nem update
 * (0101). A decisão de QUEM pode é sempre da sessão; a service key só executa
 * — mesma regra de `admin/acoes.ts` e do repositório do Estúdio.
 */

type LinhaMensagem = {
  id: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados: unknown;
  created_at: string;
};

function mapMensagem(l: LinhaMensagem): MensagemDoConsultor {
  return {
    id: l.id,
    papel: l.papel,
    conteudo: l.conteudo,
    dados: dadosDoConsultor(l.dados),
    createdAt: l.created_at,
  };
}

/** As conversas do corretor logado, a mais recente primeiro. */
export async function listarConversasDoConsultor(limite = 30): Promise<ConversaDoConsultor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consultor_conversas")
    .select("id, titulo, atualizado_em")
    .order("atualizado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, titulo: c.titulo, atualizadoEm: c.atualizado_em }));
}

/** Uma conversa com as mensagens em ordem. `null` se não é do corretor logado. */
export async function carregarConversaDoConsultor(
  conversaId: string,
): Promise<{ conversa: ConversaDoConsultor; mensagens: MensagemDoConsultor[] } | null> {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("consultor_conversas")
    .select("id, titulo, atualizado_em")
    .eq("id", conversaId)
    .maybeSingle();
  if (!c) return null;

  const { data: ms, error } = await supabase
    .from("consultor_mensagens")
    .select("id, papel, conteudo, dados, created_at")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return {
    conversa: { id: c.id, titulo: c.titulo, atualizadoEm: c.atualizado_em },
    mensagens: (ms ?? []).map((m) => mapMensagem(m as LinhaMensagem)),
  };
}

export async function criarConversaDoConsultor(params: {
  corretorId: string;
  titulo: string;
}): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("consultor_conversas")
    .insert({ corretor_id: params.corretorId, titulo: params.titulo })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function gravarMensagemDoConsultor(params: {
  conversaId: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados?: DadosDoConsultor | null;
}): Promise<MensagemDoConsultor> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("consultor_mensagens")
    .insert({
      conversa_id: params.conversaId,
      papel: params.papel,
      conteudo: params.conteudo,
      dados: params.dados ?? null,
    })
    .select("id, papel, conteudo, dados, created_at")
    .single();
  if (error) throw error;

  // A lista lateral ordena por `atualizado_em`: toda mensagem sobe a conversa.
  await supabase
    .from("consultor_conversas")
    .update({ atualizado_em: new Date().toISOString() })
    .eq("id", params.conversaId);

  return mapMensagem(data as LinhaMensagem);
}

/**
 * Confere que a conversa pertence ao corretor — pelo cliente de SESSÃO, que a
 * RLS recorta. Toda ação de escrita passa por aqui antes de usar a service
 * key.
 */
export async function conversaDoCorretor(conversaId: string): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("consultor_conversas")
    .select("id")
    .eq("id", conversaId)
    .maybeSingle();
  return data ?? null;
}

export async function excluirConversaDoConsultor(conversaId: string): Promise<boolean> {
  // DELETE é do `authenticated` por policy: o próprio corretor apaga a sua.
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("consultor_conversas")
    .delete({ count: "exact" })
    .eq("id", conversaId);
  return !error && (count ?? 0) > 0;
}
