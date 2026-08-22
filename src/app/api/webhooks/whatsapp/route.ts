import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEmpreendimentos } from "@/lib/queries";
import { gerarRespostaIA, PROMPT_VERSAO } from "@/lib/whatsapp/aiAgent";
import { ranquearCatalogo } from "@/lib/whatsapp/catalogoRelevante";
import { sanearRespostaIA } from "@/lib/whatsapp/guardrails";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";
import { buscarExemplosFewShot } from "@/lib/whatsapp/aprendizadoContinuo";
import { dividirEmMensagens } from "@/lib/whatsapp/chunking";
import { extrairDossieCliente, resumirMudancasDossie } from "@/lib/whatsapp/dossierExtractor";
import { transcreverAudioWhatsapp } from "@/lib/whatsapp/audioTranscriber";
import { notificarAtualizacaoCorretor, notificarCorretorLeadQuente } from "@/lib/whatsapp/brokerNotifier";
import { enviarMensagemWhatsapp, enviarMidiaWhatsapp, enviarPresencaDigitando } from "@/lib/whatsapp/provider";
import {
  agendarFollowup,
  agendarVisitaLead,
  botDeveResponder,
  buscarDossieAtual,
  cancelarFollowupsPendentes,
  gravarMensagem,
  historicoRecente,
  liberarConversaPorPalavraChave,
  marcarRespostaCampanha,
  obterOuCriarConversa,
  podeAlertarLeadQuente,
  registrarEventoConexao,
  pausarBotPorAtendimentoHumano,
  registrarResultadoEnvio,
  resolverInstancia,
  salvarDossie,
  ultimaFalaDoCorretor,
  destravarDisparo,
  travarDisparo,
  ultimaMensagemClienteId,
  validarDataVisita,
  type InstanciaResolvida,
} from "@/lib/whatsapp/repositorio";
import { contemPalavraChave, decidirPorModo } from "@/lib/whatsapp/modoBot";

export const runtime = "nodejs";
// O buffer de rajada espera ~6s antes de responder, e o ciclo completo
// (2 chamadas de IA + envio em balões com pausas humanizadas) não cabe nos
// 10s padrão do plano Hobby.
export const maxDuration = 60;

/** Janela do buffer de rajada: quem digita em vários balões ganha UMA resposta. */
const ESPERA_RAJADA_MS = 6000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    // Id da mensagem no provedor — a chave da deduplicação (0027). Todo
    // provedor reentrega webhooks; sem esta chave, cada retry virava
    // resposta duplicada no WhatsApp do cliente.
    const providerMessageId: string | null = payload.data?.key?.id || payload.messageId || null;
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

    /*
     * Imagem e documento eram descartados em silêncio ("mensagem vazia") —
     * o cliente mandava a foto do imóvel dele ou um comprovante e NINGUÉM
     * ficava sabendo, nem a IA nem o corretor. Sem OCR/visão por enquanto:
     * a mensagem vira uma anotação textual que dá contexto à IA e fica
     * registrada na conversa.
     */
    const imagemMsg = payload.data?.message?.imageMessage;
    const documentoMsg = payload.data?.message?.documentMessage;
    let tipoMidiaRecebida: "imagem" | "documento" | null = null;
    if (!text && imagemMsg) {
      tipoMidiaRecebida = "imagem";
      text = `[cliente enviou uma imagem${imagemMsg.caption ? `: "${imagemMsg.caption}"` : ""}]`;
    } else if (!text && documentoMsg) {
      tipoMidiaRecebida = "documento";
      text = `[cliente enviou um documento${documentoMsg.fileName ? `: "${documentoMsg.fileName}"` : ""}]`;
    }

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
      // A intenção resumida era calculada e jogada fora; como anotação ela
      // ajuda a IA quando a transcrição sai truncada ou ambígua.
      if (resultadoAudio.intencaoResumida) {
        text = `${text}\n[intenção detectada no áudio: ${resultadoAudio.intencaoResumida}]`;
      }
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

    const gravacao = await gravarMensagem({
      conversaId: conversa.id,
      remetente: "cliente",
      conteudo: text,
      tipo: ehAudio ? "audio" : (tipoMidiaRecebida ?? "texto"),
      midiaUrl: ehAudio ? audioUrlOrBase64 : null,
      providerMessageId,
    });

    // Reentrega do provedor: a mensagem já foi processada; responder de
    // novo é mandar a mesma resposta duas vezes para o cliente.
    if (!gravacao.inedita) {
      return NextResponse.json({ ok: true, ignored: "reentrega", sender });
    }

    // O cliente respondeu: todo follow-up proativo pendente desta conversa
    // perde o motivo de existir (ver whatsapp_followups, 0028).
    await cancelarFollowupsPendentes(conversa.id);

    // Fecha o loop do disparador: se este telefone recebeu uma campanha e
    // respondeu, é isso que faz o contador de "Respostas" da campanha
    // deixar de ser sempre zero. Só vale a consulta em conversa de campanha
    // — em conversa orgânica não existe item de fila para achar.
    if (conversa.origem === "campanha") {
      await marcarRespostaCampanha(sender);
    }

    if (!botDeveResponder(conversa)) {
      // Silêncio também é dado: sem registrar, "o bot respondeu pouco" e
      // "o bot está quebrado" são indistinguíveis no painel.
      await registrarInteracao({
        conversaId: conversa.id,
        corretorId: instancia.corretorId,
        origem: "webhook",
        promptVersao: PROMPT_VERSAO,
        acao: "pausada_por_humano",
      });
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
      await registrarInteracao({
        conversaId: conversa.id,
        corretorId: instancia.corretorId,
        origem: "webhook",
        promptVersao: PROMPT_VERSAO,
        acao: "silenciada_por_modo",
      });
      return NextResponse.json({ ok: true, action: "bot_silenciado_por_modo", motivo: decisao.motivo, modo: instancia.modoBot, sender });
    }

    /*
     * Buffer de rajada. Cliente que escreve em vários balões seguidos
     * ("oi" / "tudo bem?" / "queria saber do apartamento") disparava um
     * ciclo COMPLETO por balão: várias chamadas de IA concorrentes e várias
     * respostas atropeladas no WhatsApp. A espera deixa a rajada terminar;
     * depois dela, só a invocação cujo balão continua sendo o MAIS RECENTE
     * da conversa responde — pelas outras, respondeu quem viu o quadro
     * completo. A trava (0024) fecha a corrida de quem empatou no relógio.
     */
    await dormir(ESPERA_RAJADA_MS);

    if (providerMessageId) {
      const maisRecente = await ultimaMensagemClienteId(conversa.id);
      if (maisRecente && maisRecente !== providerMessageId) {
        await registrarInteracao({
          conversaId: conversa.id,
          corretorId: instancia.corretorId,
          origem: "webhook",
          promptVersao: PROMPT_VERSAO,
          acao: "absorvida_por_debounce",
        });
        return NextResponse.json({ ok: true, action: "absorvida_por_debounce", sender });
      }
    }

    const escopoResposta = `resposta:${conversa.id}`;
    const donoResposta = providerMessageId ?? `sem-id-${Date.now()}`;
    if (!(await travarDisparo(escopoResposta, donoResposta, 55))) {
      await registrarInteracao({
        conversaId: conversa.id,
        corretorId: instancia.corretorId,
        origem: "webhook",
        promptVersao: PROMPT_VERSAO,
        acao: "absorvida_por_debounce",
      });
      return NextResponse.json({ ok: true, action: "outra_invocacao_respondendo", sender });
    }
    try {

    // Catálogo real para RAG e exemplos de conversas que converteram (ver
    // aprendizadoContinuo.ts) — buscados em paralelo, e os dois com
    // fallback resiliente: nenhum dos dois pode derrubar a resposta ao
    // cliente por estar indisponível.
    // O dossiê ANTERIOR entra no prompt (a IA deixa de re-perguntar o que
    // já qualificou) e serve de base de comparação para a nota incremental
    // ao corretor. O NOVO é extraído depois da resposta, da conversa toda.
    const [catalogo, exemplosFewShot, historico, dossieAnterior] = await Promise.all([
      getEmpreendimentos().catch((err) => {
        console.warn("Aviso: Falha ao carregar catálogo para o webhook (usando fallback):", err);
        return [] as Awaited<ReturnType<typeof getEmpreendimentos>>;
      }),
      buscarExemplosFewShot(instancia.corretorId),
      historicoRecente(conversa.id),
      conversa.leadId ? buscarDossieAtual(conversa.leadId) : Promise.resolve(null),
    ]);

    // Os 10 empreendimentos MAIS RELEVANTES para esta conversa — não os 10
    // primeiros do banco (que deixavam o resto do catálogo invisível).
    const catalogoRanqueado = ranquearCatalogo({
      catalogo,
      mensagemAtual: text,
      historico,
      dossie: dossieAnterior,
    });

    const respostaBruta = await gerarRespostaIA(
      {
        nomeCorretor: instancia.nomeCorretor,
        creciCorretor: instancia.creciCorretor,
        telefoneCorretor: instancia.whatsappCorretor,
        nomeAssistente: instancia.nomeAssistente,
        tomVoz: instancia.tomVoz,
        catalogo: catalogoRanqueado,
        historicoMensagens: historico,
        exemplosFewShot,
        dossie: dossieAnterior,
      },
      text,
    );

    // Trilho do padrão "trilho + IA": nenhum anexo ou recomendação sai sem
    // existir no catálogo — instrução no prompt não é garantia.
    const saneada = sanearRespostaIA(respostaBruta, catalogo);
    const respostaIA = saneada.resposta;

    // O buffer pode ter segurado a resposta por vários segundos; se o
    // cliente mandou mais um balão nesse meio-tempo, quem responde é a
    // invocação dele — esta descarta o texto gerado e sai de fininho.
    if (providerMessageId) {
      const maisRecenteAposIA = await ultimaMensagemClienteId(conversa.id);
      if (maisRecenteAposIA && maisRecenteAposIA !== providerMessageId) {
        await registrarInteracao({
          conversaId: conversa.id,
          corretorId: instancia.corretorId,
          origem: "webhook",
          promptVersao: PROMPT_VERSAO,
          latenciaMs: respostaIA.meta.latenciaMs,
          acao: "absorvida_por_debounce",
        });
        return NextResponse.json({ ok: true, action: "absorvida_por_debounce_pos_ia", sender });
      }
    }

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

    /*
     * O dossiê novo é extraído da CONVERSA INTEIRA, não só da última
     * mensagem — a versão anterior passava só `text`, e "3 quartos" dito
     * há dez mensagens sumia do dossiê a cada nova extração. O
     * `dossieAnterior` (buscado antes da resposta) segue sendo a base da
     * comparação para a nota incremental ao corretor.
     */
    const transcricao = [...historico, { remetente: "cliente" as const, texto: text }]
      .map((m) => `${m.remetente === "cliente" ? "Cliente" : m.remetente === "corretor" ? "Corretor" : "Assistente"}: ${m.texto}`)
      .join("\n");
    const dossie = await extrairDossieCliente(transcricao, conversa.leadId ?? sender);
    if (conversa.leadId) {
      await salvarDossie(conversa.leadId, dossie);
    }

    /*
     * Visita confirmada pela IA vira compromisso REAL: data no lead e etapa
     * do funil — a ação de maior valor do bot (é a métrica que importa:
     * lead → visita). Validação estrita antes de gravar; data inválida
     * degrada para o alerta comum de "visita solicitada", nunca grava lixo.
     */
    let visitaConfirmada = false;
    if (respostaIA.visitaProposta?.confirmadaPeloCliente && conversa.leadId) {
      const dataVisita = validarDataVisita(respostaIA.visitaProposta.dataHoraISO);
      if (dataVisita) {
        visitaConfirmada = await agendarVisitaLead(conversa.leadId, dataVisita);
      }
    }

    /*
     * Lead que promete (morno para cima) e conversa que o BOT respondeu:
     * agenda reengajamento para o caso de o cliente sumir — quem responde
     * cancela (ver início do POST). Fora isso, nenhum lead morre por
     * silêncio nosso.
     */
    if (envio.enviado && dossie.temperaturaScore >= 40) {
      await agendarFollowup(conversa.id, instancia.id);
    }

    // Duas classes de aviso ao corretor, nunca as duas juntas na mesma
    // mensagem: o alerta grande pede ação imediata (lead quente, visita,
    // pedido de humano); a nota pequena é só "a conversa andou, aqui está o
    // que mudou" — o feedback contínuo do atendimento em curso.
    //
    // O alerta por score alto passa por debounce (1 por conversa a cada
    // 6h): score >= 75 persiste por várias mensagens seguidas, e um alerta
    // por mensagem ensina o corretor a ignorar o alerta. Evento novo
    // (visita, transferência) fura o debounce — é acionável na hora.
    let alerta: { enviado: boolean; motivo?: string } = { enviado: false };
    const eventoNovo = visitaConfirmada || respostaIA.sugerirVisita || respostaIA.transferirHumano;
    const deveAlertar =
      eventoNovo || (dossie.temperaturaScore >= 75 && (await podeAlertarLeadQuente(conversa.id)));

    if (deveAlertar) {
      const resultadoAlerta = await notificarCorretorLeadQuente({
        instanceName: instancia.instanceName,
        telefoneCorretor: instancia.whatsappCorretor,
        nomeCorretor: instancia.nomeCorretor,
        nomeCliente: payload.senderName || "Cliente WhatsApp",
        telefoneCliente: sender,
        empreendimentoNome: respostaIA.empreendimentoCitado,
        temperaturaScore: dossie.temperaturaScore,
        resumoDossie: visitaConfirmada
          ? `Visita confirmada para ${new Date(respostaIA.visitaProposta!.dataHoraISO).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. ${dossie.resumoExecutivo}`
          : dossie.resumoExecutivo,
        motivoAlerta: visitaConfirmada
          ? "visita_confirmada"
          : respostaIA.sugerirVisita
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

    // A linha de telemetria desta interação — é dela que saem latência,
    // taxa de fallback, anexos bloqueados pelos guardrails e a
    // rastreabilidade por versão de prompt (ver ia_interacoes, 0029).
    await registrarInteracao({
      conversaId: conversa.id,
      corretorId: instancia.corretorId,
      origem: "webhook",
      promptVersao: PROMPT_VERSAO,
      latenciaMs: respostaIA.meta.latenciaMs,
      fallback: respostaIA.meta.fallback,
      acao: visitaConfirmada ? "visita_confirmada" : envio.enviado ? "respondida" : "erro_envio",
      sugeriuVisita: respostaIA.sugerirVisita,
      transferiuHumano: respostaIA.transferirHumano,
      anexosEnviados: anexos.length,
      anexosBloqueados: saneada.anexosBloqueados + saneada.slugsBloqueados,
      temperaturaScore: dossie.temperaturaScore,
      tokensEntrada: respostaIA.meta.tokensEntrada,
      tokensSaida: respostaIA.meta.tokensSaida,
    });

    return NextResponse.json({
      ok: true,
      sender,
      instance: instancia.instanceName,
      corretor: instancia.nomeCorretor,
      resposta: respostaIA.textoResposta,
      respostaEntregue: envio.enviado,
      respostaMotivoFalha: envio.motivo,
      transferirHumano: respostaIA.transferirHumano,
      visitaConfirmada,
      anexosMidia: respostaIA.anexosMidia || [],
      dossieResumo: dossie.resumoExecutivo,
      dossiePersistido: Boolean(conversa.leadId),
      score: dossie.temperaturaScore,
      temperatura: dossie.temperaturaLabel,
      alertaCorretor: alerta,
    });
    } finally {
      // A trava de resposta SEMPRE volta — mesmo com erro no meio do envio.
      await destravarDisparo(escopoResposta, donoResposta);
    }
  } catch (error) {
    console.error("Erro ao processar webhook do WhatsApp:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
