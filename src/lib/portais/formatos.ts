import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";
import type { LeadExtraido, PortalOrigem } from "@/lib/inbound/types";

/**
 * Captação direta dos portais (29/10/2026): os formatos que o webhook
 * `/api/webhooks/portais/[portal]` entende. Funções puras, testadas em
 * `formatos.test.ts`.
 *
 * ## O que é CONFIRMADO e o que é suposição
 *
 * - Grupo OLX (Canal Pro: ZAP Imóveis, Viva Real e OLX): formato OFICIAL,
 *   lido em developers.grupozap.com/webhooks/integration_leads.html e
 *   /webhooks/security.html em 29/10/2026. POST JSON, um lead por chamada,
 *   `Authorization: Basic base64(<usuário>:<SECRET_KEY>)` com a chave POR
 *   CRM (não por cliente), qualquer 2xx é sucesso, fora de 2xx o portal
 *   tenta de novo (3 vezes, e guarda o lead 14 dias); `originLeadId` é o id
 *   para não gravar duas vezes. O anunciante cola a URL em Canal Pro →
 *   Integrações de anúncios → Leads → "Receber leads no CRM". Para o Grupo
 *   OLX entregar, o CRM precisa ser HOMOLOGADO (validador de recebimento +
 *   formulário; chamado.integracao@olxbr.com) — é a homologação que dá a
 *   SECRET_KEY (`GRUPO_OLX_SECRET_KEY`).
 * - Imovelweb: NÃO há formato público de webhook de leads (buscado em
 *   29/10/2026). Continua chegando pelo e-mail (`/api/webhooks/email-lead`),
 *   ou por automação (Zapier/Make) no formato genérico abaixo.
 * - Genérico: formato DESTE CRM, documentado na tela do gestor, para
 *   automações e sites próprios.
 */

/** O que o webhook sabe ler, por slug da URL. */
export type IntegracaoDePortal = "grupo_olx" | "generico";

type ConfigDoPortal = { integracao: IntegracaoDePortal; portalOrigem: PortalOrigem | null };

/**
 * Slugs aceitos na URL. `grupo-olx` é o que a tela mostra (uma URL para os
 * três portais do Canal Pro). `zap`, `vivareal` e `olx` são o MESMO formato
 * e o mesmo token, só marcando o portal no lead para quem quiser separar.
 */
export const PORTAIS_DO_WEBHOOK: Record<string, ConfigDoPortal> = {
  "grupo-olx": { integracao: "grupo_olx", portalOrigem: "grupo_olx" },
  zap: { integracao: "grupo_olx", portalOrigem: "zap_imoveis" },
  vivareal: { integracao: "grupo_olx", portalOrigem: "vivareal" },
  olx: { integracao: "grupo_olx", portalOrigem: "olx" },
  generico: { integracao: "generico", portalOrigem: null },
};

export function configDoPortal(slug: string): ConfigDoPortal | null {
  return Object.prototype.hasOwnProperty.call(PORTAIS_DO_WEBHOOK, slug) ? PORTAIS_DO_WEBHOOK[slug] : null;
}

/** O slug que a tela mostra para cada integração. */
export const SLUG_DA_INTEGRACAO: Record<IntegracaoDePortal, string> = {
  grupo_olx: "grupo-olx",
  generico: "generico",
};

// ---------------------------------------------------------------------------
// Credencial
// ---------------------------------------------------------------------------

const FORMATO_DO_TOKEN = /^[0-9a-f]{48}$/;

/** 24 bytes sorteados, em hexadecimal: o mesmo formato que o CHECK da 0245 exige. */
export function gerarTokenDoPortal(): string {
  return randomBytes(24).toString("hex");
}

export function tokenComFormato(token: string | null | undefined): token is string {
  return typeof token === "string" && FORMATO_DO_TOKEN.test(token);
}

/**
 * O token do grupo: na URL (`?token=`, que é o que cabe no campo do Canal
 * Pro) ou no cabeçalho `x-webhook-token` (automação que sabe mandar
 * cabeçalho, e o token não fica em log de acesso).
 */
export function tokenDaRequisicao(url: URL, headers: Headers): string | null {
  return headers.get("x-webhook-token")?.trim() || url.searchParams.get("token")?.trim() || null;
}

/** A chave do `Authorization: Basic base64(usuario:chave)` do Grupo OLX: a parte depois dos dois-pontos. */
export function chaveDoBasic(authorization: string | null | undefined): string | null {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(authorization ?? "");
  if (!m) return null;
  let decodificado: string;
  try {
    decodificado = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const i = decodificado.indexOf(":");
  const chave = i >= 0 ? decodificado.slice(i + 1) : decodificado;
  return chave || null;
}

/** Comparação em tempo constante (resumo dos dois lados, para tamanhos diferentes). */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * A chave do Grupo OLX, quando configurada (`GRUPO_OLX_SECRET_KEY`, dada na
 * homologação), é exigida ALÉM do token do grupo: o token diz de que grupo
 * é o lead; a chave diz que quem mandou foi o Grupo OLX. Sem a variável (antes
 * da homologação), vale só o token — falhar fechado aqui travaria o teste do
 * validador do próprio Grupo OLX.
 */
export function basicDoGrupoOlxConfere(authorization: string | null, segredo: string | undefined): boolean {
  if (!segredo) return true;
  return segredoConfere(chaveDoBasic(authorization), segredo);
}

// ---------------------------------------------------------------------------
// Payload → lead
// ---------------------------------------------------------------------------

export type LeadDoPortal = {
  lead: LeadExtraido;
  /** O id do lead no portal, para não gravar a reentrega duas vezes. */
  idExterno: string | null;
};

export type LeituraDoPortal = LeadDoPortal | { erro: string };

const texto = (v: unknown, max = 500): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const ehObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

const TIPO_DO_CONTATO: Record<string, string> = {
  CLICK_SCHEDULE: "pediu para agendar",
  CLICK_WHATSAPP: "clicou no WhatsApp",
  CONTACT_CHAT: "mandou mensagem pelo chat",
  CONTACT_FORM: "preencheu o formulário",
  PHONE_VIEW: "viu o telefone",
  VISIT_REQUEST: "pediu visita",
};

/**
 * Formato oficial do Grupo OLX (exemplo da documentação):
 *
 * ```json
 * { "leadOrigin": "Grupo OLX", "timestamp": "2017-10-23T15:50:30.619Z",
 *   "originLeadId": "59ee0fc6e4b043e1b2a6d863", "originListingId": "87027856",
 *   "clientListingId": "a40171", "name": "Nome Consumidor",
 *   "email": "nome.consumidor@email.com", "ddd": "11", "phone": "999999999",
 *   "phoneNumber": "11999999999", "message": "Olá, tenho interesse…",
 *   "temperature": "Alta", "transactionType": "SELL",
 *   "extraData": { "leadType": "CONTACT_CHAT", … } }
 * ```
 *
 * `clientListingId` é o código que o ANUNCIANTE deu ao imóvel (casa com o
 * catálogo); `originListingId` é o id do anúncio no portal. Os textos de
 * propaganda do `extraData` (`izi`, `feedback`) não entram na ficha.
 */
export function lerGrupoOlx(corpo: unknown, portalOrigem: PortalOrigem): LeituraDoPortal {
  if (!ehObjeto(corpo)) return { erro: "corpo não é um objeto JSON" };
  const telefoneBruto =
    texto(corpo.phoneNumber, 40) ?? (texto(corpo.phone, 30) ? `${texto(corpo.ddd, 4) ?? ""}${texto(corpo.phone, 30)}` : null);
  const telefone = normalizarTelefoneBrasileiro(telefoneBruto);
  if (!telefone) return { erro: "sem telefone válido" };

  const extra = ehObjeto(corpo.extraData) ? corpo.extraData : {};
  const contexto = [
    corpo.leadOrigin === "MCMV_OLX" ? "simulação do Minha Casa Minha Vida" : null,
    texto(corpo.temperature, 20) ? `interesse ${texto(corpo.temperature, 20)!.toLowerCase()}` : null,
    corpo.transactionType === "RENT" ? "aluguel" : corpo.transactionType === "SELL" ? "compra" : null,
    TIPO_DO_CONTATO[String(extra.leadType ?? "")] ?? null,
    texto(corpo.originListingId, 60) ? `anúncio ${texto(corpo.originListingId, 60)} no portal` : null,
  ].filter(Boolean);
  const mensagem = [texto(corpo.message, 2000), contexto.length ? `[Canal Pro: ${contexto.join(" · ")}]` : null]
    .filter(Boolean)
    .join("\n");

  return {
    idExterno: texto(corpo.originLeadId, 120),
    lead: {
      nome: texto(corpo.name, 120) ?? "Cliente do portal",
      telefone,
      email: texto(corpo.email, 200),
      imovelInteresse: null,
      codigoReferencia: texto(corpo.clientListingId, 120),
      portalOrigem,
      mensagemOriginal: mensagem || null,
    },
  };
}

const PORTAL_DO_GENERICO: Record<string, PortalOrigem> = {
  zap: "zap_imoveis",
  zap_imoveis: "zap_imoveis",
  zapimoveis: "zap_imoveis",
  vivareal: "vivareal",
  viva_real: "vivareal",
  olx: "olx",
  imovelweb: "imovelweb",
  grupo_olx: "grupo_olx",
  site: "site_direto",
};

/**
 * Formato genérico DESTE CRM (documentado na tela "Integração com
 * portais"), para Zapier, Make, n8n ou site próprio:
 *
 * ```json
 * { "nome": "Maria Silva", "telefone": "11 99999-9999",
 *   "email": "maria@exemplo.com", "mensagem": "Quero visitar",
 *   "codigo_imovel": "A123", "imovel": "Residencial Parque",
 *   "portal": "imovelweb", "id_externo": "lead-123" }
 * ```
 *
 * Só `telefone` é obrigatório. Os nomes em inglês (`name`, `phone`,
 * `message`, `listing_code`) também valem.
 */
export function lerGenerico(corpo: unknown): LeituraDoPortal {
  if (!ehObjeto(corpo)) return { erro: "corpo não é um objeto JSON" };
  const telefone = normalizarTelefoneBrasileiro(texto(corpo.telefone ?? corpo.phone ?? corpo.whatsapp, 40));
  if (!telefone) return { erro: "sem telefone válido" };
  const portal = (texto(corpo.portal ?? corpo.origem, 40) ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  return {
    idExterno: texto(corpo.id_externo ?? corpo.id, 120),
    lead: {
      nome: texto(corpo.nome ?? corpo.name, 120) ?? "Cliente do portal",
      telefone,
      email: texto(corpo.email, 200),
      imovelInteresse: texto(corpo.imovel ?? corpo.listing, 200),
      codigoReferencia: texto(corpo.codigo_imovel ?? corpo.listing_code, 120),
      portalOrigem: PORTAL_DO_GENERICO[portal] ?? "email_outro",
      mensagemOriginal: texto(corpo.mensagem ?? corpo.message, 2000),
    },
  };
}

/** O lead do corpo, pelo formato do slug da URL. */
export function lerLeadDoPortal(config: ConfigDoPortal, corpo: unknown): LeituraDoPortal {
  if (config.integracao === "grupo_olx") return lerGrupoOlx(corpo, config.portalOrigem ?? "grupo_olx");
  return lerGenerico(corpo);
}

/** Maior corpo aceito: um lead é pouco texto; o resto é abuso. */
export const TETO_DO_CORPO = 64 * 1024;
