/**
 * O webhook da API oficial, lido em eventos. Puro: não toca no banco nem na
 * rede, para a forma de cada payload ser testada sem a Meta.
 *
 * Formato (documentação da Meta, conferida em 03/11/2026): `entry[]` com o
 * id da conta (WABA) e `changes[]` com `field` e `value`. Os campos que
 * interessam:
 *   - `messages`: mensagens recebidas (`value.messages`), status das que
 *     enviamos (`value.statuses`, com `errors` e `pricing`) e, em algumas
 *     contas, preferências de marketing (`value.user_preferences`);
 *   - `message_template_status_update`: aprovação/reprovação/pausa de modelo;
 *   - `message_template_quality_update`: qualidade do modelo;
 *   - `phone_number_quality_update`: qualidade e limite do número;
 *   - `account_update`: conta restrita, desativada etc.;
 *   - `user_preferences`: a pessoa parou ou voltou a aceitar marketing.
 *
 * Campo desconhecido não quebra nada: vira evento `ignorado` e o payload cru
 * fica guardado para quem for olhar.
 */

export type TipoDeMensagemRecebida = "texto" | "botao" | "imagem" | "audio" | "video" | "documento" | "outro";

export type EventoOficial =
  | {
      tipo: "mensagem";
      phoneNumberId: string;
      wamid: string;
      de: string;
      nome: string | null;
      quando: Date;
      tipoDaMensagem: TipoDeMensagemRecebida;
      /** O texto, a legenda, o rótulo do botão ou uma descrição ("[foto]"). */
      conteudo: string;
      /** Botão de modelo tocado: o `payload` posto no envio. */
      payloadDoBotao: string | null;
      /** A mensagem nossa a que esta responde (botão de modelo traz). */
      respondeA: string | null;
    }
  | {
      tipo: "status";
      phoneNumberId: string;
      wamid: string;
      status: "sent" | "delivered" | "read" | "failed";
      para: string;
      quando: Date;
      erro: { codigo: number | null; titulo: string | null; detalhe: string | null } | null;
      cobranca: { categoria: string | null; cobrada: boolean | null; tipo: string | null } | null;
    }
  | {
      tipo: "modelo";
      wabaId: string;
      metaId: string | null;
      nome: string | null;
      idioma: string | null;
      evento: string;
      motivo: string | null;
    }
  | {
      tipo: "qualidade_do_modelo";
      wabaId: string;
      metaId: string | null;
      nome: string | null;
      qualidade: string | null;
    }
  | {
      tipo: "qualidade_do_numero";
      wabaId: string;
      numero: string | null;
      evento: string | null;
      limite: string | null;
    }
  | {
      tipo: "preferencia";
      phoneNumberId: string | null;
      wabaId: string;
      de: string;
      valor: "stop" | "resume";
    }
  | {
      tipo: "conta";
      wabaId: string;
      evento: string | null;
      detalhe: string | null;
    };

/** Um `change` cru, para guardar em `whatsapp_oficial_eventos`. */
export type CampoCru = {
  campo: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  valor: unknown;
};

type Obj = Record<string, unknown>;

const ehObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function quandoDe(v: unknown): Date {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

export function lerWebhook(corpo: unknown): { eventos: EventoOficial[]; campos: CampoCru[] } {
  const eventos: EventoOficial[] = [];
  const campos: CampoCru[] = [];
  if (!ehObj(corpo)) return { eventos, campos };

  for (const entrada of lista(corpo.entry)) {
    if (!ehObj(entrada)) continue;
    const wabaId = texto(entrada.id) ?? "";
    for (const mudanca of lista(entrada.changes)) {
      if (!ehObj(mudanca)) continue;
      const campo = texto(mudanca.field) ?? "";
      const valor = mudanca.value;
      const metadata = ehObj(valor) && ehObj(valor.metadata) ? valor.metadata : null;
      const phoneNumberId = metadata ? texto(metadata.phone_number_id) : null;
      campos.push({ campo, wabaId: wabaId || null, phoneNumberId, valor });
      if (!ehObj(valor)) continue;

      if (campo === "messages") {
        eventos.push(...mensagensDe(valor, phoneNumberId));
        eventos.push(...statusDe(valor, phoneNumberId));
        eventos.push(...preferenciasDe(valor, phoneNumberId, wabaId));
      } else if (campo === "user_preferences") {
        eventos.push(...preferenciasDe(valor, phoneNumberId, wabaId));
      } else if (campo === "message_template_status_update") {
        eventos.push({
          tipo: "modelo",
          wabaId,
          metaId: texto(valor.message_template_id) ?? (typeof valor.message_template_id === "number" ? String(valor.message_template_id) : null),
          nome: texto(valor.message_template_name),
          idioma: texto(valor.message_template_language),
          evento: texto(valor.event) ?? "",
          motivo: texto(valor.reason) && valor.reason !== "NONE" ? texto(valor.reason) : null,
        });
      } else if (campo === "message_template_quality_update") {
        eventos.push({
          tipo: "qualidade_do_modelo",
          wabaId,
          metaId: texto(valor.message_template_id) ?? (typeof valor.message_template_id === "number" ? String(valor.message_template_id) : null),
          nome: texto(valor.message_template_name),
          qualidade: texto(valor.new_quality_score),
        });
      } else if (campo === "phone_number_quality_update") {
        eventos.push({
          tipo: "qualidade_do_numero",
          wabaId,
          numero: texto(valor.display_phone_number),
          evento: texto(valor.event),
          limite: texto(valor.current_limit) ?? texto(valor.messaging_limit_tier),
        });
      } else if (campo === "account_update") {
        const ban = ehObj(valor.ban_info) ? valor.ban_info : null;
        eventos.push({
          tipo: "conta",
          wabaId,
          evento: texto(valor.event),
          detalhe: ban ? (texto(ban.waba_ban_state) ?? texto(ban.waba_ban_date)) : texto(valor.restriction_info),
        });
      }
    }
  }
  return { eventos, campos };
}

function mensagensDe(valor: Obj, phoneNumberId: string | null): EventoOficial[] {
  if (!phoneNumberId) return [];
  const nomes = new Map<string, string>();
  for (const c of lista(valor.contacts)) {
    if (!ehObj(c)) continue;
    const waId = texto(c.wa_id);
    const nome = ehObj(c.profile) ? texto(c.profile.name) : null;
    if (waId && nome) nomes.set(waId, nome);
  }
  const saida: EventoOficial[] = [];
  for (const m of lista(valor.messages)) {
    if (!ehObj(m)) continue;
    const wamid = texto(m.id);
    const de = texto(m.from);
    if (!wamid || !de) continue;
    const { tipoDaMensagem, conteudo, payloadDoBotao } = conteudoDe(m);
    saida.push({
      tipo: "mensagem",
      phoneNumberId,
      wamid,
      de,
      nome: nomes.get(de) ?? null,
      quando: quandoDe(m.timestamp),
      tipoDaMensagem,
      conteudo,
      payloadDoBotao,
      respondeA: ehObj(m.context) ? texto(m.context.id) : null,
    });
  }
  return saida;
}

function conteudoDe(m: Obj): { tipoDaMensagem: TipoDeMensagemRecebida; conteudo: string; payloadDoBotao: string | null } {
  const tipo = texto(m.type) ?? "";
  const sub = ehObj(m[tipo]) ? (m[tipo] as Obj) : {};
  switch (tipo) {
    case "text":
      return { tipoDaMensagem: "texto", conteudo: texto(sub.body) ?? "", payloadDoBotao: null };
    case "button":
      // Botão de resposta rápida de MODELO: `text` é o rótulo, `payload` o
      // que o envio pôs nele.
      return { tipoDaMensagem: "botao", conteudo: texto(sub.text) ?? "", payloadDoBotao: texto(sub.payload) };
    case "interactive": {
      const resposta = ehObj(sub.button_reply) ? sub.button_reply : ehObj(sub.list_reply) ? sub.list_reply : null;
      return {
        tipoDaMensagem: "botao",
        conteudo: resposta ? (texto(resposta.title) ?? "") : "",
        payloadDoBotao: resposta ? texto(resposta.id) : null,
      };
    }
    case "image":
      return { tipoDaMensagem: "imagem", conteudo: texto(sub.caption) ?? "[foto]", payloadDoBotao: null };
    case "audio":
      return { tipoDaMensagem: "audio", conteudo: "[áudio]", payloadDoBotao: null };
    case "video":
      return { tipoDaMensagem: "video", conteudo: texto(sub.caption) ?? "[vídeo]", payloadDoBotao: null };
    case "document":
      return {
        tipoDaMensagem: "documento",
        conteudo: texto(sub.caption) ?? `[documento${texto(sub.filename) ? `: ${texto(sub.filename)}` : ""}]`,
        payloadDoBotao: null,
      };
    case "reaction":
      return { tipoDaMensagem: "outro", conteudo: texto(sub.emoji) ? `[reagiu ${texto(sub.emoji)}]` : "[reação]", payloadDoBotao: null };
    default:
      return { tipoDaMensagem: "outro", conteudo: tipo ? `[${tipo}]` : "[mensagem]", payloadDoBotao: null };
  }
}

function statusDe(valor: Obj, phoneNumberId: string | null): EventoOficial[] {
  if (!phoneNumberId) return [];
  const saida: EventoOficial[] = [];
  for (const s of lista(valor.statuses)) {
    if (!ehObj(s)) continue;
    const wamid = texto(s.id);
    const status = texto(s.status);
    if (!wamid || !status || !["sent", "delivered", "read", "failed"].includes(status)) continue;
    const primeiroErro = lista(s.errors).find(ehObj) as Obj | undefined;
    const pricing = ehObj(s.pricing) ? s.pricing : null;
    saida.push({
      tipo: "status",
      phoneNumberId,
      wamid,
      status: status as "sent" | "delivered" | "read" | "failed",
      para: texto(s.recipient_id) ?? "",
      quando: quandoDe(s.timestamp),
      erro: primeiroErro
        ? {
            codigo: typeof primeiroErro.code === "number" ? primeiroErro.code : null,
            titulo: texto(primeiroErro.title) ?? texto(primeiroErro.message),
            detalhe: ehObj(primeiroErro.error_data) ? texto(primeiroErro.error_data.details) : null,
          }
        : null,
      cobranca: pricing
        ? {
            categoria: texto(pricing.category),
            cobrada: typeof pricing.billable === "boolean" ? pricing.billable : null,
            tipo: texto(pricing.type),
          }
        : null,
    });
  }
  return saida;
}

function preferenciasDe(valor: Obj, phoneNumberId: string | null, wabaId: string): EventoOficial[] {
  const saida: EventoOficial[] = [];
  for (const p of lista(valor.user_preferences)) {
    if (!ehObj(p)) continue;
    const de = texto(p.wa_id);
    const v = (texto(p.value) ?? "").toLowerCase();
    const categoria = (texto(p.category) ?? "").toLowerCase();
    if (!de || (v !== "stop" && v !== "resume")) continue;
    if (categoria && !categoria.includes("marketing")) continue;
    saida.push({ tipo: "preferencia", phoneNumberId, wabaId, de, valor: v });
  }
  return saida;
}
