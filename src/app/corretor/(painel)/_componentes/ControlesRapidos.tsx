import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { BotoesRapidos } from "./BotoesRapidos";

/**
 * Os dois interruptores do Início (20/10/2026): pausar a IA do número e
 * dividir os leads do anúncio (roleta, 0204). Some sem número conectado ao
 * painel — os dois só fazem sentido com ele.
 */
export async function ControlesRapidos() {
  const quem = await getCorretorLogado();
  if (!quem) return null;
  const supabase = createServiceClient();
  const [{ data: inst }, { data: roleta }] = await Promise.all([
    supabase.from("corretor_whatsapp_instancias").select("modo_bot").eq("corretor_id", quem.id).maybeSingle(),
    supabase.from("roleta_anuncios").select("ligada, destinos").eq("corretor_id", quem.id).maybeSingle(),
  ]);
  if (!inst) return null;
  return (
    <BotoesRapidos
      iaPausada={inst.modo_bot === "desativado"}
      roletaLigada={Boolean(roleta?.ligada)}
      roletaComLista={Boolean(roleta?.destinos?.length)}
    />
  );
}
