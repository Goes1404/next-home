import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { processarRetornoDoCorretor } from "./aplicar";

export { TEXTO_AUDIO_NAO_ENTENDIDO, TEXTO_NAO_E_MAIS_SEU, TEXTO_SEM_LEITURA, textoDaConfirmacao, textoDaPergunta } from "./textos";

/**
 * Porta de entrada do webhook para mensagem de grupo (spec 6.2, passo 1).
 *
 * Exceção estreita ao descarte de `@g.us`: só é tratada a mensagem que chega
 * pelo número central de um grupo com o envio para grupos ligado, num grupo
 * de WhatsApp que é o de um corretor ativo DESSE grupo. Todo o resto devolve
 * `tratada: false` e o webhook segue descartando como sempre. Tratada, nunca
 * lança: erro vai para o log e o webhook responde 200 do mesmo jeito.
 */
export async function tratarMensagemDoGrupoDeLeads(p: {
  payload: unknown;
  instanceName: string;
  jidBruto: string;
}): Promise<{ tratada: boolean }> {
  const jid = p.jidBruto?.trim();
  if (!p.instanceName || !jid || !/@g\.us$/i.test(jid)) return { tratada: false };

  let alvo: { grupoId: string; corretor: { id: string; whatsapp: string; whatsapp_lid: string | null } } | null;
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
    alvo = await grupoECorretorDoJid(supabase, p.instanceName, jid);
  } catch (erro) {
    console.error("[retorno] não deu para conferir o grupo de leads:", erro);
    return { tratada: false };
  }
  if (!alvo) return { tratada: false };

  try {
    await processarRetornoDoCorretor({
      supabase,
      grupoId: alvo.grupoId,
      instanceName: p.instanceName,
      corretor: alvo.corretor,
      payload: p.payload,
    });
  } catch (erro) {
    console.error("[retorno] falha ao processar o retorno do corretor:", erro);
  }
  return { tratada: true };
}

async function grupoECorretorDoJid(
  supabase: ReturnType<typeof createServiceClient>,
  instanceName: string,
  jid: string,
) {
  const { data: grupos, error } = await supabase
    .from("grupos")
    .select("id")
    .eq("envio_grupo_leads_instancia", instanceName)
    .eq("envio_grupo_leads_ativo", true);
  if (error) throw new Error(`grupos do número central: ${error.message}`);

  for (const grupo of grupos ?? []) {
    const { data: corretores, error: erroCorretor } = await supabase
      .from("corretores")
      .select("id, whatsapp, whatsapp_lid")
      .eq("grupo_id", grupo.id)
      .eq("whatsapp_grupo_leads_jid", jid)
      .eq("ativo", true)
      .limit(2);
    if (erroCorretor) throw new Error(`corretor do grupo de WhatsApp: ${erroCorretor.message}`);
    // Dois corretores no mesmo grupo de WhatsApp a sincronização recusa; se
    // ainda assim acontecer, não há como saber de quem é o relato.
    if (corretores && corretores.length === 1) {
      const c = corretores[0];
      return { grupoId: grupo.id, corretor: { id: c.id, whatsapp: c.whatsapp ?? "", whatsapp_lid: c.whatsapp_lid } };
    }
    if (corretores && corretores.length > 1) {
      console.warn(`[retorno] grupo de WhatsApp ${jid} mapeado para mais de um corretor; ignorado.`);
      return null;
    }
  }
  return null;
}
