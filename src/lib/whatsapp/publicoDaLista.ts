import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapLead, SELECT_LEAD, type LinhaLead } from "@/lib/corretorSessao";
import type { Database } from "@/lib/supabase/types";
import type { Lead } from "@/lib/types";

/**
 * De onde a lista de transmissão tira as pessoas (roadmap das listas, 03/10).
 *
 * Um lugar só, usado pela tela (com a sessão do corretor) e pela lista viva
 * (com o cliente de serviço, num tique do disparador). Duas cópias da regra
 * "quem pode receber" divergiriam, e uma delas mandaria mensagem para quem a
 * outra protegia.
 */

type Supa = SupabaseClient<Database>;

/** Evita repetir propaganda para a mesma pessoa dentro da mesma semana. */
export const DIAS_SEM_REPETIR_CAMPANHA = 7;

/**
 * Os leads DESTE corretor, ativos (não arquivados).
 *
 * O filtro por `corretor_id` é explícito de propósito. Antes, a lista vinha
 * de `getMeusLeads`, que confia na RLS — e a RLS deixa o gestor ver a equipe
 * inteira. Resultado: "Todos os meus leads", para o gestor, mandava mensagem
 * pelo número DELE aos clientes dos colegas.
 */
export async function leadsDoCorretor(supabase: Supa, corretorId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select(SELECT_LEAD)
    .eq("corretor_id", corretorId)
    .is("arquivado_em", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`);
  return (data as unknown as LinhaLead[]).map(mapLead);
}

/**
 * Quem NÃO pode entrar numa lista nova deste corretor: pendente em outra
 * lista, ou que recebeu mensagem de lista nos últimos 7 dias. Erro definitivo
 * não protege (a pessoa não recebeu nada).
 */
export async function idsProtegidosDeNovaLista(supabase: Supa, corretorId: string): Promise<Set<string>> {
  const limite = new Date(Date.now() - DIAS_SEM_REPETIR_CAMPANHA * 86_400_000).toISOString();
  const { data: itens, error } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("lead_id, campanha:whatsapp_campanhas!inner(corretor_id)")
    .eq("campanha.corretor_id", corretorId)
    .not("lead_id", "is", null)
    .or(`status.eq.pendente,enviado_em.gte.${limite}`);
  if (error) throw new Error(`Falha ao conferir contatos recentes: ${error.message}`);
  return new Set((itens ?? []).flatMap((i) => (i.lead_id ? [i.lead_id] : [])));
}

/** O corretor tem horários de visita configurados? Sem isso `{horarios}` não tem o que oferecer. */
export async function corretorTemAgenda(supabase: Supa, corretorId: string): Promise<boolean> {
  const { count } = await supabase
    .from("corretor_disponibilidade")
    .select("dia_semana", { count: "exact", head: true })
    .eq("corretor_id", corretorId);
  return (count ?? 0) > 0;
}
