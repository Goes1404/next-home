import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { resumirLista, type ItemDaMedicao, type ResumoDaLista } from "./metricas";
import { categoriaDaMeta, tarifaEmReais } from "./tarifas";

type Supa = ReturnType<typeof createServiceClient>;

export type ListaMedida = {
  id: string;
  titulo: string;
  criadaEm: string;
  status: string;
  corretor: string | null;
  resumo: ResumoDaLista;
};

/** Origens de consentimento revogado que contam como "pediu para parar". */
const ORIGENS_DE_PARADA = ["botao_parar", "mensagem_parar", "meta_131050", "meta_preferencia_parou"];

/**
 * As listas oficiais do grupo, medidas, e a taxa de resposta das listas do
 * WhatsApp dos corretores no mesmo período, para comparar. Sempre com o
 * grupo como filtro: a chave de serviço enxerga todos.
 */
export async function medirListasOficiais(
  supabase: Supa,
  grupoId: string,
  quantas = 20,
): Promise<{ listas: ListaMedida[]; taxaEvolution: number | null; desde: string | null }> {
  const { data: listas, error } = await supabase
    .from("whatsapp_campanhas")
    .select("id, titulo, created_at, status, corretor:corretores(nome)")
    .eq("grupo_id", grupoId)
    .eq("canal", "oficial")
    .neq("status", "rascunho")
    .order("created_at", { ascending: false })
    .limit(quantas);
  if (error || !listas?.length) return { listas: [], taxaEvolution: null, desde: null };

  const ids = listas.map((l) => l.id);
  const { data: itens } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("campanha_id, status, lead_id, enviado_em, entregue_em, lido_em, erro_motivo, cobrada, cobranca_categoria")
    .eq("grupo_id", grupoId)
    .in("campanha_id", ids)
    .limit(50_000);
  const linhas = itens ?? [];
  const leadIds = [...new Set(linhas.map((i) => i.lead_id).filter((id): id is string => Boolean(id)))];
  const desde = listas[listas.length - 1].created_at;

  const pararam = new Set<string>();
  const comVisita = new Set<string>();
  for (let i = 0; i < leadIds.length; i += 200) {
    const lote = leadIds.slice(i, i + 200);
    const [{ data: paradas }, { data: visitas }] = await Promise.all([
      supabase
        .from("marketing_consentimentos")
        .select("lead_id")
        .eq("grupo_id", grupoId)
        .eq("finalidade", "marketing")
        .eq("canal", "whatsapp")
        .eq("estado", "revogado")
        .in("origem", ORIGENS_DE_PARADA)
        .in("lead_id", lote)
        .gte("ocorrido_em", desde),
      supabase.from("visitas").select("lead_id").eq("grupo_id", grupoId).in("lead_id", lote).gte("created_at", desde),
    ]);
    for (const p of paradas ?? []) pararam.add(p.lead_id);
    for (const v of visitas ?? []) comVisita.add(v.lead_id);
  }

  const tarifa = (c: Parameters<typeof tarifaEmReais>[0]) => tarifaEmReais(c);
  const medidas: ListaMedida[] = listas.map((l) => {
    const daLista: ItemDaMedicao[] = linhas
      .filter((i) => i.campanha_id === l.id)
      .map((i) => ({
        status: i.status,
        leadId: i.lead_id,
        enviadoEm: i.enviado_em,
        entregueEm: i.entregue_em,
        lidoEm: i.lido_em,
        erroMotivo: i.erro_motivo,
        cobrada: i.cobrada,
        categoria: categoriaDaMeta(i.cobranca_categoria),
      }));
    const corretor = (Array.isArray(l.corretor) ? l.corretor[0] : l.corretor) as { nome: string } | null;
    return {
      id: l.id,
      titulo: l.titulo,
      criadaEm: l.created_at,
      status: l.status,
      corretor: corretor?.nome ?? null,
      resumo: resumirLista(daLista, { pararam, comVisita, tarifa }),
    };
  });

  return { listas: medidas, taxaEvolution: await taxaDasListasDoCorretor(supabase, grupoId, desde), desde };
}

/** Taxa de resposta das listas do WhatsApp dos corretores desde a data. */
async function taxaDasListasDoCorretor(supabase: Supa, grupoId: string, desde: string): Promise<number | null> {
  const { data: listas } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("grupo_id", grupoId)
    .neq("canal", "oficial")
    .gte("created_at", desde)
    .limit(500);
  const ids = (listas ?? []).map((l) => l.id);
  if (ids.length === 0) return null;
  const [{ count: saiu }, { count: responderam }] = await Promise.all([
    supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .in("campanha_id", ids)
      .in("status", ["enviado", "respondido"]),
    supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .in("campanha_id", ids)
      .eq("status", "respondido"),
  ]);
  return saiu ? (responderam ?? 0) / saiu : null;
}
