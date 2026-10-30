import { NextResponse } from "next/server";
import { processarEventoDoAsaas, tokenDoAsaasValido, type EventoDoAsaas } from "@/lib/cobranca/webhookDoAsaas";
import { avisarAtendimento } from "@/lib/notificacoes/avisosDaPlataforma";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Webhook do Asaas (29/10/2026, 0241): pagamentos da cobrança automática.
 *
 * Cadastro no Asaas (Integrações → Webhooks): URL
 * `https://astroimob.vercel.app/api/webhooks/asaas`, "Token de
 * autenticação" igual a `ASAAS_WEBHOOK_TOKEN`, eventos PAYMENT_RECEIVED,
 * PAYMENT_CONFIRMED e PAYMENT_OVERDUE.
 *
 * Falha fechada: sem `ASAAS_WEBHOOK_TOKEN` no ambiente, ou com o cabeçalho
 * `asaas-access-token` diferente (comparação em tempo constante), 401 sem
 * tocar no banco. Evento que não nos interessa: 200 na hora (o Asaas repete
 * o que não recebe 200 e pausa a fila depois de 15 falhas). Falha do banco
 * ao registrar um pagamento: 500, para o Asaas mandar de novo (a gravação é
 * idempotente por `asaas_pagamento_id`).
 *
 * O aviso aos administradores sai depois da resposta (`avisarAtendimento`).
 * Log sem dado pessoal: ids do Asaas e o desfecho.
 */
export async function POST(req: Request) {
  if (!tokenDoAsaasValido(req.headers.get("asaas-access-token"), process.env.ASAAS_WEBHOOK_TOKEN)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  let evento: EventoDoAsaas;
  try {
    evento = (await req.json()) as EventoDoAsaas;
  } catch {
    // Corpo torto não melhora repetindo: 200 para não travar a fila.
    console.warn("[asaas] webhook com corpo inválido; ignorado");
    return NextResponse.json({ ok: true });
  }

  const desfecho = await processarEventoDoAsaas(createServiceClient(), evento, avisarAtendimento);
  if (desfecho.resultado === "falhou") {
    console.error(`[asaas] evento ${String(evento?.id ?? "?")} não processado: ${desfecho.motivo}`);
    return NextResponse.json({ erro: "Tente de novo." }, { status: 500 });
  }
  if (desfecho.resultado === "grupo_desconhecido") {
    console.warn(`[asaas] evento ${String(evento?.id ?? "?")} sem grupo com a assinatura/cliente do pagamento; ignorado`);
  }
  return NextResponse.json({ ok: true, resultado: desfecho.resultado });
}
