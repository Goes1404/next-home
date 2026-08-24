import "server-only";

import { decidirPareamentoPorNumero } from "./pareamento";

/**
 * Adaptador de envio de mensagens do WhatsApp.
 *
 * Este é o único ponto do sistema que fala com o provedor de fato. Tudo
 * mais (alerta de lead quente, resposta da IA, fila de campanha) passa por
 * aqui — trocar de provedor é reescrever este arquivo, e só ele.
 *
 * O formato de requisição abaixo é o da Evolution API v2 (`/message/sendText`),
 * que é o provedor citado no desenho do sistema. Z-API e Meta Cloud API têm
 * rotas e corpos diferentes; se a operação mudar de provedor, é aqui.
 *
 * REGRA INEGOCIÁVEL: nunca reportar `enviado: true` sem uma resposta de
 * sucesso do provedor. Um alerta de lead quente que se dá por entregue sem
 * ter saído é pior que nenhum alerta — o corretor confia e perde a venda.
 */

export type ResultadoEnvio = {
  enviado: boolean;
  /** Preenchido só quando `enviado` é false — o que impediu o envio. */
  motivo?: "provedor_nao_configurado" | "erro_provedor" | "dados_invalidos";
  detalhe?: string;
};

/** `null` quando o provedor não está configurado — o chamador decide o que fazer. */
function configDoProvedor(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.WHATSAPP_API_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/** Se há credenciais para enviar. A UI usa isto para não prometer o que não entrega. */
export function provedorConfigurado(): boolean {
  return configDoProvedor() !== null;
}

/**
 * Cria a instância no provedor, já apontando o webhook de volta para o
 * nosso endpoint — é o que faz as mensagens recebidas chegarem no CRM sem
 * ninguém precisar configurar nada à mão no painel da Evolution.
 *
 * Silencioso de propósito: se a instância já existe, o provedor responde
 * erro e o fluxo segue para o `connect` normalmente.
 */
async function garantirInstancia(
  config: { baseUrl: string; apiKey: string },
  instanceName: string,
  numero?: string | null,
): Promise<void> {
  const urlWebhook = process.env.WHATSAPP_WEBHOOK_URL;
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET;

  try {
    await fetch(`${config.baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        // Criar JÁ com o número é o que evita o problema pela raiz na
        // primeira conexão: a Evolution abre o socket pedindo o código de
        // pareamento em vez do QR, e nunca chega a entrar no estado
        // `connecting` que descartaria o número depois.
        ...(numero ? { number: numero } : {}),
        integration: "WHATSAPP-BAILEYS",
        ...(urlWebhook
          ? {
              webhook: {
                url: urlWebhook,
                byEvents: false,
                headers: segredo ? { "x-webhook-secret": segredo } : undefined,
                events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
              },
            }
          : {}),
      }),
    });
  } catch {
    // Falha aqui não impede tentar o connect — o erro real aparece lá.
  }
}

/**
 * O que de fato aconteceu no pareamento. Antes, "sem código" e "deu erro"
 * chegavam à tela do mesmo jeito — `codigoPareamento: null` — e ela não
 * tinha como dizer nada ao corretor: o formulário simplesmente reaparecia
 * vazio, sem código e sem explicação.
 */
export type DesfechoPareamento =
  /** Veio o código de 8 caracteres para digitar no celular. */
  | "codigo"
  /** Veio o QR Code para escanear. */
  | "qr"
  /** O número já está conectado — não há o que parear. */
  | "ja_conectado"
  /** O provedor respondeu, mas sem código nem QR utilizável. */
  | "sem_codigo";

export type ResultadoQrCode =
  | {
      ok: true;
      qrcodeBase64: string | null;
      /** Código de 8 caracteres para digitar no celular (pareamento por número). */
      codigoPareamento: string | null;
      jaConectado: boolean;
      desfecho: DesfechoPareamento;
    }
  | { ok: false; motivo: "provedor_nao_configurado" | "erro_provedor"; detalhe?: string };

/**
 * Pede ao provedor o pareamento da instância — QR Code ou código digitável.
 *
 * Passando `telefone` (E.164 só com dígitos), a Evolution devolve um
 * `pairingCode` de 8 caracteres em vez da imagem: o corretor digita no
 * próprio celular, em Aparelhos conectados → Conectar com número de
 * telefone. É o caminho de quem está mexendo no painel PELO celular, onde
 * não há uma segunda tela para apontar a câmera — apontar o celular para o
 * QR exibido nele mesmo é impossível.
 *
 * Sem credenciais não existe pareamento nenhum para mostrar — devolver uma
 * imagem decorativa faria o corretor apontar a câmera para um código que
 * não conecta em lugar nenhum.
 */
export async function obterQrCodeInstancia(
  instanceName: string,
  telefone?: string | null,
): Promise<ResultadoQrCode> {
  const config = configDoProvedor();
  if (!config) {
    return {
      ok: false,
      motivo: "provedor_nao_configurado",
      detalhe: "Defina WHATSAPP_API_URL e WHATSAPP_API_KEY para conectar um número.",
    };
  }

  const numero = telefone?.replace(/\D/g, "") || "";

  /*
   * Pareamento por número exige olhar o estado ANTES de pedir qualquer
   * coisa — ver o quadro em `pareamento.ts`. O caso que quebrava tudo é o
   * `connecting`: com um QR pendente segurando o socket, a Evolution
   * descarta o `?number=` sem avisar e devolve o mesmo QR de novo, então o
   * código de 8 caracteres nunca chegava à tela.
   */
  if (numero) {
    const estadoAtual = await consultarEstadoConexao(instanceName);
    const decisao = decidirPareamentoPorNumero(estadoAtual.ok ? estadoAtual.estado : null);

    if (decisao.acao === "recusar") {
      return {
        ok: true,
        qrcodeBase64: null,
        codigoPareamento: null,
        jaConectado: true,
        desfecho: "ja_conectado",
      };
    }

    // Derruba só a sessão PENDENTE (nunca uma conectada — `recusar` já
    // saiu acima). `logout` preserva instância, webhook e tom de voz.
    if (decisao.acao === "encerrar_antes") {
      await desconectarInstancia(instanceName);
    }
  }

  // Na primeira conexão do corretor a instância ainda não existe na
  // Evolution — `/instance/connect` sozinho devolveria 404. Criar é
  // idempotente na prática: se já existe, o provedor recusa e seguimos
  // direto para o connect.
  await garantirInstancia(config, instanceName, numero || null);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    // `?number=` é o que faz a Evolution devolver `pairingCode` no lugar do QR.
    const url = new URL(`${config.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`);
    if (numero) url.searchParams.set("number", numero);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { apikey: config.apiKey },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return { ok: false, motivo: "erro_provedor", detalhe: `HTTP ${res.status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}` };
    }

    const json = await res.json();
    const base64: string | null = json?.base64 || json?.qrcode?.base64 || null;
    const codigo: string | null =
      json?.pairingCode || json?.qrcode?.pairingCode || json?.code || null;
    const jaConectado = json?.instance?.state === "open" || json?.state === "open";

    // O `code` cru da Evolution às vezes é a string do QR (longa); só vale
    // como código digitável se tiver a cara de um: 8 caracteres.
    const codigoDigitavel = codigo && codigo.replace(/-/g, "").length <= 10 ? codigo : null;

    // Um pedido por número que volta sem código é o sintoma exato do bug
    // antigo. Registrar é o que faltou para diagnosticá-lo: nos logs de
    // produção não havia uma linha sequer sobre este caminho.
    if (numero && !codigoDigitavel && !jaConectado) {
      console.warn(
        `[whatsapp] pareamento por número sem pairingCode em ${instanceName} —` +
          ` estado=${json?.instance?.state ?? "?"} temQr=${Boolean(base64)}`,
      );
    }

    const desfecho: DesfechoPareamento = jaConectado
      ? "ja_conectado"
      : codigoDigitavel
        ? "codigo"
        : base64
          ? "qr"
          : "sem_codigo";

    return {
      ok: true,
      qrcodeBase64: base64,
      codigoPareamento: codigoDigitavel,
      jaConectado,
      desfecho,
    };
  } catch (err) {
    return {
      ok: false,
      motivo: "erro_provedor",
      detalhe: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Desconecta o número da instância (logout), pelo painel.
 *
 * Até aqui o corretor só conseguia desligar PELO CELULAR (WhatsApp →
 * Aparelhos conectados → sair), e quem perdeu o acesso ao aparelho ficava
 * com o número preso à instância sem saída nenhuma pelo sistema.
 *
 * `logout` derruba a sessão mas PRESERVA a instância e suas configurações
 * (webhook, nome, tom de voz) — é o que permite reconectar depois sem
 * refazer nada. Apagar a instância seria destrutivo e desnecessário.
 */
export async function desconectarInstancia(
  instanceName: string,
): Promise<{ ok: boolean; detalhe?: string }> {
  const config = configDoProvedor();
  if (!config) return { ok: false, detalhe: "Provedor de WhatsApp não configurado neste ambiente." };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(
      `${config.baseUrl}/instance/logout/${encodeURIComponent(instanceName)}`,
      { method: "DELETE", headers: { apikey: config.apiKey }, signal: controller.signal },
    );

    clearTimeout(timeoutId);

    // 404 = a instância já não tem sessão ativa; o desfecho desejado já é o
    // atual, então tratar como erro só assustaria o corretor à toa.
    if (!res.ok && res.status !== 404) {
      const corpo = await res.text().catch(() => "");
      return { ok: false, detalhe: `HTTP ${res.status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, detalhe: err instanceof Error ? err.message : String(err) };
  }
}

export type EstadoConexaoProvedor =
  | { ok: true; conectado: boolean; estado: string; telefone: string | null }
  | { ok: false; detalhe: string };

/**
 * Pergunta ao provedor se a instância está de fato pareada AGORA.
 *
 * Existe porque o pareamento termina fora do nosso alcance: o corretor
 * aponta o celular para o QR e quem descobre isso é a Evolution, não nós.
 * Sem uma consulta ativa, o banco fica eternamente em "conectando" — e foi
 * exatamente o que aconteceu em produção: a instância pareada de verdade
 * seguia marcada como não conectada, e por causa disso `conectado_em`
 * nunca era preenchido e NENHUM disparo de campanha era autorizado.
 *
 * O webhook `connection.update` também atualiza esse estado, mas ele só
 * chega uma vez, no instante da troca. Quem entra depois (um deploy novo,
 * um evento perdido, a instância pareada antes deste código existir)
 * precisa de alguém que pergunte — é esta função.
 */
export async function consultarEstadoConexao(instanceName: string): Promise<EstadoConexaoProvedor> {
  const config = configDoProvedor();
  if (!config) return { ok: false, detalhe: "Provedor de WhatsApp não configurado neste ambiente." };
  if (!instanceName) return { ok: false, detalhe: "Instância sem nome." };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(
      `${config.baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { method: "GET", headers: { apikey: config.apiKey }, signal: controller.signal },
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return { ok: false, detalhe: `HTTP ${res.status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}` };
    }

    const json = await res.json().catch(() => ({}));
    const estado: string = json?.instance?.state || json?.state || "desconhecido";
    const telefoneBruto: string =
      json?.instance?.owner || json?.instance?.wuid || json?.owner || "";

    return {
      ok: true,
      // "open" é o único estado da Evolution que significa "pode enviar".
      // "connecting" e "close" não — tratar qualquer um dos dois como
      // conectado faria a fila tentar despachar contra um número morto e
      // queimar o disjuntor de falhas seguidas à toa.
      conectado: estado === "open",
      estado,
      telefone: telefoneBruto ? telefoneBruto.replace(/\D/g, "") || null : null,
    };
  } catch (err) {
    return { ok: false, detalhe: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Mostra "digitando..." no WhatsApp do cliente por `duracaoMs`.
 *
 * Silenciosa de propósito: é um detalhe cosmético entre balões de uma
 * mesma resposta, não uma etapa que pode travar o envio. Se o provedor
 * não responder ou não estiver configurado, a conversa segue sem o
 * indicador — melhor que atrasar ou falhar a mensagem por causa disto.
 */
export async function enviarPresencaDigitando(params: {
  instanceName: string;
  telefone: string;
  duracaoMs: number;
}): Promise<void> {
  const config = configDoProvedor();
  if (!config) return;

  const numero = params.telefone.replace(/\D/g, "");
  if (!numero || !params.instanceName) return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    await fetch(`${config.baseUrl}/chat/sendPresence/${encodeURIComponent(params.instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      signal: controller.signal,
      body: JSON.stringify({ number: numero, presence: "composing", delay: params.duracaoMs }),
    });

    clearTimeout(timeoutId);
  } catch {
    // Ver comentário acima: falha aqui nunca deve interromper o envio real.
  }
}

export type TipoMidiaWhatsapp = "foto" | "planta" | "video" | "tour360";

/** A Evolution API só entende três tipos de mídia nativa; o resto vira documento. */
function tipoMidiaDoProvedor(tipo: TipoMidiaWhatsapp): "image" | "video" | "document" {
  if (tipo === "foto" || tipo === "planta") return "image";
  if (tipo === "video") return "video";
  return "document";
}

/**
 * Envia foto, planta, vídeo ou PDF de tour como mídia nativa do WhatsApp —
 * não como link de texto. É o que o cliente espera ao pedir "manda uma
 * foto": um anexo que abre na hora, não um endereço para copiar e colar.
 *
 * SEM LEGENDA, de propósito. O que ia no `caption` era o `alt` da foto no
 * site — texto de acessibilidade e SEO, escrito para leitor de tela: o
 * cliente recebia "Living integrado com adega climatizada e sala de
 * jantar, unidade 03" embaixo da imagem. Corretor nenhum escreve assim, e
 * a régua da casa é mensagem curta. O contexto já vai no balão de texto
 * ANTES do anexo; a foto fala por si. O parâmetro deixou de existir em
 * vez de só não ser passado: legenda de novo tem de ser decisão
 * consciente, não descuido de chamador.
 */
export async function enviarMidiaWhatsapp(params: {
  instanceName: string;
  telefone: string;
  tipo: TipoMidiaWhatsapp;
  url: string;
}): Promise<ResultadoEnvio> {
  const { instanceName, telefone, tipo, url } = params;

  const numero = telefone.replace(/\D/g, "");
  if (!numero || !url.trim() || !instanceName) {
    return { enviado: false, motivo: "dados_invalidos" };
  }

  const config = configDoProvedor();
  if (!config) {
    return {
      enviado: false,
      motivo: "provedor_nao_configurado",
      detalhe: "Defina WHATSAPP_API_URL e WHATSAPP_API_KEY para ativar o envio.",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${config.baseUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        number: numero,
        mediatype: tipoMidiaDoProvedor(tipo),
        media: url,
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return {
        enviado: false,
        motivo: "erro_provedor",
        detalhe: `HTTP ${res.status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}`,
      };
    }

    return { enviado: true };
  } catch (err) {
    return {
      enviado: false,
      motivo: "erro_provedor",
      detalhe: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function enviarMensagemWhatsapp(params: {
  /** Instância do corretor no provedor — é dela que a mensagem sai. */
  instanceName: string;
  telefone: string;
  texto: string;
}): Promise<ResultadoEnvio> {
  const { instanceName, telefone, texto } = params;

  const numero = telefone.replace(/\D/g, "");
  if (!numero || !texto.trim() || !instanceName) {
    return { enviado: false, motivo: "dados_invalidos" };
  }

  const config = configDoProvedor();
  if (!config) {
    // Silêncio honesto: sem credenciais não há envio, e dizer o contrário
    // faria o sistema inteiro operar sobre uma mentira.
    return {
      enviado: false,
      motivo: "provedor_nao_configurado",
      detalhe: "Defina WHATSAPP_API_URL e WHATSAPP_API_KEY para ativar o envio.",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${config.baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      signal: controller.signal,
      body: JSON.stringify({ number: numero, text: texto }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return {
        enviado: false,
        motivo: "erro_provedor",
        detalhe: `HTTP ${res.status}${corpo ? `: ${corpo.slice(0, 200)}` : ""}`,
      };
    }

    return { enviado: true };
  } catch (err) {
    return {
      enviado: false,
      motivo: "erro_provedor",
      detalhe: err instanceof Error ? err.message : String(err),
    };
  }
}
