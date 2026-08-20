import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { bloqueadoAtePor, deveAbrirDisjuntor, limiteDiarioCampanha, diasDesdeConexao } from "./antiBan";
import { exigePalavraChave } from "./modoBot";
import type { DossieClienteIA } from "./types";

/**
 * Persistência do fluxo de WhatsApp, do lado do webhook.
 *
 * Roda sem sessão de usuário (a requisição vem do provedor, não do
 * navegador do corretor), por isso usa o cliente de serviço — ver
 * `supabase/service.ts` para o porquê.
 */

export type InstanciaResolvida = {
  id: string;
  corretorId: string;
  instanceName: string;
  nomeCorretor: string;
  creciCorretor: string;
  whatsappCorretor: string;
  nomeAssistente: string;
  tomVoz: string;
  modoBot: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado";
  webhookSecret: string | null;
  /** Frase que o corretor digita no próprio chat para "ligar" a IA. Nula = recurso desligado. */
  palavraChaveAtivacao: string | null;
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
    .select(
      "id, corretor_id, instance_name, nome_assistente, tom_voz, modo_bot, webhook_secret, palavra_chave_ativacao",
    )
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
    id: data.id,
    corretorId: data.corretor_id,
    instanceName: data.instance_name,
    nomeCorretor: corretor.nome,
    creciCorretor: corretor.creci,
    whatsappCorretor: corretor.whatsapp,
    nomeAssistente: data.nome_assistente,
    tomVoz: data.tom_voz,
    modoBot: data.modo_bot,
    webhookSecret: data.webhook_secret,
    palavraChaveAtivacao: data.palavra_chave_ativacao,
  };
}

export type ConversaPersistida = {
  id: string;
  leadId: string | null;
  botAtivo: boolean;
  pausadoHumanoAte: string | null;
  /** false = aguardando o corretor digitar a palavra-chave neste chat (ver modoBot.ts). */
  liberadoPorPalavraChave: boolean;
};

const SELECT_CONVERSA = "id, lead_id, bot_ativo, pausado_humano_ate, liberado_por_palavra_chave";

function mapConversa(row: {
  id: string;
  lead_id: string | null;
  bot_ativo: boolean;
  pausado_humano_ate: string | null;
  liberado_por_palavra_chave: boolean;
}): ConversaPersistida {
  return {
    id: row.id,
    leadId: row.lead_id,
    botAtivo: row.bot_ativo,
    pausadoHumanoAte: row.pausado_humano_ate,
    liberadoPorPalavraChave: row.liberado_por_palavra_chave,
  };
}

/** Uma conversa por (corretor, telefone) — o `unique` da 0018 garante isso. */
export async function obterOuCriarConversa(params: {
  corretorId: string;
  telefoneCliente: string;
  nomeCliente?: string | null;
  /** Palavra-chave cadastrada na instância — decide se a conversa NASCE aguardando ativação. */
  palavraChaveConfigurada?: string | null;
  origem?: "organica" | "campanha";
}): Promise<ConversaPersistida | null> {
  const supabase = createServiceClient();

  const { data: existente } = await supabase
    .from("whatsapp_conversas")
    .select(SELECT_CONVERSA)
    .eq("corretor_id", params.corretorId)
    .eq("telefone_cliente", params.telefoneCliente)
    .maybeSingle();

  if (existente) return mapConversa(existente);

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

  const origem = params.origem ?? "organica";
  const precisaDePalavraChave = exigePalavraChave({
    palavraChaveConfigurada: params.palavraChaveConfigurada,
    origemConversa: origem,
  });

  const { data: criada, error } = await supabase
    .from("whatsapp_conversas")
    .insert({
      corretor_id: params.corretorId,
      telefone_cliente: params.telefoneCliente,
      nome_cliente: params.nomeCliente ?? null,
      lead_id: lead?.id ?? null,
      origem,
      liberado_por_palavra_chave: !precisaDePalavraChave,
    })
    .select(SELECT_CONVERSA)
    .single();

  if (error || !criada) return null;

  return mapConversa(criada);
}

/**
 * O corretor digitou a palavra-chave combinada no próprio chat: a IA está
 * autorizada a assumir esta conversa a partir de agora.
 *
 * Diferente de `pausarBotPorAtendimentoHumano`: esta mensagem específica é
 * o sinal de entrega, não de "estou cuidando pessoalmente" — por isso não
 * grava pausa nenhuma, só derruba a trava de espera.
 */
export async function liberarConversaPorPalavraChave(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("whatsapp_conversas")
    .update({ liberado_por_palavra_chave: true })
    .eq("id", conversaId);
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

/**
 * Quando o corretor falou pela última vez nesta conversa.
 *
 * É o relógio do modo co-piloto: enquanto o humano está ativo, o bot espera.
 */
export async function ultimaFalaDoCorretor(conversaId: string): Promise<string | null> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("created_at")
    .eq("conversa_id", conversaId)
    .eq("remetente", "corretor")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.created_at ?? null;
}

/** Se o bot pode responder agora nesta conversa. */
export function botDeveResponder(conversa: ConversaPersistida): boolean {
  if (!conversa.botAtivo) return false;
  if (conversa.pausadoHumanoAte && new Date(conversa.pausadoHumanoAte) > new Date()) return false;
  if (!conversa.liberadoPorPalavraChave) return false;
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

/**
 * Reserva uma vaga na cota diária de campanha do número.
 *
 * A conta roda no banco (`consumir_cota_campanha`, 0020) porque dois
 * disparos simultâneos leriam o mesmo contador e ambos se achariam dentro
 * do limite — furando a cota exatamente no pico de volume.
 */
export async function reservarCotaCampanha(
  instanciaId: string,
  conectadoEm: Date | null,
): Promise<{ permitido: boolean; motivo?: string }> {
  if (!conectadoEm) {
    return { permitido: false, motivo: "Número ainda não foi pareado." };
  }

  const limite = limiteDiarioCampanha(diasDesdeConexao(conectadoEm));
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("consumir_cota_campanha", {
    p_instancia_id: instanciaId,
    p_limite: limite,
  });

  if (error) return { permitido: false, motivo: "Falha ao verificar a cota diária." };
  if (typeof data === "number" && data < 0) {
    return {
      permitido: false,
      motivo: `Cota diária de ${limite} disparos atingida (ou número temporariamente bloqueado).`,
    };
  }

  return { permitido: true };
}

/**
 * Contabiliza o resultado de um envio.
 *
 * Falhas seguidas quase sempre significam número já restrito pelo
 * WhatsApp; insistir a partir daí é o que transforma restrição em
 * banimento. Ao cruzar o limite, o disjuntor abre sozinho.
 */
export async function registrarResultadoEnvio(
  instanciaId: string,
  sucesso: boolean,
): Promise<void> {
  const supabase = createServiceClient();

  if (sucesso) {
    await supabase
      .from("corretor_whatsapp_instancias")
      .update({ falhas_seguidas: 0 })
      .eq("id", instanciaId);
    return;
  }

  const { data } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("falhas_seguidas")
    .eq("id", instanciaId)
    .maybeSingle();

  const falhas = (data?.falhas_seguidas ?? 0) + 1;

  await supabase
    .from("corretor_whatsapp_instancias")
    .update({
      falhas_seguidas: falhas,
      ...(deveAbrirDisjuntor(falhas)
        ? { bloqueado_ate: bloqueadoAtePor().toISOString() }
        : {}),
    })
    .eq("id", instanciaId);
}

/**
 * O dossiê como estava ANTES desta mensagem — buscar antes de `salvarDossie`
 * sobrescrever é o que permite ao webhook saber o que mudou de fato na
 * conversa (ver `resumirMudancasDossie` em dossierExtractor.ts) e mandar ao
 * corretor uma atualização incremental, em vez de só o alerta único de lead
 * quente.
 */
export async function buscarDossieAtual(leadId: string): Promise<DossieClienteIA | null> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("lead_observacoes_ia")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    leadId: data.lead_id,
    orcamentoMin: data.orcamento_min,
    orcamentoMax: data.orcamento_max,
    formaPagamento: data.forma_pagamento,
    perfilFamiliar: data.perfil_familiar,
    urgenciaMudanca: data.urgencia_mudanca,
    exigenciasEspecificas: Array.isArray(data.exigencias_especificas) ? data.exigencias_especificas : [],
    objecoesIdentificadas: Array.isArray(data.objecoes_identificadas) ? data.objecoes_identificadas : [],
    temperaturaScore: data.temperatura_score,
    temperaturaLabel: data.temperatura_label,
    resumoExecutivo: data.resumo_executivo,
    proximoPassoSugerido: data.proximo_passo_sugerido,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
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
