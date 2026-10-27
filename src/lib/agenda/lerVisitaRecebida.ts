import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { DadosDoPreparo } from "@/lib/crm/preparoDaVisita";
import { lerPreparo } from "./lerEquipe";
import { SELECT_VISITA, itemDaVisita, type LinhaVisita, type VisitaDoItem } from "./linhaDaVisita";

export type VisitaRecebida = {
  visita: VisitaDoItem;
  preparo: DadosDoPreparo;
  anotacoes: { id: string; texto: string; criadaEm: string }[];
};

/**
 * A ficha da visita para quem a RECEBEU do gestor (0223): o lead não é dele,
 * então a ficha normal (`/corretor/leads/[id]`, RLS de `leads`) não abre.
 * Aqui vai o que a visita pede — dados, preferências, preparo e as últimas
 * anotações — e NUNCA a conversa do WhatsApp (decisão do dono).
 *
 * Só devolve se a visita é de quem pergunta, do grupo dele e ainda marcada:
 * o acesso termina quando a visita termina (realizada, falta, cancelada ou
 * devolvida ao dono).
 */
export async function lerVisitaRecebida(p: {
  visitaId: string;
  corretorId: string;
  grupoId: string;
}): Promise<VisitaRecebida | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("visitas")
    .select(SELECT_VISITA)
    .eq("id", p.visitaId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .eq("status", "marcada")
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler a visita: ${error.message}`);
  const visita = data ? itemDaVisita(data as unknown as LinhaVisita) : null;
  if (!visita) return null;

  const [preparo, { data: anotacoes }] = await Promise.all([
    lerPreparo(p.grupoId, [visita.leadId]),
    supabase
      .from("anotacoes")
      .select("id, texto, created_at")
      .eq("grupo_id", p.grupoId)
      .eq("lead_id", visita.leadId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return {
    visita,
    preparo: preparo.get(visita.leadId) ?? {},
    anotacoes: (anotacoes ?? []).map((a) => ({ id: a.id, texto: a.texto, criadaEm: a.created_at })),
  };
}
