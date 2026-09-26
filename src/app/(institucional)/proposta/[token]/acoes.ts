"use server";

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { lerLinkPublico } from "@/lib/crm/linkPublico";
import { lerProposta, propostaVencida, type RespostaDaProposta } from "@/lib/crm/proposta";
import { avisarCorretorDoLink, registrarEventoDoLink } from "@/lib/crm/eventosDoLink";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";

/**
 * O cliente responde à proposta (0123). Endpoint PÚBLICO: o token é a
 * credencial. Proposta vencida não recebe resposta — o corretor manda uma
 * nova. A mesma resposta repetida não gera outro aviso.
 *
 * "Aceito" NÃO move o lead de etapa nem registra venda: aceitar a proposta
 * é o começo da documentação, e quem decide a etapa é o corretor
 * (`etapaAutomatica.test.ts`). O que muda é que ele fica sabendo na hora.
 */
export async function responderProposta(
  token: string,
  resposta: RespostaDaProposta,
): Promise<{ ok?: true; erro?: string }> {
  if (resposta !== "aceitou" && resposta !== "quer_conversar") return { erro: "Resposta inválida." };
  const link = await lerLinkPublico(String(token), "proposta", { previa: true });
  if (!link) return { erro: "Este link venceu. Peça uma nova proposta ao seu corretor." };
  const proposta = lerProposta(link.dados);
  if (!proposta) return { erro: "Proposta inválida." };
  if (propostaVencida(proposta)) return { erro: "Esta proposta venceu. Fale com seu corretor para uma nova." };

  const supabase = createServiceClient();
  const { data: ultima } = await supabase
    .from("links_do_cliente_eventos")
    .select("tipo")
    .eq("token", token)
    .in("tipo", ["aceitou", "quer_conversar"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultima?.tipo === resposta) return { ok: true };

  const detalhe = `${proposta.imovel}${proposta.unidade ? `, unidade ${proposta.unidade}` : ""}, ${formatarMoedaBRL(proposta.valor)}`;
  const evento = { token, leadId: link.leadId, corretorId: link.corretorId, tipo: resposta, detalhe };
  await registrarEventoDoLink(supabase, evento);
  after(async () => {
    const { data: lead } = await supabase.from("leads").select("nome").eq("id", link.leadId).maybeSingle();
    await avisarCorretorDoLink(supabase, { ...evento, nomeLead: lead?.nome ?? null });
  });
  return { ok: true };
}
