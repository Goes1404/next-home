import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * A conta é "só WhatsApp" (0180)? Todas as conversas do número aparecem no
 * painel, sem virar lead, com o texto guardado e a IA desligada.
 *
 * Consulta à parte e tolerante a erro de propósito: sem a 0180 aplicada a
 * coluna não existe, e embutida na leitura do corretor ou da instância ela
 * derrubaria o webhook e o painel inteiros. Na dúvida, a conta é comum — o
 * comportamento de antes.
 */
export async function ehContaSoWhatsapp(
  supabase: SupabaseClient<Database>,
  corretorId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("corretores")
    .select("so_whatsapp")
    .eq("id", corretorId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.so_whatsapp);
}
