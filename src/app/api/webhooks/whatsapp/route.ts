import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEmpreendimentos } from "@/lib/queries";
import { gerarRespostaIA, PROMPT_VERSAO } from "@/lib/whatsapp/aiAgent";
import { catalogoParaAtendimento } from "@/lib/whatsapp/focoDaConversa";
import { separarRajada } from "@/lib/whatsapp/rajada";
import { sanearRespostaIA } from "@/lib/whatsapp/guardrails";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";
import { buscarExemplosFewShot } from "@/lib/whatsapp/aprendizadoContinuo";
import { dividirEmMensagens } from "@/lib/whatsapp/chunking";
import { extrairDossieCliente } from "@/lib/whatsapp/dossierExtractor";
import { detectarEvolucao, podeAvisarAgora } from "@/lib/whatsapp/evolucaoConversa";
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
  marcarConversaComoTeste,
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
  ultimoAvisoEvolucao,
  marcarAvisoEvolucao,
} from "@/lib/whatsapp/repositorio";
import { decidirPorFalaDoCorretor, decidirPorModo } from "@/lib/whatsapp/modoBot";
import { clientePediuLigacao } from "@/lib/whatsapp/pedidoDeLigacao";

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
 * O POST aciona duas chamadas pagas ao motor de IA e pode disparar mensagem no
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
    //   2. Qualquer outra mensagem do corretor: pausa a IA por 24h E
    //      RETRAVA a conversa, devolvendo-a ao estado de espera pela
    //      palavra-chave. A palavra-chave só liga; qualquer fala dele
    //      desliga. A regra mora em `decidirPorFalaDoCorretor`.
    if (fromMe) {
      await gravarMensagem({
        conversaId: conversa.id,
        remetente: "corretor",
        conteudo: text,
        tipo: ehAudio ? "audio" : "texto",
      });

      const decisao = decidirPorFalaDoCorretor({
        mensagem: text,
        palavraChaveConfigurada: instancia.palavraChaveAtivacao,
        palavraChaveTeste: instancia.palavraChaveTeste,
        origemConversa: conversa.origem,
      });

      if (decisao.acao === "ativar_ia") {
        await liberarConversaPorPalavraChave(conversa.id);
        /*
         * A palavra de TESTE liga a IA e tira a conversa do corpus. Sem
         * isto, o corretor testando pela linha de verdade voltaria a
         * envenenar o few-shot — o problema que a 0038 acabou de limpar.
         */
        if (decisao.marcarComoTeste) await marcarConversaComoTeste(conversa.id);
        return NextResponse.json({
          ok: true,
          action: decisao.marcarComoTeste
            ? "bot_ativado_em_modo_teste"
            : "bot_ativado_por_palavra_chave",
          sender,
        });
      }

      await pausarBotPorAtendimentoHumano(conversa.id, {
        retravarPalavraChave: decisao.retravarPalavraChave,
      });
      return NextResponse.json({
        ok: true,
        action: decisao.retravarPalavraChave
          ? "pausa_bot_humano_registrada_e_retravada"
          : "pausa_bot_humano_registrada",
        sender,
      });
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
        eTeste: conversa.eTeste,
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
        eTeste: conversa.eTeste,
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
        eTeste: conversa.eTeste,
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
        eTeste: conversa.eTeste,
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
    const [catalogo, historico, dossieAnterior] = await Promise.all([
      getEmpreendimentos().catch((err) => {
        console.warn("Aviso: Falha ao carregar catálogo para o webhook (usando fallback):", err);
        return [] as Awaited<ReturnType<typeof getEmpreendimentos>>;
      }),
      historicoRecente(conversa.id),
      conversa.leadId ? buscarDossieAtual(conversa.leadId) : Promise.resolve(null),
    ]);

    /*
     * A VEZ DO CLIENTE são todos os balões que ele mandou desde a última
     * resposta — não só o que acionou esta invocação.
     *
     * O buffer de rajada já agrupava as invocações; o que faltava era
     * agrupar o CONTEÚDO. Quem escreve "qual a metragem do de 3 dorm?" e
     * emenda "e tem vaga?" recebia resposta só da vaga: a primeira pergunta
     * virava mais uma linha de histórico, indistinguível de algo dito dez
     * minutos antes. `historico` já contém esses balões (foram gravados
     * antes desta consulta), então separar aqui não custa uma ida ao banco.
     */
    const { historico: historicoAnterior, pendentes } = separarRajada(historico);
    const vezDoCliente = pendentes.length > 0 ? pendentes : [text];
    // Foco, ranking e few-shot leem a vez inteira: o imóvel citado pode
    // estar no primeiro balão e a pergunta no último.
    const textoDaVez = vezDoCliente.join(" | ");

    /*
     * A recuperação dos exemplos vem DEPOIS porque agora depende do assunto
     * da conversa: ela casa o imóvel citado aqui com conversas anteriores
     * sobre o mesmo imóvel. Antes bastava o id do corretor, e o resultado
     * era "as 3 mais recentes que converteram" — recência sobre um corpus
     * que, na prática, tinha uma conversa elegível.
     */
    const exemplosFewShot = await buscarExemplosFewShot({
      corretorId: instancia.corretorId,
      mensagemAtual: textoDaVez,
      historico: historicoAnterior,
      catalogo,
      conversaAtualId: conversa.id,
    });

    /*
     * Os empreendimentos que a IA vai enxergar. Duas camadas:
     *
     * 1. RELEVÂNCIA — os 10 mais relevantes para esta conversa, não os 10
     *    primeiros do banco (que deixavam o resto do catálogo invisível).
     * 2. FOCO — se o cliente já escolheu um imóvel, a lista encolhe para
     *    ele mais duas reservas. Enquanto ela via as dez fichas em toda
     *    mensagem, respondia "manda a planta do Terra Alta" com uma lista
     *    de outros três; o que a IA não vê, ela não oferece.
     */
    const { catalogo: catalogoRanqueado, foco } = catalogoParaAtendimento({
      catalogo,
      mensagemAtual: textoDaVez,
      historico: historicoAnterior,
      dossie: dossieAnterior,
    });

    const respostaBruta = await gerarRespostaIA(
      {
        nomeCorretor: instancia.nomeCorretor,
        slugCorretor: instancia.slugCorretor ?? undefined,
        creciCorretor: instancia.creciCorretor,
        telefoneCorretor: instancia.whatsappCorretor,
        nomeAssistente: instancia.nomeAssistente,
        tomVoz: instancia.tomVoz,
        catalogo: catalogoRanqueado,
        historicoMensagens: historicoAnterior,
        exemplosFewShot,
        dossie: dossieAnterior,
        foco,
      },
      vezDoCliente,
    );

    // Trilho do padrão "trilho + IA": nenhum anexo ou recomendação sai sem
    // existir no catálogo — instrução no prompt não é garantia.
    const saneada = sanearRespostaIA(respostaBruta, catalogo, historico, instancia.slugCorretor);
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
        eTeste: conversa.eTeste,
          promptVersao: PROMPT_VERSAO,
          latenciaMs: respostaIA.meta.latenciaMs,
          acao: "absorvida_por_debounce",
        });
        return NextResponse.json({ ok: true, action: "absorvida_por_debounce_pos_ia", sender });
      }
    }

    // Já resolvidos contra o catálogo pelo guardrail: a IA pediu por slug
    // e tipo, e o código buscou as URLs reais (ver resolverMidia.ts).
    const anexos = saneada.anexos;

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
    // é o que o cliente espera ao pedir "manda uma foto". Sem legenda: o
    // `titulo` é o alt do site (texto de acessibilidade) e ia junto da
    // imagem para o cliente. Ele fica só na nota de auditoria do Live Chat,
    // logo abaixo, onde quem lê é o corretor.
    for (const anexo of anexos) {
      await enviarPresencaDigitando({ instanceName: instancia.instanceName, telefone: sender, duracaoMs: 1000 });
      await new Promise((resolve) => setTimeout(resolve, 800 + Math.floor(Math.random() * 700)));

      const envioMidia = await enviarMidiaWhatsapp({
        instanceName: instancia.instanceName,
        telefone: sender,
        tipo: anexo.tipo,
        url: anexo.url,
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

    /*
     * O id da interação nasce AQUI, antes dos dois inserts: o mesmo uuid
     * vai na mensagem (interacao_id, 0040) e na linha de telemetria. É o
     * vínculo que permite avaliar ESTA resposta no Live Chat — sem ele,
     * só a última resposta da conversa era avaliável, e a falha no meio
     * da conversa (o rótulo mais valioso do golden dataset) era
     * literalmente impossível de gravar.
     */
    const interacaoId = crypto.randomUUID();

    await gravarMensagem({
      conversaId: conversa.id,
      remetente: "bot",
      conteudo: textoParaEnviar,
      interacaoId,
    });

    /*
     * O dossiê novo é extraído da CONVERSA INTEIRA, não só da última
     * mensagem — a versão anterior passava só `text`, e "3 quartos" dito
     * há dez mensagens sumia do dossiê a cada nova extração. O
     * `dossieAnterior` (buscado antes da resposta) segue sendo a base da
     * comparação para a nota incremental ao corretor.
     *
     * Aqui vale `historico` e não `historicoAnterior`: ele já inclui os
     * balões desta rajada (foram gravados antes da consulta). Emendar
     * `text` no fim, como se fazia, duplicava a última fala do cliente na
     * transcrição — e fala repetida pesa mais na extração do que deveria.
     */
    const transcricao = historico
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
    /*
     * O corretor é avisado quando a CONVERSA EVOLUI, não a cada resposta.
     *
     * Antes, `sugerirVisita` contava como evento novo — e o prompt atual faz
     * a IA propor visita em quase toda mensagem, então o alerta completo
     * disparava sempre. Somado a isso, qualquer variação do dossiê
     * reextraído mandava uma segunda mensagem. Resultado: o WhatsApp do
     * corretor virava eco da conversa, e aviso que chega o tempo todo deixa
     * de ser lido.
     *
     * Agora só é ALERTA (o completo, com dossiê) o que exige ação imediata:
     * o cliente confirmou visita, ou a IA travou e precisa de humano. A
     * proposta de visita que a IA fez por conta própria não é notícia — o
     * cliente ainda não respondeu.
     */
    let alerta: { enviado: boolean; motivo?: string } = { enviado: false };
    /*
     * Pedido de ligação entra aqui em CÓDIGO, não por classificação do
     * modelo. "me liga" é dos sinais mais fortes de intenção que existem, e
     * no trace real que originou isto a IA respondeu "consigo te ligar sim"
     * sem marcar `transferirHumano` — ou seja, prometeu uma ligação que
     * ninguém ficou sabendo que precisava acontecer.
     */
    const pediuLigacao = vezDoCliente.some(clientePediuLigacao);
    const exigeAcaoAgora = visitaConfirmada || respostaIA.transferirHumano || pediuLigacao;
    const deveAlertar =
      exigeAcaoAgora ||
      (dossie.temperaturaScore >= 75 && (await podeAlertarLeadQuente(conversa.id)));

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
          : pediuLigacao
          ? "ligacao_solicitada"
          : respostaIA.sugerirVisita
          ? "visita_solicitada"
          : respostaIA.transferirHumano
          ? "transferencia_humana"
          : "lead_quente_score_alto",
      });
      alerta = { enviado: resultadoAlerta.enviado, motivo: resultadoAlerta.motivo };
    } else {
      /*
       * Aviso curto de evolução — só o que um corretor consideraria
       * notícia: o cliente esquentou de faixa, apareceu orçamento, surgiu
       * objeção nova. Oscilação do score na mesma faixa e objeção
       * reescrita com outra palavra ficam de fora (ver evolucaoConversa.ts).
       */
      const evolucao = detectarEvolucao({
        anterior: dossieAnterior,
        novo: dossie,
        visitaConfirmada,
        formatarMoeda: (v) =>
          v === null
            ? "—"
            : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
      });

      if (evolucao) {
        const ultimo = await ultimoAvisoEvolucao(conversa.id);
        if (podeAvisarAgora(ultimo, evolucao.urgente)) {
          const resultadoAtualizacao = await notificarAtualizacaoCorretor({
            instanceName: instancia.instanceName,
            telefoneCorretor: instancia.whatsappCorretor,
            nomeCliente: payload.senderName || "Cliente WhatsApp",
            telefoneCliente: sender,
            resumoMudancas: evolucao.linhas.join("\n"),
          });
          alerta = { enviado: resultadoAtualizacao.enviado, motivo: resultadoAtualizacao.motivo };
          if (resultadoAtualizacao.enviado) await marcarAvisoEvolucao(conversa.id);
        }
      }
    }

    // A linha de telemetria desta interação — é dela que saem latência,
    // taxa de fallback, anexos bloqueados pelos guardrails e a
    // rastreabilidade por versão de prompt (ver ia_interacoes, 0029).
    await registrarInteracao({
      id: interacaoId,
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
      modelo: respostaIA.meta.modelo,
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
