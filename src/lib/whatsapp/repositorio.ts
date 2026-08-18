import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { DossieClienteIA } from "./types";

/**
 * Persistência do fluxo de WhatsApp, do lado do webhook.
 *
 * Roda sem sessão de usuário (a requisição vem do provedor, não do
 * navegador do corretor), por isso usa o cliente de serviço — ver
 * `supabase/service.ts` para o porquê.
 */

export type InstanciaResolvida = {
  corretorId: string;
  instanceName: string;
  nomeCorretor: string;
  creciCorretor: string;
  whatsappCorretor: string;
  nomeAssistente: string;
  tomVoz: string;
  modoBot: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado";
  webhookSecret: string | null;
};

/**
 * Descobre de quem é a instância que recebeu a mensagem.
 *
 * É o que torna o sistema multi-corretor de verdade: sem isto, toda
 * conversa seria atribuída a um corretor fixo e o dossiê cairia na caixa
 * de outra pessoa.
 */
export async function resolverInstancia(instanceName: string): Promise<InstanciaResolvida | null> {
  if (!instanceName) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("corretor_id, instance_name, nome_assistente, tom_voz, modo_bot, webhook_secret")
    .eq("instance_name", instanceName)
    .maybeSingle();

  if (error || !data) return null;

  const { data: corretor } = await supabase
    .from("corretores")
    .select("nome, creci, whatsapp")
    .eq("id", data.corretor_id)
    .maybeSingle();

  if (!corretor) return null;

  return {
    corretorId: data.corretor_id,
    instanceName: data.instance_name,
    nomeCorretor: corretor.nome,
    creciCorretor: corretor.creci,
    whatsappCorretor: corretor.whatsapp,
    nomeAssistente: data.nome_assistente,
    tomVoz: data.tom_voz,
    modoBot: data.modo_bot,
    webhookSecret: data.webhook_secret,
  };
}

export type ConversaPersistida = {
  id: string;
  leadId: string | null;
  botAtivo: boolean;
  pausadoHumanoAte: string | null;
};

/** Uma conversa por (corretor, telefone) — o `unique` da 0018 garante isso. */
export async function obterOuCriarConversa(params: {
  corretorId: string;
  telefoneCliente: string;
  nomeCliente?: string | null;
}): Promise<ConversaPersistida | null> {
  const supabase = createServiceClient();

  const { data: existente } = await supabase
    .from("whatsapp_conversas")
    .select("id, lead_id, bot_ativo, pausado_humano_ate")
    .eq("corretor_id", params.corretorId)
    .eq("telefone_cliente", params.telefoneCliente)
    .maybeSingle();

  if (existente) {
    return {
      id: existente.id,
      leadId: existente.lead_id,
      botAtivo: existente.bot_ativo,
      pausadoHumanoAte: existente.pausado_humano_ate,
    };
  }

  // Sem conversa ainda: tenta amarrar num lead que já exista com este
  // telefone, para o dossiê cair no mesmo card do funil em vez de criar
  // uma ficha paralela.
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("telefone", params.telefoneCliente)
    .eq("corretor_id", params.corretorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: criada, error } = await supabase
    .from("whatsapp_conversas")
    .insert({
      corretor_id: params.corretorId,
      telefone_cliente: params.telefoneCliente,
      nome_cliente: params.nomeCliente ?? null,
      lead_id: lead?.id ?? null,
    })
    .select("id, lead_id, bot_ativo, pausado_humano_ate")
    .single();

  if (error || !criada) return null;

  return {
    id: criada.id,
    leadId: criada.lead_id,
    botAtivo: criada.bot_ativo,
    pausadoHumanoAte: criada.pausado_humano_ate,
  };
}

export async function gravarMensagem(params: {
  conversaId: string;
  remetente: "cliente" | "bot" | "corretor";
  conteudo: string;
  tipo?: "texto" | "audio" | "imagem" | "documento";
  midiaUrl?: string | null;
}): Promise<void> {
  const supabase = createServiceClient();

  await supabase.from("whatsapp_mensagens").insert({
    conversa_id: params.conversaId,
    remetente: params.remetente,
    tipo: params.tipo ?? "texto",
    conteudo: params.conteudo,
    midia_url: params.midiaUrl ?? null,
  });

  await supabase
    .from("whatsapp_conversas")
    .update({
      ultima_mensagem: params.conteudo.slice(0, 500),
      ultima_interacao_em: new Date().toISOString(),
    })
    .eq("id", params.conversaId);
}

/** Janela padrão de silêncio do bot depois que o corretor entra na conversa. */
const HORAS_PAUSA_HUMANA = 24;

/**
 * O corretor respondeu do celular dele: a IA cala a boca nesta conversa.
 *
 * Gravar de fato é o ponto — devolver "pausa detectada" só no corpo da
 * resposta HTTP não pausa nada, e a próxima mensagem do cliente voltaria a
 * ser respondida pelo bot por cima do atendimento humano.
 */
export async function pausarBotPorAtendimentoHumano(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  const ate = new Date(Date.now() + HORAS_PAUSA_HUMANA * 3600_000).toISOString();

  await supabase
    .from("whatsapp_conversas")
    .update({ pausado_humano_ate: ate })
    .eq("id", conversaId);
}

/** Se o bot pode responder agora nesta conversa. */
export function botDeveResponder(conversa: ConversaPersistida): boolean {
  if (!conversa.botAtivo) return false;
  if (conversa.pausadoHumanoAte && new Date(conversa.pausadoHumanoAte) > new Date()) return false;
  return true;
}

/** Últimas mensagens para dar memória ao agente — sem isso ele repete a saudação a cada turno. */
export async function historicoRecente(
  conversaId: string,
  limite = 12,
): Promise<{ remetente: "cliente" | "bot" | "corretor"; texto: string }[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente, conteudo")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(limite);

  return (data ?? []).reverse().map((m) => ({ remetente: m.remetente, texto: m.conteudo }));
}

/** Um dossiê por lead (`unique` na 0018) — cada análise substitui a anterior. */
export async function salvarDossie(leadId: string, dossie: DossieClienteIA): Promise<void> {
  const supabase = createServiceClient();

  await supabase.from("lead_observacoes_ia").upsert(
    {
      lead_id: leadId,
      orcamento_min: dossie.orcamentoMin,
      orcamento_max: dossie.orcamentoMax,
      forma_pagamento: dossie.formaPagamento,
      perfil_familiar: dossie.perfilFamiliar,
      urgencia_mudanca: dossie.urgenciaMudanca,
      exigencias_especificas: dossie.exigenciasEspecificas,
      objecoes_identificadas: dossie.objecoesIdentificadas,
      temperatura_score: dossie.temperaturaScore,
      temperatura_label: dossie.temperaturaLabel,
      resumo_executivo: dossie.resumoExecutivo,
      proximo_passo_sugerido: dossie.proximoPassoSugerido,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "lead_id" },
  );
}
