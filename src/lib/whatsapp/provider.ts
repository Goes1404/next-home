import "server-only";

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

export type ResultadoQrCode =
  | { ok: true; qrcodeBase64: string | null; jaConectado: boolean }
  | { ok: false; motivo: "provedor_nao_configurado" | "erro_provedor"; detalhe?: string };

/**
 * Pede ao provedor o QR Code de pareamento da instância.
 *
 * Sem credenciais não existe QR nenhum para mostrar — devolver uma imagem
 * decorativa faria o corretor apontar o celular para um código que não
 * conecta em lugar nenhum.
 */
export async function obterQrCodeInstancia(instanceName: string): Promise<ResultadoQrCode> {
  const config = configDoProvedor();
  if (!config) {
    return {
      ok: false,
      motivo: "provedor_nao_configurado",
      detalhe: "Defina WHATSAPP_API_URL e WHATSAPP_API_KEY para conectar um número.",
    };
  }

  // Na primeira conexão do corretor a instância ainda não existe na
  // Evolution — `/instance/connect` sozinho devolveria 404. Criar é
  // idempotente na prática: se já existe, o provedor recusa e seguimos
  // direto para o connect.
  await garantirInstancia(config, instanceName);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${config.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
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
    const jaConectado = json?.instance?.state === "open" || json?.state === "open";

    return { ok: true, qrcodeBase64: base64, jaConectado };
  } catch (err) {
    return {
      ok: false,
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
