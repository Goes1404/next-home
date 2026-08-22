import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { TipoInteracao } from "./timeline";

/**
 * Grava um evento na linha do tempo do lead.
 *
 * Deliberadamente "best effort": recebe o cliente de sessão de quem já está
 * fazendo a operação principal e NUNCA lança. Falhar em registrar o
 * histórico não pode desfazer a mudança de etapa que o corretor acabou de
 * fazer na tela — o registro é a memória, não a transação.
 *
 * A RLS da 0032 é quem decide se a linha entra: um `lead_id` que não é do
 * corretor simplesmente não grava.
 */
export async function registrarInteracao(
  supabase: SupabaseClient<Database>,
  entrada: {
    leadId: string;
    corretorId: string | null;
    tipo: TipoInteracao;
    conteudo: string;
    detalhes?: Record<string, Json>;
  },
): Promise<void> {
  try {
    await supabase.from("lead_interacoes").insert({
      lead_id: entrada.leadId,
      corretor_id: entrada.corretorId,
      tipo: entrada.tipo,
      conteudo: entrada.conteudo,
      detalhes: entrada.detalhes ?? {},
    });
  } catch {
    // silêncio proposital — ver comentário acima
  }
}
