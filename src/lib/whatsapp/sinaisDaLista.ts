import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { MOTIVO_SEM_WHATSAPP, type SinaisDaLista } from "./pausaAutomatica";

/**
 * Os sinais que decidem a pausa automática de uma lista (07/10/2026), lidos
 * da fila: quantas saíram, quantas deram número sem WhatsApp e quantos que
 * receberam pediram depois para não ser contatados. Falha devolve null, e o
 * disparador segue: a pausa é proteção a mais, não pode travar o envio.
 */
export async function lerSinaisDaLista(
  supabase: SupabaseClient<Database>,
  campanhaId: string,
): Promise<SinaisDaLista | null> {
  const { data, error } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("status, erro_motivo, enviado_em, lead:leads(nao_contatar_em)")
    .eq("campanha_id", campanhaId)
    .in("status", ["enviado", "respondido", "erro"]);
  if (error || !data) return null;

  const sinais: SinaisDaLista = { enviados: 0, semWhatsapp: 0, pediramParaSair: 0 };
  for (const item of data) {
    if (item.status === "erro") {
      if (item.erro_motivo === MOTIVO_SEM_WHATSAPP) sinais.semWhatsapp++;
      continue;
    }
    sinais.enviados++;
    const lead = (Array.isArray(item.lead) ? item.lead[0] : item.lead) as { nao_contatar_em: string | null } | null;
    if (lead?.nao_contatar_em && item.enviado_em && lead.nao_contatar_em >= item.enviado_em) sinais.pediramParaSair++;
  }
  return sinais;
}
