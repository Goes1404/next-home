import { NextResponse } from "next/server";
import { processarEmailDeLead } from "@/lib/inbound/processarEmail";
import type { EmailInboundInput } from "@/lib/inbound/types";

export const runtime = "nodejs";

/**
 * Ingestão automática de leads por e-mail (Zap, VivaReal, OLX, Imovelweb…).
 * Aceita um lead individual ou uma lista/tabela com dezenas no mesmo e-mail.
 *
 * Roda com a CHAVE DE SERVIÇO, não com a publicável. As policies de `leads`
 * dão select e update apenas a `authenticated`, e `inbound_logs` não tem
 * policy de insert nenhuma — com o cliente publicável a deduplicação lia
 * zero linhas sempre, o update do duplicado não acontecia e o log de
 * auditoria era recusado em silêncio. É exatamente a armadilha que
 * `lib/supabase/service.ts` descreve.
 */
export async function POST(req: Request) {
  const segredo = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

  /*
   * Falha fechada. Antes a checagem era `if (segredo && token !== segredo)`:
   * sem a variável no ambiente, o endpoint aceitava qualquer POST de
   * qualquer origem e escrevia direto no CRM.
   */
  if (!segredo) {
    console.error("[inbound] INBOUND_EMAIL_WEBHOOK_SECRET ausente — recusando a chamada.");
    return NextResponse.json({ erro: "Webhook não configurado." }, { status: 503 });
  }

  const url = new URL(req.url);
  const token =
    req.headers.get("x-webhook-token") ??
    req.headers.get("x-webhook-secret") ??
    url.searchParams.get("token");

  if (token !== segredo) {
    return NextResponse.json({ erro: "Token de autenticação inválido." }, { status: 401 });
  }

  let bodyRaw: Record<string, unknown>;
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      bodyRaw = Object.fromEntries(formData.entries());
    } else {
      bodyRaw = await req.json();
    }
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const emailInput: EmailInboundInput = {
    from: String(bodyRaw.from || bodyRaw.From || bodyRaw.sender || ""),
    to: String(bodyRaw.to || bodyRaw.To || bodyRaw.recipient || ""),
    subject: String(bodyRaw.subject || bodyRaw.Subject || ""),
    html: String(bodyRaw.html || bodyRaw.HtmlBody || bodyRaw.HTML || ""),
    text: String(bodyRaw.text || bodyRaw.TextBody || bodyRaw.plain || ""),
    messageId: String(
      bodyRaw.messageId || bodyRaw.MessageID || bodyRaw.email_id || bodyRaw["Message-Id"] || "",
    ),
  };

  const r = await processarEmailDeLead(emailInput, { bodyRaw });
  if (r.totalEncontrados === 0) {
    return NextResponse.json(
      { ok: false, mensagem: "E-mail recebido mas nenhum telefone válido foi identificado." },
      { status: 200 },
    );
  }
  return NextResponse.json(r);
}
