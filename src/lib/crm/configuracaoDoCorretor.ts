import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { EstadoDaConfiguracao } from "@/lib/crm/primeirosPassos";

/**
 * Lê o estado da configuração de um ou mais corretores. O cliente vem de
 * fora: o Início usa a sessão do próprio corretor; a visão do gestor usa a
 * chave de serviço DEPOIS da guarda de papel (a agenda de um colega não é
 * legível pela RLS do gestor).
 *
 * Cinco consultas no total, qualquer que seja o número de corretores.
 */
export async function carregarConfiguracao(
  supabase: SupabaseClient<Database>,
  corretorIds: string[],
): Promise<Map<string, EstadoDaConfiguracao>> {
  const resultado = new Map<string, EstadoDaConfiguracao>();
  if (corretorIds.length === 0) return resultado;

  const [{ data: corretores }, { data: instancias }, { data: faixas }, { data: leads }] = await Promise.all([
    supabase.from("corretores").select("id, foto_url, bio").in("id", corretorIds),
    supabase
      .from("corretor_whatsapp_instancias")
      .select("corretor_id")
      .in("corretor_id", corretorIds)
      .eq("status_conexao", "conectado"),
    supabase.from("corretor_disponibilidade").select("corretor_id").in("corretor_id", corretorIds),
    // Só a existência de lead importa: basta saber se há algum por corretor.
    supabase
      .from("leads")
      .select("corretor_id")
      .in("corretor_id", corretorIds)
      .is("arquivado_em", null)
      .limit(5000),
  ]);

  const conta = (linhas: Array<{ corretor_id: string | null }> | null) => {
    const m = new Map<string, number>();
    for (const l of linhas ?? []) if (l.corretor_id) m.set(l.corretor_id, (m.get(l.corretor_id) ?? 0) + 1);
    return m;
  };
  const conectados = conta(instancias);
  const agenda = conta(faixas);
  const carteira = conta(leads);

  for (const c of corretores ?? []) {
    resultado.set(c.id, {
      whatsappConectado: (conectados.get(c.id) ?? 0) > 0,
      faixasDeAgenda: agenda.get(c.id) ?? 0,
      temFoto: Boolean(c.foto_url),
      temApresentacao: Boolean(c.bio && c.bio.trim().length >= 20),
      leads: carteira.get(c.id) ?? 0,
    });
  }
  return resultado;
}
