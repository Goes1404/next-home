import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apagarGruposCanceladosVencidos, type ResultadoDaRotina } from "@/lib/grupos/encerramento";
import { limparArtesExpiradas } from "@/lib/imagens/limpeza";
import { limparMensagensBarradasAntigas } from "@/lib/whatsapp/repositorio";
import { limparRegistroDoCentral } from "@/lib/central/retencao";

export const runtime = "nodejs";
export const maxDuration = 60;

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

/**
 * Limpeza diária: a execução acontece entre 48 e 72 horas após a criação.
 * Teto de 60 s (o máximo do Hobby): a rotina dos grupos cancelados gera uma
 * planilha e apaga um grupo por execução.
 */
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
    // Carona: o texto dos comandos do central e as tentativas de número
    // desconhecido guardam 30 dias (0248).
    let registroDoCentral: { textos: number; tentativas: number } | null = null;
    try {
      registroDoCentral = await limparRegistroDoCentral();
    } catch (error) {
      console.error("[cron] limpeza do registro do central falhou", error);
    }
    // Carona no mesmo tique: a rotina dos 90 dias dos grupos cancelados
    // (0202). Desligada sem APAGAR_GRUPOS_CANCELADOS=1; falha nela não
    // derruba a limpeza das artes.
    let gruposCancelados: ResultadoDaRotina | { erro: string };
    try {
      gruposCancelados = await apagarGruposCanceladosVencidos();
    } catch (error) {
      console.error("[cron] rotina dos grupos cancelados falhou", error);
      gruposCancelados = { erro: "falhou" };
    }
    return NextResponse.json({ ok: true, ...artes, mensagensBarradas, registroDoCentral, gruposCancelados });
  } catch (error) {
    console.error("[cron] limpeza de artes de IA falhou", error);
    return NextResponse.json({ ok: false, erro: "Falha ao limpar artes expiradas." }, { status: 500 });
  }
}
