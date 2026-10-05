import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { limparArtesExpiradas } from "@/lib/imagens/limpeza";
import { limparMensagensBarradasAntigas } from "@/lib/whatsapp/repositorio";

export const runtime = "nodejs";
export const maxDuration = 30;

function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requisicaoAutenticada(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return process.env.NODE_ENV !== "production";
  const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return recebido.length > 0 && segredoConfere(recebido, segredo);
}

/** Limpeza diária: a execução acontece entre 48 e 72 horas após a criação. */
export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    const artes = await limparArtesExpiradas();
    // Carona na limpeza diária: a contagem do porteiro (0159) guarda 90 dias.
    let mensagensBarradas: number | null = null;
    try {
      mensagensBarradas = await limparMensagensBarradasAntigas();
    } catch (error) {
      console.error("[cron] limpeza das mensagens barradas falhou", error);
    }
    return NextResponse.json({ ok: true, ...artes, mensagensBarradas });
  } catch (error) {
    console.error("[cron] limpeza de artes de IA falhou", error);
    return NextResponse.json({ ok: false, erro: "Falha ao limpar artes expiradas." }, { status: 500 });
  }
}
