import { after, NextResponse } from "next/server";
import { assinaturaValida } from "@/lib/metaWebhookSignature";
import { createServiceClient } from "@/lib/supabase/service";
import { segredoDoApp, tokenDeVerificacao } from "@/lib/whatsapp/oficial/configuracao";
import { guardarEventosCrus, processarEventos, resolvedorComCache } from "@/lib/whatsapp/oficial/processarWebhook";
import { lerWebhook } from "@/lib/whatsapp/oficial/webhook";

/**
 * Webhook da API oficial da Meta (WhatsApp Cloud API), 0257.
 *
 * Separado do webhook da Evolution (`/api/webhooks/whatsapp`) de propósito:
 * os dois formatos não têm nada em comum, e o da Evolution nunca soube ler o
 * da Meta (só respondia o desafio do GET). Também separado do de Lead Ads
 * (`/api/webhooks/meta`), que é de outro produto da Meta.
 *
 * Falha fechada: sem o segredo do app configurado, recusa tudo. Uma URL de
 * webhook aceitando POST sem assinatura deixaria qualquer um inventar
 * resposta de cliente, entrega de mensagem e modelo aprovado.
 */

export const runtime = "nodejs";
// A resposta da IA roda no `after`, dentro deste prazo (ver o webhook da
// Evolution: o mesmo teto do plano).
export const maxDuration = 60;

/** GET: o desafio que a Meta manda ao salvar a URL do webhook. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const esperado = tokenDeVerificacao();
  if (
    esperado &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === esperado &&
    url.searchParams.get("hub.challenge")
  ) {
    return new NextResponse(url.searchParams.get("hub.challenge"), { status: 200 });
  }
  return new NextResponse("Verificação inválida.", { status: 403 });
}

export async function POST(req: Request) {
  const segredo = segredoDoApp();
  if (!segredo) {
    console.error("[oficial] webhook recusado: falta WHATSAPP_OFICIAL_APP_SECRET (ou META_APP_SECRET).");
    return NextResponse.json({ erro: "Webhook não configurado." }, { status: 503 });
  }

  const corpoBruto = await req.text();
  if (!assinaturaValida(corpoBruto, req.headers.get("x-hub-signature-256"), segredo)) {
    return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoBruto);
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const { eventos, campos } = lerWebhook(corpo);
  if (campos.length === 0) return NextResponse.json({ ok: true, eventos: 0 });

  const supabase = createServiceClient();
  const numeros = resolvedorComCache(supabase);
  const idsCrus = await guardarEventosCrus(supabase, campos, numeros);

  // A Meta reenvia o que demora a responder; a IA leva segundos. O 200 sai
  // já, e o trabalho segue depois da resposta.
  after(() => processarEventos(supabase, eventos, numeros, idsCrus));

  return NextResponse.json({ ok: true, eventos: eventos.length });
}
