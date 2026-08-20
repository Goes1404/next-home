"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado, getMeusLeads } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";
import { processarFilaCampanhas } from "@/lib/whatsapp/campaignDispatcher";
import { gerarMensagensCampanhaPersonalizadas } from "@/lib/whatsapp/campaignQueue";
import { provedorConfigurado } from "@/lib/whatsapp/provider";

/**
 * Ações do painel de Campanhas: criar, listar e (quando o corretor não quer
 * esperar o cron) processar a fila na hora.
 *
 * A montagem da fila (`gerarMensagensCampanhaPersonalizadas`) e o envio de
 * fato (`processarFilaCampanhas`) são os mesmos módulos usados pelo cron —
 * este arquivo só decide QUAIS leads entram e grava o resultado, sob a
 * sessão do corretor logado (RLS via `createClient`, nunca o cliente de
 * serviço aqui).
 */

export type FiltroLeadsCampanha = "parados_15d" | "novos_sem_contato" | "todos";

const DIAS_PARADO = 15;

/** Fechado e perdido nunca entram — reativar quem já comprou ou já disse não é o oposto do objetivo. */
function elegivel(lead: Lead, filtro: FiltroLeadsCampanha): boolean {
  if (!lead.telefone) return false;
  if (lead.etapa === "fechado" || lead.etapa === "perdido") return false;

  if (filtro === "novos_sem_contato") return lead.etapa === "novo";
  if (filtro === "parados_15d") {
    const dias = (Date.now() - new Date(lead.etapaAlteradaEm).getTime()) / 86_400_000;
    return dias >= DIAS_PARADO;
  }
  return true;
}

export type LeadElegivel = { id: string; nome: string; telefone: string };

/** `getMeusLeads` já vem filtrado por RLS (0007) — aqui só decide QUAIS desses entram na campanha. */
export async function listarLeadsElegiveis(filtro: FiltroLeadsCampanha): Promise<LeadElegivel[]> {
  const leads = await getMeusLeads();
  return leads
    .filter((lead) => elegivel(lead, filtro))
    .map((lead) => ({ id: lead.id, nome: lead.nome, telefone: lead.telefone as string }));
}

export async function gerarPreviewCampanha(params: {
  filtro: FiltroLeadsCampanha;
  empreendimentoNome: string;
  mensagemBase: string;
}): Promise<{ mensagens: string[] } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  if (!params.mensagemBase.trim()) return { erro: "Escreva uma mensagem base primeiro." };

  const elegiveis = await listarLeadsElegiveis(params.filtro);
  if (elegiveis.length === 0) {
    return { erro: "Nenhum lead elegível para este filtro no momento." };
  }

  // Amostra de até 3 — o preview é só para o corretor calibrar o tom antes
  // de disparar de verdade, não precisa (nem deve) gerar a fila inteira.
  const fila = await gerarMensagensCampanhaPersonalizadas({
    campanhaId: "preview",
    leads: elegiveis.slice(0, 3),
    mensagemBase: params.mensagemBase,
    empreendimentoNome: params.empreendimentoNome,
  });

  return { mensagens: fila.map((item) => item.mensagemPersonalizada) };
}

export type ResultadoCriarCampanha = { ok: true; campanhaId: string; totalLeads: number } | { erro: string };

export async function criarCampanha(params: {
  titulo: string;
  empreendimentoId: string | null;
  empreendimentoNome: string;
  filtro: FiltroLeadsCampanha;
  mensagemBase: string;
}): Promise<ResultadoCriarCampanha> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const titulo = params.titulo.trim();
  if (!titulo) return { erro: "Dê um título para a campanha." };
  if (!params.mensagemBase.trim()) return { erro: "Escreva a mensagem base." };

  if (!provedorConfigurado()) {
    return {
      erro: "Nenhum provedor de WhatsApp está conectado a este ambiente. Conecte seu número em /corretor/whatsapp primeiro.",
    };
  }

  const elegiveis = await listarLeadsElegiveis(params.filtro);
  if (elegiveis.length === 0) {
    return { erro: "Nenhum lead elegível para este filtro no momento." };
  }

  const supabase = await createClient();

  const { data: campanha, error: erroCampanha } = await supabase
    .from("whatsapp_campanhas")
    .insert({
      corretor_id: corretor.id,
      titulo,
      empreendimento_id: params.empreendimentoId,
      mensagem_base: params.mensagemBase,
      total_leads: elegiveis.length,
      status: "em_andamento",
    })
    .select("id")
    .single();

  if (erroCampanha || !campanha) return { erro: "Não foi possível criar a campanha agora." };

  const fila = await gerarMensagensCampanhaPersonalizadas({
    campanhaId: campanha.id,
    leads: elegiveis,
    mensagemBase: params.mensagemBase,
    empreendimentoNome: params.empreendimentoNome,
  });

  const { error: erroFila } = await supabase.from("whatsapp_campanhas_fila").insert(
    fila.map((item) => ({
      campanha_id: campanha.id,
      lead_id: item.leadId,
      telefone: item.telefone,
      mensagem_personalizada: item.mensagemPersonalizada,
      status: item.status,
      agendado_para: item.agendadoPara,
    })),
  );

  if (erroFila) {
    // Campanha sem fila é um card fantasma no histórico — melhor desfazer.
    await supabase.from("whatsapp_campanhas").delete().eq("id", campanha.id);
    return { erro: "Não foi possível montar a fila de envio agora." };
  }

  revalidatePath("/corretor/campanhas");
  return { ok: true, campanhaId: campanha.id, totalLeads: elegiveis.length };
}

export type CampanhaListada = {
  id: string;
  titulo: string;
  empreendimentoNome: string | null;
  totalLeads: number;
  totalEnviados: number;
  totalRespondidos: number;
  status: "rascunho" | "em_andamento" | "pausada" | "concluida";
  criadoEm: string;
};

export async function listarCampanhas(): Promise<CampanhaListada[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_campanhas")
    .select(
      "id, titulo, total_leads, total_enviados, total_respondidos, status, created_at, empreendimento:empreendimentos(nome)",
    )
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((c) => ({
    id: c.id,
    titulo: c.titulo,
    empreendimentoNome: (c.empreendimento as { nome: string } | null)?.nome ?? null,
    totalLeads: c.total_leads,
    totalEnviados: c.total_enviados,
    totalRespondidos: c.total_respondidos,
    status: c.status,
    criadoEm: c.created_at,
  }));
}

export type ResultadoProcessarFila =
  | { ok: true; processados: number; enviados: number; erros: number }
  | { erro: string };

/**
 * Processa a fila deste corretor agora, sem esperar o próximo tique do
 * cron. Existe porque, em plano Hobby da Vercel, o cron declarado a cada 5
 * minutos só dispara de fato uma vez por dia — sem este botão, uma campanha
 * recém-criada ficaria com a IA de braços cruzados até o dia seguinte.
 */
export async function processarFilaAgora(): Promise<ResultadoProcessarFila> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const resultado = await processarFilaCampanhas({ corretorId: corretor.id, limiteTotal: 10 });
  revalidatePath("/corretor/campanhas");

  if (!resultado.dentroDaJanela) {
    return {
      erro: "Fora do horário comercial (9h-20h, segunda a sábado) — campanhas não disparam agora. A fila segue esperando a próxima janela.",
    };
  }

  return {
    ok: true,
    processados: resultado.processados,
    enviados: resultado.enviados,
    erros: resultado.erros,
  };
}
