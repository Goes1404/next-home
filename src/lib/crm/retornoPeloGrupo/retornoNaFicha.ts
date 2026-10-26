import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import { lerRetornoDaInteracao } from "./audioGuardado";
import { assinarAudiosDaFicha } from "./audioNoStorage";

/**
 * O que a ficha mostra do retorno da ligação que o corretor contou no grupo:
 * o resultado em palavras e o link do áudio (assinado por 1 hora).
 *
 * O link só sai para um lead que a SESSÃO enxerga (a leitura do grupo do lead
 * passa pelo cliente de sessão, sob RLS) e só para caminhos da pasta desse
 * grupo. Nunca se assina um caminho que veio do navegador: os caminhos são os
 * das linhas do histórico que a própria ficha acabou de ler.
 */

export type RetornoNaFicha = { resultado: string | null; audioUrl: string | null };

export async function retornosDaLigacaoNaFicha(p: {
  sessao: SupabaseClient<Database>;
  leadId: string;
  linhas: ReadonlyArray<{ id: string; tipo: string; detalhes: unknown }>;
  servico?: ReturnType<typeof createServiceClient>;
}): Promise<Map<string, RetornoNaFicha>> {
  const saida = new Map<string, RetornoNaFicha & { audioPath: string | null }>();
  for (const linha of p.linhas) {
    const retorno = lerRetornoDaInteracao(linha.tipo, linha.detalhes);
    if (retorno) saida.set(linha.id, { resultado: retorno.resultado, audioPath: retorno.audioPath, audioUrl: null });
  }

  const caminhos = [...saida.values()].map((r) => r.audioPath).filter((c): c is string => c !== null);
  if (caminhos.length > 0) {
    const { data: lead } = await p.sessao.from("leads").select("grupo_id").eq("id", p.leadId).maybeSingle();
    if (lead?.grupo_id) {
      const urls = await assinarAudiosDaFicha(p.servico ?? createServiceClient(), lead.grupo_id, caminhos);
      for (const r of saida.values()) r.audioUrl = (r.audioPath && urls.get(r.audioPath)) || null;
    }
  }

  return new Map([...saida].map(([id, r]) => [id, { resultado: r.resultado, audioUrl: r.audioUrl }]));
}
