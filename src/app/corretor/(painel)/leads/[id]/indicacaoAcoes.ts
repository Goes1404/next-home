"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";

/**
 * Registra quem o cliente indicou (0123). O indicado nasce na carteira do
 * MESMO corretor (indicação é relacionamento dele, não da roleta), com
 * `indicado_por` apontando para quem indicou — é o que permite medir o que
 * o pedido de indicação rende.
 *
 * O indicado não deu consentimento a ninguém: por isso o corretor confirma
 * que a pessoa sabe que vai ser procurada. Sem isso, o cadastro não entra.
 */
export async function registrarIndicacao(
  leadId: string,
  p: { nome: string; telefone: string; sabeQueSeraProcurada: boolean },
): Promise<{ ok?: string; erro?: string; id?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  const nome = String(p?.nome ?? "").trim();
  const telefone = String(p?.telefone ?? "").trim();
  if (nome.length < 2) return { erro: "Informe o nome de quem foi indicado." };
  if (!normalizarTelefoneBrasileiro(telefone)) return { erro: "Telefone não parece válido. Use DDD + número." };
  if (p?.sabeQueSeraProcurada !== true) {
    return { erro: "Confirme que a pessoa sabe que você vai entrar em contato." };
  }

  const supabase = await createClient();
  // RLS recorta: quem indicou precisa ser da carteira de quem registra.
  const { data: origem } = await supabase
    .from("leads")
    .select("id, nome, corretor_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!origem || origem.corretor_id !== corretor.id) return { erro: "Lead não encontrado na sua carteira." };

  const { data, error } = await supabase
    .from("leads")
    .insert({
      nome: nome.slice(0, 120),
      telefone: telefone.slice(0, 40),
      corretor_id: corretor.id,
      origem_atribuicao: "manual",
      tipo: "comprador",
      origem: "indicacao",
      indicado_por: origem.id,
      mensagem: `Indicação de ${origem.nome}`.slice(0, 2000),
      consentimento_lgpd: true,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[indicação] falha ao criar lead:", error?.message);
    return { erro: "Não foi possível registrar. Confira se esse número já não está na sua carteira." };
  }

  revalidatePath(`/corretor/leads/${leadId}`);
  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/pessoas");
  return { ok: `${nome.split(" ")[0]} entrou no seu funil como indicação.`, id: data.id };
}
