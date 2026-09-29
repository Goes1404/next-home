import "server-only";
import { site } from "@/lib/site";
import type { createServiceClient } from "@/lib/supabase/service";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { NOME_DO_PORTAL } from "@/lib/whatsapp/aberturaPelaIA";
import { MINUTOS_SEM_CONTATO, textoDeLeadSemContato } from "@/lib/crm/semContato";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Lead de portal ou anúncio sem nenhum contato nosso em 30 minutos (0121).
 *
 * É o lead mais caro da carteira — foi pago — e o que esfria mais rápido:
 * quem pediu contato num portal pediu em outros três. A abertura automática
 * (`abrirConversasDePortal`) cobre quem tem número conectado; este aviso
 * cobre o resto (número fora do ar, IA desligada, cota) e avisa UMA vez.
 *
 * O carimbo (`alerta_sem_contato_em`) é o claim e vale também quando o
 * lead JÁ teve contato: assim ele não é olhado de novo a cada tique.
 * Janela de 24h: lead mais velho que isso não é mais notícia de agora.
 */
export async function alertarLeadsSemContato(supabase: Supa, agora = new Date(), limite = 10): Promise<number> {
  const ate = new Date(agora.getTime() - MINUTOS_SEM_CONTATO * 60_000).toISOString();
  const desde = new Date(agora.getTime() - 24 * 3_600_000).toISOString();
  const { data: candidatos } = await supabase
    .from("leads")
    .select("id, nome, telefone, corretor_id, portal_origem, meta_lead_id, created_at")
    .is("alerta_sem_contato_em", null)
    .is("arquivado_em", null)
    .is("nao_contatar_em", null)
    .not("corretor_id", "is", null)
    .or("portal_origem.not.is.null,meta_lead_id.not.is.null")
    .gte("created_at", desde)
    .lte("created_at", ate)
    .order("created_at", { ascending: true })
    .limit(limite);

  let avisados = 0;
  for (const lead of candidatos ?? []) {
    const { data: claim } = await supabase
      .from("leads")
      .update({ alerta_sem_contato_em: agora.toISOString() })
      .eq("id", lead.id)
      .is("alerta_sem_contato_em", null)
      .select("id");
    if (!claim || claim.length === 0) continue;

    // Contato nosso = qualquer mensagem da IA ou do corretor na conversa.
    const { data: conversas } = await supabase.from("whatsapp_conversas").select("id").eq("lead_id", lead.id);
    const ids = (conversas ?? []).map((c) => c.id);
    if (ids.length > 0) {
      const { count } = await supabase
        .from("whatsapp_mensagens")
        .select("id", { count: "exact", head: true })
        .in("conversa_id", ids)
        .in("remetente", ["bot", "corretor"]);
      if ((count ?? 0) > 0) continue;
    }

    const origem = lead.portal_origem
      ? (NOME_DO_PORTAL[lead.portal_origem] ?? "portal")
      : "anúncio do Facebook/Instagram";
    const texto = textoDeLeadSemContato({
      nome: nomeParaExibir(lead),
      origem,
      minutos: Math.round((agora.getTime() - new Date(lead.created_at).getTime()) / 60_000),
      fichaUrl: `${site.url}/corretor/leads/${lead.id}`,
    });
    if (await avisarCorretor(supabase, lead.corretor_id!, texto)) avisados++;
  }
  return avisados;
}
