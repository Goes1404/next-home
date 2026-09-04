import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  dadosDaMensagem,
  type ConversaDoEstudio,
  type DadosDaMensagem,
  type MensagemDoEstudio,
  type TipoEstudio,
} from "./contrato";

/**
 * Leitura e escrita das conversas do Estúdio.
 *
 * LEITURA com o cliente de SESSÃO (RLS recorta pelo corretor logado);
 * ESCRITA com a service key, porque `authenticated` não tem insert/update —
 * a proposta da IA e o vínculo com a peça paga são o que sustenta "só gera
 * depois do OK", e forjados pela API virariam gasto sem proposta (0096).
 */

type LinhaMensagem = {
  id: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados: unknown;
  imagem_id: string | null;
  video_job_id: string | null;
  created_at: string;
};

function mapMensagem(l: LinhaMensagem): MensagemDoEstudio {
  return {
    id: l.id,
    papel: l.papel,
    conteudo: l.conteudo,
    dados: dadosDaMensagem(l.dados),
    imagemId: l.imagem_id,
    videoJobId: l.video_job_id,
    createdAt: l.created_at,
  };
}

/** As conversas do corretor logado, a mais recente primeiro. */
export async function listarConversas(tipo: TipoEstudio, limite = 30): Promise<ConversaDoEstudio[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estudio_conversas")
    .select("id, tipo, titulo, atualizado_em")
    .eq("tipo", tipo)
    .order("atualizado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    tipo: c.tipo,
    titulo: c.titulo,
    atualizadoEm: c.atualizado_em,
  }));
}

/** Uma conversa com as mensagens em ordem. `null` se não é do corretor logado. */
export async function carregarConversa(
  conversaId: string,
): Promise<{ conversa: ConversaDoEstudio; mensagens: MensagemDoEstudio[] } | null> {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("estudio_conversas")
    .select("id, tipo, titulo, atualizado_em")
    .eq("id", conversaId)
    .maybeSingle();
  if (!c) return null;

  const { data: ms, error } = await supabase
    .from("estudio_mensagens")
    .select("id, papel, conteudo, dados, imagem_id, video_job_id, created_at")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return {
    conversa: { id: c.id, tipo: c.tipo, titulo: c.titulo, atualizadoEm: c.atualizado_em },
    mensagens: (ms ?? []).map((m) => mapMensagem(m as LinhaMensagem)),
  };
}

export async function criarConversa(params: {
  corretorId: string;
  tipo: TipoEstudio;
  titulo: string;
}): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("estudio_conversas")
    .insert({ corretor_id: params.corretorId, tipo: params.tipo, titulo: params.titulo })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function gravarMensagemDoEstudio(params: {
  conversaId: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados?: DadosDaMensagem | null;
  imagemId?: string | null;
  videoJobId?: string | null;
}): Promise<MensagemDoEstudio> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("estudio_mensagens")
    .insert({
      conversa_id: params.conversaId,
      papel: params.papel,
      conteudo: params.conteudo,
      dados: params.dados ?? null,
      imagem_id: params.imagemId ?? null,
      video_job_id: params.videoJobId ?? null,
    })
    .select("id, papel, conteudo, dados, imagem_id, video_job_id, created_at")
    .single();
  if (error) throw error;

  // A lista lateral ordena por `atualizado_em`: toda mensagem sobe a conversa.
  await supabase
    .from("estudio_conversas")
    .update({ atualizado_em: new Date().toISOString() })
    .eq("id", params.conversaId);

  return mapMensagem(data as LinhaMensagem);
}

/**
 * Confere que a conversa pertence ao corretor — pelo cliente de SESSÃO, que a
 * RLS recorta. Toda ação de escrita passa por aqui antes de usar a service key:
 * a decisão de QUEM pode é sempre da sessão; a service key só executa.
 */
export async function conversaDoCorretor(
  conversaId: string,
): Promise<{ id: string; tipo: TipoEstudio } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("estudio_conversas")
    .select("id, tipo")
    .eq("id", conversaId)
    .maybeSingle();
  return data ?? null;
}

export async function excluirConversa(conversaId: string): Promise<boolean> {
  // DELETE é do `authenticated` por policy: o próprio corretor apaga a sua.
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("estudio_conversas")
    .delete({ count: "exact" })
    .eq("id", conversaId);
  return !error && (count ?? 0) > 0;
}
