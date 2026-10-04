import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { elegivel, noRecorte, type FiltroLeadsCampanha, type RecorteDeOrigem } from "@/lib/crm/publicoDaCampanha";
import { montarFilaCampanha } from "./campaignQueue";
import { idsProtegidosDeNovaLista, leadsDoCorretor } from "./publicoDaLista";
import type { ContextoTemplate } from "./listaDeTransmissao";

/**
 * A lista VIVA (roadmap das listas, Fase 3, 03/10/2026).
 *
 * Uma lista comum é uma foto: quem se encaixava no critério no instante em
 * que ela foi montada. A viva guarda o CRITÉRIO e, durante 30 dias, inclui
 * sozinha quem passa a se encaixar ("quem esfriou no Dom Parque" ganha gente
 * toda semana). As proteções são as mesmas de uma lista nova: quem recebeu
 * lista nos últimos 7 dias, está pendente em outra, pediu para sair ou foi
 * arquivado não entra; e quem já está nesta lista nunca entra duas vezes.
 *
 * Roda no tique do disparador, no máximo uma vez por hora por lista. O
 * carimbo `viva_varrida_em` é o claim: dois tiques simultâneos não incluem a
 * mesma pessoa duas vezes.
 */

const MINUTOS_ENTRE_VARREDURAS = 60;

export type CriterioDaLista = {
  filtro: FiltroLeadsCampanha;
  imovelSlug?: string | null;
  recorte?: RecorteDeOrigem | null;
};

export async function alimentarListasVivas(agora: Date = new Date()): Promise<number> {
  const supabase = createServiceClient();
  const limite = new Date(agora.getTime() - MINUTOS_ENTRE_VARREDURAS * 60_000).toISOString();

  const { data: vivas } = await supabase
    .from("whatsapp_campanhas")
    .select(
      "id, corretor_id, criterio, mensagem_base, mensagem_base_b, variante_vencedora, ignorar_janela, contexto_template, status, total_leads, empreendimento:empreendimentos(nome)",
    )
    .eq("viva", true)
    .gt("viva_ate", agora.toISOString())
    .in("status", ["em_andamento", "concluida"])
    .or(`viva_varrida_em.is.null,viva_varrida_em.lt.${limite}`)
    .limit(20);

  let incluidos = 0;
  for (const c of vivas ?? []) {
    const { data: claim } = await supabase
      .from("whatsapp_campanhas")
      .update({ viva_varrida_em: agora.toISOString() })
      .eq("id", c.id)
      .or(`viva_varrida_em.is.null,viva_varrida_em.lt.${limite}`)
      .select("id");
    if (!claim || claim.length === 0) continue;

    const criterio = c.criterio as CriterioDaLista | null;
    if (!criterio || criterio.filtro === "selecionados") continue;

    try {
      const [leads, protegidos, { data: jaNaLista }] = await Promise.all([
        leadsDoCorretor(supabase, c.corretor_id),
        idsProtegidosDeNovaLista(supabase, c.corretor_id),
        supabase.from("whatsapp_campanhas_fila").select("lead_id").eq("campanha_id", c.id),
      ]);
      const presentes = new Set((jaNaLista ?? []).map((i) => i.lead_id).filter(Boolean));
      const novos = leads.filter(
        (l) =>
          elegivel(l, criterio.filtro, { imovelSlug: criterio.imovelSlug ?? null }) &&
          noRecorte(l, criterio.recorte) &&
          !protegidos.has(l.id) &&
          !presentes.has(l.id),
      );
      if (novos.length === 0) continue;

      const { data: ultimo } = await supabase
        .from("whatsapp_campanhas_fila")
        .select("agendado_para")
        .eq("campanha_id", c.id)
        .eq("status", "pendente")
        .order("agendado_para", { ascending: false })
        .limit(1)
        .maybeSingle();

      const imovel = (Array.isArray(c.empreendimento) ? c.empreendimento[0] : c.empreendimento) as
        | { nome: string }
        | null;
      // Teste A/B já decidido: quem entra agora recebe a vencedora.
      const decidido = c.variante_vencedora;
      const mensagemBase = decidido === "B" && c.mensagem_base_b ? c.mensagem_base_b : c.mensagem_base;
      const fila = montarFilaCampanha({
        campanhaId: c.id,
        leads: novos.map((l) => ({ id: l.id, nome: l.nome, telefone: l.telefone as string })),
        mensagemBase,
        mensagemBaseB: decidido ? null : c.mensagem_base_b,
        empreendimentoNome: imovel?.nome,
        contexto: c.contexto_template as ContextoTemplate | null,
        ignorarJanela: c.ignorar_janela,
        iniciarEm: ultimo?.agendado_para ?? agora,
      });

      const { error } = await supabase.from("whatsapp_campanhas_fila").insert(
        fila.map((item) => ({
          campanha_id: c.id,
          lead_id: item.leadId,
          telefone: item.telefone,
          mensagem_personalizada: item.mensagemPersonalizada,
          personalizado_por_ia: false,
          status: "pendente" as const,
          agendado_para: item.agendadoPara,
          variante: item.variante ?? null,
        })),
      );
      if (error) {
        console.warn("[lista viva] falha ao incluir:", error.message);
        continue;
      }
      incluidos += fila.length;
      await supabase
        .from("whatsapp_campanhas")
        .update({ total_leads: c.total_leads + fila.length, status: "em_andamento" })
        .eq("id", c.id)
        .in("status", ["em_andamento", "concluida"]);
    } catch (err) {
      console.warn("[lista viva] varredura adiada:", err);
    }
  }
  return incluidos;
}
