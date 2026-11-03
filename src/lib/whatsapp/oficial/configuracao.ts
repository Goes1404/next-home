import "server-only";

/**
 * A configuração da API oficial da Meta (WhatsApp Cloud API), lida do
 * ambiente. Um lugar só, para o painel poder dizer exatamente o que falta
 * ("falta o segredo do app") em vez de a lista simplesmente não sair.
 *
 * Variáveis (ver docs/WHATSAPP-OFICIAL-ATIVAR.md):
 *   - WHATSAPP_OFICIAL_TOKEN          token do usuário do sistema (piloto da
 *                                     Next Home; cliente da F5 tem o próprio,
 *                                     cifrado no banco);
 *   - WHATSAPP_OFICIAL_APP_SECRET     segredo do app (assinatura do webhook;
 *                                     cai no META_APP_SECRET se faltar);
 *   - WHATSAPP_OFICIAL_VERIFY_TOKEN   o "verify token" do webhook;
 *   - WHATSAPP_OFICIAL_APP_ID         id do app (upload da foto do modelo e
 *                                     Embedded Signup; cai no
 *                                     NEXT_PUBLIC_META_APP_ID);
 *   - WHATSAPP_OFICIAL_CHAVE_CIFRA    32 bytes em base64 (token por cliente);
 *   - WHATSAPP_OFICIAL_GRAPH_VERSION  versão da Graph API (padrão abaixo).
 */

/**
 * A versão da Graph API (03/11/2026: a v26.0 é a mais nova; a v20.0 saiu do
 * ar em 24/09/2026 e a v21.0 sai em 21/01/2027). Fixa em código: mudar de
 * versão muda formato de resposta, e isso pede um commit, não um clique.
 */
export const VERSAO_GRAPH_PADRAO = "v26.0";

export function versaoGraph(): string {
  const v = process.env.WHATSAPP_OFICIAL_GRAPH_VERSION?.trim();
  return v && /^v\d+\.\d+$/.test(v) ? v : VERSAO_GRAPH_PADRAO;
}

export function tokenDoPiloto(): string | null {
  return process.env.WHATSAPP_OFICIAL_TOKEN?.trim() || null;
}

export function segredoDoApp(): string | null {
  return process.env.WHATSAPP_OFICIAL_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || null;
}

export function tokenDeVerificacao(): string | null {
  return process.env.WHATSAPP_OFICIAL_VERIFY_TOKEN?.trim() || null;
}

export function idDoApp(): string | null {
  return process.env.WHATSAPP_OFICIAL_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim() || null;
}

export function chaveDeCifra(): string | null {
  return process.env.WHATSAPP_OFICIAL_CHAVE_CIFRA?.trim() || null;
}

/** O que falta para o webhook e o envio funcionarem, em frase de gente. */
export function pendenciasDaConfiguracao(): string[] {
  const faltam: string[] = [];
  if (!segredoDoApp()) faltam.push("o segredo do app da Meta (WHATSAPP_OFICIAL_APP_SECRET)");
  if (!tokenDeVerificacao()) faltam.push("o token de verificação do webhook (WHATSAPP_OFICIAL_VERIFY_TOKEN)");
  return faltam;
}
