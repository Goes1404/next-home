import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { janelaAberta, painelOficialDoLead } from "@/lib/whatsapp/oficial/painelDoLead";
import { PainelDoNumeroOficial } from "./NumeroOficialClient";

/**
 * O número oficial da imobiliária na ficha do lead (F3). Some inteiro quando
 * o grupo não tem número oficial (ou a 0256 ainda não foi aplicada) e para
 * quem não é o corretor DONO do lead: o gestor não lê conversa (0134), nem
 * pela ficha de um lead da equipe.
 */
export async function NumeroOficialDoLead({ leadId, donoId, nome }: { leadId: string; donoId: string | null; nome: string }) {
  const corretor = await getCorretorLogado();
  if (!corretor || !donoId || corretor.id !== donoId) return null;
  const painel = await painelOficialDoLead(createServiceClient(), corretor.grupoId, leadId);
  if (!painel) return null;
  const conversa = painel.conversa ? { ...painel.conversa, janelaAberta: janelaAberta(painel.conversa.janelaAte) } : null;
  return <PainelDoNumeroOficial leadId={leadId} nome={nome} painel={{ ...painel, conversa }} />;
}
