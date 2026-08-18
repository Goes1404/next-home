import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEmpreendimentos } from "@/lib/queries";
import { gerarRespostaIA } from "@/lib/whatsapp/aiAgent";
import { extrairDossieCliente } from "@/lib/whatsapp/dossierExtractor";
import { transcreverAudioWhatsapp } from "@/lib/whatsapp/audioTranscriber";
import { notificarCorretorLeadQuente } from "@/lib/whatsapp/brokerNotifier";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import {
  botDeveResponder,
  gravarMensagem,
  historicoRecente,
  obterOuCriarConversa,
  pausarBotPorAtendimentoHumano,
  registrarResultadoEnvio,
  resolverInstancia,
  salvarDossie,
  type InstanciaResolvida,
} from "@/lib/whatsapp/repositorio";

export const runtime = "nodejs";

/** Comparação em tempo constante — evita descobrir o segredo por medição. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * O POST aciona duas chamadas pagas ao Gemini e pode disparar mensagem no
 * WhatsApp do corretor — não pode ficar aberto na internet.
 *
 * Falha fechada: sem segredo configurado, recusa em produção. Em
 * desenvolvimento (servidor local) deixa passar para permitir testar o
 * fluxo, avisando no log.
 */
function requisicaoAutenticada(req: NextRequest, instancia: InstanciaResolvida | null): boolean {
  const enviado =
    req.headers.get("x-webhook-secret") ||
    req.headers.get("apikey") ||
    new URL(req.url).searchParams.get("token") ||
    "";

  const segredoGlobal = process.env.WHATSAPP_WEBHOOK_SECRET;
  const segredoDaInstancia = instancia?.webhookSecret || null;

  if (!segredoGlobal && !segredoDaInstancia) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "Webhook do WhatsApp recusado: WHATSAPP_WEBHOOK_SECRET não configurado em produção.",
      );
      return false;
    }
    console.warn("Webhook do WhatsApp sem segredo configurado — liberado apenas por ser ambiente de desenvolvimento.");
    return true;
  }

  if (!enviado) return false;
  if (segredoDaInstancia && segredoConfere(enviado, segredoDaInstancia)) return true;
  if (segredoGlobal && segredoConfere(enviado, segredoGlobal)) return true;
  return false;
}

/** GET: desafio de verificação que a Meta manda ao salvar a Callback URL. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token && segredoConfere(token, verifyToken)) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ status: "online", service: "NextHome WhatsApp Webhook Gateway" });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Normalização de payload para suportar Evolution API, Z-API e Meta Cloud API
    const instanceName = payload.instance || payload.instanceName || "";
    const sender = payload.data?.key?.remoteJid?.replace(/\D/g, "") || payload.sender || payload.from || "";
    const fromMe = Boolean(payload.data?.key?.fromMe || payload.fromMe);
    const audioUrlOrBase64 =
      payload.data?.message?.audioMessage?.url ||
      payload.audioBase64 ||
      payload.audioUrl ||
      "";

    let text =
      payload.data?.message?.conversation ||
      payload.data?.message?.extendedTextMessage?.text ||
      payload.text ||
      payload.message?.text ||
      "";

    // De quem é este número? É o que decide o dono da conversa, o tom do
    // agente e para quem vai o alerta — sem isso não há multi-corretor.
    const instancia = await resolverInstancia(instanceName);

    if (!requisicaoAutenticada(req, instancia)) {
      return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
    }

    if (!instancia) {
      return NextResponse.json(
        { ok: false, error: `Instância "${instanceName}" não cadastrada.` },
        { status: 404 },
      );
    }

    const ehAudio = Boolean(!text && audioUrlOrBase64);
    if (ehAudio) {
      const resultadoAudio = await transcreverAudioWhatsapp(audioUrlOrBase64);
      text = resultadoAudio.textoTranscrito;
    }

    if (!sender || !text) {
      return NextResponse.json({ ok: true, ignored: "Mensagem vazia ou sem remetente" });
    }

    const conversa = await obterOuCriarConversa({
      corretorId: instancia.corretorId,
      telefoneCliente: sender,
      nomeCliente: payload.senderName || null,
    });

    if (!conversa) {
      return NextResponse.json({ ok: false, error: "Falha ao registrar a conversa." }, { status: 500 });
    }

    // O corretor respondeu do celular dele: registra a fala e silencia a IA
    // nesta conversa — gravado no banco, não só devolvido no JSON.
    if (fromMe) {
      await gravarMensagem({
        conversaId: conversa.id,
        remetente: "corretor",
        conteudo: text,
        tipo: ehAudio ? "audio" : "texto",
      });
      await pausarBotPorAtendimentoHumano(conversa.id);

      return NextResponse.json({ ok: true, action: "pausa_bot_humano_registrada", sender });
    }

    await gravarMensagem({
      conversaId: conversa.id,
      remetente: "cliente",
      conteudo: text,
      tipo: ehAudio ? "audio" : "texto",
      midiaUrl: ehAudio ? audioUrlOrBase64 : null,
    });

    if (!botDeveResponder(conversa) || instancia.modoBot === "desativado") {
      return NextResponse.json({ ok: true, action: "bot_pausado_nesta_conversa", sender });
    }

    // Catálogo real para RAG (com fallback resiliente)
    let catalogo: Awaited<ReturnType<typeof getEmpreendimentos>> = [];
    try {
      catalogo = await getEmpreendimentos();
    } catch (err) {
      console.warn("Aviso: Falha ao carregar catálogo para o webhook (usando fallback):", err);
    }

    const respostaIA = await gerarRespostaIA(
      {
        nomeCorretor: instancia.nomeCorretor,
        creciCorretor: instancia.creciCorretor,
        telefoneCorretor: instancia.whatsappCorretor,
        nomeAssistente: instancia.nomeAssistente,
        tomVoz: instancia.tomVoz,
        catalogo,
        historicoMensagens: await historicoRecente(conversa.id),
      },
      text,
    );

    // Anexos entram como links no corpo: o envio de mídia binária depende de
    // outra rota do provedor, e um link clicável já entrega o material.
    const linhasAnexos = (respostaIA.anexosMidia || [])
      .filter((a) => a?.url)
      .map((a) => `📎 ${a.titulo || a.tipo}: ${a.url}`);
    const textoParaEnviar = [respostaIA.textoResposta, ...linhasAnexos].join("\n\n");

    // Responder quem nos escreveu não passa por cota nem por janela de
    // horário (ver antiBan.ts): a conversa foi iniciada pelo cliente, e
    // deixá-lo no vácuo é pior para o número do que responder de
    // madrugada. O resultado alimenta o disjuntor de falhas seguidas.
    const envio = await enviarMensagemWhatsapp({
      instanceName: instancia.instanceName,
      telefone: sender,
      texto: textoParaEnviar,
    });
    await registrarResultadoEnvio(instancia.id, envio.enviado);

    await gravarMensagem({
      conversaId: conversa.id,
      remetente: "bot",
      conteudo: textoParaEnviar,
    });

    const dossie = await extrairDossieCliente(text, conversa.leadId ?? sender);
    if (conversa.leadId) {
      await salvarDossie(conversa.leadId, dossie);
    }

    let alerta: { enviado: boolean; motivo?: string } = { enviado: false };
    if (dossie.temperaturaScore >= 75 || respostaIA.sugerirVisita || respostaIA.transferirHumano) {
      const resultadoAlerta = await notificarCorretorLeadQuente({
        instanceName: instancia.instanceName,
        telefoneCorretor: instancia.whatsappCorretor,
        nomeCorretor: instancia.nomeCorretor,
        nomeCliente: payload.senderName || "Cliente WhatsApp",
        telefoneCliente: sender,
        empreendimentoNome: respostaIA.empreendimentoCitado,
        temperaturaScore: dossie.temperaturaScore,
        resumoDossie: dossie.resumoExecutivo,
        motivoAlerta: respostaIA.sugerirVisita
          ? "visita_solicitada"
          : respostaIA.transferirHumano
          ? "transferencia_humana"
          : "lead_quente_score_alto",
      });
      alerta = { enviado: resultadoAlerta.enviado, motivo: resultadoAlerta.motivo };
    }

    return NextResponse.json({
      ok: true,
      sender,
      instance: instancia.instanceName,
      corretor: instancia.nomeCorretor,
      resposta: respostaIA.textoResposta,
      respostaEntregue: envio.enviado,
      respostaMotivoFalha: envio.motivo,
      transferirHumano: respostaIA.transferirHumano,
      anexosMidia: respostaIA.anexosMidia || [],
      dossieResumo: dossie.resumoExecutivo,
      dossiePersistido: Boolean(conversa.leadId),
      score: dossie.temperaturaScore,
      temperatura: dossie.temperaturaLabel,
      alertaCorretor: alerta,
    });
  } catch (error) {
    console.error("Erro ao processar webhook do WhatsApp:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
