"use server";

import { chegouEm, type EtapaFunil } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { rotuloDaVisita } from "@/lib/whatsapp/mudancaDeVisita";

/**
 * A visita que o corretor combinou no chat (A2, 0163): registrar ou
 * dispensar, da fila do Início.
 *
 * A leitura com a SESSÃO é a autorização: só a conversa do corretor logado
 * aparece. A escrita vai pela chave de serviço, porque a etapa e a data
 * da visita mudam juntas e a linha do tempo precisa da linha.
 */

type Resultado = { erro?: string; ok?: string };

async function sugestaoDoCorretor(conversaId: string) {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_conversas")
    .select("id, lead_id, corretor_id, visita_sugerida_para")
    .eq("id", conversaId)
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  return data ? { ...data, corretorId: corretor.id } : null;
}

async function limparSugestao(conversaId: string) {
  await createServiceClient()
    .from("whatsapp_conversas")
    .update({ visita_sugerida_para: null, visita_sugerida_em: null })
    .eq("id", conversaId);
}

export async function registrarVisitaCombinada(conversaId: string): Promise<Resultado> {
  const conversa = await sugestaoDoCorretor(conversaId);
  if (!conversa?.visita_sugerida_para || !conversa.lead_id) {
    return { erro: "Essa sugestão não está mais disponível." };
  }
  const quando = new Date(conversa.visita_sugerida_para);
  if (quando.getTime() < Date.now()) {
    await limparSugestao(conversaId);
    return { erro: "Esse horário já passou." };
  }

  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("etapa")
    .eq("id", conversa.lead_id)
    .maybeSingle();
  const avancaEtapa = Boolean(lead?.etapa) && !chegouEm(lead!.etapa as EtapaFunil, "visita_agendada");

  const { error } = await supabase
    .from("leads")
    .update({
      visita_agendada_em: quando.toISOString(),
      ...(avancaEtapa
        ? { etapa: "visita_agendada" as const, etapa_alterada_em: new Date().toISOString() }
        : {}),
    })
    .eq("id", conversa.lead_id);
  if (error) {
    // O índice da 0074: um corretor não recebe duas pessoas no mesmo instante.
    return error.code === "23505"
      ? { erro: "Você já tem outra visita nesse horário." }
      : { erro: "Não foi possível registrar agora. Tente novamente." };
  }

  await supabase.from("lead_interacoes").insert({
    lead_id: conversa.lead_id,
    corretor_id: conversa.corretorId,
    tipo: "visita",
    conteudo: `Visita combinada no chat registrada para ${rotuloDaVisita(quando)}.`,
    detalhes: { quando: quando.toISOString(), origem: "chat" },
  });
  await limparSugestao(conversaId);

  revalidatePath("/corretor");
  revalidatePath(`/corretor/leads/${conversa.lead_id}`);
  revalidatePath("/corretor/visitas");
  return { ok: "Visita registrada." };
}

export async function dispensarVisitaCombinada(conversaId: string): Promise<Resultado> {
  const conversa = await sugestaoDoCorretor(conversaId);
  if (!conversa) return { erro: "Essa sugestão não está mais disponível." };
  await limparSugestao(conversaId);
  revalidatePath("/corretor");
  return { ok: "Dispensada." };
}
