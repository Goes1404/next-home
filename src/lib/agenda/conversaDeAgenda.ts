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

/** Quem está no meio de uma pergunta agora: a cobrança espera esses corretores. */
export async function corretoresComPergunta(supabase: Supa, agora = new Date()): Promise<string[]> {
  const { data, error } = await supabase
    .from("conversa_de_agenda")
    .select("corretor_id")
    .gt("expira_em", agora.toISOString());
  if (error) throw new Error(`Falha ao ler as perguntas pendentes: ${error.message}`);
  return (data ?? []).map((l) => l.corretor_id);
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

/**
 * Marca a mensagem do WhatsApp como tratada pelo canal (0228). Devolve false
 * se ela já tinha sido: é a reentrega do provedor e não se responde de novo.
 * Na falha da gravação, trata (melhor responder duas vezes que nenhuma).
 */
export async function registrarMensagem(supabase: Supa, corretorId: string, providerMessageId: string): Promise<boolean> {
  const { error } = await supabase
    .from("agenda_mensagens_tratadas")
    .insert({ corretor_id: corretorId, provider_message_id: providerMessageId });
  if (!error) return true;
  if (error.code === "23505") return false;
  console.error("[agenda] mensagem tratada não registrada:", error.message);
  return true;
}

/** As marcas de reentrega só servem por minutos; o tick apaga as de 2 dias. */
export async function limparMensagensTratadas(supabase: Supa, agora = new Date()): Promise<void> {
  const { error } = await supabase
    .from("agenda_mensagens_tratadas")
    .delete()
    .lt("criada_em", new Date(agora.getTime() - 2 * 86_400_000).toISOString());
  if (error) console.error("[agenda] limpeza das mensagens tratadas:", error.message);
}
