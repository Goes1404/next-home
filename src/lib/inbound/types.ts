export type PortalOrigem =
  | "zap_imoveis"
  | "vivareal"
  | "olx"
  | "imovelweb"
  // 29/10/2026: lead do webhook do Canal Pro (ZAP, Viva Real e OLX numa URL
  // só). O payload do Grupo OLX não diz de qual dos três portais veio.
  | "grupo_olx"
  | "meta_ads"
  | "site_direto"
  | "email_outro";

export interface EmailInboundInput {
  from?: string;
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  messageId?: string;
}

export interface LeadExtraido {
  nome: string;
  telefone: string; // Formato E.164 ou numérico limpo (ex: 5511999998888)
  email?: string | null;
  imovelInteresse?: string | null;
  codigoReferencia?: string | null;
  portalOrigem: PortalOrigem;
  mensagemOriginal?: string | null;
  valorMencionado?: number | null;
  corretorMencionado?: string | null;
}
