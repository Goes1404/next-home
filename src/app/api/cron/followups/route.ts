import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEmpreendimentos } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/service";
import { gerarRespostaIA, PROMPT_VERSAO } from "@/lib/whatsapp/aiAgent";
import { dentroDaJanela } from "@/lib/whatsapp/antiBan";
import { ranquearCatalogo } from "@/lib/whatsapp/catalogoRelevante";
import { dividirEmMensagens } from "@/lib/whatsapp/chunking";
import { sanearRespostaIA } from "@/lib/whatsapp/guardrails";
import { decidirPorModo } from "@/lib/whatsapp/modoBot";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import {
  buscarDossieAtual,
  gravarMensagem,
  historicoRecente,
  registrarResultadoEnvio,
  reservarCotaCampanha,
  travarDisparo,
  destravarDisparo,
  ultimaFalaDoCorretor,
} from "@/lib/whatsapp/repositorio";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";

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
};

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
    const { data: vencidos } = await supabase
      .from("whatsapp_followups")
      .select("id, conversa_id, instancia_id, tentativa, agendado_para")
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
    .select("nome, creci, whatsapp")
    .eq("id", instancia.corretor_id)
    .single();
  if (!corretor) return descartar(supabase, item.id, "corretor_inexistente");

  // Gera o texto de reengajamento com o MESMO agente e guardrails da
  // conversa normal — só muda o cenário via instrução extra.
  const [catalogo, historico, dossie] = await Promise.all([
    getEmpreendimentos().catch(() => []),
    historicoRecente(conversa.id, 12),
    conversa.lead_id ? buscarDossieAtual(conversa.lead_id) : Promise.resolve(null),
  ]);

  const resposta = await gerarRespostaIA(
    {
      nomeCorretor: corretor.nome,
      creciCorretor: corretor.creci,
      telefoneCorretor: corretor.whatsapp,
      nomeAssistente: instancia.nome_assistente,
      tomVoz: instancia.tom_voz,
      catalogo: ranquearCatalogo({ catalogo, mensagemAtual: "", historico, dossie }),
      historicoMensagens: historico,
      dossie,
      instrucaoExtra:
        "Este é um FOLLOW-UP: o cliente parou de responder. Retome a conversa em 1-2 frases curtas a partir do último assunto, com leveza — um lembrete gentil ou uma informação nova que agregue, NUNCA cobrança ou pressão. Não repita a última mensagem enviada.",
    },
    "(o cliente não respondeu; escreva a mensagem de retomada)",
  );

  if (resposta.meta.fallback) return descartar(supabase, item.id, "ia_indisponivel");

  const saneada = sanearRespostaIA(resposta, catalogo);
  const balao = dividirEmMensagens(saneada.resposta.textoResposta)[0] ?? saneada.resposta.textoResposta;

  const envio = await enviarMensagemWhatsapp({
    instanceName: instancia.instance_name,
    telefone: conversa.telefone_cliente,
    texto: balao,
  });
  await registrarResultadoEnvio(instancia.id, envio.enviado);

  if (!envio.enviado) {
    return descartar(supabase, item.id, `erro_envio:${envio.motivo ?? "desconhecido"}`);
  }

  await gravarMensagem({ conversaId: conversa.id, remetente: "bot", conteudo: balao });
  await supabase
    .from("whatsapp_followups")
    .update({ status: "enviado", enviado_em: new Date().toISOString() })
    .eq("id", item.id);

  await registrarInteracao({
    conversaId: conversa.id,
    corretorId: instancia.corretor_id,
    origem: "followup",
    promptVersao: PROMPT_VERSAO,
    latenciaMs: resposta.meta.latenciaMs,
    acao: "respondida",
    anexosEnviados: 0,
    anexosBloqueados: saneada.anexosBloqueados + saneada.slugsBloqueados,
  });

  return "enviado";
}
