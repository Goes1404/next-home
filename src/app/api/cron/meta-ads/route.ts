import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { metaAdsConfigurado, sincronizarMetaAds } from "@/lib/metaAds";

export const runtime = "nodejs";
// Uma chamada à Graph API + um upsert: cabe com folga, mas a Meta às vezes
// demora — o timeout interno é de 20s e o padrão de 10s da função cortaria
// a sincronização no meio.
export const maxDuration = 30;

/** Comparação em tempo constante — mesmo padrão do cron de campanhas. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requisicaoAutenticada(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET || null;
  if (!segredo) {
    if (process.env.NODE_ENV === "production") {
      console.error("Cron do Meta Ads recusado: CRON_SECRET não configurado em produção.");
      return false;
    }
    return true;
  }
  const recebido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return recebido.length > 0 && segredoConfere(recebido, segredo);
}

/**
 * Sincroniza o gasto do Meta Ads 1x/dia (vercel.json → crons; o teto do
 * plano Hobby é diário, e para gasto de anúncio diário basta).
 *
 * Sem token configurado a resposta diz isso com todas as letras — o
 * sintoma "tabela sempre vazia" já custou investigação demais neste
 * projeto quando a causa era só ambiente.
 */
export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  if (!metaAdsConfigurado()) {
    return NextResponse.json({
      ok: false,
      motivo: "nao_configurado",
      detalhe: "Defina META_ADS_ACCOUNT_ID e META_ADS_TOKEN (ver a tela Anúncios do painel).",
    });
  }

  const resultado = await sincronizarMetaAds();
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 502 });
}
