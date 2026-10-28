import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import type { PedidoAConfirmar } from "./comandos/tipos";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * A pergunta pendente na conversa do corretor com o sistema pelo WhatsApp
 * (0227): a cobrança "a visita aconteceu?" esperando 1/2/3, a nova data do
 * "remarcou", o pedido esperando "sim", ou a escolha entre clientes com o
 * mesmo nome. Uma por corretor; vencida, é como se não existisse.
 */
export type EstadoDaConversa =
  | { tipo: "cobranca"; visitaId: string; nome: string }
  | { tipo: "cobranca_nova_data"; visitaId: string; nome: string }
  | { tipo: "confirmar"; pedido: PedidoAConfirmar; leadId?: string; participantes?: string[] }
  | { tipo: "escolher_lead"; pedido: PedidoAConfirmar; opcoes: { id: string; nome: string }[] };

/** Quanto vale cada pergunta: a cobrança, um dia; o resto, meia hora. */
export const VALIDADE_MIN: Record<EstadoDaConversa["tipo"], number> = {
  cobranca: 24 * 60,
  cobranca_nova_data: 60,
  confirmar: 30,
  escolher_lead: 30,
};

export async function lerEstado(supabase: Supa, corretorId: string, agora = new Date()): Promise<EstadoDaConversa | null> {
  const { data } = await supabase
    .from("conversa_de_agenda")
    .select("estado, expira_em")
    .eq("corretor_id", corretorId)
    .maybeSingle();
  if (!data || Date.parse(data.expira_em) <= agora.getTime()) return null;
  return data.estado as unknown as EstadoDaConversa;
}

export async function gravarEstado(
  supabase: Supa,
  p: { corretorId: string; grupoId: string; estado: EstadoDaConversa },
  agora = new Date(),
): Promise<void> {
  const expira = new Date(agora.getTime() + VALIDADE_MIN[p.estado.tipo] * 60_000);
  await supabase.from("conversa_de_agenda").upsert({
    corretor_id: p.corretorId,
    grupo_id: p.grupoId,
    estado: p.estado as unknown as never,
    expira_em: expira.toISOString(),
    atualizado_em: agora.toISOString(),
  });
}

export async function limparEstado(supabase: Supa, corretorId: string): Promise<void> {
  await supabase.from("conversa_de_agenda").delete().eq("corretor_id", corretorId);
}
