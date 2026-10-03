import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { getEmpreendimentos } from "@/lib/queries";
import { PROMPT_VERSAO } from "@/lib/whatsapp/aiAgent";
import { conversaEhAtendimento } from "@/lib/whatsapp/privacidadeDaConversa";
import { horariosDeVisitaSeguros } from "@/lib/crm/agendaDoCorretor";
import { executarTurnoDeAtendimento } from "@/lib/whatsapp/turnoDeAtendimento";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";
import { montarContextoDaInteracao } from "@/lib/whatsapp/contextoDaInteracao";
import { extrairDossieCliente, normalizarSaidaDoDossie } from "@/lib/whatsapp/dossierExtractor";
import type { DossieClienteIA } from "@/lib/whatsapp/types";
import { horasDesdeAUltimaFala } from "@/lib/whatsapp/tempoDaConversa";
import { devoExtrair } from "@/lib/whatsapp/quandoExtrair";
import { mesclarMemoria } from "@/lib/whatsapp/memoriaDaConversa";
import { detectarEvolucao, podeAvisarAgora } from "@/lib/whatsapp/evolucaoConversa";
import { instrucaoDoAudio, transcreverAudioWhatsapp } from "@/lib/whatsapp/audioTranscriber";
import { notificarAtualizacaoCorretor, notificarCorretorLeadQuente } from "@/lib/whatsapp/brokerNotifier";
import {
  baixarMidiaDoProvedor,
  enviarMensagemWhatsapp,
  enviarMidiaWhatsapp,
  enviarPresencaDigitando,
} from "@/lib/whatsapp/provider";
import {
  agendarVisitaLead,
  aplicarAckDeEntrega,
  avancarLeadParaPrimeiroContato,
  contarFalasNaoGravadas,
  marcarConversaAtendida,
  registrarImovelDeInteresse,
  registrarRespostaDoLead,
  situacaoDaConversa,
  buscarDossieAtual,
  cancelarFollowupsPendentes,
  gravarMensagem,
  vincularInteracaoNaMensagem,
  historicoRecente,
  ativarIaNaConversa,
  marcarLeadVindoDeAnuncio,
  reivindicarCliqueDoLink,
  vincularCliqueAoLead,
  type CliqueDoLink,
  marcarConversaComoTeste,
  marcarRespostaCampanha,
  obterOuCriarConversa,
  podeAlertarLeadQuente,
  preencherNomeContato,
  registrarEventoConexao,
  desligarIaPorFalaDoCorretor,
  registrarResultadoEnvio,
  resolverInstancia,
  salvarDossie,
  registrarRecusaDoCliente,
  salvarMemoriaDaConversa,
  ultimaExtracaoDoLead,
  ultimaFalaDoCorretor,
  destravarDisparo,
  travarDisparo,
  ultimaMensagemClienteId,
  validarDataVisita,
  type ConversaPersistida,
  type InstanciaResolvida,
  ultimoAvisoEvolucao,
  marcarAvisoEvolucao,
  cadastrarPelaPalavraChave,
  registrarAtivacaoEmLeadAlheio,
} from "@/lib/whatsapp/repositorio";
import { importarHistoricoDoChat } from "@/lib/whatsapp/importarHistorico";
import { gerarEEnviarPelaIA } from "@/lib/whatsapp/aberturaPelaIA";
import { instrucaoPelosFollowups } from "@/lib/whatsapp/respostaAosFollowups";
import { decidirPorFalaDoCorretor, palavraDoCorretorNaMensagem } from "@/lib/whatsapp/modoBot";
import { decidirSeAIaResponde, registroDoSilencio } from "@/lib/whatsapp/quandoAIaResponde";
import { reconhecerConviteDeEntrada, reconhecerMensagemDeAnuncio } from "@/lib/whatsapp/porteiro";
import { chavesDeContexto, reconhecerAnuncioMeta } from "@/lib/whatsapp/anuncioMeta";
import { registrarLeadDeImpulsionamento } from "@/lib/whatsapp/impulsionamentos";
import { clientePediuLigacao } from "@/lib/whatsapp/pedidoDeLigacao";
import { iaPrometeuRetorno } from "@/lib/whatsapp/promessaDeRetorno";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { itensDoEvento, lerContato, resumirEventoDeContato } from "@/lib/whatsapp/contatosDaAgenda";
import { candidatosTelefone } from "@/lib/whatsapp/repositorio";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
// O buffer de rajada espera ~6s antes de responder, e o ciclo completo
// (2 chamadas de IA + envio em balões com pausas humanizadas) não cabe nos
// 10s padrão do plano Hobby.
export const maxDuration = 60;

/** Janela do buffer de rajada: quem digita em vários balões ganha UMA resposta. */
const ESPERA_RAJADA_MS = 6000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Comparação em tempo constante — evita descobrir o segredo por medição. */
/**
 * Extrai o dossiê e a memória — e roda MESMO quando a IA não responde.
 *
 * Até 11/09/2026 a extração vivia só no fim do caminho de resposta. Medido
 * em 7 dias, nas conversas de atendimento: 191 falas de cliente, 80
 * respostas da IA e 127 do CORRETOR. As falas que ele atendeu não geravam
 * extração nenhuma — e são a maioria. É por isso que a ficha estava vazia
 * (0 nome, 0 renda, 1 orçamento em 55 leads que conversaram), não por
 * faltar código de escrita: `salvarDossie` já escrevia desde 24/08.
 *
 * As três travas moram em `devoExtrair`, pura e testada. A que mais importa
 * é a primeira: a linha é o WhatsApp PESSOAL do corretor, e extrair ficha
 * da conversa da família dele é o que a 0087 veio impedir.
 *
 * Falha só loga. Isto roda depois de a mensagem já ter sido gravada (e, no
 * caminho feliz, já enviada): derrubar o ciclo por causa da memória seria
 * trocar contexto melhor por nenhuma resposta.
 */
async function atualizarFichaEMemoria(params: {
  conversa: ConversaPersistida;
  historico: { remetente: "cliente" | "bot" | "corretor"; texto: string }[];
  telefone: string;
  /**
   * A IA acabou de responder.
   *
   * Nesse caso o debounce NÃO se aplica: uma extração por resposta da IA é
   * exatamente a taxa que já existia antes desta mudança, e manter isso
   * preserva o comportamento do caminho feliz — inclusive o dossiê que o
   * aviso de evolução ao corretor compara logo depois. O debounce existe
   * para os caminhos NOVOS, em que quem atende é o corretor e a rajada dele
   * geraria cinco extrações do mesmo assunto.
   */
  iaRespondeu?: boolean;
}): Promise<DossieClienteIA | null> {
  const { conversa, historico } = params;
  try {
    const ehAtendimento = conversaEhAtendimento(conversa);

    const permitido = devoExtrair({
      ehAtendimento,
      temLead: Boolean(conversa.leadId),
      ultimaExtracaoEm: params.iaRespondeu
        ? null
        : conversa.leadId
          ? await ultimaExtracaoDoLead(conversa.leadId)
          : null,
    });
    if (!permitido) return null;

    const transcricao = historico
      .map(
        (m) =>
          `${m.remetente === "cliente" ? "Cliente" : m.remetente === "corretor" ? "Corretor" : "Assistente"}: ${m.texto}`,
      )
      .join(String.fromCharCode(10));

    const dossie = await extrairDossieCliente(
      transcricao,
      conversa.leadId ?? params.telefone,
      conversa.memoria,
    );
    if (conversa.leadId) await salvarDossie(conversa.leadId, dossie);

    /*
     * A memória é da CONVERSA, não do lead: o mesmo telefone pode ter duas
     * conversas, e misturar as memórias faria a IA falar de um imóvel que
     * foi assunto da outra.
     */
    const memoria = mesclarMemoria(
      { texto: conversa.memoria, doCorretor: conversa.memoriaDoCorretor },
      dossie.memoria,
    );
    if (memoria !== conversa.memoria) await salvarMemoriaDaConversa(conversa.id, memoria);
    return dossie;
  } catch (erro) {
    console.error("[ficha] falha ao atualizar ficha/memória:", erro);
    return null;
  }
}

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
    const audioMsg = payload.data?.message?.audioMessage;
    /*
     * A `url` do `audioMessage` é o arquivo CIFRADO do WhatsApp — não serve
     * para transcrever (ver `audioTranscriber.ts`). Fica só como referência
     * da mídia na mensagem gravada; o áudio de verdade vem decifrado da
     * Evolution, logo antes da transcrição.
     */
    const audioUrlOrBase64 =
      audioMsg?.url ||
      payload.audioBase64 ||
      payload.audioUrl ||
      (audioMsg ? "audio" : "");

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

    /*
     * MESSAGES_UPDATE é o ack de entrega/leitura (0051) — vira os ✓✓ das
     * mensagens que o corretor mandou pelo painel. Sem texto e sem fala:
     * precisa sair ANTES da checagem de "mensagem vazia". Ack de balão do
     * bot cai aqui também e é ignorado dentro de `aplicarAckDeEntrega`
     * (não guarda provider id) — é o custo de não carimbar ack de UM balão
     * numa linha que representa VÁRIOS.
     */
    if (evento === "messages.update") {
      const ackId: string | null = payload.data?.keyId || payload.data?.key?.id || null;
      const ackStatus = String(payload.data?.status || "").toUpperCase();
      const status =
        ackStatus === "READ" || ackStatus === "PLAYED"
          ? ("lida" as const)
          : ackStatus === "DELIVERY_ACK"
            ? ("entregue" as const)
            : null;
      if (ackId && status) await aplicarAckDeEntrega(ackId, status);
      return NextResponse.json({ ok: true, action: "ack_registrado", status: ackStatus });
    }

    /*
     * Contatos da agenda (03/10/2026, passo 1): só diagnóstico. Queremos
     * saber se o nome que o corretor salva no celular chega aqui, e em qual
     * campo. O log leva os NOMES dos campos e se há um nome que não é só o
     * número — nunca o nome em si. Nenhum lead é criado nem alterado.
     */
    if (evento === "contacts.upsert" || evento === "contacts.update") {
      const itens = itensDoEvento(payload.data);
      const telefones = Array.from(
        new Set(itens.flatMap((i) => candidatosTelefone(lerContato(i).digitos)).filter(Boolean)),
      );
      const nomesDoPerfil = new Map<string, string | null>();
      if (telefones.length && telefones.length <= 200) {
        const { data } = await createServiceClient()
          .from("whatsapp_conversas")
          .select("telefone_cliente, nome_cliente")
          .eq("corretor_id", instancia.corretorId)
          .in("telefone_cliente", telefones);
        for (const c of data ?? []) {
          for (const t of candidatosTelefone(c.telefone_cliente)) nomesDoPerfil.set(t, c.nome_cliente);
        }
      }
      console.log("[contatos] evento da agenda:", {
        evento,
        instancia: instanceName,
        ...resumirEventoDeContato(itens, nomesDoPerfil),
      });
      return NextResponse.json({ ok: true, action: "contato_registrado_no_log" });
    }

    const ehAudio = Boolean(!text && audioUrlOrBase64);
    /*
     * A transcrição falhou? Isso PRECISA ser visível.
     *
     * `transcreverAudioWhatsapp` já devolvia `sucesso: false`, e ninguém
     * lia. O texto de erro — "[Áudio recebido — não foi possível
     * transcrever automaticamente]" — entrava na conversa COMO SE FOSSE
     * FALA DO CLIENTE, e a IA respondia a ele. O cliente mandou um áudio
     * dizendo o que queria e recebeu uma resposta sobre coisa nenhuma.
     *
     * 104 áudios recebidos em produção até 24/08/2026, e nenhuma medida de
     * quantos foram entendidos. Agora o desfecho é carimbado na telemetria
     * e o cliente ouve a verdade em vez de uma resposta inventada.
     */
    if (!sender || (!text && !ehAudio)) {
      return NextResponse.json({ ok: true, ignored: "Mensagem vazia ou sem remetente" });
    }

    /*
     * A pessoa está respondendo a uma peça NOSSA? (13/09/2026)
     *
     * Precisa ser decidido AQUI, antes do porteiro — a 0111 encerrava a
     * requisição na linha seguinte, e o reconhecimento de anúncio que já
     * existia mora 100 linhas abaixo, onde número novo nunca chegava. Ou
     * seja: o clique que o anúncio PAGOU escrevia e era descartado em
     * silêncio, sem conversa, sem resposta e sem rastro no CRM.
     *
     * Só a primeira fala importa: quem já tem lead nem passa por aqui (o
     * porteiro acha o cadastro e segue), e a liberação da conversa continua
     * onde sempre esteve, mais abaixo.
     */
    const anuncioMeta = reconhecerAnuncioMeta({ payload, texto: text });
    const convite = reconhecerConviteDeEntrada({
      texto: text,
      palavrasEntradaCliente: instancia.palavrasEntradaCliente,
      anuncio: anuncioMeta,
    });

    /*
     * A palavra-chave do CORRETOR cadastra o número (0146, plano de ativação
     * de 03/10/2026). Precisa vir antes do porteiro pelo mesmo motivo do
     * convite acima: num número sem lead, a 0111 encerraria a requisição
     * antes de a palavra ser lida, e o corretor digitaria para nada.
     *
     * Número que já é lead de OUTRO corretor (regra N6): o lead fica com o
     * dono, nada é criado aqui, e a IA não responde neste número. O aviso vai
     * só para quem digitou, pela fila do Início, sem o nome do dono.
     */
    const palavraDoCorretor =
      fromMe && text
        ? palavraDoCorretorNaMensagem({
            mensagem: text,
            palavraChaveConfigurada: instancia.palavraChaveAtivacao,
            palavraChaveTeste: instancia.palavraChaveTeste,
          })
        : null;
    let cadastradoPelaPalavra = false;
    if (palavraDoCorretor) {
      const cadastro = await cadastrarPelaPalavraChave({
        corretorId: instancia.corretorId,
        telefoneCliente: sender,
        teste: palavraDoCorretor === "teste",
      });
      if (cadastro.desfecho === "lead_de_outro_corretor") {
        await registrarAtivacaoEmLeadAlheio({
          corretorId: instancia.corretorId,
          leadId: cadastro.leadId,
          telefone: sender,
        });
        return NextResponse.json({ ok: true, action: "lead_de_outro_corretor", sender });
      }
      cadastradoPelaPalavra = cadastro.desfecho === "cadastrado";
    }

    /*
     * Porteiro de persistência: sem lead cadastrado E sem convite, nada
     * desta conversa entra no CRM. Ele vem ANTES da transcrição para áudio
     * desconhecido não ser enviado a outro serviço e antes de qualquer
     * gravação/telemetria.
     *
     * Consequência declarada: áudio ou imagem como PRIMEIRA fala de um
     * número novo continuam ignorados — não há texto para reconhecer, e
     * transcrever antes de saber se é lead é exatamente o que a 0111 veio
     * impedir.
     */
    const conversa = await obterOuCriarConversa({
      corretorId: instancia.corretorId,
      telefoneCliente: sender,
      nomeCliente: payload.senderName || null,
      convite,
    });

    /*
     * Cadastro pelo clique no link SEM a mensagem pronta (0143) foi
     * DESLIGADO em 02/10/2026, no mesmo dia: o número do corretor é o
     * WhatsApp pessoal dele, e qualquer conhecido que escrevesse nos 15
     * minutos seguintes a um clique virava lead e era respondido pela IA
     * (os dois únicos cadastros por essa regra eram conhecidos dele). A
     * hora da mensagem não separa cliente de conhecido; só o texto separa.
     *
     * O que fica: quando a mensagem pronta chega, o clique dela é gasto e
     * ligado ao lead, para a atribuição do anúncio.
     */
    let cliqueDoLink: CliqueDoLink | null = null;
    if (conversa && (convite?.via === "mensagem_do_anuncio" || convite?.via === "mensagem_do_site")) {
      cliqueDoLink = await reivindicarCliqueDoLink({ corretorId: instancia.corretorId });
    }
    if (cliqueDoLink && conversa?.leadId) {
      await vincularCliqueAoLead(cliqueDoLink.cliqueId, conversa.leadId);
    }

    /*
     * Diagnóstico do impulsionamento (27/09): só os NOMES dos campos de
     * contexto, nunca o conteúdo. Se um anúncio de verdade chegar sem ser
     * reconhecido, é aqui que aparece qual campo a Evolution mandou.
     */
    if (!conversa && chavesDeContexto(payload).length > 0) {
      console.info("[porteiro] número sem lead com contextInfo:", chavesDeContexto(payload).join(","));
    }

    if (!conversa) {
      return NextResponse.json({ ok: true, ignored: "numero_sem_lead_cadastrado" });
    }

    let audioFalhou = false;
    let instrucaoAudio: string | undefined;
    /** O áudio decifrado: do próprio webhook (se vier) ou pedido à Evolution. */
    const audioDecifrado = async () => {
      const segundos = typeof audioMsg?.seconds === "number" ? audioMsg.seconds : null;
      const noPayload: string | undefined = payload.data?.message?.base64 || payload.audioBase64;
      if (noPayload) return { base64: noPayload, mimeType: audioMsg?.mimetype ?? null, segundos };
      if (!providerMessageId) return { base64: null, segundos };
      const baixado = await baixarMidiaDoProvedor({
        instanceName: instancia.instanceName,
        messageId: providerMessageId,
        mensagemCompleta: payload.data,
      });
      if (!baixado.ok) {
        console.warn("[webhook] não consegui baixar o áudio decifrado:", baixado.motivo, baixado.detalhe ?? "");
        return { base64: null, segundos };
      }
      return { base64: baixado.base64, mimeType: audioMsg?.mimetype ?? baixado.mimeType, segundos };
    };
    if (ehAudio) {
      const resultadoAudio = await transcreverAudioWhatsapp(await audioDecifrado());
      audioFalhou = !resultadoAudio.sucesso;
      text = resultadoAudio.textoTranscrito;
      /*
       * A "intenção detectada" que ia anexada aqui SAIU (26/09/2026): era um
       * palpite do modelo gravado como fala do cliente, e a IA respondia ao
       * palpite. O que vai para o turno é a instrução de que a fala é uma
       * transcrição — ver `instrucaoDoAudio`.
       */
      if (resultadoAudio.sucesso) instrucaoAudio = instrucaoDoAudio(resultadoAudio);
    }

    if (!text) {
      return NextResponse.json({ ok: true, ignored: "Mensagem vazia ou sem remetente" });
    }

    // O corretor respondeu do celular dele: registra a fala. Duas leituras
    // possíveis para o que vem a seguir — e são mutuamente exclusivas:
    //
    //   1. A mensagem contém a palavra-chave cadastrada: é o sinal
    //      combinado de "pode assumir" (ver modoBot.ts). Liga a IA e tira a
    //      pausa — esta mensagem não é "estou atendendo pessoalmente", é a
    //      entrega deliberada para a IA.
    //   2. Qualquer outra mensagem do corretor: ele assumiu a conversa, e a
    //      IA fica DESLIGADA nela até a ativação (palavra-chave ou "IA assume
    //      agora"). A regra mora em `decidirPorFalaDoCorretor`.
    if (fromMe) {
      await gravarMensagem({
        // O porteiro acima já garantiu o vínculo com um lead. A função
        // central continua decidindo a gravação para manter o mesmo contrato
        // dos demais caminhos de atendimento.
        conversaLiberada: conversaEhAtendimento(conversa),
        conversaId: conversa.id,
        remetente: "corretor",
        conteudo: text,
        tipo: ehAudio ? "audio" : "texto",
      });

      const decisao = decidirPorFalaDoCorretor({
        mensagem: text,
        palavraChaveConfigurada: instancia.palavraChaveAtivacao,
        palavraChaveTeste: instancia.palavraChaveTeste,
      });

      if (decisao.acao === "ativar_ia") {
        await ativarIaNaConversa(conversa.id);
        /*
         * A palavra de TESTE liga a IA e tira a conversa do corpus. Sem
         * isto, o corretor testando pela linha de verdade voltaria a
         * envenenar o few-shot — o problema que a 0038 acabou de limpar.
         */
        if (decisao.marcarComoTeste) await marcarConversaComoTeste(conversa.id);
        /*
         * Depois da resposta ao provedor (`after`), porque os dois passos
         * podem levar segundos:
         *
         * 1. Número que a palavra acabou de cadastrar (0146): traz o que já
         *    foi conversado no chat e, com isso, preenche a ficha.
         * 2. O cliente estava esperando? A IA responde agora (plano de
         *    ativação, 2.3), como no "IA assume agora". A mensagem com a
         *    palavra é do corretor e fecharia a rajada, por isso é
         *    desconsiderada; sem pendência do cliente, nada é enviado (N1).
         */
        after(async () => {
          if (cadastradoPelaPalavra) {
            const trazidas = await importarHistoricoDoChat({
              instanceName: instancia.instanceName,
              conversaId: conversa.id,
              remoteJid: jidBruto,
              mensagemAtualId: providerMessageId,
            });
            if (trazidas > 0) {
              await atualizarFichaEMemoria({
                conversa,
                historico: await historicoRecente(conversa.id),
                telefone: sender,
              });
            }
          }
          const r = await gerarEEnviarPelaIA({
            conversa: {
              id: conversa.id,
              telefoneCliente: conversa.telefoneCliente,
              leadId: conversa.leadId,
              eTeste: conversa.eTeste || decisao.marcarComoTeste,
            },
            instancia: {
              id: instancia.id,
              corretor_id: instancia.corretorId,
              instance_name: instancia.instanceName,
              nome_assistente: instancia.nomeAssistente,
              tom_voz: instancia.tomVoz,
              conectado_em: null,
            },
            instrucaoAbertura: "",
            desconsiderarUltimaFalaDoCorretor: true,
            somenteResposta: true,
          });
          if (r.erro) console.warn("[palavra-chave] a IA não respondeu a pendência:", r.erro);
        });
        return NextResponse.json({
          ok: true,
          action: decisao.marcarComoTeste
            ? "bot_ativado_em_modo_teste"
            : "bot_ativado_por_palavra_chave",
          sender,
        });
      }

      await desligarIaPorFalaDoCorretor(conversa.id);
      // O corretor falou com o cliente: é o primeiro contato, com a IA
      // calada ou não (plano de ativação, 3.2). Só anda quem está em "Novo".
      if (conversa.leadId) await avancarLeadParaPrimeiroContato(conversa.leadId, "corretor_no_whatsapp");
      return NextResponse.json({
        ok: true,
        action: "ia_desligada_pela_fala_do_corretor",
        sender,
      });
    }

    const gravacao = await gravarMensagem({
      conversaLiberada: conversaEhAtendimento(conversa),
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

    /*
     * O cliente falou: a contagem de insistência volta a zero (0060).
     *
     * Vem depois da guarda de reentrega de propósito — o provedor reentrega
     * a mesma mensagem, e zerar duas vezes não faz mal, mas contar a mesma
     * fala como dois sinais de vida faria. Fica ANTES de toda a decisão de
     * responder ou não: mesmo em conversa travada por palavra-chave, o
     * cliente respondeu, e é isso que o número guarda.
     */
    await registrarRespostaDoLead(conversa.leadId);

    /*
     * Mensagem pronta de anúncio (link porteiro /wa/<campanha>): quem
     * chega por ela clicou num anúncio pago. O lead recebe a origem e o
     * anúncio na ficha — é o que liga a conversa às métricas de custo por
     * campanha. (Quem deixa o número ENTRAR é o porteiro, mais acima.)
     */
    const nomeDoAnuncio = reconhecerMensagemDeAnuncio(text);
    if (nomeDoAnuncio) {
      if (conversa.leadId) {
        await marcarLeadVindoDeAnuncio(conversa.leadId, nomeDoAnuncio);
      }
    }

    // Entrou pelo clique no link do anúncio, sem a mensagem pronta: a ficha
    // ganha a mesma origem e o imóvel do link (é o que a campanha conta).
    if (!nomeDoAnuncio && convite === null && cliqueDoLink?.doAnuncio && cliqueDoLink.nomeImovel && conversa.leadId) {
      await marcarLeadVindoDeAnuncio(conversa.leadId, cliqueDoLink.nomeImovel);
    }

    /*
     * Impulsionamento do próprio corretor (27/09/2026): a Meta identificou o
     * anúncio. Carimba o anúncio na ficha e registra o anúncio na lista do
     * corretor — é nela que ele digita quanto gastou, e o custo por lead sai
     * sozinho.
     */
    if (anuncioMeta && !nomeDoAnuncio) {
      if (conversa.leadId) {
        await registrarLeadDeImpulsionamento({
          leadId: conversa.leadId,
          corretorId: instancia.corretorId,
          anuncio: anuncioMeta,
        });
      }
    }

    // O pushName vem em toda mensagem do CLIENTE (aqui, depois do desvio de
    // fromMe — o pushName de mensagem do corretor é o nome DELE). Preenche
    // conversa sem nome e lead ainda no placeholder "WhatsApp 1234".
    if (payload.senderName) {
      await preencherNomeContato({
        conversaId: conversa.id,
        leadId: conversa.leadId,
        nome: String(payload.senderName),
      });
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

    /*
     * A DECISÃO de responder, num lugar só (`quandoAIaResponde.ts`): a
     * conversa (lead de outro corretor, pediu para sair, IA desligada,
     * pausa do corretor) e depois o número (IA desligada, expediente,
     * co-piloto). A varredura de respostas atrasadas e o cabeçalho da
     * conversa perguntam à MESMA função — duas contas da mesma decisão já
     * fizeram a tela dizer "IA atendendo" com a IA muda.
     *
     * O co-piloto precisa saber quando o humano falou pela última vez, e
     * isso é uma consulta: só é feita no modo que usa.
     */
    const numero = { modo: instancia.modoBot, expediente: instancia.expediente };
    const decisaoIA = decidirSeAIaResponde({
      conversa: situacaoDaConversa(conversa),
      numero,
      ultimaFalaCorretorEm:
        instancia.modoBot === "co_piloto_3min" ? await ultimaFalaDoCorretor(conversa.id) : null,
    });

    /*
     * Áudio que não deu para entender: fale a verdade e chame o corretor.
     *
     * Responder ao texto de erro como se fosse a fala do cliente é o pior
     * desfecho possível — ele contou o que queria e recebeu resposta sobre
     * outra coisa. Uma frase honesta custa nada e mantém a conversa viva;
     * e o corretor fica sabendo, porque o áudio ainda está lá no WhatsApp
     * dele para ser ouvido por gente.
     */
    if (audioFalhou && decisaoIA.responde) {
      await enviarMensagemWhatsapp({
        instanceName: instancia.instanceName,
        telefone: sender,
        texto: "Recebi seu áudio mas não consegui ouvir direito por aqui. Pode me escrever ou mandar de novo?",
      });
      await registrarInteracao({
        conversaId: conversa.id,
        corretorId: instancia.corretorId,
        origem: "webhook",
        eTeste: conversa.eTeste,
        promptVersao: PROMPT_VERSAO,
        acao: "audio_nao_transcrito",
      });
      return NextResponse.json({ ok: true, action: "audio_nao_transcrito", sender });
    }

    if (!decisaoIA.responde) {
      /*
       * Silêncio também é dado: sem registrar, "o bot respondeu pouco" e "o
       * bot está quebrado" são indistinguíveis no painel. E o MOTIVO é o dado
       * que importa: até 03/09/2026 todo silêncio saía carimbado como pausa,
       * e a pausa era culpada de nenhum dos 335 casos medidos. Desde
       * 04/10/2026 vai junto o que explica o motivo (modo, expediente, até
       * quando) em `silencio` — a configuração pode mudar depois, e a
       * pergunta "por que ela não respondeu ontem?" precisa da de ontem.
       */
      await registrarInteracao({
        conversaId: conversa.id,
        corretorId: instancia.corretorId,
        origem: "webhook",
        eTeste: conversa.eTeste,
        promptVersao: PROMPT_VERSAO,
        acao: decisaoIA.motivo,
        silencio: registroDoSilencio(decisaoIA, numero),
      });
      /*
       * A ficha é atualizada MESMO com a IA calada — e este é o caminho
       * mais comum: medido em 7 dias, 127 das 191 falas de cliente foram
       * atendidas pelo CORRETOR, e nenhuma delas gerava extração. As travas
       * de privacidade e de debounce moram em `devoExtrair`.
       */
      await atualizarFichaEMemoria({
        conversa,
        historico: await historicoRecente(conversa.id),
        telefone: sender,
      });
      return NextResponse.json({ ok: true, action: "ia_calada", motivo: decisaoIA.motivo, sender });
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
     * Com a trava na mão, a última fala ainda tem de ser do CLIENTE. Durante
     * os 6s da rajada alguém pode ter respondido: a palavra-chave do corretor
     * (que dispara a IA por outro caminho) ou o próprio corretor digitando.
     * Medido em 03/10/2026: a palavra-chave e a mensagem do cliente chegaram
     * no mesmo segundo e o cliente recebeu DUAS respostas da IA. Se a vez já
     * passou, esta invocação não fala — nem por cima do corretor.
     */
    if (historico.length > 0 && historico[historico.length - 1].remetente !== "cliente") {
      await registrarInteracao({
        conversaId: conversa.id,
        corretorId: instancia.corretorId,
        origem: "webhook",
        eTeste: conversa.eTeste,
        promptVersao: PROMPT_VERSAO,
        acao: "absorvida_por_debounce",
      });
      return NextResponse.json({ ok: true, action: "ja_respondida", sender });
    }

    /*
     * Resposta a um follow-up nosso (pós-visita, lembrete da véspera,
     * pedido de indicação) vira instrução para o turno e, quando cabe,
     * aviso ao corretor e `visita_confirmada_em` (0121, 0123).
     */
    const instrucaoDoFollowup = await instrucaoPelosFollowups({
      conversaId: conversa.id,
      leadId: conversa.leadId,
      corretorId: instancia.corretorId,
      historico,
    });

    /*
     * UM turno de atendimento, no caminho compartilhado
     * (`turnoDeAtendimento.ts`): separa a rajada, recupera few-shot,
     * ranqueia e encolhe o catálogo pelo foco, gera, saneia e quebra em
     * balões. Playground, follow-up e eval chamam a MESMA função — foi
     * duas vezes que um caminho paralelo divergiu e o teste passou a medir
     * um agente que não existe.
     */
    const turno = await executarTurnoDeAtendimento({
      identidade: {
        nomeCorretor: instancia.nomeCorretor,
        slugCorretor: instancia.slugCorretor ?? undefined,
        creciCorretor: instancia.creciCorretor,
        telefoneCorretor: instancia.whatsappCorretor,
        nomeAssistente: instancia.nomeAssistente,
        tomVoz: instancia.tomVoz,
      },
      catalogo,
      historico,
      dossie: dossieAnterior,
      /*
       * A MEMÓRIA (0110): o estado da negociação que sobrevive à janela de
       * 40 falas. Nas conversas ativas, até 27 dessas 40 são do CORRETOR —
       * o número é o WhatsApp pessoal dele —, então sem ela a IA lê a
       * conversa humana e perde a própria.
       */
      memoria: conversa.memoria,
      /*
       * Quanto tempo passou desde a última fala de qualquer um. Acima de
       * 72h a jogada vira `retomar`: confirma se ainda vale antes de seguir.
       * O cálculo mora aqui porque `turnoDeAtendimento` não toca no relógio.
       */
      horasDesdeAUltimaFala: horasDesdeAUltimaFala(historico),
      instrucaoExtra: [instrucaoAudio, instrucaoDoFollowup].filter(Boolean).join(" ") || undefined,
      fewShot: { corretorId: instancia.corretorId, conversaAtualId: conversa.id },
      /*
       * Os horários que EXISTEM na agenda do corretor (0073). Até aqui a
       * Sofia oferecia horário de cabeça: o eval de 31/08 mediu os mesmos
       * dois inventados quatro vezes seguidas, e o funil mostra 6 visitas
       * propostas para 1 marcada. Vazio para quem não configurou agenda —
       * e aí o prompt segue com o calendário genérico de sempre.
       *
       * Vai CRU: quem filtra o que já foi oferecido nesta conversa é o
       * turno, que é onde o histórico está. Montar o bloco aqui faria a
       * mesma conta em dois lugares.
       */
      horariosReais: await horariosDeVisitaSeguros(instancia.corretorId),
      // A renda do cliente vira teto de compra pela mesma conta do site
      // (`capacidadeDeCompra.ts`); a leitura já cai no seed se o banco falhar.
      parametrosCredito: await getParametrosCredito().catch(() => undefined),
    });

    const respostaIA = turno.resposta;
    const anexos = turno.anexos;
    const baloes = turno.baloes;

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

    /*
     * Os anexos já vêm resolvidos contra o catálogo (a IA pede por slug e
     * tipo, o código busca a URL — ver resolverMidia.ts), e o texto já vem
     * quebrado em balões: longa vira duas médias, média vira duas
     * pequenas. Cada balão depois do primeiro sai precedido de
     * "digitando..." com um intervalo curto, para ter o ritmo de alguém
     * escrevendo em vez do despejo instantâneo característico de robô.
     */
    let todosEnviados = true;
    let primeiroMotivo: string | undefined;
    let primeiroDetalhe: string | undefined;
    /*
     * Id do PRIMEIRO balão, que ancora a confirmação de entrega.
     *
     * A resposta vira N balões, cada um com o próprio id no provedor, mas o
     * Live Chat guarda UMA linha com o texto inteiro. O ✓✓ do primeiro
     * balão é a melhor âncora disponível: se ele foi entregue, a conversa
     * chegou. Sem nenhum id — como era até 27/08/2026 — o ACK que o webhook
     * recebe (0051) não tinha por onde casar, e resposta da IA nunca podia
     * mostrar entrega.
     */
    let idDoPrimeiroBalao: string | undefined;

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
      if (i === 0) idDoPrimeiroBalao = envioBalao.messageId;
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

    /*
     * A mensagem é gravada SEM o vínculo, e o vínculo vem depois de a
     * telemetria existir. A FK exige essa ordem, e invertê-la custou dois
     * dias de respostas não gravadas — com a IA cumprimentando do zero em
     * toda mensagem porque nunca via as próprias falas.
     *
     * Gravar aqui, e não no fim, é deliberado: se a função estourar o tempo
     * no dossiê (12s) ou num aviso, a conversa já está salva. Perder o
     * vínculo custa uma avaliação; perder a mensagem custa o contexto.
     */
    /*
     * O FATO, carimbado uma vez só (0106): a IA atendeu esta conversa.
     *
     * Vem ANTES de gravar o balão de propósito. `conversa` foi lida no início
     * da requisição, e é ela que decide se a PRÓXIMA fala do cliente será
     * guardada — carimbar depois deixaria uma janela em que a conversa já foi
     * atendida e o texto ainda se perde. O objeto em memória é atualizado
     * junto, senão as duas metades desta mesma requisição discordariam.
     *
     * NÃO destrava nada: o retravamento continua valendo, e a IA segue muda
     * até alguém liberar. É só o texto que volta a ser guardado.
     */
    if (envio.enviado && !conversa.atendidaEm) {
      await marcarConversaAtendida(conversa.id);
      conversa.atendidaEm = new Date().toISOString();
    }

    const mensagemDoBot = await gravarMensagem({
      // Se a IA respondeu, a conversa é atendimento por definição — mas o
      // valor vem da MESMA função que decide isso, não de um `true`
      // cravado: um dia a condição muda e o `true` continuaria mentindo.
      conversaLiberada: conversaEhAtendimento(conversa),
      conversaId: conversa.id,
      remetente: "bot",
      conteudo: textoParaEnviar,
      providerMessageId: idDoPrimeiroBalao ?? null,
      statusEntrega: idDoPrimeiroBalao ? "enviada" : null,
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
    /*
     * O cliente RECUSOU e a jogada foi encerrar: o sistema inteiro para de
     * procurá-lo. Vem antes da ficha porque é o efeito que não pode ser
     * perdido se algo abaixo falhar — despedida sem os quatro efeitos é
     * uma frase bonita antes de a máquina continuar cutucando.
     */
    if (turno.jogada.tipo === "encerrar_recusado") {
      await registrarRecusaDoCliente({
        conversaId: conversa.id,
        leadId: conversa.leadId,
        familia: turno.jogada.familia,
      });
    }

    const dossie =
      (await atualizarFichaEMemoria({ conversa, historico, telefone: sender, iaRespondeu: true })) ??
      /*
       * A extração pode ter sido pulada (conversa sem lead, por exemplo).
       * O que vem abaixo compara dossiê novo com anterior para avisar o
       * corretor; sem extração, o anterior é o retrato mais atual que
       * existe — e comparar algo consigo mesmo não gera aviso nenhum, que
       * é o desfecho certo.
       */
      dossieAnterior ??
      /*
       * Sem extração e sem dossiê anterior (conversa sem lead), o retrato
       * neutro — que é exatamente o que `extrairDossieCliente` devolvia
       * neste caso antes desta mudança. Um objeto vazio aqui quebraria as
       * linhas abaixo; um dossiê inventado mentiria.
       */
      normalizarSaidaDoDossie({}, conversa.leadId ?? sender);

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
    const pediuLigacao = turno.vezDoCliente.some(clientePediuLigacao);
    const exigeAcaoAgora = visitaConfirmada || respostaIA.transferirHumano || pediuLigacao;
    /*
     * A IA prometeu que o corretor traz a resposta ("confirmo com o corretor
     * e te trago"). Sem este aviso ninguém ficava sabendo, e a promessa
     * virava mentira (ver `promessaDeRetorno.ts`). Passa pela mesma carência
     * do lead quente: prometer de novo na mensagem seguinte não repete o
     * aviso.
     */
    const prometeuRetorno =
      !exigeAcaoAgora &&
      iaPrometeuRetorno(respostaIA.textoResposta ?? "") &&
      (await podeAlertarLeadQuente(conversa.id));
    const deveAlertar =
      exigeAcaoAgora ||
      prometeuRetorno ||
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
          : prometeuRetorno
          ? `O cliente perguntou: "${turno.vezDoCliente.join(" / ")}". A assistente disse que você responde. ${dossie.resumoExecutivo}`
          : dossie.resumoExecutivo,
        motivoAlerta: visitaConfirmada
          ? "visita_confirmada"
          : pediuLigacao
          ? "ligacao_solicitada"
          : prometeuRetorno
          ? "duvida_pendente"
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
      anexosBloqueados: turno.bloqueios,
      temperaturaScore: dossie.temperaturaScore,
      tokensEntrada: respostaIA.meta.tokensEntrada,
      tokensSaida: respostaIA.meta.tokensSaida,
      modelo: respostaIA.meta.modelo,
      /*
       * Por que ela disse isso (0105). O dossiê é o ANTERIOR — o que a IA
       * tinha na mão — e não o `dossie` reextraído logo acima: julgar com o
       * de depois seria julgar com informação que ela não tinha.
       */
      contexto: montarContextoDaInteracao({
        foco: turno.foco,
        jogada: turno.jogada,
        dossie: dossieAnterior,
        historico: turno.historicoAnterior,
        falasNaoGravadas: await contarFalasNaoGravadas(conversa.id),
        fewShot: turno.fewShot,
      }),
    });

    // Agora a linha de telemetria existe: a FK aceita o vínculo.
    await vincularInteracaoNaMensagem(mensagemDoBot.id, interacaoId);

    // A primeira resposta ENTREGUE é o primeiro contato — o funil acompanha
    // sozinho (só sai de "novo"; nunca volta; idempotente).
    if (envio.enviado && conversa.leadId) {
      await avancarLeadParaPrimeiroContato(conversa.leadId);

      /*
       * O imóvel de que esta conversa trata (0083). O foco já era calculado
       * a cada mensagem e descartado; agora a ficha do CRM mostra do que o
       * cliente está falando, que é a informação mais básica para o
       * corretor retomar o atendimento.
       */
      if (turno.foco) {
        await registrarImovelDeInteresse(
          conversa.leadId,
          catalogo.find((e) => e.slug === turno.foco!.slug)?.id ?? null,
        );
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
