import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { bloqueadoAtePor, deveAbrirDisjuntor, limiteDiarioCampanha, diasDesdeConexao } from "./antiBan";
import { exigePalavraChave } from "./modoBot";
import { consultarEstadoConexao } from "./provider";
import { resetPorTrocaDeNumero } from "./trocaDeNumero";
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
  telefoneCliente: string;
  botAtivo: boolean;
  pausadoHumanoAte: string | null;
  /** false = aguardando o corretor digitar a palavra-chave neste chat (ver modoBot.ts). */
  liberadoPorPalavraChave: boolean;
  /** De onde esta conversa nasceu — 'campanha' é quem o disparo em massa criou (ver campaignDispatcher.ts). */
  origem: "organica" | "campanha";
};

const SELECT_CONVERSA =
  "id, lead_id, telefone_cliente, bot_ativo, pausado_humano_ate, liberado_por_palavra_chave, origem";

function mapConversa(row: {
  id: string;
  lead_id: string | null;
  telefone_cliente: string;
  bot_ativo: boolean;
  pausado_humano_ate: string | null;
  liberado_por_palavra_chave: boolean;
  origem: "organica" | "campanha";
}): ConversaPersistida {
  return {
    id: row.id,
    leadId: row.lead_id,
    telefoneCliente: row.telefone_cliente,
    botAtivo: row.bot_ativo,
    pausadoHumanoAte: row.pausado_humano_ate,
    liberadoPorPalavraChave: row.liberado_por_palavra_chave,
    origem: row.origem,
  };
}

/**
 * Variantes do telefone vindas do JID do WhatsApp (só dígitos, com DDI),
 * no formato de `leads.telefone_e164` (também só dígitos).
 *
 * A variante do nono dígito é o caso real que quebrava tudo: o mesmo
 * celular existe como `5511988881111` num cadastro e `551188881111` no
 * outro, e um match exato deixa o lead órfão para sempre.
 */
export function candidatosTelefone(jidDigitos: string): string[] {
  const candidatos = new Set<string>([jidDigitos]);

  if (jidDigitos.startsWith("55")) {
    // 55 + DDD(2) + 9 + 8 dígitos → variante sem o 9
    if (jidDigitos.length === 13 && jidDigitos[4] === "9") {
      candidatos.add(jidDigitos.slice(0, 4) + jidDigitos.slice(5));
    }
    // 55 + DDD(2) + 8 dígitos → variante com o 9
    if (jidDigitos.length === 12) {
      candidatos.add(jidDigitos.slice(0, 4) + "9" + jidDigitos.slice(4));
    }
  }

  return Array.from(candidatos);
}

/**
 * Acha o lead deste telefone — ou o CRIA.
 *
 * Criar é deliberado: em produção, ZERO conversas tinham lead (o match era
 * por igualdade exata com o telefone digitado à mão) e, sem lead, o dossiê
 * extraído a cada mensagem era descartado em silêncio. Quem chama no
 * WhatsApp é um contato comercial por definição — merece um card no funil,
 * mesmo que nunca tenha preenchido formulário.
 */
async function encontrarOuCriarLead(
  supabase: ReturnType<typeof createServiceClient>,
  params: { corretorId: string; telefoneCliente: string; nomeCliente?: string | null; origem?: "organica" | "campanha" },
): Promise<string | null> {
  const candidatos = candidatosTelefone(params.telefoneCliente);

  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("corretor_id", params.corretorId)
    .in("telefone_e164", candidatos)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lead) return lead.id;

  // Conversa de campanha sempre nasce de um lead existente (a fila é montada
  // a partir deles) — se não achou, é melhor não criar um duplicado.
  if (params.origem === "campanha") return null;

  const { data: criado } = await supabase
    .from("leads")
    .insert({
      corretor_id: params.corretorId,
      nome: params.nomeCliente?.trim() || `WhatsApp ${params.telefoneCliente.slice(-4)}`,
      telefone: params.telefoneCliente,
      telefone_e164: params.telefoneCliente,
      etapa: "novo",
      origem: "whatsapp/organico",
      origem_atribuicao: "manual",
      tipo: "comprador",
    })
    .select("id")
    .single();

  return criado?.id ?? null;
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

  if (existente) {
    // Conversa antiga sem lead (criada antes do vínculo por e164 existir, ou
    // antes de o lead ser cadastrado): tenta religar agora. É barato e é o
    // que permite ao dossiê desta mensagem ter um destino.
    if (!existente.lead_id) {
      const leadId = await encontrarOuCriarLead(supabase, params);
      if (leadId) {
        await supabase.from("whatsapp_conversas").update({ lead_id: leadId }).eq("id", existente.id);
        return mapConversa({ ...existente, lead_id: leadId });
      }
    }
    return mapConversa(existente);
  }

  const leadId = await encontrarOuCriarLead(supabase, params);

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
      lead_id: leadId,
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

/**
 * Grava a mensagem e devolve se ela é INÉDITA.
 *
 * `providerMessageId` (o `key.id` do provedor) alimenta o índice único da
 * 0027: reentrega de webhook — que todo provedor faz — bate no conflito e
 * devolve `inedita: false`, e o chamador encerra sem chamar a IA nem
 * responder de novo. Sem isso, cada retry do provedor virava resposta
 * duplicada no WhatsApp do cliente.
 */
export async function gravarMensagem(params: {
  conversaId: string;
  remetente: "cliente" | "bot" | "corretor";
  conteudo: string;
  tipo?: "texto" | "audio" | "imagem" | "documento";
  midiaUrl?: string | null;
  providerMessageId?: string | null;
}): Promise<{ inedita: boolean }> {
  const supabase = createServiceClient();

  const { error } = await supabase.from("whatsapp_mensagens").insert({
    conversa_id: params.conversaId,
    remetente: params.remetente,
    tipo: params.tipo ?? "texto",
    conteudo: params.conteudo,
    midia_url: params.midiaUrl ?? null,
    provider_message_id: params.providerMessageId ?? null,
  });

  // 23505 = violação de unicidade: é a reentrega. Qualquer outro erro é
  // problema real, mas nunca pode derrubar o fluxo de resposta — loga e segue.
  if (error) {
    if (error.code === "23505") return { inedita: false };
    console.error("Falha ao gravar mensagem de WhatsApp:", error.message);
  }

  await supabase
    .from("whatsapp_conversas")
    .update({
      ultima_mensagem: params.conteudo.slice(0, 500),
      ultima_interacao_em: new Date().toISOString(),
    })
    .eq("id", params.conversaId);

  return { inedita: true };
}

/**
 * A mensagem de cliente mais recente da conversa — o relógio do buffer de
 * rajada: a invocação cujo `providerMessageId` NÃO é o mais recente foi
 * absorvida por uma mensagem que chegou depois, e quem responde é a outra.
 */
export async function ultimaMensagemClienteId(conversaId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("provider_message_id")
    .eq("conversa_id", conversaId)
    .eq("remetente", "cliente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.provider_message_id ?? null;
}

/**
 * Debounce do alerta de lead quente: devolve true (e carimba) no máximo uma
 * vez por janela. Sem isso, TODA mensagem de uma conversa com score alto
 * disparava alerta novo — e alerta que spamma é alerta que o corretor
 * silencia.
 */
export async function podeAlertarLeadQuente(
  conversaId: string,
  janelaHoras = 6,
): Promise<boolean> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("whatsapp_conversas")
    .select("alerta_quente_em")
    .eq("id", conversaId)
    .maybeSingle();

  const ultimo = data?.alerta_quente_em ? new Date(data.alerta_quente_em).getTime() : 0;
  if (Date.now() - ultimo < janelaHoras * 3600_000) return false;

  await supabase
    .from("whatsapp_conversas")
    .update({ alerta_quente_em: new Date().toISOString() })
    .eq("id", conversaId);

  return true;
}

/**
 * Quando o corretor recebeu o último aviso de EVOLUÇÃO desta conversa.
 *
 * Separado de `alerta_quente_em` (que guarda a janela de 6h do alerta de
 * lead quente) de propósito: um alerta urgente não pode ser silenciado pela
 * carência do aviso comum, nem o comum herdar a janela do urgente.
 */
export async function ultimoAvisoEvolucao(conversaId: string): Promise<Date | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("whatsapp_conversas")
    .select("ultimo_aviso_evolucao_em")
    .eq("id", conversaId)
    .maybeSingle();

  return data?.ultimo_aviso_evolucao_em ? new Date(data.ultimo_aviso_evolucao_em) : null;
}

export async function marcarAvisoEvolucao(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("whatsapp_conversas")
    .update({ ultimo_aviso_evolucao_em: new Date().toISOString() })
    .eq("id", conversaId);
}

/** Validação da data de visita proposta pela IA — nunca gravar lixo no funil. */
export function validarDataVisita(dataHoraISO: string, agora: Date = new Date()): Date | null {
  const data = new Date(dataHoraISO);
  if (Number.isNaN(data.getTime())) return null;
  if (data <= agora) return null;
  // Mais de 60 dias no futuro é quase certamente parse errado de "dia 30".
  if (data.getTime() - agora.getTime() > 60 * 86_400_000) return null;
  return data;
}

/**
 * O cliente confirmou um horário com a IA: vira compromisso de verdade —
 * data no lead E etapa do funil, o mesmo efeito de o corretor marcar à mão.
 */
export async function agendarVisitaLead(leadId: string, dataVisita: Date): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("leads")
    .update({
      visita_agendada_em: dataVisita.toISOString(),
      etapa: "visita_agendada",
      etapa_alterada_em: new Date().toISOString(),
    })
    .eq("id", leadId);

  return !error;
}

// ---------------------------------------------------------------------------
// Follow-ups proativos (migration 0028)
// ---------------------------------------------------------------------------

/** +24h na primeira tentativa, +72h na segunda. Depois disso, silêncio é resposta. */
const HORAS_FOLLOWUP: Record<number, number> = { 1: 24, 2: 72 };
export const MAX_TENTATIVAS_FOLLOWUP = 2;

/**
 * Agenda o próximo follow-up da conversa, se ainda couber um.
 *
 * Idempotente por desenho: se já existe um pendente, não cria outro; se a
 * conversa já queimou as 2 tentativas, para — insistência vira denúncia de
 * spam, e denúncia derruba o número (ver antiBan.ts).
 */
export async function agendarFollowup(conversaId: string, instanciaId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: existentes } = await supabase
    .from("whatsapp_followups")
    .select("id, status, tentativa")
    .eq("conversa_id", conversaId);

  if (existentes?.some((f) => f.status === "pendente")) return;

  const enviados = existentes?.filter((f) => f.status === "enviado").length ?? 0;
  const tentativa = enviados + 1;
  if (tentativa > MAX_TENTATIVAS_FOLLOWUP) return;

  const horas = HORAS_FOLLOWUP[tentativa] ?? 24;

  await supabase.from("whatsapp_followups").insert({
    conversa_id: conversaId,
    instancia_id: instanciaId,
    tentativa,
    agendado_para: new Date(Date.now() + horas * 3600_000).toISOString(),
  });
}

/** O cliente respondeu: todo follow-up pendente da conversa perde o motivo de existir. */
export async function cancelarFollowupsPendentes(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("whatsapp_followups")
    .update({ status: "cancelado", motivo: "cliente_respondeu" })
    .eq("conversa_id", conversaId)
    .eq("status", "pendente");
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
 * Devolve à cota do dia um disparo que não chegou a acontecer.
 *
 * A cota é reservada ANTES do envio — é o que evita corrida entre o cron, a
 * corrente da Vercel e o botão do painel. O preço disso é que uma falha
 * gasta cota mesmo sem entregar nada. Para a maioria das falhas isso é
 * aceitável (o provedor tentou, o número foi exercitado), mas para
 * destinatário sem WhatsApp não: a mensagem não existiu para ninguém.
 *
 * Em produção isso não foi detalhe — 15 disparos da cota do dia foram
 * consumidos para entregar 3 mensagens, porque a lista tinha telefone
 * digitado errado no cadastro.
 *
 * Silenciosa de propósito: devolver cota é otimização, não etapa crítica.
 * Falhar aqui não pode derrubar o laço de disparo.
 */
export async function devolverCotaCampanha(instanciaId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.rpc("devolver_cota_campanha", { p_instancia_id: instanciaId });
  } catch (err) {
    console.warn("[whatsapp] não consegui devolver a cota:", err);
  }
}

/**
 * O cliente respondeu a um disparo de campanha: marca o item da fila como
 * `respondido` e soma no contador da campanha.
 *
 * Só chamado pelo webhook quando `conversa.origem === 'campanha'` — em
 * conversa orgânica não existe item de fila para achar. Pega o envio
 * `enviado` mais recente para este telefone (pode haver mais de um se o
 * mesmo lead entrou em duas campanhas), porque é a esse que a resposta se
 * refere.
 */
export async function marcarRespostaCampanha(telefoneCliente: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: item } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id, campanha_id")
    .eq("telefone", telefoneCliente)
    .eq("status", "enviado")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!item) return;

  await supabase
    .from("whatsapp_campanhas_fila")
    .update({ status: "respondido", resposta_em: new Date().toISOString() })
    .eq("id", item.id);

  // Recontado do zero, não incrementado: a contagem de linhas na fila é a
  // fonte da verdade, e recalcular dela é imune a corrida entre dois
  // webhooks concorrentes — incrementar a partir de uma leitura anterior
  // não seria.
  const { count } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", item.campanha_id)
    .eq("status", "respondido");

  await supabase
    .from("whatsapp_campanhas")
    .update({ total_respondidos: count ?? 0 })
    .eq("id", item.campanha_id);
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

// ---------------------------------------------------------------------------
// Estado de conexão da instância
// ---------------------------------------------------------------------------

export type EstadoInstancia = {
  conectado: boolean;
  estado: string;
  /** Marco do pareamento — base da curva de aquecimento em `antiBan.ts`. */
  conectadoEm: Date | null;
  detalhe?: string;
};

/**
 * Reconcilia o estado de conexão guardado no banco com o que o provedor
 * diz agora, e devolve o resultado já normalizado.
 *
 * Esta função é a correção do bug que travava TODA campanha: `conectado_em`
 * não era escrito em lugar nenhum do sistema, então `reservarCotaCampanha`
 * lia `null`, respondia "número ainda não foi pareado" e o disparador
 * parava — com a fila inteira parecendo apenas "pendente", sem erro
 * nenhum registrado para o corretor ver.
 *
 * Sobre carimbar `conectado_em = agora` quando descobrimos um número já
 * pareado: é deliberadamente conservador. O marco real do pareamento pode
 * ter sido semanas atrás, mas não temos como saber — e errar para o lado
 * "número novo" só custa uma cota diária menor nos primeiros dias, que
 * sobe sozinha. Errar para o outro lado custa o número.
 */
export async function sincronizarConexaoInstancia(params: {
  instanciaId: string;
  instanceName: string;
  conectadoEmAtual: string | null;
  /** Número guardado hoje — é a base para detectar troca de chip. */
  telefoneAtual?: string | null;
}): Promise<EstadoInstancia> {
  const supabase = createServiceClient();

  const estado = await consultarEstadoConexao(params.instanceName);

  if (!estado.ok) {
    // Provedor fora do ar não é motivo para apagar um marco de conexão que
    // já existe: mantemos o que o banco sabe e deixamos o chamador decidir.
    return {
      conectado: Boolean(params.conectadoEmAtual),
      estado: "indisponivel",
      conectadoEm: params.conectadoEmAtual ? new Date(params.conectadoEmAtual) : null,
      detalhe: estado.detalhe,
    };
  }

  if (!estado.conectado) {
    await supabase
      .from("corretor_whatsapp_instancias")
      .update({ status_conexao: estado.estado === "connecting" ? "conectando" : "desconectado" })
      .eq("id", params.instanciaId);

    return { conectado: false, estado: estado.estado, conectadoEm: null };
  }

  // Chip diferente = reputação diferente: zera cota, bloqueio e reinicia a
  // curva de aquecimento (ver trocaDeNumero.ts). Reconexão do MESMO número
  // não zera nada.
  const reset = resetPorTrocaDeNumero(params.telefoneAtual, estado.telefone);
  const conectadoEm = reset?.conectado_em ?? params.conectadoEmAtual ?? new Date().toISOString();

  await supabase
    .from("corretor_whatsapp_instancias")
    .update({
      status_conexao: "conectado",
      conectado_em: conectadoEm,
      ...(estado.telefone ? { telefone_conectado: estado.telefone } : {}),
      // Um número que responde "open" não está mais em falha: zera o
      // contador para o disjuntor não abrir por histórico velho.
      falhas_seguidas: 0,
      ...(reset
        ? {
            envios_campanha_contador: reset.envios_campanha_contador,
            envios_campanha_data: reset.envios_campanha_data,
            bloqueado_ate: reset.bloqueado_ate,
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.instanciaId);

  if (reset) {
    console.warn(
      `[whatsapp] número trocado em ${params.instanceName}: cota, bloqueio e aquecimento zerados.`,
    );
  }

  return { conectado: true, estado: estado.estado, conectadoEm: new Date(conectadoEm) };
}

/**
 * Aplica o `connection.update` que o provedor empurra pelo webhook.
 *
 * Mesmo efeito da sincronização ativa, sem a ida à rede — aqui o estado
 * chegou de graça, junto do evento.
 */
export async function registrarEventoConexao(params: {
  instanceName: string;
  estado: string;
  telefone?: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  const conectado = params.estado === "open";

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, conectado_em, telefone_conectado")
    .eq("instance_name", params.instanceName)
    .maybeSingle();

  if (!instancia) return;

  // Chip diferente = reputação diferente. Zera cota do dia, bloqueio e
  // reinicia o aquecimento (ver trocaDeNumero.ts); reconexão do MESMO
  // número não zera nada.
  const reset = conectado
    ? resetPorTrocaDeNumero(instancia.telefone_conectado, params.telefone)
    : null;

  await supabase
    .from("corretor_whatsapp_instancias")
    .update({
      status_conexao: conectado ? "conectado" : params.estado === "connecting" ? "conectando" : "desconectado",
      // Só carimba na primeira vez: uma reconexão (queda de internet, troca
      // de celular) não pode zerar a curva de aquecimento de um número que
      // já vinha maduro. A exceção é a troca de número, tratada acima.
      ...(conectado && !instancia.conectado_em ? { conectado_em: new Date().toISOString() } : {}),
      ...(conectado && params.telefone ? { telefone_conectado: params.telefone } : {}),
      ...(conectado ? { falhas_seguidas: 0 } : {}),
      ...(reset
        ? {
            conectado_em: reset.conectado_em,
            envios_campanha_contador: reset.envios_campanha_contador,
            envios_campanha_data: reset.envios_campanha_data,
            bloqueado_ate: reset.bloqueado_ate,
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", instancia.id);

  if (reset) {
    console.warn(
      `[whatsapp] número trocado em ${params.instanceName}: cota, bloqueio e aquecimento zerados.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Trava de disparo (migration 0024)
// ---------------------------------------------------------------------------

/**
 * Garante que só um disparador por vez use um número de WhatsApp.
 *
 * Três gatilhos independentes chamam o mesmo disparador — o cron diário, o
 * botão "Processar fila agora" e o auto-encadeamento. Sem trava, dois deles
 * chegando juntos leem a mesma linha `pendente` e mandam a mesma mensagem
 * duas vezes, no mesmo segundo: rajada e texto repetido, os dois padrões
 * que a fila existe para evitar.
 */
export async function travarDisparo(escopo: string, dono: string, segundos: number): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("travar_disparo", {
    p_escopo: escopo,
    p_dono: dono,
    p_segundos: segundos,
  });

  // Falha ao falar com o banco: não assumimos a trava. Perder um ciclo de
  // disparo é barato; mandar em duplicidade, não.
  if (error) return false;
  return data === true;
}

export async function destravarDisparo(escopo: string, dono: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.rpc("destravar_disparo", { p_escopo: escopo, p_dono: dono });
}
