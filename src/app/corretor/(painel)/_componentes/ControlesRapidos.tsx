import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { BotoesRapidos } from "./BotoesRapidos";

/**
 * Os interruptores do Início (20/10/2026): pausar a IA do número e, só para o
 * gestor, dividir os leads do anúncio (roleta, 0204; só do gestor desde
 * 03/11/2026 — o lead do anúncio do corretor é dele). Some sem número
 * conectado ao painel — os dois só fazem sentido com ele.
 */
export async function ControlesRapidos() {
  const quem = await getCorretorLogado();
  if (!quem) return null;
  const supabase = createServiceClient();
  const gestor = quem.papel === "gestor";
  const [{ data: inst }, { data: roleta }] = await Promise.all([
    supabase.from("corretor_whatsapp_instancias").select("modo_bot").eq("corretor_id", quem.id).maybeSingle(),
    gestor
      ? supabase.from("roleta_anuncios").select("ligada, destinos").eq("corretor_id", quem.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!inst) return null;
  return (
    <BotoesRapidos
      iaPausada={inst.modo_bot === "desativado"}
      comRoleta={gestor}
      roletaLigada={Boolean(roleta?.ligada)}
      roletaComLista={Boolean(roleta?.destinos?.length)}
    />
  );
}
