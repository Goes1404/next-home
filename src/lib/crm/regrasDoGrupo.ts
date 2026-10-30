import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { CANAIS, type Canal, type RegraDeDistribuicao } from "./regrasDeDistribuicao";

/**
 * As regras de distribuição do grupo, na ordem em que o banco as avalia
 * (0246). A tabela é só do servidor (chave de serviço), então a leitura
 * filtra o grupo de quem chama — a tela do gestor, depois da guarda dele.
 * Sem a 0246, `null`: a seção das regras some em vez de quebrar a tela.
 */
export async function lerRegrasDoGrupo(grupoId: string): Promise<RegraDeDistribuicao[] | null> {
  const { data, error } = await createServiceClient()
    .from("regras_distribuicao")
    .select("id, ordem, ativa, nome, criterio, regioes, valor_min, valor_max, origens, max_leads_parados, corretores, created_at")
    .eq("grupo_id", grupoId)
    .order("ordem")
    .order("created_at");
  if (error) {
    if (!/regras_distribuicao/.test(error.message)) console.error("[regras] leitura falhou:", error.message);
    return null;
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    ordem: r.ordem,
    ativa: r.ativa,
    nome: r.nome,
    criterio: r.criterio,
    regioes: r.regioes ?? [],
    valorMin: r.valor_min === null ? null : Number(r.valor_min),
    valorMax: r.valor_max === null ? null : Number(r.valor_max),
    origens: (r.origens ?? []).filter((o): o is Canal => (CANAIS as readonly string[]).includes(o)),
    maxLeadsParados: r.max_leads_parados,
    corretores: r.corretores ?? [],
    criadaEm: r.created_at,
  }));
}
