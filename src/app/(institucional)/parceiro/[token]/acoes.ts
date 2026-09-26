"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { TETO_INDICACOES_POR_HORA } from "@/lib/crm/espelhoDeVendas";
import { normalizarTelefoneBr } from "@/lib/whatsapp/telefone";
import { site } from "@/lib/site";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O parceiro indica um cliente pelo espelho (0125). Endpoint público: o
 * token é conferido a CADA chamada, e há teto por hora. O lead nasce sem
 * corretor — a roleta do banco escolhe — e marcado com o parceiro, que
 * aparece na ficha e é quem entra na co-corretagem da venda.
 */
export async function indicarCliente(
  token: string,
  entrada: { nome: string; telefone: string; empreendimentoId: string | null; observacao: string; consentiu: boolean },
): Promise<{ ok?: string; erro?: string }> {
  if (!UUID.test(token)) return { erro: "Link inválido." };
  const nome = entrada.nome.trim().slice(0, 120);
  const telefone = normalizarTelefoneBr(entrada.telefone);
  if (nome.length < 2) return { erro: "Informe o nome do cliente." };
  if (!telefone) return { erro: "Informe um WhatsApp válido do cliente, com DDD." };
  if (!entrada.consentiu) return { erro: "Confirme que o cliente sabe que será procurado." };

  const supabase = createServiceClient();
  const { data: parceiro } = await supabase
    .from("parceiros")
    .select("id, nome, imobiliaria, ativo")
    .eq("token", token)
    .maybeSingle();
  if (!parceiro || !parceiro.ativo) return { erro: "Este link não está mais ativo. Fale com a imobiliária." };

  const umaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("parceiro_id", parceiro.id)
    .gte("created_at", umaHora);
  if ((count ?? 0) >= TETO_INDICACOES_POR_HORA) return { erro: "Muitas indicações seguidas. Tente de novo mais tarde." };

  let empreendimentoId: string | null = null;
  let nomeImovel: string | null = null;
  if (entrada.empreendimentoId && UUID.test(entrada.empreendimentoId)) {
    const { data: e } = await supabase
      .from("empreendimentos")
      .select("id, nome")
      .eq("id", entrada.empreendimentoId)
      .eq("publicado", true)
      .maybeSingle();
    empreendimentoId = e?.id ?? null;
    nomeImovel = e?.nome ?? null;
  }

  const quem = `${parceiro.nome}${parceiro.imobiliaria ? ` (${parceiro.imobiliaria})` : ""}`;
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      nome,
      telefone,
      empreendimento_id: empreendimentoId,
      mensagem: [`Indicado pelo parceiro ${quem}.`, entrada.observacao.trim().slice(0, 1000)].filter(Boolean).join("\n"),
      origem: "parceiro",
      tipo: "comprador",
      parceiro_id: parceiro.id,
      consentimento_lgpd: true,
    })
    .select("id, corretor_id")
    .single();
  if (error || !lead) return { erro: "Não consegui registrar agora. Tente de novo." };

  if (lead.corretor_id) {
    await avisarCorretor(
      supabase,
      lead.corretor_id,
      `🤝 O parceiro ${quem} indicou ${nome}${nomeImovel ? ` para o ${nomeImovel}` : ""}. Fale com ele enquanto a indicação está quente.\n${site.url}/corretor/leads/${lead.id}`,
    );
  }
  return { ok: `${nome} foi indicado. Um corretor da equipe entra em contato e você acompanha com a imobiliária.` };
}
