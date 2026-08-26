import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Sincronização do gasto do Meta Ads (roadmap Meta Ads, F1).
 *
 * Chamada pelo cron diário (/api/cron/meta-ads) e pelo botão "Sincronizar
 * agora" da tela de Anúncios. Busca na Marketing API o gasto POR CAMPANHA
 * POR DIA dos últimos 3 dias (a Meta ajusta gasto retroativamente — só
 * ontem deixaria número velho para trás) e grava em `meta_ads_metricas`
 * por upsert. O painel lê SÓ da tabela, nunca da API.
 *
 * Precisa de duas variáveis de ambiente:
 * - META_ADS_ACCOUNT_ID: o número da conta de anúncios (só dígitos).
 * - META_ADS_TOKEN: token de System User com permissão `ads_read` — o
 *   token de página do webhook de Lead Ads NÃO lê investimento.
 * O passo a passo de como gerar os dois está NA PRÓPRIA TELA de Anúncios
 * do painel do gestor, abaixo do gráfico.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";

/** Quantos dias para trás cada sincronização re-lê. */
export const DIAS_DE_RELEITURA = 3;

export function metaAdsConfigurado(): boolean {
  return Boolean(process.env.META_ADS_ACCOUNT_ID && process.env.META_ADS_TOKEN);
}

export type LinhaInsight = {
  dia: string;
  campanhaId: string;
  campanhaNome: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  resultadosMeta: number;
};

/**
 * Ações da Meta que contam como RESULTADO para nós: lead de formulário e
 * conversa iniciada por anúncio de mensagem (o formato do link porteiro é
 * tráfego, mas campanhas CTWA nativas reportam por aqui). Cliques e
 * impressões têm coluna própria — não entram.
 */
const ACOES_QUE_CONTAM = new Set([
  "lead",
  "leadgen_grouped",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.messaging_conversation_started_7d",
]);

type InsightBruto = {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type?: string; value?: string }[];
};

/**
 * Do JSON da Graph API para as nossas linhas. Pura e exportada para teste:
 * a API devolve TUDO como string (inclusive gasto), e parse frouxo aqui
 * viraria NaN gravado no banco.
 */
export function linhasDeInsights(dados: InsightBruto[]): LinhaInsight[] {
  const linhas: LinhaInsight[] = [];
  for (const bruto of dados) {
    if (!bruto.date_start || !bruto.campaign_id) continue;
    const numero = (v: string | undefined) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const resultados = (bruto.actions ?? [])
      .filter((a) => a.action_type && ACOES_QUE_CONTAM.has(a.action_type))
      .reduce((soma, a) => soma + numero(a.value), 0);

    linhas.push({
      dia: bruto.date_start,
      campanhaId: bruto.campaign_id,
      campanhaNome: bruto.campaign_name ?? "",
      gasto: numero(bruto.spend),
      impressoes: Math.round(numero(bruto.impressions)),
      cliques: Math.round(numero(bruto.clicks)),
      resultadosMeta: Math.round(resultados),
    });
  }
  return linhas;
}

export type ResultadoSync =
  | { ok: true; linhas: number }
  | { ok: false; motivo: "nao_configurado" | "api" ; detalhe?: string };

export async function sincronizarMetaAds(): Promise<ResultadoSync> {
  const conta = process.env.META_ADS_ACCOUNT_ID?.replace(/\D/g, "");
  const token = process.env.META_ADS_TOKEN;
  if (!conta || !token) return { ok: false, motivo: "nao_configurado" };

  const ate = new Date();
  const desde = new Date(ate.getTime() - (DIAS_DE_RELEITURA - 1) * 86_400_000);
  const dia = (d: Date) => d.toISOString().slice(0, 10);

  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/act_${conta}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks,actions");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: dia(desde), until: dia(ate) }));
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", token);

  let resposta: Response;
  try {
    resposta = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return { ok: false, motivo: "api", detalhe: e instanceof Error ? e.message : "rede" };
  }

  const corpo = (await resposta.json().catch(() => null)) as
    | { data?: InsightBruto[]; error?: { message?: string } }
    | null;

  if (!resposta.ok || !corpo?.data) {
    // O texto do erro da Meta vai para quem depura, nunca para a tela do
    // gestor — ele costuma citar token e permissão, que assustam sem ajudar.
    console.error("[meta-ads] insights falhou:", resposta.status, corpo?.error?.message);
    return { ok: false, motivo: "api", detalhe: corpo?.error?.message ?? `http_${resposta.status}` };
  }

  const linhas = linhasDeInsights(corpo.data);
  if (linhas.length === 0) return { ok: true, linhas: 0 };

  const supabase = createServiceClient();
  const { error } = await supabase.from("meta_ads_metricas").upsert(
    linhas.map((l) => ({
      dia: l.dia,
      campanha_id: l.campanhaId,
      campanha_nome: l.campanhaNome,
      gasto: l.gasto,
      impressoes: l.impressoes,
      cliques: l.cliques,
      resultados_meta: l.resultadosMeta,
      atualizado_em: new Date().toISOString(),
    })),
    { onConflict: "dia,campanha_id" },
  );

  if (error) return { ok: false, motivo: "api", detalhe: error.message };
  return { ok: true, linhas: linhas.length };
}
