import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import {
  bloqueadoAtePor,
  deveAbrirDisjuntor,
  limiteDiarioCampanha,
  diasDesdeConexao,
  INTERVALO_MINIMO_SEGUNDOS,
  INTERVALO_MAXIMO_SEGUNDOS,
} from "./antiBan";
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
  /** Slug do corretor — vira o link do catálogo dele (`/?corretor=<slug>`). */
  slugCorretor: string | null;
  nomeAssistente: string;
  tomVoz: string;
  modoBot: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado";
  webhookSecret: string | null;
  /** Frase que o corretor digita no próprio chat para "ligar" a IA. Nula = recurso desligado. */
  palavraChaveAtivacao: string | null;
  palavraChaveTeste: string | null;
  /** Frases que o CLIENTE escreve e que liberam a IA na hora (0056). */
  palavrasEntradaCliente: string | null;
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
      "id, corretor_id, instance_name, nome_assistente, tom_voz, modo_bot, webhook_secret, palavra_chave_ativacao, palavra_chave_teste, palavras_entrada_cliente",
    )
    .eq("instance_name", instanceName)
    .maybeSingle();

  if (error || !data) return null;

  const { data: corretor } = await supabase
    .from("corretores")
    .select("nome, creci, whatsapp, slug")
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
    slugCorretor: corretor.slug,
    nomeAssistente: data.nome_assistente,
    tomVoz: data.tom_voz,
    modoBot: data.modo_bot,
    webhookSecret: data.webhook_secret,
    palavraChaveAtivacao: data.palavra_chave_ativacao,
    palavraChaveTeste: data.palavra_chave_teste,
    palavrasEntradaCliente: data.palavras_entrada_cliente,
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
  /** Conversa de teste da equipe: fora do few-shot e do golden (ver 0038/0039). */
  eTeste: boolean;
  /**
   * O telefone já era do CRM ANTES desta conversa (0049).
   *
   * Decide duas coisas: a IA atende sem esperar palavra-chave, e ela VOLTA
   * sozinha quando a pausa de 24h vence — em vez de ficar retravada para
   * sempre pela primeira mensagem que o corretor digitou.
   */
  clienteConhecido: boolean;
};

const SELECT_CONVERSA =
  "id, lead_id, telefone_cliente, bot_ativo, pausado_humano_ate, liberado_por_palavra_chave, origem, e_teste, cliente_conhecido";

function mapConversa(row: {
  id: string;
  lead_id: string | null;
  telefone_cliente: string;
  bot_ativo: boolean;
  pausado_humano_ate: string | null;
  liberado_por_palavra_chave: boolean;
  origem: "organica" | "campanha";
  e_teste: boolean;
  cliente_conhecido?: boolean;
}): ConversaPersistida {
  return {
    id: row.id,
    leadId: row.lead_id,
    telefoneCliente: row.telefone_cliente,
    botAtivo: row.bot_ativo,
    pausadoHumanoAte: row.pausado_humano_ate,
    liberadoPorPalavraChave: row.liberado_por_palavra_chave,
    clienteConhecido: row.cliente_conhecido ?? false,
    eTeste: row.e_teste,
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

/** Só as strings de um `jsonb` que deveria ser lista de texto. */
function apenasTextos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
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
/**
 * Devolve o lead deste telefone, criando se não houver — e diz QUAL dos
 * dois aconteceu.
 *
 * `jaEraDoCrm` é o que a F3 precisa: quem já estava cadastrado antes desta
 * conversa é cliente conhecido e a IA atende na hora; número desconhecido
 * espera a palavra-chave. Sem essa distinção a regra não existiria — o
 * lead é criado aqui mesmo, então "tem lead" passa a ser verdade para todo
 * mundo no instante em que a pessoa escreve.
 */
async function encontrarOuCriarLead(
  supabase: ReturnType<typeof createServiceClient>,
  params: { corretorId: string; telefoneCliente: string; nomeCliente?: string | null; origem?: "organica" | "campanha" },
): Promise<{ leadId: string | null; jaEraDoCrm: boolean }> {
  const candidatos = candidatosTelefone(params.telefoneCliente);

  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("corretor_id", params.corretorId)
    .in("telefone_e164", candidatos)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lead) return { leadId: lead.id, jaEraDoCrm: true };

  // Conversa de campanha sempre nasce de um lead existente (a fila é montada
  // a partir deles) — se não achou, é melhor não criar um duplicado.
  if (params.origem === "campanha") return { leadId: null, jaEraDoCrm: false };

  /*
   * `telefone_e164` NÃO entra no insert: é coluna GERADA
   * (`normalizar_telefone_br(telefone)`). Mandá-la fazia o Postgres recusar
   * a linha inteira com "cannot insert a non-DEFAULT value into column",
   * e como o erro era ignorado, a função devolvia null em silêncio.
   *
   * O efeito disso foi grande e invisível: NENHUM lead nascia de conversa
   * de WhatsApp. Em produção, 30 conversas com fala real de cliente — 721
   * mensagens — ficaram sem cadastro no CRM. E como o dossiê e o few-shot
   * de aprendizado dependem do vínculo conversa↔lead, os dois estavam
   * mortos por consequência.
   */
  const { data: criado, error } = await supabase
    .from("leads")
    .insert({
      corretor_id: params.corretorId,
      nome: params.nomeCliente?.trim() || `WhatsApp ${params.telefoneCliente.slice(-4)}`,
      telefone: params.telefoneCliente,
      etapa: "novo",
      origem: "whatsapp/organico",
      origem_atribuicao: "manual",
      tipo: "comprador",
    })
    .select("id")
    .single();

  // Falhar aqui não pode ser silencioso de novo: sem lead, a conversa
  // acontece mas não vira nada no funil.
  if (error) {
    console.error("[whatsapp] não consegui criar o lead da conversa:", error.message);
    return { leadId: null, jaEraDoCrm: false };
  }

  return { leadId: criado?.id ?? null, jaEraDoCrm: false };
}

/**
 * Preenche o nome do contato onde ele FALTA, a partir do pushName que o
 * WhatsApp manda em toda mensagem.
 *
 * O nome era capturado só na CRIAÇÃO da conversa: quem escreveu antes de o
 * provedor entregar o pushName ficava sem nome para sempre, e o lead
 * nascia "WhatsApp 4567" e nunca mais mudava — impossível de localizar na
 * lista. As duas guardas são deliberadas: a conversa só recebe nome quando
 * está NULA (nome digitado pelo corretor nunca é sobrescrito por pushName,
 * que é texto livre do cliente), e o lead só troca quando ainda carrega o
 * placeholder `WhatsApp %` — lead com nome de verdade no CRM fica quieto.
 */
export async function preencherNomeContato(params: {
  conversaId: string;
  leadId?: string | null;
  nome: string;
}): Promise<void> {
  const nome = params.nome.trim().slice(0, 120);
  if (!nome) return;
  const supabase = createServiceClient();

  await supabase
    .from("whatsapp_conversas")
    .update({ nome_cliente: nome })
    .eq("id", params.conversaId)
    .is("nome_cliente", null);

  if (params.leadId) {
    await supabase.from("leads").update({ nome }).eq("id", params.leadId).like("nome", "WhatsApp %");
  }
}

/** Uma conversa por (corretor, telefone) — o `unique` da 0018 garante isso. */
export async function obterOuCriarConversa(params: {
  corretorId: string;
  telefoneCliente: string;
  nomeCliente?: string | null;
  /** Palavra-chave cadastrada na instância — decide se a conversa NASCE aguardando ativação. */
  palavraChaveConfigurada?: string | null;
  /** A de teste também liga a trava: ter qualquer uma cadastrada é ter o recurso ligado. */
  palavraChaveTeste?: string | null;
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
      const { leadId } = await encontrarOuCriarLead(supabase, params);
      if (leadId) {
        await supabase.from("whatsapp_conversas").update({ lead_id: leadId }).eq("id", existente.id);
        return mapConversa({ ...existente, lead_id: leadId });
      }
    }
    return mapConversa(existente);
  }

  const { leadId, jaEraDoCrm } = await encontrarOuCriarLead(supabase, params);

  const origem = params.origem ?? "organica";
  /*
   * Quem já era do CRM antes desta conversa é atendido na hora; número
   * desconhecido espera a palavra-chave. É o que faz a trava deixar de ser
   * silêncio e virar incentivo para cadastrar o lead — ver
   * `exigePalavraChave`, e a medição de 24/08 que motivou isto: 172
   * mensagens de cliente, zero respostas.
   */
  const precisaDePalavraChave = exigePalavraChave({
    palavraChaveConfigurada: params.palavraChaveConfigurada,
    palavraChaveTeste: params.palavraChaveTeste,
    origemConversa: origem,
    jaEraDoCrm,
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
      cliente_conhecido: jaEraDoCrm,
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
/**
 * O corretor digitou a palavra de TESTE: a conversa deixa de contar como
 * atendimento real, para sempre.
 *
 * Sem volta de propósito. Conversa usada para testar já está contaminada —
 * mensagens "Teste", repetição proposital, o próprio corretor fingindo ser
 * cliente. Nada disso vira exemplo bom depois, e o custo de um falso
 * positivo (uma conversa real marcada como teste) é um exemplo a menos no
 * corpus; o do falso negativo é o prompt aprendendo besteira.
 */
export async function marcarConversaComoTeste(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("whatsapp_conversas").update({ e_teste: true }).eq("id", conversaId);
}

/**
 * O lead chegou pela mensagem pronta de um anúncio (link porteiro
 * /wa/<campanha>): carimba a origem e o anúncio na ficha do CRM.
 *
 * O gate por `origem = 'whatsapp/organico'` é deliberado: só promove o
 * lead que o PRÓPRIO webhook acabou de criar como genérico. Lead que já
 * era do CRM (importado, formulário do Lead Ads, manual) mantém a origem
 * verdadeira — sobrescrever apagaria de onde ele veio de fato.
 */
export async function marcarLeadVindoDeAnuncio(leadId: string, nomeImovel: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("leads")
    .update({ origem: "meta/ctwa", anuncio_origem: nomeImovel.slice(0, 160) })
    .eq("id", leadId)
    .eq("origem", "whatsapp/organico");
}

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
/**
 * Grava uma mensagem da conversa.
 *
 * **`interacaoId` NÃO é parâmetro daqui, e a ausência é a correção.**
 *
 * `whatsapp_mensagens.interacao_id` tem chave estrangeira para
 * `ia_interacoes` (0040), e o webhook grava a mensagem do bot ANTES de
 * escrever a telemetria — o uuid existe, a linha ainda não. O insert violava
 * a FK, o erro caía no `console.error` abaixo, e a função devolvia
 * `{ inedita: true }` como se tivesse gravado.
 *
 * O efeito foi grande e silencioso: **nenhuma resposta do bot foi salva
 * entre 23/08 e 25/08/2026.** E como `historicoRecente` é o que alimenta o
 * prompt, a IA nunca via as próprias falas: ela cumprimentava do zero em
 * TODA mensagem ("Oi!" cinco vezes na mesma conversa) e repetia a mesma
 * oferta depois de o cliente já ter aceitado. Parecia perda de contexto;
 * era ausência de contexto.
 *
 * Por isso o vínculo saiu daqui e virou `vincularInteracaoNaMensagem`, que
 * roda DEPOIS da telemetria existir. A ordem passa a ser impossível de
 * inverter por engano — mesma escolha que tirou o parâmetro `legenda` de
 * `enviarMidiaWhatsapp`: quando um parâmetro só pode ser usado errado, ele
 * não deve existir.
 *
 * A regra por trás: **a conversa é o produto, a telemetria é instrumento.**
 * Instrumento nunca pode apagar produto.
 */
export async function gravarMensagem(params: {
  conversaId: string;
  remetente: "cliente" | "bot" | "corretor";
  conteudo: string;
  tipo?: "texto" | "audio" | "imagem" | "documento";
  midiaUrl?: string | null;
  providerMessageId?: string | null;
  /** Só para mensagem ENVIADA por nós: nasce 'enviada' e o ack promove. */
  statusEntrega?: "enviada" | null;
}): Promise<{ inedita: boolean; id: string | null }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("whatsapp_mensagens")
    .insert({
      conversa_id: params.conversaId,
      remetente: params.remetente,
      tipo: params.tipo ?? "texto",
      conteudo: params.conteudo,
      midia_url: params.midiaUrl ?? null,
      provider_message_id: params.providerMessageId ?? null,
      status_entrega: params.statusEntrega ?? null,
    })
    .select("id")
    .maybeSingle();

  // 23505 = violação de unicidade: é a reentrega. Qualquer outro erro é
  // problema real, mas nunca pode derrubar o fluxo de resposta — loga e segue.
  if (error) {
    if (error.code === "23505") return { inedita: false, id: null };
    console.error("Falha ao gravar mensagem de WhatsApp:", error.message);
    return { inedita: true, id: null };
  }

  await supabase
    .from("whatsapp_conversas")
    .update({
      ultima_mensagem: params.conteudo.slice(0, 500),
      ultima_interacao_em: new Date().toISOString(),
    })
    .eq("id", params.conversaId);

  return { inedita: true, id: data?.id ?? null };
}

const ORDEM_ENTREGA = { enviada: 1, entregue: 2, lida: 3 } as const;

/**
 * Aplica um ack de entrega/leitura vindo do MESSAGES_UPDATE (0051).
 *
 * Monotônico: ack chega fora de ordem com frequência (READ antes do
 * DELIVERY atrasado), e rebaixar "lida" para "entregue" seria o tick
 * andando para trás na tela do corretor. Mensagem não encontrada é o caso
 * normal — quase todo ack é de balão do bot, que não guarda provider id.
 */
export async function aplicarAckDeEntrega(
  providerMessageId: string,
  status: "entregue" | "lida",
): Promise<void> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("id, status_entrega")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (!data) return;
  const atual = data.status_entrega ? ORDEM_ENTREGA[data.status_entrega] : 0;
  if (ORDEM_ENTREGA[status] <= atual) return;

  await supabase.from("whatsapp_mensagens").update({ status_entrega: status }).eq("id", data.id);
}

/**
 * Liga a mensagem enviada à linha de telemetria que a produziu (0040).
 *
 * Roda DEPOIS de `registrarInteracao`, porque a FK exige que a linha de
 * `ia_interacoes` já exista. Falhar aqui custa a avaliação individual
 * daquela resposta no Live Chat — nunca a mensagem, que já está gravada.
 */
export async function vincularInteracaoNaMensagem(
  mensagemId: string | null,
  interacaoId: string,
): Promise<void> {
  if (!mensagemId) return;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("whatsapp_mensagens")
    .update({ interacao_id: interacaoId })
    .eq("id", mensagemId);

  if (error) {
    console.warn("[whatsapp] mensagem gravada, mas sem vínculo com a telemetria:", error.message);
  }
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

/**
 * A primeira resposta do bot É o primeiro contato — a etapa acompanha.
 *
 * Deterministico por construção: nenhum julgamento de IA decide isso, é um
 * FATO (uma resposta saiu). O `eq("etapa", "novo")` no update é a regra
 * inteira: só avança quem ainda está em "novo", nunca volta ninguém, e
 * chamar duas vezes não faz nada na segunda — o termostato do funil. As
 * etapas seguintes continuam humanas (fora a visita confirmada, que já é
 * automática): o dossiê da IA oscila entre leituras, e etapa que anda e
 * volta sozinha no quadro destrói a confiança do corretor no funil.
 */
/**
 * Marca uma tentativa de contato NOSSA neste lead.
 *
 * Chamada por todo caminho em que a iniciativa é da casa: disparo de
 * campanha, follow-up automático e mensagem que o corretor manda pelo Live
 * Chat. A resposta da IA a quem escreveu NÃO chama — responder não é tentar
 * alcançar alguém, e contá-la faria a conversa mais engajada parecer a mais
 * insistente.
 *
 * O incremento acontece no banco (`registrar_tentativa_contato`, 0060) e
 * não aqui: ler-somar-gravar perde contagem quando duas mensagens saem no
 * mesmo instante, e é exatamente isso que acontece com cron, corrente de
 * disparo e botão do painel tocando a mesma fila. Mesma razão das funções
 * de cota.
 */
export async function registrarTentativaDeContato(leadId: string | null): Promise<void> {
  if (!leadId) return;
  const supabase = createServiceClient();
  await supabase.rpc("registrar_tentativa_contato", { p_lead_id: leadId });
}

/**
 * O cliente falou: zera a contagem de insistência.
 *
 * O TOTAL não é tocado — ele é histórico, e histórico que o próprio sistema
 * reescreve não é histórico. O que zera é `tentativas_sem_resposta`, que é
 * a contagem que responde "já insisti demais aqui?".
 */
export async function registrarRespostaDoLead(leadId: string | null): Promise<void> {
  if (!leadId) return;
  const supabase = createServiceClient();
  await supabase.rpc("registrar_resposta_do_lead", { p_lead_id: leadId });
}

export async function avancarLeadParaPrimeiroContato(leadId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("leads")
    .update({ etapa: "primeiro_contato", etapa_alterada_em: new Date().toISOString() })
    .eq("id", leadId)
    .eq("etapa", "novo");
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

  // Só o REENGAJAMENTO conta para o teto de 2 e para o "já tem pendente":
  // lembrete de visita é serviço, não insistência, e vive fora desta conta.
  const { data: existentes } = await supabase
    .from("whatsapp_followups")
    .select("id, status, tentativa")
    .eq("conversa_id", conversaId)
    .eq("tipo", "reengajamento");

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

/**
 * O cliente respondeu: o REENGAJAMENTO pendente perde o motivo de existir.
 * O lembrete de visita NÃO é cancelado aqui de propósito — responder "ok!"
 * hoje não desmarca a visita de amanhã; quem desfaz o lembrete é a
 * revalidação do runner contra `leads.visita_agendada_em`.
 */
export async function cancelarFollowupsPendentes(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("whatsapp_followups")
    .update({ status: "cancelado", motivo: "cliente_respondeu" })
    .eq("conversa_id", conversaId)
    .eq("status", "pendente")
    .eq("tipo", "reengajamento");
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
export async function pausarBotPorAtendimentoHumano(
  conversaId: string,
  opcoes: { retravarPalavraChave?: boolean } = {},
): Promise<void> {
  const supabase = createServiceClient();
  const ate = new Date(Date.now() + HORAS_PAUSA_HUMANA * 3600_000).toISOString();

  /*
   * A pausa de 24h sozinha não bastava: ela VENCE. Com palavra-chave
   * cadastrada, a fala do corretor também retrava a conversa, e aí a IA
   * só volta quando ele digitar a palavra de novo — em vez de voltar
   * sozinha no dia seguinte, que numa linha pessoal significa a IA
   * assumindo a conversa da família (ver `decidirPorFalaDoCorretor`).
   */
  await supabase
    .from("whatsapp_conversas")
    .update(
      opcoes.retravarPalavraChave
        ? { pausado_humano_ate: ate, liberado_por_palavra_chave: false }
        : { pausado_humano_ate: ate },
    )
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

/**
 * Últimas mensagens para dar memória ao agente — sem isso ele repete a
 * saudação a cada turno.
 *
 * Eram 12, e 12 é pouco: com o bot respondendo a quase toda fala, isso
 * cobre umas seis trocas. A queixa "a IA não leva em conta o histórico"
 * tinha aqui uma de suas causas — a região, a tipologia e o imóvel que o
 * cliente elogiou saíam da janela e ela recomeçava do zero. Subiu para 20,
 * e o custo em tokens é menor que a economia do catálogo encolhido pelo
 * foco (dez fichas viram três, ver `focoDaConversa.ts`).
 */
export async function historicoRecente(
  conversaId: string,
  limite = 20,
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

export type VezDeDisparar =
  | { permitido: true }
  | {
      permitido: false;
      /**
       * `aguardando_intervalo` é o único motivo em que vale a pena ESPERAR:
       * a vez chega em segundos. Os outros são do dia inteiro.
       */
      motivo: "aguardando_intervalo" | "cota_diaria" | "numero_bloqueado" | "falha";
      detalhe: string;
      /** Quanto falta para a próxima vez, quando isso é conhecido. */
      esperaMs: number;
    };

/**
 * Pede a vez de disparar por este número: cota diária E espaçamento.
 *
 * A conta roda no banco (`consumir_cota_campanha_espacada`, 0062) porque
 * pg_cron, corrente da Vercel e botão do painel tocam a mesma fila. Dois
 * disparos simultâneos leriam o mesmo contador e ambos se achariam dentro do
 * limite — e, pior, os dois se achariam autorizados a mandar no mesmo
 * segundo.
 *
 * O espaçamento entrou aqui, e não no laço do disparador, por causa de um
 * defeito medido em produção: o intervalo de 35-75s vivia só em
 * `agendado_para`, calculado na criação da campanha. Item VENCIDO tinha
 * espera negativa e saía na hora, um atrás do outro — 15 mensagens em 57
 * segundos quando a fila ficou 28 minutos parada. Piso de tempo real que
 * depende do chamador não é piso: é convenção. Este é o único ponto por onde
 * todo disparo iniciado por nós passa (campanha e follow-up), então é aqui
 * que a garantia cabe.
 */
export async function reservarCotaCampanha(
  instanciaId: string,
  conectadoEm: Date | null,
): Promise<VezDeDisparar> {
  if (!conectadoEm) {
    return {
      permitido: false,
      motivo: "falha",
      detalhe: "Número ainda não foi pareado.",
      esperaMs: 0,
    };
  }

  const limite = limiteDiarioCampanha(diasDesdeConexao(conectadoEm));
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("consumir_cota_campanha_espacada", {
    p_instancia_id: instanciaId,
    p_limite: limite,
    p_intervalo_min: INTERVALO_MINIMO_SEGUNDOS,
    p_intervalo_max: INTERVALO_MAXIMO_SEGUNDOS,
  });

  if (error) {
    /*
     * Falha ao PERGUNTAR não pode virar permissão. Antes de 0062 um erro
     * aqui já recusava o envio, e isso continua: sem resposta do banco não
     * há como saber se o intervalo foi cumprido, e mandar assim mesmo é
     * exatamente o risco que a trava existe para remover.
     */
    console.error("[anti-ban] não foi possível reservar a vez de disparo:", error.message);
    return {
      permitido: false,
      motivo: "falha",
      detalhe: "Falha ao verificar a cota diária.",
      esperaMs: 0,
    };
  }

  const resposta = data;

  if (!resposta) {
    /*
     * Sem `error` e sem corpo: não deveria acontecer, e é justamente por
     * isso que precisa de um lado definido. Numa trava anti-ban o lado
     * seguro de errar é NÃO mandar — "não sei se já passou o intervalo"
     * tem de valer como "ainda não passou".
     */
    console.error("[anti-ban] resposta vazia ao reservar a vez de disparo.");
    return {
      permitido: false,
      motivo: "falha",
      detalhe: "Falha ao verificar a cota diária.",
      esperaMs: 0,
    };
  }

  if (resposta.ok) return { permitido: true };

  const esperaMs = Math.max(0, (resposta.espera_segundos ?? 0) * 1000);

  if (resposta.motivo === "aguardando_intervalo") {
    return {
      permitido: false,
      motivo: "aguardando_intervalo",
      detalhe: `Aguardando o intervalo anti-ban entre disparos (${Math.ceil(esperaMs / 1000)}s).`,
      esperaMs,
    };
  }

  if (resposta.motivo === "numero_bloqueado") {
    return {
      permitido: false,
      motivo: "numero_bloqueado",
      detalhe: "Envios deste número estão pausados após falhas seguidas do provedor.",
      esperaMs,
    };
  }

  return {
    permitido: false,
    motivo: "cota_diaria",
    detalhe: `Cota diária de ${limite} disparos atingida.`,
    esperaMs: 0,
  };
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
    /*
     * A renda mora em `leads`, não no dossiê — quem a carrega para a tela é
     * `dadosLead.ts`. Aqui ela entra como null e só é preenchida pela
     * extração, que é a única que a descobre.
     */
    rendaMensal: null,
    // Como a renda: moram em `leads`, não no dossiê.
    regiaoInteresse: null,
    dormitoriosMin: null,
    formaPagamento: data.forma_pagamento,
    // Ainda sem coluna própria: chegam na extração e entram no prompt da
    // mesma conversa. Persistir exigiria migration, e o valor deles é
    // orientar a resposta agora — não virar relatório.
    profissao: null,
    compraEmConjunto: null,
    perfilFamiliar: data.perfil_familiar,
    urgenciaMudanca: data.urgencia_mudanca,
    /*
     * As duas colunas são `jsonb`: o banco não garante que o array só tem
     * texto, e o dossiê é escrito por IA. `Array.isArray` sozinho deixava
     * passar `[null, 42]` e a tela renderizaria isso — filtrar por string é
     * o que torna o tipo verdadeiro.
     */
    exigenciasEspecificas: apenasTextos(data.exigencias_especificas),
    objecoesIdentificadas: apenasTextos(data.objecoes_identificadas),
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

  /*
   * A renda também vai para `leads`, e não só para o dossiê, porque é lá
   * que a ficha do CRM lê — e dado gravado que nenhuma tela mostra é
   * indistinguível de dado perdido (foi o que aconteceu com
   * `historico_envios`, 53 linhas e zero leitores).
   *
   * Só escreve quando há valor: um dossiê reextraído sem a renda na
   * conversa não pode APAGAR o que o cliente já disse antes.
   */
  /*
   * Renda E orçamento vão para `leads`, não só para o dossiê.
   *
   * A renda já ia; o orçamento ficava só em `lead_observacoes_ia` — e a
   * ficha do CRM lê de `leads.orcamento_min/max`. Resultado medido em
   * 24/08/2026: **0 de 58 leads com orçamento**, num sistema que extrai
   * orçamento de toda conversa. Mesmo defeito de `historico_envios`: dado
   * gravado que nenhuma tela mostra é indistinguível de dado perdido.
   *
   * `renda_mensal` e `orcamento_*` são coisas diferentes e as duas
   * importam: orçamento é quanto a pessoa quer gastar no imóvel; renda é
   * quanto entra por mês, e é ela que define o que o banco financia.
   *
   * Campo sem valor NÃO é escrito. Um dossiê reextraído de uma conversa em
   * que o assunto não voltou viria com null, e null sobrescrevendo apagaria
   * o que o cliente já disse dez mensagens atrás. Por isso o objeto é
   * montado campo a campo, e o update só acontece se sobrou alguma coisa.
   */
  const doLead: {
    renda_mensal?: number;
    orcamento_min?: number;
    orcamento_max?: number;
    regiao_interesse?: string;
    dormitorios_min?: number;
  } = {};
  if (dossie.rendaMensal !== null) doLead.renda_mensal = dossie.rendaMensal;
  if (dossie.orcamentoMin !== null) doLead.orcamento_min = dossie.orcamentoMin;
  if (dossie.orcamentoMax !== null) doLead.orcamento_max = dossie.orcamentoMax;
  // A região que o cliente disser no WhatsApp entra sozinha na ficha do CRM
  // (pedido de 25/08/2026) — o corretor recebe o lead já com ela preenchida.
  if (dossie.regiaoInteresse !== null) doLead.regiao_interesse = dossie.regiaoInteresse;
  if (dossie.dormitoriosMin !== null) doLead.dormitorios_min = dossie.dormitoriosMin;

  if (Object.keys(doLead).length > 0) {
    await supabase.from("leads").update(doLead).eq("id", leadId);
  }
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

    /*
     * Carimba o marco da queda UMA VEZ (0065). O `is(..., null)` é a parte
     * que importa: este caminho roda a cada ciclo do cron, e reescrever a
     * cada passagem faria um apagão de três dias aparecer eternamente como
     * "faz um minuto" — o defeito ficaria invisível justamente por ser
     * contínuo. É este marco que sustenta o "faz 3 dias" do aviso.
     */
    await supabase
      .from("corretor_whatsapp_instancias")
      .update({ desconectado_em: new Date().toISOString() })
      .eq("id", params.instanciaId)
      .is("desconectado_em", null);

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
      // O número voltou: apaga o marco da queda e a marca do aviso (0065).
      // É o que arma o alerta da PRÓXIMA vez — queda nova é notícia nova,
      // mesmo que a anterior tenha sido ontem.
      desconectado_em: null,
      aviso_queda_enviado_em: null,
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
