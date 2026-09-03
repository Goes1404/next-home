import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEmpreendimentos } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/service";
import { PROMPT_VERSAO } from "@/lib/whatsapp/aiAgent";
import { dentroDaJanela } from "@/lib/whatsapp/antiBan";
import { executarTurnoDeAtendimento } from "@/lib/whatsapp/turnoDeAtendimento";
import { decidirPorModo } from "@/lib/whatsapp/modoBot";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import {
  buscarDossieAtual,
  gravarMensagem,
  vincularInteracaoNaMensagem,
  historicoRecente,
  registrarResultadoEnvio,
  registrarTentativaDeContato,
  reservarCotaCampanha,
  travarDisparo,
  destravarDisparo,
  ultimaFalaDoCorretor,
  marcarConversaComoAtendimento,
  motivoDoSilencio,
} from "@/lib/whatsapp/repositorio";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";
import { formatarVisitaSP, instrucaoDoFollowup } from "@/lib/whatsapp/followupTexto";
import { separarRajada } from "@/lib/whatsapp/rajada";
import {
  decidirRespostaAtrasada,
  instrucaoDaRespostaAtrasada,
} from "@/lib/whatsapp/respostaAtrasada";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Runner dos follow-ups proativos (tabela whatsapp_followups, 0028).
 *
 * Chamado pelo pg_cron a cada 5 min (configurar_followups_automaticos) com
 * o mesmo CRON_SECRET das campanhas. Cada item é REVALIDADO na hora do
 * envio — o mundo muda entre agendar e disparar: o corretor pode ter
 * assumido a conversa, o modo pode ter mudado, a cota pode ter acabado.
 * Reprovou, vira `descartado` com motivo; nunca insiste além das 2
 * tentativas que a agenda permite.
 *
 * Follow-up é tráfego iniciado por NÓS — mesma classe de risco anti-ban de
 * campanha: consome a cota diária (`consumir_cota_campanha`) e respeita a
 * janela de horário comercial.
 */

const MAX_POR_TIQUE = 10;

/**
 * Quantas respostas atrasadas por tique.
 *
 * Dois, e o limite é de TEMPO, não de anti-ban: cada uma custa uma chamada
 * do agente (teto de 20s) mais os envios, e esta função tem 60s. Os
 * follow-ups rodam na mesma invocação.
 *
 * Com o cron de 5 em 5 minutos, dois por tique dá 24 por hora — as 17
 * conversas represadas saem em menos de uma hora, e sem rajada: os envios
 * ficam naturalmente a minutos de distância, muito acima da faixa de
 * 35-75s que a proteção do número pede.
 */
const MAX_RESPOSTAS_ATRASADAS = 2;

/** Margem para não estourar os 60s da função no meio de um envio. */
const ORCAMENTO_VARREDURA_MS = 30_000;

function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requisicaoAutenticada(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    if (process.env.NODE_ENV === "production") {
      console.error("Cron de follow-ups recusado: CRON_SECRET não configurado em produção.");
      return false;
    }
    return true;
  }
  const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(recebido) && segredoConfere(recebido, segredo);
}

type ItemFollowup = {
  id: string;
  conversa_id: string;
  instancia_id: string;
  tentativa: number;
  agendado_para: string;
  tipo: "reengajamento" | "lembrete_visita";
};

/** Janela em que uma visita futura ganha lembrete: entre 8h e 30h antes. */
const LEMBRETE_MIN_HORAS = 8;
const LEMBRETE_MAX_HORAS = 30;

/**
 * Agenda o lembrete de véspera para visitas marcadas (roadmap item 7).
 *
 * Roda em todo tique, e é idempotente: uma visita ganha UM lembrete por
 * conversa (o índice tipo+conversa torna a busca barata). O horário do
 * lembrete é "20h antes da visita, nunca no passado" — se cair fora da
 * janela comercial, o próprio runner o segura até a janela abrir.
 */
async function agendarLembretesDeVisita(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const agora = Date.now();
  const { data: visitas } = await supabase
    .from("leads")
    .select("id, corretor_id, visita_agendada_em")
    .gte("visita_agendada_em", new Date(agora + LEMBRETE_MIN_HORAS * 3600_000).toISOString())
    .lte("visita_agendada_em", new Date(agora + LEMBRETE_MAX_HORAS * 3600_000).toISOString())
    .not("corretor_id", "is", null)
    .limit(50);

  let agendados = 0;
  for (const lead of visitas ?? []) {
    const { data: conversa } = await supabase
      .from("whatsapp_conversas")
      .select("id, corretor_id")
      .eq("lead_id", lead.id)
      .eq("corretor_id", lead.corretor_id!)
      .limit(1)
      .maybeSingle();
    // Visita marcada fora do WhatsApp (importação, painel) não tem conversa
    // para lembrar por aqui — o lembrete é do canal, não do CRM.
    if (!conversa) continue;

    const { data: jaTem } = await supabase
      .from("whatsapp_followups")
      .select("id")
      .eq("conversa_id", conversa.id)
      .eq("tipo", "lembrete_visita")
      .in("status", ["pendente", "enviado"])
      .gte("created_at", new Date(agora - 7 * 86_400_000).toISOString())
      .limit(1)
      .maybeSingle();
    if (jaTem) continue;

    const { data: instancia } = await supabase
      .from("corretor_whatsapp_instancias")
      .select("id")
      .eq("corretor_id", lead.corretor_id!)
      .maybeSingle();
    if (!instancia) continue;

    const quando = Math.max(
      agora,
      new Date(lead.visita_agendada_em!).getTime() - 20 * 3600_000,
    );
    await supabase.from("whatsapp_followups").insert({
      conversa_id: conversa.id,
      instancia_id: instancia.id,
      tentativa: 1,
      tipo: "lembrete_visita",
      agendado_para: new Date(quando).toISOString(),
    });
    agendados++;
  }
  return agendados;
}

/**
 * A varredura das respostas que o webhook DESCARTOU.
 *
 * ## Por que ela existe
 *
 * A pausa humana não adia a mensagem do cliente — ela a joga fora. O
 * webhook é o único gatilho do atendimento; quando decide "pausado", a
 * mensagem morre ali, e quando a pausa vence nada volta para respondê-la.
 * Medido em 03/09/2026: 17 conversas com lead real esperando de 22 a 52
 * horas, 7 delas com o bot já liberado havia horas. Ver `respostaAtrasada.ts`.
 *
 * ## Por que mora AQUI, e não num cron próprio
 *
 * Porque este cron já roda. Quatro recursos desta base subiram completos e
 * produziram zero linhas por falta de agendamento — o relatório semanal
 * ficou pronto e nunca foi agendado, e os dois crons de e-mail foram
 * desligados depois. Aplicar migration não liga nada; `configurar_*`
 * precisa ser CHAMADA. Pendurar numa varredura provada (2.719 execuções sem
 * falha) tira esse passo do caminho.
 *
 * ## Por que ANTES da janela de horário
 *
 * Decisão que este projeto já tomou, no webhook: "responder quem nos
 * escreveu não passa por cota nem por janela de horário — deixá-lo no vácuo
 * é pior para o número do que responder de madrugada". A conversa foi
 * iniciada pelo CLIENTE; isto é resposta, não propaganda.
 *
 * Chamá-la depois do `dentroDaJanela` faria ela herdar aquela saída
 * antecipada e contradizer a regra — exatamente o defeito do aviso de
 * queda, que ficou pendurado no caminho feliz do disparador e por isso não
 * disparava justamente quando o disjuntor abria.
 */
async function varrerRespostasAtrasadas(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ respondidas: number; puladas: number }> {
  const comecou = Date.now();
  const saldo = { respondidas: 0, puladas: 0 };

  /*
   * A MESMA view da fila do Início (0087). Usar outra fonte faria a tela
   * dizer que alguém espera enquanto o bot já teria respondido — duas
   * contas do mesmo número divergem, e esta decide quem é atendido.
   *
   * Ela já recorta o que importa: última fala é do cliente, tem lead, e é
   * ATENDIMENTO (liberada, cliente conhecido ou campanha). O que ela não
   * sabe é se o bot pode falar agora — isso é `motivoDoSilencio`, abaixo.
   */
  const { data: esperando } = await supabase
    .from("whatsapp_esperando_resposta")
    .select("conversa_id, corretor_id, lead_id, telefone_cliente, esperando_desde")
    .order("esperando_desde", { ascending: true })
    .limit(20);

  for (const linha of esperando ?? []) {
    if (saldo.respondidas >= MAX_RESPOSTAS_ATRASADAS) break;
    if (Date.now() - comecou > ORCAMENTO_VARREDURA_MS) break;
    if (!linha.conversa_id || !linha.corretor_id || !linha.esperando_desde) continue;

    const decisao = decidirRespostaAtrasada({ esperandoDesde: linha.esperando_desde });
    if (!decisao.responder) {
      saldo.puladas++;
      continue;
    }

    const desfecho = await responderAtrasada(supabase, {
      conversaId: linha.conversa_id,
      corretorId: linha.corretor_id,
      horas: decisao.horas,
    });
    if (desfecho === "respondida") saldo.respondidas++;
    else saldo.puladas++;
  }

  return saldo;
}

async function responderAtrasada(
  supabase: ReturnType<typeof createServiceClient>,
  params: { conversaId: string; corretorId: string; horas: number },
): Promise<"respondida" | "pulada"> {
  const { data: conversa } = await supabase
    .from("whatsapp_conversas")
    .select(
      "id, lead_id, telefone_cliente, bot_ativo, pausado_humano_ate, liberado_por_palavra_chave, origem, e_teste, cliente_conhecido",
    )
    .eq("id", params.conversaId)
    .maybeSingle();
  if (!conversa) return "pulada";

  /*
   * A MESMA função que o webhook usa para decidir o silêncio. É o que
   * garante que a varredura nunca fale onde o webhook calaria — se ela
   * tivesse régua própria, uma conversa pausada de propósito poderia ser
   * respondida por aqui, que é o pior desfecho possível: o bot por cima do
   * humano que está atendendo.
   */
  const silencio = motivoDoSilencio({
    id: conversa.id,
    leadId: conversa.lead_id,
    telefoneCliente: conversa.telefone_cliente,
    botAtivo: conversa.bot_ativo,
    pausadoHumanoAte: conversa.pausado_humano_ate,
    liberadoPorPalavraChave: conversa.liberado_por_palavra_chave,
    clienteConhecido: conversa.cliente_conhecido ?? false,
    eTeste: conversa.e_teste,
    origem: conversa.origem,
  });
  if (silencio) return "pulada";

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, corretor_id, instance_name, nome_assistente, tom_voz, modo_bot, conectado_em, bloqueado_ate")
    .eq("corretor_id", params.corretorId)
    .maybeSingle();
  if (!instancia || !instancia.conectado_em) return "pulada";
  if (instancia.bloqueado_ate && new Date(instancia.bloqueado_ate) > new Date()) return "pulada";

  const decisaoModo = decidirPorModo(
    instancia.modo_bot as "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado",
    {
      ultimaFalaCorretorEm:
        instancia.modo_bot === "co_piloto_3min" ? await ultimaFalaDoCorretor(conversa.id) : null,
    },
  );
  if (!decisaoModo.pode) return "pulada";

  const { data: corretor } = await supabase
    .from("corretores")
    .select("nome, creci, whatsapp, slug")
    .eq("id", instancia.corretor_id)
    .single();
  if (!corretor) return "pulada";

  const [catalogo, historicoCompleto, dossie] = await Promise.all([
    getEmpreendimentos().catch(() => []),
    historicoRecente(conversa.id),
    conversa.lead_id ? buscarDossieAtual(conversa.lead_id) : Promise.resolve(null),
  ]);

  /*
   * Os balões que ficaram sem resposta são exatamente o que `separarRajada`
   * chama de pendentes — ela corta o histórico na última fala nossa. Aqui
   * isso não é otimização: sem separar, as perguntas do cliente entrariam
   * no meio do histórico, indistinguíveis de fala de ontem, e a IA
   * responderia só a última. É a mesma correção da v16 do prompt.
   */
  const { historico, pendentes } = separarRajada(historicoCompleto);
  // A view garante que a última fala é do cliente; lista vazia aqui só
  // aconteceria numa corrida com o webhook. Não inventar resposta.
  if (pendentes.length === 0) return "pulada";

  const turno = await executarTurnoDeAtendimento({
    identidade: {
      nomeCorretor: corretor.nome,
      slugCorretor: corretor.slug ?? undefined,
      creciCorretor: corretor.creci,
      telefoneCorretor: corretor.whatsapp,
      nomeAssistente: instancia.nome_assistente,
      tomVoz: instancia.tom_voz,
    },
    catalogo,
    historico,
    dossie,
    vezDoCliente: pendentes,
    instrucaoExtra: instrucaoDaRespostaAtrasada({ horas: params.horas }),
  });

  // Contingência não vira mensagem: o cliente já esperou horas, e receber
  // "estou verificando e já te respondo" depois disso é pior que o silêncio
  // — ele esperaria de novo. Fica para o próximo tique.
  if (turno.resposta.meta.fallback) return "pulada";

  const baloes = turno.baloes.length > 0 ? turno.baloes : [turno.resposta.textoResposta];
  let idDoPrimeiro: string | undefined;
  let todosEnviados = true;

  for (let i = 0; i < baloes.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 900 + Math.floor(Math.random() * 800)));
    const envio = await enviarMensagemWhatsapp({
      instanceName: instancia.instance_name,
      telefone: conversa.telefone_cliente,
      texto: baloes[i],
    });
    if (!envio.enviado) todosEnviados = false;
    if (i === 0) idDoPrimeiro = envio.messageId;
  }

  await registrarResultadoEnvio(instancia.id, todosEnviados);
  /*
   * Nada de marcar "já respondida" em lugar nenhum: assim que o balão é
   * gravado, a última fala da conversa deixa de ser do cliente e a view
   * para de devolvê-la. O critério de parada é o próprio dado, não um
   * contador que poderia divergir dele.
   *
   * Se o envio falhar, a conversa volta no tique seguinte — e é o
   * disjuntor de falhas seguidas que impede a insistência infinita.
   */
  if (!todosEnviados) return "pulada";

  const interacaoId = crypto.randomUUID();
  const mensagemDoBot = await gravarMensagem({
    conversaLiberada: true,
    conversaId: conversa.id,
    remetente: "bot",
    conteudo: turno.resposta.textoResposta,
    providerMessageId: idDoPrimeiro ?? null,
    statusEntrega: idDoPrimeiro ? "enviada" : null,
  });

  await registrarInteracao({
    id: interacaoId,
    conversaId: conversa.id,
    corretorId: instancia.corretor_id,
    origem: "webhook",
    eTeste: conversa.e_teste,
    promptVersao: PROMPT_VERSAO,
    acao: "respondida",
    modelo: turno.resposta.meta.modelo,
    latenciaMs: turno.resposta.meta.latenciaMs,
    fallback: false,
  });
  if (mensagemDoBot.id) await vincularInteracaoNaMensagem(mensagemDoBot.id, interacaoId);

  return "respondida";
}

export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const resultado = { processados: 0, enviados: 0, descartados: 0 };

  /*
   * ANTES da janela de propósito. Isto é RESPOSTA a quem nos escreveu, não
   * disparo nosso — e a regra desta casa, escrita no webhook, é que
   * responder quem escreveu não passa por cota nem por horário comercial.
   * Pôr a varredura depois do `return` abaixo a faria calar das 21h às 9h
   * justamente para quem já esperou a noite inteira.
   */
  const atrasadas = await varrerRespostasAtrasadas(supabase);

  // Fora do horário comercial nada sai — e nada é descartado: o item
  // espera a próxima janela, que é o comportamento que o cliente espera
  // de uma mensagem "casual" de vendedora.
  if (!dentroDaJanela(new Date())) {
    return NextResponse.json({ ok: true, ...resultado, atrasadas, motivo: "fora_da_janela" });
  }

  const dono = `followups-${crypto.randomUUID()}`;
  if (!(await travarDisparo("followups", dono, 110))) {
    return NextResponse.json({ ok: true, ...resultado, motivo: "outro_tique_rodando" });
  }

  try {
    await agendarLembretesDeVisita(supabase);

    const { data: vencidos } = await supabase
      .from("whatsapp_followups")
      .select("id, conversa_id, instancia_id, tentativa, agendado_para, tipo")
      .eq("status", "pendente")
      .lte("agendado_para", new Date().toISOString())
      .order("agendado_para", { ascending: true })
      .limit(MAX_POR_TIQUE);

    for (const item of (vencidos ?? []) as ItemFollowup[]) {
      resultado.processados++;
      const desfecho = await processarFollowup(supabase, item);
      if (desfecho === "enviado") resultado.enviados++;
      else if (desfecho === "descartado") resultado.descartados++;
    }

    return NextResponse.json({ ok: true, ...resultado, atrasadas });
  } finally {
    await destravarDisparo("followups", dono);
  }
}

export const POST = GET;

async function descartar(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  motivo: string,
): Promise<"descartado"> {
  await supabase.from("whatsapp_followups").update({ status: "descartado", motivo }).eq("id", id);
  return "descartado";
}

async function processarFollowup(
  supabase: ReturnType<typeof createServiceClient>,
  item: ItemFollowup,
): Promise<"enviado" | "descartado" | "pulado"> {
  // Revalidação 1: a conversa ainda quer o bot falando?
  const { data: conversa } = await supabase
    .from("whatsapp_conversas")
    .select("id, lead_id, telefone_cliente, bot_ativo, pausado_humano_ate, liberado_por_palavra_chave")
    .eq("id", item.conversa_id)
    .maybeSingle();

  if (!conversa || !conversa.bot_ativo || !conversa.liberado_por_palavra_chave) {
    return descartar(supabase, item.id, "bot_inativo");
  }
  if (conversa.pausado_humano_ate && new Date(conversa.pausado_humano_ate) > new Date()) {
    return descartar(supabase, item.id, "corretor_assumiu");
  }

  // Revalidação 2: o cliente respondeu depois do agendamento? (o cancelamento
  // no webhook cobre o caso normal; isto cobre corrida e itens antigos)
  const { data: ultimaCliente } = await supabase
    .from("whatsapp_mensagens")
    .select("created_at")
    .eq("conversa_id", item.conversa_id)
    .eq("remetente", "cliente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: agendamento } = await supabase
    .from("whatsapp_followups")
    .select("created_at")
    .eq("id", item.id)
    .single();

  if (
    ultimaCliente &&
    agendamento &&
    new Date(ultimaCliente.created_at) > new Date(agendamento.created_at)
  ) {
    return descartar(supabase, item.id, "cliente_respondeu");
  }

  // Revalidação 3: instância, modo e cota anti-ban.
  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, corretor_id, instance_name, nome_assistente, tom_voz, modo_bot, conectado_em, bloqueado_ate")
    .eq("id", item.instancia_id)
    .maybeSingle();

  if (!instancia || !instancia.conectado_em) return descartar(supabase, item.id, "instancia_desconectada");
  if (instancia.bloqueado_ate && new Date(instancia.bloqueado_ate) > new Date()) {
    return descartar(supabase, item.id, "numero_bloqueado");
  }

  const decisao = decidirPorModo(instancia.modo_bot as "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado", {
    ultimaFalaCorretorEm:
      instancia.modo_bot === "co_piloto_3min" ? await ultimaFalaDoCorretor(conversa.id) : null,
  });
  if (!decisao.pode) return descartar(supabase, item.id, "modo_nao_permite");

  const cota = await reservarCotaCampanha(instancia.id, new Date(instancia.conectado_em));
  /*
   * Espaçamento anti-ban (0062) NÃO é motivo para descartar: a vez chega em
   * segundos e o tique seguinte pega o item. Descartar aqui apagaria um
   * follow-up legítimo porque uma campanha mandou mensagem 40 segundos
   * antes — e follow-up descartado não volta.
   */
  if (!cota.permitido && cota.motivo === "aguardando_intervalo") return "pulado";
  if (!cota.permitido) return descartar(supabase, item.id, "cota_esgotada");

  const { data: corretor } = await supabase
    .from("corretores")
    .select("nome, creci, whatsapp, slug")
    .eq("id", instancia.corretor_id)
    .single();
  if (!corretor) return descartar(supabase, item.id, "corretor_inexistente");

  // Lembrete de visita é revalidado contra a AGENDA na hora do envio: a
  // visita pode ter sido desmarcada ou movida desde o agendamento, e
  // lembrar de uma visita que não existe é pior que não lembrar.
  let visitaFormatada: string | undefined;
  if (item.tipo === "lembrete_visita") {
    const { data: lead } = conversa.lead_id
      ? await supabase
          .from("leads")
          .select("visita_agendada_em")
          .eq("id", conversa.lead_id)
          .maybeSingle()
      : { data: null };
    const visita = lead?.visita_agendada_em;
    if (!visita || new Date(visita).getTime() < Date.now() + 3600_000) {
      return descartar(supabase, item.id, "visita_desmarcada_ou_passou");
    }
    visitaFormatada = formatarVisitaSP(visita);
  }

  // Gera o texto de reengajamento com o MESMO agente e guardrails da
  // conversa normal — só muda o cenário via instrução extra.
  const [catalogo, historico, dossie] = await Promise.all([
    getEmpreendimentos().catch(() => []),
    historicoRecente(conversa.id),
    conversa.lead_id ? buscarDossieAtual(conversa.lead_id) : Promise.resolve(null),
  ]);

  /*
   * O MESMO turno do webhook (`turnoDeAtendimento.ts`), com uma diferença
   * declarada: `vezDoCliente` vazio. Ninguém falou — é o silêncio que
   * motiva a mensagem, e a instrução extra diz o que fazer com ele.
   *
   * O foco continua valendo: o follow-up fala do imóvel que a conversa já
   * escolheu, que é o assunto deixado em aberto. Sem ele, a retomada virava
   * uma rodada nova de sugestões, o oposto de "retome de onde parou".
   */
  const turno = await executarTurnoDeAtendimento({
    identidade: {
      nomeCorretor: corretor.nome,
      slugCorretor: corretor.slug ?? undefined,
      creciCorretor: corretor.creci,
      telefoneCorretor: corretor.whatsapp,
      nomeAssistente: instancia.nome_assistente,
      tomVoz: instancia.tom_voz,
    },
    catalogo,
    historico,
    dossie,
    vezDoCliente: [],
    // A instrução muda por tipo e tentativa (roadmap item 6): retomada com
    // gancho concreto do dossiê, cutucada de uma linha na segunda, e o
    // lembrete de visita fala só da visita. Testada em followupTexto.
    instrucaoExtra: instrucaoDoFollowup({
      tipo: item.tipo,
      tentativa: item.tentativa,
      dossie,
      visitaFormatada,
      // `ultimaCliente` já foi buscada acima para a revalidação de resposta:
      // ausência dela significa que o cliente nunca falou — o caso do
      // disparo de campanha que ninguém respondeu.
      clienteNuncaFalou: !ultimaCliente,
    }),
  });

  const resposta = turno.resposta;
  if (resposta.meta.fallback) return descartar(supabase, item.id, "ia_indisponivel");

  // Follow-up é UM balão, sempre: quem não respondeu à última mensagem não
  // precisa receber três.
  const balao = turno.baloes[0] ?? resposta.textoResposta;

  const envio = await enviarMensagemWhatsapp({
    instanceName: instancia.instance_name,
    telefone: conversa.telefone_cliente,
    texto: balao,
  });
  await registrarResultadoEnvio(instancia.id, envio.enviado);

  if (!envio.enviado) {
    return descartar(supabase, item.id, `erro_envio:${envio.motivo ?? "desconhecido"}`);
  }

  // Mesmo uuid na mensagem e na telemetria (0040): follow-up também é
  // resposta avaliável no Live Chat.
  const interacaoId = crypto.randomUUID();
  // Sem o vínculo no insert: a FK para `ia_interacoes` exige que a linha de
  // telemetria já exista, e ela é escrita logo abaixo. Ver gravarMensagem.
  // Mesmo comprovante do disparo de campanha: sem o id do provedor, o ACK
  // de entrega do webhook (0051) não tem por onde casar, e o follow-up
  // ficaria para sempre sem confirmação de ✓✓.
  const mensagemDoBot = await gravarMensagem({
    // Mensagem que NÓS iniciamos: é atendimento por definição.
    conversaLiberada: true,
    conversaId: conversa.id,
    remetente: "bot",
    conteudo: balao,
    providerMessageId: envio.messageId ?? null,
    statusEntrega: envio.messageId ? "enviada" : null,
  });

  /*
   * Mesmo motivo do disparador: falamos por iniciativa nossa, então a
   * conversa é atendimento. Sem isto, o cliente responde ao follow-up e o
   * bot fica mudo porque a isenção da trava olhava só como a conversa
   * nasceu.
   */
  await marcarConversaComoAtendimento(conversa.id);
  await supabase
    .from("whatsapp_followups")
    .update({ status: "enviado", enviado_em: new Date().toISOString() })
    .eq("id", item.id);

  // Follow-up é iniciativa nossa: conta como tentativa de contato (0060).
  // É justamente aqui que o contador fica interessante — follow-up é o
  // segundo e o terceiro toque em quem não respondeu ao primeiro.
  await registrarTentativaDeContato(conversa.lead_id);

  await registrarInteracao({
    id: interacaoId,
    conversaId: conversa.id,
    corretorId: instancia.corretor_id,
    origem: "followup",
    promptVersao: PROMPT_VERSAO,
    latenciaMs: resposta.meta.latenciaMs,
    acao: "respondida",
    anexosEnviados: 0,
    anexosBloqueados: turno.bloqueios,
  });

  await vincularInteracaoNaMensagem(mensagemDoBot.id, interacaoId);

  return "enviado";
}
