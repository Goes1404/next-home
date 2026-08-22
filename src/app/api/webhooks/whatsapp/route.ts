import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEmpreendimentos } from "@/lib/queries";
import { gerarRespostaIA } from "@/lib/whatsapp/aiAgent";
import { buscarExemplosFewShot } from "@/lib/whatsapp/aprendizadoContinuo";
import { dividirEmMensagens } from "@/lib/whatsapp/chunking";
import { extrairDossieCliente, resumirMudancasDossie } from "@/lib/whatsapp/dossierExtractor";
import { transcreverAudioWhatsapp } from "@/lib/whatsapp/audioTranscriber";
import { notificarAtualizacaoCorretor, notificarCorretorLeadQuente } from "@/lib/whatsapp/brokerNotifier";
import { enviarMensagemWhatsapp, enviarMidiaWhatsapp, enviarPresencaDigitando } from "@/lib/whatsapp/provider";
import {
  botDeveResponder,
  buscarDossieAtual,
  gravarMensagem,
  historicoRecente,
  liberarConversaPorPalavraChave,
  marcarRespostaCampanha,
  obterOuCriarConversa,
  registrarEventoConexao,
  pausarBotPorAtendimentoHumano,
  registrarResultadoEnvio,
  resolverInstancia,
  salvarDossie,
  ultimaFalaDoCorretor,
  type InstanciaResolvida,
} from "@/lib/whatsapp/repositorio";
import { contemPalavraChave, decidirPorModo } from "@/lib/whatsapp/modoBot";

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

    /*
     * O JID bruto precisa ser lido ANTES de virar só dígitos: é o sufixo que
     * distingue pessoa (`@s.whatsapp.net`) de grupo (`@g.us`), lista de
     * transmissão e o "status@broadcast". Ao tirar os símbolos, um grupo
     * vira um número de 18 dígitos e passa por cliente — foi o que
     * aconteceu: há conversas gravadas com "telefone" 120363401120401903,
     * que é id de grupo. A IA respondendo dentro de um grupo é o pior lugar
     * possível para ela errar.
     */
    const jidBruto: string = payload.data?.key?.remoteJid || payload.remoteJid || "";
    if (/@(g\.us|broadcast)$/i.test(jidBruto) || jidBruto === "status@broadcast") {
      return NextResponse.json({ ok: true, ignored: "Mensagem de grupo ou transmissão" });
    }

    const sender = jidBruto.replace(/\D/g, "") || payload.sender || payload.from || "";
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

    /*
     * `connection.update` é o evento que conta quando o corretor termina de
     * ler o QR Code. Ignorá-lo custou caro: `conectado_em` ficava nulo para
     * sempre, e como a curva de aquecimento anti-ban parte dessa coluna,
     * TODA campanha era recusada com "número ainda não foi pareado" — a
     * fila inteira parada em 'pendente', sem nenhum erro visível no painel.
     *
     * Chega sem `remoteJid` e sem texto, então precisa ser tratado antes de
     * cair na checagem de "mensagem vazia" logo abaixo.
     */
    const evento = String(payload.event || payload.type || "").toLowerCase().replace(/_/g, ".");
    const estadoConexao: string = payload.data?.state || payload.state || "";

    if (evento === "connection.update" || (!text && !sender && estadoConexao)) {
      await registrarEventoConexao({
        instanceName,
        estado: estadoConexao,
        telefone: (payload.data?.wuid || payload.data?.owner || "").replace(/\D/g, "") || null,
      });
      return NextResponse.json({ ok: true, action: "conexao_atualizada", estado: estadoConexao });
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
      palavraChaveConfigurada: instancia.palavraChaveAtivacao,
    });

    if (!conversa) {
      return NextResponse.json({ ok: false, error: "Falha ao registrar a conversa." }, { status: 500 });
    }

    // O corretor respondeu do celular dele: registra a fala. Duas leituras
    // possíveis para o que vem a seguir — e são mutuamente exclusivas:
    //
    //   1. A mensagem contém a palavra-chave cadastrada: é o sinal
    //      combinado de "pode assumir" (ver modoBot.ts). Libera a conversa
    //      e NÃO pausa — esta mensagem específica não é "estou atendendo
    //      pessoalmente", é a entrega deliberada para a IA.
    //   2. Qualquer outra mensagem do corretor: continua pausando a IA por
    //      24h nesta conversa, como sempre — ele está atendendo por conta
    //      própria e a IA não pode responder por cima.
    if (fromMe) {
      await gravarMensagem({
        conversaId: conversa.id,
        remetente: "corretor",
        conteudo: text,
        tipo: ehAudio ? "audio" : "texto",
      });

      if (contemPalavraChave(text, instancia.palavraChaveAtivacao)) {
        await liberarConversaPorPalavraChave(conversa.id);
        return NextResponse.json({ ok: true, action: "bot_ativado_por_palavra_chave", sender });
      }

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

    // Fecha o loop do disparador: se este telefone recebeu uma campanha e
    // respondeu, é isso que faz o contador de "Respostas" da campanha
    // deixar de ser sempre zero. Só vale a consulta em conversa de campanha
    // — em conversa orgânica não existe item de fila para achar.
    if (conversa.origem === "campanha") {
      await marcarRespostaCampanha(sender);
    }

    if (!botDeveResponder(conversa)) {
      return NextResponse.json({ ok: true, action: "bot_pausado_nesta_conversa", sender });
    }

    /*
     * O modo escolhido pelo corretor decide aqui — antes só `desativado` era
     * lido, e "noturno e fim de semana" e "co-piloto" não faziam nada. O
     * co-piloto precisa saber quando o humano falou pela última vez, e isso
     * é uma consulta: só é feita no modo que usa.
     */
    const decisao = decidirPorModo(instancia.modoBot, {
      ultimaFalaCorretorEm:
        instancia.modoBot === "co_piloto_3min" ? await ultimaFalaDoCorretor(conversa.id) : null,
    });

    if (!decisao.pode) {
      return NextResponse.json({ ok: true, action: "bot_silenciado_por_modo", motivo: decisao.motivo, modo: instancia.modoBot, sender });
    }

    // Catálogo real para RAG e exemplos de conversas que converteram (ver
    // aprendizadoContinuo.ts) — buscados em paralelo, e os dois com
    // fallback resiliente: nenhum dos dois pode derrubar a resposta ao
    // cliente por estar indisponível.
    const [catalogo, exemplosFewShot] = await Promise.all([
      getEmpreendimentos().catch((err) => {
        console.warn("Aviso: Falha ao carregar catálogo para o webhook (usando fallback):", err);
        return [] as Awaited<ReturnType<typeof getEmpreendimentos>>;
      }),
      buscarExemplosFewShot(instancia.corretorId),
    ]);

    const respostaIA = await gerarRespostaIA(
      {
        nomeCorretor: instancia.nomeCorretor,
        creciCorretor: instancia.creciCorretor,
        telefoneCorretor: instancia.whatsappCorretor,
        nomeAssistente: instancia.nomeAssistente,
        tomVoz: instancia.tomVoz,
        catalogo,
        historicoMensagens: await historicoRecente(conversa.id),
        exemplosFewShot,
      },
      text,
    );

    const anexos = (respostaIA.anexosMidia || []).filter((a) => a?.url);

    // Quebra a resposta em balões (ver chunking.ts): longa vira duas
    // médias, média vira duas pequenas, pequena fica como está. Cada balão
    // depois do primeiro sai precedido de "digitando..." e um intervalo
    // curto, para simular o ritmo de alguém escrevendo — não o despejo
    // instantâneo característico de robô.
    const partes = dividirEmMensagens(respostaIA.textoResposta);
    const baloes = partes.length > 0 ? partes : [respostaIA.textoResposta];

    let todosEnviados = true;
    let primeiroMotivo: string | undefined;
    let primeiroDetalhe: string | undefined;

    function registrarFalha(motivo?: string, detalhe?: string) {
      todosEnviados = false;
      primeiroMotivo ??= motivo;
      primeiroDetalhe ??= detalhe;
    }

    // Responder quem nos escreveu não passa por cota nem por janela de
    // horário (ver antiBan.ts): a conversa foi iniciada pelo cliente, e
    // deixá-lo no vácuo é pior para o número do que responder de
    // madrugada. O resultado alimenta o disjuntor de falhas seguidas.
    for (let i = 0; i < baloes.length; i++) {
      if (i > 0) {
        await enviarPresencaDigitando({ instanceName: instancia.instanceName, telefone: sender, duracaoMs: 1200 });
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.floor(Math.random() * 1000)));
      }

      const envioBalao = await enviarMensagemWhatsapp({
        instanceName: instancia.instanceName,
        telefone: sender,
        texto: baloes[i],
      });
      if (!envioBalao.enviado) registrarFalha(envioBalao.motivo, envioBalao.detalhe);
    }

    // Fotos, plantas, vídeos: mídia nativa do WhatsApp, não link no texto —
    // é o que o cliente espera ao pedir "manda uma foto".
    for (const anexo of anexos) {
      await enviarPresencaDigitando({ instanceName: instancia.instanceName, telefone: sender, duracaoMs: 1000 });
      await new Promise((resolve) => setTimeout(resolve, 800 + Math.floor(Math.random() * 700)));

      const envioMidia = await enviarMidiaWhatsapp({
        instanceName: instancia.instanceName,
        telefone: sender,
        tipo: anexo.tipo,
        url: anexo.url,
        legenda: anexo.titulo,
      });
      if (!envioMidia.enviado) registrarFalha(envioMidia.motivo, envioMidia.detalhe);
    }

    const envio = { enviado: todosEnviados, motivo: primeiroMotivo, detalhe: primeiroDetalhe };
    await registrarResultadoEnvio(instancia.id, envio.enviado);

    // Registro no CRM: o texto completo (não os balões separados) e os
    // anexos como nota de auditoria — mesmo enviados como mídia nativa, o
    // corretor precisa ver no Live Chat o que foi mandado.
    const linhasAnexos = anexos.map((a) => `📎 ${a.titulo || a.tipo}: ${a.url}`);
    const textoParaEnviar = [respostaIA.textoResposta, ...linhasAnexos].join("\n\n");

    await gravarMensagem({
      conversaId: conversa.id,
      remetente: "bot",
      conteudo: textoParaEnviar,
    });

    // Busca o dossiê ANTES de sobrescrever: é a única forma de saber o que
    // esta mensagem mudou de fato (ver resumirMudancasDossie), em vez de
    // só o retrato estático de agora.
    const dossieAnterior = conversa.leadId ? await buscarDossieAtual(conversa.leadId) : null;
    const dossie = await extrairDossieCliente(text, conversa.leadId ?? sender);
    if (conversa.leadId) {
      await salvarDossie(conversa.leadId, dossie);
    }

    // Duas classes de aviso ao corretor, nunca as duas juntas na mesma
    // mensagem: o alerta grande pede ação imediata (lead quente, visita,
    // pedido de humano); a nota pequena é só "a conversa andou, aqui está o
    // que mudou" — o feedback contínuo do atendimento em curso.
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
    } else {
      const mudancas = resumirMudancasDossie(dossieAnterior, dossie);
      if (mudancas) {
        const resultadoAtualizacao = await notificarAtualizacaoCorretor({
          instanceName: instancia.instanceName,
          telefoneCorretor: instancia.whatsappCorretor,
          nomeCliente: payload.senderName || "Cliente WhatsApp",
          telefoneCliente: sender,
          resumoMudancas: mudancas,
        });
        alerta = { enviado: resultadoAtualizacao.enviado, motivo: resultadoAtualizacao.motivo };
      }
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
