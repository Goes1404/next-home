import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { paraEncerrar, resumoDoDia } from "@/lib/prospeccao/avisos";
import { notificarEquipeDaProspeccao } from "@/lib/notificacoes/push";

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
 * A rotina da manhã da prospecção (04/11/2026), cron da Vercel em dia útil:
 *
 * 1. encerra como "perdido" quem não respondeu 4 dias depois do follow-up
 *    (a régua da 0256), para o funil não acumular loja morta;
 * 2. manda o plano do dia no celular da equipe (Eduardo e Matheus):
 *    quem respondeu, quem abriu a amostra, follow-ups e lojas novas.
 *
 * As lojas novas chegam antes, pela captação diária (tarefa agendada que
 * pesquisa e grava em `prospeccao_leads` com etapa "novo").
 */
export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("prospeccao_leads")
      .select("id, nome, etapa, nao_contatar, enviado_em, followup_em, visitas, ultima_visita_em, updated_at")
      .in("etapa", ["novo", "aprovado", "enviado", "respondeu"])
      .limit(1000);
    if (error) throw new Error(error.message);
    const agora = new Date();
    const linhas = data ?? [];

    const encerrar = paraEncerrar(linhas, agora);
    if (encerrar.length) {
      const { error: e } = await supabase
        .from("prospeccao_leads")
        .update({ etapa: "perdido", motivo_perda: "Sem resposta à abordagem e ao follow-up (encerrado automaticamente)" })
        .in(
          "id",
          encerrar.map((l) => l.id),
        )
        .eq("etapa", "enviado");
      if (e) console.error("[cron prospecção] não encerrou as lojas sem resposta:", e.message);
    }

    const fechadas = new Set(encerrar.map((l) => l.id));
    const aviso = resumoDoDia(
      linhas.filter((l) => !fechadas.has(l.id)),
      agora,
    );
    const aparelhos = aviso ? await notificarEquipeDaProspeccao(supabase, aviso) : 0;
    return NextResponse.json({ ok: true, encerradas: encerrar.length, resumo: aviso?.corpo ?? null, aparelhos });
  } catch (error) {
    console.error("[cron prospecção] falhou", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
