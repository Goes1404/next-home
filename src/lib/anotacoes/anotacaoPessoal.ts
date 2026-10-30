import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Anotação pessoal sem cliente pedida ao número central ("anota: ligar pro
 * cartório", onda 1, capacidade 21). É a nota do bloco de anotações (0100)
 * para o próprio autor, sem lead e sem lembrete: lembrete com hora é a
 * capacidade 8 (onda 2, `criarLembretePeloCentral` abaixo).
 *
 * O painel grava pelo cliente de sessão e a RLS recorta; o central não tem
 * sessão, então o recorte é explícito: autor = quem foi identificado, no
 * grupo dele, e só o autor apaga (o desfazer).
 */

type Supa = ReturnType<typeof createServiceClient>;

/** O mesmo teto do painel (`anotacoes/acoes.ts`). */
const TETO_DO_TEXTO = 4000;

export async function criarAnotacaoPessoal(
  p: { grupoId: string; corretorId: string; texto: string },
  supabase: Supa = createServiceClient(),
): Promise<{ id?: string; erro?: string }> {
  const texto = p.texto.trim().slice(0, TETO_DO_TEXTO);
  if (!texto) return { erro: "O que é para anotar?" };
  const { data, error } = await supabase
    .from("anotacoes")
    .insert({
      grupo_id: p.grupoId,
      corretor_id: p.corretorId,
      destinatario_id: p.corretorId,
      lead_id: null,
      texto,
      lembrete_em: null,
      lembrete_whatsapp: false,
    })
    .select("id")
    .single();
  if (error || !data) return { erro: "Não consegui anotar agora. Tente de novo." };
  return { id: data.id };
}

/** O desfazer: apaga a nota que o central criou, só do autor e do grupo dele. */
export async function apagarAnotacaoPessoal(
  p: { grupoId: string; corretorId: string; anotacaoId: string },
  supabase: Supa = createServiceClient(),
): Promise<{ erro?: string }> {
  const { data, error } = await supabase
    .from("anotacoes")
    .delete()
    .eq("id", p.anotacaoId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .select("id");
  if (error) return { erro: "Não consegui apagar a anotação agora. Tente de novo." };
  if (!data || data.length === 0) return { erro: "Essa anotação não existe mais." };
  return {};
}

/**
 * Lembrete com hora pedido ao número central ("me lembra amanhã às 10h de
 * ligar pro João", onda 2, capacidade 8). É a MESMA anotação com lembrete do
 * painel (0100): `lembrete_em` e `lembrete_whatsapp`, para o próprio autor,
 * com o lead quando a pessoa disse de quem. Por isso ele aparece onde o
 * painel já mostra (Anotações, a fila do Início, os lembretes na consulta do
 * lead) e sai pelo tique dos follow-ups (`processarLembretesDeAnotacao`).
 *
 * O lead chega já resolvido no grupo de quem pediu (`resolverLead`); aqui
 * ele é conferido de novo no grupo, porque a proposta espera até 1 hora.
 * O desfazer é `apagarAnotacaoPessoal` (só o autor, no grupo dele).
 */
export async function criarLembretePeloCentral(
  p: { grupoId: string; corretorId: string; texto: string; lembreteEm: Date; leadId: string | null },
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<{ id?: string; erro?: string }> {
  const texto = p.texto.trim().slice(0, TETO_DO_TEXTO);
  if (!texto) return { erro: "Do que é para lembrar?" };
  // A régua do painel: lembrete no passado nasceria vencido e sairia no próximo tique.
  if (Number.isNaN(p.lembreteEm.getTime()) || p.lembreteEm.getTime() < agora.getTime() - 60_000) {
    return { erro: "Esse horário já passou. Peça outro." };
  }
  if (p.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", p.leadId)
      .eq("grupo_id", p.grupoId)
      .is("arquivado_em", null)
      .maybeSingle();
    if (!lead) return { erro: "Não achei mais esse cliente." };
  }
  const { data, error } = await supabase
    .from("anotacoes")
    .insert({
      grupo_id: p.grupoId,
      corretor_id: p.corretorId,
      destinatario_id: p.corretorId,
      lead_id: p.leadId,
      texto,
      lembrete_em: p.lembreteEm.toISOString(),
      lembrete_whatsapp: true,
    })
    .select("id")
    .single();
  if (error || !data) return { erro: "Não consegui marcar o lembrete agora. Tente de novo." };
  return { id: data.id };
}
