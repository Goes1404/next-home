import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 30;

function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function autenticada(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return process.env.NODE_ENV !== "production";
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return Boolean(recebido) && segredoConfere(recebido, esperado);
}

export async function GET(req: NextRequest) {
  if (!autenticada(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("processar_outbox_analytics_interno", { p_limite: 500 });
  if (error) {
    console.error("[event-outbox] falha ao processar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao processar a outbox." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, processados: data });
}
