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
} from "@/lib/whatsapp/repositorio";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";
import { formatarVisitaSP, instrucaoDoFollowup } from "@/lib/whatsapp/followupTexto";

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

export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const resultado = { processados: 0, enviados: 0, descartados: 0 };

  // Fora do horário comercial nada sai — e nada é descartado: o item
  // espera a próxima janela, que é o comportamento que o cliente espera
  // de uma mensagem "casual" de vendedora.
  if (!dentroDaJanela(new Date())) {
    return NextResponse.json({ ok: true, ...resultado, motivo: "fora_da_janela" });
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

    return NextResponse.json({ ok: true, ...resultado });
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
    conversaId: conversa.id,
    remetente: "bot",
    conteudo: balao,
    providerMessageId: envio.messageId ?? null,
    statusEntrega: envio.messageId ? "enviada" : null,
  });
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
