import { ehContaSoWhatsapp } from "@/lib/whatsapp/contaSoWhatsapp";
import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getEmpreendimentos } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/service";
import { PROMPT_VERSAO } from "@/lib/whatsapp/aiAgent";
import { dentroDaJanela, dentroDaJanelaDoCorretor } from "@/lib/whatsapp/antiBan";
import { executarTurnoDeAtendimento } from "@/lib/whatsapp/turnoDeAtendimento";
import { lerCasaDoGrupo } from "@/lib/whatsapp/casaDoGrupo";
import {
  decidirSeAIaResponde,
  podeEnviarPorIniciativa,
  silencioDaConversa,
} from "@/lib/whatsapp/quandoAIaResponde";
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
  contarFalasNaoGravadas,
  marcarConversaAtendida,
  lerConversaPersistida,
  situacaoDaConversa,
  haAudioTranscrevendo,
} from "@/lib/whatsapp/repositorio";
import { MARCADOR_ENCALHADO_MS } from "@/lib/whatsapp/transcricaoNoGrupo";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { lerCotaDaIa } from "@/lib/planos/usoDaIa";
import { montarContextoDaInteracao } from "@/lib/whatsapp/contextoDaInteracao";
import { formatarVisitaSP, instrucaoDoFollowup } from "@/lib/whatsapp/followupTexto";
import { processarLembretesDeAnotacao } from "@/lib/crm/lembretesDeAnotacao";
import { processarLembretesDeTarefa } from "@/lib/crm/lembretesDeTarefa";
import { cobrarVisitas } from "@/lib/agenda/confirmacao";
import { pedirConfirmacoesAutomaticas } from "@/lib/agenda/confirmacaoAutomatica";
import { enviarResumosDoDia } from "@/lib/crm/enviarResumoDoDia";
import { enviarRelatoriosDasAvaliacoes } from "@/lib/crm/enviarRelatorioDasAvaliacoes";
import { alertarLeadsSemContato } from "@/lib/crm/alertaSemContato";
import { alertarClientesSemResposta } from "@/lib/crm/alertaSemResposta";
import { avisarLeadsNovos } from "@/lib/notificacoes/leadNovo";
import { avisarLeadsQueCombinam } from "@/lib/notificacoes/leadsQueCombinam";
import { lembrarVisitasDaProximaHora } from "@/lib/notificacoes/lembreteDeVisita";
import { avisarLeadsParados } from "@/lib/notificacoes/leadParado";
import { recalcularNotasPendentes } from "@/lib/crm/notaDoLeadServidor";
import { avisarSenhasVencendo } from "@/lib/notificacoes/senhaVencendo";
import { avisarCobrancasDoDia, avisarRiscosDoDia } from "@/lib/notificacoes/avisosDaPlataforma";
import { enviarLeadsDistribuidosParaGrupos } from "@/lib/crm/enviosDeLeadParaGrupo";
import { enviarListasSemRetorno } from "@/lib/crm/leadsSemRetorno";
import { liberarReservasVencidas } from "@/lib/imoveis/reservasVencidas";
import { entregarVideosPeloCentral } from "@/lib/video/entregaPeloCentral";
import { avisarQuemPediuAlerta } from "@/lib/crm/avisoDeNovidade";
import { lerCaixasDoGmail } from "@/lib/inbound/gmailCaixa";
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
  tipo: "reengajamento" | "lembrete_visita" | "pos_visita" | "indicacao";
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
    .select("id, corretor_id, visita_agendada_em, visita_marcada_em")
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

    /*
     * Só conta lembrete criado DEPOIS da última marcação: visita remarcada
     * (A2) ganha lembrete novo mesmo que o da data velha já tenha saído.
     */
    const desde = Math.max(
      agora - 7 * 86_400_000,
      lead.visita_marcada_em ? new Date(lead.visita_marcada_em).getTime() : 0,
    );
    const { data: jaTem } = await supabase
      .from("whatsapp_followups")
      .select("id")
      .eq("conversa_id", conversa.id)
      .eq("tipo", "lembrete_visita")
      .in("status", ["pendente", "enviado"])
      .gte("created_at", new Date(desde).toISOString())
      .limit(1)
      .maybeSingle();
    if (jaTem) continue;

    /*
     * O pedido de confirmação desta visita já saiu (0246): ele É o lembrete
     * (revisão de 30/10/2026). O pedido também grava um `lembrete_visita`
     * enviado, mas DEPOIS do envio e sem desfazer nada se falhar — sem esta
     * conferência, a linha perdida fazia a IA mandar o lembrete por cima, e
     * o cliente recebia as duas perguntas. O carimbo da visita é o claim do
     * pedido, gravado antes do envio: é a fonte segura.
     */
    const { data: confirmacaoPedida } = await supabase
      .from("visitas")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("inicio", lead.visita_agendada_em!)
      .not("confirmacao_pedida_em", "is", null)
      .limit(1)
      .maybeSingle();
    if (confirmacaoPedida) continue;

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
 * O pós-visita (26/09/2026): no dia seguinte à visita, uma pergunta — o
 * que ele achou. Até aqui, depois da visita não acontecia nada sozinho, e
 * é justamente o momento em que o cliente decide.
 *
 * Janela: visitas que aconteceram entre 12h e 72h atrás. O envio sai 18h
 * depois do horário marcado (a manhã seguinte, para visita de fim de
 * tarde); se o tique chegar depois disso, sai agora. Uma por conversa,
 * como o lembrete. Quem pediu para não ser procurado, ou já está em
 * `fechado`/`perdido`, não recebe.
 */
async function agendarPosVisita(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const agora = Date.now();
  const { data: visitas } = await supabase
    .from("leads")
    .select("id, corretor_id, visita_agendada_em, etapa, nao_contatar_em")
    .gte("visita_agendada_em", new Date(agora - 72 * 3600_000).toISOString())
    .lte("visita_agendada_em", new Date(agora - 12 * 3600_000).toISOString())
    .not("corretor_id", "is", null)
    .is("nao_contatar_em", null)
    .not("etapa", "in", "(fechado,perdido)")
    .limit(50);

  let agendados = 0;
  for (const lead of visitas ?? []) {
    const { data: conversa } = await supabase
      .from("whatsapp_conversas")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("corretor_id", lead.corretor_id!)
      .limit(1)
      .maybeSingle();
    if (!conversa) continue;

    const { data: jaTem } = await supabase
      .from("whatsapp_followups")
      .select("id")
      .eq("conversa_id", conversa.id)
      .eq("tipo", "pos_visita")
      .gte("created_at", new Date(agora - 7 * 86_400_000).toISOString())
      .limit(1)
      .maybeSingle();
    if (jaTem) continue;

    /*
     * O pedido de confirmação desta visita já saiu (0246): ele É o lembrete
     * (revisão de 30/10/2026). O pedido também grava um `lembrete_visita`
     * enviado, mas DEPOIS do envio e sem desfazer nada se falhar — sem esta
     * conferência, a linha perdida fazia a IA mandar o lembrete por cima, e
     * o cliente recebia as duas perguntas. O carimbo da visita é o claim do
     * pedido, gravado antes do envio: é a fonte segura.
     */
    const { data: confirmacaoPedida } = await supabase
      .from("visitas")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("inicio", lead.visita_agendada_em!)
      .not("confirmacao_pedida_em", "is", null)
      .limit(1)
      .maybeSingle();
    if (confirmacaoPedida) continue;

    const { data: instancia } = await supabase
      .from("corretor_whatsapp_instancias")
      .select("id")
      .eq("corretor_id", lead.corretor_id!)
      .maybeSingle();
    if (!instancia) continue;

    const quando = Math.max(agora, new Date(lead.visita_agendada_em!).getTime() + 18 * 3600_000);
    await supabase.from("whatsapp_followups").insert({
      conversa_id: conversa.id,
      instancia_id: instancia.id,
      tentativa: 1,
      tipo: "pos_visita",
      agendado_para: new Date(quando).toISOString(),
    });
    agendados++;
  }
  return agendados;
}

/** Quantos dias depois do fechamento sai o pedido de indicação. */
const DIAS_ATE_A_INDICACAO = 5;

/**
 * Pedido de indicação depois do fechamento (0123). Leads que viraram
 * `fechado` entre 5 e 30 dias atrás, uma vez por conversa na vida. Mora no
 * tique dos follow-ups e passa pela mesma cota anti-ban dos outros.
 */
async function agendarPedidoDeIndicacao(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const agora = Date.now();
  const { data: fechados } = await supabase
    .from("leads")
    .select("id, corretor_id")
    .eq("etapa", "fechado")
    .is("nao_contatar_em", null)
    .not("corretor_id", "is", null)
    .lte("etapa_alterada_em", new Date(agora - DIAS_ATE_A_INDICACAO * 86_400_000).toISOString())
    .gte("etapa_alterada_em", new Date(agora - 30 * 86_400_000).toISOString())
    .limit(50);

  let agendados = 0;
  for (const lead of fechados ?? []) {
    const { data: conversa } = await supabase
      .from("whatsapp_conversas")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("corretor_id", lead.corretor_id!)
      .limit(1)
      .maybeSingle();
    if (!conversa) continue;

    const { data: jaTem } = await supabase
      .from("whatsapp_followups")
      .select("id")
      .eq("conversa_id", conversa.id)
      .eq("tipo", "indicacao")
      .limit(1)
      .maybeSingle();
    if (jaTem) continue;

    const { data: instancia } = await supabase
      .from("corretor_whatsapp_instancias")
      .select("id")
      .eq("corretor_id", lead.corretor_id!)
      .maybeSingle();
    if (!instancia) continue;

    await supabase.from("whatsapp_followups").insert({
      conversa_id: conversa.id,
      instancia_id: instancia.id,
      tentativa: 1,
      tipo: "indicacao",
      agendado_para: new Date(agora).toISOString(),
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
   * conversa com lead. O que ela não sabe é se a IA pode falar agora —
   * isso é `decidirSeAIaResponde`, abaixo.
   */
  const { data: esperando } = await supabase
    .from("whatsapp_esperando_resposta")
    .select("conversa_id, corretor_id, lead_id, telefone_cliente, esperando_desde")
    .order("esperando_desde", { ascending: true })
    .limit(20);

  const ordenadas = esperando ?? [];

  for (const linha of ordenadas) {
    if (saldo.respondidas >= MAX_RESPOSTAS_ATRASADAS) break;
    if (Date.now() - comecou > ORCAMENTO_VARREDURA_MS) break;
    if (!linha.conversa_id || !linha.corretor_id || !linha.esperando_desde) continue;

    const decisao = decidirRespostaAtrasada({ esperandoDesde: linha.esperando_desde });
    if (!decisao.responder) {
      saldo.puladas++;
      continue;
    }

    /*
     * A MESMA trava de resposta do webhook e da palavra-chave
     * (`resposta:<conversa>`): sem ela, o cliente que escreve enquanto a
     * varredura responde receberia duas respostas.
     */
    const escopo = `resposta:${linha.conversa_id}`;
    const dono = `atrasada-${linha.conversa_id}-${Date.now()}`;
    if (!(await travarDisparo(escopo, dono, 55))) {
      saldo.puladas++;
      continue;
    }
    let desfecho: "respondida" | "pulada";
    try {
      desfecho = await responderAtrasada(supabase, {
        conversaId: linha.conversa_id,
        corretorId: linha.corretor_id,
        horas: decisao.horas,
      });
    } finally {
      await destravarDisparo(escopo, dono);
    }
    if (desfecho === "respondida") saldo.respondidas++;
    else saldo.puladas++;
  }

  return saldo;
}

async function responderAtrasada(
  supabase: ReturnType<typeof createServiceClient>,
  params: { conversaId: string; corretorId: string; horas: number },
): Promise<"respondida" | "pulada"> {
  const conversa = await lerConversaPersistida(params.conversaId);
  if (!conversa) return "pulada";

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, corretor_id, grupo_id, instance_name, nome_assistente, tom_voz, regras_da_ia, modo_bot, conectado_em, bloqueado_ate, expediente_inicio, expediente_fim")
    .eq("corretor_id", params.corretorId)
    .maybeSingle();
  if (!instancia || !instancia.conectado_em) return "pulada";
  if (instancia.bloqueado_ate && new Date(instancia.bloqueado_ate) > new Date()) return "pulada";

  /*
   * A MESMA decisão que o webhook aplica (`quandoAIaResponde.ts`). É o que
   * garante que a varredura nunca fale onde o webhook calaria — se ela
   * tivesse régua própria, uma conversa pausada de propósito poderia ser
   * respondida por aqui, que é o pior desfecho possível: o bot por cima do
   * humano que está atendendo.
   */
  const decisao = decidirSeAIaResponde({
    conversa: situacaoDaConversa(conversa),
    numero: {
      modo: instancia.modo_bot as "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado",
      expediente: { inicioHora: instancia.expediente_inicio, fimHora: instancia.expediente_fim },
    },
    ultimaFalaCorretorEm:
      instancia.modo_bot === "co_piloto_3min" ? await ultimaFalaDoCorretor(conversa.id) : null,
    // A cota do grupo (fase 2B): esgotada, a varredura não responde — o
    // cliente espera o corretor, como no webhook.
    cotaEsgotada: (await lerCotaDaIa(instancia.grupo_id)).nivel === "esgotada",
    // A cobrança do grupo (fase 2C): suspenso, a varredura não responde — o
    // corretor atende à mão e o cliente não vê erro.
    grupoSuspenso: await grupoSuspenso(instancia.grupo_id),
  });
  if (!decisao.responde) return "pulada";

  const { data: corretor } = await supabase
    .from("corretores")
    .select("nome, creci, whatsapp, slug, grupo_id")
    .eq("id", instancia.corretor_id)
    .single();
  if (!corretor) return "pulada";
  // Conta só WhatsApp (0180): não há IA, seja qual for o modo gravado.
  if (await ehContaSoWhatsapp(supabase, instancia.corretor_id)) return "pulada";

  const [catalogo, historicoCompleto, dossie] = await Promise.all([
    // O catálogo do grupo do corretor da instância (L15).
    getEmpreendimentos(corretor.grupo_id).catch(() => []),
    historicoRecente(conversa.id),
    conversa.leadId ? buscarDossieAtual(conversa.leadId) : Promise.resolve(null),
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
  // aconteceria numa corrida com o webhook. Não inventar resposta. O áudio
  // ainda com o marcador de transcrição não é fala (`historicoRecente` o
  // tira): se ele é tudo o que o cliente mandou, a lista fica vazia e a
  // varredura não responde a um placeholder (revisão de 30/10/2026).
  if (pendentes.length === 0) return "pulada";
  // Áudio recente ainda transcrevendo: o webhook está cuidando dele e vai
  // responder com o texto; responder agora seria falar por cima.
  if (
    await haAudioTranscrevendo({
      conversaId: conversa.id,
      desde: new Date(Date.now() - MARCADOR_ENCALHADO_MS),
    })
  ) {
    return "pulada";
  }

  const turno = await executarTurnoDeAtendimento({
    quemPaga: { corretorId: instancia.corretor_id, grupoId: instancia.grupo_id },
    identidade: {
      nomeCorretor: corretor.nome,
      slugCorretor: corretor.slug ?? undefined,
      creciCorretor: corretor.creci,
      telefoneCorretor: corretor.whatsapp,
      nomeAssistente: instancia.nome_assistente,
      tomVoz: instancia.tom_voz,
      regrasDaIa: instancia.regras_da_ia,
      // Nome da casa, região e tom da IA do grupo (fase 4): o do catálogo.
      casa: await lerCasaDoGrupo(corretor.grupo_id),
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
      telefone: conversa.telefoneCliente,
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

  // O mesmo carimbo do webhook (0106): a IA falou, então a conversa é
  // atendimento — e continua sujeita ao retravamento.
  await marcarConversaAtendida(conversa.id);

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
    eTeste: conversa.eTeste,
    promptVersao: PROMPT_VERSAO,
    acao: "respondida",
    modelo: turno.resposta.meta.modelo,
    latenciaMs: turno.resposta.meta.latenciaMs,
    fallback: false,
    contexto: montarContextoDaInteracao({
      foco: turno.foco,
      jogada: turno.jogada,
      dossie,
      historico: turno.historicoAnterior,
      falasNaoGravadas: await contarFalasNaoGravadas(conversa.id),
      fewShot: turno.fewShot,
    }),
  });
  if (mensagemDoBot.id) await vincularInteracaoNaMensagem(mensagemDoBot.id, interacaoId);

  return "respondida";
}

export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const resultado = { processados: 0, enviados: 0, descartados: 0, sugeridos: 0 };

  /*
   * ANTES da janela de propósito. Isto é RESPOSTA a quem nos escreveu, não
   * disparo nosso — e a regra desta casa, escrita no webhook, é que
   * responder quem escreveu não passa por cota nem por horário comercial.
   * Pôr a varredura depois do `return` abaixo a faria calar das 21h às 9h
   * justamente para quem já esperou a noite inteira.
   */
  const atrasadas = await varrerRespostasAtrasadas(supabase);

  // Caixas do Gmail conectadas (0125): e-mail de portal vira lead. Antes da
  // janela — é entrada de lead, não contato com cliente. Uma caixa e até
  // quatro e-mails por tique: cada um custa uma extração de IA.
  const leadsDoGmail = await lerCaixasDoGmail(1, 4).catch((e) => {
    console.error("[gmail]", e);
    return 0;
  });

  /*
   * O resumo do dia vai para o PRÓPRIO corretor, não para cliente: não
   * passa pela janela comercial nem pela cota (mesma regra dos lembretes
   * das anotações). Às 8h a janela ainda está fechada; por isso aqui.
   */
  const resumos = await enviarResumosDoDia(supabase).catch((e) => {
    console.error("[resumo do dia]", e);
    return 0;
  });

  /*
   * O relatório semanal das avaliações da IA (29/09/2026): segunda de
   * manhã, para o próprio corretor, com os 👎 agrupados por motivo. Mesma
   * regra do resumo do dia: não passa pela janela comercial nem pela cota.
   */
  const relatoriosDasAvaliacoes = await enviarRelatoriosDasAvaliacoes(supabase).catch((e) => {
    console.error("[relatório das avaliações]", e);
    return 0;
  });

  /*
   * Também antes da janela, pelo mesmo motivo: o aviso de lead pago sem
   * contato vai para o CORRETOR (0121), e lead de portal que chega às 22h
   * não pode esperar até as 9h para alguém saber dele. E reserva vencida
   * volta a disponível a qualquer hora.
   */
  const semContato = await alertarLeadsSemContato(supabase).catch((e) => {
    console.error("[lead sem contato]", e);
    return 0;
  });
  /*
   * Cliente sem resposta há 30 min (0161): aviso no WhatsApp do corretor.
   * Antes da janela comercial: é aviso ao corretor, não contato com cliente,
   * e tem horário próprio (7h às 21h59).
   */
  /*
   * Lead novo (0203): notificação no celular do dono, a qualquer hora. O
   * webhook do WhatsApp já avisa na hora; aqui entra quem chegou pelo site,
   * pelo formulário do anúncio ou por portal.
   */
  const leadsNovos = await avisarLeadsNovos(supabase).catch((e) => {
    console.error("[lead novo]", e);
    return 0;
  });
  /*
   * Mais notificações no celular (0236, 29/10/2026), todas para o PRÓPRIO
   * corretor, por isso antes da janela comercial do cliente. Cada uma tem o
   * próprio horário: o lembrete de visita sai a qualquer hora (1h antes da
   * hora que ele marcou); lead parado só das 8h às 19h59, de hora em hora;
   * senha vencendo só às 9h. Sem a 0236 aplicada, as três não enviam nada.
   */
  const lembretesDeVisita = await lembrarVisitasDaProximaHora(supabase).catch((e) => {
    console.error("[lembrete de visita]", e);
    return 0;
  });
  const leadsParados = await avisarLeadsParados(supabase).catch((e) => {
    console.error("[lead parado]", e);
    return 0;
  });
  /*
   * Imóvel publicado ou atualizado → "N leads seus combinam" no celular de
   * cada corretor (29/10/2026, 0245). Só notificação ao corretor, a
   * qualquer hora; a trava de repetição é a da 0245.
   */
  const avisosDeMatch = await avisarLeadsQueCombinam(supabase).catch((e) => {
    console.error("[match]", e);
    return 0;
  });
  const senhasVencendo = await avisarSenhasVencendo(supabase).catch((e) => {
    console.error("[senha vencendo]", e);
    return 0;
  });
  /*
   * DEPOIS da resposta (revisão de 30/10/2026): a nota do lead e os avisos
   * diários da plataforma não falam com cliente nem com corretor, e rodavam
   * em série ANTES da janela e da trava — 100 UPDATEs da nota, o laço de
   * cobrança por grupo e o de risco comiam o tempo do tique (`maxDuration`
   * 60 s) que é dos follow-ups. Em `after` eles não seguram o resto.
   *
   * - A nota do lead (0248): refaz as vencidas (6 h) de até `NOTAS_POR_TIQUE`
   *   leads. É o que faz o lead que sumiu ESFRIAR sem evento nenhum. Sem IA
   *   (só a régua de `notaDoLead.ts`), nada sai para ninguém.
   * - Resumo das mensalidades e contas em risco (0239), para quem administra
   *   a plataforma: no primeiro tique a partir das 9h, uma vez por dia (a
   *   reivindicação mora em `avisosDaPlataforma.ts`).
   */
  after(async () => {
    await recalcularNotasPendentes(createServiceClient()).catch((e) => {
      console.error("[nota do lead]", e);
    });
    await avisarCobrancasDoDia().catch((e) => {
      console.error("[cobranças do dia]", e);
    });
    await avisarRiscosDoDia().catch((e) => {
      console.error("[riscos do dia]", e);
    });
  });
  // Distribuição em grupo é um aviso operacional, não campanha: deve sair
  // mesmo fora da janela comercial, assim que a roleta definiu o dono.
  const gruposDeLeads = await enviarLeadsDistribuidosParaGrupos(supabase).catch((e) => {
    console.error("[grupos de leads]", e);
    return 0;
  });
  // Lista das 18h ao gestor: leads avisados no grupo sem retorno de ligação.
  const listasSemRetorno = await enviarListasSemRetorno(supabase).catch((e) => {
    console.error("[sem retorno]", e);
    return 0;
  });
  const semResposta = await alertarClientesSemResposta(supabase).catch((e) => {
    console.error("[cliente sem resposta]", e);
    return 0;
  });
  const reservasLiberadas = await liberarReservasVencidas(supabase).catch(() => 0);
  /*
   * O vídeo pedido pelo número central volta por ele quando o worker conclui
   * (onda 3). O worker roda no GitHub Actions, sem as chaves da Evolution:
   * quem entrega é este tique. Com a onda desligada não lê nada.
   */
  const videosPeloCentral = await entregarVideosPeloCentral(supabase).catch((e) => {
    console.error("[vídeo pelo central]", e);
    return 0;
  });

  /*
   * Lembretes do corretor: os das anotações (0100) e os das tarefas da ficha
   * do lead (0178). Vão para o WhatsApp do PRÓPRIO corretor, na hora que ELE
   * marcou — por isso antes da janela comercial e fora da cota anti-ban.
   * Atrás da janela, um lembrete das 8h só sairia às 9h. Com o número
   * central ligado (onda 2, spec 4.7), o da anotação sai pelo central.
   */
  await processarLembretesDeAnotacao(supabase).catch((e) => {
    console.error("[lembrete de anotação]", e);
  });
  const lembretesDeTarefa = await processarLembretesDeTarefa(supabase).catch((e) => {
    console.error("[lembrete de tarefa]", e);
    return 0;
  });
  // "A visita aconteceu?" (Agenda, 0227): aviso ao CORRETOR, na janela dele
  // (7h–21h59), por isso antes da janela comercial do cliente.
  const visitasCobradas = await cobrarVisitas(supabase).catch((e) => {
    console.error("[visita aconteceu]", e);
    return 0;
  });

  // Fora do horário comercial nada sai — e nada é descartado: o item
  // espera a próxima janela, que é o comportamento que o cliente espera
  // de uma mensagem "casual" de vendedora.
  if (!dentroDaJanela(new Date())) {
    return NextResponse.json({ ok: true, ...resultado, atrasadas, resumos, relatoriosDasAvaliacoes, semContato, semResposta, leadsNovos, lembretesDeVisita, leadsParados, senhasVencendo, avisosDeMatch, gruposDeLeads, listasSemRetorno, reservasLiberadas, videosPeloCentral, lembretesDeTarefa, visitasCobradas, leadsDoGmail, motivo: "fora_da_janela" });
  }

  const dono = `followups-${crypto.randomUUID()}`;
  if (!(await travarDisparo("followups", dono, 110))) {
    return NextResponse.json({ ok: true, ...resultado, motivo: "outro_tique_rodando" });
  }

  try {
    await agendarLembretesDeVisita(supabase);
    await agendarPosVisita(supabase);
    await agendarPedidoDeIndicacao(supabase);
    /*
     * Confirmação automática de visita (0246, 29/10/2026), só nos grupos que
     * ligaram a opção. Antes da fila: o pedido sai e cancela o lembrete de
     * véspera pendente da mesma conversa, e o cliente não recebe os dois.
     * Mesmas travas do lembrete (janela, expediente, IA desligada, cota).
     */
    const confirmacoesPedidas = await pedirConfirmacoesAutomaticas(supabase).catch((e) => {
      console.error("[confirmação automática de visita]", e);
      return 0;
    });
    /*
     * O primeiro contato automático com lead de portal SAIU em 03/10/2026
     * (plano de ativação, regra N1): a IA só responde. O lead de portal
     * aparece nas listas sugeridas e o corretor decide quando mandar.
     *
     * "Me avise quando surgir" fica: quem recebe PEDIU pelo site para ser
     * avisado, então é resposta a um pedido do cliente, não iniciativa nossa.
     * Um por tique: cada aviso custa ~20s de IA.
     */
    const avisosDeNovidade = await avisarQuemPediuAlerta(1).catch((e) => {
      console.error("[aviso de novidade]", e);
      return 0;
    });

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
      else if (desfecho === "sugerido") resultado.sugeridos++;
    }

    return NextResponse.json({ ok: true, ...resultado, atrasadas, resumos, relatoriosDasAvaliacoes, semContato, semResposta, leadsNovos, lembretesDeVisita, leadsParados, senhasVencendo, avisosDeMatch, reservasLiberadas, videosPeloCentral, lembretesDeTarefa, visitasCobradas, avisosDeNovidade, leadsDoGmail, confirmacoesPedidas });
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
): Promise<"enviado" | "descartado" | "pulado" | "sugerido"> {
  /*
   * Plano de ativação, 03/10/2026 (regra N7). Reengajamento automático saiu:
   * item antigo que sobrou é descartado. Pós-visita e indicação não saem
   * mais sozinhos: o texto é gerado e vira SUGESTÃO para o corretor enviar
   * da fila do Início. Só o lembrete de visita continua sendo enviado.
   */
  if (item.tipo === "reengajamento") return descartar(supabase, item.id, "reengajamento_desligado");
  const ehSugestao = item.tipo === "pos_visita" || item.tipo === "indicacao";

  /*
   * Revalidação 1: a camada da CONVERSA de `quandoAIaResponde.ts` — a mesma
   * que decide se a IA responde. Lead de outro corretor, pedido para não ser
   * contatado (nao_contatar_em, 0110), IA desligada e corretor falando agora
   * barram o follow-up.
   *
   * `registrarRecusaDoCliente` já cancela os follow-ups pendentes no
   * instante da recusa; isto cobre a corrida e o item antigo.
   *
   * DESCARTA, não pula: nenhum desses motivos vira "pode" no próximo tique
   * de um jeito que torne o follow-up oportuno, e um item pulado ficaria na
   * fila para sempre tentando. Para a SUGESTÃO, quem envia é o corretor: a
   * IA desligada nesta conversa não a impede.
   */
  const conversa = await lerConversaPersistida(item.conversa_id);
  if (!conversa) return descartar(supabase, item.id, "bot_inativo");

  const silencio = silencioDaConversa(situacaoDaConversa(conversa));
  if (silencio && !(ehSugestao && silencio.motivo === "ia_desligada_na_conversa")) {
    const motivo =
      silencio.motivo === "lead_pediu_para_sair"
        ? "cliente_recusou"
        : silencio.motivo === "lead_de_outro_corretor"
          ? "lead_de_outro_corretor"
          : "bot_inativo";
    return descartar(supabase, item.id, motivo);
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
    .select("id, corretor_id, grupo_id, instance_name, nome_assistente, tom_voz, regras_da_ia, modo_bot, conectado_em, bloqueado_ate, expediente_inicio, expediente_fim")
    .eq("id", item.instancia_id)
    .maybeSingle();

  if (!instancia || !instancia.conectado_em) return descartar(supabase, item.id, "instancia_desconectada");
  if (instancia.bloqueado_ate && new Date(instancia.bloqueado_ate) > new Date()) {
    return descartar(supabase, item.id, "numero_bloqueado");
  }

  // Grupo suspenso por cobrança (fase 2C): não gasta IA nem manda mensagem.
  // PULA, e não descarta: a fila volta sozinha quando o pagamento for
  // registrado.
  if (await grupoSuspenso(instancia.grupo_id)) return "pulado";

  if (!ehSugestao) {
    /*
     * O lembrete de visita é envio NOSSO: sai dentro do expediente do
     * corretor (e da janela segura, 0148) e respeita só "IA desligada no
     * número". O modo "fora do expediente" é sobre quem RESPONDE — aplicado
     * aqui, ele barrava todo lembrete de quem usa esse modo, porque o
     * lembrete só sai DENTRO do expediente (`podeEnviarPorIniciativa`).
     */
    const numero = {
      modo: instancia.modo_bot as "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado",
      expediente: { inicioHora: instancia.expediente_inicio, fimHora: instancia.expediente_fim },
    };
    if (!dentroDaJanelaDoCorretor(new Date(), numero.expediente)) return "pulado";
    const pode = podeEnviarPorIniciativa({ conversa: situacaoDaConversa(conversa), numero });
    if (!pode.responde) return descartar(supabase, item.id, "modo_nao_permite");

    const cota = await reservarCotaCampanha(instancia.id, new Date(instancia.conectado_em));
    /*
     * Espaçamento anti-ban (0062) NÃO é motivo para descartar: a vez chega em
     * segundos e o tique seguinte pega o item. Descartar aqui apagaria um
     * follow-up legítimo porque uma campanha mandou mensagem 40 segundos
     * antes — e follow-up descartado não volta.
     */
    if (!cota.permitido && cota.motivo === "aguardando_intervalo") return "pulado";
    if (!cota.permitido) return descartar(supabase, item.id, "cota_esgotada");
  }

  const { data: corretor } = await supabase
    .from("corretores")
    .select("nome, creci, whatsapp, slug, grupo_id")
    .eq("id", instancia.corretor_id)
    .single();
  if (!corretor) return descartar(supabase, item.id, "corretor_inexistente");

  // Lembrete de visita é revalidado contra a AGENDA na hora do envio: a
  // visita pode ter sido desmarcada ou movida desde o agendamento, e
  // lembrar de uma visita que não existe é pior que não lembrar.
  let visitaFormatada: string | undefined;
  let enderecoDoImovel: string | null = null;
  let nomeDoImovel: string | null = null;
  if (item.tipo === "pos_visita") {
    // Revalidado contra a agenda: se a visita foi REMARCADA para o futuro,
    // perguntar "o que achou?" seria perguntar de uma visita que não houve.
    const { data: lead } = conversa.leadId
      ? await supabase
          .from("leads")
          .select(
            "visita_agendada_em, etapa, empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome)",
          )
          .eq("id", conversa.leadId)
          .maybeSingle()
      : { data: null };
    const visita = lead?.visita_agendada_em;
    if (!visita || new Date(visita).getTime() > Date.now() - 6 * 3600_000) {
      return descartar(supabase, item.id, "visita_remarcada_ou_ausente");
    }
    if (lead?.etapa === "fechado" || lead?.etapa === "perdido") {
      return descartar(supabase, item.id, "lead_encerrado");
    }
    visitaFormatada = formatarVisitaSP(visita);
    const imovel = Array.isArray(lead?.empreendimento)
      ? lead.empreendimento[0]
      : lead?.empreendimento;
    nomeDoImovel = imovel?.nome ?? null;
  }

  if (item.tipo === "indicacao") {
    // Revalidado: quem voltou atrás no fechamento ou pediu para não ser
    // procurado não recebe pedido de indicação.
    const { data: lead } = conversa.leadId
      ? await supabase
          .from("leads")
          .select("etapa, nao_contatar_em, empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome)")
          .eq("id", conversa.leadId)
          .maybeSingle()
      : { data: null };
    if (!lead || lead.etapa !== "fechado" || lead.nao_contatar_em) {
      return descartar(supabase, item.id, "lead_fora_do_pos_venda");
    }
    const imovel = Array.isArray(lead.empreendimento) ? lead.empreendimento[0] : lead.empreendimento;
    nomeDoImovel = imovel?.nome ?? null;
  }

  if (item.tipo === "lembrete_visita") {
    /*
     * O endereço vem daqui, do CADASTRO, e viaja até a instrução — a IA
     * nunca o escreve de cabeça. O lembrete de véspera é o pior lugar
     * possível para endereço inventado: o cliente lê à noite, sai de casa e
     * vai para onde a mensagem mandou. Mesma razão do link da página.
     */
    const { data: lead } = conversa.leadId
      ? await supabase
          .from("leads")
          .select(
            "visita_agendada_em, empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome, endereco)",
          )
          .eq("id", conversa.leadId)
          .maybeSingle()
      : { data: null };
    const visita = lead?.visita_agendada_em;
    if (!visita || new Date(visita).getTime() < Date.now() + 3600_000) {
      return descartar(supabase, item.id, "visita_desmarcada_ou_passou");
    }
    visitaFormatada = formatarVisitaSP(visita);
    // O join do PostgREST vem como objeto ou array conforme a cardinalidade.
    const imovel = Array.isArray(lead?.empreendimento)
      ? lead.empreendimento[0]
      : lead?.empreendimento;
    enderecoDoImovel = imovel?.endereco ?? null;
    nomeDoImovel = imovel?.nome ?? null;
  }

  // Gera o texto de reengajamento com o MESMO agente e guardrails da
  // conversa normal — só muda o cenário via instrução extra.
  const [catalogo, historico, dossie] = await Promise.all([
    // O catálogo do grupo do corretor da instância (L15).
    getEmpreendimentos(corretor.grupo_id).catch(() => []),
    historicoRecente(conversa.id),
    conversa.leadId ? buscarDossieAtual(conversa.leadId) : Promise.resolve(null),
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
    quemPaga: { corretorId: instancia.corretor_id, grupoId: instancia.grupo_id },
    identidade: {
      nomeCorretor: corretor.nome,
      slugCorretor: corretor.slug ?? undefined,
      creciCorretor: corretor.creci,
      telefoneCorretor: corretor.whatsapp,
      nomeAssistente: instancia.nome_assistente,
      tomVoz: instancia.tom_voz,
      regrasDaIa: instancia.regras_da_ia,
      // Nome da casa, região e tom da IA do grupo (fase 4): o do catálogo.
      casa: await lerCasaDoGrupo(corretor.grupo_id),
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
      enderecoDoImovel,
      nomeDoImovel,
    }),
  });

  const resposta = turno.resposta;
  if (resposta.meta.fallback) return descartar(supabase, item.id, "ia_indisponivel");

  // Follow-up é UM balão, sempre: quem não respondeu à última mensagem não
  // precisa receber três.
  const balao = turno.baloes[0] ?? resposta.textoResposta;

  if (ehSugestao) {
    await supabase
      .from("whatsapp_followups")
      .update({ status: "sugerido", texto_sugerido: balao, sugerido_em: new Date().toISOString() })
      .eq("id", item.id);
    return "sugerido";
  }

  const envio = await enviarMensagemWhatsapp({
    instanceName: instancia.instance_name,
    telefone: conversa.telefoneCliente,
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

  // O FATO da 0106: a IA atendeu esta conversa.
  await marcarConversaAtendida(conversa.id);
  await supabase
    .from("whatsapp_followups")
    .update({ status: "enviado", enviado_em: new Date().toISOString() })
    .eq("id", item.id);

  // Follow-up é iniciativa nossa: conta como tentativa de contato (0060).
  // É justamente aqui que o contador fica interessante — follow-up é o
  // segundo e o terceiro toque em quem não respondeu ao primeiro.
  await registrarTentativaDeContato(conversa.leadId);

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
    contexto: montarContextoDaInteracao({
      foco: turno.foco,
      jogada: turno.jogada,
      dossie,
      historico: turno.historicoAnterior,
      falasNaoGravadas: await contarFalasNaoGravadas(conversa.id),
      fewShot: turno.fewShot,
    }),
  });

  await vincularInteracaoNaMensagem(mensagemDoBot.id, interacaoId);

  return "enviado";
}
