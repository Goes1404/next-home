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
 * das linhas do histórico que a própria ficha acabou de ler, e só os que um
 * retorno deste lead guardou de fato (`retornos_de_ligacao`).
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
      const servico = p.servico ?? createServiceClient();
      const guardados = await audiosGuardadosDoLead(servico, lead.grupo_id, p.leadId);
      const urls = await assinarAudiosDaFicha(
        servico,
        lead.grupo_id,
        caminhos.filter((c) => guardados.has(c)),
      );
      for (const r of saida.values()) r.audioUrl = (r.audioPath && urls.get(r.audioPath)) || null;
    }
  }

  return new Map([...saida].map(([id, r]) => [id, { resultado: r.resultado, audioUrl: r.audioUrl }]));
}

/*
 * O caminho do histórico (`detalhes.audio_path`) é só o rótulo da linha: o
 * que vale é o áudio que o número central guardou para ESTE lead, neste
 * grupo, em `retornos_de_ligacao`. Sem isso, uma linha torta assinaria o
 * áudio do relato de outro cliente da mesma pasta. Falhou a leitura: nenhum
 * link (o áudio é acessório; a ficha abre do mesmo jeito).
 */
async function audiosGuardadosDoLead(
  servico: ReturnType<typeof createServiceClient>,
  grupoId: string,
  leadId: string,
): Promise<Set<string>> {
  const { data, error } = await servico
    .from("retornos_de_ligacao")
    .select("audio_path")
    .eq("grupo_id", grupoId)
    .eq("lead_id", leadId)
    .not("audio_path", "is", null);
  if (error) {
    console.error("[retorno] áudios do lead não conferidos:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((l) => l.audio_path).filter((c): c is string => typeof c === "string"));
}
