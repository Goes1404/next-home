import type { EmailInboundInput } from "./types";

/**
 * Leitura do Gmail do corretor (26/09/2026): a porta de entrada dos portais
 * sem serviço de recebimento no meio. O corretor autoriza uma vez (OAuth,
 * escopo SÓ de leitura) e o tique dos follow-ups busca os e-mails dos
 * portais e passa pelo MESMO processamento do webhook.
 *
 * Esta parte é pura (montar URLs, decodificar mensagem). A rede mora em
 * `gmailCaixa.ts`.
 */

export const ESCOPOS_GMAIL = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"];

/** Remetentes dos portais. Só e-mail deles é lido — nada da caixa pessoal. */
export const BUSCA_DE_PORTAIS =
  "from:(zapimoveis.com.br OR grupozap.com OR vivareal.com.br OR olx.com.br OR imovelweb.com.br OR chavesnamao.com.br OR quintoandar.com.br OR facebookmail.com)";

export function urlDeAutorizacao(p: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: ESCOPOS_GMAIL.join(" "),
    access_type: "offline",
    // Sem `consent`, a segunda autorização não devolve refresh token.
    prompt: "consent",
    include_granted_scopes: "true",
    state: p.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

/** A busca da vez: portais, depois do último e-mail lido (segundos Unix). */
export function buscaDesde(desde: Date): string {
  return `${BUSCA_DE_PORTAIS} after:${Math.floor(desde.getTime() / 1000)}`;
}

/** O e-mail do id_token do Google. A assinatura não é conferida: o token veio direto do Google, por TLS, na troca do código. */
export function emailDoIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const carga = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: unknown };
    return typeof carga.email === "string" ? carga.email : null;
  } catch {
    return null;
  }
}

type Parte = { mimeType?: string; body?: { data?: string }; parts?: Parte[] };
export type MensagemGmail = {
  id: string;
  payload?: Parte & { headers?: { name: string; value: string }[] };
};

function decodificar(data: string | undefined): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function coletar(parte: Parte | undefined, tipo: string): string {
  if (!parte) return "";
  if (parte.mimeType === tipo && parte.body?.data) return decodificar(parte.body.data);
  return (parte.parts ?? []).map((p) => coletar(p, tipo)).filter(Boolean).join("\n");
}

/** Converte a mensagem do Gmail no formato que o processamento do webhook lê. */
export function mensagemParaEmail(m: MensagemGmail): EmailInboundInput {
  const cabecalho = (nome: string) =>
    m.payload?.headers?.find((h) => h.name.toLowerCase() === nome.toLowerCase())?.value ?? "";
  return {
    from: cabecalho("From"),
    to: cabecalho("To"),
    subject: cabecalho("Subject"),
    text: coletar(m.payload, "text/plain"),
    html: coletar(m.payload, "text/html"),
    // O id do Gmail é estável por caixa; o prefixo evita colidir com o
    // Message-ID do webhook.
    messageId: `gmail:${m.id}`,
  };
}
