import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processarFilaCampanhas } from "@/lib/whatsapp/campaignDispatcher";

export const runtime = "nodejs";
// Envia mensagens reais de verdade (I/O de rede sequencial); o teto padrão
// de 10s de uma função Hobby estouraria no meio de um lote pequeno.
export const maxDuration = 60;

/** Comparação em tempo constante — evita descobrir o segredo por medição. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Chamado pelo cron do Vercel (ver `vercel.json`), que assina a requisição
 * com `Authorization: Bearer $CRON_SECRET` sozinho quando essa variável de
 * ambiente existe no projeto — não precisa configurar nada além dela.
 *
 * Falha fechada, mesmo padrão do webhook de mensagens: sem segredo
 * configurado, recusa em produção; em desenvolvimento local deixa passar
 * para dar para testar o disparo sem precisar simular o cron.
 */
function requisicaoAutenticada(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;

  if (!segredo) {
    if (process.env.NODE_ENV === "production") {
      console.error("Cron de campanhas recusado: CRON_SECRET não configurado em produção.");
      return false;
    }
    return true;
  }

  const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(recebido) && segredoConfere(recebido, segredo);
}

export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const resultado = await processarFilaCampanhas();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("Erro ao processar a fila de campanhas:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
