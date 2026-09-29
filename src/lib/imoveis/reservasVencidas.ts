import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { revalidarCatalogo } from "@/lib/catalogo/revalidar";

/**
 * Reserva vencida volta a disponível (0121). Roda no tique dos follow-ups.
 * Sem isto a unidade reservada "até sexta" ficava reservada para sempre, e
 * o site e a IA diziam que restava uma unidade a menos do que resta.
 */
export async function liberarReservasVencidas(
  supabase: ReturnType<typeof createServiceClient>,
  agora = new Date(),
): Promise<number> {
  const { data, error } = await supabase
    .from("unidades")
    .update({ status: "disponivel", reservada_ate: null, atualizado_em: agora.toISOString() })
    .eq("status", "reservada")
    .lt("reservada_ate", agora.toISOString())
    .select("id");
  if (error) {
    console.warn("[unidades] reservas vencidas não liberadas:", error.message);
    return 0;
  }
  if (data && data.length > 0) revalidarCatalogo();
  return data?.length ?? 0;
}
